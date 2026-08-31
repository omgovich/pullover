import { describe, expect, it } from 'vitest'
import { buildSearchQueries, chunk } from '@core/search-query'

describe('chunk', () => {
  it('splits into groups of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns an empty array for empty input', () => {
    expect(chunk([], 3)).toEqual([])
  })
})

describe('buildSearchQueries', () => {
  it('returns nothing when no repositories are configured', () => {
    expect(buildSearchQueries([], 'author')).toEqual([])
  })

  it('builds one query for a small repository list', () => {
    expect(buildSearchQueries(['acme/web', 'acme/api'], 'review-requested')).toEqual([
      'repo:acme/web repo:acme/api is:pr is:open review-requested:@me',
    ])
  })

  it('maps every bucket to its qualifier', () => {
    expect(buildSearchQueries(['acme/web'], 'author')[0]).toContain('author:@me')
    expect(buildSearchQueries(['acme/web'], 'involves')[0]).toContain('involves:@me')
    expect(buildSearchQueries(['acme/web'], 'mentions')[0]).toContain('mentions:@me')
  })

  it('splits long repository lists across several queries', () => {
    const repos = Array.from({ length: 12 }, (_, i) => `acme/repo${i}`)
    const queries = buildSearchQueries(repos, 'author', 10)
    expect(queries).toHaveLength(2)
    expect(queries[0]).toContain('repo:acme/repo9')
    expect(queries[1]).toContain('repo:acme/repo10')
    expect(queries[1]).toContain('author:@me')
  })
})
