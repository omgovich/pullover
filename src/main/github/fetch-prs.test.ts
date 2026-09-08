import { describe, expect, it, vi } from 'vitest'
import { fetchPullRequests, fetchViewerLogin } from './fetch-prs'
import { DETAILS_QUERY, SEARCH_QUERY, VIEWER_QUERY } from './queries'

const DETAIL_BATCH_SIZE = 10

/** A promise plus its resolver, pulled out so a test can settle it on its own schedule. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

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
    comments: { nodes: [] },
    bodyText: '',
    commits: { nodes: [] },
    timelineItems: { nodes: [] },
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

/** What `@octokit/request` throws for a non-2xx response. */
function httpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status })
}

describe('fetchViewerLogin', () => {
  it('returns the authenticated login', async () => {
    const client = fakeClient({}, [])
    await expect(fetchViewerLogin(client)).resolves.toBe('vlad')
  })
})

describe('fetchPullRequests', () => {
  it('issues one unscoped search query per bucket and returns pull requests', async () => {
    const client = fakeClient({ 'review-requested:@me': ['PR_1'] }, [detailNode('PR_1')])
    const prs = await fetchPullRequests(client, 'vlad')
    expect(prs.map((pr) => pr.id)).toEqual(['PR_1'])
    const searchCalls = client.mock.calls.filter(([q]) => q === SEARCH_QUERY)
    expect(searchCalls).toHaveLength(4)
    for (const [, variables] of searchCalls) {
      expect(variables.q as string).not.toContain('repo:')
    }
  })

  it('records which buckets a PR came from', async () => {
    const client = fakeClient({ 'review-requested:@me': ['PR_1'], 'mentions:@me': ['PR_1'] }, [
      detailNode('PR_1'),
    ])
    const prs = await fetchPullRequests(client, 'vlad')
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
    await fetchPullRequests(client, 'vlad')
    const detailCalls = client.mock.calls.filter(([q]) => q === DETAILS_QUERY)
    expect(detailCalls).toHaveLength(1)
    expect(detailCalls[0]![1]!.ids).toEqual(['PR_1'])
  })

  it('splits detail requests into batches of DETAIL_BATCH_SIZE ids', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `PR_${i}`)
    const client = fakeClient(
      { 'author:@me': ids },
      ids.map((id) => detailNode(id)),
    )

    const prs = await fetchPullRequests(client, 'vlad')

    const detailCalls = client.mock.calls.filter(([q]) => q === DETAILS_QUERY)
    expect(detailCalls).toHaveLength(6)

    const idsPerCall = detailCalls.map(([, variables]) => (variables as { ids: string[] }).ids)
    for (const batch of idsPerCall) {
      expect(batch.length).toBeLessThanOrEqual(DETAIL_BATCH_SIZE)
    }
    expect(idsPerCall.flat().sort()).toEqual([...ids].sort())
    expect(prs.map((pr) => pr.id).sort()).toEqual([...ids].sort())
  })

  it('asks a second time for a search that GitHub failed to answer', async () => {
    const inner = fakeClient({ 'author:@me': ['PR_1'] }, [detailNode('PR_1')])
    let failuresLeft = 1
    const client = vi.fn(async (query: string, variables: Record<string, unknown>) => {
      if (query === SEARCH_QUERY && failuresLeft > 0) {
        failuresLeft -= 1
        throw httpError(502)
      }
      return inner(query, variables)
    })

    const prs = await fetchPullRequests(client, 'vlad')

    expect(prs.map((pr) => pr.id)).toEqual(['PR_1'])
    // The four buckets plus the one that had to be asked again.
    expect(client.mock.calls.filter(([q]) => q === SEARCH_QUERY)).toHaveLength(5)
  })

  it('splits a failed detail batch in half rather than asking for the same ids again', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `PR_${i}`)
    const inner = fakeClient(
      { 'author:@me': ids },
      ids.map((id) => detailNode(id)),
    )
    const client = vi.fn(async (query: string, variables: Record<string, unknown>) => {
      if (query === DETAILS_QUERY && (variables.ids as string[]).length === 10) {
        throw httpError(502)
      }
      return inner(query, variables)
    })

    const prs = await fetchPullRequests(client, 'vlad')

    expect(prs.map((pr) => pr.id)).toEqual(ids)
    const asked = client.mock.calls
      .filter(([q]) => q === DETAILS_QUERY)
      .map(([, variables]) => (variables as { ids: string[] }).ids)
    expect(asked).toEqual([ids, ids.slice(0, 5), ids.slice(5)])
  })

  it('gives up after one split rather than dividing all the way down', async () => {
    const ids = ['PR_0', 'PR_1', 'PR_2']
    const client = vi.fn(async (query: string, variables: Record<string, unknown>) => {
      if (query === SEARCH_QUERY) {
        const q = variables.q as string
        return { search: { nodes: q.includes('author:@me') ? ids.map((id) => ({ id })) : [] } }
      }
      throw httpError(502)
    })

    await expect(fetchPullRequests(client, 'vlad')).rejects.toThrow('HTTP 502')

    // The batch, then its two halves, and that is the end of it: an outage
    // fails every request, and dividing further only multiplies them.
    const asked = client.mock.calls
      .filter(([q]) => q === DETAILS_QUERY)
      .map(([, variables]) => (variables as { ids: string[] }).ids)
    expect(asked).toEqual([ids, ['PR_0', 'PR_1'], ['PR_2']])
  })

  it('never asks again for a rate limit or a dead token, whatever the request', async () => {
    for (const status of [401, 403, 429]) {
      const client = vi.fn(async () => {
        throw httpError(status)
      })

      await expect(fetchPullRequests(client, 'vlad')).rejects.toThrow(`HTTP ${status}`)

      // One attempt per bucket, and not one more: `Inbox` decides what a
      // rate limit means, and it can only do that if the error reaches it.
      expect(client).toHaveBeenCalledTimes(4)
    }
  })

  it('adds up the rate-limit cost of every request and reports it once', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const ids = ['PR_1', 'PR_2']
    const inner = fakeClient(
      { 'author:@me': ids },
      ids.map((id) => detailNode(id)),
    )
    // Every response carries its own cost: four bucket searches and one
    // detail batch, so five requests at 3 points each.
    const client = vi.fn(async (query: string, variables: Record<string, unknown>) => ({
      ...((await inner(query, variables)) as object),
      rateLimit: { cost: 3, remaining: 4985, resetAt: '2026-09-08T13:00:00Z' },
    }))

    await fetchPullRequests(client, 'vlad')

    expect(info).toHaveBeenCalledTimes(1)
    expect(info.mock.calls[0]![0]).toBe(
      '[github] refresh cost 15 points, 4985 left until 2026-09-08T13:00:00Z',
    )
    info.mockRestore()
  })

  it('reports the lowest remaining it saw, not the one that came back last', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const inner = fakeClient({ 'author:@me': ['PR_1'] }, [detailNode('PR_1')])
    // The detail batch answers after the searches and reports MORE left than
    // they did, which is what a concurrent charge looks like from here.
    const client = vi.fn(async (query: string, variables: Record<string, unknown>) => {
      const remaining = query === DETAILS_QUERY ? 4995 : 4990
      return {
        ...((await inner(query, variables)) as object),
        rateLimit: { cost: 1, remaining, resetAt: '2026-09-08T13:00:00Z' },
      }
    })

    await fetchPullRequests(client, 'vlad')

    expect(info.mock.calls[0]![0]).toBe(
      '[github] refresh cost 5 points, 4990 left until 2026-09-08T13:00:00Z',
    )
    info.mockRestore()
  })

  it('says nothing when the responses carry no rate limit at all', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const client = fakeClient({ 'author:@me': ['PR_1'] }, [detailNode('PR_1')])

    await fetchPullRequests(client, 'vlad')

    expect(info).not.toHaveBeenCalled()
    info.mockRestore()
  })

  it('maps the detail node into a domain pull request', async () => {
    const client = fakeClient({ 'author:@me': ['PR_1'] }, [detailNode('PR_1')])
    const prs = await fetchPullRequests(client, 'vlad')
    expect(prs[0]!.repository).toBe('acme/web')
    expect(prs[0]!.authorLogin).toBe('alice')
  })

  it('skips ids the details query could not resolve', async () => {
    const client = fakeClient({ 'author:@me': ['PR_1', 'PR_missing'] }, [detailNode('PR_1')])
    const prs = await fetchPullRequests(client, 'vlad')
    expect(prs.map((pr) => pr.id)).toEqual(['PR_1'])
  })

  it('skips a null node GitHub returns in place of an unresolved id', async () => {
    // Real GitHub returns `null` in the array slot for an id it cannot
    // resolve, rather than omitting the entry outright.
    const client = vi.fn(async (query: string, variables: Record<string, unknown>) => {
      if (query === VIEWER_QUERY) return { viewer: { login: 'vlad' } }
      if (query === SEARCH_QUERY) {
        return { search: { nodes: [{ id: 'PR_1' }, { id: 'PR_missing' }] } }
      }
      if (query === DETAILS_QUERY) {
        expect(variables.ids).toEqual(['PR_1', 'PR_missing'])
        return { nodes: [detailNode('PR_1'), null] }
      }
      throw new Error(`unexpected query: ${query}`)
    })

    const prs = await fetchPullRequests(client, 'vlad')

    expect(prs.map((pr) => pr.id)).toEqual(['PR_1'])
  })

  it('passes myLogin through to mapPullRequest so mentions of that login are detected', async () => {
    const client = fakeClient({ 'mentions:@me': ['PR_1'] }, [
      detailNode('PR_1', { bodyText: 'Hey @vlad, take a look' }),
    ])
    const prs = await fetchPullRequests(client, 'vlad')
    expect(prs[0]!.mentionsAt).not.toHaveLength(0)
  })

  it('issues all four bucket searches concurrently rather than waiting for each to resolve', async () => {
    // Every SEARCH_QUERY call hangs on a deferred the test controls. A
    // sequential `collectIds` (a for-await loop over the buckets) would only
    // ever have the FIRST bucket's request in flight at this point, because
    // it awaits each call before starting the next — so this assertion fails
    // against the sequential implementation and only passes once every
    // bucket's request has actually gone out before any of them settles.
    const pending: Array<{ promise: Promise<unknown>; resolve: (value: unknown) => void }> = []
    const client = vi.fn(async (query: string) => {
      if (query === VIEWER_QUERY) return { viewer: { login: 'vlad' } }
      if (query === SEARCH_QUERY) {
        const d = deferred<unknown>()
        pending.push(d)
        return d.promise
      }
      throw new Error(`unexpected query: ${query}`)
    })

    const result = fetchPullRequests(client, 'vlad')

    // Give the microtask queue a bounded number of turns to let every
    // concurrent call start — a sequential implementation would still be
    // stuck on the first one no matter how many turns this takes.
    for (let i = 0; i < 20 && pending.length < 4; i++) {
      await Promise.resolve()
    }

    const searchCalls = client.mock.calls.filter(([q]) => q === SEARCH_QUERY)
    expect(searchCalls).toHaveLength(4)
    expect(pending).toHaveLength(4)

    for (const d of pending) d.resolve({ search: { nodes: [] } })
    await expect(result).resolves.toEqual([])
  })

  it('issues detail batches concurrently rather than waiting for each to resolve', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `PR_${i}`)
    const pending: Array<{ promise: Promise<unknown>; resolve: (value: unknown) => void }> = []
    const client = vi.fn(async (query: string, variables: Record<string, unknown>) => {
      if (query === VIEWER_QUERY) return { viewer: { login: 'vlad' } }
      if (query === SEARCH_QUERY) return { search: { nodes: ids.map((id) => ({ id })) } }
      if (query === DETAILS_QUERY) {
        void variables
        const d = deferred<unknown>()
        pending.push(d)
        return d.promise
      }
      throw new Error(`unexpected query: ${query}`)
    })

    const result = fetchPullRequests(client, 'vlad')

    // Flush the microtask queue until the detail batches start (their exact
    // depth depends on how collectIds is implemented) — bounded so a
    // regression that never issues them fails instead of hanging.
    for (let i = 0; i < 20 && pending.length === 0; i++) {
      await Promise.resolve()
    }

    // 60 ids over a batch size of 10 is 6 batches — a sequential
    // implementation would only have the first one in flight here.
    const detailCalls = client.mock.calls.filter(([q]) => q === DETAILS_QUERY)
    expect(detailCalls).toHaveLength(6)
    expect(pending).toHaveLength(6)

    for (const d of pending) d.resolve({ nodes: [] })
    await expect(result).resolves.toEqual([])
  })

  it('rebuilds the result in the order ids were collected, not the order detail batches resolve', async () => {
    // Two batches of ids collected in a fixed order; resolve the SECOND
    // batch first to prove the output order follows collection order, not
    // arrival order.
    const batchA = Array.from({ length: DETAIL_BATCH_SIZE }, (_, i) => `A_${i}`)
    const batchB = Array.from({ length: 5 }, (_, i) => `B_${i}`)
    const allIds = [...batchA, ...batchB]
    const pending: Array<{
      ids: string[]
      resolve: (value: unknown) => void
    }> = []
    const client = vi.fn(async (query: string, variables: Record<string, unknown>) => {
      if (query === VIEWER_QUERY) return { viewer: { login: 'vlad' } }
      if (query === SEARCH_QUERY) return { search: { nodes: allIds.map((id) => ({ id })) } }
      if (query === DETAILS_QUERY) {
        const ids = variables.ids as string[]
        const d = deferred<unknown>()
        pending.push({ ids, resolve: d.resolve })
        return d.promise
      }
      throw new Error(`unexpected query: ${query}`)
    })

    const result = fetchPullRequests(client, 'vlad')
    for (let i = 0; i < 20 && pending.length < 2; i++) {
      await Promise.resolve()
    }

    expect(pending).toHaveLength(2)
    const first = pending.find((p) => p.ids[0] === 'A_0')!
    const second = pending.find((p) => p.ids[0] === 'B_0')!

    // Resolve the second (B) batch before the first (A) batch.
    second.resolve({ nodes: batchB.map((id) => detailNode(id)) })
    await Promise.resolve()
    first.resolve({ nodes: batchA.map((id) => detailNode(id)) })

    const prs = await result
    expect(prs.map((pr) => pr.id)).toEqual(allIds)
  })
})
