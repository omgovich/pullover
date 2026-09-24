import { describe, expect, it } from 'vitest'
import { type GitLabClient, GitLabHttpError } from './client'
import { fetchGitLabMergeRequests } from './fetch-mrs'

const viewer = { id: 1, username: 'anton' }
const other = { id: 2, username: 'alice' }
const at = '2026-09-01T10:00:00Z'

function mr(id: number, author = other) {
  return {
    id,
    iid: id,
    project_id: 7,
    title: `Change ${id}`,
    web_url: `https://gitlab.example.com/team/subgroup/app/-/merge_requests/${id}`,
    author,
    created_at: at,
    updated_at: at,
    source_branch: `feature-${id}`,
    target_branch: 'main',
    detailed_merge_status: 'mergeable',
    head_pipeline: { status: 'success' },
  }
}

describe('GitLab merge request inbox', () => {
  it('deduplicates review requests and mentions, preserving nested project paths', async () => {
    const review = mr(10)
    const own = mr(11, viewer)
    const mentioned = mr(12)
    const client: GitLabClient = {
      async get<T>(path: string): Promise<T> {
        if (path.endsWith('/approvals')) return { approved_by: [] } as T
        if (path.endsWith('/12')) return mentioned as T
        if (path.endsWith('/10')) return review as T
        if (path.endsWith('/11')) return own as T
        throw new Error(`Unexpected GET ${path}`)
      },
      async list<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
        if (path === '/merge_requests') {
          return (params.reviewer_id === String(viewer.id) ? [review] : [own]) as T[]
        }
        if (path === '/todos') {
          return [
            {
              action_name: 'mentioned',
              created_at: at,
              target: { id: 10, iid: 10, project_id: 7, state: 'opened' },
            },
            {
              action_name: 'mentioned',
              created_at: at,
              target: { id: 12, iid: 12, project_id: 7, state: 'opened' },
            },
          ] as T[]
        }
        if (path.endsWith('/reviewers')) {
          return (
            path.includes('/10/') ? [{ user: viewer, state: 'unreviewed', created_at: at }] : []
          ) as T[]
        }
        if (path.endsWith('/discussions')) return []
        throw new Error(`Unexpected list ${path}`)
      },
    }

    const result = await fetchGitLabMergeRequests(client, viewer)
    expect(result).toHaveLength(3)
    expect(result.map((item) => item.attentionOverride?.category)).toEqual([
      'needs-review',
      'waiting',
      'mentioned',
    ])
    expect(result[0]?.repository).toBe('team/subgroup/app')
    expect(result[0]?.url).toBe(review.web_url)
  })

  it('flags an authored merge request when CI fails', async () => {
    const own = { ...mr(20, viewer), head_pipeline: { status: 'failed' } }
    const client: GitLabClient = {
      async get<T>(path: string): Promise<T> {
        return (path.endsWith('/approvals') ? { approved_by: [] } : own) as T
      },
      async list<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
        if (path === '/merge_requests')
          return (params.scope === 'created_by_me' ? [own] : []) as T[]
        return []
      },
    }
    const result = await fetchGitLabMergeRequests(client, viewer)
    expect(result[0]?.attentionOverride).toMatchObject({
      category: 'my-pr-action',
      reason: 'CI is red',
    })
  })

  it('flags an unanswered plain comment and clears it after my reply', async () => {
    const own = mr(21, viewer)
    const notes = [
      {
        id: 1,
        author: other,
        body: 'Please check this',
        created_at: '2026-09-02T10:00:00Z',
        resolvable: false,
      },
    ]
    const client: GitLabClient = {
      async get<T>(path: string): Promise<T> {
        return (path.endsWith('/approvals') ? { approved_by: [] } : own) as T
      },
      async list<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
        if (path === '/merge_requests')
          return (params.scope === 'created_by_me' ? [own] : []) as T[]
        if (path.endsWith('/discussions')) {
          return [
            {
              id: 'discussion',
              notes,
            },
          ] as T[]
        }
        return []
      },
    }
    const first = await fetchGitLabMergeRequests(client, viewer)
    expect(first[0]?.attentionOverride?.reason).toBe('Unanswered comment')
    notes.push({
      id: 2,
      author: viewer,
      body: 'Checked',
      created_at: '2026-09-03T10:00:00Z',
      resolvable: false,
    })
    const second = await fetchGitLabMergeRequests(client, viewer)
    expect(second[0]?.attentionOverride?.category).toBe('waiting')
  })

  it('keeps a separate discussion pending after I reply elsewhere', async () => {
    const own = mr(23, viewer)
    const client: GitLabClient = {
      async get<T>(path: string): Promise<T> {
        return (path.endsWith('/approvals') ? { approved_by: [] } : own) as T
      },
      async list<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
        if (path === '/merge_requests') {
          return (params.scope === 'created_by_me' ? [own] : []) as T[]
        }
        if (path.endsWith('/discussions')) {
          return [
            {
              id: 'answered',
              notes: [
                { id: 1, author: other, body: 'First', created_at: '2026-09-02T10:00:00Z' },
                { id: 2, author: viewer, body: 'Done', created_at: '2026-09-04T10:00:00Z' },
              ],
            },
            {
              id: 'pending',
              notes: [{ id: 3, author: other, body: 'Second', created_at: '2026-09-03T10:00:00Z' }],
            },
          ] as T[]
        }
        return []
      },
    }

    const result = await fetchGitLabMergeRequests(client, viewer)
    expect(result[0]?.attentionOverride).toMatchObject({
      category: 'my-pr-action',
      reason: 'Unanswered comment',
      waitingSince: '2026-09-03T10:00:00Z',
    })
  })

  it('keeps a listed MR when optional endpoints are unavailable', async () => {
    const review = mr(22)
    const client: GitLabClient = {
      async get<T>(path: string): Promise<T> {
        if (path.endsWith('/approvals')) throw new GitLabHttpError(404)
        return review as T
      },
      async list<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
        if (path === '/merge_requests') {
          return (params.reviewer_id === String(viewer.id) ? [review] : []) as T[]
        }
        if (path.endsWith('/discussions')) throw new GitLabHttpError(403)
        if (path.endsWith('/reviewers')) {
          throw new GitLabHttpError(404)
        }
        return []
      },
    }

    const result = await fetchGitLabMergeRequests(client, viewer)
    expect(result).toHaveLength(1)
    expect(result[0]?.attentionOverride?.category).toBe('needs-review')
  })

  it('keeps overview comments separate from inline review threads', async () => {
    const own = mr(30, viewer)
    const client: GitLabClient = {
      async get<T>(path: string): Promise<T> {
        return (path.endsWith('/approvals') ? { approved_by: [] } : own) as T
      },
      async list<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
        if (path === '/merge_requests')
          return (params.scope === 'created_by_me' ? [own] : []) as T[]
        if (path.endsWith('/discussions')) {
          return [
            {
              id: 'overview',
              notes: [
                {
                  id: 1,
                  type: 'DiscussionNote',
                  author: other,
                  body: 'Overview note',
                  created_at: at,
                },
              ],
            },
            {
              id: 'inline',
              notes: [
                { id: 2, type: 'DiffNote', author: other, body: 'Inline note', created_at: at },
              ],
            },
          ] as T[]
        }
        return []
      },
    }

    const [result] = await fetchGitLabMergeRequests(client, viewer)
    expect(result?.conversationComments.map((note) => note.bodyText)).toEqual(['Overview note'])
    expect(
      result?.reviewThreads.flatMap((thread) => thread.comments.map((note) => note.bodyText)),
    ).toEqual(['Inline note'])
  })
})
