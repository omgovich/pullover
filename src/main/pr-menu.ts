import { formatRef } from '@core/pr-refs'
import type { PrMenuAction } from '@shared/ipc'
import type { PullRequestRef } from '@shared/types'

export type PrMenuEntry =
  | { type: 'separator' }
  | { type: 'item'; label: string; action: PrMenuAction }
  | { type: 'submenu'; label: string; entries: PrMenuEntry[] }

const SEPARATOR: PrMenuEntry = { type: 'separator' }

/** A description that links to more than this is a list of context, not of prerequisites. */
const MAX_BLOCKERS = 3

interface PrMenuOptions {
  isSnoozed: boolean
  repository: string
  /** Open pull requests the description links to, in its order. */
  blockers: PullRequestRef[]
}

/**
 * A submenu even for a single blocker, so a long repository name widens only
 * the submenu and the top level keeps one width whatever the description links to.
 */
function untilMerged(blockers: PullRequestRef[], repository: string): PrMenuEntry[] {
  if (blockers.length === 0) return []
  return [
    {
      type: 'submenu',
      label: 'Snooze until PR merges',
      entries: blockers.slice(0, MAX_BLOCKERS).map((blocker) => ({
        type: 'item',
        label: formatRef(blocker, repository),
        action: { type: 'snooze-until-merged', blocker },
      })),
    },
  ]
}

/**
 * The card's context menu, top to bottom: opens, then copies, then snooze.
 *
 * Every label carries its own verb, so no item depends on the section above
 * it to be read — which is also why the sections are only separated, not
 * headed. `type: 'header'` would say each verb once, but it draws as a real
 * heading only on macOS 14 and up, and this app still runs on 13.
 *
 * Kept apart from the `Menu.popup` call in `ipc.ts` so the wording and the
 * ordering can be tested without an Electron runtime.
 */
export function prMenuEntries({ isSnoozed, repository, blockers }: PrMenuOptions): PrMenuEntry[] {
  // "New activity" is deliberately vaguer than the wake condition in
  // `snooze.ts`, which is a push or a reply in a thread you are already in —
  // not every comment on the pull request.
  const snooze: PrMenuEntry[] = isSnoozed
    ? [{ type: 'item', label: 'Unsnooze', action: { type: 'unsnooze' } }]
    : [
        {
          type: 'item',
          label: 'Snooze until new activity',
          action: { type: 'snooze-until-activity' },
        },
        { type: 'item', label: 'Snooze for 4 hours', action: { type: 'snooze-4-hours' } },
        { type: 'item', label: 'Snooze until tomorrow', action: { type: 'snooze-until-tomorrow' } },
        ...untilMerged(blockers, repository),
      ]

  return [
    { type: 'item', label: 'Open on GitHub', action: { type: 'open' } },
    { type: 'item', label: 'Open files changed', action: { type: 'open-files' } },
    SEPARATOR,
    { type: 'item', label: 'Copy link', action: { type: 'copy-link' } },
    { type: 'item', label: 'Copy branch name', action: { type: 'copy-branch' } },
    SEPARATOR,
    ...snooze,
  ]
}
