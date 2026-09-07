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
const HOUR_MS = 60 * MINUTE_MS

/**
 * A flat colour square, inline rather than fetched — the same reasoning as
 * `AVATAR_SRC` in visual.tsx — with a hue per author, so the list doesn't
 * read as one person talking to themselves.
 */
function avatar(hex: string): string {
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%23${hex}'/%3E%3C/svg%3E`
}

const ME = 'vlad'

const AUTHORS: Record<string, string> = {
  vlad: avatar('6e56cf'),
  mchen: avatar('0f9d8b'),
  sdiaz: avatar('d6409f'),
  rojas: avatar('e0842a'),
  tpark: avatar('3a7bd5'),
}

interface DemoRow {
  repository: string
  number: number
  title: string
  author: keyof typeof AUTHORS
  additions: number
  deletions: number
  ci: 'success' | 'failure' | 'pending' | 'none'
  category: Category
  reason: string
  /** How long the ball has been in the user's court, in minutes. */
  waitingMinutes: number | null
  /** Position in a stack, as `index/total`, or null for a lone pull request. */
  stack: [id: string, index: number, total: number] | null
  snoozed?: boolean
}

const ROWS: DemoRow[] = [
  {
    repository: 'acme/web-app',
    number: 2184,
    title: 'Lazy-load the preview pane',
    author: 'mchen',
    additions: 412,
    deletions: 96,
    ci: 'success',
    category: 'needs-review',
    reason: 'Review requested',
    waitingMinutes: 18,
    stack: null,
  },
  {
    repository: 'acme/api',
    number: 2181,
    title: 'Split view for compare mode',
    author: 'sdiaz',
    additions: 733,
    deletions: 214,
    ci: 'pending',
    category: 'needs-review',
    reason: 'Review requested',
    waitingMinutes: 2 * 60,
    stack: null,
  },
  {
    repository: 'acme/api',
    number: 2177,
    title: 'Retry policy for webhooks',
    author: 'rojas',
    additions: 96,
    deletions: 41,
    ci: 'success',
    category: 'needs-review',
    reason: 'Review requested',
    waitingMinutes: 6 * 60,
    stack: null,
  },
  {
    repository: 'acme/web-app',
    number: 2168,
    title: 'Form fields: tab order',
    author: 'tpark',
    additions: 64,
    deletions: 28,
    ci: 'success',
    category: 're-review',
    reason: 'Re-review requested',
    waitingMinutes: 26 * 60,
    stack: null,
  },
  {
    repository: 'acme/api',
    number: 2182,
    title: 'Cache the parsed layout',
    author: 'vlad',
    additions: 573,
    deletions: 24,
    ci: 'failure',
    category: 'my-pr-action',
    reason: 'CI is red',
    waitingMinutes: 3 * 60,
    stack: null,
  },
  // A stack of four, three of which need the user — so the run draws solid
  // between 1 and 2 and dotted where 3 is missing.
  {
    repository: 'acme/infra',
    number: 310,
    title: 'Deploy: extract build',
    author: 'vlad',
    additions: 218,
    deletions: 140,
    ci: 'success',
    category: 'my-pr-action',
    reason: 'Changes requested',
    waitingMinutes: 5 * 60,
    stack: ['stack-infra', 1, 4],
  },
  {
    repository: 'acme/infra',
    number: 311,
    title: 'Deploy: sign in its own job',
    author: 'vlad',
    additions: 96,
    deletions: 12,
    ci: 'success',
    category: 'my-pr-action',
    reason: '2 open threads',
    waitingMinutes: 8 * 60,
    stack: ['stack-infra', 2, 4],
  },
  {
    repository: 'acme/infra',
    number: 314,
    title: 'Deploy: notarize the dmg',
    author: 'vlad',
    additions: 41,
    deletions: 9,
    ci: 'success',
    category: 'my-pr-action',
    reason: 'Ready to merge',
    waitingMinutes: 9 * 60,
    stack: ['stack-infra', 4, 4],
  },
  {
    repository: 'acme/web-app',
    number: 2190,
    title: 'Release notes for 4.2',
    author: 'rojas',
    additions: 33,
    deletions: 4,
    ci: 'success',
    category: 'mentioned',
    reason: 'Mentioned',
    waitingMinutes: 45,
    stack: null,
  },
  {
    repository: 'acme/api',
    number: 2176,
    title: 'Rate limit the search API',
    author: 'mchen',
    additions: 128,
    deletions: 37,
    ci: 'success',
    category: 'mentioned',
    reason: 'Mentioned',
    waitingMinutes: 4 * 60,
    stack: null,
  },
  {
    repository: 'acme/web-app',
    number: 2150,
    title: 'Drop the print stylesheet',
    author: 'vlad',
    additions: 12,
    deletions: 304,
    ci: 'success',
    category: 'waiting',
    reason: 'Waiting on reviewers',
    waitingMinutes: null,
    stack: null,
  },
  {
    repository: 'acme/web-app',
    number: 2146,
    title: 'Bump the icon set to v2',
    author: 'tpark',
    additions: 8,
    deletions: 8,
    ci: 'success',
    category: 'waiting',
    reason: 'Snoozed',
    waitingMinutes: null,
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
      authorAvatarUrl: AUTHORS[row.author],
      additions: row.additions,
      deletions: row.deletions,
      ciStatus: row.ci,
      // Only read for the `waiting` rows, which have no waiting time to show.
      updatedAt: iso(2 * HOUR_MS),
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
  const items = ROWS.map((row) => classified(row, now))

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
