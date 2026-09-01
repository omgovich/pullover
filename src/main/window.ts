import { join } from 'node:path'
import { BrowserWindow, screen, shell, type Rectangle } from 'electron'
import { CARD_HEIGHT, CARD_WIDTH, WINDOW_PADDING } from '@shared/geometry'
import { isSafeExternalUrl } from './safe-url'

// Transparent space around the card so its `0 28px 64px rgba(0,0,0,0.62)`
// shadow has room to render instead of being clipped at the window edge.
// See src/shared/geometry.ts for why each side gets a different amount, and
// for how the renderer stays in agreement with these numbers.
const WIDTH = CARD_WIDTH + WINDOW_PADDING.left + WINDOW_PADDING.right
const HEIGHT = CARD_HEIGHT + WINDOW_PADDING.top + WINDOW_PADDING.bottom

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

/**
 * Centres the popup's visible card under the tray item, clamped to the
 * display. The card, not the (larger, transparent) window, is what has to
 * meet the menu bar and stay on screen — the padding around it is free to
 * overhang the display edge since nothing is drawn there.
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
  const cardX = Math.round(
    Math.min(
      Math.max(
        trayBounds.x + trayBounds.width / 2 - CARD_WIDTH / 2,
        display.workArea.x,
      ),
      display.workArea.x + display.workArea.width - CARD_WIDTH,
    ),
  )
  const cardY = Math.round(trayBounds.y + trayBounds.height)

  win.setPosition(cardX - WINDOW_PADDING.left, cardY - WINDOW_PADDING.top, false)
  win.show()
  win.focus()
}
