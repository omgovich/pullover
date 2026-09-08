import { mapPullRequest, type PullRequestNode } from '@core/map-pr'
import { buildSearchQuery, chunk } from '@core/search-query'
import { graphql } from '@octokit/graphql'
import { type PullRequest, SEARCH_BUCKETS, type SearchBucket } from '@shared/types'
import { DETAILS_QUERY, SEARCH_QUERY, VIEWER_QUERY } from './queries'
import { isTransientError } from './transient-error'

export type GraphQLClient = (query: string, variables: Record<string, unknown>) => Promise<unknown>

/**
 * Ids per details request. GitHub terminates any GraphQL request it spends
 * more than 10 seconds on, and `DETAILS_QUERY` asks for up to 2,500 thread
 * comments per pull request, so 25 at a time timed out on a real inbox and
 * came back as a 502. The rate limit counts nodes rather than requests, so
 * splitting the same work into more batches costs no meaningful extra quota.
 */
const DETAIL_BATCH_SIZE = 10

export function createGraphQLClient(token: string): GraphQLClient {
  const authed = graphql.defaults({
    headers: { authorization: `token ${token}` },
  })
  return (query, variables) => authed(query, variables)
}

/** `rateLimit`, as GraphQL returns it beside the data a query asked for. */
interface RateLimitFields {
  rateLimit?: { cost: number; remaining: number; resetAt: string }
}

/**
 * Wraps a client so the `rateLimit` of every response is added up, and
 * reports the total for one fetch. Worth measuring rather than deriving:
 * GitHub's documented formula assumes every connection returns a full page,
 * which for `DETAILS_QUERY` overstates the cost by orders of magnitude on
 * pull requests that don't have fifty threads of fifty comments each.
 */
function meterRateLimit(client: GraphQLClient): { client: GraphQLClient; report: () => void } {
  let cost = 0
  let lowest: { remaining: number; resetAt: string } | null = null

  return {
    client: async (query, variables) => {
      const data = await client(query, variables)
      const limit = (data as RateLimitFields).rateLimit
      if (limit !== undefined) {
        cost += limit.cost
        // The lowest `remaining` seen rather than the last to arrive: these
        // requests run concurrently, so the response that comes back last
        // isn't necessarily the one GitHub charged last.
        if (lowest === null || limit.remaining < lowest.remaining) {
          lowest = { remaining: limit.remaining, resetAt: limit.resetAt }
        }
      }
      return data
    },
    report: () => {
      if (lowest === null) return
      console.info(
        `[github] refresh cost ${cost} points, ${lowest.remaining} left until ${lowest.resetAt}`,
      )
    },
  }
}

export async function fetchViewerLogin(client: GraphQLClient): Promise<string> {
  const data = (await client(VIEWER_QUERY, {})) as { viewer: { login: string } }
  return data.viewer.login
}

/**
 * One more attempt at a request that failed on GitHub's side. No backoff:
 * what `isTransientError` admits is GitHub failing of its own accord, not it
 * asking us to slow down — throttling arrives as a 403 or a 429, which
 * `Inbox` holds back on its own schedule.
 *
 * Asked again unchanged, unlike a detail batch (see `fetchDetails`), because
 * a search has nothing to split and answers in about two seconds of the ten
 * GitHub allows — so its failure is far likelier a blip than a query that ran
 * long, and being wrong about that costs one point and one second.
 */
async function retryTransient<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt()
  } catch (error) {
    if (!isTransientError(error)) throw error
    return attempt()
  }
}

/**
 * Asks for these pull requests, with one second chance: two half-size
 * requests where there is something to split, a plain repeat where there
 * isn't.
 *
 * GitHub terminates a query it spends more than ten seconds on, and a batch
 * that crossed that line will cross it again, so repeating it would only
 * fail more slowly. Halves are comfortably under the limit — measured at
 * 2.8s for five ids against 7.4s for twenty-five — which is what turns that
 * failure into two requests that succeed. A lone id has no such story: it
 * cannot have been the size that broke, so its failure is a blip and a
 * repeat is the right answer, as it is for a search.
 *
 * `maySplit` is what stops there (three attempts per batch at worst).
 * Dividing all the way down would answer an outage — where every request
 * fails, not just the oversized one — with nineteen attempts per batch and a
 * couple of hundred requests in flight at the leaves. What one more ask
 * cannot rescue, the next poll can.
 */
async function fetchDetails(
  client: GraphQLClient,
  ids: string[],
  maySplit = true,
): Promise<Array<PullRequestNode | null>> {
  const request = async (): Promise<Array<PullRequestNode | null>> => {
    const data = (await client(DETAILS_QUERY, { ids })) as {
      nodes: Array<PullRequestNode | null>
    }
    return data.nodes
  }

  try {
    return await request()
  } catch (error) {
    if (!isTransientError(error) || !maySplit) throw error
    if (ids.length === 1) return request()
    const half = Math.ceil(ids.length / 2)
    const halves = await Promise.all([
      fetchDetails(client, ids.slice(0, half), false),
      fetchDetails(client, ids.slice(half), false),
    ])
    return halves.flat()
  }
}

/**
 * PR id → the set of search buckets it turned up in.
 *
 * The four bucket searches run concurrently (`Promise.all`), each resolving
 * its own list of ids independently — nothing touches a shared `Map` until
 * every search has settled, so there is no concurrent-writer race. The merge
 * below then runs synchronously over `results` in `SEARCH_BUCKETS` order
 * (the order `Promise.all` preserves regardless of which request actually
 * finished first), so the resulting Map's insertion order is deterministic
 * and independent of response arrival order.
 */
async function collectIds(client: GraphQLClient): Promise<Map<string, Set<SearchBucket>>> {
  const results = await Promise.all(
    SEARCH_BUCKETS.map(async (bucket) => {
      const q = buildSearchQuery(bucket)
      const data = (await retryTransient(() => client(SEARCH_QUERY, { q }))) as {
        search: { nodes: Array<{ id?: string } | null> }
      }
      const ids = data.search.nodes
        .map((node) => node?.id)
        .filter((id): id is string => id !== undefined)
      return { bucket, ids }
    }),
  )

  const byId = new Map<string, Set<SearchBucket>>()
  for (const { bucket, ids } of results) {
    for (const id of ids) {
      const buckets = byId.get(id) ?? new Set<SearchBucket>()
      buckets.add(bucket)
      byId.set(id, buckets)
    }
  }

  return byId
}

export async function fetchPullRequests(
  client: GraphQLClient,
  myLogin: string,
): Promise<PullRequest[]> {
  const metered = meterRateLimit(client)
  const bucketsById = await collectIds(metered.client)

  // The detail batches also run concurrently. `Promise.all` returns results
  // in the same order as the promises it was given — i.e. the order the
  // batches were carved out of `bucketsById`'s (already deterministic) key
  // order — regardless of which batch's request actually resolves first, so
  // rebuilding `prs` by walking `batches` in order keeps the output stable
  // even when a later batch answers before an earlier one.
  const batches = chunk([...bucketsById.keys()], DETAIL_BATCH_SIZE)
  const batchResults = await Promise.all(batches.map((ids) => fetchDetails(metered.client, ids)))

  const prs: PullRequest[] = []
  for (const nodes of batchResults) {
    for (const node of nodes) {
      if (!node) continue
      prs.push(mapPullRequest(node, [...(bucketsById.get(node.id) ?? [])], myLogin))
    }
  }

  // Only on the way out: a fetch that threw has no complete number to report.
  metered.report()

  return prs
}
