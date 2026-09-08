import type { BrowserWindow, Rectangle } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { togglePopup } from './window'

// A real BrowserWindow needs a running Electron, so togglePopup gets a fake.
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
    setVisibleOnAllWorkspaces: (visible: boolean, options?: unknown) =>
      calls.push(['workspaces', visible, options]),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
  }
  return { win: win as unknown as BrowserWindow, calls }
}

describe('togglePopup', () => {
  it('turns the all-Spaces flag on for the show and off again after', () => {
    const OPTIONS = { visibleOnFullScreen: true, skipTransformProcessType: true }
    const { win, calls } = fakeWindow(false)

    togglePopup(win, TRAY_BOUNDS)

    expect(calls).toEqual([
      ['workspaces', true, OPTIONS],
      'show',
      'focus',
      ['workspaces', false, OPTIONS],
    ])
  })

  it('hides an open popup without touching its Space behaviour', () => {
    const { win, calls } = fakeWindow(true)

    togglePopup(win, TRAY_BOUNDS)

    expect(calls).toEqual(['hide'])
  })
})
