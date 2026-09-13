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

/**
 * The repositories the picker offers: everything seen in the fetch, plus
 * everything already selected. A selected repository with nothing open right
 * now is absent from the fetch but must still be listed — and counted, or the
 * summary reads "1 of 0".
 *
 * Stored names are lowercased while GitHub returns them in their original
 * case, so duplicates are folded case-insensitively and the prettier casing
 * wins.
 */
export function repositoryOptions(known: string[], selected: string[]): string[] {
  const byLower = new Map<string, string>()
  for (const repo of [...known, ...selected]) {
    if (!byLower.has(repo.toLowerCase())) byLower.set(repo.toLowerCase(), repo)
  }
  return [...byLower.values()].sort((a, b) => a.localeCompare(b))
}

/**
 * What the Repositories row shows on its right: how many of the offered
 * repositories are ticked, or that all of them are watched. Divides by the
 * same union the picker lists, so a selected repository with nothing open
 * right now cannot make it read "1 of 0".
 */
export function repositorySummary(watchAll: boolean, known: string[], selected: string[]): string {
  if (watchAll) return 'All'
  return `${selected.length} of ${repositoryOptions(known, selected).length}`
}
