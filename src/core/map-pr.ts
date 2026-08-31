import type {
  CiStatus,
  PullRequest,
  ReviewDecision,
  ReviewState,
  SearchBucket,
} from '@shared/types'

interface ActorNode {
  login: string
  avatarUrl?: string
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
        nodes: Array<{ author: ActorNode | null; createdAt: string } | null>
      }
    } | null>
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
): PullRequest {
  const lastCommit = node.commits.nodes[0]?.commit ?? null

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
    reviewThreads: node.reviewThreads.nodes.flatMap((thread) =>
      thread
        ? [
            {
              id: thread.id,
              isResolved: thread.isResolved,
              comments: thread.comments.nodes.flatMap((comment) =>
                comment?.author
                  ? [
                      {
                        authorLogin: comment.author.login,
                        createdAt: comment.createdAt,
                      },
                    ]
                  : [],
              ),
            },
          ]
        : [],
    ),
    buckets,
  }
}
