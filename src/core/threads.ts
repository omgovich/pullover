import type { PullRequest, Review, ReviewThread, ThreadComment } from '@shared/types'

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
export function threadsAwaitingMyReply(pr: PullRequest, myLogin: string): ReviewThread[] {
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
export function unansweredThreads(pr: PullRequest, myLogin: string): ReviewThread[] {
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

export function myLatestReview(pr: PullRequest, myLogin: string): Review | null {
  const mine = pr.reviews
    .filter((r) => r.authorLogin === myLogin && r.state !== 'PENDING')
    .sort((a, b) => compareIso(a.submittedAt, b.submittedAt))
  return mine.at(-1) ?? null
}

export function hasParticipated(pr: PullRequest, myLogin: string): boolean {
  if (myLatestReview(pr, myLogin) !== null) return true
  if (pr.reviewThreads.some((thread) => thread.comments.some((c) => c.authorLogin === myLogin))) {
    return true
  }
  return pr.conversationComments.some((c) => c.authorLogin === myLogin)
}

/**
 * When the user last did anything on this PR — reviewed, replied in a thread,
 * or commented in the conversation. Null if they never have.
 */
export function myLastActivityAt(pr: PullRequest, myLogin: string): string | null {
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

function oldestIso(dates: string[]): string | null {
  if (dates.length === 0) return null
  return dates.reduce((oldest, d) => (compareIso(d, oldest) < 0 ? d : oldest))
}

/**
 * When the user was first left owing an answer in `thread`: the comment right
 * after their last one — everything before it their own comment answered —
 * or the thread's first if they never spoke. Null when they spoke last.
 */
function pendingSinceIn(thread: ReviewThread, myLogin: string): string | null {
  let mine = -1
  for (let i = thread.comments.length - 1; i >= 0; i--) {
    if (thread.comments[i]?.authorLogin === myLogin) {
      mine = i
      break
    }
  }
  return thread.comments[mine + 1]?.createdAt ?? null
}

/**
 * The oldest answer the user owes across `threads`, or null if they owe none.
 * Oldest at both levels, because this dates how long they have been on the
 * hook: a "bump?" today must not make last week's question read as fresh.
 */
export function oldestPendingReplyAt(threads: ReviewThread[], myLogin: string): string | null {
  return oldestIso(
    threads.flatMap((thread) => {
      const at = pendingSinceIn(thread, myLogin)
      return at === null ? [] : [at]
    }),
  )
}

/**
 * When this pull request became approved, or null if no approval stands: the
 * first approval after the last request for changes, since a second reviewer
 * piling on a week later moved nothing.
 */
export function approvedSince(pr: PullRequest): string | null {
  const others = pr.reviews.filter((r) => r.authorLogin !== pr.authorLogin)
  const lastBlock = others
    .filter((r) => r.state === 'CHANGES_REQUESTED')
    .map((r) => r.submittedAt)
    .reduce<string | null>(
      (latest, d) => (latest === null || compareIso(d, latest) > 0 ? d : latest),
      null,
    )

  return oldestIso(
    others
      .filter((r) => r.state === 'APPROVED')
      .map((r) => r.submittedAt)
      .filter((at) => lastBlock === null || compareIso(at, lastBlock) > 0),
  )
}

/**
 * When the oldest still-standing "changes requested" review was submitted, or
 * null if none stands. Replayed per reviewer rather than filtered by state,
 * because a review keeps the state it was submitted with forever.
 */
export function oldestBlockingChangeRequestAt(pr: PullRequest): string | null {
  const byReviewer = new Map<string, Review[]>()
  for (const review of pr.reviews) {
    if (review.authorLogin === pr.authorLogin) continue
    const mine = byReviewer.get(review.authorLogin)
    if (mine) mine.push(review)
    else byReviewer.set(review.authorLogin, [review])
  }

  const standing: string[] = []
  for (const reviews of byReviewer.values()) {
    let since: string | null = null
    for (const review of [...reviews].sort((a, b) => compareIso(a.submittedAt, b.submittedAt))) {
      if (review.state === 'CHANGES_REQUESTED') since ??= review.submittedAt
      // A dismissal voids that reviewer's stance as an approval does: a
      // dismissed approval leaves them neutral, not back where they were.
      else if (review.state === 'APPROVED' || review.state === 'DISMISSED') since = null
    }
    if (since !== null) standing.push(since)
  }

  return oldestIso(standing)
}

export function hasNewReplyInMyThreadsSince(
  pr: PullRequest,
  myLogin: string,
  since: string,
): boolean {
  return unresolvedThreads(pr).some((thread) => {
    const iCommented = thread.comments.some((c) => c.authorLogin === myLogin)
    if (!iCommented) return false
    return thread.comments.some((c) => c.authorLogin !== myLogin && c.createdAt > since)
  })
}
