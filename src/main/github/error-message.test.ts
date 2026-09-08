import { GraphqlResponseError } from '@octokit/graphql'
import { RequestError } from '@octokit/request-error'
import { describe, expect, it } from 'vitest'
import { describeError } from './error-message'

const REQUEST_OPTIONS = {
  method: 'POST' as const,
  url: 'https://api.github.com/graphql',
  headers: { authorization: 'token deadbeef' },
}

/** What a proxy or a struggling gateway sends instead of GitHub's JSON. */
const BAD_GATEWAY_PAGE = `<html>
<head><title>502 Bad Gateway</title></head>
<body>
<center><h1>502 Bad Gateway</h1></center>
<hr><center>nginx</center>
</body>
</html>
`

describe('describeError', () => {
  it('replaces an HTML error page with the status it arrived under', () => {
    const error = new RequestError(BAD_GATEWAY_PAGE, 502, { request: REQUEST_OPTIONS })
    expect(describeError(error)).toBe("Couldn't reach GitHub — HTTP 502")
  })

  it('replaces a body too long to read in one line', () => {
    const error = new RequestError('detail: '.repeat(40), 503, { request: REQUEST_OPTIONS })
    expect(describeError(error)).toBe("Couldn't reach GitHub — HTTP 503")
  })

  it("keeps GitHub's own message, which is short and written for a human", () => {
    const error = new RequestError('Bad credentials', 401, { request: REQUEST_OPTIONS })
    expect(describeError(error)).toBe('Bad credentials')
  })

  it('keeps a GraphQL error, which arrives under a 200 and so carries no status at all', () => {
    const error = new GraphqlResponseError({ method: 'POST', url: REQUEST_OPTIONS.url }, {}, {
      data: null,
      errors: [{ message: 'Could not resolve to a node' }],
    } as never)
    expect(describeError(error)).toBe(
      'Request failed due to following response errors: - Could not resolve to a node',
    )
  })

  it('keeps a network failure, whose message says more than the 500 Octokit files it under', () => {
    const error = new RequestError('getaddrinfo ENOTFOUND api.github.com', 500, {
      request: REQUEST_OPTIONS,
    })
    expect(describeError(error)).toBe('getaddrinfo ENOTFOUND api.github.com')
  })

  it('collapses the whitespace of a message worth keeping', () => {
    expect(describeError(new Error('Something\n  went   wrong'))).toBe('Something went wrong')
  })

  it('falls back without a status when there is nothing readable and nothing thrown by HTTP', () => {
    expect(describeError(new Error(''))).toBe("Couldn't reach GitHub")
    expect(describeError(new Error(BAD_GATEWAY_PAGE))).toBe("Couldn't reach GitHub")
  })

  it('describes something thrown that is not an Error at all', () => {
    expect(describeError('boom')).toBe('boom')
    expect(describeError(undefined)).toBe('undefined')
  })
})
