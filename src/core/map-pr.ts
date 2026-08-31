import { compareIso } from '@core/threads'
import type {
  CiStatus,
  PullRequest,
  ReviewDecision,
  ReviewState,
  SearchBucket,
  ThreadComment,
} from '@shared/types'

interface ActorNode {
  login: string
  avatarUrl?: string
}

interface CommentNode {
  author: ActorNode | null
  createdAt: string
  bodyText: string
}

export interface PullRequestNode {
  id: string
  number: number
  title: string
  url: string
  isDraft: boolean
  createdAt: string
  updatedAt: string
  additions: number
  deletions: number
  reviewDecision: ReviewDecision
  bodyText: string
  author: ActorNode | null
  repository: { nameWithOwner: string }
  reviews: {
    nodes: Array<{
      author: ActorNode | null
      state: ReviewState
      submittedAt: string
    } | null>
  }
  reviewThreads: {
    nodes: Array<{
      id: string
      isResolved: boolean
      comments: {
        nodes: Array<CommentNode | null>
      }
    } | null>
  }
  comments: {
    nodes: Array<CommentNode | null>
  }
  commits: {
    nodes: Array<{
      commit: {
        committedDate: string
        statusCheckRollup: { state: string } | null
      }
    } | null>
  }
}

/**
 * Whether `text` @-mentions `login`. Case-insensitive, and requires a word
 * boundary after the login so `@vlad` does not match `@vladimir`.
 */
export function mentionsUser(text: string, login: string): boolean {
  const escaped = login.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`@${escaped}\\b`, 'i')
  return pattern.test(text)
}

function flattenComments(
  nodes: Array<CommentNode | null>,
): ThreadComment[] {
  return nodes.flatMap((comment) =>
    comment?.author
      ? [
          {
            authorLogin: comment.author.login,
            createdAt: comment.createdAt,
            bodyText: comment.bodyText,
          },
        ]
      : [],
  )
}

function latestIso(dates: string[]): string | null {
  if (dates.length === 0) return null
  return dates.reduce((latest, d) => (compareIso(d, latest) > 0 ? d : latest))
}

function computeLastMentionAt(
  node: PullRequestNode,
  conversationComments: ThreadComment[],
  reviewThreadComments: ThreadComment[],
  myLogin: string,
): string | null {
  const candidates: string[] = []

  for (const c of [...conversationComments, ...reviewThreadComments]) {
    if (c.authorLogin !== myLogin && mentionsUser(c.bodyText, myLogin)) {
      candidates.push(c.createdAt)
    }
  }

  if (node.author?.login !== myLogin && mentionsUser(node.bodyText, myLogin)) {
    candidates.push(node.createdAt)
  }

  return latestIso(candidates)
}

export function mapCiStatus(state: string | null | undefined): CiStatus {
  switch (state) {
    case 'SUCCESS':
      return 'success'
    case 'FAILURE':
    case 'ERROR':
      return 'failure'
    case 'PENDING':
    case 'EXPECTED':
      return 'pending'
    default:
      return 'none'
  }
}

export function mapPullRequest(
  node: PullRequestNode,
  buckets: SearchBucket[],
  myLogin: string,
): PullRequest {
  const lastCommit = node.commits.nodes[0]?.commit ?? null
  const conversationComments = flattenComments(node.comments.nodes)
  const reviewThreads = node.reviewThreads.nodes.flatMap((thread) =>
    thread
      ? [
          {
            id: thread.id,
            isResolved: thread.isResolved,
            comments: flattenComments(thread.comments.nodes),
          },
        ]
      : [],
  )
  const reviewThreadComments = reviewThreads.flatMap((thread) => thread.comments)

  return {
    id: node.id,
    number: node.number,
    title: node.title,
    url: node.url,
    repository: node.repository.nameWithOwner,
    authorLogin: node.author?.login ?? 'ghost',
    authorAvatarUrl: node.author?.avatarUrl ?? '',
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    isDraft: node.isDraft,
    additions: node.additions,
    deletions: node.deletions,
    ciStatus: mapCiStatus(lastCommit?.statusCheckRollup?.state),
    lastCommitPushedAt: lastCommit?.committedDate ?? node.createdAt,
    reviewDecision: node.reviewDecision,
    reviews: node.reviews.nodes.flatMap((review) =>
      review?.author
        ? [
            {
              authorLogin: review.author.login,
              state: review.state,
              submittedAt: review.submittedAt,
            },
          ]
        : [],
    ),
    reviewThreads,
    conversationComments,
    lastMentionAt: computeLastMentionAt(
      node,
      conversationComments,
      reviewThreadComments,
      myLogin,
    ),
    buckets,
  }
}
