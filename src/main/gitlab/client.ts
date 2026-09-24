export interface GitLabClient {
  get<T>(path: string, params?: Record<string, string>): Promise<T>
  list<T>(path: string, params?: Record<string, string>): Promise<T[]>
}

export class GitLabHttpError extends Error {
  readonly retryAt: string | null

  constructor(
    readonly status: number,
    retryAfter: string | null = null,
  ) {
    super(
      status === 401
        ? 'GitLab token is invalid or expired'
        : status === 403
          ? 'GitLab denied access — check read_api scope and project permissions'
          : `GitLab returned HTTP ${status}`,
    )
    const seconds = Number(retryAfter)
    const reset =
      retryAfter === null
        ? Number.NaN
        : Number.isFinite(seconds)
          ? Date.now() + seconds * 1000
          : Date.parse(retryAfter)
    this.retryAt = Number.isFinite(reset) ? new Date(reset).toISOString() : null
  }
}

export function normalizeGitLabUrl(input: string): string {
  const url = new URL(input.trim())
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) {
    throw new Error('GitLab URL must use HTTPS')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('GitLab URL must contain only the server address')
  }
  return url.href.replace(/\/+$/, '')
}

export function createGitLabClient(serverUrl: string, token: string): GitLabClient {
  const base = normalizeGitLabUrl(serverUrl)
  if (!token.trim()) throw new Error('GitLab token is required')
  const apiRoot = new URL(`${base}/api/v4`)

  async function request<T>(url: URL): Promise<{ data: T; headers: Headers }> {
    if (
      url.origin !== apiRoot.origin ||
      (url.pathname !== apiRoot.pathname && !url.pathname.startsWith(`${apiRoot.pathname}/`))
    ) {
      throw new Error('GitLab pagination URL points outside this server API')
    }
    const response = await fetch(url, {
      headers: { 'PRIVATE-TOKEN': token, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
      redirect: 'error',
    })
    if (!response.ok) {
      throw new GitLabHttpError(response.status, response.headers.get('retry-after'))
    }
    return { data: (await response.json()) as T, headers: response.headers }
  }

  function endpoint(path: string, params: Record<string, string>): URL {
    const url = new URL(`${apiRoot.href}${path}`)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    return url
  }

  function nextPageUrl(headers: Headers, current: URL, count: number): URL | null {
    const link = headers.get('link')
    if (link !== null) {
      const next = [...link.matchAll(/<([^>]+)>\s*;\s*rel="?next"?/gi)][0]?.[1]
      return next ? new URL(next, current) : null
    }

    const nextPage = headers.get('x-next-page')
    if (nextPage !== null) {
      if (!/^\d+$/.test(nextPage)) return null
      const url = new URL(current)
      url.searchParams.set('page', nextPage)
      return url
    }

    if (count < 100) return null
    const url = new URL(current)
    url.searchParams.set('page', String(Number(url.searchParams.get('page') ?? '1') + 1))
    return url
  }

  return {
    get: async <T>(path: string, params: Record<string, string> = {}): Promise<T> =>
      (await request<T>(endpoint(path, params))).data,
    async list<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
      const results: T[] = []
      const visited = new Set<string>()
      let url: URL | null = endpoint(path, { ...params, per_page: '100', page: '1' })
      while (url) {
        if (visited.has(url.href)) throw new Error('GitLab pagination returned a repeated page')
        visited.add(url.href)
        const { data: batch, headers } = await request<T[]>(url)
        results.push(...batch)
        url = nextPageUrl(headers, url, batch.length)
      }
      return results
    },
  }
}
