import {
  DEFAULT_SETTINGS,
  LAYOUT_OPTIONS,
  type Settings,
  SHORTCUT_OPTIONS,
  type Snooze,
  type SnoozeRequest,
  TRIGGER_OPTIONS,
  type Trigger,
} from '@shared/types'
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
    const settings = { ...DEFAULT_SETTINGS, ...this.backend.get('settings') }

    // A shortcut the current build no longer offers would register fine but
    // match no option in settings, leaving the picker with nothing selected.
    const known =
      settings.globalShortcut === null ||
      SHORTCUT_OPTIONS.some((option) => option.value === settings.globalShortcut)

    const layoutKnown = LAYOUT_OPTIONS.some((option) => option.value === settings.layout)

    // A reason a later build dropped would otherwise count as muted forever.
    const mutedTriggers = settings.mutedTriggers.filter((trigger) =>
      TRIGGER_OPTIONS.some((option) => option.value === trigger),
    )

    return {
      ...settings,
      mutedTriggers,
      globalShortcut: known ? settings.globalShortcut : DEFAULT_SETTINGS.globalShortcut,
      layout: layoutKnown ? settings.layout : DEFAULT_SETTINGS.layout,
    }
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

  setTriggerMuted(trigger: Trigger, muted: boolean): void {
    const others = this.getSettings().mutedTriggers.filter((t) => t !== trigger)
    this.updateSettings({ mutedTriggers: muted ? [...others, trigger] : others })
  }

  getSnoozes(): Record<string, Snooze> {
    return this.backend.get('snoozes')
  }

  snooze({ prId, request, now }: { prId: string; request: SnoozeRequest; now: string }): void {
    const snooze: Snooze = { prId, type: request.type, snoozedAt: now }
    if (request.type === 'until-time') {
      snooze.until = new Date(Date.parse(now) + request.hours * 3_600_000).toISOString()
    }
    if (request.type === 'until-merged') snooze.blocker = request.blocker
    this.backend.set('snoozes', { ...this.getSnoozes(), [prId]: snooze })
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
