import { describe, expect, it } from 'vitest'
import { isSnoozeActive } from '@core/snooze'
import type { Snooze } from '@shared/types'
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

describe('isSnoozeActive — until-new-commits', () => {
  const snooze: Snooze = {
    prId: 'PR_1',
    type: 'until-new-commits',
    snoozedAt: '2026-08-10T10:00:00Z',
  }

  it('is active while the newest commit predates the snooze', () => {
    const pr = makePullRequest({ lastCommitPushedAt: '2026-08-09T10:00:00Z' })
    expect(isSnoozeActive(pr, snooze, ME, NOW)).toBe(true)
  })

  it('wakes up once a newer commit lands', () => {
    const pr = makePullRequest({ lastCommitPushedAt: '2026-08-10T11:00:00Z' })
    expect(isSnoozeActive(pr, snooze, ME, NOW)).toBe(false)
  })
})

describe('isSnoozeActive — until-reply', () => {
  const snooze: Snooze = {
    prId: 'PR_1',
    type: 'until-reply',
    snoozedAt: '2026-08-10T10:00:00Z',
  }

  it('is active while nobody has answered my threads', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({ comments: [makeComment(ME, '2026-08-09T10:00:00Z')] }),
      ],
    })
    expect(isSnoozeActive(pr, snooze, ME, NOW)).toBe(true)
  })

  it('wakes up when somebody replies to my thread', () => {
    const pr = makePullRequest({
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

  it('stays asleep when the reply arrived in a resolved thread', () => {
    const pr = makePullRequest({
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
})
