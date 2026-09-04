/**
 * Recognises a GitHub rate limit from what `@octokit/graphql` throws, and
 * says when it lifts.
 *
 * GitHub attaches `x-ratelimit-*` headers to nearly every response, so an
 * ordinary permission failure is also a 403 carrying them. Both the status
 * and the header have to hold, or a permanent error would be reported as
 * something worth waiting out.
 */
export function rateLimitResetAt(error: unknown, now: string): string | null {
  if (!(error instanceof Error) || !('status' in error)) return null
  const status = (error as { status: unknown }).status
  if (status !== 403 && status !== 429) return null

  const response = (error as { response?: { headers?: unknown } }).response
  const headers = response?.headers
  if (typeof headers !== 'object' || headers === null) return null
  const header = headers as Record<string, string | undefined>

  // Primary limit: the quota is spent. `x-ratelimit-reset` is Unix seconds.
  if (status === 403 && header['x-ratelimit-remaining'] === '0') {
    const reset = Number(header['x-ratelimit-reset'])
    if (!Number.isFinite(reset)) return null
    return new Date(reset * 1000).toISOString()
  }

  // Secondary limit (abuse detection): seconds from now, not a timestamp.
  const retryAfter = Number(header['retry-after'])
  if (Number.isFinite(retryAfter)) {
    return new Date(Date.parse(now) + retryAfter * 1000).toISOString()
  }

  return null
}
