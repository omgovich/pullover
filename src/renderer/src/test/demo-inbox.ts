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

const ME = 'vlad'

/**
 * A face per person, from DiceBear's `line-face` — CC0, so nothing here owes
 * an attribution line. The login is the seed, so everyone gets their own
 * face; the background is pinned rather than left to the seed, whose whole
 * palette is a muted beige that reads as five copies of one avatar.
 *
 * The style also survives both colour modes without a second set of URLs:
 * the strokes are dark, but they sit on a light disc rather than on
 * transparency, so nothing disappears into the dark theme.
 */
const AVATAR_STYLE = 'line-face'

const CAST = {
  vlad: 'c0aede',
  mchen: 'ffdfbf',
  sdiaz: 'd1d4f9',
  rojas: 'ffd5dc',
  tpark: 'a7e0a0',
}

function avatarUrl(login: keyof typeof CAST): string {
  return `https://api.dicebear.com/10.x/${AVATAR_STYLE}/svg?seed=${login}&backgroundColor=${CAST[login]}`
}

/**
 * Every avatar the demo draws, for the screenshot to warm before it captures.
 *
 * These are the one thing in the whole screenshot suite that comes over the
 * network — a deliberate exception, taken because the app fetches a real
 * GitHub avatar the same way. The cost is a red run when DiceBear is down.
 */
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
  // A stack of four, three of which need the user — so the run draws solid
  // between 1 and 2 and dotted where 3 is missing. Three different authors,
  // because a chain is grouped by its branches and not by who wrote them, and
  // one person's avatar three rows running looks like a rendering fault.
  {
    repository: 'acme/infra',
    number: 310,
    title: 'Deploy: extract build',
    author: 'rojas',
    additions: 218,
    deletions: 140,
    ci: 'success',
    category: 're-review',
    reason: 'Re-review requested',
    waitingMinutes: 5 * 60,
    stack: ['stack-infra', 1, 4],
  },
  {
    repository: 'acme/infra',
    number: 311,
    title: 'Deploy: sign in its own job',
    author: 'tpark',
    additions: 96,
    deletions: 12,
    ci: 'success',
    category: 're-review',
    reason: 'New commits',
    waitingMinutes: 8 * 60,
    stack: ['stack-infra', 2, 4],
  },
  {
    repository: 'acme/infra',
    number: 314,
    title: 'Deploy: notarize dmg',
    author: 'mchen',
    additions: 41,
    deletions: 9,
    ci: 'success',
    category: 're-review',
    reason: 'Re-review requested',
    waitingMinutes: 9 * 60,
    stack: ['stack-infra', 4, 4],
  },
  // Two rows only: they are all the user's own, so a third would just repeat
  // the same avatar again.
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
  {
    repository: 'acme/web-app',
    number: 2179,
    title: 'Search options at runtime',
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
    repository: 'acme/infra',
    number: 308,
    title: 'Pin the runner image',
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
    repository: 'acme/web-app',
    number: 2171,
    title: 'Form fields: tab order',
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
      authorAvatarUrl: avatarUrl(row.author),
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
