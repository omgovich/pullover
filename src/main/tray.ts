import { Menu, Tray, nativeImage, type Rectangle } from 'electron'
import type { InboxSnapshot } from '@shared/ipc'

/**
 * Pure string-building for the tray title, kept separate so it can be unit
 * tested without constructing a real `Tray` (which needs a running Electron).
 */
export function formatBadgeTitle(count: number): string {
  if (count === 0) return 'No PRs'
  return count === 1 ? '1 PR' : `${count} PRs`
}

/**
 * The context menu's refresh entry, derived from the inbox's current status so
 * it explains itself instead of silently doing nothing. Pure, so it can be
 * tested without a running Electron.
 */
export function formatRefreshItem(status: InboxSnapshot['status']): {
  label: string
  enabled: boolean
} {
  if (status === 'signed-out') return { label: 'Sign in to refresh', enabled: false }
  if (status === 'loading') return { label: 'Refreshing…', enabled: false }
  return { label: 'Refresh now', enabled: true }
}

export interface TrayCallbacks {
  onToggle: (bounds: Rectangle) => void
  onRefresh: () => void
  onQuit: () => void
  /** Read when the menu is built, so the refresh entry reflects the moment. */
  getStatus: () => InboxSnapshot['status']
}

export function createTray(callbacks: TrayCallbacks): Tray {
  // An empty image plus a title renders as a text-only menu-bar item, which
  // means the app ships without an icon asset.
  const tray = new Tray(nativeImage.createEmpty())
  tray.setToolTip('Pullover')
  tray.setTitle(formatBadgeTitle(0))

  tray.on('click', (_event, bounds) => callbacks.onToggle(bounds))
  tray.on('right-click', () => {
    // Built fresh on every right-click rather than once, so the refresh entry
    // can reflect whatever the inbox is doing right now.
    const refresh = formatRefreshItem(callbacks.getStatus())
    tray.popUpContextMenu(
      Menu.buildFromTemplate([
        { label: refresh.label, enabled: refresh.enabled, click: callbacks.onRefresh },
        { type: 'separator' },
        { label: 'Quit', click: callbacks.onQuit },
      ]),
    )
  })

  return tray
}

export function setBadge(tray: Tray, count: number): void {
  tray.setTitle(formatBadgeTitle(count))
}
