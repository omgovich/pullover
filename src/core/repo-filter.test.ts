import { describe, expect, it } from 'vitest'
import { collectRepositories, filterByRepositories } from '@core/repo-filter'
import { makePullRequest } from '@core/test-factory'

describe('collectRepositories', () => {
  it('dedupes and sorts repository names', () => {
    const prs = [
      makePullRequest({ id: 'PR_1', repository: 'acme/web' }),
      makePullRequest({ id: 'PR_2', repository: 'acme/api' }),
      makePullRequest({ id: 'PR_3', repository: 'acme/web' }),
    ]
    expect(collectRepositories(prs)).toEqual(['acme/api', 'acme/web'])
  })

  it('returns an empty array for no pull requests', () => {
    expect(collectRepositories([])).toEqual([])
  })
})

describe('filterByRepositories', () => {
  const prs = [
    makePullRequest({ id: 'PR_1', repository: 'acme/web' }),
    makePullRequest({ id: 'PR_2', repository: 'acme/api' }),
  ]

  it('passes everything through when repositories is null', () => {
    expect(filterByRepositories(prs, null)).toEqual(prs)
  })

  it('returns nothing when repositories is an empty array', () => {
    expect(filterByRepositories(prs, [])).toEqual([])
  })

  it('keeps only pull requests in the selected repositories', () => {
    expect(filterByRepositories(prs, ['acme/web']).map((pr) => pr.id)).toEqual(['PR_1'])
  })

  it('matches case-insensitively', () => {
    expect(
      filterByRepositories(prs, ['ACME/WEB']).map((pr) => pr.id),
    ).toEqual(['PR_1'])
  })
})
