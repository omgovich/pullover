import { hasNewReplyInMyThreadsSince } from '@core/threads'
import type { PullRequest, Snooze } from '@shared/types'

/**
 * A snooze parks a PR in the "waiting" section. It stays active until its own
 * wake condition fires.
 */
export function isSnoozeActive(
  pr: PullRequest,
  snooze: Snooze,
  myLogin: string,
  now: string,
): boolean {
  switch (snooze.type) {
    case 'until-time':
      return snooze.until !== undefined && now < snooze.until
    case 'until-activity':
      return (
        !hasNewReplyInMyThreadsSince(pr, myLogin, snooze.snoozedAt) &&
        pr.lastCommitPushedAt <= snooze.snoozedAt
      )
  }
  // A snooze persisted by an older build can carry a type no longer in the
  // union — treat it as expired rather than returning `undefined`.
  return false
}
