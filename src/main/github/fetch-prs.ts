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

/**
 * Past GitHub's own ten-second limit with room to spare. Without it a request
 * that never answers holds the inbox's one refresh pass open forever; a
 * timeout surfaces as the 500 `isTransientError` retries once.
 */
const REQUEST_TIMEOUT_MS = 30_000

export function createGraphQLClient(token: string): GraphQLClient {
  const authed = graphql.defaults({
    headers: { authorization: `token ${token}` },
  })
  return (query, variables) =>
    authed(query, { ...variables, request: { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) } })
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
  /** Why a successful search may still have omitted older pull requests. */
  incompleteReasons?: SearchStopReason[]
}

export type SearchStopReason = 'page-limit' | 'rate-limit' | 'pagination'

interface SearchPage {
  nodes: Array<{ id?: string } | null>
  pageInfo?: { hasNextPage: boolean; endCursor: string | null }
}

/**
 * The page in a payload, or null when there is no payload at all. The
 * difference decides whether a failed request may be reported as an empty
 * result: "GitHub answered, minus one org" can be, "nothing came back" cannot.
 */
function searchPage(data: unknown): SearchPage | null {
  const search = (data as { search?: Partial<SearchPage> } | null)?.search
  return search?.nodes ? (search as SearchPage) : null
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
 * Pages of 100 read per bucket. GitHub search never returns more than 1,000
 * results, and every id found costs a share of a details request, so an
 * inbox is cut at the 200 most recently updated rather than at the ceiling.
 */
const MAX_SEARCH_PAGES = 2

/**
 * Points left in the hour below which no further page is asked for. The
 * details of what was already found cost far more than a search page does,
 * so the quota is kept for them rather than for finding more to fetch.
 */
const SEARCH_RATE_RESERVE = 500

/**
 * Walks a search's pages until GitHub says there are no more, the page cap is
 * reached, or the quota runs low. `found` keeps earlier pages when an org
 * restriction provides only a partial response.
 */
async function searchPages(
  client: GraphQLClient,
  q: string,
  found: string[],
): Promise<SearchStopReason | null> {
  let after: string | null = null
  const seen = new Set<string>()

  for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
    const cursor = after
    const data = await retryTransient(() => client(SEARCH_QUERY, { q, after: cursor }))
    const result = searchPage(data)
    // An answer without a result set is broken, not empty. Reporting it as
    // an empty bucket is the one mistake this whole function exists to avoid.
    if (result === null) throw new Error('GitHub answered the search with no result set')
    found.push(...idsFromSearch(result.nodes))

    if (!result.pageInfo?.hasNextPage) return null
    const next = result.pageInfo.endCursor
    if (next === null || seen.has(next)) return 'pagination'
    const remaining = (data as RateLimitFields).rateLimit?.remaining
    if (remaining !== undefined && remaining < SEARCH_RATE_RESERVE) {
      return 'rate-limit'
    }
    seen.add(next)
    after = next
  }
  return 'page-limit'
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
): Promise<{ ids: string[]; restrictedOrgs: string[]; incompleteReasons: SearchStopReason[] }> {
  const excluded: string[] = []
  let lastRestriction: unknown = null
  let found: string[] = []

  for (let round = 0; round < MAX_EXCLUSION_ROUNDS; round++) {
    // Each round is a different query, so its cursors start over too.
    found = []
    try {
      const reason = await searchPages(client, buildSearchQuery(bucket, excluded), found)
      return { ids: found, restrictedOrgs: excluded, incompleteReasons: reason ? [reason] : [] }
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
  const salvaged = searchPage(graphqlPartialData(lastRestriction))
  if (salvaged === null) throw lastRestriction
  return {
    ids: [...found, ...idsFromSearch(salvaged.nodes)],
    restrictedOrgs: excluded,
    incompleteReasons: salvaged.pageInfo?.hasNextPage ? ['pagination'] : [],
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
    const nodes = detailNodes(await client(DETAILS_QUERY, { ids }))
    if (nodes === null) throw new Error('GitHub answered the details query with no nodes')
    return nodes
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
    // Through `fetchDetails` rather than `request` directly: the second try is
    // as likely to meet a restriction as the first, and a bare retry would
    // throw it past the salvage above, losing every other batch with it.
    // `maySplit: false` keeps it to the one extra attempt.
    if (ids.length === 1) return fetchDetails(client, ids, false)
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
async function collectIds(client: GraphQLClient): Promise<{
  byId: Map<string, Set<SearchBucket>>
  restrictedOrgs: string[]
  incompleteReasons: SearchStopReason[]
}> {
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

  return {
    byId,
    restrictedOrgs: mergeOrgs(...results.map((result) => result.restrictedOrgs)),
    incompleteReasons: [...new Set(results.flatMap((result) => result.incompleteReasons))],
  }
}

const DETAIL_CONCURRENCY = 6

async function fetchDetailBatches(
  client: GraphQLClient,
  batches: string[][],
): Promise<Awaited<ReturnType<typeof fetchDetails>>[]> {
  const results: Awaited<ReturnType<typeof fetchDetails>>[] = new Array(batches.length)
  let available = DETAIL_CONCURRENCY
  const waiters: Array<() => void> = []
  const limitedClient: GraphQLClient = async (query, variables) => {
    if (available > 0) available -= 1
    else await new Promise<void>((resolve) => waiters.push(resolve))
    try {
      return await client(query, variables)
    } finally {
      const next = waiters.shift()
      if (next) next()
      else available += 1
    }
  }
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(DETAIL_CONCURRENCY, batches.length) }, async () => {
    while (nextIndex < batches.length) {
      const index = nextIndex++
      results[index] = await fetchDetails(limitedClient, batches[index])
    }
  })
  await Promise.all(workers)
  return results
}

export async function fetchPullRequests(
  client: GraphQLClient,
  myLogin: string,
): Promise<FetchedPullRequests> {
  const metered = meterRateLimit(client)
  const {
    byId: bucketsById,
    restrictedOrgs: searchRestrictions,
    incompleteReasons,
  } = await collectIds(metered.client)

  // The worker pool preserves batch order even when later requests finish first.
  const batches = chunk([...bucketsById.keys()], DETAIL_BATCH_SIZE)
  const batchResults = await fetchDetailBatches(metered.client, batches)

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
  return {
    prs,
    restrictedOrgs,
    ...(incompleteReasons.length > 0 ? { incompleteReasons } : {}),
  }
}
