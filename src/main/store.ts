import { DEFAULT_SETTINGS, type Settings, type Snooze, type SnoozeType } from '@shared/types'
import Store from 'electron-store'

export interface PersistedState {
  settings: Settings
  snoozes: Record<string, Snooze>
}

export interface KeyValueStore {
  get<K extends keyof PersistedState>(key: K): PersistedState[K]
  set<K extends keyof PersistedState>(key: K, value: PersistedState[K]): void
}

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/

export class AppStore {
  constructor(private readonly backend: KeyValueStore) {}

  getSettings(): Settings {
    // electron-store's default-merge is shallow at the top level only: an
    // on-disk `settings` object wins outright over `defaults.settings`, so a
    // settings file written before a new field existed comes back with that
    // field simply missing (`undefined`), not defaulted. Merge here so every
    // consumer sees a fully-populated `Settings` with real booleans — a
    // missing key falls back to `DEFAULT_SETTINGS`, while any key actually
    // present on disk (including an explicit `false`) always wins.
    return { ...DEFAULT_SETTINGS, ...this.backend.get('settings') }
  }

  updateSettings(patch: Partial<Settings>): void {
    this.backend.set('settings', { ...this.getSettings(), ...patch })
  }

  addRepository(fullName: string): void {
    const normalised = fullName.trim().toLowerCase()
    if (!REPO_PATTERN.test(normalised)) {
      throw new Error(`Repository needs to look like owner/repo — got "${fullName}"`)
    }
    const current = this.getSettings().repositories
    if (current.includes(normalised)) return
    this.updateSettings({ repositories: [...current, normalised] })
  }

  removeRepository(fullName: string): void {
    const normalised = fullName.trim().toLowerCase()
    this.updateSettings({
      repositories: this.getSettings().repositories.filter((repo) => repo !== normalised),
    })
  }

  getSnoozes(): Record<string, Snooze> {
    return this.backend.get('snoozes')
  }

  snooze(prId: string, type: SnoozeType, now: string, hours?: number): void {
    let until: string | undefined
    if (type === 'until-time') {
      if (hours === undefined) {
        throw new Error('until-time snooze requires hours')
      }
      until = new Date(Date.parse(now) + hours * 3_600_000).toISOString()
    }
    this.backend.set('snoozes', {
      ...this.getSnoozes(),
      [prId]: { prId, type, snoozedAt: now, until },
    })
  }

  unsnooze(prId: string): void {
    const next = { ...this.getSnoozes() }
    delete next[prId]
    this.backend.set('snoozes', next)
  }
}

export function createAppStore(): AppStore {
  const backend = new Store<PersistedState>({
    name: 'pullover',
    defaults: { settings: { ...DEFAULT_SETTINGS }, snoozes: {} },
  })
  return new AppStore(backend)
}
