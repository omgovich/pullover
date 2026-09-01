import { type DeviceCodePayload, IPC } from '@shared/ipc'
import type { Settings, SnoozeType } from '@shared/types'
import { type BrowserWindow, ipcMain, shell } from 'electron'
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
}

export function registerIpc(deps: IpcDeps): void {
  const now = (): string => new Date().toISOString()

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
  })

  ipcMain.handle(IPC.addRepository, (_event, fullName: string) => {
    deps.store.addRepository(fullName)
    deps.inbox.reclassify()
  })

  ipcMain.handle(IPC.removeRepository, (_event, fullName: string) => {
    deps.store.removeRepository(fullName)
    deps.inbox.reclassify()
  })

  ipcMain.handle(IPC.startAuth, () =>
    deps.signIn((payload) => {
      deps.getWindow()?.webContents.send(IPC.deviceCode, payload)
    }),
  )

  ipcMain.handle(IPC.signOut, () => deps.signOut())
}
