import type { ClassifiedPullRequest, PullRequest, StackPosition } from '@shared/types'

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

/** A pull request row, with the stack line it draws inside its own bounds. */
export interface StackCardRow {
  item: ClassifiedPullRequest
  /** Line from the row's top edge down to the avatar. */
  lineAbove: boolean
  /** Line from the avatar down to the row's bottom edge. */
  lineBelow: boolean
  /**
   * Whether that line spans members that aren't shown, rather than joining
   * the neighbouring row. Drawn dotted; see `StackConnector` for why it stays
   * inside the segment the row already has.
   */
  gapAbove: boolean
  gapBelow: boolean
  /**
   * Whether that segment has nothing to meet: no neighbouring row draws a
   * line back towards it. Rendered as a fade to transparent rather than
   * dots, which need a neighbour to land against to read as a break.
   */
  gapAboveOpen: boolean
  gapBelowOpen: boolean
}

/**
 * Lays a section out for rendering, from a list already arranged by
 * `orderSection` (so a stack's shown members sit contiguously, ascending by
 * `index`).
 *
 * A member draws its line upward unless it is the chain's first and downward
 * unless it is its last; that line is dotted where the chain skips members
 * between two shown rows, and faded where it carries on past the list.
 *
 * Two rows can disagree about the segment between them — a chain's top row
 * followed by another chain's middle draws nothing below and a fade above —
 * but never in a way that shows: a solid segment always faces a solid one.
 */
export function sectionRows(ordered: ClassifiedPullRequest[]): StackCardRow[] {
  /** Whether the row at `i` is the chain member `stack` expects at `index`. */
  function adjoins(i: number, stack: StackPosition, index: number): boolean {
    const other = ordered[i]?.stack
    return other != null && other.id === stack.id && other.index === index
  }

  /** Whether the row at `i` belongs to `stack` at all, shown or omitted. */
  function sameChain(i: number, stack: StackPosition): boolean {
    return ordered[i]?.stack?.id === stack.id
  }

  return ordered.map((item, i) => {
    const stack = item.stack
    if (stack === null) {
      return {
        item,
        lineAbove: false,
        lineBelow: false,
        gapAbove: false,
        gapBelow: false,
        gapAboveOpen: false,
        gapBelowOpen: false,
      }
    }

    const gapAbove = stack.index > 1 && !adjoins(i - 1, stack, stack.index - 1)
    const gapBelow = stack.index < stack.total && !adjoins(i + 1, stack, stack.index + 1)

    return {
      item,
      lineAbove: stack.index > 1,
      lineBelow: stack.index < stack.total,
      gapAbove,
      gapBelow,
      gapAboveOpen: gapAbove && !sameChain(i - 1, stack),
      gapBelowOpen: gapBelow && !sameChain(i + 1, stack),
    }
  })
}
