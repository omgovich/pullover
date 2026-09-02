import { computeStackPositions } from '@core/stack'
import { makePullRequest } from '@core/test-factory'
import type { PullRequest } from '@shared/types'
import { describe, expect, it } from 'vitest'

/** A minimal open PR for stack fixtures: only the branch fields matter here. */
function pr(overrides: Partial<PullRequest> & { id: string }): PullRequest {
  return makePullRequest(overrides)
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

    expect(positions.get('PR_641')).toEqual({ index: 1, total: 8 })
    expect(positions.get('PR_642')).toEqual({ index: 2, total: 8 })
    expect(positions.get('PR_647')).toEqual({ index: 3, total: 8 })
    expect(positions.get('PR_648')).toEqual({ index: 4, total: 8 })
    expect(positions.get('PR_643')).toEqual({ index: 5, total: 8 })
    expect(positions.get('PR_644')).toEqual({ index: 6, total: 8 })
    expect(positions.get('PR_645')).toEqual({ index: 7, total: 8 })
    expect(positions.get('PR_650')).toEqual({ index: 8, total: 8 })
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

  it('still positions the unambiguous part of a stack ahead of a fork', () => {
    // A -> B -> C, then C's branch forks into D and E. The A/B/C prefix is
    // still a single unambiguous chain and keeps its numbers; only the
    // forked continuation is withheld.
    const prs = [
      pr({ id: 'PR_a', headRefName: 'a', baseRefName: 'main' }),
      pr({ id: 'PR_b', headRefName: 'b', baseRefName: 'a' }),
      pr({ id: 'PR_c', headRefName: 'c', baseRefName: 'b' }),
      pr({ id: 'PR_d', headRefName: 'd', baseRefName: 'c' }),
      pr({ id: 'PR_e', headRefName: 'e', baseRefName: 'c' }),
    ]
    const positions = computeStackPositions(prs)
    expect(positions.get('PR_a')).toEqual({ index: 1, total: 3 })
    expect(positions.get('PR_b')).toEqual({ index: 2, total: 3 })
    expect(positions.get('PR_c')).toEqual({ index: 3, total: 3 })
    expect(positions.has('PR_d')).toBe(false)
    expect(positions.has('PR_e')).toBe(false)
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
    expect(positions.get('PR_web_1')).toEqual({ index: 1, total: 2 })
    expect(positions.get('PR_web_2')).toEqual({ index: 2, total: 2 })
    // Alone in its own repo, so it's an ordinary PR, not a stack.
    expect(positions.has('PR_other_1')).toBe(false)
  })

  it('terminates and gives no position when the links form a cycle', () => {
    // A -> B -> C -> A. Every PR in this component has a parent (each other),
    // so without the visited-set guard in the backward root-finding walk,
    // repeatedly following `parentOf` from any of them never reaches a PR
    // with no parent and loops forever. This fixture is built specifically
    // so that walk cannot terminate on its own.
    const prs = [
      pr({ id: 'PR_a', headRefName: 'a', baseRefName: 'c' }),
      pr({ id: 'PR_b', headRefName: 'b', baseRefName: 'a' }),
      pr({ id: 'PR_c', headRefName: 'c', baseRefName: 'b' }),
    ]

    // Without the visited-set guard in `computeStackPositions`'s backward
    // root-finding walk, this call hangs the process rather than returning
    // (verified by hand: temporarily removing the guard makes this exact
    // test hang instead of failing) — a synchronous infinite loop blocks the
    // event loop, so no test-level timeout can catch it after the fact.
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
    expect(positions.get('PR_642')).toEqual({ index: 1, total: 2 })
    expect(positions.get('PR_647')).toEqual({ index: 2, total: 2 })
  })
})
