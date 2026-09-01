import { isSnoozeActive } from '@core/snooze'
import type { Snooze } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { makeComment, makePullRequest, makeThread } from './test-factory'

const ME = 'vlad'
const NOW = '2026-08-10T12:00:00Z'

describe('isSnoozeActive — until-time', () => {
  const snooze: Snooze = {
    prId: 'PR_1',
    type: 'until-time',
    snoozedAt: '2026-08-10T10:00:00Z',
    until: '2026-08-10T14:00:00Z',
  }

  it('is active before the deadline', () => {
    expect(isSnoozeActive(makePullRequest(), snooze, ME, NOW)).toBe(true)
  })

  it('expires at the deadline', () => {
    const later = '2026-08-10T14:00:00Z'
    expect(isSnoozeActive(makePullRequest(), snooze, ME, later)).toBe(false)
  })

  it('is inactive when `until` is missing', () => {
    const broken: Snooze = { ...snooze, until: undefined }
    expect(isSnoozeActive(makePullRequest(), broken, ME, NOW)).toBe(false)
  })
})

describe('isSnoozeActive — until-activity', () => {
  const snooze: Snooze = {
    prId: 'PR_1',
    type: 'until-activity',
    snoozedAt: '2026-08-10T10:00:00Z',
  }

  it('stays asleep when nothing happened', () => {
    const pr = makePullRequest({ lastCommitPushedAt: '2026-08-09T10:00:00Z' })
    expect(isSnoozeActive(pr, snooze, ME, NOW)).toBe(true)
  })

  it('wakes on a reply from someone else in a thread I am in', () => {
    const pr = makePullRequest({
      lastCommitPushedAt: '2026-08-09T10:00:00Z',
      reviewThreads: [
        makeThread({
          comments: [
            makeComment(ME, '2026-08-09T10:00:00Z'),
            makeComment('alice', '2026-08-10T11:00:00Z'),
          ],
        }),
      ],
    })
    expect(isSnoozeActive(pr, snooze, ME, NOW)).toBe(false)
  })

  it('wakes on a commit newer than the snooze', () => {
    const pr = makePullRequest({ lastCommitPushedAt: '2026-08-10T11:00:00Z' })
    expect(isSnoozeActive(pr, snooze, ME, NOW)).toBe(false)
  })

  it('stays asleep when the only new comment is my own', () => {
    const pr = makePullRequest({
      lastCommitPushedAt: '2026-08-09T10:00:00Z',
      reviewThreads: [
        makeThread({
          comments: [
            makeComment(ME, '2026-08-09T10:00:00Z'),
            makeComment(ME, '2026-08-10T11:00:00Z'),
          ],
        }),
      ],
    })
    expect(isSnoozeActive(pr, snooze, ME, NOW)).toBe(true)
  })

  it('stays asleep when the reply landed in a resolved thread', () => {
    const pr = makePullRequest({
      lastCommitPushedAt: '2026-08-09T10:00:00Z',
      reviewThreads: [
        makeThread({
          isResolved: true,
          comments: [
            makeComment(ME, '2026-08-09T10:00:00Z'),
            makeComment('alice', '2026-08-10T11:00:00Z'),
          ],
        }),
      ],
    })
    expect(isSnoozeActive(pr, snooze, ME, NOW)).toBe(true)
  })

  it('stays asleep when the newest commit exactly equals snoozedAt', () => {
    const pr = makePullRequest({ lastCommitPushedAt: '2026-08-10T10:00:00Z' })
    expect(isSnoozeActive(pr, snooze, ME, NOW)).toBe(true)
  })
})

describe('isSnoozeActive — unknown legacy type', () => {
  it('treats a type no longer in the union as expired', () => {
    const snooze = {
      prId: 'PR_1',
      type: 'until-something-removed',
      snoozedAt: '2026-08-10T10:00:00Z',
    } as unknown as Snooze
    expect(isSnoozeActive(makePullRequest(), snooze, ME, NOW)).toBe(false)
  })
})
