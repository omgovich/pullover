import type { BrowserWindow, Rectangle } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { togglePopup } from './window'

// A real `BrowserWindow` needs a running Electron, so `togglePopup` is
// exercised against a fake — it takes the window as an argument for exactly
// that reason. Only `screen` has to be faked out at the module level.
vi.mock('electron', () => ({
  BrowserWindow: class {},
  screen: {
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  },
  shell: { openExternal: vi.fn() },
}))

const TRAY_BOUNDS: Rectangle = { x: 1600, y: 0, width: 24, height: 24 }

function fakeWindow(visible: boolean) {
  const calls: { workspaces: unknown[]; shown: number; hidden: number } = {
    workspaces: [],
    shown: 0,
    hidden: 0,
  }
  const win = {
    isVisible: () => visible,
    hide: () => {
      calls.hidden += 1
    },
    setPosition: () => {},
    setVisibleOnAllWorkspaces: (_visible: boolean, options?: unknown) => {
      calls.workspaces.push(options)
    },
    show: () => {
      calls.shown += 1
    },
    focus: () => {},
  }
  return { win: win as unknown as BrowserWindow, calls }
}

describe('togglePopup', () => {
  // Without the flag Electron transforms the process type on every call, which
  // hides the app for a moment — long enough for macOS to swing the user over
  // to another Space and for the popup to lose focus and hide itself again.
  it('skips the process-type transform, the app already being an accessory', () => {
    const { win, calls } = fakeWindow(false)

    togglePopup(win, TRAY_BOUNDS)

    expect(calls.shown).toBe(1)
    expect(calls.workspaces).toEqual([
      { visibleOnFullScreen: true, skipTransformProcessType: true },
    ])
  })

  it('hides an open popup without touching its Space behaviour', () => {
    const { win, calls } = fakeWindow(true)

    togglePopup(win, TRAY_BOUNDS)

    expect(calls.hidden).toBe(1)
    expect(calls.workspaces).toEqual([])
  })
})
