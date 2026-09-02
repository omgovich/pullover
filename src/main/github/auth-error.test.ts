import { GraphqlResponseError } from '@octokit/graphql'
import { RequestError } from '@octokit/request-error'
import { describe, expect, it } from 'vitest'
import { isAuthError } from './auth-error'

const REQUEST_OPTIONS = {
  method: 'POST' as const,
  url: 'https://api.github.com/graphql',
  headers: { authorization: 'token deadbeef' },
}

describe('isAuthError', () => {
  it('matches the RequestError @octokit/request throws for a 401 (bad/expired/revoked credential)', () => {
    const error = new RequestError('Bad credentials', 401, { request: REQUEST_OPTIONS })
    expect(isAuthError(error)).toBe(true)
  })

  it('does not match a RequestError for a different status, like a rate limit or server error', () => {
    expect(
      isAuthError(new RequestError('API rate limit exceeded', 403, { request: REQUEST_OPTIONS })),
    ).toBe(false)
    expect(isAuthError(new RequestError('Server Error', 502, { request: REQUEST_OPTIONS }))).toBe(
      false,
    )
  })

  it('does not match GraphqlResponseError, which carries no status — a malformed query, not a dead token', () => {
    const error = new GraphqlResponseError(
      { method: 'POST', url: 'https://api.github.com/graphql' },
      {},
      { data: null, errors: [{ message: 'Field "bogus" does not exist' }] } as never,
    )
    expect(isAuthError(error)).toBe(false)
  })

  it('does not match a plain network failure', () => {
    expect(isAuthError(new TypeError('fetch failed'))).toBe(false)
  })

  it('does not match a non-Error value', () => {
    expect(isAuthError('Bad credentials')).toBe(false)
    expect(isAuthError(null)).toBe(false)
    expect(isAuthError(undefined)).toBe(false)
  })
})
