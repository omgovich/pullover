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
 */
export function buildSearchQueries(
  repositories: string[],
  bucket: SearchBucket,
  chunkSize = 10,
): string[] {
  if (repositories.length === 0) return []
  return chunk(repositories, chunkSize).map((group) =>
    [
      ...group.map((repo) => `repo:${repo}`),
      'is:pr',
      'is:open',
      BUCKET_QUALIFIERS[bucket],
    ].join(' '),
  )
}
