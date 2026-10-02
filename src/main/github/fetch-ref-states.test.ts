import { GraphqlResponseError } from '@octokit/graphql'
import { describe, expect, it, vi } from 'vitest'
import { buildRefStatesQuery, fetchRefStates } from './fetch-ref-states'

const API = { repository: 'acme/api', number: 12 }
const LIB = { repository: 'other/lib', number: 3 }

const pullRequest = (state: string) => ({
  issueOrPullRequest: { __typename: 'PullRequest', state },
})

describe('buildRefStatesQuery', () => {
  it('passes every owner, name and number as a variable', () => {
    const { query, variables } = buildRefStatesQuery([API, LIB])
    expect(variables).toEqual({ o0: 'acme', n0: 'api', k0: 12, o1: 'other', n1: 'lib', k1: 3 })
    expect(query).toContain('r1: repository(owner: $o1, name: $n1)')
    expect(query).toContain('rateLimit { cost remaining resetAt }')
    expect(query).not.toContain('acme')
  })
})

describe('fetchRefStates', () => {
  it('asks nothing when there is nothing to look up', async () => {
    const client = vi.fn()
    expect(await fetchRefStates(client, [])).toEqual(new Map())
    expect(client).not.toHaveBeenCalled()
  })

  it('keeps the references that are pull requests, by key', async () => {
    const client = vi.fn().mockResolvedValue({
      r0: pullRequest('MERGED'),
      r1: { issueOrPullRequest: { __typename: 'Issue' } },
    })
    expect(await fetchRefStates(client, [API, LIB])).toEqual(new Map([['acme/api#12', 'MERGED']]))
  })

  it('keeps what GitHub answered beside a repository it could not resolve', async () => {
    const client = vi.fn().mockRejectedValue(
      new GraphqlResponseError({ method: 'POST', url: 'https://api.github.com/graphql' }, {}, {
        data: { r0: pullRequest('OPEN'), r1: null },
        errors: [{ message: "Could not resolve to a Repository with the name 'other/lib'." }],
      } as never),
    )
    expect(await fetchRefStates(client, [API, LIB])).toEqual(new Map([['acme/api#12', 'OPEN']]))
  })

  it('answers with nothing known rather than failing the refresh', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = vi.fn().mockRejectedValue(new Error('socket hang up'))
    expect(await fetchRefStates(client, [API])).toEqual(new Map())
  })
})
