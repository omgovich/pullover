import type { BrowserWindow, Rectangle } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { togglePopup } from './window'

// A real `BrowserWindow` needs a running Electron, so `togglePopup` is
// exercised against a fake — it takes the window as an argument for that
// reason. Only `screen` has to be faked at the module level.
vi.mock('electron', () => ({
  BrowserWindow: class {},
  screen: {
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  },
  shell: { openExternal: vi.fn() },
}))

const TRAY_BOUNDS: Rectangle = { x: 1600, y: 0, width: 24, height: 24 }

/** Records calls in order, since the order is the part that matters here. */
function fakeWindow(visible: boolean) {
  const calls: unknown[] = []
  const win = {
    isVisible: () => visible,
    hide: () => calls.push('hide'),
    setPosition: () => {},
    setVisibleOnAllWorkspaces: (_visible: boolean, options?: unknown) =>
      calls.push(['workspaces', options]),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
  }
  return { win: win as unknown as BrowserWindow, calls }
}

describe('togglePopup', () => {
  // The flags have to be in place before the window is ordered in, or the
  // first show still lands on the Space the popup was last shown on. Skipping
  // the process-type transform keeps that call from re-hiding the whole app.
  it('sets the Space flags, transform skipped, before showing', () => {
    const { win, calls } = fakeWindow(false)

    togglePopup(win, TRAY_BOUNDS)

    expect(calls).toEqual([
      ['workspaces', { visibleOnFullScreen: true, skipTransformProcessType: true }],
      'show',
      'focus',
    ])
  })

  it('hides an open popup without touching its Space behaviour', () => {
    const { win, calls } = fakeWindow(true)

    togglePopup(win, TRAY_BOUNDS)

    expect(calls).toEqual(['hide'])
  })
})
