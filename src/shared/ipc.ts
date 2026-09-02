import type { ClassifiedPullRequest, Settings, SnoozeType } from './types'

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
}
