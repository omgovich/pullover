import type { PrMenuAction } from '@shared/ipc'

export type PrMenuEntry =
  | { type: 'separator' }
  | { type: 'item'; label: string; action: PrMenuAction }

const SEPARATOR: PrMenuEntry = { type: 'separator' }

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
export function prMenuEntries(isSnoozed: boolean): PrMenuEntry[] {
  // The wording follows the options on the card's own snooze pill
  // (`SnoozeMenu.tsx`) — two names for one action is worse than one
  // imperfect name.
  const snooze: PrMenuEntry[] = isSnoozed
    ? [{ type: 'item', label: 'Unsnooze', action: 'unsnooze' }]
    : [
        { type: 'item', label: 'Snooze until something changes', action: 'snooze-until-activity' },
        { type: 'item', label: 'Snooze for 4 hours', action: 'snooze-4-hours' },
        { type: 'item', label: 'Snooze until tomorrow', action: 'snooze-until-tomorrow' },
      ]

  return [
    { type: 'item', label: 'Open on GitHub', action: 'open' },
    { type: 'item', label: 'Open files changed', action: 'open-files' },
    SEPARATOR,
    { type: 'item', label: 'Copy link', action: 'copy-link' },
    { type: 'item', label: 'Copy branch name', action: 'copy-branch' },
    SEPARATOR,
    ...snooze,
  ]
}
