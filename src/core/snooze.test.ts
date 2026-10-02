import { isSnoozeActive, type SnoozeContext, snoozeReason } from '@core/snooze'
import type { PullRequestState, Snooze } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { makeComment, makePullRequest, makeThread } from './test-factory'

const ME = 'vlad'
const NOW = '2026-08-10T12:00:00Z'

function ctx(now = NOW): SnoozeContext {
  return { myLogin: ME, now, pullRequestStates: new Map() }
}

describe('isSnoozeActive — until-time', () => {
  const snooze: Snooze = {
    prId: 'PR_1',
    type: 'until-time',
    snoozedAt: '2026-08-10T10:00:00Z',
    until: '2026-08-10T14:00:00Z',
  }

  it('is active before the deadline', () => {
    expect(isSnoozeActive(makePullRequest(), snooze, ctx())).toBe(true)
  })

  it('expires at the deadline', () => {
    const later = '2026-08-10T14:00:00Z'
    expect(isSnoozeActive(makePullRequest(), snooze, ctx(later))).toBe(false)
  })

  it('is inactive when `until` is missing', () => {
    const broken: Snooze = { ...snooze, until: undefined }
    expect(isSnoozeActive(makePullRequest(), broken, ctx())).toBe(false)
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
    expect(isSnoozeActive(pr, snooze, ctx())).toBe(true)
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
    expect(isSnoozeActive(pr, snooze, ctx())).toBe(false)
  })

  it('wakes on a commit newer than the snooze', () => {
    const pr = makePullRequest({ lastCommitPushedAt: '2026-08-10T11:00:00Z' })
    expect(isSnoozeActive(pr, snooze, ctx())).toBe(false)
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
    expect(isSnoozeActive(pr, snooze, ctx())).toBe(true)
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
    expect(isSnoozeActive(pr, snooze, ctx())).toBe(true)
  })

  it('stays asleep when the newest commit exactly equals snoozedAt', () => {
    const pr = makePullRequest({ lastCommitPushedAt: '2026-08-10T10:00:00Z' })
    expect(isSnoozeActive(pr, snooze, ctx())).toBe(true)
  })
})

describe('isSnoozeActive — until-merged', () => {
  const snooze: Snooze = {
    prId: 'PR_1',
    type: 'until-merged',
    snoozedAt: '2026-08-10T10:00:00Z',
    blocker: { repository: 'acme/api', number: 12 },
  }

  const withBlocker = (state: PullRequestState) => ({
    ...ctx(),
    pullRequestStates: new Map([['acme/api#12', state]]),
  })

  it('stays asleep while the blocker is open', () => {
    expect(isSnoozeActive(makePullRequest(), snooze, withBlocker('OPEN'))).toBe(true)
  })

  it('wakes once the blocker is merged', () => {
    expect(isSnoozeActive(makePullRequest(), snooze, withBlocker('MERGED'))).toBe(false)
  })

  it('wakes once the blocker is closed unmerged, which needs a decision too', () => {
    expect(isSnoozeActive(makePullRequest(), snooze, withBlocker('CLOSED'))).toBe(false)
  })

  it('stays asleep while nothing is known about the blocker', () => {
    expect(isSnoozeActive(makePullRequest(), snooze, ctx())).toBe(true)
  })

  it('ignores activity on the pull request itself', () => {
    const pr = makePullRequest({ lastCommitPushedAt: '2026-08-10T11:00:00Z' })
    expect(isSnoozeActive(pr, snooze, withBlocker('OPEN'))).toBe(true)
  })

  it('is inactive when `blocker` is missing', () => {
    const broken: Snooze = { ...snooze, blocker: undefined }
    expect(isSnoozeActive(makePullRequest(), broken, withBlocker('OPEN'))).toBe(false)
  })
})

describe('snoozeReason', () => {
  it('names the pull request an until-merged snooze waits on', () => {
    const snooze: Snooze = {
      prId: 'PR_1',
      type: 'until-merged',
      snoozedAt: NOW,
      blocker: { repository: 'acme/api', number: 12 },
    }
    expect(snoozeReason(makePullRequest(), snooze)).toEqual({
      reason: 'After api#12',
      snoozedUntilMerged: { repository: 'acme/api', number: 12 },
    })
  })

  it('says only "Snoozed" for the other kinds', () => {
    const snooze: Snooze = { prId: 'PR_1', type: 'until-activity', snoozedAt: NOW }
    expect(snoozeReason(makePullRequest(), snooze)).toEqual({ reason: 'Snoozed' })
  })
})

describe('isSnoozeActive — unknown legacy type', () => {
  it('treats a type no longer in the union as expired', () => {
    const snooze = {
      prId: 'PR_1',
      type: 'until-something-removed',
      snoozedAt: '2026-08-10T10:00:00Z',
    } as unknown as Snooze
    expect(isSnoozeActive(makePullRequest(), snooze, ctx())).toBe(false)
  })
})
