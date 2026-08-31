import { graphql } from '@octokit/graphql'
import { mapPullRequest, type PullRequestNode } from '@core/map-pr'
import { buildSearchQueries, chunk } from '@core/search-query'
import { SEARCH_BUCKETS, type PullRequest, type SearchBucket } from '@shared/types'
import { DETAILS_QUERY, SEARCH_QUERY, VIEWER_QUERY } from './queries'

export type GraphQLClient = (
  query: string,
  variables: Record<string, unknown>,
) => Promise<unknown>

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

/** PR id → the set of search buckets it turned up in. */
async function collectIds(
  client: GraphQLClient,
  repositories: string[],
): Promise<Map<string, Set<SearchBucket>>> {
  const byId = new Map<string, Set<SearchBucket>>()

  for (const bucket of SEARCH_BUCKETS) {
    for (const q of buildSearchQueries(repositories, bucket)) {
      const data = (await client(SEARCH_QUERY, { q })) as {
        search: { nodes: Array<{ id?: string } | null> }
      }
      for (const node of data.search.nodes) {
        if (!node?.id) continue
        const buckets = byId.get(node.id) ?? new Set<SearchBucket>()
        buckets.add(bucket)
        byId.set(node.id, buckets)
      }
    }
  }

  return byId
}

export async function fetchPullRequests(
  client: GraphQLClient,
  repositories: string[],
): Promise<PullRequest[]> {
  if (repositories.length === 0) return []

  const bucketsById = await collectIds(client, repositories)
  const prs: PullRequest[] = []

  for (const ids of chunk([...bucketsById.keys()], DETAIL_BATCH_SIZE)) {
    const data = (await client(DETAILS_QUERY, { ids })) as {
      nodes: Array<PullRequestNode | null>
    }
    for (const node of data.nodes) {
      if (!node) continue
      prs.push(mapPullRequest(node, [...(bucketsById.get(node.id) ?? [])]))
    }
  }

  return prs
}
