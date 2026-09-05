import type { ClassifyContext } from '@core/classify'
import { classify, classifyAll, countAttention } from '@core/classify'
import type { Snooze } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { makeComment, makePullRequest, makeReview, makeThread } from './test-factory'

const ME = 'vlad'
const NOW = '2026-08-10T12:00:00Z'

function ctx(snoozes: Record<string, Snooze> = {}): ClassifyContext {
  return { myLogin: ME, snoozes, now: NOW }
}

describe('classify — visibility overrides', () => {
  it('hides drafts', () => {
    const pr = makePullRequest({ isDraft: true, buckets: ['review-requested'] })
    expect(classify(pr, ctx()).category).toBe('hidden')
  })

  it('hides a PR I am neither requested on nor involved in', () => {
    const pr = makePullRequest({ buckets: ['involves'] })
    expect(classify(pr, ctx()).category).toBe('hidden')
  })
})

describe('classify — reviewer branch', () => {
  it('needs-review when requested and untouched', () => {
    const pr = makePullRequest({ buckets: ['review-requested'] })
    const result = classify(pr, ctx())
    expect(result.category).toBe('needs-review')
    expect(result.reason).toBe('Review requested')
  })

  it('new-replies when somebody answered my thread', () => {
    const pr = makePullRequest({
      buckets: ['involves'],
      reviewThreads: [
        makeThread({
          comments: [
            makeComment(ME, '2026-08-01T10:00:00Z'),
            makeComment('alice', '2026-08-02T10:00:00Z'),
          ],
        }),
      ],
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('new-replies')
    expect(result.reason).toBe('1 new reply')
  })

  it('pluralises the reply count', () => {
    const thread = (id: string) =>
      makeThread({
        id,
        comments: [
          makeComment(ME, '2026-08-01T10:00:00Z'),
          makeComment('alice', '2026-08-02T10:00:00Z'),
        ],
      })
    const pr = makePullRequest({
      buckets: ['involves'],
      reviewThreads: [thread('a'), thread('b'), thread('c')],
    })
    expect(classify(pr, ctx()).reason).toBe('3 new replies')
  })

  it('ignores a resolved thread that somebody answered', () => {
    const pr = makePullRequest({
      buckets: ['involves'],
      reviewThreads: [
        makeThread({
          isResolved: true,
          comments: [
            makeComment(ME, '2026-08-01T10:00:00Z'),
            makeComment('alice', '2026-08-02T10:00:00Z'),
          ],
        }),
      ],
    })
    expect(classify(pr, ctx()).category).toBe('waiting')
  })

  it('re-review when a commit landed after my review', () => {
    const pr = makePullRequest({
      buckets: ['involves'],
      reviews: [
        { authorLogin: ME, state: 'CHANGES_REQUESTED', submittedAt: '2026-08-01T10:00:00Z' },
      ],
      lastCommitPushedAt: '2026-08-05T10:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('re-review')
    expect(result.reason).toBe('New commits')
  })

  it('re-review when review was re-requested after I reviewed', () => {
    const pr = makePullRequest({
      buckets: ['review-requested', 'involves'],
      reviews: [
        { authorLogin: ME, state: 'CHANGES_REQUESTED', submittedAt: '2026-08-05T10:00:00Z' },
      ],
      lastCommitPushedAt: '2026-08-01T10:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('re-review')
    expect(result.reason).toBe('Re-review requested')
  })

  it('new-replies outranks re-review', () => {
    const pr = makePullRequest({
      buckets: ['involves'],
      reviews: [{ authorLogin: ME, state: 'COMMENTED', submittedAt: '2026-08-01T10:00:00Z' }],
      lastCommitPushedAt: '2026-08-05T10:00:00Z',
      reviewThreads: [
        makeThread({
          comments: [
            makeComment(ME, '2026-08-01T10:00:00Z'),
            makeComment('alice', '2026-08-02T10:00:00Z'),
          ],
        }),
      ],
    })
    expect(classify(pr, ctx()).category).toBe('new-replies')
  })

  it('mentioned when only @-mentioned', () => {
    const pr = makePullRequest({
      buckets: ['mentions', 'involves'],
      lastMentionAt: '2026-08-05T10:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('mentioned')
    expect(result.reason).toBe('Mentioned')
  })

  it('mentioned when the mention is newer than my last activity, even though I participated', () => {
    const pr = makePullRequest({
      buckets: ['involves', 'mentions'],
      reviews: [{ authorLogin: ME, state: 'COMMENTED', submittedAt: '2026-08-01T10:00:00Z' }],
      lastCommitPushedAt: '2026-08-01T10:00:00Z',
      lastMentionAt: '2026-08-05T10:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('mentioned')
    expect(result.reason).toBe('Mentioned')
  })

  it('not mentioned when the mention predates my last activity — falls through to waiting', () => {
    const pr = makePullRequest({
      buckets: ['involves', 'mentions'],
      reviews: [{ authorLogin: ME, state: 'COMMENTED', submittedAt: '2026-08-05T10:00:00Z' }],
      lastCommitPushedAt: '2026-08-01T10:00:00Z',
      lastMentionAt: '2026-08-01T10:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('waiting')
  })

  it('surfaces a PR GitHub matched as a mention even when the text scan found no mention, rather than hiding it', () => {
    // Team mentions, mentions in a review body we don't fetch, commit-message
    // mentions, etc. all leave lastMentionAt null even though GitHub's
    // mentions:@me search did match this PR. It must not be dropped.
    const pr = makePullRequest({ buckets: ['mentions'], lastMentionAt: null })
    const result = classify(pr, ctx())
    expect(result.category).toBe('mentioned')
  })

  it('treats an unlocated mention as no newer than the PR itself, not as unconditionally new', () => {
    const pr = makePullRequest({
      buckets: ['involves', 'mentions'],
      updatedAt: '2026-08-01T10:00:00Z',
      lastMentionAt: null,
      reviews: [makeReview(ME, '2026-08-05T10:00:00Z')],
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('waiting')
  })

  it('stays waiting when requested and participated only via a conversation comment, even with a newer mention', () => {
    // Guards the `!requested` guard on the mentioned rule: a requested
    // reviewer who has already commented should not be pulled into
    // "Mentions" just because a mention is newer than their comment.
    const pr = makePullRequest({
      buckets: ['review-requested', 'mentions'],
      conversationComments: [makeComment(ME, '2026-08-01T10:00:00Z')],
      lastMentionAt: '2026-08-05T10:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('waiting')
  })

  it('is waiting, not hidden, when I only commented in the conversation', () => {
    const pr = makePullRequest({
      buckets: ['involves'],
      conversationComments: [makeComment(ME, '2026-08-01T10:00:00Z')],
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('waiting')
  })

  it('needs-review outranks mentioned', () => {
    const pr = makePullRequest({ buckets: ['mentions', 'review-requested'] })
    expect(classify(pr, ctx()).category).toBe('needs-review')
  })

  it('waiting when I reviewed and the author has not moved', () => {
    const pr = makePullRequest({
      buckets: ['involves'],
      reviews: [
        { authorLogin: ME, state: 'CHANGES_REQUESTED', submittedAt: '2026-08-05T10:00:00Z' },
      ],
      lastCommitPushedAt: '2026-08-01T10:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('waiting')
    expect(result.reason).toBe('Waiting on author')
  })
})

describe('classify — author branch', () => {
  const mine = { authorLogin: ME, buckets: ['author' as const] }

  it('my-pr-action on changes requested', () => {
    const pr = makePullRequest({ ...mine, reviewDecision: 'CHANGES_REQUESTED' })
    const result = classify(pr, ctx())
    expect(result.category).toBe('my-pr-action')
    expect(result.reason).toBe('Changes requested')
  })

  it('my-pr-action on a reviewer thread I have not answered', () => {
    const pr = makePullRequest({
      ...mine,
      reviewThreads: [makeThread({ comments: [makeComment('alice', '2026-08-02T10:00:00Z')] })],
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('my-pr-action')
    expect(result.reason).toBe('1 open thread')
  })

  it('pluralises the unanswered thread count', () => {
    const thread = (id: string) =>
      makeThread({ id, comments: [makeComment('alice', '2026-08-02T10:00:00Z')] })
    const pr = makePullRequest({
      ...mine,
      reviewThreads: [thread('a'), thread('b')],
    })
    expect(classify(pr, ctx()).reason).toBe('2 open threads')
  })

  it('ignores resolved threads on my own PR', () => {
    const pr = makePullRequest({
      ...mine,
      reviewThreads: [
        makeThread({
          isResolved: true,
          comments: [makeComment('alice', '2026-08-02T10:00:00Z')],
        }),
      ],
    })
    expect(classify(pr, ctx()).category).toBe('waiting')
  })

  it('my-pr-action on CI failure', () => {
    const pr = makePullRequest({ ...mine, ciStatus: 'failure' })
    const result = classify(pr, ctx())
    expect(result.category).toBe('my-pr-action')
    expect(result.reason).toBe('CI is red')
  })

  it('my-pr-action when approved and mergeable', () => {
    const pr = makePullRequest({ ...mine, reviewDecision: 'APPROVED' })
    const result = classify(pr, ctx())
    expect(result.category).toBe('my-pr-action')
    expect(result.reason).toBe('Ready to merge')
  })

  it('CI failure outranks the approval', () => {
    const pr = makePullRequest({
      ...mine,
      reviewDecision: 'APPROVED',
      ciStatus: 'failure',
    })
    expect(classify(pr, ctx()).reason).toBe('CI is red')
  })

  it('waiting while reviewers have not responded', () => {
    const pr = makePullRequest({ ...mine, reviewDecision: 'REVIEW_REQUIRED' })
    const result = classify(pr, ctx())
    expect(result.category).toBe('waiting')
    expect(result.reason).toBe('Waiting on reviewers')
  })

  it('my-pr-action on a merge conflict', () => {
    const pr = makePullRequest({ ...mine, mergeable: 'CONFLICTING' })
    const result = classify(pr, ctx())
    expect(result.category).toBe('my-pr-action')
    expect(result.reason).toBe('Merge conflicts')
  })

  it('treats an unknown mergeability as not conflicting', () => {
    // GitHub computes mergeability lazily, so a freshly pushed PR reports
    // UNKNOWN — reading that as a conflict would flash a wrong reason.
    const pr = makePullRequest({ ...mine, mergeable: 'UNKNOWN' })
    expect(classify(pr, ctx()).category).toBe('waiting')
  })

  it('changes requested outranks a merge conflict', () => {
    const pr = makePullRequest({
      ...mine,
      reviewDecision: 'CHANGES_REQUESTED',
      mergeable: 'CONFLICTING',
    })
    expect(classify(pr, ctx()).reason).toBe('Changes requested')
  })

  it('a merge conflict outranks an unanswered thread', () => {
    const pr = makePullRequest({
      ...mine,
      mergeable: 'CONFLICTING',
      reviewThreads: [makeThread({ comments: [makeComment('alice', '2026-08-02T10:00:00Z')] })],
    })
    expect(classify(pr, ctx()).reason).toBe('Merge conflicts')
  })

  it('hides an approved pull request with auto-merge armed', () => {
    // It is already on its way in — there is nothing to do and nothing to
    // watch, so it does not take a row even in the collapsed section.
    const pr = makePullRequest({ ...mine, reviewDecision: 'APPROVED', hasAutoMerge: true })
    const result = classify(pr, ctx())
    expect(result.category).toBe('hidden')
    expect(result.reason).toBe('')
  })

  it('drops the auto-merging pull request from the inbox entirely', () => {
    const pr = makePullRequest({ ...mine, reviewDecision: 'APPROVED', hasAutoMerge: true })
    expect(classifyAll([pr], ctx())).toEqual([])
  })

  it('auto-merge does not suppress the other action reasons', () => {
    // Auto-merge never fires while any of these hold, so the PR is still mine
    // to unblock.
    const blocked = [
      { overrides: { reviewDecision: 'CHANGES_REQUESTED' as const }, reason: 'Changes requested' },
      { overrides: { mergeable: 'CONFLICTING' as const }, reason: 'Merge conflicts' },
      { overrides: { ciStatus: 'failure' as const }, reason: 'CI is red' },
      {
        overrides: {
          reviewThreads: [makeThread({ comments: [makeComment('alice', '2026-08-02T10:00:00Z')] })],
        },
        reason: '1 open thread',
      },
    ]
    for (const { overrides, reason } of blocked) {
      const pr = makePullRequest({
        ...mine,
        reviewDecision: 'APPROVED',
        hasAutoMerge: true,
        ...overrides,
      })
      const result = classify(pr, ctx())
      expect(result.category).toBe('my-pr-action')
      expect(result.reason).toBe(reason)
    }
  })
})

describe('classify — snooze override', () => {
  it('demotes an attention PR to waiting while snoozed', () => {
    const pr = makePullRequest({ buckets: ['review-requested'] })
    const snoozes = {
      PR_1: {
        prId: 'PR_1',
        type: 'until-time' as const,
        snoozedAt: '2026-08-10T10:00:00Z',
        until: '2026-08-10T14:00:00Z',
      },
    }
    const result = classify(pr, ctx(snoozes))
    expect(result.category).toBe('waiting')
    expect(result.isSnoozed).toBe(true)
    expect(result.reason).toBe('Snoozed')
  })

  it('restores the PR once the snooze expires', () => {
    const pr = makePullRequest({ buckets: ['review-requested'] })
    const snoozes = {
      PR_1: {
        prId: 'PR_1',
        type: 'until-time' as const,
        snoozedAt: '2026-08-10T08:00:00Z',
        until: '2026-08-10T09:00:00Z',
      },
    }
    const result = classify(pr, ctx(snoozes))
    expect(result.category).toBe('needs-review')
    expect(result.isSnoozed).toBe(false)
  })

  it('keeps a hidden PR hidden rather than surfacing it as waiting', () => {
    const pr = makePullRequest({ isDraft: true, buckets: ['review-requested'] })
    const snoozes = {
      PR_1: {
        prId: 'PR_1',
        type: 'until-time' as const,
        snoozedAt: '2026-08-10T10:00:00Z',
        until: '2026-08-10T14:00:00Z',
      },
    }
    expect(classify(pr, ctx(snoozes)).category).toBe('hidden')
  })
})

describe('classifyAll', () => {
  it('drops hidden PRs and orders by category then recency', () => {
    const prs = [
      makePullRequest({
        id: 'PR_waiting',
        authorLogin: ME,
        buckets: ['author'],
        updatedAt: '2026-08-09T10:00:00Z',
      }),
      makePullRequest({ id: 'PR_hidden', buckets: ['involves'] }),
      makePullRequest({
        id: 'PR_old_review',
        buckets: ['review-requested'],
        updatedAt: '2026-08-01T10:00:00Z',
      }),
      makePullRequest({
        id: 'PR_new_review',
        buckets: ['review-requested'],
        updatedAt: '2026-08-08T10:00:00Z',
      }),
    ]
    const ids = classifyAll(prs, ctx()).map((item) => item.pr.id)
    expect(ids).toEqual(['PR_new_review', 'PR_old_review', 'PR_waiting'])
  })
})

describe('countAttention', () => {
  it('counts everything except waiting', () => {
    const items = classifyAll(
      [
        makePullRequest({ id: 'a', buckets: ['review-requested'] }),
        makePullRequest({ id: 'b', authorLogin: ME, buckets: ['author'] }),
      ],
      ctx(),
    )
    expect(countAttention(items)).toBe(1)
  })
})
