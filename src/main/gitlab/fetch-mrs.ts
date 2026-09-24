import type { PullRequest, ReviewThread, SearchBucket, ThreadComment } from '@shared/types'
import { type GitLabClient, GitLabHttpError } from './client'

interface GitLabUser {
  id: number
  username: string
  avatar_url?: string
}

interface GitLabMr {
  id: number
  iid: number
  project_id: number
  title: string
  web_url: string
  references?: { full?: string }
  author: GitLabUser
  created_at: string
  updated_at: string
  draft?: boolean
  work_in_progress?: boolean
  source_branch: string
  target_branch: string
  detailed_merge_status?: string
  has_conflicts?: boolean
  sha?: string
  head_pipeline?: { status: string }
  reviewers?: GitLabUser[]
}

interface GitLabTodo {
  action_name?: string
  created_at: string
  target?: { id: number; iid: number; project_id: number; state?: string; web_url?: string }
}

interface GitLabNote {
  id: number
  author: GitLabUser
  body: string
  created_at: string
  system?: boolean
  resolved?: boolean
  resolvable?: boolean
  type?: 'DiscussionNote' | 'DiffNote' | null
  position?: unknown
}

interface GitLabDiscussion {
  id: string
  notes: GitLabNote[]
}

interface GitLabReviewer {
  user: GitLabUser
  state: string
  created_at: string
}

interface GitLabApproval {
  approved?: boolean
  approved_by?: { user: GitLabUser; approved_at?: string }[]
}

function inaccessibleMr(error: unknown): boolean {
  return error instanceof GitLabHttpError && (error.status === 403 || error.status === 404)
}

function projectName(mr: GitLabMr): string {
  const fromReference = mr.references?.full?.replace(/!\d+$/, '')
  if (fromReference) return fromReference
  const path = new URL(mr.web_url).pathname
  return decodeURIComponent(path.split('/-/merge_requests/')[0].replace(/^\//, ''))
}

function ciStatus(status: string | undefined): PullRequest['ciStatus'] {
  if (status === 'success') return 'success'
  if (['failed', 'canceled'].includes(status ?? '')) return 'failure'
  if (
    ['pending', 'running', 'created', 'preparing', 'waiting_for_resource'].includes(status ?? '')
  ) {
    return 'pending'
  }
  return 'none'
}

function newestTodo(
  todos: GitLabTodo[],
  predicate: (todo: GitLabTodo) => boolean,
): GitLabTodo | undefined {
  return todos.filter(predicate).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
}

function todoReason(todo: GitLabTodo): string {
  switch (todo.action_name) {
    case 'assigned':
      return 'Assigned to you'
    case 'approval_required':
      return 'Approval required'
    case 'directly_addressed':
      return 'Reply requested'
    case 'build_failed':
      return 'Build failed'
    case 'unmergeable':
      return 'Cannot merge'
    case 'marked':
      return 'Marked for follow-up'
    default:
      return 'New activity'
  }
}

function humanNotes(discussion: GitLabDiscussion): GitLabNote[] {
  return discussion.notes
    .filter((note) => !note.system)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function fetchGitLabViewer(client: GitLabClient): Promise<GitLabUser> {
  return client.get<GitLabUser>('/user')
}

export async function fetchGitLabMergeRequests(
  client: GitLabClient,
  viewer: GitLabUser,
): Promise<PullRequest[]> {
  const [reviewMrs, ownMrs, todos] = await Promise.all([
    client.list<GitLabMr>('/merge_requests', {
      scope: 'all',
      reviewer_id: String(viewer.id),
      state: 'opened',
    }),
    client.list<GitLabMr>('/merge_requests', { scope: 'created_by_me', state: 'opened' }),
    client.list<GitLabTodo>('/todos', { state: 'pending', type: 'MergeRequest' }),
  ])
  const byId = new Map<number, GitLabMr>()
  for (const mr of [...reviewMrs, ...ownMrs]) byId.set(mr.id, mr)
  const todosById = new Map<number, GitLabTodo[]>()
  for (const todo of todos) {
    if (todo.target?.state !== 'opened') continue
    const bucket = todosById.get(todo.target.id) ?? []
    bucket.push(todo)
    todosById.set(todo.target.id, bucket)
  }
  const missing = [...todosById.values()]
    .map((items) => items[0]?.target)
    .filter(
      (target): target is NonNullable<GitLabTodo['target']> =>
        target !== undefined && !byId.has(target.id),
    )
  const prefetched = new Map<number, GitLabMr>()
  for (let index = 0; index < missing.length; index += 5) {
    await Promise.all(
      missing.slice(index, index + 5).map(async (target) => {
        try {
          const mr = await client.get<GitLabMr>(
            `/projects/${target.project_id}/merge_requests/${target.iid}`,
          )
          if (mr.id === target.id && mr.web_url) {
            byId.set(mr.id, mr)
            prefetched.set(mr.id, mr)
          }
        } catch (error) {
          if (!inaccessibleMr(error)) throw error
        }
      }),
    )
  }

  const reviewIds = new Set(reviewMrs.map((mr) => mr.id))
  const load = async (listed: GitLabMr): Promise<PullRequest | null> => {
    const base = `/projects/${listed.project_id}/merge_requests/${listed.iid}`
    let mr: GitLabMr
    try {
      mr = prefetched.get(listed.id) ?? (await client.get<GitLabMr>(base))
    } catch (error) {
      if (inaccessibleMr(error)) return null
      throw error
    }
    const optional = async <T>(fetch: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fetch()
      } catch (error) {
        if (inaccessibleMr(error)) return fallback
        throw error
      }
    }
    const [discussions, reviewers, approvals] = await Promise.all([
      optional(() => client.list<GitLabDiscussion>(`${base}/discussions`), []),
      optional(() => client.list<GitLabReviewer>(`${base}/reviewers`), []),
      optional(() => client.get<GitLabApproval>(`${base}/approvals`), {}),
    ])
    const own = mr.author.id === viewer.id
    const myReviewer = reviewers.find((reviewer) => reviewer.user.id === viewer.id)
    const mrTodos = todosById.get(mr.id) ?? []
    const mention = newestTodo(mrTodos, (todo) => todo.action_name === 'mentioned')
    const anyTodo = newestTodo(mrTodos, () => true)
    const isDiffDiscussion = (discussion: GitLabDiscussion): boolean =>
      discussion.notes.some((note) => note.type === 'DiffNote' || note.position != null)
    const comments = discussions
      .filter((discussion) => !isDiffDiscussion(discussion))
      .flatMap(humanNotes)
    const unansweredComment = discussions
      .filter((discussion) => !discussion.notes.some((note) => note.resolvable && note.resolved))
      .map((discussion) => humanNotes(discussion).at(-1))
      .filter((note): note is GitLabNote => note !== undefined && note.author.id !== viewer.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
    const threads: ReviewThread[] = discussions
      .filter((discussion) => isDiffDiscussion(discussion) && humanNotes(discussion).length > 0)
      .map((discussion) => ({
        id: discussion.id,
        isResolved: discussion.notes.some((note) => note.resolvable && note.resolved),
        comments: humanNotes(discussion).map(
          (note): ThreadComment => ({
            authorLogin: note.author.username,
            createdAt: note.created_at,
            bodyText: note.body,
          }),
        ),
      }))
    const buckets: SearchBucket[] = []
    if (myReviewer) buckets.push('review-requested')
    if (own) buckets.push('author')
    if (mention) buckets.push('mentions')

    let attention: PullRequest['attentionOverride'] = {
      category: 'waiting',
      reason: own ? 'Waiting on reviewers' : 'Waiting on others',
      waitingSince: null,
    }
    if (own) {
      const unresolved = discussions.filter(
        (discussion) =>
          discussion.notes.some((note) => note.resolvable) &&
          !discussion.notes.some((note) => note.resolvable && note.resolved) &&
          humanNotes(discussion).at(-1)?.author.username !== viewer.username,
      )
      if (mr.detailed_merge_status === 'conflict' || mr.has_conflicts) {
        attention = {
          category: 'my-pr-action',
          reason: 'Merge conflicts',
          waitingSince: mr.updated_at,
        }
      } else if (mr.detailed_merge_status === 'requested_changes') {
        attention = {
          category: 'my-pr-action',
          reason: 'Changes requested',
          waitingSince: mr.updated_at,
        }
      } else if (unresolved.length > 0) {
        attention = {
          category: 'my-pr-action',
          reason: 'Open discussions',
          waitingSince:
            unresolved
              .map((discussion) => humanNotes(discussion).at(-1)?.created_at)
              .filter((at): at is string => at !== undefined)
              .sort()[0] ?? mr.updated_at,
        }
      } else if (ciStatus(mr.head_pipeline?.status) === 'failure') {
        attention = { category: 'my-pr-action', reason: 'CI is red', waitingSince: mr.updated_at }
      } else if (anyTodo) {
        attention = {
          category: 'my-pr-action',
          reason: todoReason(anyTodo),
          waitingSince: anyTodo.created_at,
        }
      } else if (unansweredComment) {
        attention = {
          category: 'my-pr-action',
          reason: 'Unanswered comment',
          waitingSince: unansweredComment.created_at,
        }
      }
    } else if (
      myReviewer?.state === 'unreviewed' ||
      myReviewer?.state === 'review_started' ||
      (reviewIds.has(mr.id) && !myReviewer)
    ) {
      attention = {
        category: 'needs-review',
        reason: 'Review requested',
        waitingSince: myReviewer?.created_at ?? mr.created_at,
      }
    } else if (mention) {
      attention = { category: 'mentioned', reason: 'Mentioned', waitingSince: mention.created_at }
    } else if (anyTodo) {
      attention = {
        category:
          anyTodo.action_name === 'approval_required' || anyTodo.action_name === 'assigned'
            ? 'needs-review'
            : anyTodo.action_name === 'directly_addressed'
              ? 'new-replies'
              : 'other-action',
        reason: todoReason(anyTodo),
        waitingSince: anyTodo.created_at,
      }
    }

    return {
      id: `gitlab:${mr.id}`,
      number: mr.iid,
      title: mr.title,
      url: mr.web_url,
      repository: projectName(mr),
      authorLogin: mr.author.username,
      authorAvatarUrl: mr.author.avatar_url ?? '',
      createdAt: mr.created_at,
      updatedAt: mr.updated_at,
      isDraft: mr.draft ?? mr.work_in_progress ?? false,
      additions: 0,
      deletions: 0,
      headRefName: mr.source_branch,
      baseRefName: mr.target_branch,
      ciStatus: ciStatus(mr.head_pipeline?.status),
      lastCommitPushedAt: mr.updated_at,
      reviewDecision: approvals.approved ? 'APPROVED' : 'REVIEW_REQUIRED',
      mergeable: mr.detailed_merge_status === 'conflict' ? 'CONFLICTING' : 'UNKNOWN',
      hasAutoMerge: false,
      reviews: [],
      reviewThreads: threads,
      conversationComments: comments.map((note) => ({
        authorLogin: note.author.username,
        createdAt: note.created_at,
        bodyText: note.body,
      })),
      reviewRequestedAt: myReviewer?.created_at ?? null,
      readyForReviewAt: null,
      mentionsAt: mention ? [mention.created_at] : [],
      buckets,
      provider: 'gitlab',
      attentionOverride: attention,
    }
  }
  const result: PullRequest[] = []
  const candidates = [...byId.values()]
  for (let index = 0; index < candidates.length; index += 5) {
    result.push(
      ...(await Promise.all(candidates.slice(index, index + 5).map(load))).filter(
        (mr): mr is PullRequest => mr !== null,
      ),
    )
  }
  return result
}
