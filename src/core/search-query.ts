import type { SearchBucket } from '@shared/types'

const BUCKET_QUALIFIERS: Record<SearchBucket, string> = {
  'review-requested': 'review-requested:@me',
  author: 'author:@me',
  involves: 'involves:@me',
  mentions: 'mentions:@me',
}

/** Splits `items` into groups of at most `size`. `size` must be positive. */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error(`chunk size must be positive — got ${size}`)
  const groups: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size))
  }
  return groups
}

/**
 * Always unfiltered by repository — the settings picker's own options come
 * from what an unfiltered search turns up, so narrowing the search would make
 * the picker only ever offer repositories already selected.
 *
 * Sorted by most-recently-updated: `SEARCH_QUERY` fetches only the first 50
 * results with no pagination, so this ordering makes the truncation
 * predictable (freshest activity survives) when an unfiltered search exceeds
 * that limit.
 */
export function buildSearchQuery(bucket: SearchBucket): string {
  return ['is:pr', 'is:open', BUCKET_QUALIFIERS[bucket], 'sort:updated-desc'].join(' ')
}
