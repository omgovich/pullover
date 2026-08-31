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
 * The picker narrows the inbox by *display*, not by search, so every search
 * always runs unfiltered — the picker's own options come from what an
 * unfiltered search turns up. Narrowing the search itself would make the
 * picker only ever offer the repositories already selected.
 *
 * `review-requested:@me` already covers requests that reached the user through
 * a team, so team membership never has to be resolved separately.
 *
 * Sorted by most-recently-updated: `SEARCH_QUERY` fetches only the first 50
 * results with no pagination, and an unfiltered search can easily exceed
 * that — sorting makes the truncation predictable (freshest activity
 * survives) instead of relying on GitHub's best-match ordering, which gives
 * no such guarantee.
 */
export function buildSearchQuery(bucket: SearchBucket): string {
  return ['is:pr', 'is:open', BUCKET_QUALIFIERS[bucket], 'sort:updated-desc'].join(' ')
}
