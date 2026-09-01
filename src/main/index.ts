import { app, clipboard, shell, type BrowserWindow, type Tray } from 'electron'
import { pollForToken, requestDeviceCode } from './auth/device-flow'
import { clearToken, loadToken, saveToken } from './auth/token-storage'
import { createGraphQLClient, type GraphQLClient } from './github/fetch-prs'
import { Inbox } from './inbox'
import { registerIpc } from './ipc'
import { createAppStore } from './store'
import { createTray, setBadge } from './tray'
import { createPopupWindow, togglePopup } from './window'
import { IPC } from '@shared/ipc'

const CLIENT_ID = import.meta.env.MAIN_VITE_GITHUB_CLIENT_ID as string | undefined

/** Opening the popup refetches when the data on screen is older than this. */
const STALE_AFTER_MS = 60_000

let window: BrowserWindow | null = null
let tray: Tray | null = null
let client: GraphQLClient | null = null

const store = createAppStore()

const inbox = new Inbox({
  store,
  getClient: () => client,
  onChange: (snapshot) => {
    window?.webContents.send(IPC.snapshotChanged, snapshot)
    if (tray !== null) setBadge(tray, snapshot.attentionCount)
  },
})

function loadClientFromDisk(): void {
  const token = loadToken()
  client = token === null ? null : createGraphQLClient(token)
}

function isStale(): boolean {
  const last = inbox.getSnapshot().lastUpdatedAt
  return last === null || Date.now() - Date.parse(last) > STALE_AFTER_MS
}

let signInInFlight: Promise<void> | null = null

async function doSignIn(
  onDeviceCode: (payload: { userCode: string; verificationUri: string }) => void,
): Promise<void> {
  if (!CLIENT_ID) {
    throw new Error('MAIN_VITE_GITHUB_CLIENT_ID is not set — fill in your .env')
  }

  const info = await requestDeviceCode(CLIENT_ID)
  onDeviceCode({
    userCode: info.userCode,
    verificationUri: info.verificationUri,
  })
  // The user has to type the code, so hand it to them via the clipboard too.
  clipboard.writeText(info.userCode)
  await shell.openExternal(info.verificationUri)

  const token = await pollForToken(CLIENT_ID, info)
  saveToken(token)
  client = createGraphQLClient(token)
  inbox.start()
}

/**
 * A device-code sign-in stays in flight for up to the code's expiry (15
 * minutes by default). A second concurrent call joins that same run instead
 * of starting an independent device-code cycle — two cycles would overwrite
 * each other's clipboard/UI and race to save the token and start polling.
 * The second caller's `onDeviceCode` is simply never invoked; it gets the
 * first run's outcome.
 */
function signIn(
  onDeviceCode: (payload: { userCode: string; verificationUri: string }) => void,
): Promise<void> {
  if (signInInFlight !== null) {
    return signInInFlight
  }

  const run = doSignIn(onDeviceCode)
  signInInFlight = run
  return run.finally(() => {
    signInInFlight = null
  })
}

function signOut(): void {
  clearToken()
  client = null
  inbox.stop()
  void inbox.refresh()
}

/**
 * Restarts polling after a settings change. Starting the timer while signed
 * out would just tick forever calling refresh(), which re-emits
 * signed-out each time — so this only (re)arms it when a client exists,
 * and makes sure it's stopped otherwise.
 */
function restartPolling(): void {
  if (client === null) {
    inbox.stop()
    return
  }
  inbox.start()
}

app.dock?.hide()

void app.whenReady().then(() => {
  loadClientFromDisk()
  window = createPopupWindow()

  tray = createTray({
    onToggle: (bounds) => {
      if (window === null) return
      const opening = !window.isVisible()
      togglePopup(window, bounds)
      // Opening onto a stale list is the one moment worth spending a fetch on.
      if (opening && client !== null && isStale()) void inbox.refresh()
    },
    onRefresh: () => void inbox.refresh(),
    onQuit: () => app.quit(),
    getStatus: () => inbox.getSnapshot().status,
  })

  registerIpc({
    inbox,
    store,
    getWindow: () => window,
    signIn,
    signOut,
    restartPolling,
  })

  if (client !== null) inbox.start()
})

// The app lives in the menu bar, so closing the popup must not quit it.
app.on('window-all-closed', () => {})
