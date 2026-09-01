import { join } from 'node:path'
import { BrowserWindow, screen, shell, type Rectangle } from 'electron'
import { isSafeExternalUrl } from './safe-url'

// The visible card — must match `.pv-shell`'s width/height in pullover.css.
const CARD_WIDTH = 452
const CARD_HEIGHT = 620

// Transparent space around the card so its `0 28px 64px rgba(0,0,0,0.62)`
// shadow has room to render instead of being clipped at the window edge.
// That shadow's blur radius (64px) plus its vertical offset (28px) reach
// 92px past the card's bottom edge — the single largest reach of either
// shadow layer — so a uniform padding needs to clear at least that on every
// side to stay symmetric. Must match `--pv-window-padding` in pullover.css.
const WINDOW_PADDING = 96

const WIDTH = CARD_WIDTH + WINDOW_PADDING * 2
const HEIGHT = CARD_HEIGHT + WINDOW_PADDING * 2

export function createPopupWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    // Transparent so the shell's rounded corners and drop shadow composite
    // over the desktop instead of painting as an opaque rectangle. A
    // transparent BrowserWindow can't be resized on macOS, which is fine
    // since resizable is already false below.
    transparent: true,
    backgroundColor: '#00000000',
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
