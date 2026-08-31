import { describe, expect, it } from 'vitest'
import { buildSearchQuery, chunk } from '@core/search-query'

describe('chunk', () => {
  it('splits into groups of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns an empty array for empty input', () => {
    expect(chunk([], 3)).toEqual([])
  })

  it('throws instead of looping forever when size is zero', () => {
    expect(() => chunk([1, 2, 3], 0)).toThrow()
  })

  it('throws instead of looping forever when size is negative', () => {
    expect(() => chunk([1, 2, 3], -1)).toThrow()
  })
})

describe('buildSearchQuery', () => {
  it('builds an unscoped query with is:pr, is:open and the bucket qualifier', () => {
    expect(buildSearchQuery('review-requested')).toBe(
      'is:pr is:open review-requested:@me sort:updated-desc',
    )
  })

  it('maps every bucket to its own qualifier', () => {
    expect(buildSearchQuery('author')).toContain('author:@me')
    expect(buildSearchQuery('involves')).toContain('involves:@me')
    expect(buildSearchQuery('mentions')).toContain('mentions:@me')
  })

  it('sorts by most recently updated', () => {
    expect(buildSearchQuery('review-requested')).toContain('sort:updated-desc')
  })

  it('never emits a repo: qualifier, for any bucket', () => {
    for (const bucket of ['review-requested', 'author', 'involves', 'mentions'] as const) {
      expect(buildSearchQuery(bucket)).not.toContain('repo:')
    }
  })
})
