import {
  collectRepositories,
  filterByRepositories,
  repositoryOptions,
  repositorySummary,
} from '@core/repo-filter'
import { makePullRequest } from '@core/test-factory'
import { describe, expect, it } from 'vitest'

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
    expect(filterByRepositories(prs, ['ACME/WEB']).map((pr) => pr.id)).toEqual(['PR_1'])
  })
})

describe('repositoryOptions', () => {
  it('lists the union of what was fetched and what is selected, sorted', () => {
    expect(repositoryOptions(['acme/web', 'acme/api'], ['acme/infra'])).toEqual([
      'acme/api',
      'acme/infra',
      'acme/web',
    ])
  })

  // The count in the settings row divides by this, and a selected repository
  // with nothing open would otherwise make it read "1 of 0".
  it('still counts a selected repository that has nothing open right now', () => {
    expect(repositoryOptions([], ['acme/api'])).toEqual(['acme/api'])
  })

  it('folds a name that differs only in case, keeping the prettier one', () => {
    expect(repositoryOptions(['Acme/Web'], ['acme/web'])).toEqual(['Acme/Web'])
  })
})

describe('repositorySummary', () => {
  it('says All when every repository is watched, whatever is ticked', () => {
    expect(repositorySummary(true, ['acme/web'], [])).toBe('All')
  })

  it('counts the ticked ones against everything on offer', () => {
    expect(repositorySummary(false, ['acme/web', 'acme/api'], ['acme/api'])).toBe('1 of 2')
  })

  // The bug this function exists to prevent: the denominator once came from
  // the fetch alone, so a selected repository with nothing open read "1 of 0".
  it('counts a selected repository that has nothing open right now', () => {
    expect(repositorySummary(false, [], ['acme/api'])).toBe('1 of 1')
  })
})
