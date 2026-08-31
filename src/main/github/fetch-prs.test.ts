import { describe, expect, it, vi } from 'vitest'
import { fetchPullRequests, fetchViewerLogin } from './fetch-prs'
import { DETAILS_QUERY, SEARCH_QUERY, VIEWER_QUERY } from './queries'

function detailNode(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    number: 7,
    title: 'Add feature',
    url: `https://github.com/acme/web/pull/7`,
    isDraft: false,
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-02T10:00:00Z',
    additions: 1,
    deletions: 0,
    reviewDecision: 'REVIEW_REQUIRED',
    author: { login: 'alice', avatarUrl: 'https://avatars.example/alice.png' },
    repository: { nameWithOwner: 'acme/web' },
    reviews: { nodes: [] },
    reviewThreads: { nodes: [] },
    commits: { nodes: [] },
    ...overrides,
  }
}

/** Answers search queries from `idsByQualifier` and details from `nodes`. */
function fakeClient(
  idsByQualifier: Record<string, string[]>,
  nodes: Array<ReturnType<typeof detailNode>>,
) {
  return vi.fn(async (query: string, variables: Record<string, unknown>) => {
    if (query === VIEWER_QUERY) return { viewer: { login: 'vlad' } }
    if (query === SEARCH_QUERY) {
      const q = variables.q as string
      const qualifier = Object.keys(idsByQualifier).find((key) => q.includes(key))
      const ids = qualifier ? idsByQualifier[qualifier]! : []
      return { search: { nodes: ids.map((id) => ({ id })) } }
    }
    if (query === DETAILS_QUERY) {
      const ids = variables.ids as string[]
      return { nodes: nodes.filter((node) => ids.includes(node.id)) }
    }
    throw new Error(`unexpected query: ${query}`)
  })
}

describe('fetchViewerLogin', () => {
  it('returns the authenticated login', async () => {
    const client = fakeClient({}, [])
    await expect(fetchViewerLogin(client)).resolves.toBe('vlad')
  })
})

describe('fetchPullRequests', () => {
  it('returns nothing when no repositories are configured', async () => {
    const client = fakeClient({}, [])
    await expect(fetchPullRequests(client, [])).resolves.toEqual([])
    expect(client).not.toHaveBeenCalled()
  })

  it('records which buckets a PR came from', async () => {
    const client = fakeClient(
      { 'review-requested:@me': ['PR_1'], 'mentions:@me': ['PR_1'] },
      [detailNode('PR_1')],
    )
    const prs = await fetchPullRequests(client, ['acme/web'])
    expect(prs).toHaveLength(1)
    expect(prs[0]!.buckets.sort()).toEqual(['mentions', 'review-requested'])
  })

  it('fetches details once for a PR found in several buckets', async () => {
    const client = fakeClient(
      {
        'review-requested:@me': ['PR_1'],
        'involves:@me': ['PR_1'],
        'mentions:@me': ['PR_1'],
      },
      [detailNode('PR_1')],
    )
    await fetchPullRequests(client, ['acme/web'])
    const detailCalls = client.mock.calls.filter(([q]) => q === DETAILS_QUERY)
    expect(detailCalls).toHaveLength(1)
  })

  it('maps the detail node into a domain pull request', async () => {
    const client = fakeClient({ 'author:@me': ['PR_1'] }, [detailNode('PR_1')])
    const prs = await fetchPullRequests(client, ['acme/web'])
    expect(prs[0]!.repository).toBe('acme/web')
    expect(prs[0]!.authorLogin).toBe('alice')
  })

  it('skips ids the details query could not resolve', async () => {
    const client = fakeClient({ 'author:@me': ['PR_1', 'PR_missing'] }, [
      detailNode('PR_1'),
    ])
    const prs = await fetchPullRequests(client, ['acme/web'])
    expect(prs.map((pr) => pr.id)).toEqual(['PR_1'])
  })
})
