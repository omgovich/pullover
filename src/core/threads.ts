import type {
  PullRequest,
  Review,
  ReviewThread,
  ThreadComment,
} from '@shared/types'

export function lastComment(thread: ReviewThread): ThreadComment | null {
  return thread.comments.at(-1) ?? null
}

/**
 * Resolved threads are dropped here and nowhere else. Every rule in the app
 * reads threads through this function so the "resolved is invisible" guarantee
 * holds in one place.
 */
export function unresolvedThreads(pr: PullRequest): ReviewThread[] {
  return pr.reviewThreads.filter((thread) => !thread.isResolved)
}

/** Unresolved threads I commented in, where somebody else spoke last. */
export function threadsAwaitingMyReply(
  pr: PullRequest,
  myLogin: string,
): ReviewThread[] {
  return unresolvedThreads(pr).filter((thread) => {
    const iCommented = thread.comments.some((c) => c.authorLogin === myLogin)
    const last = lastComment(thread)
    return iCommented && last !== null && last.authorLogin !== myLogin
  })
}

/**
 * Unresolved threads where somebody else spoke last, whether or not I am in
 * them. Used for my own PRs, where a reviewer's brand-new thread still needs
 * my answer.
 */
export function unansweredThreads(
  pr: PullRequest,
  myLogin: string,
): ReviewThread[] {
  return unresolvedThreads(pr).filter((thread) => {
    const last = lastComment(thread)
    return last !== null && last.authorLogin !== myLogin
  })
}

/**
 * Orders two ISO 8601 UTC timestamps. Plain string comparison is correct for
 * that format, and returning 0 on equality keeps the sort stable — an
 * inconsistent comparator would reorder same-second entries unpredictably.
 */
export function compareIso(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

export function myLatestReview(
  pr: PullRequest,
  myLogin: string,
): Review | null {
  const mine = pr.reviews
    .filter((r) => r.authorLogin === myLogin && r.state !== 'PENDING')
    .sort((a, b) => compareIso(a.submittedAt, b.submittedAt))
  return mine.at(-1) ?? null
}

export function hasParticipated(pr: PullRequest, myLogin: string): boolean {
  if (myLatestReview(pr, myLogin) !== null) return true
  if (
    pr.reviewThreads.some((thread) =>
      thread.comments.some((c) => c.authorLogin === myLogin),
    )
  ) {
    return true
  }
  return pr.conversationComments.some((c) => c.authorLogin === myLogin)
}

/**
 * When the user last did anything on this PR — reviewed, replied in a thread,
 * or commented in the conversation. Null if they never have.
 */
export function myLastActivityAt(
  pr: PullRequest,
  myLogin: string,
): string | null {
  const dates: string[] = []

  const myReview = myLatestReview(pr, myLogin)
  if (myReview !== null) dates.push(myReview.submittedAt)

  for (const thread of pr.reviewThreads) {
    for (const c of thread.comments) {
      if (c.authorLogin === myLogin) dates.push(c.createdAt)
    }
  }

  for (const c of pr.conversationComments) {
    if (c.authorLogin === myLogin) dates.push(c.createdAt)
  }

  if (dates.length === 0) return null
  return dates.reduce((latest, d) => (compareIso(d, latest) > 0 ? d : latest))
}

export function hasNewReplyInMyThreadsSince(
  pr: PullRequest,
  myLogin: string,
  since: string,
): boolean {
  return unresolvedThreads(pr).some((thread) => {
    const iCommented = thread.comments.some((c) => c.authorLogin === myLogin)
    if (!iCommented) return false
    return thread.comments.some(
      (c) => c.authorLogin !== myLogin && c.createdAt > since,
    )
  })
}
