import { Menu, Tray, nativeImage, type Rectangle } from 'electron'

export function createTray(
  onToggle: (bounds: Rectangle) => void,
  onQuit: () => void,
): Tray {
  // An empty image plus a title renders as a text-only menu-bar item, which
  // means the app ships without an icon asset.
  const tray = new Tray(nativeImage.createEmpty())
  tray.setToolTip('GitHub Review Inbox')
  tray.setTitle('PR —')

  tray.on('click', (_event, bounds) => onToggle(bounds))
  tray.on('right-click', () => {
    tray.popUpContextMenu(
      Menu.buildFromTemplate([{ label: 'Выйти', click: onQuit }]),
    )
  })

  return tray
}

export function setBadge(tray: Tray, count: number): void {
  tray.setTitle(count > 0 ? `PR ${count}` : 'PR —')
}
