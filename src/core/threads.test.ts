import {
  compareIso,
  hasNewReplyInMyThreadsSince,
  hasParticipated,
  lastComment,
  myLastActivityAt,
  myLatestReview,
  threadsAwaitingMyReply,
  unansweredThreads,
  unresolvedThreads,
} from '@core/threads'
import { describe, expect, it } from 'vitest'
import { makeComment, makePullRequest, makeThread } from './test-factory'

const ME = 'vlad'

describe('lastComment', () => {
  it('returns null for an empty thread', () => {
    expect(lastComment(makeThread())).toBeNull()
  })

  it('returns the final comment', () => {
    const thread = makeThread({
      comments: [
        makeComment(ME, '2026-08-01T10:00:00Z'),
        makeComment('alice', '2026-08-02T10:00:00Z'),
      ],
    })
    expect(lastComment(thread)?.authorLogin).toBe('alice')
  })
})

describe('unresolvedThreads', () => {
  it('drops resolved threads', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({ id: 'a', isResolved: true }),
        makeThread({ id: 'b', isResolved: false }),
      ],
    })
    expect(unresolvedThreads(pr).map((t) => t.id)).toEqual(['b'])
  })
})

describe('threadsAwaitingMyReply', () => {
  it('finds threads I am in where somebody else spoke last', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          id: 'a',
          comments: [
            makeComment(ME, '2026-08-01T10:00:00Z'),
            makeComment('alice', '2026-08-02T10:00:00Z'),
          ],
        }),
      ],
    })
    expect(threadsAwaitingMyReply(pr, ME).map((t) => t.id)).toEqual(['a'])
  })

  it('ignores threads where I spoke last', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          id: 'a',
          comments: [
            makeComment('alice', '2026-08-01T10:00:00Z'),
            makeComment(ME, '2026-08-02T10:00:00Z'),
          ],
        }),
      ],
    })
    expect(threadsAwaitingMyReply(pr, ME)).toEqual([])
  })

  it('ignores threads I never commented in', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          id: 'a',
          comments: [makeComment('alice', '2026-08-01T10:00:00Z')],
        }),
      ],
    })
    expect(threadsAwaitingMyReply(pr, ME)).toEqual([])
  })

  it('ignores resolved threads even when somebody replied to me', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          id: 'a',
          isResolved: true,
          comments: [
            makeComment(ME, '2026-08-01T10:00:00Z'),
            makeComment('alice', '2026-08-02T10:00:00Z'),
          ],
        }),
      ],
    })
    expect(threadsAwaitingMyReply(pr, ME)).toEqual([])
  })
})

describe('unansweredThreads', () => {
  it('includes unresolved threads I never commented in', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          id: 'a',
          comments: [makeComment('alice', '2026-08-01T10:00:00Z')],
        }),
      ],
    })
    expect(unansweredThreads(pr, ME).map((t) => t.id)).toEqual(['a'])
  })

  it('excludes threads where I spoke last', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          id: 'a',
          comments: [
            makeComment('alice', '2026-08-01T10:00:00Z'),
            makeComment(ME, '2026-08-02T10:00:00Z'),
          ],
        }),
      ],
    })
    expect(unansweredThreads(pr, ME)).toEqual([])
  })

  it('excludes resolved threads', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          id: 'a',
          isResolved: true,
          comments: [makeComment('alice', '2026-08-01T10:00:00Z')],
        }),
      ],
    })
    expect(unansweredThreads(pr, ME)).toEqual([])
  })
})

describe('myLatestReview', () => {
  it('returns null when I never reviewed', () => {
    expect(myLatestReview(makePullRequest(), ME)).toBeNull()
  })

  it('returns my most recent submitted review', () => {
    const pr = makePullRequest({
      reviews: [
        { authorLogin: ME, state: 'COMMENTED', submittedAt: '2026-08-01T10:00:00Z' },
        { authorLogin: 'alice', state: 'APPROVED', submittedAt: '2026-08-05T10:00:00Z' },
        { authorLogin: ME, state: 'CHANGES_REQUESTED', submittedAt: '2026-08-03T10:00:00Z' },
      ],
    })
    expect(myLatestReview(pr, ME)?.state).toBe('CHANGES_REQUESTED')
  })

  it('returns the chronologically latest review when my reviews are not in order', () => {
    const pr = makePullRequest({
      reviews: [
        { authorLogin: ME, state: 'COMMENTED', submittedAt: '2026-08-07T10:00:00Z' },
        { authorLogin: 'alice', state: 'APPROVED', submittedAt: '2026-08-05T10:00:00Z' },
        { authorLogin: ME, state: 'CHANGES_REQUESTED', submittedAt: '2026-08-02T10:00:00Z' },
      ],
    })
    expect(myLatestReview(pr, ME)?.submittedAt).toBe('2026-08-07T10:00:00Z')
  })

  it('ignores my unsubmitted PENDING draft review', () => {
    const pr = makePullRequest({
      reviews: [{ authorLogin: ME, state: 'PENDING', submittedAt: '2026-08-09T10:00:00Z' }],
    })
    expect(myLatestReview(pr, ME)).toBeNull()
  })
})

describe('compareIso', () => {
  it('returns a negative number when the first timestamp is earlier', () => {
    expect(compareIso('2026-08-01T10:00:00Z', '2026-08-03T10:00:00Z')).toBeLessThan(0)
  })

  it('returns a positive number when the first timestamp is later', () => {
    expect(compareIso('2026-08-03T10:00:00Z', '2026-08-01T10:00:00Z')).toBeGreaterThan(0)
  })

  it('returns exactly 0 for equal timestamps', () => {
    expect(compareIso('2026-08-03T10:00:00Z', '2026-08-03T10:00:00Z')).toBe(0)
  })
})

describe('hasParticipated', () => {
  it('is false on an untouched PR', () => {
    expect(hasParticipated(makePullRequest(), ME)).toBe(false)
  })

  it('is true when I submitted a review', () => {
    const pr = makePullRequest({
      reviews: [{ authorLogin: ME, state: 'COMMENTED', submittedAt: '2026-08-01T10:00:00Z' }],
    })
    expect(hasParticipated(pr, ME)).toBe(true)
  })

  it('is true when I commented in a thread, even a resolved one', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          isResolved: true,
          comments: [makeComment(ME, '2026-08-01T10:00:00Z')],
        }),
      ],
    })
    expect(hasParticipated(pr, ME)).toBe(true)
  })

  it('is true when I only commented in the conversation', () => {
    const pr = makePullRequest({
      conversationComments: [makeComment(ME, '2026-08-01T10:00:00Z')],
    })
    expect(hasParticipated(pr, ME)).toBe(true)
  })
})

describe('myLastActivityAt', () => {
  it('returns null when I have no activity at all', () => {
    expect(myLastActivityAt(makePullRequest(), ME)).toBeNull()
  })

  it('returns the latest across my reviews, thread comments and conversation comments', () => {
    // The conversation comment is deliberately the newest source, so a
    // mutant that ignored conversation comments would still fail this test.
    const pr = makePullRequest({
      reviews: [{ authorLogin: ME, state: 'COMMENTED', submittedAt: '2026-08-01T10:00:00Z' }],
      reviewThreads: [makeThread({ comments: [makeComment(ME, '2026-08-04T10:00:00Z')] })],
      conversationComments: [makeComment(ME, '2026-08-07T10:00:00Z')],
    })
    expect(myLastActivityAt(pr, ME)).toBe('2026-08-07T10:00:00Z')
  })

  it('ignores activity by other people', () => {
    const pr = makePullRequest({
      reviews: [{ authorLogin: 'alice', state: 'APPROVED', submittedAt: '2026-08-09T10:00:00Z' }],
      reviewThreads: [makeThread({ comments: [makeComment('alice', '2026-08-08T10:00:00Z')] })],
      conversationComments: [makeComment('alice', '2026-08-07T10:00:00Z')],
    })
    expect(myLastActivityAt(pr, ME)).toBeNull()
  })
})

describe('hasNewReplyInMyThreadsSince', () => {
  const since = '2026-08-02T00:00:00Z'

  it('is true when somebody replied to my thread after the cutoff', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          comments: [
            makeComment(ME, '2026-08-01T10:00:00Z'),
            makeComment('alice', '2026-08-03T10:00:00Z'),
          ],
        }),
      ],
    })
    expect(hasNewReplyInMyThreadsSince(pr, ME, since)).toBe(true)
  })

  it('is false when the only new comment is my own', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          comments: [
            makeComment(ME, '2026-08-01T10:00:00Z'),
            makeComment(ME, '2026-08-03T10:00:00Z'),
          ],
        }),
      ],
    })
    expect(hasNewReplyInMyThreadsSince(pr, ME, since)).toBe(false)
  })

  it('is false when the reply predates the cutoff', () => {
    const pr = makePullRequest({
      reviewThreads: [
        makeThread({
          comments: [
            makeComment(ME, '2026-08-01T09:00:00Z'),
            makeComment('alice', '2026-08-01T10:00:00Z'),
          ],
        }),
      ],
    })
    expect(hasNewReplyInMyThreadsSince(pr, ME, since)).toBe(false)
  })
})
