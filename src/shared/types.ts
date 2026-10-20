export interface StackPosition {
  /**
   * Identifies the stack this position belongs to, so two different chains
   * of the same length can be told apart. GitHub's stack id when available,
   * otherwise the root pull request's id.
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
  /** Optional so fixtures need not spell it out; `mapPullRequest` always fills it in. */
  authorIsBot?: boolean
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
  /** Optional for the same reason as `bodyText`. */
  authorIsBot?: boolean
}

export type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null

/** GitHub computes mergeability in the background, so `UNKNOWN` means "not yet", not "maybe". */
export type MergeableState = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'

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
  /** GitHub's own stack numbering, including merged members. */
  nativeStack: StackPosition | null
  ciStatus: CiStatus
  lastCommitPushedAt: string
  reviewDecision: ReviewDecision
  mergeable: MergeableState
  /** Whether auto-merge is armed, so GitHub will merge this itself once checks pass. */
  hasAutoMerge: boolean
  reviews: Review[]
  reviewThreads: ReviewThread[]
  /** Latest conversation-tab comments, oldest first. Inline review comments live in `reviewThreads`. */
  conversationComments: ThreadComment[]
  /** When the user was last asked to review this PR, or null if never. */
  reviewRequestedAt: string | null
  /**
   * When the pull request stopped being a draft, or null if it never was one.
   * The floor on any waiting time: before it, the PR was hidden.
   */
  readyForReviewAt: string | null
  /** Every @-mention of the user on this PR, oldest first. */
  mentionsAt: string[]
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
  /**
   * When the ball landed in the user's court, which is what each category is
   * ordered by. Null exactly for the categories where nothing is waiting on
   * them, so a null is the answer "not your move" rather than missing data.
   */
  waitingSince: string | null
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

export type Layout = 'comfortable' | 'compact'

/** The picker's options, and the allowlist `store` validates the persisted
    setting against — a value outside this list falls back to the default. */
export const LAYOUT_OPTIONS: { value: Layout; label: string }[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
]

/** Each reason the classifier can put a pull request in front of the user for. */
export type Trigger =
  | 'review-requested'
  | 're-review-requested'
  | 'new-replies'
  | 'new-commits'
  | 'mentioned'
  | 'changes-requested'
  | 'merge-conflicts'
  | 'open-threads'
  | 'new-comments'
  | 'ci-failed'
  | 'ready-to-merge'

export interface TriggerOption {
  value: Trigger
  label: string
  description: string
  /** Whose pull request the reason is about: one the user reviews, or one they wrote. */
  side: 'review' | 'own'
}

/** The Reasons screen's rows, and the allowlist `store` validates `mutedTriggers` against. */
export const TRIGGER_OPTIONS: TriggerOption[] = [
  {
    value: 'review-requested',
    label: 'Review requested',
    description: 'Somebody asked for your review.',
    side: 'review',
  },
  {
    value: 're-review-requested',
    label: 'Re-review requested',
    description: 'The author asked for another pass after your review.',
    side: 'review',
  },
  {
    value: 'new-replies',
    label: 'New replies',
    description: 'Somebody answered a thread you are in.',
    side: 'review',
  },
  {
    value: 'new-commits',
    label: 'New commits',
    description: 'Commits were pushed after your review.',
    side: 'review',
  },
  {
    value: 'mentioned',
    label: 'Mentioned',
    description: 'Somebody @-mentioned you.',
    side: 'review',
  },
  {
    value: 'changes-requested',
    label: 'Changes requested',
    description: 'A reviewer asked for changes.',
    side: 'own',
  },
  {
    value: 'merge-conflicts',
    label: 'Merge conflicts',
    description: 'The branch conflicts with its base.',
    side: 'own',
  },
  {
    value: 'open-threads',
    label: 'Open threads',
    description: 'A review comment is waiting on your answer.',
    side: 'own',
  },
  {
    value: 'new-comments',
    label: 'New comments',
    description: 'Somebody commented on the pull request as a whole.',
    side: 'own',
  },
  {
    value: 'ci-failed',
    label: 'CI is red',
    description: 'A check failed.',
    side: 'own',
  },
  {
    value: 'ready-to-merge',
    label: 'Ready to merge',
    description: 'Approved, with nothing else in the way.',
    side: 'own',
  },
]

export interface Settings {
  pollIntervalMinutes: number
  repositories: string[]
  /** When true, search every repo the user is involved in and ignore `repositories`. */
  watchAllRepositories: boolean
  theme: ThemePreference
  /** Accelerator that opens the popup from anywhere, or null for no shortcut. */
  globalShortcut: string | null
  layout: Layout
  /**
   * Whether the local MCP server for AI agents should listen. Whether it
   * actually does is what `getMcpStatus` reports: a taken port leaves this
   * on and the server off.
   */
  mcpServerEnabled: boolean
  /**
   * Reasons the user switched off. Stored as the ones turned off rather than
   * the ones kept, so a reason added in a later version arrives switched on.
   */
  mutedTriggers: Trigger[]
}

export const DEFAULT_SETTINGS: Settings = {
  pollIntervalMinutes: 5,
  repositories: [],
  watchAllRepositories: true,
  theme: 'system',
  globalShortcut: 'Control+Alt+P',
  layout: 'comfortable',
  mcpServerEnabled: false,
  mutedTriggers: [],
}
