import { type DeviceCodePayload, IPC } from '@shared/ipc'
import type { Settings, SnoozeType, UpdateState } from '@shared/types'
import { app, type BrowserWindow, ipcMain, shell } from 'electron'
import type { Inbox } from './inbox'
import { isSafeExternalUrl } from './safe-url'
import type { AppStore } from './store'

export interface IpcDeps {
  inbox: Inbox
  store: AppStore
  getWindow: () => BrowserWindow | null
  signIn: (onDeviceCode: (payload: DeviceCodePayload) => void) => Promise<void>
  signOut: () => void
  restartPolling: () => void
  getUpdate: () => UpdateState
  installUpdate: () => void
}

export function registerIpc(deps: IpcDeps): void {
  const now = (): string => new Date().toISOString()

  // Pushed after every handler below that can change what `getSettings()`
  // returns, so `useSettings()` in the renderer stays in sync without
  // re-fetching — the same pattern `inbox`'s `onChange` uses for snapshots.
  const pushSettings = (): void => {
    deps.getWindow()?.webContents.send(IPC.settingsChanged, deps.store.getSettings())
  }

  // Read straight back from macOS rather than from our own store: the user
  // can also change this in System Settings, and a persisted copy would
  // quietly disagree with reality.
  ipcMain.handle(IPC.getLaunchAtLogin, () => app.getLoginItemSettings().openAtLogin)

  ipcMain.handle(IPC.setLaunchAtLogin, (_event, enabled: boolean) => {
    // No `openAsHidden`: Electron dropped it, and this app does not need it
    // — it is LSUIElement and its window stays hidden until the tray is
    // clicked, so starting at login puts nothing on screen.
    app.setLoginItemSettings({ openAtLogin: enabled })
    // Return what the system now reports, not what was asked for, so a
    // refusal shows up in the interface instead of a toggle that lies.
    return app.getLoginItemSettings().openAtLogin
  })

  ipcMain.handle(IPC.getUpdate, () => deps.getUpdate())
  ipcMain.handle(IPC.installUpdate, () => deps.installUpdate())

  ipcMain.handle(IPC.getSnapshot, () => deps.inbox.getSnapshot())
  ipcMain.handle(IPC.refresh, () => deps.inbox.refresh())

  ipcMain.handle(IPC.openPr, (_event, url: string) => {
    if (!isSafeExternalUrl(url)) {
      console.warn(`[ipc] refused to open unsafe URL: ${url}`)
      return
    }
    return shell.openExternal(url)
  })

  ipcMain.handle(IPC.snooze, (_event, prId: string, type: SnoozeType, hours?: number) => {
    deps.store.snooze(prId, type, now(), hours)
    deps.inbox.reclassify()
  })

  ipcMain.handle(IPC.unsnooze, (_event, prId: string) => {
    deps.store.unsnooze(prId)
    deps.inbox.reclassify()
  })

  ipcMain.handle(IPC.getSettings, () => deps.store.getSettings())

  ipcMain.handle(IPC.setSettings, (_event, patch: Partial<Settings>) => {
    deps.store.updateSettings(patch)
    if (patch.pollIntervalMinutes !== undefined) deps.restartPolling()
    if (patch.watchAllRepositories !== undefined) deps.inbox.reclassify()
    pushSettings()
  })

  ipcMain.handle(IPC.addRepository, (_event, fullName: string) => {
    deps.store.addRepository(fullName)
    deps.inbox.reclassify()
    pushSettings()
  })

  ipcMain.handle(IPC.removeRepository, (_event, fullName: string) => {
    deps.store.removeRepository(fullName)
    deps.inbox.reclassify()
    pushSettings()
  })

  ipcMain.handle(IPC.startAuth, () =>
    deps.signIn((payload) => {
      deps.getWindow()?.webContents.send(IPC.deviceCode, payload)
    }),
  )

  ipcMain.handle(IPC.signOut, () => deps.signOut())

  ipcMain.handle(IPC.hidePopup, () => {
    deps.getWindow()?.hide()
  })
}
