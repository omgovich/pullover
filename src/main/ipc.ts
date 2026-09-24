import {
  type DeviceCodePayload,
  IPC,
  type McpStatus,
  type PrMenuAction,
  type PrMenuRequest,
} from '@shared/ipc'
import type { Settings, SnoozeType, UpdateState } from '@shared/types'
import {
  app,
  type BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  shell,
} from 'electron'
import type { Inbox } from './inbox'
import { prMenuEntries } from './pr-menu'
import { isSafeExternalUrl } from './safe-url'
import type { AppStore } from './store'

export interface IpcDeps {
  inbox: Inbox
  store: AppStore
  getWindow: () => BrowserWindow | null
  signIn: (onDeviceCode: (payload: DeviceCodePayload) => void) => Promise<void>
  cancelSignIn: () => void
  connectGitLab: (serverUrl: string, token: string) => Promise<void>
  switchProvider: (provider: Settings['provider']) => void
  canUseGitHubDeviceFlow: () => boolean
  signOut: () => void
  restartPolling: () => void
  getUpdate: () => UpdateState
  installUpdate: () => void
  applyShortcut: (accelerator: string | null) => void
  isShortcutActive: () => boolean
  getMcpStatus: () => McpStatus
  /** Starts or stops the MCP server to match `store.getSettings().mcpServerEnabled`. */
  applyMcpSetting: () => Promise<void>
}

export function registerIpc(deps: IpcDeps): void {
  const now = (): string => new Date().toISOString()

  // Pushed after every handler below that can change what `getSettings()`
  // returns, so `useSettings()` in the renderer stays in sync without
  // re-fetching — the same pattern `inbox`'s `onChange` uses for snapshots.
  const pushSettings = (): void => {
    deps.getWindow()?.webContents.send(IPC.settingsChanged, deps.store.getSettings())
  }

  ipcMain.handle(IPC.isShortcutActive, () => deps.isShortcutActive())

  ipcMain.handle(IPC.getMcpStatus, () => deps.getMcpStatus())

  ipcMain.handle(IPC.getLaunchAtLogin, () => app.getLoginItemSettings().openAtLogin)

  ipcMain.handle(IPC.setLaunchAtLogin, (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
    // What the system now reports, not what was asked for.
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

  // A native menu rather than a web one: the popup window is 440x620, and a
  // menu rendered inside it on the bottom card runs straight into the window
  // edge. The cost is that macOS paints it in the *system* appearance, so it
  // disagrees with the app when the theme setting is forced the other way.
  ipcMain.handle(IPC.showPrMenu, (_event, request: PrMenuRequest) => {
    return new Promise<PrMenuAction | null>((resolve) => {
      let chosen: PrMenuAction | null = null
      const template: MenuItemConstructorOptions[] = prMenuEntries(
        request.isSnoozed,
        request.provider,
      ).map((entry) =>
        entry.type === 'separator'
          ? { type: 'separator' }
          : {
              label: entry.label,
              click: () => {
                chosen = entry.action
              },
            },
      )

      Menu.buildFromTemplate(template).popup({
        window: deps.getWindow() ?? undefined,
        x: Math.round(request.x),
        y: Math.round(request.y),
        // Read a turn after Electron reports the menu closed: the click
        // handler above can land after this callback, and reading `chosen`
        // straight away would report a chosen item as a dismissal.
        callback: () => setTimeout(() => resolve(chosen), 0),
      })
    })
  })

  ipcMain.handle(IPC.copyText, (_event, text: string) => {
    clipboard.writeText(text)
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

  ipcMain.handle(IPC.setSettings, async (_event, patch: Partial<Settings>) => {
    if (patch.provider !== undefined) throw new Error('Use account switching to change provider')
    deps.store.updateSettings(patch)
    if (patch.pollIntervalMinutes !== undefined) deps.restartPolling()
    if (patch.watchAllRepositories !== undefined) deps.inbox.reclassify()
    // From the store, not the patch: it may correct an accelerator this build
    // no longer offers, and the OS must hold whatever the picker shows.
    if (patch.globalShortcut !== undefined) {
      deps.applyShortcut(deps.store.getSettings().globalShortcut)
    }
    // Awaited so the renderer's follow-up getMcpStatus sees the outcome of
    // the bind, not the moment before it.
    if (patch.mcpServerEnabled !== undefined) await deps.applyMcpSetting()
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

  ipcMain.handle(IPC.startAuth, async () => {
    await deps.signIn((payload) => {
      deps.getWindow()?.webContents.send(IPC.deviceCode, payload)
    })
    pushSettings()
  })

  ipcMain.handle(IPC.cancelAuth, () => deps.cancelSignIn())

  ipcMain.handle(IPC.canUseGitHubDeviceFlow, () => deps.canUseGitHubDeviceFlow())

  ipcMain.handle(IPC.connectGitLab, async (_event, serverUrl: string, token: string) => {
    if (typeof serverUrl !== 'string' || typeof token !== 'string') {
      throw new Error('GitLab URL and token are required')
    }
    await deps.connectGitLab(serverUrl, token)
    pushSettings()
  })

  ipcMain.handle(IPC.switchProvider, (_event, provider: Settings['provider']) => {
    deps.switchProvider(provider)
    pushSettings()
  })

  ipcMain.handle(IPC.signOut, () => deps.signOut())

  ipcMain.handle(IPC.hidePopup, () => {
    deps.getWindow()?.hide()
  })
}
