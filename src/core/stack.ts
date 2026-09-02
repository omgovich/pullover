import type { ClassifiedPullRequest, PullRequest } from '@shared/types'

export interface StackPosition {
  /**
   * Identifies the stack this position belongs to, so two different chains
   * of the same length can be told apart. The root pull request's id is the
   * natural choice — every member of a chain walks back to the same root.
   */
  id: string
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
        result.set(chainPr.id, { id: root, index: i + 1, total: chain.length })
      })
    }
  }

  return result
}

/**
 * Reorders `items` so each stack's members sit together, in one contiguous
 * run, ascending by `index` — the incoming order is otherwise preserved
 * (that order is already the classifier's category-then-recency sort).
 *
 * A stack takes the position of its earliest-appearing member, so the most
 * relevant stack still floats to the top of its section. Pull requests with
 * no stack keep their place. Ordering within a section is a display
 * concern, so this stays out of the classifier.
 */
export function orderSection(items: ClassifiedPullRequest[]): ClassifiedPullRequest[] {
  const groups = new Map<string, ClassifiedPullRequest[]>()
  for (const item of items) {
    const id = item.stack?.id
    if (id === undefined) continue
    const group = groups.get(id)
    if (group) group.push(item)
    else groups.set(id, [item])
  }
  for (const group of groups.values()) {
    group.sort((a, b) => (a.stack?.index ?? 0) - (b.stack?.index ?? 0))
  }

  const emitted = new Set<string>()
  const result: ClassifiedPullRequest[] = []
  for (const item of items) {
    const id = item.stack?.id
    if (id === undefined) {
      result.push(item)
      continue
    }
    if (emitted.has(id)) continue
    emitted.add(id)
    // Non-null: `groups` was built from this same list, keyed by this id.
    const group = groups.get(id)
    if (group) result.push(...group)
  }
  return result
}

/**
 * How a stack row connects to its neighbour in that direction, drawn as a
 * vertical line behind the avatars.
 *
 * - `none` — nothing to connect to: not in a stack, or the very top/bottom
 *   of the chain (`1/N` looking up, `N/N` looking down).
 * - `line` — the adjacent chain member is the neighbouring row.
 * - `gap` — chain members exist in that direction but aren't shown.
 */
export type Connector = 'none' | 'line' | 'gap'

export interface StackRow {
  item: ClassifiedPullRequest
  above: Connector
  below: Connector
}

/**
 * Derives the connector each row draws above and below itself, from a list
 * already arranged by `orderSection` (so a stack's members, if any are
 * shown, sit contiguously and ascending by `index`).
 */
export function stackRows(ordered: ClassifiedPullRequest[]): StackRow[] {
  return ordered.map((item, i) => {
    const stack = item.stack
    if (stack === null) return { item, above: 'none', below: 'none' }

    const prev = ordered[i - 1]
    const next = ordered[i + 1]

    const above: Connector =
      stack.index === 1
        ? 'none'
        : prev !== undefined && prev.stack?.id === stack.id && prev.stack.index === stack.index - 1
          ? 'line'
          : 'gap'

    const below: Connector =
      stack.index === stack.total
        ? 'none'
        : next !== undefined && next.stack?.id === stack.id && next.stack.index === stack.index + 1
          ? 'line'
          : 'gap'

    return { item, above, below }
  })
}
