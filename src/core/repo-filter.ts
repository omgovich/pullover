import type { PullRequest } from '@shared/types'

/** Every repository present in the fetched pull requests, unique and sorted. */
export function collectRepositories(prs: PullRequest[]): string[] {
  return [...new Set(prs.map((pr) => pr.repository))].sort()
}

/**
 * Narrows to the selected repositories. `null` means no narrowing.
 * Comparison is case-insensitive because stored names are normalised to
 * lowercase while GitHub returns them in their original case.
 */
export function filterByRepositories(
  prs: PullRequest[],
  repositories: string[] | null,
): PullRequest[] {
  if (repositories === null) return prs
  const wanted = new Set(repositories.map((repo) => repo.toLowerCase()))
  return prs.filter((pr) => wanted.has(pr.repository.toLowerCase()))
}
