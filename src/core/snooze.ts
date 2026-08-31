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
    case 'until-new-commits':
      return pr.lastCommitPushedAt <= snooze.snoozedAt
    case 'until-reply':
      return !hasNewReplyInMyThreadsSince(pr, myLogin, snooze.snoozedAt)
  }
}
