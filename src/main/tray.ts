import { formatAge } from '@core/format'
import type { InboxSnapshot } from '@shared/ipc'
import type { UpdateState } from '@shared/types'
import { Menu, type Rectangle, Tray } from 'electron'
import { createTrayIcon } from './tray-icon'

/**
 * Pure string-building for the tray title, kept separate so it can be unit
 * tested without constructing a real `Tray` (which needs a running Electron).
 */
export function formatBadgeTitle(count: number): string {
  if (count === 0) return 'No PRs'
  return count === 1 ? '1 PR' : `${count} PRs`
}

/**
 * The disabled line at the top of the menu, saying what the inbox is doing.
 * It exists so the menu and the popup's own spinner never disagree about
 * whether a refresh is running — they now read the same `status`.
 */
export function formatStatusLine(snapshot: InboxSnapshot, now: string): string {
  if (snapshot.status === 'signed-out') return 'Not signed in'
  if (snapshot.status === 'loading') return 'Refreshing…'
  if (snapshot.errorMessage !== null) return "Couldn't refresh"
  if (snapshot.lastUpdatedAt === null) return 'Not fetched yet'
  return `Updated ${formatAge(snapshot.lastUpdatedAt, now)}`
}

/**
 * The refresh entry stays clickable while a refresh is running: `refresh()`
 * coalesces a call made mid-pass into a single follow-up, so accepting the
 * click is harmless, and refusing it was worse than useless when opening the
 * popup already starts a refresh whenever the data is over a minute old. The
 * status line above carries the state instead.
 */
export function formatRefreshItem(status: InboxSnapshot['status']): {
  label: string
  enabled: boolean
} {
  if (status === 'signed-out') return { label: 'Sign in to refresh', enabled: false }
  return { label: 'Refresh now', enabled: true }
}

/**
 * The update line, or null when there is nothing to say. A download in
 * progress stays silent on purpose: it needs nothing from the user, and a
 * menu entry that appears and vanishes on its own is just noise.
 */
export function formatUpdateItem(state: UpdateState): { label: string } | null {
  if (state.status !== 'ready' || state.version === null) return null
  return { label: `Restart to update to ${state.version}` }
}

export interface TrayCallbacks {
  onToggle: (bounds: Rectangle) => void
  onRefresh: () => void
  onQuit: () => void
  onInstallUpdate: () => void
  /** Read when the menu is built, so the menu reflects the moment it opened. */
  getSnapshot: () => InboxSnapshot
  getUpdate: () => UpdateState
}

export function createTray(callbacks: TrayCallbacks): Tray {
  const tray = new Tray(createTrayIcon())
  tray.setToolTip('Pullover')
  tray.setTitle(formatBadgeTitle(0))

  tray.on('click', (_event, bounds) => callbacks.onToggle(bounds))
  tray.on('right-click', () => {
    // Built fresh on every right-click rather than once, so the refresh entry
    // can reflect whatever the inbox is doing right now.
    const snapshot = callbacks.getSnapshot()
    const refresh = formatRefreshItem(snapshot.status)
    const update = formatUpdateItem(callbacks.getUpdate())
    tray.popUpContextMenu(
      Menu.buildFromTemplate([
        // Above the status line: it is the one entry here that is news.
        ...(update === null
          ? []
          : ([
              { label: update.label, click: callbacks.onInstallUpdate },
              { type: 'separator' },
            ] as const)),
        { label: formatStatusLine(snapshot, new Date().toISOString()), enabled: false },
        { type: 'separator' },
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
