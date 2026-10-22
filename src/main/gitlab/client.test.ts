import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGitLabClient, GitLabHttpError, normalizeGitLabUrl } from './client'

afterEach(() => vi.unstubAllGlobals())

describe('GitLab server URL', () => {
  it('accepts a self-hosted HTTPS address', () => {
    expect(normalizeGitLabUrl(' https://gitlab.example.com/ ')).toBe('https://gitlab.example.com')
    expect(normalizeGitLabUrl('https://gitlab.example.com///')).toBe('https://gitlab.example.com')
  })

  it('rejects tokens in the address and insecure remote HTTP', () => {
    expect(() => normalizeGitLabUrl('https://user:secret@gitlab.example.com')).toThrow()
    expect(() => normalizeGitLabUrl('http://gitlab.example.com')).toThrow()
  })

  it('reads every page with a private token and GET only', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(Array.from({ length: 100 }, (_, i) => i))))
      .mockResolvedValueOnce(new Response(JSON.stringify([100])))
    vi.stubGlobal('fetch', fetcher)
    const client = createGitLabClient('https://gitlab.example.com', 'secret')
    expect(await client.list<number>('/merge_requests')).toHaveLength(101)
    expect(fetcher).toHaveBeenCalledTimes(2)
    const [firstUrl, firstOptions] = fetcher.mock.calls[0] as [URL, RequestInit]
    expect(firstUrl.searchParams.get('page')).toBe('1')
    expect(firstUrl.searchParams.get('per_page')).toBe('100')
    expect(firstOptions.headers).toMatchObject({ 'PRIVATE-TOKEN': 'secret' })
    expect(firstOptions.method).toBeUndefined()
    expect(firstOptions.redirect).toBe('error')
  })

  it('follows GitLab Link headers when a self-hosted server caps the page size', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([1, 2]), {
          headers: {
            Link: '<https://gitlab.example.com/api/v4/merge_requests?page=2&per_page=100>; rel="next"',
          },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([3]), { headers: { 'X-Next-Page': '' } }))
    vi.stubGlobal('fetch', fetcher)

    const client = createGitLabClient('https://gitlab.example.com', 'secret')
    expect(await client.list<number>('/merge_requests')).toEqual([1, 2, 3])
    expect(fetcher.mock.calls[1][0].searchParams.get('page')).toBe('2')
  })

  it('uses X-Next-Page when Link is absent', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([1]), { headers: { 'X-Next-Page': '2' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([2]), { headers: { 'X-Next-Page': '' } }))
    vi.stubGlobal('fetch', fetcher)

    expect(
      await createGitLabClient('https://gitlab.example.com', 'secret').list<number>('/todos'),
    ).toEqual([1, 2])
  })

  it('never sends the private token to a pagination link on another server', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify([1]), {
        headers: { Link: '<https://elsewhere.example.com/api/v4/todos?page=2>; rel="next"' },
      }),
    )
    vi.stubGlobal('fetch', fetcher)

    await expect(
      createGitLabClient('https://gitlab.example.com', 'secret').list('/todos'),
    ).rejects.toThrow('outside this server API')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('honors GitLab Retry-After for rate limits', () => {
    const error = new GitLabHttpError(429, '30')
    expect(Date.parse(error.retryAt ?? '')).toBeGreaterThan(Date.now())
  })
})
