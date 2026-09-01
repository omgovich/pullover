import { join } from 'node:path'
import { BrowserWindow, screen, shell, type Rectangle } from 'electron'
import { isSafeExternalUrl } from './safe-url'

const WIDTH = 452
const HEIGHT = 620

export function createPopupWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  })

  // Without this the window belongs to whichever Space it was created on, so
  // clicking the tray item on any other Space drags the user over to that one.
  // A menu-bar popup should appear where the user already is — including on
  // top of a fullscreen app, which is its own kind of Space.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Links inside the renderer always open in the user's browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url)
    } else {
      console.warn(`[window] refused to open unsafe URL: ${url}`)
    }
    return { action: 'deny' }
  })

  win.on('blur', () => {
    if (!win.webContents.isDevToolsOpened()) win.hide()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return win
}

/** Centres the popup under the tray item, clamped to the display. */
export function togglePopup(win: BrowserWindow, trayBounds: Rectangle): void {
  if (win.isVisible()) {
    win.hide()
    return
  }

  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x,
    y: trayBounds.y,
  })
  const x = Math.round(
    Math.min(
      Math.max(trayBounds.x + trayBounds.width / 2 - WIDTH / 2, display.workArea.x),
      display.workArea.x + display.workArea.width - WIDTH,
    ),
  )
  const y = Math.round(trayBounds.y + trayBounds.height)

  win.setPosition(x, y, false)
  win.show()
  win.focus()
}
