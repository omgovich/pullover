import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Shortcut } from './shortcut'

const registered = new Set<string>()
let taken: string | null = null

vi.mock('electron', () => ({
  globalShortcut: {
    register: (accelerator: string) => {
      if (accelerator === taken) return false
      registered.add(accelerator)
      return true
    },
    unregister: (accelerator: string) => registered.delete(accelerator),
    isRegistered: (accelerator: string) => registered.has(accelerator),
  },
}))

describe('Shortcut', () => {
  let shortcut: Shortcut

  beforeEach(() => {
    registered.clear()
    taken = null
    shortcut = new Shortcut(() => {})
  })

  it('registers the accelerator it is given', () => {
    expect(shortcut.apply('Control+Alt+P')).toBe(true)
    expect(shortcut.isActive()).toBe(true)
  })

  it('releases the previous accelerator when a new one replaces it', () => {
    shortcut.apply('Control+Alt+P')
    shortcut.apply('Control+Alt+R')
    expect(registered.has('Control+Alt+P')).toBe(false)
    expect(registered.has('Control+Alt+R')).toBe(true)
  })

  it('releases the accelerator when turned off, and reports inactive', () => {
    shortcut.apply('Control+Alt+P')
    expect(shortcut.apply(null)).toBe(false)
    expect(registered.size).toBe(0)
    expect(shortcut.isActive()).toBe(false)
  })

  it('reports inactive when something else owns the accelerator', () => {
    taken = 'Control+Alt+P'
    expect(shortcut.apply('Control+Alt+P')).toBe(false)
    expect(shortcut.isActive()).toBe(false)
  })

  // The conflict can end without the app restarting, so a failed registration
  // must be retried rather than remembered.
  it('takes the accelerator once whatever held it lets go', () => {
    taken = 'Control+Alt+P'
    shortcut.apply('Control+Alt+P')
    expect(shortcut.isActive()).toBe(false)

    taken = null
    expect(shortcut.isActive()).toBe(true)
  })

  // Only its own: another registration would be collateral damage.
  it('leaves accelerators it does not own alone', () => {
    registered.add('Command+Shift+X')
    shortcut.apply('Control+Alt+P')
    shortcut.apply(null)
    expect(registered.has('Command+Shift+X')).toBe(true)
  })
})
