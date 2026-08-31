import { compareIso } from '@core/threads'
import type {
  CiStatus,
  PullRequest,
  Review,
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
      bodyText?: string
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
 * Whether `text` @-mentions `login`. Case-insensitive. GitHub logins are
 * letters, digits and hyphens, so a plain `\b` boundary is not enough: `-` is
 * not a word character, meaning a naive check for `vlad` would also match the
 * unrelated logins `@vlad-2` or `@vlad-bot`. Require that no login-legal
 * character sits on either side instead — the leading lookbehind also stops
 * `me@vlad.io` from matching.
 */
export function mentionsUser(text: string, login: string): boolean {
  const escaped = login.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `(?<![A-Za-z0-9-])@${escaped}(?![A-Za-z0-9-])`,
    'i',
  )
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
  reviews: Review[],
  myLogin: string,
): string | null {
  const candidates: string[] = []

  for (const c of [...conversationComments, ...reviewThreadComments]) {
    if (c.authorLogin !== myLogin && mentionsUser(c.bodyText, myLogin)) {
      candidates.push(c.createdAt)
    }
  }

  // A mention can also be submitted as a review body ("@vlad take another
  // look"), not just a conversation or thread comment.
  for (const r of reviews) {
    if (r.authorLogin !== myLogin && mentionsUser(r.bodyText ?? '', myLogin)) {
      candidates.push(r.submittedAt)
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
  // Resolved threads are invisible to every rule except `hasParticipated`
  // (see the invariant documented on `unresolvedThreads` in threads.ts).
  // `lastMentionAt` drives category selection just like those rules, so it
  // must honor the same invariant — otherwise a mention in a thread that has
  // since been resolved would keep the PR in "Упоминания" forever.
  const reviewThreadComments = reviewThreads
    .filter((thread) => !thread.isResolved)
    .flatMap((thread) => thread.comments)

  const reviews: Review[] = node.reviews.nodes.flatMap((review) =>
    review?.author
      ? [
          {
            authorLogin: review.author.login,
            state: review.state,
            submittedAt: review.submittedAt,
            bodyText: review.bodyText ?? '',
          },
        ]
      : [],
  )

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
    reviews,
    reviewThreads,
    conversationComments,
    lastMentionAt: computeLastMentionAt(
      node,
      conversationComments,
      reviewThreadComments,
      reviews,
      myLogin,
    ),
    buckets,
  }
}
