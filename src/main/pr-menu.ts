import type { PrMenuAction } from '@shared/ipc'

export type PrMenuEntry =
  | { type: 'separator' }
  | { type: 'item'; label: string; action: PrMenuAction }

const SEPARATOR: PrMenuEntry = { type: 'separator' }

/**
 * The card's context menu, top to bottom: snooze, then opens, then copies.
 *
 * Snooze leads rather than Open, against the macOS habit of leading with the
 * default action: opening is already one plain click away, and the card
 * itself leads with a Snooze pill — the menu agrees with the card.
 *
 * Kept apart from the `Menu.popup` call in `ipc.ts` so the wording and the
 * ordering can be tested without an Electron runtime.
 */
export function prMenuEntries(isSnoozed: boolean): PrMenuEntry[] {
  // The labels match `SnoozeMenu.tsx` exactly: two names for one action is
  // worse than one imperfect name.
  const snooze: PrMenuEntry[] = isSnoozed
    ? [{ type: 'item', label: 'Unsnooze', action: 'unsnooze' }]
    : [
        { type: 'item', label: 'Until something changes', action: 'snooze-until-activity' },
        { type: 'item', label: 'For 4 hours', action: 'snooze-4-hours' },
        { type: 'item', label: 'Until tomorrow', action: 'snooze-until-tomorrow' },
      ]

  return [
    ...snooze,
    SEPARATOR,
    { type: 'item', label: 'Open on GitHub', action: 'open' },
    { type: 'item', label: 'Open files changed', action: 'open-files' },
    SEPARATOR,
    { type: 'item', label: 'Copy link', action: 'copy-link' },
    { type: 'item', label: 'Copy branch name', action: 'copy-branch' },
  ]
}
