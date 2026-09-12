import { describeInbox } from '@core/agent-view'
import { makePullRequest } from '@core/test-factory'
import type { InboxSnapshot } from '@shared/ipc'
import type { Category, ClassifiedPullRequest, PullRequest } from '@shared/types'
import { describe, expect, it } from 'vitest'

function item(
  category: Category,
  pr: Partial<PullRequest> = {},
  rest: Partial<Omit<ClassifiedPullRequest, 'pr' | 'category'>> = {},
): ClassifiedPullRequest {
  return {
    pr: makePullRequest(pr),
    category,
    reason: 'Review requested',
    waitingSince: category === 'waiting' ? null : '2026-08-01T10:00:00Z',
    isSnoozed: false,
    stack: null,
    ...rest,
  }
}

function snapshot(
  items: ClassifiedPullRequest[],
  rest: Partial<InboxSnapshot> = {},
): InboxSnapshot {
  return {
    status: 'ready',
    items,
    attentionCount: items.filter((i) => i.category !== 'waiting').length,
    lastUpdatedAt: '2026-08-01T12:00:00Z',
    errorMessage: null,
    myLogin: 'vlad',
    knownRepositories: ['acme/web'],
    ...rest,
  }
}

describe('describeInbox', () => {
  it('groups items into sections in display order and skips empty sections', () => {
    const result = describeInbox(
      snapshot([
        item('my-pr-action', { id: 'PR_2', number: 2 }),
        item('needs-review', { id: 'PR_1', number: 1 }),
        item('needs-review', { id: 'PR_3', number: 3 }),
      ]),
      { includeWaiting: false },
    )
    expect(result.sections.map((s) => s.category)).toEqual(['needs-review', 'my-pr-action'])
    expect(result.sections[0]?.title).toBe('Needs your review')
    expect(result.sections[0]?.pullRequests.map((p) => p.number)).toEqual([1, 3])
  })

  it('leaves the waiting section out unless asked for it', () => {
    const items = [
      item('needs-review'),
      item('waiting', { id: 'PR_2' }, { reason: 'Waiting on author' }),
    ]
    expect(describeInbox(snapshot(items), { includeWaiting: false }).sections).toHaveLength(1)
    expect(
      describeInbox(snapshot(items), { includeWaiting: true }).sections.map((s) => s.category),
    ).toEqual(['needs-review', 'waiting'])
  })

  it('carries the header fields across', () => {
    const result = describeInbox(snapshot([item('needs-review')]), { includeWaiting: false })
    expect(result).toMatchObject({
      status: 'ready',
      lastUpdatedAt: '2026-08-01T12:00:00Z',
      myLogin: 'vlad',
      attentionCount: 1,
      notice: null,
    })
  })

  it('describes a pull request without its avatar', () => {
    const result = describeInbox(
      snapshot([
        item(
          'needs-review',
          {
            repository: 'acme/web',
            number: 12,
            title: 'Retry writes',
            authorLogin: 'kate',
            headRefName: 'kate/retry',
            baseRefName: 'main',
            additions: 120,
            deletions: 34,
          },
          { stack: { id: 'PR_root', index: 2, total: 3 } },
        ),
      ]),
      { includeWaiting: false },
    )
    expect(result.sections[0]?.pullRequests[0]).toEqual({
      repository: 'acme/web',
      number: 12,
      title: 'Retry writes',
      url: 'https://github.com/acme/web/pull/1',
      author: 'kate',
      category: 'needs-review',
      reason: 'Review requested',
      waitingSince: '2026-08-01T10:00:00Z',
      isSnoozed: false,
      stack: { index: 2, total: 3 },
      branch: { head: 'kate/retry', base: 'main' },
      isDraft: false,
      ci: 'success',
      reviewDecision: 'REVIEW_REQUIRED',
      mergeable: 'MERGEABLE',
      size: { additions: 120, deletions: 34 },
      updatedAt: '2026-08-01T10:00:00Z',
    })
    expect(JSON.stringify(result)).not.toContain('avatars.example')
  })

  it('tells a signed-out agent where to sign in', () => {
    const result = describeInbox(
      snapshot([], { status: 'signed-out', myLogin: null, lastUpdatedAt: null }),
      { includeWaiting: false },
    )
    expect(result.notice).toMatch(/signed out/i)
    expect(result.sections).toEqual([])
  })

  it('relays the error message when the last refresh failed', () => {
    const result = describeInbox(
      snapshot([item('needs-review')], { status: 'error', errorMessage: 'GitHub is down' }),
      { includeWaiting: false },
    )
    expect(result.notice).toBe('GitHub is down')
    expect(result.sections).toHaveLength(1)
  })

  it('says the list is the last completed one while a refresh runs', () => {
    const result = describeInbox(snapshot([], { status: 'loading' }), { includeWaiting: false })
    expect(result.notice).toMatch(/last completed/i)
  })
})
