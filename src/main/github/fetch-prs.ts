import { mapPullRequest, type PullRequestNode } from '@core/map-pr'
import { buildSearchQuery, chunk } from '@core/search-query'
import { graphql } from '@octokit/graphql'
import { type PullRequest, SEARCH_BUCKETS, type SearchBucket } from '@shared/types'
import {
  graphqlPartialData,
  isOnlyRestriction,
  mergeOrgs,
  restrictedOrganizations,
} from './org-restriction'
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

export interface FetchedPullRequests {
  prs: PullRequest[]
  /** Orgs the OAuth app cannot see; their PRs are omitted rather than failing the fetch. */
  restrictedOrgs: string[]
}

/**
 * The nodes in a payload, or null when there is no payload at all. The
 * difference decides whether a failed request may be reported as an empty
 * result: "GitHub answered, minus one org" can be, "nothing came back" cannot.
 */
function searchNodes(data: unknown): Array<{ id?: string } | null> | null {
  const search = (data as { search?: { nodes?: Array<{ id?: string } | null> } } | null)?.search
  return search?.nodes ?? null
}

function detailNodes(data: unknown): Array<PullRequestNode | null> | null {
  return (data as { nodes?: Array<PullRequestNode | null> } | null)?.nodes ?? null
}

function idsFromSearch(nodes: Array<{ id?: string } | null>): string[] {
  return nodes.flatMap((node) => (node?.id === undefined ? [] : [node.id]))
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
 * Rounds of "ask again without that org" before giving up on a clean answer.
 * Bounded rather than open-ended because the only thing ending the loop is the
 * wording of someone else's error message: GitHub normally names every
 * locked-down org in one response, so a second round is already the unusual
 * case.
 */
const MAX_EXCLUSION_ROUNDS = 5

/**
 * One locked-down org must not blank the whole inbox: GitHub names the org
 * and @octokit/graphql then throws, even when other results are sitting in
 * `error.data`. Retry excluding those orgs until the search goes through.
 */
async function searchBucket(
  client: GraphQLClient,
  bucket: SearchBucket,
): Promise<{ ids: string[]; restrictedOrgs: string[] }> {
  const excluded: string[] = []
  let lastRestriction: unknown = null

  for (let round = 0; round < MAX_EXCLUSION_ROUNDS; round++) {
    try {
      const data = await retryTransient(() =>
        client(SEARCH_QUERY, { q: buildSearchQuery(bucket, excluded) }),
      )
      return { ids: idsFromSearch(searchNodes(data) ?? []), restrictedOrgs: excluded }
    } catch (error) {
      const named = restrictedOrganizations(error)
      if (named.length === 0 || !isOnlyRestriction(error)) throw error

      lastRestriction = error
      const fresh = named.filter((org) => !excluded.includes(org))
      if (fresh.length === 0) break
      excluded.push(...fresh)
    }
  }

  // Either GitHub named the same orgs again or the rounds ran out. Excluding
  // more is not going to produce a clean response, so keep whatever came back
  // alongside the last error rather than dropping the bucket entirely — but
  // only if something did. With no payload there is nothing to stand in for
  // the bucket, and answering "empty" would be a lie the user acts on.
  const salvaged = searchNodes(graphqlPartialData(lastRestriction))
  if (salvaged === null) throw lastRestriction
  return { ids: idsFromSearch(salvaged), restrictedOrgs: excluded }
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
 *
 * A restricted org is different: GitHub already named it, and other nodes
 * may be sitting in `error.data`, so that payload is kept instead of retrying.
 */
async function fetchDetails(
  client: GraphQLClient,
  ids: string[],
  maySplit = true,
): Promise<{ nodes: Array<PullRequestNode | null>; restrictedOrgs: string[] }> {
  const request = async (): Promise<Array<PullRequestNode | null>> => {
    const data = await client(DETAILS_QUERY, { ids })
    return detailNodes(data) ?? []
  }

  try {
    return { nodes: await request(), restrictedOrgs: [] }
  } catch (error) {
    // Same bargain as `searchBucket`: a restriction is survivable only while
    // GitHub still hands back the nodes it could resolve. Without them this
    // batch is a failure, and falls through to be treated as one.
    const orgs = restrictedOrganizations(error)
    if (orgs.length > 0 && isOnlyRestriction(error)) {
      const salvaged = detailNodes(graphqlPartialData(error))
      if (salvaged !== null) return { nodes: salvaged, restrictedOrgs: orgs }
    }
    if (!isTransientError(error) || !maySplit) throw error
    if (ids.length === 1) return { nodes: await request(), restrictedOrgs: [] }
    const half = Math.ceil(ids.length / 2)
    const halves = await Promise.all([
      fetchDetails(client, ids.slice(0, half), false),
      fetchDetails(client, ids.slice(half), false),
    ])
    return {
      nodes: halves.flatMap((part) => part.nodes),
      restrictedOrgs: mergeOrgs(...halves.map((part) => part.restrictedOrgs)),
    }
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
async function collectIds(
  client: GraphQLClient,
): Promise<{ byId: Map<string, Set<SearchBucket>>; restrictedOrgs: string[] }> {
  const results = await Promise.all(
    SEARCH_BUCKETS.map(async (bucket) => {
      const found = await searchBucket(client, bucket)
      return { bucket, ...found }
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

  return { byId, restrictedOrgs: mergeOrgs(...results.map((result) => result.restrictedOrgs)) }
}

export async function fetchPullRequests(
  client: GraphQLClient,
  myLogin: string,
): Promise<FetchedPullRequests> {
  const metered = meterRateLimit(client)
  const { byId: bucketsById, restrictedOrgs: searchRestrictions } = await collectIds(metered.client)

  // The detail batches also run concurrently. `Promise.all` returns results
  // in the same order as the promises it was given — i.e. the order the
  // batches were carved out of `bucketsById`'s (already deterministic) key
  // order — regardless of which batch's request actually resolves first, so
  // rebuilding `prs` by walking `batches` in order keeps the output stable
  // even when a later batch answers before an earlier one.
  const batches = chunk([...bucketsById.keys()], DETAIL_BATCH_SIZE)
  const batchResults = await Promise.all(batches.map((ids) => fetchDetails(metered.client, ids)))

  const prs: PullRequest[] = []
  for (const { nodes } of batchResults) {
    for (const node of nodes) {
      if (!node) continue
      prs.push(mapPullRequest(node, [...(bucketsById.get(node.id) ?? [])], myLogin))
    }
  }

  // Only on the way out: a fetch that threw has no complete number to report.
  metered.report()

  const restrictedOrgs = mergeOrgs(
    searchRestrictions,
    ...batchResults.map((batch) => batch.restrictedOrgs),
  )
  return { prs, restrictedOrgs }
}
