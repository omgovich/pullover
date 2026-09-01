import type { PullRequest, Review, ReviewThread, ThreadComment } from '@shared/types'

export function makeComment(authorLogin: string, createdAt: string, bodyText = ''): ThreadComment {
  return { authorLogin, createdAt, bodyText }
}

export function makeReview(
  authorLogin: string,
  submittedAt: string,
  overrides: Partial<Review> = {},
): Review {
  return { authorLogin, state: 'COMMENTED', submittedAt, bodyText: '', ...overrides }
}

export function makeThread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    id: 'thread-1',
    isResolved: false,
    comments: [],
    ...overrides,
  }
}

export function makePullRequest(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: 'PR_1',
    number: 1,
    title: 'Add feature',
    url: 'https://github.com/acme/web/pull/1',
    repository: 'acme/web',
    authorLogin: 'alice',
    authorAvatarUrl: 'https://avatars.example/alice.png',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
    isDraft: false,
    additions: 10,
    deletions: 2,
    ciStatus: 'success',
    lastCommitPushedAt: '2026-08-01T10:00:00Z',
    reviewDecision: 'REVIEW_REQUIRED',
    reviews: [],
    reviewThreads: [],
    conversationComments: [],
    lastMentionAt: null,
    buckets: [],
    ...overrides,
  }
}
