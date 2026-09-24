import { shouldRefreshOnOpen } from '@core/staleness'
import { IPC } from '@shared/ipc'
import { app, type BrowserWindow, clipboard, type Rectangle, shell, type Tray } from 'electron'
import { Accounts } from './accounts'
import { pollForToken, requestDeviceCode } from './auth/device-flow'
import { clearToken, loadToken, saveToken } from './auth/token-storage'
import { createGraphQLClient } from './github/fetch-prs'
import { createGitLabClient, normalizeGitLabUrl } from './gitlab/client'
import { fetchGitLabViewer } from './gitlab/fetch-mrs'
import { Inbox } from './inbox'
import { registerIpc } from './ipc'
import { mcpUrl, PulloverMcpServer } from './mcp/server'
import { Shortcut } from './shortcut'
import { createAppStore } from './store'
import { createTray, setBadge } from './tray'
import { Updater } from './updater'
import { createPopupWindow, togglePopup } from './window'

// Before anything resolves a path or touches the keychain: both are derived
// from the app name, so a dev run would otherwise share the installed app's
// settings, token and Safe Storage key — and, being ad-hoc signed, make macOS
// prompt for the keychain password every time the two disagreed.
if (!app.isPackaged) app.setName(`${app.getName()} Dev`)

const CLIENT_ID = import.meta.env.MAIN_VITE_GITHUB_CLIENT_ID as string | undefined

let window: BrowserWindow | null = null
let tray: Tray | null = null

const store = createAppStore()

const inbox = new Inbox({
  store,
  getClient: () => accounts.getGitHubClient(),
  getGitLabClient: () => accounts.getGitLabClient(),
  onChange: (snapshot) => {
    window?.webContents.send(IPC.snapshotChanged, snapshot)
    if (tray !== null) setBadge(tray, snapshot.attentionCount, store.getSettings().provider)
  },
  // A revoked or expired token fails every refresh identically, so a
  // refresh that recognises one signs the user out instead of leaving them
  // staring at a stale list forever.
  onAuthError: (failed) => accounts.handleAuthError(failed),
})

const accounts = new Accounts({
  store,
  inbox,
  tokens: { load: loadToken, save: saveToken, clear: clearToken },
  createGitHubClient: createGraphQLClient,
  createGitLabClient,
  normalizeGitLabUrl,
  verifyGitLab: fetchGitLabViewer,
  deviceFlow: CLIENT_ID
    ? {
        requestCode: (signal) => requestDeviceCode(CLIENT_ID, fetch, signal),
        pollForToken: (info, signal) => pollForToken(CLIENT_ID, info, { signal }),
        present: async (info) => {
          // The user has to type the code, so hand it to them via the clipboard too.
          clipboard.writeText(info.userCode)
          await shell.openExternal(info.verificationUri)
        },
      }
    : null,
})

// A dev Pullover and an installed one must not fight for the socket.
const MCP_PORT = app.isPackaged ? 7855 : 7856

const mcp = new PulloverMcpServer({ inbox, store, version: app.getVersion() })

function applyMcpSetting(): Promise<void> {
  return store.getSettings().mcpServerEnabled ? mcp.start(MCP_PORT) : mcp.stop()
}

function shouldFetchOnOpen(): boolean {
  if (!accounts.isConnected()) return false
  return shouldRefreshOnOpen(inbox.getSnapshot(), new Date().toISOString())
}

// Pushes a changed update state to both surfaces that show it, so the tray
// menu and the window header can never disagree about whether one is ready.
const updater = new Updater({
  onStateChange: (state) => {
    window?.webContents.send(IPC.updateChanged, state)
  },
})

/** `bounds` come from the click that opened it, or from the tray itself when a keypress did. */
function toggle(bounds: Rectangle): void {
  if (window === null) return
  const opening = !window.isVisible()
  togglePopup(window, bounds)
  // Opening onto a stale list is the one moment worth spending a fetch on.
  if (opening && shouldFetchOnOpen()) void inbox.refresh()
}

const shortcut = new Shortcut(() => {
  if (tray !== null) toggle(tray.getBounds())
})

app.dock?.hide()

void app.whenReady().then(() => {
  accounts.loadFromDisk()
  window = createPopupWindow()

  tray = createTray({
    onToggle: toggle,
    onRefresh: () => void inbox.refresh(),
    onQuit: () => app.quit(),
    onInstallUpdate: () => updater.install(),
    getSnapshot: () => inbox.getSnapshot(),
    getUpdate: () => updater.getState(),
  })

  registerIpc({
    inbox,
    store,
    getWindow: () => window,
    signIn: (onDeviceCode) => accounts.signIn(onDeviceCode),
    cancelSignIn: () => accounts.cancelSignIn(),
    connectGitLab: (serverUrl, token) => accounts.connectGitLab(serverUrl, token),
    switchProvider: (provider) => accounts.switchProvider(provider),
    canUseGitHubDeviceFlow: () => Boolean(CLIENT_ID),
    signOut: () => accounts.signOut(),
    restartPolling: () => accounts.restartPolling(),
    getUpdate: () => updater.getState(),
    installUpdate: () => updater.install(),
    applyShortcut: (accelerator) => shortcut.apply(accelerator),
    isShortcutActive: () => shortcut.isActive(),
    getMcpStatus: () => {
      const status = mcp.status()
      return { listening: status.listening, url: mcpUrl(MCP_PORT), error: status.error }
    },
    applyMcpSetting,
  })

  if (accounts.isConnected()) inbox.start()
  updater.start()
  shortcut.apply(store.getSettings().globalShortcut)
  void applyMcpSetting()
})

// The app lives in the menu bar, so closing the popup must not quit it.
app.on('window-all-closed', () => {})

// Frees the port before the relaunch `installUpdate` triggers, which would
// otherwise find it held by the process on its way out.
app.on('before-quit', () => void mcp.stop())
