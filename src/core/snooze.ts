import { hasNewReplyInMyThreadsSince } from '@core/threads'
import type { PullRequest, Snooze, SnoozeType } from '@shared/types'

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
    case 'until-review-requested':
      // A team request names nobody, so it may be another team's: only one
      // GitHub still lists as pending on the user counts.
      return !(
        pr.buckets.includes('review-requested') &&
        pr.lastReviewRequestAt !== null &&
        pr.lastReviewRequestAt > snooze.snoozedAt
      )
  }
  // A snooze persisted by an older build can carry a type no longer in the
  // union — treat it as expired rather than returning `undefined`.
  return false
}

const SNOOZE_REASONS: Record<SnoozeType, string> = {
  'until-activity': 'Snoozed',
  'until-time': 'Snoozed',
  'until-review-requested': 'Until re-requested',
}

export function snoozeReason(snooze: Snooze): string {
  // A type persisted by an older build may be missing from the table.
  return SNOOZE_REASONS[snooze.type] ?? 'Snoozed'
}
