import { isSnoozeActive } from '@core/snooze'
import {
  compareIso,
  hasParticipated,
  myLastActivityAt,
  myLatestReview,
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
}

function pluralize(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural
}

function classifyReviewPr(pr: PullRequest, myLogin: string): Verdict {
  const requested = pr.buckets.includes('review-requested')
  const participated = hasParticipated(pr, myLogin)

  if (requested && !participated) {
    return { category: 'needs-review', reason: 'Review requested' }
  }

  const awaiting = threadsAwaitingMyReply(pr, myLogin)
  if (awaiting.length > 0) {
    const word = pluralize(awaiting.length, 'new reply', 'new replies')
    return {
      category: 'new-replies',
      reason: `${awaiting.length} ${word}`,
    }
  }

  const myReview = myLatestReview(pr, myLogin)
  if (myReview !== null) {
    // I already reviewed, so GitHub cleared me from the reviewer list.
    // Being requested again means the author asked for another pass.
    if (requested) {
      return { category: 're-review', reason: 'Re-review requested' }
    }
    if (pr.lastCommitPushedAt > myReview.submittedAt) {
      return { category: 're-review', reason: 'New commits' }
    }
  }

  if (pr.buckets.includes('mentions') && !requested) {
    const lastActivity = myLastActivityAt(pr, myLogin)
    // lastMentionAt is null when our own text scan couldn't find where (a
    // team mention, etc.) even though GitHub's search matched — fall back to
    // the PR's last activity rather than silently hiding a PR that needs us.
    const mentionAt = pr.lastMentionAt ?? pr.updatedAt
    const mentionIsNew = lastActivity === null || mentionAt > lastActivity
    if (mentionIsNew) {
      return { category: 'mentioned', reason: 'Mentioned' }
    }
  }

  if (participated) {
    return { category: 'waiting', reason: 'Waiting on author' }
  }

  return { category: 'hidden', reason: '' }
}

function classifyOwnPr(pr: PullRequest, myLogin: string): Verdict {
  if (pr.reviewDecision === 'CHANGES_REQUESTED') {
    return { category: 'my-pr-action', reason: 'Changes requested' }
  }

  // Only CONFLICTING: GitHub reports UNKNOWN while it is still computing, and
  // a freshly pushed PR would otherwise flash this reason.
  if (pr.mergeable === 'CONFLICTING') {
    return { category: 'my-pr-action', reason: 'Merge conflicts' }
  }

  const unanswered = unansweredThreads(pr, myLogin)
  if (unanswered.length > 0) {
    const word = pluralize(unanswered.length, 'open thread', 'open threads')
    return { category: 'my-pr-action', reason: `${unanswered.length} ${word}` }
  }

  if (pr.ciStatus === 'failure') {
    return { category: 'my-pr-action', reason: 'CI is red' }
  }

  if (pr.reviewDecision === 'APPROVED') {
    // Everything above blocks auto-merge from ever firing, so it only gets to
    // speak for the case where merging is genuinely all that is left.
    if (pr.hasAutoMerge) {
      return { category: 'waiting', reason: 'Merging automatically' }
    }
    return { category: 'my-pr-action', reason: 'Ready to merge' }
  }

  return { category: 'waiting', reason: 'Waiting on reviewers' }
}

// `stack` is deliberately absent from these return types: a stack position is
// a separate fact about a pull request, unrelated to the categories, reasons,
// and snooze semantics decided here. `Inbox` attaches it afterward.
export function classify(
  pr: PullRequest,
  ctx: ClassifyContext,
): Omit<ClassifiedPullRequest, 'stack'> {
  if (pr.isDraft) {
    return { pr, category: 'hidden', reason: '', isSnoozed: false }
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
    return { pr, category: 'waiting', reason: 'Snoozed', isSnoozed: true }
  }

  return { pr, ...verdict, isSnoozed: false }
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
      // Newest first. compareIso is the project's one ISO comparator.
      return compareIso(b.pr.updatedAt, a.pr.updatedAt)
    })
}

export function countAttention(items: Omit<ClassifiedPullRequest, 'stack'>[]): number {
  return items.filter((item) => ATTENTION_CATEGORIES.includes(item.category)).length
}
