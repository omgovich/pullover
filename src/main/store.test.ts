import { beforeEach, describe, expect, it } from 'vitest'
import { AppStore } from './store'
import type { KeyValueStore, PersistedState } from './store'
import { DEFAULT_SETTINGS } from '@shared/types'

class MemoryStore implements KeyValueStore {
  private state: PersistedState = {
    settings: { ...DEFAULT_SETTINGS },
    snoozes: {},
  }

  get<K extends keyof PersistedState>(key: K): PersistedState[K] {
    return this.state[key]
  }

  set<K extends keyof PersistedState>(key: K, value: PersistedState[K]): void {
    this.state[key] = value
  }
}

const NOW = '2026-08-10T12:00:00Z'
let store: AppStore

beforeEach(() => {
  store = new AppStore(new MemoryStore())
})

describe('settings', () => {
  it('starts with a five minute poll interval', () => {
    expect(store.getSettings().pollIntervalMinutes).toBe(5)
  })

  it('applies a partial update', () => {
    store.updateSettings({ pollIntervalMinutes: 15 })
    expect(store.getSettings().pollIntervalMinutes).toBe(15)
    expect(store.getSettings().repositories).toEqual([])
  })

  it('defaults to watching every repo', () => {
    expect(store.getSettings().watchAllRepositories).toBe(true)
  })

  it('normalises a pre-existing settings file missing watchAllRepositories to true', () => {
    const backend = new MemoryStore()
    // Simulate a settings file written before `watchAllRepositories` existed:
    // the key is simply absent, not `undefined`-valued.
    backend.set('settings', {
      pollIntervalMinutes: 5,
      repositories: [],
    } as unknown as PersistedState['settings'])
    store = new AppStore(backend)
    expect(store.getSettings().watchAllRepositories).toBe(true)
  })

  it('preserves an explicit false rather than resurrecting it to true', () => {
    const backend = new MemoryStore()
    backend.set('settings', {
      pollIntervalMinutes: 5,
      repositories: ['acme/web'],
      watchAllRepositories: false,
    })
    store = new AppStore(backend)
    expect(store.getSettings().watchAllRepositories).toBe(false)
  })

  it('preserves other on-disk fields instead of clobbering them with defaults', () => {
    const backend = new MemoryStore()
    backend.set('settings', {
      pollIntervalMinutes: 42,
      repositories: ['acme/web', 'acme/api'],
    } as unknown as PersistedState['settings'])
    store = new AppStore(backend)
    expect(store.getSettings()).toEqual({
      pollIntervalMinutes: 42,
      repositories: ['acme/web', 'acme/api'],
      watchAllRepositories: true,
    })
  })

  it('round-trips a partial update through the normalised settings', () => {
    const backend = new MemoryStore()
    backend.set('settings', {
      pollIntervalMinutes: 5,
      repositories: [],
    } as unknown as PersistedState['settings'])
    store = new AppStore(backend)
    store.updateSettings({ watchAllRepositories: false })
    expect(store.getSettings().watchAllRepositories).toBe(false)
  })
})

describe('repositories', () => {
  it('adds a repository', () => {
    store.addRepository('acme/web')
    expect(store.getSettings().repositories).toEqual(['acme/web'])
  })

  it('ignores a duplicate', () => {
    store.addRepository('acme/web')
    store.addRepository('acme/web')
    expect(store.getSettings().repositories).toEqual(['acme/web'])
  })

  it('normalises case and surrounding whitespace', () => {
    store.addRepository('  ACME/Web  ')
    expect(store.getSettings().repositories).toEqual(['acme/web'])
  })

  it('rejects a value that is not owner/repo', () => {
    expect(() => store.addRepository('acme')).toThrow(/owner\/repo/)
  })

  it('rejects a value with more than one slash', () => {
    expect(() => store.addRepository('acme/web/extra')).toThrow(/owner\/repo/)
  })

  it('rejects a value with a trailing slash', () => {
    expect(() => store.addRepository('acme/')).toThrow(/owner\/repo/)
  })

  it('rejects a value with a leading slash', () => {
    expect(() => store.addRepository('/web')).toThrow(/owner\/repo/)
  })

  it('rejects an empty string', () => {
    expect(() => store.addRepository('')).toThrow(/owner\/repo/)
  })

  it('accepts owner/repo names with dots, hyphens and underscores', () => {
    store.addRepository('acme-co/my_repo.js')
    expect(store.getSettings().repositories).toEqual(['acme-co/my_repo.js'])
  })

  it('removes a repository', () => {
    store.addRepository('acme/web')
    store.addRepository('acme/api')
    store.removeRepository('acme/web')
    expect(store.getSettings().repositories).toEqual(['acme/api'])
  })
})

describe('snoozes', () => {
  it('records a timed snooze with a deadline', () => {
    store.snooze('PR_1', 'until-time', NOW, 3)
    const snooze = store.getSnoozes()['PR_1']
    expect(snooze?.type).toBe('until-time')
    expect(snooze?.snoozedAt).toBe(NOW)
    expect(snooze?.until).toBe('2026-08-10T15:00:00.000Z')
  })

  it('records a conditional snooze with no deadline', () => {
    store.snooze('PR_1', 'until-reply', NOW)
    const snooze = store.getSnoozes()['PR_1']
    expect(snooze?.type).toBe('until-reply')
    expect(snooze?.until).toBeUndefined()
  })

  it('requires hours for a timed snooze', () => {
    expect(() => store.snooze('PR_1', 'until-time', NOW)).toThrow(/hours/)
  })

  it('removes a snooze', () => {
    store.snooze('PR_1', 'until-reply', NOW)
    store.unsnooze('PR_1')
    expect(store.getSnoozes()['PR_1']).toBeUndefined()
  })
})
