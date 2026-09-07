import { isSnoozeActive } from '@core/snooze'
import {
  approvedSince,
  compareIso,
  hasParticipated,
  myLastActivityAt,
  myLatestReview,
  oldestBlockingChangeRequestAt,
  oldestPendingReplyAt,
  threadsAwaitingMyReply,
  unansweredThreads,
} from '@core/threads'
import {
  ATTENTION_CATEGORIES,
  type Category,
  type ClassifiedPullRequest,
  type PullRequest,
  type Snooze,
  VISIBLE_CATEGORIES,
} from '@shared/types'

export interface ClassifyContext {
  myLogin: string
  snoozes: Record<string, Snooze>
  /** ISO timestamp treated as "now". Injected so the classifier stays pure. */
  now: string
}

interface Verdict {
  category: Category
  reason: string
  /**
   * See `ClassifiedPullRequest`. Decided branch by branch rather than derived
   * from `reason` afterwards, because whichever branch knows *why* is the only
   * one that knows *since when*.
   */
  waitingSince: string | null
}

function pluralize(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural
}

/**
 * The earliest moment this pull request can have been waiting on anybody: a
 * draft is hidden, yet reviewers can be requested while it is one, and a
 * commit's `committedDate` can predate the branch being opened at all.
 */
function visibleSince(pr: PullRequest): string {
  return pr.readyForReviewAt !== null && compareIso(pr.readyForReviewAt, pr.createdAt) > 0
    ? pr.readyForReviewAt
    : pr.createdAt
}

function classifyReviewPr(pr: PullRequest, myLogin: string): Verdict {
  const requested = pr.buckets.includes('review-requested')
  const participated = hasParticipated(pr, myLogin)

  if (requested && !participated) {
    return {
      category: 'needs-review',
      reason: 'Review requested',
      waitingSince: pr.reviewRequestedAt ?? pr.createdAt,
    }
  }

  const awaiting = threadsAwaitingMyReply(pr, myLogin)
  if (awaiting.length > 0) {
    const word = pluralize(awaiting.length, 'new reply', 'new replies')
    return {
      category: 'new-replies',
      reason: `${awaiting.length} ${word}`,
      waitingSince: oldestPendingReplyAt(awaiting, myLogin) ?? pr.updatedAt,
    }
  }

  const myReview = myLatestReview(pr, myLogin)
  if (myReview !== null) {
    // I already reviewed, so GitHub cleared me from the reviewer list.
    // Being requested again means the author asked for another pass.
    if (requested) {
      // Only a request made after my review can be the one that put this
      // back on me; an older timestamp is the request I already answered,
      // meaning this one came from a team and names nobody to date it by.
      const asked =
        pr.reviewRequestedAt !== null && pr.reviewRequestedAt > myReview.submittedAt
          ? pr.reviewRequestedAt
          : pr.updatedAt
      return { category: 're-review', reason: 'Re-review requested', waitingSince: asked }
    }
    if (pr.lastCommitPushedAt > myReview.submittedAt) {
      return {
        category: 're-review',
        reason: 'New commits',
        waitingSince: pr.lastCommitPushedAt,
      }
    }
  }

  if (pr.buckets.includes('mentions') && !requested) {
    const lastActivity = myLastActivityAt(pr, myLogin)
    // `mentionsAt` is empty when our own text scan couldn't find where (a
    // team mention, etc.) even though GitHub's search matched — fall back to
    // the PR's last activity rather than silently hiding a PR that needs us.
    const latestMention = pr.mentionsAt.at(-1) ?? pr.updatedAt
    const mentionIsNew = lastActivity === null || latestMention > lastActivity
    if (mentionIsNew) {
      // The first mention I have not answered, not the latest: being called
      // out again today does not mean I was only called out today.
      const unanswered =
        lastActivity === null ? pr.mentionsAt[0] : pr.mentionsAt.find((at) => at > lastActivity)
      return {
        category: 'mentioned',
        reason: 'Mentioned',
        waitingSince: unanswered ?? latestMention,
      }
    }
  }

  if (participated) {
    return { category: 'waiting', reason: 'Waiting on author', waitingSince: null }
  }

  return { category: 'hidden', reason: '', waitingSince: null }
}

function classifyOwnPr(pr: PullRequest, myLogin: string): Verdict {
  if (pr.reviewDecision === 'CHANGES_REQUESTED') {
    return {
      category: 'my-pr-action',
      reason: 'Changes requested',
      waitingSince: oldestBlockingChangeRequestAt(pr) ?? pr.updatedAt,
    }
  }

  // Only CONFLICTING: GitHub reports UNKNOWN while it is still computing, and
  // a freshly pushed PR would otherwise flash this reason.
  if (pr.mergeable === 'CONFLICTING') {
    // Conflicts usually arrive when the base branch moves, which is not an
    // event on this pull request and does not touch `updatedAt` — so there is
    // nothing to date this from and the last activity merely stands in.
    return { category: 'my-pr-action', reason: 'Merge conflicts', waitingSince: pr.updatedAt }
  }

  const unanswered = unansweredThreads(pr, myLogin)
  if (unanswered.length > 0) {
    const word = pluralize(unanswered.length, 'open thread', 'open threads')
    return {
      category: 'my-pr-action',
      reason: `${unanswered.length} ${word}`,
      waitingSince: oldestPendingReplyAt(unanswered, myLogin) ?? pr.updatedAt,
    }
  }

  if (pr.ciStatus === 'failure') {
    return {
      category: 'my-pr-action',
      reason: 'CI is red',
      waitingSince: pr.lastCommitPushedAt,
    }
  }

  if (pr.reviewDecision === 'APPROVED') {
    // Everything above blocks auto-merge from ever firing, so it only gets to
    // speak for the case where merging is genuinely all that is left — and
    // then the pull request is already on its way out, worth nobody's slot in
    // the inbox. If a check goes red later it lands back in `my-pr-action`.
    if (pr.hasAutoMerge) {
      return { category: 'hidden', reason: '', waitingSince: null }
    }
    return {
      category: 'my-pr-action',
      reason: 'Ready to merge',
      waitingSince: approvedSince(pr) ?? pr.updatedAt,
    }
  }

  return { category: 'waiting', reason: 'Waiting on reviewers', waitingSince: null }
}

// `stack` is deliberately absent from these return types: a stack position is
// a separate fact about a pull request, unrelated to the categories, reasons,
// and snooze semantics decided here. `Inbox` attaches it afterward.
export function classify(
  pr: PullRequest,
  ctx: ClassifyContext,
): Omit<ClassifiedPullRequest, 'stack'> {
  if (pr.isDraft) {
    return { pr, category: 'hidden', reason: '', waitingSince: null, isSnoozed: false }
  }

  const verdict =
    pr.authorLogin === ctx.myLogin
      ? classifyOwnPr(pr, ctx.myLogin)
      : classifyReviewPr(pr, ctx.myLogin)

  if (verdict.category === 'hidden') {
    return { pr, ...verdict, isSnoozed: false }
  }

  const snooze = ctx.snoozes[pr.id]
  if (snooze !== undefined && isSnoozeActive(pr, snooze, ctx.myLogin, ctx.now)) {
    return { pr, category: 'waiting', reason: 'Snoozed', waitingSince: null, isSnoozed: true }
  }

  // Clamped once here rather than in every branch above: no verdict may name
  // a moment when the pull request was still invisible.
  const floor = visibleSince(pr)
  const waitingSince =
    verdict.waitingSince !== null && compareIso(verdict.waitingSince, floor) < 0
      ? floor
      : verdict.waitingSince

  return { pr, ...verdict, waitingSince, isSnoozed: false }
}

export function classifyAll(
  prs: PullRequest[],
  ctx: ClassifyContext,
): Omit<ClassifiedPullRequest, 'stack'>[] {
  return prs
    .map((pr) => classify(pr, ctx))
    .filter((item) => item.category !== 'hidden')
    .sort((a, b) => {
      const byCategory =
        VISIBLE_CATEGORIES.indexOf(a.category) - VISIBLE_CATEGORIES.indexOf(b.category)
      if (byCategory !== 0) return byCategory
      // Longest-waiting first, so a section's top row is its oldest
      // obligation rather than its noisiest. Both timestamps are set or
      // neither is — `waitingSince` is null exactly for `waiting`, whose rows
      // keep the newest-activity order they have always had.
      if (a.waitingSince !== null && b.waitingSince !== null) {
        return compareIso(a.waitingSince, b.waitingSince)
      }
      return compareIso(b.pr.updatedAt, a.pr.updatedAt)
    })
}

export function countAttention(items: Omit<ClassifiedPullRequest, 'stack'>[]): number {
  return items.filter((item) => ATTENTION_CATEGORIES.includes(item.category)).length
}
