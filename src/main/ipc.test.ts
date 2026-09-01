import { IPC } from '@shared/ipc'
import { DEFAULT_SETTINGS } from '@shared/types'
import type { BrowserWindow } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Inbox } from './inbox'
import { registerIpc } from './ipc'
import type { KeyValueStore, PersistedState } from './store'
import { AppStore } from './store'

type Handler = (event: unknown, ...args: never[]) => unknown

// `ipcMain.handle` just needs to record handlers so the test can invoke them
// directly — a real Electron runtime isn't available under vitest (importing
// 'electron' in node resolves to a binary path, not the API), which is why
// nothing else in `src/main` exercises `ipcMain` directly either.
const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler) => {
      handlers.set(channel, handler)
    },
  },
  shell: { openExternal: vi.fn() },
}))

class MemoryStore implements KeyValueStore {
  private state: PersistedState = { settings: { ...DEFAULT_SETTINGS }, snoozes: {} }

  get<K extends keyof PersistedState>(key: K): PersistedState[K] {
    return this.state[key]
  }

  set<K extends keyof PersistedState>(key: K, value: PersistedState[K]): void {
    this.state[key] = value
  }
}

let store: AppStore
let send: ReturnType<typeof vi.fn>

beforeEach(() => {
  handlers.clear()
  store = new AppStore(new MemoryStore())
  send = vi.fn()
  const inbox = new Inbox({ store, getClient: () => null, onChange: () => {} })

  registerIpc({
    inbox,
    store,
    getWindow: () => ({ webContents: { send } }) as unknown as BrowserWindow,
    signIn: async () => {},
    signOut: () => {},
    restartPolling: () => {},
  })
})

function call(channel: string, ...args: never[]): unknown {
  const handler = handlers.get(channel)
  if (handler === undefined) throw new Error(`no handler registered for "${channel}"`)
  return handler(null, ...args)
}

describe('settings push', () => {
  it('pushes the updated settings after setSettings', () => {
    call(IPC.setSettings, { pollIntervalMinutes: 15 } as never)
    expect(store.getSettings().pollIntervalMinutes).toBe(15)
    expect(send).toHaveBeenCalledWith(IPC.settingsChanged, store.getSettings())
  })

  it('pushes the updated settings after addRepository', () => {
    call(IPC.addRepository, 'acme/web' as never)
    expect(store.getSettings().repositories).toEqual(['acme/web'])
    expect(send).toHaveBeenCalledWith(IPC.settingsChanged, store.getSettings())
  })

  it('pushes the updated settings after removeRepository', () => {
    store.addRepository('acme/web')
    send.mockClear()
    call(IPC.removeRepository, 'acme/web' as never)
    expect(store.getSettings().repositories).toEqual([])
    expect(send).toHaveBeenCalledWith(IPC.settingsChanged, store.getSettings())
  })

  it('does not push when addRepository rejects an invalid name', () => {
    expect(() => call(IPC.addRepository, 'nonsense' as never)).toThrow(/owner\/repo/)
    expect(send).not.toHaveBeenCalled()
  })
})
