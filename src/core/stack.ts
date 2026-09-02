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

    // Build the parent/child relation permissively: a branch links its
    // head-owner(s) to every PR based on it. This can give a PR more than
    // one parent (two PRs sharing a `headRefName`) or more than one child (a
    // fork — several PRs based on the same branch). That's intentional: the
    // ambiguity is caught below, by disqualifying the whole connected
    // component, rather than guessed around branch by branch.
    const headIndex = groupBy(repoPrs, (pr) => pr.headRefName)
    const parentsOf = new Map<string, string[]>() // pr id -> parent ids
    const childrenOf = new Map<string, string[]>() // pr id -> child ids
    for (const pr of repoPrs) {
      const parents = headIndex.get(pr.baseRefName)
      if (parents === undefined) continue
      parentsOf.set(
        pr.id,
        parents.map((p) => p.id),
      )
      for (const parent of parents) {
        const children = childrenOf.get(parent.id)
        if (children) children.push(pr.id)
        else childrenOf.set(parent.id, [pr.id])
      }
    }

    const visited = new Set<string>()

    for (const pr of repoPrs) {
      if (visited.has(pr.id)) continue

      // Connected component over the relation above, treated as undirected:
      // a PR reachable only through someone else's fork or duplicate-head
      // branch must still be poisoned by it, not just the offending edge.
      const component: string[] = []
      const queue = [pr.id]
      visited.add(pr.id)
      while (queue.length > 0) {
        const id = queue.pop()
        if (id === undefined) break
        component.push(id)
        const neighbours = [...(parentsOf.get(id) ?? []), ...(childrenOf.get(id) ?? [])]
        for (const neighbour of neighbours) {
          if (!visited.has(neighbour)) {
            visited.add(neighbour)
            queue.push(neighbour)
          }
        }
      }

      // The component qualifies as a stack only if it's a simple chain:
      // every PR has at most one parent and at most one child. A duplicate
      // `headRefName` gives some PR two parents; a fork gives some PR two
      // children. Either disqualifies every PR in the component, not just
      // the one directly involved — a number that might be wrong is worse
      // than no number.
      const isSimpleChain = component.every((id) => {
        const parentCount = parentsOf.get(id)?.length ?? 0
        const childCount = childrenOf.get(id)?.length ?? 0
        return parentCount <= 1 && childCount <= 1
      })
      if (!isSimpleChain) continue

      const root = component.find((id) => (parentsOf.get(id)?.length ?? 0) === 0)
      // No root means every PR in the component has exactly one parent —
      // the links form a cycle, which has no start to walk from. Guarded
      // explicitly: without this check there would be nothing stopping an
      // attempt to walk forward from an arbitrary member, which would loop
      // forever chasing `childrenOf` around the ring.
      if (root === undefined) continue

      // Walk forward from the root to order the chain. `seen` guards
      // against re-entering an already-visited PR — provably unreachable
      // once `isSimpleChain` holds (no branching means no way back to a
      // node already passed), but kept so the guard doesn't quietly depend
      // on that invariant holding forever.
      const chain: PullRequest[] = []
      const seen = new Set<string>()
      let currentId: string | undefined = root
      while (currentId !== undefined && !seen.has(currentId)) {
        seen.add(currentId)
        const current = byId.get(currentId)
        if (current) chain.push(current)
        currentId = childrenOf.get(currentId)?.[0]
      }

      // A chain of one PR is an ordinary pull request, not a stack.
      if (chain.length < 2) continue

      chain.forEach((chainPr, i) => {
        result.set(chainPr.id, { index: i + 1, total: chain.length })
      })
    }
  }

  return result
}
