import { GraphqlResponseError } from '@octokit/graphql'
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
    const { prs } = await fetchPullRequests(client, 'vlad')
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
    const { prs } = await fetchPullRequests(client, 'vlad')
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

    const { prs } = await fetchPullRequests(client, 'vlad')

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

    const { prs } = await fetchPullRequests(client, 'vlad')

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

    const { prs } = await fetchPullRequests(client, 'vlad')

    expect(prs.map((pr) => pr.id)).toEqual(ids)
    const asked = client.mock.calls
      .filter(([q]) => q === DETAILS_QUERY)
      .map(([, variables]) => (variables as { ids: string[] }).ids)
    expect(asked).toEqual([ids, ids.slice(0, 5), ids.slice(5)])
  })

  it('asks a second time for a lone id, which cannot have been the size that broke', async () => {
    const inner = fakeClient({ 'author:@me': ['PR_1'] }, [detailNode('PR_1')])
    let failuresLeft = 1
    const client = vi.fn(async (query: string, variables: Record<string, unknown>) => {
      if (query === DETAILS_QUERY && failuresLeft > 0) {
        failuresLeft -= 1
        throw httpError(502)
      }
      return inner(query, variables)
    })

    const { prs } = await fetchPullRequests(client, 'vlad')

    expect(prs.map((pr) => pr.id)).toEqual(['PR_1'])
    expect(client.mock.calls.filter(([q]) => q === DETAILS_QUERY)).toHaveLength(2)
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
    const { prs } = await fetchPullRequests(client, 'vlad')
    expect(prs[0]!.repository).toBe('acme/web')
    expect(prs[0]!.authorLogin).toBe('alice')
  })

  it('skips ids the details query could not resolve', async () => {
    const client = fakeClient({ 'author:@me': ['PR_1', 'PR_missing'] }, [detailNode('PR_1')])
    const { prs } = await fetchPullRequests(client, 'vlad')
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

    const { prs } = await fetchPullRequests(client, 'vlad')

    expect(prs.map((pr) => pr.id)).toEqual(['PR_1'])
  })

  it('passes myLogin through to mapPullRequest so mentions of that login are detected', async () => {
    const client = fakeClient({ 'mentions:@me': ['PR_1'] }, [
      detailNode('PR_1', { bodyText: 'Hey @vlad, take a look' }),
    ])
    const { prs } = await fetchPullRequests(client, 'vlad')
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
    await expect(result).resolves.toEqual({ prs: [], restrictedOrgs: [] })
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
    await expect(result).resolves.toEqual({ prs: [], restrictedOrgs: [] })
  })

  it('limits concurrent detail requests while preserving every result', async () => {
    const ids = Array.from({ length: 80 }, (_, i) => `PR_${i}`)
    const pending: Array<{ ids: string[]; resolve: (value: unknown) => void }> = []
    let active = 0
    let peak = 0
    const client = vi.fn(async (query: string, variables: Record<string, unknown>) => {
      if (query === SEARCH_QUERY) {
        const q = variables.q as string
        return { search: { nodes: q.includes('author:@me') ? ids.map((id) => ({ id })) : [] } }
      }
      if (query !== DETAILS_QUERY) throw new Error(`unexpected query: ${query}`)
      active += 1
      peak = Math.max(peak, active)
      const batch = variables.ids as string[]
      const response = deferred<unknown>()
      pending.push({ ids: batch, resolve: response.resolve })
      try {
        return await response.promise
      } finally {
        active -= 1
      }
    })

    const result = fetchPullRequests(client, 'vlad')
    for (let released = 0; released < 8; released++) {
      await vi.waitFor(() => expect(pending.length).toBeGreaterThan(released))
      expect(active).toBeLessThanOrEqual(6)
      const request = pending[released]!
      request.resolve({ nodes: request.ids.map((id) => detailNode(id)) })
    }

    expect((await result).prs.map((pr) => pr.id)).toEqual(ids)
    expect(peak).toBe(6)
  })

  it('keeps the same request limit when failed batches split for a retry', async () => {
    const ids = Array.from({ length: 70 }, (_, i) => `PR_${i}`)
    const pending: Array<{ ids: string[]; resolve: (value: unknown) => void }> = []
    let active = 0
    let peak = 0
    const client = vi.fn(async (query: string, variables: Record<string, unknown>) => {
      if (query === SEARCH_QUERY) {
        const q = variables.q as string
        return { search: { nodes: q.includes('author:@me') ? ids.map((id) => ({ id })) : [] } }
      }
      if (query !== DETAILS_QUERY) throw new Error(`unexpected query: ${query}`)
      active += 1
      peak = Math.max(peak, active)
      const batch = variables.ids as string[]
      try {
        if (batch.length === 10) throw httpError(502)
        const response = deferred<unknown>()
        pending.push({ ids: batch, resolve: response.resolve })
        return await response.promise
      } finally {
        active -= 1
      }
    })

    const result = fetchPullRequests(client, 'vlad')
    for (let released = 0; released < 14; released++) {
      await vi.waitFor(() => expect(pending.length).toBeGreaterThan(released))
      expect(active).toBeLessThanOrEqual(6)
      const request = pending[released]!
      request.resolve({ nodes: request.ids.map((id) => detailNode(id)) })
    }

    expect((await result).prs.map((pr) => pr.id)).toEqual(ids)
    expect(peak).toBe(6)
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

    const { prs } = await result
    expect(prs.map((pr) => pr.id)).toEqual(allIds)
  })

  it('retries the search excluding an org that blocks the OAuth app', async () => {
    const restriction = new GraphqlResponseError(
      { method: 'POST', url: 'https://api.github.com/graphql' },
      {},
      {
        data: null,
        errors: [
          {
            message:
              'Although you appear to have the correct authorization credentials, the `status-im` organization has enabled OAuth App access restrictions, meaning that data access to third-parties is limited.',
          },
        ],
      } as never,
    )
    const client = vi.fn(async (query: string, variables: Record<string, unknown>) => {
      if (query === SEARCH_QUERY) {
        const q = variables.q as string
        if (!q.includes('-org:status-im')) throw restriction
        return { search: { nodes: [{ id: 'PR_1' }] } }
      }
      if (query === DETAILS_QUERY) return { nodes: [detailNode('PR_1')] }
      throw new Error(`unexpected query: ${query}`)
    })

    const result = await fetchPullRequests(client, 'vlad')
    expect(result.prs.map((pr) => pr.id)).toEqual(['PR_1'])
    expect(result.restrictedOrgs).toEqual(['status-im'])
  })

  it('fails rather than reporting an empty bucket when the restriction carries no results', async () => {
    // A plain 403 names the org but brings no payload, so there is nothing to
    // stand in for the bucket. Answering "empty" would read as "no PRs".
    const forbidden = Object.assign(
      new Error(
        'the `status-im` organization has enabled OAuth App access restrictions, meaning that data access to third-parties is limited.',
      ),
      { status: 403 },
    )
    const client = vi.fn(async (query: string) => {
      if (query === SEARCH_QUERY) throw forbidden
      throw new Error(`unexpected query: ${query}`)
    })

    await expect(fetchPullRequests(client, 'vlad')).rejects.toThrow(/status-im/)
  })

  it('fails when something else went wrong in the same response as the restriction', async () => {
    const mixed = new GraphqlResponseError(
      { method: 'POST', url: 'https://api.github.com/graphql' },
      {},
      {
        data: { search: { nodes: [{ id: 'PR_1' }] } },
        errors: [
          { message: 'the `status-im` organization has enabled OAuth App access restrictions' },
          { message: 'Something went wrong while executing your query.' },
        ],
      } as never,
    )
    const client = vi.fn(async (query: string) => {
      if (query === SEARCH_QUERY) throw mixed
      throw new Error(`unexpected query: ${query}`)
    })

    await expect(fetchPullRequests(client, 'vlad')).rejects.toThrow(/Something went wrong/)
  })

  it('stops asking once GitHub names the same org twice, keeping what it returned', async () => {
    // The likelier of the two give-up paths: excluding the org changes nothing,
    // so there is no point in a third round.
    const stuck = new GraphqlResponseError(
      { method: 'POST', url: 'https://api.github.com/graphql' },
      {},
      {
        data: { search: { nodes: [{ id: 'PR_1' }] } },
        errors: [
          { message: 'the `status-im` organization has enabled OAuth App access restrictions' },
        ],
      } as never,
    )
    let searches = 0
    const client = vi.fn(async (query: string) => {
      if (query === SEARCH_QUERY) {
        searches += 1
        throw stuck
      }
      if (query === DETAILS_QUERY) return { nodes: [detailNode('PR_1')] }
      throw new Error(`unexpected query: ${query}`)
    })

    const result = await fetchPullRequests(client, 'vlad')

    expect(result.prs.map((pr) => pr.id)).toEqual(['PR_1'])
    expect(result.restrictedOrgs).toEqual(['status-im'])
    // Four buckets, two attempts each: the first, then one with the exclusion.
    expect(searches).toBe(8)
  })

  it('keeps the results it has when the rounds of exclusion run out', async () => {
    // A fresh org named on every single response, so no number of retries
    // reaches a clean search. What GitHub did return must still survive.
    let round = 0
    const client = vi.fn(async (query: string) => {
      if (query === SEARCH_QUERY) {
        round += 1
        throw new GraphqlResponseError(
          { method: 'POST', url: 'https://api.github.com/graphql' },
          {},
          {
            data: { search: { nodes: [{ id: 'PR_1' }] } },
            errors: [
              {
                message: `the \`org-${round}\` organization has enabled OAuth App access restrictions`,
              },
            ],
          } as never,
        )
      }
      if (query === DETAILS_QUERY) return { nodes: [detailNode('PR_1')] }
      throw new Error(`unexpected query: ${query}`)
    })

    const result = await fetchPullRequests(client, 'vlad')

    expect(result.prs.map((pr) => pr.id)).toEqual(['PR_1'])
    expect(result.restrictedOrgs.length).toBeGreaterThan(0)
  })

  it('warns when a salvaged restricted search has more pages', async () => {
    let round = 0
    const client = vi.fn(async (query: string) => {
      if (query === SEARCH_QUERY) {
        round += 1
        throw new GraphqlResponseError(
          { method: 'POST', url: 'https://api.github.com/graphql' },
          {},
          {
            data: {
              search: {
                nodes: [{ id: 'PR_1' }],
                pageInfo: { hasNextPage: true, endCursor: 'next-page' },
              },
            },
            errors: [
              {
                message: `the \`org-${round}\` organization has enabled OAuth App access restrictions`,
              },
            ],
          } as never,
        )
      }
      if (query === DETAILS_QUERY) return { nodes: [detailNode('PR_1')] }
      throw new Error(`unexpected query: ${query}`)
    })

    const result = await fetchPullRequests(client, 'vlad')

    expect(result.prs.map((pr) => pr.id)).toEqual(['PR_1'])
    expect(result.restrictedOrgs.length).toBeGreaterThan(0)
    expect(result.incompleteReasons).toEqual(['pagination'])
  })

  it('recovers a restriction that only shows up on a detail batch second try', async () => {
    // Eleven ids split into ten and one. The singleton fails transiently, and
    // the retry is the request that hits the restriction — the one path where
    // salvage used to be skipped, taking the other ten PRs down with it.
    const ids = Array.from({ length: 11 }, (_, i) => `PR_${i + 1}`)
    const restriction = new GraphqlResponseError(
      { method: 'POST', url: 'https://api.github.com/graphql' },
      {},
      {
        data: { nodes: [null] },
        errors: [
          { message: 'the `status-im` organization has enabled OAuth App access restrictions' },
        ],
      } as never,
    )
    let singletonAttempts = 0
    const client = vi.fn(async (query: string, variables: Record<string, unknown>) => {
      if (query === SEARCH_QUERY) return { search: { nodes: ids.map((id) => ({ id })) } }
      if (query === DETAILS_QUERY) {
        const batch = variables.ids as string[]
        if (batch.length > 1) return { nodes: batch.map((id) => detailNode(id)) }
        singletonAttempts += 1
        if (singletonAttempts === 1) throw Object.assign(new Error('bad gateway'), { status: 502 })
        throw restriction
      }
      throw new Error(`unexpected query: ${query}`)
    })

    const result = await fetchPullRequests(client, 'vlad')

    expect(result.prs.map((pr) => pr.id)).toEqual(ids.slice(0, 10))
    expect(result.restrictedOrgs).toEqual(['status-im'])
  })

  it('fails loudly when a search succeeds without a result set', async () => {
    // Malformed rather than empty. Returning no ids here would quietly empty
    // the inbox with a green tick next to it.
    const client = vi.fn(async (query: string) => {
      if (query === SEARCH_QUERY) return { search: null }
      throw new Error(`unexpected query: ${query}`)
    })

    await expect(fetchPullRequests(client, 'vlad')).rejects.toThrow(/no result set/)
  })

  it('keeps other PRs when a detail batch names a restricted org', async () => {
    const restriction = new GraphqlResponseError(
      { method: 'POST', url: 'https://api.github.com/graphql' },
      {},
      {
        data: { nodes: [detailNode('PR_1'), null] },
        errors: [
          {
            message:
              'Although you appear to have the correct authorization credentials, the `status-im` organization has enabled OAuth App access restrictions, meaning that data access to third-parties is limited.',
          },
        ],
      } as never,
    )
    const client = vi.fn(async (query: string) => {
      if (query === SEARCH_QUERY) {
        return { search: { nodes: [{ id: 'PR_1' }, { id: 'PR_blocked' }] } }
      }
      if (query === DETAILS_QUERY) throw restriction
      throw new Error(`unexpected query: ${query}`)
    })

    const result = await fetchPullRequests(client, 'vlad')
    expect(result.prs.map((pr) => pr.id)).toEqual(['PR_1'])
    expect(result.restrictedOrgs).toEqual(['status-im'])
  })
})

describe('fetchPullRequests search pagination', () => {
  const MAX_SEARCH_PAGES = 2

  /**
   * Serves `author:@me` in pages of `pageSize`, keyed by the cursor it handed
   * out last, and every other bucket empty. `remaining` is what each search
   * reports is left of the hourly quota.
   */
  function pagedClient(ids: string[], pageSize: number, remaining: () => number = () => 5000) {
    return vi.fn(async (query: string, variables: Record<string, unknown>) => {
      if (query === SEARCH_QUERY) {
        const rateLimit = { cost: 1, remaining: remaining(), resetAt: '2026-08-10T13:00:00Z' }
        if (!(variables.q as string).includes('author:@me')) {
          return {
            rateLimit,
            search: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
          }
        }
        const start = variables.after === null ? 0 : Number(variables.after)
        const end = start + pageSize
        return {
          rateLimit,
          search: {
            pageInfo: { hasNextPage: end < ids.length, endCursor: String(end) },
            nodes: ids.slice(start, end).map((id) => ({ id })),
          },
        }
      }
      if (query === DETAILS_QUERY) {
        return { nodes: (variables.ids as string[]).map((id) => detailNode(id)) }
      }
      throw new Error(`unexpected query: ${query}`)
    })
  }

  function authorSearches(client: ReturnType<typeof pagedClient>) {
    return client.mock.calls.filter(
      ([query, variables]) =>
        query === SEARCH_QUERY && (variables.q as string).includes('author:@me'),
    )
  }

  it('follows the cursor past the first page until the bucket is exhausted', async () => {
    const ids = Array.from({ length: 130 }, (_, i) => `PR_${i}`)
    const client = pagedClient(ids, 100)

    const { prs } = await fetchPullRequests(client, 'vlad')

    expect(prs.map((pr) => pr.id)).toEqual(ids)
    expect(authorSearches(client).map(([, variables]) => variables.after)).toEqual([null, '100'])
  })

  it('stops after a bounded number of pages however many results GitHub claims', async () => {
    const ids = Array.from({ length: 5000 }, (_, i) => `PR_${i}`)
    const client = pagedClient(ids, 100)

    const { prs, incompleteReasons } = await fetchPullRequests(client, 'vlad')

    expect(authorSearches(client)).toHaveLength(MAX_SEARCH_PAGES)
    expect(prs).toHaveLength(MAX_SEARCH_PAGES * 100)
    expect(incompleteReasons).toEqual(['page-limit'])
  })

  it('stops paging while the rate limit still leaves room for the details it needs', async () => {
    const ids = Array.from({ length: 500 }, (_, i) => `PR_${i}`)
    const client = pagedClient(ids, 100, () => 400)

    const { prs, incompleteReasons } = await fetchPullRequests(client, 'vlad')

    expect(authorSearches(client)).toHaveLength(1)
    expect(prs).toHaveLength(100)
    expect(incompleteReasons).toEqual(['rate-limit'])
  })

  it('does not loop when GitHub hands back the same cursor twice', async () => {
    const client = vi.fn(async (query: string, variables: Record<string, unknown>) => {
      if (query === SEARCH_QUERY) {
        return {
          search: {
            pageInfo: { hasNextPage: true, endCursor: 'same' },
            nodes: [{ id: `PR_${String(variables.after)}` }],
          },
        }
      }
      return { nodes: (variables.ids as string[]).map((id) => detailNode(id)) }
    })

    const { incompleteReasons } = await fetchPullRequests(client, 'vlad')

    const searches = client.mock.calls.filter(([query]) => query === SEARCH_QUERY)
    expect(searches).toHaveLength(8)
    expect(incompleteReasons).toEqual(['pagination'])
  })
})
