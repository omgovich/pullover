import { GraphqlResponseError } from '@octokit/graphql'
import { describe, expect, it } from 'vitest'
import {
  formatRestrictedOrgs,
  graphqlPartialData,
  isOnlyRestriction,
  mergeOrgs,
  restrictedOrganizations,
} from './org-restriction'

const REQUEST = { method: 'POST' as const, url: 'https://api.github.com/graphql' }

function restrictionError(org: string, data: unknown = null): GraphqlResponseError<unknown> {
  return new GraphqlResponseError(REQUEST, {}, {
    data,
    errors: [
      {
        message: `Although you appear to have the correct authorization credentials, the \`${org}\` organization has enabled OAuth App access restrictions, meaning that data access to third-parties is limited.`,
      },
    ],
  } as never)
}

describe('restrictedOrganizations', () => {
  it('reads the org GitHub named in the error', () => {
    expect(restrictedOrganizations(restrictionError('status-im'))).toEqual(['status-im'])
  })

  it('collects every org when several are named', () => {
    const error = new GraphqlResponseError(REQUEST, {}, {
      data: null,
      errors: [
        {
          message: 'the `status-im` organization has enabled OAuth App access restrictions',
        },
        {
          message: 'the `acme` organization has enabled OAuth App access restrictions',
        },
      ],
    } as never)
    expect(restrictedOrganizations(error)).toEqual(['acme', 'status-im'])
  })

  it('is empty for an unrelated failure', () => {
    expect(restrictedOrganizations(new Error('Field "bogus" does not exist'))).toEqual([])
    expect(restrictedOrganizations('not an error')).toEqual([])
  })
})

describe('restrictedOrganizations, on a plain 403', () => {
  it('reads the org out of a REST-shaped error, which carries it only on `message`', () => {
    const error = Object.assign(
      new Error(
        'Although you appear to have the correct authorization credentials, the `status-im` organization has enabled OAuth App access restrictions, meaning that data access to third-parties is limited.',
      ),
      { status: 403 },
    )
    expect(restrictedOrganizations(error)).toEqual(['status-im'])
  })
})

describe('isOnlyRestriction', () => {
  it('is true when every reported error is a restriction', () => {
    expect(isOnlyRestriction(restrictionError('status-im'))).toBe(true)
  })

  it('is false when something else failed in the same response', () => {
    const error = new GraphqlResponseError(REQUEST, {}, {
      data: { search: { nodes: [] } },
      errors: [
        { message: 'the `status-im` organization has enabled OAuth App access restrictions' },
        { message: 'Something went wrong while executing your query.' },
      ],
    } as never)
    expect(isOnlyRestriction(error)).toBe(false)
  })

  it('is false for an unrelated failure', () => {
    expect(isOnlyRestriction(new Error('network down'))).toBe(false)
  })
})

describe('graphqlPartialData', () => {
  it('returns the payload Octokit stashed on a partial GraphQL error', () => {
    const data = { search: { nodes: [{ id: 'PR_1' }] } }
    expect(graphqlPartialData(restrictionError('status-im', data))).toEqual(data)
  })

  it('is null for anything that is not a GraphQL response error', () => {
    expect(graphqlPartialData(new Error('network down'))).toBeNull()
  })
})

describe('formatRestrictedOrgs', () => {
  it('is null when nothing was restricted', () => {
    expect(formatRestrictedOrgs([])).toBeNull()
  })

  it('names one org', () => {
    expect(formatRestrictedOrgs(['status-im'])).toBe("status-im hasn't approved Pullover")
  })

  it('names two orgs', () => {
    expect(formatRestrictedOrgs(['acme', 'status-im'])).toBe(
      "acme and status-im haven't approved Pullover",
    )
  })

  it('names three orgs without dropping the last', () => {
    expect(formatRestrictedOrgs(['acme', 'beta', 'status-im'])).toBe(
      "acme, beta and status-im haven't approved Pullover",
    )
  })
})

describe('mergeOrgs', () => {
  it('is empty when there is nothing to merge', () => {
    expect(mergeOrgs()).toEqual([])
    expect(mergeOrgs([], [])).toEqual([])
  })

  it('deduplicates across lists and sorts, so the warning copy is stable', () => {
    expect(mergeOrgs(['status-im'], ['acme', 'status-im'], ['beta'])).toEqual([
      'acme',
      'beta',
      'status-im',
    ])
  })
})
