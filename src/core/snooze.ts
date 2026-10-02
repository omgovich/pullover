import { formatRef, refKey } from '@core/pr-refs'
import { hasNewReplyInMyThreadsSince } from '@core/threads'
import type { ClassifiedPullRequest, PullRequest, PullRequestState, Snooze } from '@shared/types'

export interface SnoozeContext {
  myLogin: string
  /** ISO timestamp treated as "now". Injected so the classifier stays pure. */
  now: string
  /** What GitHub last said about other pull requests, by `refKey`. */
  pullRequestStates: ReadonlyMap<string, PullRequestState>
}

/**
 * A snooze parks a PR in the "waiting" section. It stays active until its own
 * wake condition fires.
 */
export function isSnoozeActive(pr: PullRequest, snooze: Snooze, ctx: SnoozeContext): boolean {
  switch (snooze.type) {
    case 'until-time':
      return snooze.until !== undefined && ctx.now < snooze.until
    case 'until-activity':
      return (
        !hasNewReplyInMyThreadsSince(pr, ctx.myLogin, snooze.snoozedAt) &&
        pr.lastCommitPushedAt <= snooze.snoozedAt
      )
    case 'until-merged':
      // A blocker GitHub said nothing about — no access, a failed lookup —
      // keeps the snooze: waking on it would undo the snooze every time the
      // network blinks, and Unsnooze is always one click away.
      return (
        snooze.blocker !== undefined &&
        (ctx.pullRequestStates.get(refKey(snooze.blocker)) ?? 'OPEN') === 'OPEN'
      )
  }
  // A snooze persisted by an older build can carry a type no longer in the
  // union — treat it as expired rather than returning `undefined`.
  return false
}

export function snoozeReason(
  pr: PullRequest,
  snooze: Snooze,
): Pick<ClassifiedPullRequest, 'reason' | 'snoozedUntilMerged'> {
  if (snooze.type === 'until-merged' && snooze.blocker !== undefined) {
    return {
      reason: `After ${formatRef(snooze.blocker, pr.repository)}`,
      snoozedUntilMerged: snooze.blocker,
    }
  }
  return { reason: 'Snoozed' }
}
