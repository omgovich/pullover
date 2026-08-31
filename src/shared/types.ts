export type CiStatus = 'success' | 'failure' | 'pending' | 'none'

export type SearchBucket = 'review-requested' | 'author' | 'involves' | 'mentions'

export const SEARCH_BUCKETS: readonly SearchBucket[] = [
  'review-requested',
  'author',
  'involves',
  'mentions',
]

export interface ThreadComment {
  authorLogin: string
  createdAt: string
  bodyText: string
}

export interface ReviewThread {
  id: string
  isResolved: boolean
  comments: ThreadComment[]
}

export type ReviewState =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'COMMENTED'
  | 'DISMISSED'
  | 'PENDING'

export interface Review {
  authorLogin: string
  state: ReviewState
  submittedAt: string
}

export type ReviewDecision =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'REVIEW_REQUIRED'
  | null

export interface PullRequest {
  id: string
  number: number
  title: string
  url: string
  repository: string
  authorLogin: string
  authorAvatarUrl: string
  createdAt: string
  updatedAt: string
  isDraft: boolean
  additions: number
  deletions: number
  ciStatus: CiStatus
  lastCommitPushedAt: string
  reviewDecision: ReviewDecision
  reviews: Review[]
  reviewThreads: ReviewThread[]
  /** Latest conversation-tab comments, oldest first. Inline review comments live in `reviewThreads`. */
  conversationComments: ThreadComment[]
  /** When the user was last @-mentioned on this PR, or null if never. */
  lastMentionAt: string | null
  buckets: SearchBucket[]
}

export type Category =
  | 'needs-review'
  | 'new-replies'
  | 're-review'
  | 'my-pr-action'
  | 'mentioned'
  | 'waiting'
  | 'hidden'

/** Categories that count toward the menu-bar badge, in display order. */
export const ATTENTION_CATEGORIES: readonly Category[] = [
  'needs-review',
  'new-replies',
  're-review',
  'my-pr-action',
  'mentioned',
]

/** All visible categories, in display order. `waiting` renders last, collapsed. */
export const VISIBLE_CATEGORIES: readonly Category[] = [
  ...ATTENTION_CATEGORIES,
  'waiting',
]

export const CATEGORY_TITLES: Record<Category, string> = {
  'needs-review': 'Нужно ревью',
  'new-replies': 'Новые ответы тебе',
  're-review': 'Re-review',
  'my-pr-action': 'Твои PRы',
  mentioned: 'Упоминания',
  waiting: 'Ждёшь ответа',
  hidden: '',
}

export interface ClassifiedPullRequest {
  pr: PullRequest
  category: Category
  reason: string
  isSnoozed: boolean
}

export type SnoozeType = 'until-reply' | 'until-new-commits' | 'until-time'

export interface Snooze {
  prId: string
  type: SnoozeType
  /** ISO timestamp of when the snooze was created. */
  snoozedAt: string
  /** ISO timestamp; only set when `type === 'until-time'`. */
  until?: string
}

export interface Settings {
  pollIntervalMinutes: number
  repositories: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  pollIntervalMinutes: 5,
  repositories: [],
}
