import {
  compareIso,
  hasNewReplyInMyThreadsSince,
  hasParticipated,
  lastComment,
  latestReviewAt,
  myLastActivityAt,
  myLatestReview,
  oldestBlockingChangeRequestAt,
  oldestPendingReplyAt,
  threadsAwaitingMyReply,
  unansweredThreads,
  unresolvedThreads,
} from '@core/threads'
import { describe, expect, it } from 'vitest'
import { makeComment, makePullRequest, makeReview, makeThread } from './test-factory'

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

describe('oldestPendingReplyAt', () => {
  it('takes the oldest thread, not the noisiest', () => {
    const stale = makeThread({
      id: 'stale',
      comments: [makeComment('alice', '2026-08-01T10:00:00Z')],
    })
    const fresh = makeThread({
      id: 'fresh',
      comments: [makeComment('alice', '2026-08-09T10:00:00Z')],
    })
    expect(oldestPendingReplyAt([fresh, stale], ME)).toBe('2026-08-01T10:00:00Z')
  })

  it('is not reset by a later nudge in the same thread', () => {
    // The whole point of dating an obligation: "bump?" today must not make a
    // question from last week read as a day old.
    const thread = makeThread({
      comments: [
        makeComment(ME, '2026-08-01T10:00:00Z'),
        makeComment('alice', '2026-08-02T10:00:00Z'),
        makeComment('alice', '2026-08-09T10:00:00Z'),
      ],
    })
    expect(oldestPendingReplyAt([thread], ME)).toBe('2026-08-02T10:00:00Z')
  })

  it("starts from the comment after my last, not the thread's first", () => {
    // My own reply answered everything before it, so only what came after
    // counts — otherwise a long thread I have been keeping up with would
    // read as though I had ignored it since the day it opened.
    const thread = makeThread({
      comments: [
        makeComment('alice', '2026-08-01T10:00:00Z'),
        makeComment(ME, '2026-08-03T10:00:00Z'),
        makeComment('alice', '2026-08-05T10:00:00Z'),
        makeComment('bob', '2026-08-06T10:00:00Z'),
      ],
    })
    expect(oldestPendingReplyAt([thread], ME)).toBe('2026-08-05T10:00:00Z')
  })

  it("takes a thread's first comment when I have never spoken in it", () => {
    const thread = makeThread({
      comments: [
        makeComment('alice', '2026-08-02T10:00:00Z'),
        makeComment('bob', '2026-08-08T10:00:00Z'),
      ],
    })
    expect(oldestPendingReplyAt([thread], ME)).toBe('2026-08-02T10:00:00Z')
  })

  it('is null for a thread I spoke last in', () => {
    const thread = makeThread({
      comments: [
        makeComment('alice', '2026-08-01T10:00:00Z'),
        makeComment(ME, '2026-08-02T10:00:00Z'),
      ],
    })
    expect(oldestPendingReplyAt([thread], ME)).toBeNull()
  })

  it('is null for no threads and for an empty thread', () => {
    expect(oldestPendingReplyAt([], ME)).toBeNull()
    expect(oldestPendingReplyAt([makeThread({ comments: [] })], ME)).toBeNull()
  })
})

describe('oldestBlockingChangeRequestAt', () => {
  const authored = { authorLogin: 'me-the-author' }

  it('takes the oldest request still standing, not the newest', () => {
    // Both block the merge, so the ball landed with the author at the first.
    const pr = makePullRequest({
      ...authored,
      reviews: [
        makeReview('bob', '2026-08-02T10:00:00Z', { state: 'CHANGES_REQUESTED' }),
        makeReview('alice', '2026-08-08T10:00:00Z', { state: 'CHANGES_REQUESTED' }),
      ],
    })
    expect(oldestBlockingChangeRequestAt(pr)).toBe('2026-08-02T10:00:00Z')
  })

  it('ignores a request its reviewer has since approved away', () => {
    // A review keeps its state forever, so the cleared CHANGES_REQUESTED node
    // is still in `reviews` — verified against live GitHub data.
    const pr = makePullRequest({
      ...authored,
      reviews: [
        makeReview('bob', '2026-08-02T10:00:00Z', { state: 'CHANGES_REQUESTED' }),
        makeReview('alice', '2026-08-08T10:00:00Z', { state: 'CHANGES_REQUESTED' }),
        makeReview('bob', '2026-08-09T10:00:00Z', { state: 'APPROVED' }),
      ],
    })
    expect(oldestBlockingChangeRequestAt(pr)).toBe('2026-08-08T10:00:00Z')
  })

  it("keeps a request standing through the reviewer's later comment", () => {
    // Only an approval or a dismissal clears one; commenting does not.
    const pr = makePullRequest({
      ...authored,
      reviews: [
        makeReview('bob', '2026-08-02T10:00:00Z', { state: 'CHANGES_REQUESTED' }),
        makeReview('bob', '2026-08-09T10:00:00Z', { state: 'COMMENTED' }),
      ],
    })
    expect(oldestBlockingChangeRequestAt(pr)).toBe('2026-08-02T10:00:00Z')
  })

  it('dates a reviewer who approved and then asked again from the second ask', () => {
    const pr = makePullRequest({
      ...authored,
      reviews: [
        makeReview('bob', '2026-08-02T10:00:00Z', { state: 'CHANGES_REQUESTED' }),
        makeReview('bob', '2026-08-03T10:00:00Z', { state: 'APPROVED' }),
        makeReview('bob', '2026-08-07T10:00:00Z', { state: 'CHANGES_REQUESTED' }),
      ],
    })
    expect(oldestBlockingChangeRequestAt(pr)).toBe('2026-08-07T10:00:00Z')
  })

  it('reads history in order however the reviews arrive', () => {
    const pr = makePullRequest({
      ...authored,
      reviews: [
        makeReview('bob', '2026-08-03T10:00:00Z', { state: 'APPROVED' }),
        makeReview('bob', '2026-08-02T10:00:00Z', { state: 'CHANGES_REQUESTED' }),
      ],
    })
    expect(oldestBlockingChangeRequestAt(pr)).toBeNull()
  })

  it('ignores a dismissed request', () => {
    const pr = makePullRequest({
      ...authored,
      reviews: [makeReview('bob', '2026-08-02T10:00:00Z', { state: 'DISMISSED' })],
    })
    expect(oldestBlockingChangeRequestAt(pr)).toBeNull()
  })

  it('is null when nobody has asked for changes', () => {
    expect(oldestBlockingChangeRequestAt(makePullRequest(authored))).toBeNull()
  })
})

describe('latestReviewAt', () => {
  it('takes the most recent review in that state', () => {
    const pr = makePullRequest({
      authorLogin: 'carol',
      reviews: [
        makeReview('alice', '2026-08-01T10:00:00Z', { state: 'CHANGES_REQUESTED' }),
        makeReview('bob', '2026-08-05T10:00:00Z', { state: 'CHANGES_REQUESTED' }),
      ],
    })
    expect(latestReviewAt(pr, 'CHANGES_REQUESTED')).toBe('2026-08-05T10:00:00Z')
  })

  it('ignores the other states', () => {
    const pr = makePullRequest({
      authorLogin: 'carol',
      reviews: [
        makeReview('alice', '2026-08-01T10:00:00Z', { state: 'CHANGES_REQUESTED' }),
        makeReview('bob', '2026-08-09T10:00:00Z', { state: 'COMMENTED' }),
      ],
    })
    expect(latestReviewAt(pr, 'CHANGES_REQUESTED')).toBe('2026-08-01T10:00:00Z')
  })

  it('ignores the author reviewing their own pull request', () => {
    const pr = makePullRequest({
      authorLogin: 'alice',
      reviews: [makeReview('alice', '2026-08-05T10:00:00Z', { state: 'APPROVED' })],
    })
    expect(latestReviewAt(pr, 'APPROVED')).toBeNull()
  })

  it('is null when no review is in that state', () => {
    expect(latestReviewAt(makePullRequest(), 'APPROVED')).toBeNull()
  })
})
