import { mapPullRequest, type PullRequestNode } from '@core/map-pr'
import { buildSearchQuery, chunk } from '@core/search-query'
import { graphql } from '@octokit/graphql'
import { type PullRequest, SEARCH_BUCKETS, type SearchBucket } from '@shared/types'
import { DETAILS_QUERY, SEARCH_QUERY, VIEWER_QUERY } from './queries'

export type GraphQLClient = (query: string, variables: Record<string, unknown>) => Promise<unknown>

const DETAIL_BATCH_SIZE = 25

export function createGraphQLClient(token: string): GraphQLClient {
  const authed = graphql.defaults({
    headers: { authorization: `token ${token}` },
  })
  return (query, variables) => authed(query, variables)
}

export async function fetchViewerLogin(client: GraphQLClient): Promise<string> {
  const data = (await client(VIEWER_QUERY, {})) as { viewer: { login: string } }
  return data.viewer.login
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
      const data = (await client(SEARCH_QUERY, { q })) as {
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
  const bucketsById = await collectIds(client)

  // The detail batches also run concurrently. `Promise.all` returns results
  // in the same order as the promises it was given — i.e. the order the
  // batches were carved out of `bucketsById`'s (already deterministic) key
  // order — regardless of which batch's request actually resolves first, so
  // rebuilding `prs` by walking `batches` in order keeps the output stable
  // even when a later batch answers before an earlier one.
  const batches = chunk([...bucketsById.keys()], DETAIL_BATCH_SIZE)
  const batchResults = await Promise.all(
    batches.map(async (ids) => {
      const data = (await client(DETAILS_QUERY, { ids })) as {
        nodes: Array<PullRequestNode | null>
      }
      return data.nodes
    }),
  )

  const prs: PullRequest[] = []
  for (const nodes of batchResults) {
    for (const node of nodes) {
      if (!node) continue
      prs.push(mapPullRequest(node, [...(bucketsById.get(node.id) ?? [])], myLogin))
    }
  }

  return prs
}
