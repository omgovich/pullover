export interface StackPosition {
  /**
   * Identifies the stack this position belongs to, so two different chains
   * of the same length can be told apart. The root pull request's id is the
   * natural choice — every member of a chain walks back to the same root.
   */
  id: string
  /** 1-based position within the chain, counted from the root. */
  index: number
  /** Length of the chain. */
  total: number
}
/**
 * What the auto-updater is doing, as far as the interface needs to know.
 *
 * `downloading` is deliberately not surfaced anywhere yet — the download is
 * meant to be unnoticed — but the state exists so the tray and the header
 * cannot disagree about whether one is in flight.
 */
export interface UpdateState {
  status: 'idle' | 'downloading' | 'ready'
  /** The version waiting to be installed; only set once `status` is `ready`. */
  version: string | null
}

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

export type ReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING'

export interface Review {
  authorLogin: string
  state: ReviewState
  submittedAt: string
  /**
   * Optional so existing fixtures that predate the mention scan reading review
   * bodies keep compiling unchanged; `mapPullRequest` always fills it in.
   */
  bodyText?: string
}

export type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null

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
  headRefName: string
  baseRefName: string
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
export const VISIBLE_CATEGORIES: readonly Category[] = [...ATTENTION_CATEGORIES, 'waiting']

export const CATEGORY_TITLES: Record<Category, string> = {
  'needs-review': 'Needs your review',
  'new-replies': 'Replies to you',
  're-review': 'Take another look',
  'my-pr-action': 'Your PRs',
  mentioned: 'Mentions',
  waiting: 'Waiting on others',
  hidden: '',
}

export interface ClassifiedPullRequest {
  pr: PullRequest
  category: Category
  reason: string
  isSnoozed: boolean
  /** This pull request's position within its stack, or null when it isn't part of one. */
  stack: StackPosition | null
}

export type SnoozeType = 'until-activity' | 'until-time'

export interface Snooze {
  prId: string
  type: SnoozeType
  /** ISO timestamp of when the snooze was created. */
  snoozedAt: string
  /** ISO timestamp; only set when `type === 'until-time'`. */
  until?: string
}

export type ThemePreference = 'system' | 'light' | 'dark'

/**
 * Accelerators offered for the global shortcut.
 *
 * A global shortcut takes its combination away from every app at once, so the
 * list avoids anything that types a character (⌥Space is a non-breaking
 * space, ⌥P is π) or that apps bind themselves (⇧⌘P is the command palette in
 * VS Code and friends). The pairs below do neither.
 */
export const SHORTCUT_OPTIONS: { value: string; label: string }[] = [
  { value: 'Control+Alt+P', label: '⌃⌥P' },
  { value: 'Control+Alt+R', label: '⌃⌥R' },
  { value: 'Control+Command+P', label: '⌃⌘P' },
]

export interface Settings {
  pollIntervalMinutes: number
  repositories: string[]
  /** When true, search every repo the user is involved in and ignore `repositories`. */
  watchAllRepositories: boolean
  theme: ThemePreference
  /** Accelerator that opens the popup from anywhere, or null for no shortcut. */
  globalShortcut: string | null
}

export const DEFAULT_SETTINGS: Settings = {
  pollIntervalMinutes: 5,
  repositories: [],
  watchAllRepositories: true,
  theme: 'system',
  globalShortcut: 'Control+Alt+P',
}
