import { describe, expect, it } from 'vitest'
import { mapCiStatus, mapPullRequest } from '@core/map-pr'
import type { PullRequestNode } from '@core/map-pr'

function node(overrides: Partial<PullRequestNode> = {}): PullRequestNode {
  return {
    id: 'PR_1',
    number: 7,
    title: 'Add feature',
    url: 'https://github.com/acme/web/pull/7',
    isDraft: false,
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-02T10:00:00Z',
    additions: 12,
    deletions: 3,
    reviewDecision: 'REVIEW_REQUIRED',
    author: { login: 'alice', avatarUrl: 'https://avatars.example/alice.png' },
    repository: { nameWithOwner: 'acme/web' },
    reviews: { nodes: [] },
    reviewThreads: { nodes: [] },
    commits: { nodes: [] },
    ...overrides,
  }
}

describe('mapCiStatus', () => {
  it('maps GitHub rollup states', () => {
    expect(mapCiStatus('SUCCESS')).toBe('success')
    expect(mapCiStatus('FAILURE')).toBe('failure')
    expect(mapCiStatus('ERROR')).toBe('failure')
    expect(mapCiStatus('PENDING')).toBe('pending')
    expect(mapCiStatus('EXPECTED')).toBe('pending')
  })

  it('treats a missing rollup as no CI', () => {
    expect(mapCiStatus(null)).toBe('none')
    expect(mapCiStatus(undefined)).toBe('none')
  })
})

describe('mapPullRequest', () => {
  it('copies the scalar fields and attaches the buckets', () => {
    const pr = mapPullRequest(node(), ['review-requested'])
    expect(pr.id).toBe('PR_1')
    expect(pr.number).toBe(7)
    expect(pr.repository).toBe('acme/web')
    expect(pr.authorLogin).toBe('alice')
    expect(pr.buckets).toEqual(['review-requested'])
  })

  it('falls back to ghost for a deleted author', () => {
    const pr = mapPullRequest(node({ author: null }), [])
    expect(pr.authorLogin).toBe('ghost')
    expect(pr.authorAvatarUrl).toBe('')
  })

  it('flattens reviews and drops ones with no author', () => {
    const pr = mapPullRequest(
      node({
        reviews: {
          nodes: [
            { author: { login: 'bob' }, state: 'APPROVED', submittedAt: '2026-08-02T10:00:00Z' },
            { author: null, state: 'COMMENTED', submittedAt: '2026-08-03T10:00:00Z' },
          ],
        },
      }),
      [],
    )
    expect(pr.reviews).toEqual([
      { authorLogin: 'bob', state: 'APPROVED', submittedAt: '2026-08-02T10:00:00Z' },
    ])
  })

  it('flattens review threads with their comments', () => {
    const pr = mapPullRequest(
      node({
        reviewThreads: {
          nodes: [
            {
              id: 'RT_1',
              isResolved: true,
              comments: {
                nodes: [
                  { author: { login: 'vlad' }, createdAt: '2026-08-02T10:00:00Z' },
                ],
              },
            },
          ],
        },
      }),
      [],
    )
    expect(pr.reviewThreads).toEqual([
      {
        id: 'RT_1',
        isResolved: true,
        comments: [{ authorLogin: 'vlad', createdAt: '2026-08-02T10:00:00Z' }],
      },
    ])
  })

  it('reads the last commit date and CI status', () => {
    const pr = mapPullRequest(
      node({
        commits: {
          nodes: [
            {
              commit: {
                committedDate: '2026-08-04T10:00:00Z',
                statusCheckRollup: { state: 'FAILURE' },
              },
            },
          ],
        },
      }),
      [],
    )
    expect(pr.lastCommitPushedAt).toBe('2026-08-04T10:00:00Z')
    expect(pr.ciStatus).toBe('failure')
  })

  it('falls back to createdAt when the commit list is empty', () => {
    const pr = mapPullRequest(node(), [])
    expect(pr.lastCommitPushedAt).toBe('2026-08-01T10:00:00Z')
    expect(pr.ciStatus).toBe('none')
  })
})
