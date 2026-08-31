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

export function myLatestReview(
  pr: PullRequest,
  myLogin: string,
): Review | null {
  const mine = pr.reviews
    .filter((r) => r.authorLogin === myLogin && r.state !== 'PENDING')
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
  return mine.at(-1) ?? null
}

export function hasParticipated(pr: PullRequest, myLogin: string): boolean {
  if (myLatestReview(pr, myLogin) !== null) return true
  return pr.reviewThreads.some((thread) =>
    thread.comments.some((c) => c.authorLogin === myLogin),
  )
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
