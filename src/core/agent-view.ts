import type { InboxSnapshot } from '@shared/ipc'
import {
  CATEGORY_TITLES,
  type Category,
  type CiStatus,
  type ClassifiedPullRequest,
  type MergeableState,
  type ReviewDecision,
  VISIBLE_CATEGORIES,
} from '@shared/types'

export interface AgentPullRequestSummary {
  repository: string
  number: number
  title: string
  url: string
  author: string
  category: Category
  reason: string
  waitingSince: string | null
  isSnoozed: boolean
  stack: { index: number; total: number } | null
  branch: { head: string; base: string }
  isDraft: boolean
  ci: CiStatus
  reviewDecision: ReviewDecision
  mergeable: MergeableState
  size: { additions: number; deletions: number }
  updatedAt: string
}

export interface AgentInboxSection {
  category: Category
  title: string
  pullRequests: AgentPullRequestSummary[]
}

export interface AgentInbox {
  status: InboxSnapshot['status']
  /** One sentence worth relaying when the list may not be what it seems; null when it is. */
  notice: string | null
  lastUpdatedAt: string | null
  myLogin: string | null
  attentionCount: number
  sections: AgentInboxSection[]
}

function summarize(item: ClassifiedPullRequest): AgentPullRequestSummary {
  const { pr } = item
  return {
    repository: pr.repository,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    author: pr.authorLogin,
    category: item.category,
    reason: item.reason,
    waitingSince: item.waitingSince,
    isSnoozed: item.isSnoozed,
    stack: item.stack === null ? null : { index: item.stack.index, total: item.stack.total },
    branch: { head: pr.headRefName, base: pr.baseRefName },
    isDraft: pr.isDraft,
    ci: pr.ciStatus,
    reviewDecision: pr.reviewDecision,
    mergeable: pr.mergeable,
    size: { additions: pr.additions, deletions: pr.deletions },
    updatedAt: pr.updatedAt,
  }
}

function noticeFor(snapshot: InboxSnapshot): string | null {
  switch (snapshot.status) {
    case 'signed-out':
      return 'Pullover is signed out. Sign in from its menu-bar window to see pull requests.'
    case 'error':
      return snapshot.errorMessage
    case 'loading':
      return 'A refresh is in progress; this is the last completed result.'
    case 'ready':
      return null
  }
}

export function describeInbox(
  snapshot: InboxSnapshot,
  options: { includeWaiting: boolean },
): AgentInbox {
  const sections: AgentInboxSection[] = []
  for (const category of VISIBLE_CATEGORIES) {
    if (category === 'waiting' && !options.includeWaiting) continue
    const pullRequests = snapshot.items.filter((item) => item.category === category).map(summarize)
    if (pullRequests.length === 0) continue
    sections.push({ category, title: CATEGORY_TITLES[category], pullRequests })
  }
  return {
    status: snapshot.status,
    notice: noticeFor(snapshot),
    lastUpdatedAt: snapshot.lastUpdatedAt,
    myLogin: snapshot.myLogin,
    attentionCount: snapshot.attentionCount,
    sections,
  }
}
