import type { ClassifiedPullRequest } from '@shared/types'

/** Where to pop the menu, in window coordinates. */
export interface MenuAnchor {
  x: number
  y: number
}

/**
 * Popping exactly at the click puts the pointer inside the first item, which
 * comes up highlighted. macOS leaves the pointer in the menu's top-left
 * corner, clear of every row, so the menu hangs down and to the right of it.
 */
export function pointerAnchor(event: { clientX: number; clientY: number }): MenuAnchor {
  return { x: event.clientX + 2, y: event.clientY + 6 }
}

/**
 * Pops the card's context menu and carries out whatever was chosen.
 *
 * The main process only reports the choice, so every action runs through the
 * same calls the rest of the interface uses — which is what keeps a snooze
 * from the menu raising the same undo toast as a snooze from the pill.
 */
export async function showPrMenu(
  item: ClassifiedPullRequest,
  anchor: MenuAnchor,
  onSnoozed: (item: ClassifiedPullRequest) => void,
): Promise<void> {
  const action = await window.api.showPrMenu({ isSnoozed: item.isSnoozed, ...anchor })
  const { pr } = item

  switch (action) {
    case null:
      return
    case 'snooze-until-activity':
      await window.api.snooze(pr.id, 'until-activity')
      onSnoozed(item)
      return
    case 'snooze-4-hours':
      await window.api.snooze(pr.id, 'until-time', 4)
      onSnoozed(item)
      return
    case 'snooze-until-tomorrow':
      await window.api.snooze(pr.id, 'until-time', 24)
      onSnoozed(item)
      return
    case 'unsnooze':
      await window.api.unsnooze(pr.id)
      return
    case 'open':
      await window.api.openPr(pr.url)
      return
    case 'open-files':
      await window.api.openPr(`${pr.url}/files`)
      return
    case 'copy-link':
      await window.api.copyText(pr.url)
      return
    case 'copy-branch':
      await window.api.copyText(pr.headRefName)
      return
  }
}
