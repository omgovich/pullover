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

interface PoppedMenu {
  items: { label?: string; type?: string; click?: () => void }[]
  options: { x: number; y: number; callback: () => void }
}

const poppedMenus: PoppedMenu[] = []
const clipboardWrites: string[] = []

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler) => {
      handlers.set(channel, handler)
    },
  },
  shell: { openExternal: vi.fn() },
  clipboard: {
    writeText: (text: string) => {
      clipboardWrites.push(text)
    },
  },
  Menu: {
    buildFromTemplate: (items: PoppedMenu['items']) => ({
      popup: (options: PoppedMenu['options']) => {
        poppedMenus.push({ items, options })
      },
    }),
  },
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
let hide: ReturnType<typeof vi.fn>
let shortcutCalls: (string | null)[]
let mcpApplied: number

beforeEach(() => {
  handlers.clear()
  poppedMenus.length = 0
  clipboardWrites.length = 0
  store = new AppStore(new MemoryStore())
  send = vi.fn()
  hide = vi.fn()
  shortcutCalls = []
  mcpApplied = 0
  const inbox = new Inbox({ store, getClient: () => null, onChange: () => {} })

  registerIpc({
    inbox,
    store,
    getWindow: () => ({ webContents: { send }, hide }) as unknown as BrowserWindow,
    signIn: async () => {},
    signOut: () => {},
    restartPolling: () => {},
    getUpdate: () => ({ status: 'idle', version: null }),
    installUpdate: () => {},
    applyShortcut: (accelerator: string | null) => {
      shortcutCalls.push(accelerator)
    },
    isShortcutActive: () => true,
    getMcpStatus: () => ({ listening: true, url: 'http://127.0.0.1:7855/mcp', error: null }),
    applyMcpSetting: async () => {
      mcpApplied += 1
    },
  })
})

function call(channel: string, ...args: never[]): unknown {
  const handler = handlers.get(channel)
  if (handler === undefined) throw new Error(`no handler registered for "${channel}"`)
  return handler(null, ...args)
}

describe('settings push', () => {
  it('pushes the updated settings after setSettings', async () => {
    await call(IPC.setSettings, { pollIntervalMinutes: 15 } as never)
    expect(store.getSettings().pollIntervalMinutes).toBe(15)
    expect(send).toHaveBeenCalledWith(IPC.settingsChanged, store.getSettings())
  })

  it('re-registers the global shortcut when it changes', async () => {
    await call(IPC.setSettings, { globalShortcut: 'Control+Alt+R' } as never)
    expect(shortcutCalls).toEqual(['Control+Alt+R'])
  })

  it('unregisters the global shortcut when it is turned off', async () => {
    await call(IPC.setSettings, { globalShortcut: null } as never)
    expect(shortcutCalls).toEqual([null])
  })

  // Counted, not merely inspected: a fake that only records its argument
  // cannot tell "never called" from "called with undefined", so dropping the
  // guard this test exists for would go unnoticed.
  it('leaves the shortcut alone when the patch does not mention it', async () => {
    await call(IPC.setSettings, { pollIntervalMinutes: 15 } as never)
    expect(shortcutCalls).toEqual([])
  })

  // The store may correct an accelerator it no longer offers; registering the
  // raw patch would leave the OS holding one key and the picker showing another.
  it('registers what the store settled on, not what the patch asked for', async () => {
    await call(IPC.setSettings, { globalShortcut: 'Alt+Space' } as never)
    expect(shortcutCalls).toEqual([store.getSettings().globalShortcut])
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

describe('MCP server', () => {
  it('reports the status main holds', () => {
    expect(call(IPC.getMcpStatus)).toEqual({
      listening: true,
      url: 'http://127.0.0.1:7855/mcp',
      error: null,
    })
  })

  it('applies the server setting, then pushes settings, when the patch toggles it', async () => {
    await call(IPC.setSettings, { mcpServerEnabled: true } as never)
    expect(store.getSettings().mcpServerEnabled).toBe(true)
    expect(mcpApplied).toBe(1)
    expect(send).toHaveBeenCalledWith(IPC.settingsChanged, store.getSettings())
  })

  it('leaves the server alone when the patch does not mention it', async () => {
    await call(IPC.setSettings, { pollIntervalMinutes: 15 } as never)
    expect(mcpApplied).toBe(0)
  })
})

describe('hidePopup', () => {
  it('hides the window', () => {
    call(IPC.hidePopup)
    expect(hide).toHaveBeenCalledTimes(1)
  })
})

describe('pull request context menu', () => {
  function popMenu(isSnoozed: boolean): { menu: PoppedMenu; action: Promise<unknown> } {
    const action = call(IPC.showPrMenu, {
      isSnoozed,
      x: 12.4,
      y: 40.6,
    } as never) as Promise<unknown>
    return { menu: poppedMenus[0], action }
  }

  function clickItem(menu: PoppedMenu, label: string): void {
    const item = menu.items.find((entry) => entry.label === label)
    if (item?.click === undefined) throw new Error(`no menu item labelled "${label}"`)
    item.click()
  }

  it('pops at whole pixels — Electron wants integer window coordinates', () => {
    const { menu } = popMenu(false)
    expect(menu.options.x).toBe(12)
    expect(menu.options.y).toBe(41)
  })

  it('reports the clicked item even when the close callback lands first', async () => {
    const { menu, action } = popMenu(false)
    menu.options.callback()
    clickItem(menu, 'Copy branch name')
    await expect(action).resolves.toBe('copy-branch')
  })

  it('reports the clicked item when the click lands first', async () => {
    const { menu, action } = popMenu(false)
    clickItem(menu, 'Open files changed')
    menu.options.callback()
    await expect(action).resolves.toBe('open-files')
  })

  it('resolves with null when the menu is dismissed', async () => {
    const { menu, action } = popMenu(false)
    menu.options.callback()
    await expect(action).resolves.toBeNull()
  })

  it('offers Unsnooze in place of the snooze options for a snoozed pull request', async () => {
    const { menu, action } = popMenu(true)
    expect(menu.items.filter((entry) => entry.type === 'separator')).toHaveLength(2)
    clickItem(menu, 'Unsnooze')
    menu.options.callback()
    await expect(action).resolves.toBe('unsnooze')
  })
})

describe('clipboard', () => {
  it('writes the given text', () => {
    call(IPC.copyText, 'feature/context-menu' as never)
    expect(clipboardWrites).toEqual(['feature/context-menu'])
  })
})
