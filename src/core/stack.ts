import type { PullRequest } from '@shared/types'

export interface StackPosition {
  /** 1-based position within the chain, counted from the root. */
  index: number
  /** Length of the chain. */
  total: number
}

/**
 * Groups `items` by the key `keyOf` produces.
 */
function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }
  return groups
}

/**
 * Position of each pull request within its stack, keyed by PR id.
 *
 * A stacked pull request targets the previous one's head branch, so the
 * chain is implied entirely by `headRefName`/`baseRefName` — nothing needs
 * to be parsed out of a title or description.
 *
 * Only open pull requests are ever fetched (see `fetchPullRequests`), so a
 * stack whose lower parts have merged simply reads as the shorter remaining
 * chain rooted at whatever is still open. That's the right answer as-is and
 * needs no special handling here.
 */
export function computeStackPositions(prs: PullRequest[]): Map<string, StackPosition> {
  const result = new Map<string, StackPosition>()

  // Branch names are only meaningful within their own repository, so a
  // coincidental match across repos must never link two unrelated PRs.
  const byRepo = groupBy(prs, (pr) => pr.repository)

  for (const repoPrs of byRepo.values()) {
    const byId = new Map(repoPrs.map((pr) => [pr.id, pr]))
    const headOwners = groupBy(repoPrs, (pr) => pr.headRefName)
    const baseOwners = groupBy(repoPrs, (pr) => pr.baseRefName)

    // A branch links its head-owner to its base-owner only when each side is
    // unique: exactly one PR has it as a head, and exactly one PR has it as
    // a base. Any other multiplicity makes the branch ambiguous —
    // duplicate `headRefName`s mean a child can't tell which one is really
    // its predecessor, and more than one PR based on the same branch means
    // the stack has forked with no single ordering — so in either case the
    // branch links nobody.
    const parentOf = new Map<string, string>() // child id -> parent id
    const childOf = new Map<string, string>() // parent id -> child id
    for (const [branch, heads] of headOwners) {
      const bases = baseOwners.get(branch)
      if (heads.length !== 1 || bases === undefined || bases.length !== 1) continue
      const [parent] = heads
      const [child] = bases
      parentOf.set(child.id, parent.id)
      childOf.set(parent.id, child.id)
    }

    const processed = new Set<string>()

    for (const pr of repoPrs) {
      if (processed.has(pr.id)) continue

      // Walk backward to the chain's root. Guarded with a `seen` set: if the
      // walk ever revisits a PR before running out of parents, the links
      // form a cycle, and without this check `rootId = parentOf.get(rootId)`
      // would loop forever instead of terminating.
      const seen = new Set<string>()
      let rootId: string | null = pr.id
      while (rootId !== null && parentOf.has(rootId)) {
        if (seen.has(rootId)) {
          rootId = null // cycle: no PR in it gets a position
          break
        }
        seen.add(rootId)
        rootId = parentOf.get(rootId) ?? null
      }

      if (rootId === null) {
        for (const id of seen) processed.add(id)
        continue
      }

      // Walk forward from the root to build the chain in order. A second
      // guard, even though this side of the graph can't cycle back on
      // itself (each PR has at most one parent slot and one child slot, so
      // the shape here is always a plain path once a root is found) — kept
      // for symmetry and so the invariant doesn't rot silently if that ever
      // changes.
      const chain: PullRequest[] = []
      const chainSeen = new Set<string>()
      let currentId: string | null = rootId
      while (currentId !== null && !chainSeen.has(currentId)) {
        chainSeen.add(currentId)
        const current = byId.get(currentId)
        if (current) chain.push(current)
        currentId = childOf.get(currentId) ?? null
      }

      for (const id of chainSeen) processed.add(id)

      // A chain of one PR is an ordinary pull request, not a stack.
      if (chain.length < 2) continue

      chain.forEach((chainPr, i) => {
        result.set(chainPr.id, { index: i + 1, total: chain.length })
      })
    }
  }

  return result
}
