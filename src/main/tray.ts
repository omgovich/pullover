import { Menu, Tray, nativeImage, type Rectangle } from 'electron'

/**
 * Pure string-building for the tray title, kept separate so it can be unit
 * tested without constructing a real `Tray` (which needs a running Electron).
 */
export function formatBadgeTitle(count: number): string {
  if (count === 0) return 'No PRs'
  return count === 1 ? '1 PR' : `${count} PRs`
}

export function createTray(
  onToggle: (bounds: Rectangle) => void,
  onQuit: () => void,
): Tray {
  // An empty image plus a title renders as a text-only menu-bar item, which
  // means the app ships without an icon asset.
  const tray = new Tray(nativeImage.createEmpty())
  tray.setToolTip('Pullover')
  tray.setTitle(formatBadgeTitle(0))

  tray.on('click', (_event, bounds) => onToggle(bounds))
  tray.on('right-click', () => {
    tray.popUpContextMenu(
      Menu.buildFromTemplate([{ label: 'Quit', click: onQuit }]),
    )
  })

  return tray
}

export function setBadge(tray: Tray, count: number): void {
  tray.setTitle(formatBadgeTitle(count))
}
