import { GraphqlResponseError } from '@octokit/graphql'
import { RequestError } from '@octokit/request-error'
import { describe, expect, it } from 'vitest'
import { rateLimitResetAt } from './rate-limit'

const NOW = '2026-08-10T12:00:00Z'

const REQUEST_OPTIONS = {
  method: 'GET' as const,
  url: 'https://api.github.com/search/issues',
  headers: { authorization: 'token deadbeef' },
}

function requestErrorWithHeaders(
  message: string,
  status: number,
  headers: Record<string, string>,
): RequestError {
  return new RequestError(message, status, {
    request: REQUEST_OPTIONS,
    response: {
      status,
      url: REQUEST_OPTIONS.url,
      headers,
      data: {},
    },
  })
}

describe('rateLimitResetAt', () => {
  it('reads the primary limit from a 403 with remaining exhausted and a Unix reset timestamp', () => {
    // 2026-08-10T12:12:00Z as Unix seconds.
    const error = requestErrorWithHeaders('API rate limit exceeded', 403, {
      'x-ratelimit-limit': '5000',
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': '1786363920',
    })
    expect(rateLimitResetAt(error, NOW)).toBe('2026-08-10T12:12:00.000Z')
  })

  it('reads the secondary limit from a 429 with retry-after seconds', () => {
    const error = requestErrorWithHeaders('You have exceeded a secondary rate limit', 429, {
      'retry-after': '90',
    })
    expect(rateLimitResetAt(error, NOW)).toBe('2026-08-10T12:01:30.000Z')
  })

  it('reads the secondary limit from a 403 with retry-after seconds (no ratelimit-remaining at all)', () => {
    const error = requestErrorWithHeaders('You have exceeded a secondary rate limit', 403, {
      'retry-after': '30',
    })
    expect(rateLimitResetAt(error, NOW)).toBe('2026-08-10T12:00:30.000Z')
  })

  it('does not match a 403 with no rate-limit headers at all', () => {
    const error = requestErrorWithHeaders('Forbidden', 403, {})
    expect(rateLimitResetAt(error, NOW)).toBeNull()
  })

  it('does not match a 403 that is a permission problem, not an exhausted limit', () => {
    // GitHub sends x-ratelimit-* — including a reset timestamp — on almost
    // every response, exhausted or not, so a permission 403 realistically
    // still carries one. Only "remaining is zero" says the limit is why the
    // request was refused; this case must be rejected on that check alone,
    // not merely because a reset header happens to be missing.
    const error = requestErrorWithHeaders('Resource not accessible by integration', 403, {
      'x-ratelimit-limit': '5000',
      'x-ratelimit-remaining': '4999',
      'x-ratelimit-reset': '1786363920',
    })
    expect(rateLimitResetAt(error, NOW)).toBeNull()
  })

  it('does not match a 401', () => {
    // Rate-limit-shaped headers on purpose: this must be rejected on status
    // alone, not merely because the headers happen to be absent.
    const error = requestErrorWithHeaders('Bad credentials', 401, {
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': '1786363920',
    })
    expect(rateLimitResetAt(error, NOW)).toBeNull()
  })

  it('does not match a 401 carrying a retry-after header either', () => {
    // Exercises the status gate specifically through the secondary-limit
    // path: the primary branch above is already guarded by `status === 403`
    // internally, so this is the case that would actually go through if the
    // outer `status !== 403 && status !== 429` check were ever loosened.
    const error = requestErrorWithHeaders('Bad credentials', 401, { 'retry-after': '30' })
    expect(rateLimitResetAt(error, NOW)).toBeNull()
  })

  it('does not match a 404', () => {
    const error = requestErrorWithHeaders('Not Found', 404, {
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': '1786363920',
    })
    expect(rateLimitResetAt(error, NOW)).toBeNull()
  })

  it('does not match GraphqlResponseError, which carries no status', () => {
    const error = new GraphqlResponseError(
      { method: 'POST', url: 'https://api.github.com/graphql' },
      {},
      { data: null, errors: [{ message: 'Field "bogus" does not exist' }] } as never,
    )
    expect(rateLimitResetAt(error, NOW)).toBeNull()
  })

  it('does not match a plain error', () => {
    expect(rateLimitResetAt(new Error('network down'), NOW)).toBeNull()
  })

  it('does not match a non-Error value', () => {
    expect(rateLimitResetAt('API rate limit exceeded', NOW)).toBeNull()
    expect(rateLimitResetAt(null, NOW)).toBeNull()
    expect(rateLimitResetAt(undefined, NOW)).toBeNull()
  })
})
