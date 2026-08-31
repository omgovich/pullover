import Store from 'electron-store'
import {
  DEFAULT_SETTINGS,
  type Settings,
  type Snooze,
  type SnoozeType,
} from '@shared/types'

export interface PersistedState {
  settings: Settings
  snoozes: Record<string, Snooze>
  /** PR id → ISO timestamp of when the user last marked it seen. */
  seen: Record<string, string>
}

export interface KeyValueStore {
  get<K extends keyof PersistedState>(key: K): PersistedState[K]
  set<K extends keyof PersistedState>(key: K, value: PersistedState[K]): void
}

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/

export class AppStore {
  constructor(private readonly backend: KeyValueStore) {}

  getSettings(): Settings {
    return this.backend.get('settings')
  }

  updateSettings(patch: Partial<Settings>): void {
    this.backend.set('settings', { ...this.getSettings(), ...patch })
  }

  addRepository(fullName: string): void {
    const normalised = fullName.trim().toLowerCase()
    if (!REPO_PATTERN.test(normalised)) {
      throw new Error(`Репозиторий должен быть в формате owner/repo: "${fullName}"`)
    }
    const current = this.getSettings().repositories
    if (current.includes(normalised)) return
    this.updateSettings({ repositories: [...current, normalised] })
  }

  removeRepository(fullName: string): void {
    const normalised = fullName.trim().toLowerCase()
    this.updateSettings({
      repositories: this.getSettings().repositories.filter(
        (repo) => repo !== normalised,
      ),
    })
  }

  getSnoozes(): Record<string, Snooze> {
    return this.backend.get('snoozes')
  }

  snooze(prId: string, type: SnoozeType, now: string, hours?: number): void {
    if (type === 'until-time' && hours === undefined) {
      throw new Error('until-time snooze requires hours')
    }
    const until =
      type === 'until-time'
        ? new Date(Date.parse(now) + hours! * 3_600_000).toISOString()
        : undefined
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

  getSeen(): Record<string, string> {
    return this.backend.get('seen')
  }

  markSeen(prId: string, now: string): void {
    this.backend.set('seen', { ...this.getSeen(), [prId]: now })
  }
}

export function createAppStore(): AppStore {
  const backend = new Store<PersistedState>({
    name: 'github-review-inbox',
    defaults: { settings: { ...DEFAULT_SETTINGS }, snoozes: {}, seen: {} },
  })
  return new AppStore(backend)
}
