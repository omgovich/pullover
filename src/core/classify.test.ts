import type { ClassifyContext } from '@core/classify'
import { classify, classifyAll, countAttention } from '@core/classify'
import type { PullRequest, Snooze, Trigger } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { makeComment, makePullRequest, makeReview, makeThread } from './test-factory'

const ME = 'vlad'
const NOW = '2026-08-10T12:00:00Z'

function ctx(snoozes: Record<string, Snooze> = {}): ClassifyContext {
  return { myLogin: ME, snoozes, now: NOW, pullRequestStates: new Map() }
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
      mentionsAt: ['2026-08-05T10:00:00Z'],
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
      mentionsAt: ['2026-08-05T10:00:00Z'],
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
      mentionsAt: ['2026-08-01T10:00:00Z'],
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('waiting')
  })

  it('surfaces a PR GitHub matched as a mention even when the text scan found no mention, rather than hiding it', () => {
    // Team mentions, mentions in a review body we don't fetch, commit-message
    // mentions, etc. all leave lastMentionAt null even though GitHub's
    // mentions:@me search did match this PR. It must not be dropped.
    const pr = makePullRequest({ buckets: ['mentions'], mentionsAt: [] })
    const result = classify(pr, ctx())
    expect(result.category).toBe('mentioned')
  })

  it('treats an unlocated mention as no newer than the PR itself, not as unconditionally new', () => {
    const pr = makePullRequest({
      buckets: ['involves', 'mentions'],
      updatedAt: '2026-08-01T10:00:00Z',
      mentionsAt: [],
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
      mentionsAt: ['2026-08-05T10:00:00Z'],
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

  it('my-pr-action on a review left as text for the whole PR', () => {
    const pr = makePullRequest({
      ...mine,
      reviews: [
        makeReview('alice', '2026-08-02T10:00:00Z', { bodyText: 'Deploy skew loses saves.' }),
      ],
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('my-pr-action')
    expect(result.reason).toBe('1 new comment')
  })

  it('my-pr-action on a conversation comment', () => {
    const pr = makePullRequest({
      ...mine,
      conversationComments: [makeComment('alice', '2026-08-02T10:00:00Z', 'Why not RQ?')],
    })
    expect(classify(pr, ctx()).reason).toBe('1 new comment')
  })

  it('counts every unanswered PR comment and dates them from the oldest', () => {
    const pr = makePullRequest({
      ...mine,
      reviews: [makeReview('alice', '2026-08-03T10:00:00Z', { bodyText: 'Second thought' })],
      conversationComments: [makeComment('bob', '2026-08-02T10:00:00Z', 'Question')],
    })
    const result = classify(pr, ctx())
    expect(result.reason).toBe('2 new comments')
    expect(result.waitingSince).toBe('2026-08-02T10:00:00Z')
  })

  it('ignores PR comments from bots', () => {
    const pr = makePullRequest({
      ...mine,
      reviews: [
        makeReview('cursor', '2026-08-02T10:00:00Z', {
          bodyText: 'Bugbot review',
          authorIsBot: true,
        }),
      ],
      conversationComments: [
        { ...makeComment('codex', '2026-08-02T10:00:00Z', 'Summary'), authorIsBot: true },
      ],
    })
    expect(classify(pr, ctx()).reason).toBe('Waiting on reviewers')
  })

  it('ignores a review with no text, which only carries inline comments', () => {
    const pr = makePullRequest({
      ...mine,
      reviews: [makeReview('alice', '2026-08-02T10:00:00Z', { bodyText: '  ' })],
    })
    expect(classify(pr, ctx()).reason).toBe('Waiting on reviewers')
  })

  it('ignores the text of an approval', () => {
    const pr = makePullRequest({
      ...mine,
      reviewDecision: 'APPROVED',
      reviews: [
        makeReview('alice', '2026-08-02T10:00:00Z', { state: 'APPROVED', bodyText: 'LGTM' }),
      ],
    })
    expect(classify(pr, ctx()).reason).toBe('Ready to merge')
  })

  it('treats my reply after a PR comment as the answer', () => {
    const pr = makePullRequest({
      ...mine,
      conversationComments: [
        makeComment('alice', '2026-08-02T10:00:00Z', 'Why not RQ?'),
        makeComment(ME, '2026-08-02T11:00:00Z', 'Tried it'),
      ],
    })
    expect(classify(pr, ctx()).reason).toBe('Waiting on reviewers')
  })

  it('treats my push after a PR comment as the answer', () => {
    const pr = makePullRequest({
      ...mine,
      lastCommitPushedAt: '2026-08-03T10:00:00Z',
      reviews: [makeReview('alice', '2026-08-02T10:00:00Z', { bodyText: 'Rename this' })],
    })
    expect(classify(pr, ctx()).reason).toBe('Waiting on reviewers')
  })

  it('open threads outrank PR comments, which outrank a red CI', () => {
    const comment = makeComment('alice', '2026-08-02T10:00:00Z', 'Question')
    const withThread = makePullRequest({
      ...mine,
      conversationComments: [comment],
      reviewThreads: [makeThread({ comments: [makeComment('bob', '2026-08-02T10:00:00Z')] })],
    })
    expect(classify(withThread, ctx()).reason).toBe('1 open thread')

    const withRedCi = makePullRequest({
      ...mine,
      ciStatus: 'failure',
      conversationComments: [comment],
    })
    expect(classify(withRedCi, ctx()).reason).toBe('1 new comment')
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

describe('classify — muted reasons', () => {
  const muting = (...mutedTriggers: Trigger[]): ClassifyContext => ({ ...ctx(), mutedTriggers })
  const reviewedThenPushed = {
    buckets: ['involves' as const],
    reviews: [makeReview(ME, '2026-08-01T10:00:00Z', { state: 'CHANGES_REQUESTED' })],
    lastCommitPushedAt: '2026-08-05T10:00:00Z',
  }

  it('leaves a pull request with only new commits waiting on the author', () => {
    const result = classify(makePullRequest(reviewedThenPushed), muting('new-commits'))
    expect(result.category).toBe('waiting')
    expect(result.reason).toBe('Waiting on author')
  })

  it('still shows the next reason that applies', () => {
    const pr = makePullRequest({
      ...reviewedThenPushed,
      buckets: ['involves', 'mentions'],
      mentionsAt: ['2026-08-06T10:00:00Z'],
    })
    expect(classify(pr, muting('new-commits')).category).toBe('mentioned')
  })

  it('falls back to new commits when a re-review request is muted', () => {
    const pr = makePullRequest({
      ...reviewedThenPushed,
      buckets: ['review-requested', 'involves'],
      reviewRequestedAt: '2026-08-06T10:00:00Z',
    })
    expect(classify(pr, muting('re-review-requested')).reason).toBe('New commits')
  })

  it('shows the mention on a review request that is muted', () => {
    const pr = makePullRequest({
      buckets: ['review-requested', 'mentions'],
      mentionsAt: ['2026-08-02T10:00:00Z'],
    })
    expect(classify(pr, muting('review-requested')).category).toBe('mentioned')
  })

  it('shows the mention on a re-review request that is muted', () => {
    const pr = makePullRequest({
      buckets: ['review-requested', 'involves', 'mentions'],
      reviews: [makeReview(ME, '2026-08-01T10:00:00Z')],
      lastCommitPushedAt: '2026-07-31T10:00:00Z',
      reviewRequestedAt: '2026-08-02T10:00:00Z',
      mentionsAt: ['2026-08-03T10:00:00Z'],
    })
    expect(classify(pr, muting('re-review-requested')).category).toBe('mentioned')
  })

  it.each<Trigger>(['review-requested', 're-review-requested'])(
    'keeps a mention behind a request I only commented on, with %s muted',
    (trigger) => {
      const pr = makePullRequest({
        buckets: ['review-requested', 'involves', 'mentions'],
        conversationComments: [makeComment(ME, '2026-08-01T10:00:00Z')],
        mentionsAt: ['2026-08-02T10:00:00Z'],
      })
      expect(classify(pr, ctx()).category).toBe('waiting')
      expect(classify(pr, muting(trigger)).category).toBe('waiting')
    },
  )

  it('hides a review request nobody has touched', () => {
    const pr = makePullRequest({ buckets: ['review-requested'] })
    expect(classify(pr, muting('review-requested')).category).toBe('hidden')
  })

  it('moves my red pull request to waiting', () => {
    const pr = makePullRequest({ authorLogin: ME, buckets: ['author'], ciStatus: 'failure' })
    expect(classify(pr, muting('ci-failed')).category).toBe('waiting')
  })

  it('keeps an approved pull request of mine in waiting, named for what it is', () => {
    const pr = makePullRequest({ authorLogin: ME, buckets: ['author'], reviewDecision: 'APPROVED' })
    const result = classify(pr, muting('ready-to-merge'))
    expect(result.category).toBe('waiting')
    expect(result.reason).toBe('Approved')
  })

  const approvedButBlocked: [Trigger, Partial<PullRequest>, string][] = [
    ['ci-failed', { ciStatus: 'failure' }, 'CI is red'],
    ['merge-conflicts', { mergeable: 'CONFLICTING' }, 'Merge conflicts'],
    [
      'open-threads',
      { reviewThreads: [makeThread({ comments: [makeComment('alice', '2026-08-02T10:00:00Z')] })] },
      '1 open thread',
    ],
  ]

  it.each(approvedButBlocked)(
    'leaves an approved pull request waiting under the muted %s that blocks it',
    (trigger, blocker, reason) => {
      const pr = makePullRequest({
        authorLogin: ME,
        buckets: ['author'],
        reviewDecision: 'APPROVED',
        ...blocker,
      })
      const result = classify(pr, muting(trigger))
      expect(result.category).toBe('waiting')
      expect(result.reason).toBe(reason)
    },
  )

  it('names the first blocker still on, even when an earlier one is muted', () => {
    const pr = makePullRequest({
      authorLogin: ME,
      buckets: ['author'],
      mergeable: 'CONFLICTING',
      ciStatus: 'failure',
    })
    expect(classify(pr, muting('merge-conflicts')).reason).toBe('CI is red')
  })

  const commented = {
    authorLogin: ME,
    buckets: ['author' as const],
    conversationComments: [makeComment('alice', '2026-08-02T10:00:00Z', 'Why not RQ?')],
  }

  it('lets the next reason speak when new comments are muted', () => {
    const pr = makePullRequest({ ...commented, ciStatus: 'failure' })
    expect(classify(pr, muting('new-comments')).reason).toBe('CI is red')
  })

  it('does not count a muted comment as standing in the way of a merge', () => {
    const pr = makePullRequest({ ...commented, reviewDecision: 'APPROVED' })
    expect(classify(pr, ctx()).reason).toBe('1 new comment')
    expect(classify(pr, muting('new-comments')).reason).toBe('Ready to merge')
  })

  it('keeps an approved, blocked pull request with auto-merge armed in view', () => {
    const pr = makePullRequest({
      authorLogin: ME,
      buckets: ['author'],
      reviewDecision: 'APPROVED',
      hasAutoMerge: true,
      ciStatus: 'failure',
    })
    expect(classify(pr, muting('ci-failed')).category).toBe('waiting')
  })

  it('says my pull request waits on me when changes requested is muted', () => {
    const pr = makePullRequest({
      authorLogin: ME,
      buckets: ['author'],
      reviewDecision: 'CHANGES_REQUESTED',
    })
    const result = classify(pr, muting('changes-requested'))
    expect(result.category).toBe('waiting')
    expect(result.reason).toBe('Changes requested')
  })

  it('leaves every other reason alone', () => {
    const pr = makePullRequest(reviewedThenPushed)
    expect(classify(pr, muting('ci-failed', 'mentioned')).reason).toBe('New commits')
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

  it('holds an approved pull request back until the one it waits on merges', () => {
    const pr = makePullRequest({ authorLogin: ME, reviewDecision: 'APPROVED' })
    const snoozes: Record<string, Snooze> = {
      PR_1: {
        prId: 'PR_1',
        type: 'until-merged',
        snoozedAt: '2026-08-10T10:00:00Z',
        blocker: { repository: 'acme/api', number: 12 },
      },
    }
    const at = (state: 'OPEN' | 'MERGED') => ({
      ...ctx(snoozes),
      pullRequestStates: new Map([['acme/api#12', state]]),
    })

    const held = classify(pr, at('OPEN'))
    expect(held.category).toBe('waiting')
    expect(held.reason).toBe('After api#12')

    expect(classify(pr, at('MERGED')).reason).toBe('Ready to merge')
  })
})

describe('classifyAll', () => {
  it('drops hidden PRs and orders by category, then longest-waiting first', () => {
    const prs = [
      makePullRequest({
        id: 'PR_waiting',
        authorLogin: ME,
        buckets: ['author'],
        updatedAt: '2026-08-09T10:00:00Z',
      }),
      makePullRequest({ id: 'PR_hidden', buckets: ['involves'] }),
      makePullRequest({
        id: 'PR_fresh_request',
        buckets: ['review-requested'],
        reviewRequestedAt: '2026-08-09T10:00:00Z',
      }),
      makePullRequest({
        id: 'PR_stale_request',
        buckets: ['review-requested'],
        reviewRequestedAt: '2026-08-01T10:00:00Z',
      }),
    ]
    const ids = classifyAll(prs, ctx()).map((item) => item.pr.id)
    expect(ids).toEqual(['PR_stale_request', 'PR_fresh_request', 'PR_waiting'])
  })

  it('puts the longest-waiting PR first even when it is the least recently active', () => {
    // The bug this ordering exists to kill: a comment an hour ago used to
    // float a fortnight-old obligation to the bottom of the section.
    const prs = [
      makePullRequest({
        id: 'PR_chatty',
        buckets: ['review-requested'],
        reviewRequestedAt: '2026-08-09T10:00:00Z',
        updatedAt: '2026-08-10T11:00:00Z',
      }),
      makePullRequest({
        id: 'PR_forgotten',
        buckets: ['review-requested'],
        reviewRequestedAt: '2026-07-27T10:00:00Z',
        updatedAt: '2026-07-27T10:00:00Z',
      }),
    ]
    const ids = classifyAll(prs, ctx()).map((item) => item.pr.id)
    expect(ids).toEqual(['PR_forgotten', 'PR_chatty'])
  })

  it('still orders the waiting section newest-activity first', () => {
    // Nothing there is waiting on the user, so there is no waiting time to
    // sort by — recency is all that section has ever meant.
    const prs = [
      makePullRequest({
        id: 'PR_older',
        authorLogin: ME,
        buckets: ['author'],
        updatedAt: '2026-08-01T10:00:00Z',
      }),
      makePullRequest({
        id: 'PR_newer',
        authorLogin: ME,
        buckets: ['author'],
        updatedAt: '2026-08-09T10:00:00Z',
      }),
    ]
    const ids = classifyAll(prs, ctx()).map((item) => item.pr.id)
    expect(ids).toEqual(['PR_newer', 'PR_older'])
  })
})

describe('classify — waitingSince', () => {
  const mine = { authorLogin: ME, buckets: ['author' as const] }

  it('dates needs-review from the review request', () => {
    const pr = makePullRequest({
      buckets: ['review-requested'],
      reviewRequestedAt: '2026-08-03T10:00:00Z',
      updatedAt: '2026-08-10T11:00:00Z',
    })
    expect(classify(pr, ctx()).waitingSince).toBe('2026-08-03T10:00:00Z')
  })

  it("falls back to the PR's creation when the request has no timestamp", () => {
    // A team request names no user, so `reviewRequestedAt` is null — opening
    // time is the closest honest answer, and for a reviewer named at open
    // time it is the exact one.
    const pr = makePullRequest({
      buckets: ['review-requested'],
      createdAt: '2026-08-02T10:00:00Z',
      updatedAt: '2026-08-10T11:00:00Z',
    })
    expect(classify(pr, ctx()).waitingSince).toBe('2026-08-02T10:00:00Z')
  })

  it('dates new-replies from the oldest reply I owe', () => {
    const thread = (id: string, replyAt: string) =>
      makeThread({
        id,
        comments: [makeComment(ME, '2026-08-01T10:00:00Z'), makeComment('alice', replyAt)],
      })

    const pr = makePullRequest({
      buckets: ['involves'],
      reviewThreads: [
        thread('fresh', '2026-08-10T11:00:00Z'),
        thread('stale', '2026-08-04T10:00:00Z'),
      ],
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('new-replies')
    expect(result.waitingSince).toBe('2026-08-04T10:00:00Z')
  })

  it('dates a re-review from the commit that invalidated my review', () => {
    const pr = makePullRequest({
      buckets: ['involves'],
      reviews: [makeReview(ME, '2026-08-01T10:00:00Z', { state: 'CHANGES_REQUESTED' })],
      lastCommitPushedAt: '2026-08-05T10:00:00Z',
      updatedAt: '2026-08-10T11:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.reason).toBe('New commits')
    expect(result.waitingSince).toBe('2026-08-05T10:00:00Z')
  })

  it('ignores a review request that predates my own review', () => {
    // I reviewed on the 3rd, which cleared me from the reviewer list; the
    // request on the 1st is the one I already answered. A team re-request
    // names nobody, so there is nothing newer to read — but dating this from
    // the 1st would claim it waited through my own review.
    const pr = makePullRequest({
      buckets: ['review-requested', 'involves'],
      reviews: [makeReview(ME, '2026-08-03T10:00:00Z', { state: 'APPROVED' })],
      reviewRequestedAt: '2026-08-01T10:00:00Z',
      updatedAt: '2026-08-09T10:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.reason).toBe('Re-review requested')
    expect(result.waitingSince).toBe('2026-08-09T10:00:00Z')
  })

  it('dates a red CI from the PR itself when the commit predates it', () => {
    // `lastCommitPushedAt` is the commit's authoring date, so a branch that
    // sat around for a month before being opened must not read as an
    // obligation older than the pull request.
    const pr = makePullRequest({
      ...mine,
      ciStatus: 'failure',
      createdAt: '2026-08-09T10:00:00Z',
      lastCommitPushedAt: '2026-07-01T10:00:00Z',
      updatedAt: '2026-08-09T11:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.reason).toBe('CI is red')
    expect(result.waitingSince).toBe('2026-08-09T10:00:00Z')
  })

  it('dates changes-requested from the oldest request still standing', () => {
    // Alice's is cleared by her own later approval, so Bob's older one is the
    // only thing still blocking — and it is what the author has been on the
    // hook for. Taking the latest review still reading CHANGES_REQUESTED
    // would answer with Alice's, which blocks nothing.
    const pr = makePullRequest({
      ...mine,
      reviewDecision: 'CHANGES_REQUESTED',
      reviews: [
        makeReview('bob', '2026-08-02T10:00:00Z', { state: 'CHANGES_REQUESTED' }),
        makeReview('alice', '2026-08-05T10:00:00Z', { state: 'CHANGES_REQUESTED' }),
        makeReview('alice', '2026-08-06T10:00:00Z', { state: 'APPROVED' }),
      ],
      updatedAt: '2026-08-10T11:00:00Z',
    })
    expect(classify(pr, ctx()).waitingSince).toBe('2026-08-02T10:00:00Z')
  })

  it('dates two live change requests from the first of them', () => {
    const pr = makePullRequest({
      ...mine,
      reviewDecision: 'CHANGES_REQUESTED',
      reviews: [
        makeReview('bob', '2026-08-02T10:00:00Z', { state: 'CHANGES_REQUESTED' }),
        makeReview('alice', '2026-08-08T10:00:00Z', { state: 'CHANGES_REQUESTED' }),
      ],
      updatedAt: '2026-08-10T11:00:00Z',
    })
    expect(classify(pr, ctx()).waitingSince).toBe('2026-08-02T10:00:00Z')
  })

  it('is not reset by a nudge in a thread I already owed an answer in', () => {
    const pr = makePullRequest({
      buckets: ['involves'],
      reviewThreads: [
        makeThread({
          comments: [
            makeComment(ME, '2026-08-01T10:00:00Z'),
            makeComment('alice', '2026-08-02T10:00:00Z'),
            makeComment('alice', '2026-08-10T11:00:00Z'),
          ],
        }),
      ],
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('new-replies')
    expect(result.waitingSince).toBe('2026-08-02T10:00:00Z')
  })

  it('dates a mention from the first one I have not answered', () => {
    // Being called out again today does not mean I was only called out
    // today — the clock started at the mention I left unanswered.
    const pr = makePullRequest({
      buckets: ['mentions'],
      mentionsAt: ['2026-08-02T10:00:00Z', '2026-08-10T11:00:00Z'],
      updatedAt: '2026-08-10T11:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('mentioned')
    expect(result.waitingSince).toBe('2026-08-02T10:00:00Z')
  })

  it('skips mentions I answered and dates from the first one after', () => {
    const pr = makePullRequest({
      buckets: ['mentions'],
      mentionsAt: ['2026-08-01T10:00:00Z', '2026-08-06T10:00:00Z', '2026-08-09T10:00:00Z'],
      conversationComments: [makeComment(ME, '2026-08-03T10:00:00Z')],
      updatedAt: '2026-08-09T10:00:00Z',
    })
    expect(classify(pr, ctx()).waitingSince).toBe('2026-08-06T10:00:00Z')
  })

  it('never dates a wait from before a draft became reviewable', () => {
    // Reviewers can be requested while a PR is still a draft, and a draft is
    // hidden — so those eleven days were waiting on nobody.
    const pr = makePullRequest({
      buckets: ['review-requested'],
      createdAt: '2026-07-25T10:00:00Z',
      reviewRequestedAt: '2026-07-25T11:00:00Z',
      readyForReviewAt: '2026-08-05T10:00:00Z',
      updatedAt: '2026-08-05T10:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('needs-review')
    expect(result.waitingSince).toBe('2026-08-05T10:00:00Z')
  })

  it('leaves a request that postdates the draft alone', () => {
    const pr = makePullRequest({
      buckets: ['review-requested'],
      createdAt: '2026-07-25T10:00:00Z',
      readyForReviewAt: '2026-08-01T10:00:00Z',
      reviewRequestedAt: '2026-08-03T10:00:00Z',
    })
    expect(classify(pr, ctx()).waitingSince).toBe('2026-08-03T10:00:00Z')
  })

  it('dates ready-to-merge from the approval that unblocked it, not a later one', () => {
    const pr = makePullRequest({
      ...mine,
      reviewDecision: 'APPROVED',
      reviews: [
        makeReview('alice', '2026-08-03T10:00:00Z', { state: 'APPROVED' }),
        makeReview('bob', '2026-08-09T10:00:00Z', { state: 'APPROVED' }),
      ],
      updatedAt: '2026-08-10T11:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.reason).toBe('Ready to merge')
    expect(result.waitingSince).toBe('2026-08-03T10:00:00Z')
  })

  it('dates a re-review request from the request', () => {
    const pr = makePullRequest({
      buckets: ['review-requested', 'involves'],
      reviews: [makeReview(ME, '2026-08-01T10:00:00Z', { state: 'CHANGES_REQUESTED' })],
      reviewRequestedAt: '2026-08-06T10:00:00Z',
      lastCommitPushedAt: '2026-07-30T10:00:00Z',
      updatedAt: '2026-08-10T11:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.reason).toBe('Re-review requested')
    expect(result.waitingSince).toBe('2026-08-06T10:00:00Z')
  })

  it('dates a mention from the mention', () => {
    const pr = makePullRequest({
      buckets: ['mentions'],
      mentionsAt: ['2026-08-04T10:00:00Z'],
      updatedAt: '2026-08-10T11:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.category).toBe('mentioned')
    expect(result.waitingSince).toBe('2026-08-04T10:00:00Z')
  })

  it('dates changes-requested from the review that asked', () => {
    const pr = makePullRequest({
      ...mine,
      reviewDecision: 'CHANGES_REQUESTED',
      reviews: [makeReview('alice', '2026-08-03T10:00:00Z', { state: 'CHANGES_REQUESTED' })],
      updatedAt: '2026-08-10T11:00:00Z',
    })
    expect(classify(pr, ctx()).waitingSince).toBe('2026-08-03T10:00:00Z')
  })

  it('dates open threads on my PR from the oldest unanswered one', () => {
    const pr = makePullRequest({
      ...mine,
      reviewThreads: [
        makeThread({ id: 'fresh', comments: [makeComment('alice', '2026-08-10T11:00:00Z')] }),
        makeThread({ id: 'stale', comments: [makeComment('bob', '2026-08-02T10:00:00Z')] }),
      ],
    })
    const result = classify(pr, ctx())
    expect(result.reason).toBe('2 open threads')
    expect(result.waitingSince).toBe('2026-08-02T10:00:00Z')
  })

  it('dates a red CI from the commit whose checks failed', () => {
    const pr = makePullRequest({
      ...mine,
      ciStatus: 'failure',
      lastCommitPushedAt: '2026-08-06T10:00:00Z',
      updatedAt: '2026-08-10T11:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.reason).toBe('CI is red')
    expect(result.waitingSince).toBe('2026-08-06T10:00:00Z')
  })

  it('dates ready-to-merge from the approval that unblocked it', () => {
    const pr = makePullRequest({
      ...mine,
      reviewDecision: 'APPROVED',
      reviews: [makeReview('alice', '2026-08-07T10:00:00Z', { state: 'APPROVED' })],
      updatedAt: '2026-08-10T11:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.reason).toBe('Ready to merge')
    expect(result.waitingSince).toBe('2026-08-07T10:00:00Z')
  })

  it('dates merge conflicts from the last activity, having no event to point at', () => {
    const pr = makePullRequest({
      ...mine,
      mergeable: 'CONFLICTING',
      updatedAt: '2026-08-08T10:00:00Z',
    })
    const result = classify(pr, ctx())
    expect(result.reason).toBe('Merge conflicts')
    expect(result.waitingSince).toBe('2026-08-08T10:00:00Z')
  })

  it('is null when nothing is waiting on me', () => {
    const waiting = makePullRequest({ ...mine })
    expect(classify(waiting, ctx()).category).toBe('waiting')
    expect(classify(waiting, ctx()).waitingSince).toBeNull()

    const draft = makePullRequest({ isDraft: true, buckets: ['review-requested'] })
    expect(classify(draft, ctx()).waitingSince).toBeNull()
  })

  it('is null while snoozed, and comes back when the snooze lapses', () => {
    const pr = makePullRequest({
      buckets: ['review-requested'],
      reviewRequestedAt: '2026-08-01T10:00:00Z',
    })
    const snoozes = {
      PR_1: {
        prId: 'PR_1',
        type: 'until-time' as const,
        snoozedAt: '2026-08-10T10:00:00Z',
        until: '2026-08-10T14:00:00Z',
      },
    }
    expect(classify(pr, ctx(snoozes)).waitingSince).toBeNull()

    // Lapsed, the request comes back as the answer — the snooze neither
    // restarted the clock nor became the new start of it.
    const lapsed = { PR_1: { ...snoozes.PR_1, until: '2026-08-10T11:00:00Z' } }
    expect(classify(pr, ctx(lapsed)).waitingSince).toBe('2026-08-01T10:00:00Z')
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
