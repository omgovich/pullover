import type { ClassifiedPullRequest, Settings, SnoozeType, UpdateState } from './types'

export interface InboxSnapshot {
  status: 'signed-out' | 'loading' | 'ready' | 'error'
  items: ClassifiedPullRequest[]
  attentionCount: number
  lastUpdatedAt: string | null
  errorMessage: string | null
  myLogin: string | null
  /** Repositories seen in the fetched pull requests, for the settings picker. */
  knownRepositories: string[]
}

export interface DeviceCodePayload {
  userCode: string
  verificationUri: string
}

export const IPC = {
  getSnapshot: 'inbox:get-snapshot',
  snapshotChanged: 'inbox:snapshot-changed',
  refresh: 'inbox:refresh',
  openPr: 'inbox:open-pr',
  snooze: 'inbox:snooze',
  unsnooze: 'inbox:unsnooze',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  settingsChanged: 'settings:changed',
  addRepository: 'settings:add-repository',
  removeRepository: 'settings:remove-repository',
  startAuth: 'auth:start',
  deviceCode: 'auth:device-code',
  signOut: 'auth:sign-out',
  hidePopup: 'window:hide-popup',
  getUpdate: 'update:get',
  updateChanged: 'update:changed',
  installUpdate: 'update:install',
  getLaunchAtLogin: 'system:get-launch-at-login',
  setLaunchAtLogin: 'system:set-launch-at-login',
} as const

export interface RendererApi {
  getSnapshot: () => Promise<InboxSnapshot>
  onSnapshot: (listener: (snapshot: InboxSnapshot) => void) => () => void
  onDeviceCode: (listener: (payload: DeviceCodePayload) => void) => () => void
  refresh: () => Promise<void>
  openPr: (url: string) => Promise<void>
  snooze: (prId: string, type: SnoozeType, hours?: number) => Promise<void>
  unsnooze: (prId: string) => Promise<void>
  getSettings: () => Promise<Settings>
  setSettings: (patch: Partial<Settings>) => Promise<void>
  onSettings: (listener: (settings: Settings) => void) => () => void
  addRepository: (fullName: string) => Promise<void>
  removeRepository: (fullName: string) => Promise<void>
  startAuth: () => Promise<void>
  signOut: () => Promise<void>
  hidePopup: () => Promise<void>
  getUpdate: () => Promise<UpdateState>
  onUpdate: (listener: (state: UpdateState) => void) => () => void
  /** Quits and relaunches into the downloaded version. */
  installUpdate: () => Promise<void>
  /**
   * Whether macOS starts Pullover at login. This is not part of `Settings`:
   * it lives in the system's own login items, so macOS is the single source
   * of truth and the value is read back from there rather than persisted
   * here — otherwise turning it off in System Settings would leave this
   * app confidently claiming the opposite.
   */
  getLaunchAtLogin: () => Promise<boolean>
  setLaunchAtLogin: (enabled: boolean) => Promise<boolean>
}
