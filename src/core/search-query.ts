import type { SearchBucket } from '@shared/types'

const BUCKET_QUALIFIERS: Record<SearchBucket, string> = {
  'review-requested': 'review-requested:@me',
  author: 'author:@me',
  involves: 'involves:@me',
  mentions: 'mentions:@me',
}

export function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size))
  }
  return groups
}

/**
 * GitHub search caps how many qualifiers one query may carry, so a long
 * repository list is split across several queries.
 *
 * `review-requested:@me` already covers requests that reached the user through
 * a team, so team membership never has to be resolved separately.
 *
 * `repositories` has three meanings:
 * - `null` — watch everything: exactly one query, with no `repo:` qualifier
 *   at all, so GitHub searches every repository the user is involved in.
 * - `[]` — no repositories selected: no queries at all.
 * - a non-empty array — search only those repositories, chunked across
 *   several queries if the list is long.
 *
 * Every query is sorted by most-recently-updated. `SEARCH_QUERY` fetches only
 * the first 50 results with no pagination, so once a search isn't narrowed by
 * a small repository list it can plausibly exceed 50 — sorting makes the
 * truncation predictable (freshest activity survives) instead of relying on
 * GitHub's best-match ordering, which gives no such guarantee.
 */
export function buildSearchQueries(
  repositories: string[] | null,
  bucket: SearchBucket,
  chunkSize = 10,
): string[] {
  if (repositories === null) {
    return [
      ['is:pr', 'is:open', BUCKET_QUALIFIERS[bucket], 'sort:updated-desc'].join(' '),
    ]
  }
  if (repositories.length === 0) return []
  return chunk(repositories, chunkSize).map((group) =>
    [
      ...group.map((repo) => `repo:${repo}`),
      'is:pr',
      'is:open',
      BUCKET_QUALIFIERS[bucket],
      'sort:updated-desc',
    ].join(' '),
  )
}
