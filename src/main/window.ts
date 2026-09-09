import { join } from 'node:path'
import { BrowserWindow, type Rectangle, screen, shell } from 'electron'
import { isSafeExternalUrl } from './safe-url'

// The window is exactly the size of the popup's visible card: the renderer's
// shell fills it edge to edge, so these are the only place the size lives.
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

  // On only for the show, so the window lands on the Space the user is on.
  // Without `skipTransformProcessType` Electron re-runs the process-type
  // transform, which blurs the popup into hiding itself (electron/electron#37875).
  win.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  })

  win.show()
  win.focus()

  // Off again straight after, so the popup belongs to this Space and leaves
  // with it. `visibleOnFullScreen` must stay true: omitted, it clears the
  // fullscreen-auxiliary bit that `fullscreenable: false` set.
  win.setVisibleOnAllWorkspaces(false, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  })
}
