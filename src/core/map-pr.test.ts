import { describe, expect, it } from 'vitest'
import { mapCiStatus, mapPullRequest, mentionsUser } from '@core/map-pr'
import type { PullRequestNode } from '@core/map-pr'

function node(overrides: Partial<PullRequestNode> = {}): PullRequestNode {
  return {
    id: 'PR_1',
    number: 7,
    title: 'Add feature',
    url: 'https://github.com/acme/web/pull/7',
    isDraft: false,
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-02T10:00:00Z',
    additions: 12,
    deletions: 3,
    reviewDecision: 'REVIEW_REQUIRED',
    author: { login: 'alice', avatarUrl: 'https://avatars.example/alice.png' },
    repository: { nameWithOwner: 'acme/web' },
    reviews: { nodes: [] },
    reviewThreads: { nodes: [] },
    comments: { nodes: [] },
    bodyText: '',
    commits: { nodes: [] },
    ...overrides,
  }
}

describe('mapCiStatus', () => {
  it('maps GitHub rollup states', () => {
    expect(mapCiStatus('SUCCESS')).toBe('success')
    expect(mapCiStatus('FAILURE')).toBe('failure')
    expect(mapCiStatus('ERROR')).toBe('failure')
    expect(mapCiStatus('PENDING')).toBe('pending')
    expect(mapCiStatus('EXPECTED')).toBe('pending')
  })

  it('treats a missing rollup as no CI', () => {
    expect(mapCiStatus(null)).toBe('none')
    expect(mapCiStatus(undefined)).toBe('none')
  })
})

describe('mapPullRequest', () => {
  it('copies the scalar fields and attaches the buckets', () => {
    // isDraft is flipped to true here (the factory default is false) so a mutant
    // that hardcodes the field instead of reading it can't hide behind the default.
    const pr = mapPullRequest(node({ isDraft: true }), ['review-requested'], 'vlad')
    expect(pr.id).toBe('PR_1')
    expect(pr.number).toBe(7)
    expect(pr.title).toBe('Add feature')
    expect(pr.url).toBe('https://github.com/acme/web/pull/7')
    expect(pr.repository).toBe('acme/web')
    expect(pr.authorLogin).toBe('alice')
    expect(pr.isDraft).toBe(true)
    expect(pr.additions).toBe(12)
    expect(pr.deletions).toBe(3)
    expect(pr.createdAt).toBe('2026-08-01T10:00:00Z')
    expect(pr.updatedAt).toBe('2026-08-02T10:00:00Z')
    expect(pr.reviewDecision).toBe('REVIEW_REQUIRED')
    expect(pr.buckets).toEqual(['review-requested'])
  })

  it('falls back to ghost for a deleted author', () => {
    const pr = mapPullRequest(node({ author: null }), [], 'vlad')
    expect(pr.authorLogin).toBe('ghost')
    expect(pr.authorAvatarUrl).toBe('')
  })

  it('flattens reviews and drops ones with no author', () => {
    const pr = mapPullRequest(
      node({
        reviews: {
          nodes: [
            { author: { login: 'bob' }, state: 'APPROVED', submittedAt: '2026-08-02T10:00:00Z' },
            { author: null, state: 'COMMENTED', submittedAt: '2026-08-03T10:00:00Z' },
          ],
        },
      }),
      [],
      'vlad',
    )
    // bodyText is now part of the mapped Review contract (Finding 1: reviews
    // are scanned for mentions too), defaulting to '' when the source omits it.
    expect(pr.reviews).toEqual([
      { authorLogin: 'bob', state: 'APPROVED', submittedAt: '2026-08-02T10:00:00Z', bodyText: '' },
    ])
  })

  it('preserves the order of reviews', () => {
    const pr = mapPullRequest(
      node({
        reviews: {
          nodes: [
            { author: { login: 'first' }, state: 'APPROVED', submittedAt: '2026-08-01T09:00:00Z' },
            { author: { login: 'second' }, state: 'CHANGES_REQUESTED', submittedAt: '2026-08-02T09:00:00Z' },
            { author: { login: 'third' }, state: 'COMMENTED', submittedAt: '2026-08-03T09:00:00Z' },
          ],
        },
      }),
      [],
      'vlad',
    )
    expect(pr.reviews).toEqual([
      { authorLogin: 'first', state: 'APPROVED', submittedAt: '2026-08-01T09:00:00Z', bodyText: '' },
      { authorLogin: 'second', state: 'CHANGES_REQUESTED', submittedAt: '2026-08-02T09:00:00Z', bodyText: '' },
      { authorLogin: 'third', state: 'COMMENTED', submittedAt: '2026-08-03T09:00:00Z', bodyText: '' },
    ])
  })

  it('flattens review threads with their comments', () => {
    const pr = mapPullRequest(
      node({
        reviewThreads: {
          nodes: [
            {
              id: 'RT_1',
              isResolved: true,
              comments: {
                nodes: [
                  {
                    author: { login: 'vlad' },
                    createdAt: '2026-08-02T10:00:00Z',
                    bodyText: '',
                  },
                ],
              },
            },
          ],
        },
      }),
      [],
      'vlad',
    )
    expect(pr.reviewThreads).toEqual([
      {
        id: 'RT_1',
        isResolved: true,
        comments: [
          { authorLogin: 'vlad', createdAt: '2026-08-02T10:00:00Z', bodyText: '' },
        ],
      },
    ])
  })

  it('preserves the order of review threads', () => {
    const pr = mapPullRequest(
      node({
        reviewThreads: {
          nodes: [
            {
              id: 'RT_1',
              isResolved: false,
              comments: {
                nodes: [
                  {
                    author: { login: 'vlad' },
                    createdAt: '2026-08-01T10:00:00Z',
                    bodyText: '',
                  },
                ],
              },
            },
            {
              id: 'RT_2',
              isResolved: true,
              comments: {
                nodes: [
                  {
                    author: { login: 'alice' },
                    createdAt: '2026-08-02T10:00:00Z',
                    bodyText: '',
                  },
                ],
              },
            },
          ],
        },
      }),
      [],
      'vlad',
    )
    expect(pr.reviewThreads.map((thread) => thread.id)).toEqual(['RT_1', 'RT_2'])
  })

  it('preserves the order of comments within a thread', () => {
    const pr = mapPullRequest(
      node({
        reviewThreads: {
          nodes: [
            {
              id: 'RT_1',
              isResolved: false,
              comments: {
                nodes: [
                  { author: { login: 'first' }, createdAt: '2026-08-01T10:00:00Z', bodyText: '' },
                  { author: { login: 'second' }, createdAt: '2026-08-02T10:00:00Z', bodyText: '' },
                  { author: { login: 'third' }, createdAt: '2026-08-03T10:00:00Z', bodyText: '' },
                ],
              },
            },
          ],
        },
      }),
      [],
      'vlad',
    )
    expect(pr.reviewThreads[0].comments).toEqual([
      { authorLogin: 'first', createdAt: '2026-08-01T10:00:00Z', bodyText: '' },
      { authorLogin: 'second', createdAt: '2026-08-02T10:00:00Z', bodyText: '' },
      { authorLogin: 'third', createdAt: '2026-08-03T10:00:00Z', bodyText: '' },
    ])
  })

  it('reads the last commit date and CI status', () => {
    const pr = mapPullRequest(
      node({
        commits: {
          nodes: [
            {
              commit: {
                committedDate: '2026-08-04T10:00:00Z',
                statusCheckRollup: { state: 'FAILURE' },
              },
            },
          ],
        },
      }),
      [],
      'vlad',
    )
    expect(pr.lastCommitPushedAt).toBe('2026-08-04T10:00:00Z')
    expect(pr.ciStatus).toBe('failure')
  })

  it('reads lastCommitPushedAt and ciStatus from the first commit node when there are several', () => {
    const pr = mapPullRequest(
      node({
        commits: {
          nodes: [
            {
              commit: {
                committedDate: '2026-08-01T10:00:00Z',
                statusCheckRollup: { state: 'SUCCESS' },
              },
            },
            {
              commit: {
                committedDate: '2026-08-05T10:00:00Z',
                statusCheckRollup: { state: 'FAILURE' },
              },
            },
          ],
        },
      }),
      [],
      'vlad',
    )
    expect(pr.lastCommitPushedAt).toBe('2026-08-01T10:00:00Z')
    expect(pr.ciStatus).toBe('success')
  })

  it('falls back to createdAt when the commit list is empty', () => {
    const pr = mapPullRequest(node(), [], 'vlad')
    expect(pr.lastCommitPushedAt).toBe('2026-08-01T10:00:00Z')
    expect(pr.ciStatus).toBe('none')
  })

  it('flattens conversation comments in order, skipping null nodes and null authors', () => {
    const pr = mapPullRequest(
      node({
        comments: {
          nodes: [
            { author: { login: 'alice' }, createdAt: '2026-08-01T10:00:00Z', bodyText: 'first' },
            null,
            { author: null, createdAt: '2026-08-02T10:00:00Z', bodyText: 'ghost' },
            { author: { login: 'bob' }, createdAt: '2026-08-03T10:00:00Z', bodyText: 'second' },
          ],
        },
      }),
      [],
      'vlad',
    )
    expect(pr.conversationComments).toEqual([
      { authorLogin: 'alice', createdAt: '2026-08-01T10:00:00Z', bodyText: 'first' },
      { authorLogin: 'bob', createdAt: '2026-08-03T10:00:00Z', bodyText: 'second' },
    ])
  })

  describe('lastMentionAt', () => {
    it('picks the newest mention across conversation comments, thread comments and the PR body', () => {
      // The conversation comment is deliberately the newest of the three
      // sources (not the thread comment) so this test actually exercises the
      // conversation-comments source: a mutant that dropped it from the scan
      // used to slip through here because removing the middle-aged timestamp
      // didn't change which source held the maximum.
      const pr = mapPullRequest(
        node({
          bodyText: 'cc @vlad for visibility',
          createdAt: '2026-08-01T10:00:00Z',
          comments: {
            nodes: [
              {
                author: { login: 'alice' },
                createdAt: '2026-08-07T10:00:00Z',
                bodyText: '@vlad ping',
              },
            ],
          },
          reviewThreads: {
            nodes: [
              {
                id: 'RT_1',
                isResolved: false,
                comments: {
                  nodes: [
                    {
                      author: { login: 'bob' },
                      createdAt: '2026-08-05T10:00:00Z',
                      bodyText: 'hey @vlad look again',
                    },
                  ],
                },
              },
            ],
          },
        }),
        [],
        'vlad',
      )
      expect(pr.lastMentionAt).toBe('2026-08-07T10:00:00Z')
    })

    it('counts a mention inside a review body, using the review submittedAt', () => {
      const pr = mapPullRequest(
        node({
          reviews: {
            nodes: [
              {
                author: { login: 'bob' },
                state: 'CHANGES_REQUESTED',
                submittedAt: '2026-08-06T10:00:00Z',
                bodyText: '@vlad take another look please',
              },
            ],
          },
        }),
        [],
        'vlad',
      )
      expect(pr.lastMentionAt).toBe('2026-08-06T10:00:00Z')
    })

    it('does not count a mention in a review the user authored themselves', () => {
      const pr = mapPullRequest(
        node({
          reviews: {
            nodes: [
              {
                author: { login: 'vlad' },
                state: 'COMMENTED',
                submittedAt: '2026-08-06T10:00:00Z',
                bodyText: '@vlad reminding myself',
              },
            ],
          },
        }),
        [],
        'vlad',
      )
      expect(pr.lastMentionAt).toBeNull()
    })

    it('does not count a self-mention in the pull request body', () => {
      const pr = mapPullRequest(
        node({
          author: { login: 'vlad', avatarUrl: '' },
          bodyText: '@vlad note to self',
        }),
        [],
        'vlad',
      )
      expect(pr.lastMentionAt).toBeNull()
    })

    it('ignores a mention inside a resolved review thread', () => {
      const pr = mapPullRequest(
        node({
          reviewThreads: {
            nodes: [
              {
                id: 'RT_1',
                isResolved: true,
                comments: {
                  nodes: [
                    {
                      author: { login: 'bob' },
                      createdAt: '2026-08-06T10:00:00Z',
                      bodyText: '@vlad look at this',
                    },
                  ],
                },
              },
            ],
          },
        }),
        [],
        'vlad',
      )
      expect(pr.lastMentionAt).toBeNull()
    })

    it('prefers an older mention in an unresolved thread over a newer one in a resolved thread', () => {
      const pr = mapPullRequest(
        node({
          reviewThreads: {
            nodes: [
              {
                id: 'RT_1',
                isResolved: false,
                comments: {
                  nodes: [
                    {
                      author: { login: 'bob' },
                      createdAt: '2026-08-02T10:00:00Z',
                      bodyText: '@vlad still open',
                    },
                  ],
                },
              },
              {
                id: 'RT_2',
                isResolved: true,
                comments: {
                  nodes: [
                    {
                      author: { login: 'bob' },
                      createdAt: '2026-08-09T10:00:00Z',
                      bodyText: '@vlad but this got resolved',
                    },
                  ],
                },
              },
            ],
          },
        }),
        [],
        'vlad',
      )
      expect(pr.lastMentionAt).toBe('2026-08-02T10:00:00Z')
    })

    it('does not count a mention the user wrote themselves', () => {
      const pr = mapPullRequest(
        node({
          comments: {
            nodes: [
              {
                author: { login: 'vlad' },
                createdAt: '2026-08-03T10:00:00Z',
                bodyText: '@vlad reminding myself',
              },
            ],
          },
        }),
        [],
        'vlad',
      )
      expect(pr.lastMentionAt).toBeNull()
    })

    it('is null when nobody mentioned the user', () => {
      const pr = mapPullRequest(
        node({
          bodyText: 'nothing to see here',
          comments: {
            nodes: [
              {
                author: { login: 'alice' },
                createdAt: '2026-08-03T10:00:00Z',
                bodyText: 'no mention',
              },
            ],
          },
        }),
        [],
        'vlad',
      )
      expect(pr.lastMentionAt).toBeNull()
    })
  })
})

describe('mentionsUser', () => {
  it('is case-insensitive', () => {
    expect(mentionsUser('Hey @Vlad, can you take a look?', 'vlad')).toBe(true)
    expect(mentionsUser('Hey @vlad, can you take a look?', 'VLAD')).toBe(true)
  })

  it('requires a word boundary after the login, so @vlad does not match @vladimir', () => {
    expect(mentionsUser('cc @vladimir for context', 'vlad')).toBe(false)
  })

  it('does not match a different, hyphen-suffixed login sharing the same prefix', () => {
    // GitHub logins are letters, digits and hyphens, so `-` is a login-legal
    // character. A plain `\b` boundary treats it as a break (since `-` is not
    // a word character) and would wrongly match these unrelated accounts.
    expect(mentionsUser('cc @vlad-2 for review', 'vlad')).toBe(false)
    expect(mentionsUser('ping @vlad-bot please', 'vlad')).toBe(false)
  })

  it('does not match a login embedded in an email address', () => {
    expect(mentionsUser('reach out to me@vlad.io for details', 'vlad')).toBe(false)
  })

  it('returns false for text without the mention', () => {
    expect(mentionsUser('nothing relevant here', 'vlad')).toBe(false)
  })
})
