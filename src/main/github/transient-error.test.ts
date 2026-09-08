import { GraphqlResponseError } from '@octokit/graphql'
import { RequestError } from '@octokit/request-error'
import { describe, expect, it } from 'vitest'
import { isTransientError } from './transient-error'

const REQUEST_OPTIONS = {
  method: 'POST' as const,
  url: 'https://api.github.com/graphql',
  headers: { authorization: 'token deadbeef' },
}

const requestError = (status: number): RequestError =>
  new RequestError('boom', status, { request: REQUEST_OPTIONS })

describe('isTransientError', () => {
  it('matches a gateway giving up on a query, which is the whole point', () => {
    expect(isTransientError(requestError(502))).toBe(true)
    expect(isTransientError(requestError(503))).toBe(true)
    expect(isTransientError(requestError(504))).toBe(true)
  })

  it('matches the 500 @octokit/request files a network failure under', () => {
    expect(isTransientError(requestError(500))).toBe(true)
  })

  it('does not match a dead token or a rate limit, which never answer differently', () => {
    expect(isTransientError(requestError(401))).toBe(false)
    expect(isTransientError(requestError(403))).toBe(false)
    expect(isTransientError(requestError(429))).toBe(false)
    expect(isTransientError(requestError(404))).toBe(false)
  })

  it('does not match a GraphQL error, whose query was answered', () => {
    const error = new GraphqlResponseError({ method: 'POST', url: REQUEST_OPTIONS.url }, {}, {
      data: null,
      errors: [{ message: 'Field "bogus" does not exist' }],
    } as never)
    expect(isTransientError(error)).toBe(false)
  })

  it('does not match a status outside the 5xx range at all', () => {
    expect(isTransientError(requestError(600))).toBe(false)
    expect(isTransientError(requestError(0))).toBe(false)
  })

  it('does not match a plain error or a non-Error value', () => {
    expect(isTransientError(new Error('network down'))).toBe(false)
    expect(isTransientError('boom')).toBe(false)
  })
})
