import { join } from 'node:path'
import { BrowserWindow, type Rectangle, screen, shell } from 'electron'
import { isSafeExternalUrl } from './safe-url'

// The window is exactly the size of the popup's visible card — must match
// `.pv-shell`'s width/height in src/renderer/src/pullover.css.
const CARD_WIDTH = 440
const CARD_HEIGHT = 620

export function createPopupWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
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

/**
 * Centres the popup window under the tray item, its top at the tray item's
 * bottom, clamped horizontally so it stays inside the display's work area.
 */
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
      Math.max(trayBounds.x + trayBounds.width / 2 - CARD_WIDTH / 2, display.workArea.x),
      display.workArea.x + display.workArea.width - CARD_WIDTH,
    ),
  )
  const y = Math.round(trayBounds.y + trayBounds.height)

  win.setPosition(x, y, false)

  // Re-applied on every show, not once at creation: macOS resets a window's
  // collection behaviour when it is hidden, so a flag set at startup stops
  // applying after the first dismiss and the popup starts dragging the user
  // back to the Space it was last shown on. Setting it here keeps the popup
  // appearing wherever the user already is, including over a fullscreen app.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  win.show()
  win.focus()
}
