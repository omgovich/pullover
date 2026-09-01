import { describe, expect, it } from 'vitest'
import { formatBadgeTitle, formatRefreshItem } from './tray'

// `Tray` needs a running Electron and cannot be constructed headlessly, so
// only the pure string-building is covered here. `createTray`/`setBadge`
// themselves stay untested, as they were before this change.
describe('formatBadgeTitle', () => {
  it('reads "No PRs" for zero', () => {
    expect(formatBadgeTitle(0)).toBe('No PRs')
  })

  it('reads "1 PR" for exactly one', () => {
    expect(formatBadgeTitle(1)).toBe('1 PR')
  })

  it('reads "<n> PRs" for anything else', () => {
    expect(formatBadgeTitle(16)).toBe('16 PRs')
  })
})

describe('formatRefreshItem', () => {
  it('offers a refresh once there is something to refresh', () => {
    expect(formatRefreshItem('ready')).toEqual({ label: 'Refresh now', enabled: true })
  })

  it('still offers a refresh after one failed', () => {
    expect(formatRefreshItem('error')).toEqual({ label: 'Refresh now', enabled: true })
  })

  it('reports progress instead of queueing a second refresh', () => {
    expect(formatRefreshItem('loading')).toEqual({ label: 'Refreshing…', enabled: false })
  })

  it('explains why refreshing is unavailable when signed out', () => {
    expect(formatRefreshItem('signed-out')).toEqual({
      label: 'Sign in to refresh',
      enabled: false,
    })
  })
})
