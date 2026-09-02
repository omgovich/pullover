import {
  type Connector,
  computeStackPositions,
  orderSection,
  type StackPosition,
  stackRows,
} from '@core/stack'
import { makePullRequest } from '@core/test-factory'
import type { ClassifiedPullRequest, PullRequest } from '@shared/types'
import { describe, expect, it } from 'vitest'

/** A minimal open PR for stack fixtures: only the branch fields matter here. */
function pr(overrides: Partial<PullRequest> & { id: string }): PullRequest {
  return makePullRequest(overrides)
}

/** A minimal classified PR for ordering/connector fixtures: category and
 * reason never matter to `orderSection` or `stackRows`. */
function classified(
  id: string,
  stack: StackPosition | null,
  overrides: Partial<PullRequest> = {},
): ClassifiedPullRequest {
  return {
    pr: makePullRequest({ id, ...overrides }),
    category: 'needs-review',
    reason: '',
    isSnoozed: false,
    stack,
  }
}

describe('computeStackPositions', () => {
  it("positions a real eight-deep stack from the owner's account", () => {
    // Real data (see stack-brief.md): the owner had been typing "(search
    // N/8)" into these titles by hand, and this fixture's computed positions
    // must match what he wrote. Deliberately out of order and interleaved
    // with an unrelated PR to prove the result doesn't depend on input order
    // or on any other PR that happens to be in the same fetch.
    const prs = [
      pr({
        id: 'PR_650',
        number: 650,
        headRefName: 'text-search-e2e',
        baseRefName: 'text-search-demo',
      }),
      pr({
        id: 'PR_642',
        number: 642,
        headRefName: 'text-search-controller',
        baseRefName: 'text-search-matching',
      }),
      pr({
        id: 'PR_643',
        number: 643,
        headRefName: 'text-search-react-api',
        baseRefName: 'text-search-options',
      }),
      pr({ id: 'PR_999', number: 999, headRefName: 'unrelated-branch', baseRefName: 'main' }),
      pr({ id: 'PR_641', number: 641, headRefName: 'text-search-matching', baseRefName: 'main' }),
      pr({
        id: 'PR_648',
        number: 648,
        headRefName: 'text-search-options',
        baseRefName: 'text-search-perf',
      }),
      pr({
        id: 'PR_644',
        number: 644,
        headRefName: 'text-search-highlights',
        baseRefName: 'text-search-react-api',
      }),
      pr({
        id: 'PR_647',
        number: 647,
        headRefName: 'text-search-perf',
        baseRefName: 'text-search-controller',
      }),
      pr({
        id: 'PR_645',
        number: 645,
        headRefName: 'text-search-demo',
        baseRefName: 'text-search-highlights',
      }),
    ]

    const positions = computeStackPositions(prs)

    // The root PR's id, #641, identifies the whole chain.
    expect(positions.get('PR_641')).toEqual({ id: 'PR_641', index: 1, total: 8 })
    expect(positions.get('PR_642')).toEqual({ id: 'PR_641', index: 2, total: 8 })
    expect(positions.get('PR_647')).toEqual({ id: 'PR_641', index: 3, total: 8 })
    expect(positions.get('PR_648')).toEqual({ id: 'PR_641', index: 4, total: 8 })
    expect(positions.get('PR_643')).toEqual({ id: 'PR_641', index: 5, total: 8 })
    expect(positions.get('PR_644')).toEqual({ id: 'PR_641', index: 6, total: 8 })
    expect(positions.get('PR_645')).toEqual({ id: 'PR_641', index: 7, total: 8 })
    expect(positions.get('PR_650')).toEqual({ id: 'PR_641', index: 8, total: 8 })
    // The unrelated PR isn't touched.
    expect(positions.has('PR_999')).toBe(false)
  })

  it('gives no position to a lone pull request (chain of one)', () => {
    const prs = [pr({ id: 'PR_1', headRefName: 'feature-x', baseRefName: 'main' })]
    expect(computeStackPositions(prs)).toEqual(new Map())
  })

  it('gives no position when a stack forks', () => {
    // Two PRs both stacked on the same branch: the base has more than one
    // PR built on it, so there's no single ordering to pick.
    const prs = [
      pr({ id: 'PR_a', headRefName: 'x', baseRefName: 'main' }),
      pr({ id: 'PR_b', headRefName: 'y1', baseRefName: 'x' }),
      pr({ id: 'PR_c', headRefName: 'y2', baseRefName: 'x' }),
    ]
    const positions = computeStackPositions(prs)
    expect(positions.has('PR_a')).toBe(false)
    expect(positions.has('PR_b')).toBe(false)
    expect(positions.has('PR_c')).toBe(false)
  })

  it('withholds the whole component when a stack forks partway up', () => {
    // A -> B -> C, then C forks into D and E. Nothing here gets a number,
    // including the unambiguous A/B/C prefix: calling C "3/3" would say it
    // is the top of the stack when two pull requests sit on top of it.
    const prs = [
      pr({ id: 'PR_a', headRefName: 'a', baseRefName: 'main' }),
      pr({ id: 'PR_b', headRefName: 'b', baseRefName: 'a' }),
      pr({ id: 'PR_c', headRefName: 'c', baseRefName: 'b' }),
      pr({ id: 'PR_d', headRefName: 'd', baseRefName: 'c' }),
      pr({ id: 'PR_e', headRefName: 'e', baseRefName: 'c' }),
    ]
    const positions = computeStackPositions(prs)
    for (const id of ['PR_a', 'PR_b', 'PR_c', 'PR_d', 'PR_e']) {
      expect(positions.has(id)).toBe(false)
    }
  })

  it('leaves a separate linear stack in the same repo untouched by a fork', () => {
    // The fork above must disqualify its own component only — an unrelated
    // chain beside it still gets its numbers.
    const prs = [
      pr({ id: 'PR_a', headRefName: 'a', baseRefName: 'main' }),
      pr({ id: 'PR_d', headRefName: 'd', baseRefName: 'a' }),
      pr({ id: 'PR_e', headRefName: 'e', baseRefName: 'a' }),
      pr({ id: 'PR_x', headRefName: 'x', baseRefName: 'main' }),
      pr({ id: 'PR_y', headRefName: 'y', baseRefName: 'x' }),
    ]
    const positions = computeStackPositions(prs)
    expect(positions.has('PR_a')).toBe(false)
    expect(positions.get('PR_x')).toEqual({ id: 'PR_x', index: 1, total: 2 })
    expect(positions.get('PR_y')).toEqual({ id: 'PR_x', index: 2, total: 2 })
  })

  it('gives two separate stacks of equal length in one repository different ids', () => {
    const prs = [
      pr({ id: 'PR_a1', headRefName: 'a1', baseRefName: 'main' }),
      pr({ id: 'PR_a2', headRefName: 'a2', baseRefName: 'a1' }),
      pr({ id: 'PR_b1', headRefName: 'b1', baseRefName: 'main' }),
      pr({ id: 'PR_b2', headRefName: 'b2', baseRefName: 'b1' }),
    ]
    const positions = computeStackPositions(prs)

    const stackA = positions.get('PR_a1')
    const stackB = positions.get('PR_b1')
    expect(stackA).toBeDefined()
    expect(stackB).toBeDefined()
    // Same shape (both 1/2, 2/2) but must not be mistaken for one another.
    expect(stackA?.id).not.toBe(stackB?.id)

    // Every member of one stack shares that stack's id.
    expect(positions.get('PR_a1')?.id).toBe(stackA?.id)
    expect(positions.get('PR_a2')?.id).toBe(stackA?.id)
    expect(positions.get('PR_b1')?.id).toBe(stackB?.id)
    expect(positions.get('PR_b2')?.id).toBe(stackB?.id)
  })

  it('gives no position when two pull requests share a headRefName', () => {
    // PR_a and PR_a2 both claim to be the head of branch "dup" — a child
    // based on "dup" can't tell which is really its predecessor, and this
    // must not corrupt the rest of the walk (there's nothing else here to
    // corrupt, which is the point: everyone touching the ambiguous branch
    // simply gets no position).
    const prs = [
      pr({ id: 'PR_a', headRefName: 'dup', baseRefName: 'main' }),
      pr({ id: 'PR_a2', headRefName: 'dup', baseRefName: 'main' }),
      pr({ id: 'PR_b', headRefName: 'next', baseRefName: 'dup' }),
    ]
    const positions = computeStackPositions(prs)
    expect(positions.has('PR_a')).toBe(false)
    expect(positions.has('PR_a2')).toBe(false)
    expect(positions.has('PR_b')).toBe(false)
  })

  it('does not link two pull requests across different repositories that happen to share branch names', () => {
    const prs = [
      pr({ id: 'PR_web_1', repository: 'acme/web', headRefName: 'x', baseRefName: 'main' }),
      pr({ id: 'PR_web_2', repository: 'acme/web', headRefName: 'y', baseRefName: 'x' }),
      // Same branch names, different repo, no relation to the above.
      pr({ id: 'PR_other_1', repository: 'acme/other', headRefName: 'x', baseRefName: 'main' }),
    ]
    const positions = computeStackPositions(prs)
    expect(positions.get('PR_web_1')).toEqual({ id: 'PR_web_1', index: 1, total: 2 })
    expect(positions.get('PR_web_2')).toEqual({ id: 'PR_web_1', index: 2, total: 2 })
    // Alone in its own repo, so it's an ordinary PR, not a stack.
    expect(positions.has('PR_other_1')).toBe(false)
  })

  it('terminates and gives no position when the links form a cycle', () => {
    // A -> B -> C -> A. Every PR in this component has exactly one parent
    // (each other) and one child, so it passes the "simple chain" shape
    // check, yet the component has no PR with zero parents to serve as a
    // root -- that absence is what marks it a cycle rather than a chain.
    // Without that explicit check, an implementation tempted to fall back to
    // an arbitrary starting point and walk `childrenOf` forward from it
    // would never run out of pointers to follow (verified by hand:
    // temporarily doing exactly that makes this fixture's walk grow without
    // bound instead of terminating) -- a synchronous infinite loop blocks
    // the event loop, so no test-level timeout can catch it after the fact.
    const prs = [
      pr({ id: 'PR_a', headRefName: 'a', baseRefName: 'c' }),
      pr({ id: 'PR_b', headRefName: 'b', baseRefName: 'a' }),
      pr({ id: 'PR_c', headRefName: 'c', baseRefName: 'b' }),
    ]

    const positions = computeStackPositions(prs)

    expect(positions.has('PR_a')).toBe(false)
    expect(positions.has('PR_b')).toBe(false)
    expect(positions.has('PR_c')).toBe(false)
  })

  it('reads a partially-merged stack as the shorter remaining chain', () => {
    // Only open PRs are ever fetched, so when #641 (the former root) merges
    // and drops out of the fetch, #642 simply becomes the new root of a
    // 7-long remaining chain — not a bug, just fewer open PRs.
    const prs = [
      pr({
        id: 'PR_642',
        headRefName: 'text-search-controller',
        baseRefName: 'text-search-matching',
      }),
      pr({ id: 'PR_647', headRefName: 'text-search-perf', baseRefName: 'text-search-controller' }),
    ]
    const positions = computeStackPositions(prs)
    expect(positions.get('PR_642')).toEqual({ id: 'PR_642', index: 1, total: 2 })
    expect(positions.get('PR_647')).toEqual({ id: 'PR_642', index: 2, total: 2 })
  })
})

describe('orderSection', () => {
  it('leaves pull requests with no stack in place', () => {
    const items = [classified('PR_a', null), classified('PR_b', null), classified('PR_c', null)]
    expect(orderSection(items)).toEqual(items)
  })

  it("gathers a stack's members into one contiguous run at the earliest member's position", () => {
    // #2 of the stack appears first; #1 and #3 are scattered after it and
    // after an unrelated PR. The whole stack should collapse to where #2
    // was, ordered ascending by index, with the unrelated PR undisturbed.
    const items = [
      classified('PR_2', { id: 'stack-1', index: 2, total: 3 }),
      classified('PR_x', null),
      classified('PR_1', { id: 'stack-1', index: 1, total: 3 }),
      classified('PR_3', { id: 'stack-1', index: 3, total: 3 }),
    ]

    const ordered = orderSection(items)

    expect(ordered.map((item) => item.pr.id)).toEqual(['PR_1', 'PR_2', 'PR_3', 'PR_x'])
  })

  it('keeps a category-then-recency order between stacks and lets the earliest-appearing stack float up', () => {
    const items = [
      classified('PR_b1', { id: 'stack-b', index: 1, total: 2 }),
      classified('PR_a2', { id: 'stack-a', index: 2, total: 2 }),
      classified('PR_b2', { id: 'stack-b', index: 2, total: 2 }),
      classified('PR_a1', { id: 'stack-a', index: 1, total: 2 }),
    ]

    const ordered = orderSection(items)

    // Stack "b" appeared first in the incoming order, so it keeps that lead
    // position. Stack "a" collapses to where its earliest-appearing member
    // (#2, at index 1 of the input) was, sorted ascending by index.
    expect(ordered.map((item) => item.pr.id)).toEqual(['PR_b1', 'PR_b2', 'PR_a1', 'PR_a2'])
  })
})

describe('stackRows', () => {
  function rowsOf(items: ClassifiedPullRequest[]): Array<[string, Connector, Connector]> {
    return stackRows(items).map((row) => [row.item.pr.id, row.above, row.below])
  }

  it('gives a full, unbroken stack a line at every internal join and nothing at the ends', () => {
    const items = [1, 2, 3, 4].map((index) =>
      classified(`PR_${index}`, { id: 'stack-1', index, total: 4 }),
    )

    expect(rowsOf(items)).toEqual([
      ['PR_1', 'none', 'line'],
      ['PR_2', 'line', 'line'],
      ['PR_3', 'line', 'line'],
      ['PR_4', 'line', 'none'],
    ])
  })

  it('opens a gap where the middle of a stack is missing from the list', () => {
    // 1, 2, 4, 5 of a 5-long stack: #3 is hidden.
    const items = [1, 2, 4, 5].map((index) =>
      classified(`PR_${index}`, { id: 'stack-1', index, total: 5 }),
    )

    expect(rowsOf(items)).toEqual([
      ['PR_1', 'none', 'line'],
      ['PR_2', 'line', 'gap'],
      ['PR_4', 'gap', 'line'],
      ['PR_5', 'line', 'none'],
    ])
  })

  it('opens a gap above a stack that starts at 2', () => {
    const items = [2, 3].map((index) =>
      classified(`PR_${index}`, { id: 'stack-1', index, total: 4 }),
    )

    // total is 4, so #3's `below` is also a gap (#4 exists but isn't shown)
    // — the case under test is #2's `above`.
    expect(rowsOf(items)).toEqual([
      ['PR_2', 'gap', 'line'],
      ['PR_3', 'line', 'gap'],
    ])
  })

  it('opens a gap below a stack that ends before its top', () => {
    const items = [1, 2].map((index) =>
      classified(`PR_${index}`, { id: 'stack-1', index, total: 4 }),
    )

    expect(rowsOf(items)).toEqual([
      ['PR_1', 'none', 'line'],
      ['PR_2', 'line', 'gap'],
    ])
  })

  it('draws nothing around a pull request with no stack', () => {
    const items = [classified('PR_lone', null)]
    expect(rowsOf(items)).toEqual([['PR_lone', 'none', 'none']])
  })

  it('draws nothing between two stacks placed back to back', () => {
    const items = [
      classified('PR_a1', { id: 'stack-a', index: 1, total: 2 }),
      classified('PR_a2', { id: 'stack-a', index: 2, total: 2 }),
      classified('PR_b1', { id: 'stack-b', index: 1, total: 2 }),
      classified('PR_b2', { id: 'stack-b', index: 2, total: 2 }),
    ]

    expect(rowsOf(items)).toEqual([
      ['PR_a1', 'none', 'line'],
      ['PR_a2', 'line', 'none'],
      ['PR_b1', 'none', 'line'],
      ['PR_b2', 'line', 'none'],
    ])
  })

  it('never lets adjacent rows disagree about the connector between them', () => {
    const items = [1, 2, 4, 6, 7].map((index) =>
      classified(`PR_${index}`, { id: 'stack-1', index, total: 7 }),
    )

    const rows = stackRows(items)
    for (let i = 0; i < rows.length - 1; i++) {
      expect(rows[i].below).toBe(rows[i + 1].above)
    }
  })

  it('the worked example: a stack of 7 showing only 2, 3, 5, 6, 7', () => {
    const items = [2, 3, 5, 6, 7].map((index) =>
      classified(`PR_${index}`, { id: 'stack-1', index, total: 7 }),
    )

    expect(rowsOf(items)).toEqual([
      ['PR_2', 'gap', 'line'],
      ['PR_3', 'line', 'gap'],
      ['PR_5', 'gap', 'line'],
      ['PR_6', 'line', 'line'],
      ['PR_7', 'line', 'none'],
    ])
  })
})
