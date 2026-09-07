import { compareInboxOrder } from '@core/classify'
import { makePullRequest } from '@core/test-factory'
import type { InboxSnapshot } from '@shared/ipc'
import { ATTENTION_CATEGORIES, type Category, type ClassifiedPullRequest } from '@shared/types'

/**
 * The inbox the documentation screenshots are taken of: an invented but
 * plausible day's worth of pull requests, wide enough to show every kind of
 * row the app draws — a stack with a break in it, a red build, an unanswered
 * thread, something ready to merge, and a collapsed `waiting` section.
 *
 * Every `reason` here is one `classify` actually produces, and each sits in
 * the category that classifier would put it in; a demo that invented its own
 * pairs would advertise an app that doesn't exist.
 */

const MINUTE_MS = 60_000

const ME = 'vlad'

/**
 * A face per person, from DiceBear's `line-face` — CC0, so nothing here owes
 * an attribution line. The style also survives both colour modes without a
 * second set of URLs: the strokes are dark, but they sit on a light disc
 * rather than on transparency, so nothing disappears into the dark theme.
 *
 * `line-face` derives the eyes, nose and mouth from the seed alone — its API
 * accepts `eyes=`/`nose=`/`mouth=` and then ignores them — so the logins here
 * were picked for the faces they hash to: all five differ in every feature,
 * not merely in colour. Renaming one redraws it and may collide with another,
 * which is a thing to look at rather than a thing that fails. The background
 * *is* a real option, and is pinned because the seed's own palette is a muted
 * beige that reads as five copies of one avatar.
 */
const AVATAR_STYLE = 'line-face'

const CAST = {
  vlad: 'c0aede',
  kirill: 'ffdfbf',
  sdiaz: 'd1d4f9',
  mira: 'ffd5dc',
  tpark: 'a7e0a0',
}

function avatarUrl(login: keyof typeof CAST): string {
  return `https://api.dicebear.com/10.x/${AVATAR_STYLE}/svg?seed=${login}&backgroundColor=${CAST[login]}`
}

export const DEMO_AVATAR_URLS: string[] = Object.keys(CAST).map((login) =>
  avatarUrl(login as keyof typeof CAST),
)

interface DemoRow {
  repository: string
  number: number
  title: string
  author: keyof typeof CAST
  additions: number
  deletions: number
  ci: 'success' | 'failure' | 'pending' | 'none'
  category: Category
  reason: string
  /** How long the ball has been in the user's court, in minutes. */
  waitingMinutes: number | null
  /** Minutes since the last activity; only read where nothing is waiting. */
  updatedMinutes?: number
  /** Position in a stack, as `index/total`, or null for a lone pull request. */
  stack: [id: string, index: number, total: number] | null
  snoozed?: boolean
}

const ROWS: DemoRow[] = [
  {
    repository: 'acme/billing',
    number: 482,
    title: 'Proration on upgrades',
    author: 'sdiaz',
    additions: 733,
    deletions: 214,
    ci: 'pending',
    category: 'needs-review',
    reason: 'Review requested',
    waitingMinutes: 6 * 60,
    stack: null,
  },
  {
    repository: 'acme/dashboard',
    number: 2184,
    title: 'Lazy-load the preview pane',
    author: 'kirill',
    additions: 412,
    deletions: 96,
    ci: 'success',
    category: 'needs-review',
    reason: 'Review requested',
    waitingMinutes: 40,
    stack: null,
  },
  // One feature split into a chain of four, three of which need the user — so
  // the run draws solid between 1 and 2 and dotted where 3 is missing. Their
  // waiting times climb down the list rather than up, which is the one place
  // the inbox's order gives way: inside a stack the chain wins.
  //
  // Three different authors, because a chain is grouped by its branches and
  // never by who wrote them, and one face three rows running reads as a
  // rendering fault rather than as a stack.
  {
    repository: 'acme/billing',
    number: 476,
    title: 'Checkout: cart model',
    author: 'mira',
    additions: 218,
    deletions: 140,
    ci: 'success',
    category: 're-review',
    reason: 'Re-review requested',
    waitingMinutes: 5 * 60,
    stack: ['stack-checkout', 1, 4],
  },
  {
    repository: 'acme/billing',
    number: 477,
    title: 'Checkout: promo API',
    author: 'tpark',
    additions: 96,
    deletions: 12,
    ci: 'success',
    category: 're-review',
    reason: 'New commits',
    waitingMinutes: 8 * 60,
    stack: ['stack-checkout', 2, 4],
  },
  {
    repository: 'acme/billing',
    number: 480,
    title: 'Checkout: promo field',
    author: 'kirill',
    additions: 41,
    deletions: 9,
    ci: 'success',
    category: 're-review',
    reason: 'Re-review requested',
    waitingMinutes: 9 * 60,
    stack: ['stack-checkout', 4, 4],
  },
  // Two rows only: they are all the user's own, so a third would just repeat
  // the same avatar again.
  {
    repository: 'acme/dashboard',
    number: 2179,
    title: 'Empty state for saved views',
    author: 'vlad',
    additions: 234,
    deletions: 4,
    ci: 'success',
    category: 'my-pr-action',
    reason: 'Ready to merge',
    waitingMinutes: 6 * 60,
    stack: null,
  },
  {
    repository: 'acme/mobile',
    number: 318,
    title: 'Offline mode for the inbox',
    author: 'vlad',
    additions: 573,
    deletions: 24,
    ci: 'failure',
    category: 'my-pr-action',
    reason: 'CI is red',
    waitingMinutes: 3 * 60,
    stack: null,
  },
  {
    repository: 'acme/mobile',
    number: 315,
    title: 'Push permissions prompt',
    author: 'tpark',
    additions: 64,
    deletions: 28,
    ci: 'success',
    category: 'mentioned',
    reason: 'Mentioned',
    waitingMinutes: 12 * 60,
    stack: null,
  },
  {
    repository: 'acme/billing',
    number: 479,
    title: 'Refund flow copy',
    author: 'sdiaz',
    additions: 6,
    deletions: 6,
    ci: 'success',
    category: 'mentioned',
    reason: 'Mentioned',
    waitingMinutes: 7 * 60,
    stack: null,
  },
  {
    repository: 'acme/dashboard',
    number: 2190,
    title: 'Release notes for 4.2',
    author: 'mira',
    additions: 33,
    deletions: 4,
    ci: 'success',
    category: 'mentioned',
    reason: 'Mentioned',
    waitingMinutes: 4 * 60,
    stack: null,
  },
  {
    repository: 'acme/dashboard',
    number: 2176,
    title: 'Keyboard shortcuts',
    author: 'kirill',
    additions: 128,
    deletions: 37,
    ci: 'success',
    category: 'mentioned',
    reason: 'Mentioned',
    waitingMinutes: 45,
    stack: null,
  },
  // Nothing is waiting on the user here, so these two are ordered by their
  // own last activity instead — the section's own rule.
  {
    repository: 'acme/dashboard',
    number: 2150,
    title: 'Drop the print stylesheet',
    author: 'vlad',
    additions: 12,
    deletions: 304,
    ci: 'success',
    category: 'waiting',
    reason: 'Waiting on reviewers',
    waitingMinutes: null,
    updatedMinutes: 90,
    stack: null,
  },
  {
    repository: 'acme/mobile',
    number: 310,
    title: 'Bump the icon set to v2',
    author: 'tpark',
    additions: 8,
    deletions: 8,
    ci: 'success',
    category: 'waiting',
    reason: 'Snoozed',
    waitingMinutes: null,
    updatedMinutes: 6 * 60,
    stack: null,
    snoozed: true,
  },
]

function classified(row: DemoRow, now: number): ClassifiedPullRequest {
  const iso = (msAgo: number): string => new Date(now - msAgo).toISOString()
  const waitingSince = row.waitingMinutes === null ? null : iso(row.waitingMinutes * MINUTE_MS)

  return {
    pr: makePullRequest({
      id: `PR_${row.number}`,
      number: row.number,
      title: row.title,
      url: `https://github.com/${row.repository}/pull/${row.number}`,
      repository: row.repository,
      authorLogin: row.author,
      authorAvatarUrl: avatarUrl(row.author),
      additions: row.additions,
      deletions: row.deletions,
      ciStatus: row.ci,
      updatedAt: iso((row.updatedMinutes ?? row.waitingMinutes ?? 120) * MINUTE_MS),
    }),
    category: row.category,
    reason: row.reason,
    waitingSince,
    isSnoozed: row.snoozed ?? false,
    stack:
      row.stack === null ? null : { id: row.stack[0], index: row.stack[1], total: row.stack[2] },
  }
}

/**
 * The demo inbox as of `now` (milliseconds).
 *
 * Ages are offsets from that moment rather than the fixed `NOW` the
 * screenshot tests use, because `App` reads its own clock and nothing here
 * can hand it one. The rendered output is a constant all the same — "waiting
 * 18m" stays "waiting 18m" — which is what the fixed clock was protecting.
 */
export function demoSnapshot(now: number): InboxSnapshot {
  // Sorted by the app's own comparator rather than by the order they are
  // written above, so the picture cannot advertise an order the inbox
  // doesn't have. `App` then applies `orderSection` on top, which gathers
  // the stack.
  const items = ROWS.map((row) => classified(row, now)).sort(compareInboxOrder)

  return {
    status: 'ready',
    items,
    attentionCount: items.filter((item) => ATTENTION_CATEGORIES.includes(item.category)).length,
    lastUpdatedAt: new Date(now - 12_000).toISOString(),
    errorMessage: null,
    myLogin: ME,
    knownRepositories: ['acme/web-app', 'acme/api', 'acme/infra'],
  }
}
