/**
 * Recognises a GitHub rate limit — primary or secondary — from what
 * `@octokit/graphql` throws, and says when it lifts.
 *
 * A rate-limited request still goes through `@octokit/request`'s fetch
 * wrapper, which turns any non-2xx response into `@octokit/request-error`'s
 * `RequestError` (see node_modules/@octokit/request-error/dist-src/index.js)
 * — a plain `Error` subclass with a numeric `status` and, when a response
 * actually arrived, a `response` object carrying `headers`. Those headers
 * are typed in node_modules/@octokit/types/dist-types/ResponseHeaders.d.ts,
 * which is where `x-ratelimit-limit`, `x-ratelimit-remaining` and
 * `x-ratelimit-reset` come from — this module reads them structurally
 * rather than importing that type, since `@octokit/types` is only a
 * transitive dependency (pulled in by `@octokit/graphql` and
 * `@octokit/request-error`), not one Pullover depends on directly.
 *
 * GitHub documents two distinct limits, and they don't look alike on the
 * wire:
 *
 * - The *primary* limit (plain hourly quota) comes back as a 403 with
 *   `x-ratelimit-remaining: "0"`. The reset time is `x-ratelimit-reset`, a
 *   Unix timestamp in seconds.
 * - A *secondary* limit (abuse detection, too many requests too fast) can
 *   come back as a 403 *or* a 429, and instead carries `retry-after` — a
 *   number of seconds from now, not a timestamp, and not in the typed
 *   header list above, so it's read defensively (it may be absent, or not
 *   parse as a number).
 *
 * A `GraphqlResponseError` (see node_modules/@octokit/graphql/dist-src/error.js)
 * carries no `status` at all — a malformed query gets a 200 with an
 * `errors` array, never a rate limit — so it never matches here. Neither
 * does a 403 that isn't actually about the limit: GitHub sends
 * `x-ratelimit-*` headers on nearly every response, so an ordinary
 * permission error is still a 403 with rate-limit headers attached, just
 * with `x-ratelimit-remaining` at something other than `"0"` and no
 * `retry-after`. Treating that as a rate limit would tell the user to wait
 * for something that will never change, so both header checks below must
 * hold, not just the status code.
 */
export function rateLimitResetAt(error: unknown, now: string): string | null {
  if (!(error instanceof Error) || !('status' in error)) return null
  const status = (error as { status: unknown }).status
  if (status !== 403 && status !== 429) return null

  const response = (error as { response?: { headers?: unknown } }).response
  const headers = response?.headers
  if (typeof headers !== 'object' || headers === null) return null
  // Values are strings: they come off a fetch `Response`, and the typed
  // header list declares them as such. Saying `number` here too would
  // suggest the comparisons below handle one, which they don't.
  const header = headers as Record<string, string | undefined>

  // Primary limit: 403 with the quota exhausted, reset given as a Unix
  // timestamp in seconds.
  if (status === 403 && header['x-ratelimit-remaining'] === '0') {
    const reset = Number(header['x-ratelimit-reset'])
    if (!Number.isFinite(reset)) return null
    return new Date(reset * 1000).toISOString()
  }

  // Secondary limit: 403 or 429, `retry-after` seconds counted from now.
  const retryAfter = Number(header['retry-after'])
  if (Number.isFinite(retryAfter)) {
    return new Date(Date.parse(now) + retryAfter * 1000).toISOString()
  }

  return null
}
