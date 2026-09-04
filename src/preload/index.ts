import { type DeviceCodePayload, type InboxSnapshot, IPC, type RendererApi } from '@shared/ipc'
import type { Settings, SnoozeType, UpdateState } from '@shared/types'
import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.off(channel, handler)
  }
}

const api: RendererApi = {
  getSnapshot: () => ipcRenderer.invoke(IPC.getSnapshot),
  onSnapshot: (listener: (snapshot: InboxSnapshot) => void) =>
    subscribe(IPC.snapshotChanged, listener),
  onDeviceCode: (listener: (payload: DeviceCodePayload) => void) =>
    subscribe(IPC.deviceCode, listener),
  refresh: () => ipcRenderer.invoke(IPC.refresh),
  openPr: (url: string) => ipcRenderer.invoke(IPC.openPr, url),
  snooze: (prId: string, type: SnoozeType, hours?: number) =>
    ipcRenderer.invoke(IPC.snooze, prId, type, hours),
  unsnooze: (prId: string) => ipcRenderer.invoke(IPC.unsnooze, prId),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (patch: Partial<Settings>) => ipcRenderer.invoke(IPC.setSettings, patch),
  onSettings: (listener: (settings: Settings) => void) => subscribe(IPC.settingsChanged, listener),
  addRepository: (fullName: string) => ipcRenderer.invoke(IPC.addRepository, fullName),
  removeRepository: (fullName: string) => ipcRenderer.invoke(IPC.removeRepository, fullName),
  startAuth: () => ipcRenderer.invoke(IPC.startAuth),
  signOut: () => ipcRenderer.invoke(IPC.signOut),
  hidePopup: () => ipcRenderer.invoke(IPC.hidePopup),
  getUpdate: () => ipcRenderer.invoke(IPC.getUpdate),
  onUpdate: (listener: (state: UpdateState) => void) => subscribe(IPC.updateChanged, listener),
  installUpdate: () => ipcRenderer.invoke(IPC.installUpdate),
  getLaunchAtLogin: () => ipcRenderer.invoke(IPC.getLaunchAtLogin),
  setLaunchAtLogin: (enabled: boolean) => ipcRenderer.invoke(IPC.setLaunchAtLogin, enabled),
  isShortcutActive: () => ipcRenderer.invoke(IPC.isShortcutActive),
}

contextBridge.exposeInMainWorld('api', api)
