import type { InboxSnapshot } from '@shared/ipc'
import { describe, expect, it } from 'vitest'
import { formatBadgeTitle, formatRefreshItem, formatStatusLine, formatUpdateItem } from './tray'

// `Tray` needs a running Electron and cannot be constructed headlessly, so
// only the pure string-building is covered here.
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

  it('stays available mid-refresh, since a second call just queues one follow-up', () => {
    expect(formatRefreshItem('loading')).toEqual({ label: 'Refresh now', enabled: true })
  })

  it('explains why refreshing is unavailable when signed out', () => {
    expect(formatRefreshItem('signed-out')).toEqual({
      label: 'Sign in to refresh',
      enabled: false,
    })
  })
})

describe('formatStatusLine', () => {
  const NOW = '2026-09-02T12:00:00Z'
  const base: InboxSnapshot = {
    status: 'ready',
    items: [],
    attentionCount: 0,
    lastUpdatedAt: '2026-09-02T11:55:00Z',
    errorMessage: null,
    myLogin: 'vlad',
    knownRepositories: [],
  }

  it('says a refresh is running, matching the spinner in the window', () => {
    expect(formatStatusLine({ ...base, status: 'loading' }, NOW)).toBe('Refreshing…')
  })

  it('reports how stale the data is when idle', () => {
    expect(formatStatusLine(base, NOW)).toBe('Updated 5m ago')
  })

  it('reports a failed refresh without the raw API message', () => {
    expect(formatStatusLine({ ...base, status: 'error', errorMessage: 'boom' }, NOW)).toBe(
      "Couldn't refresh",
    )
  })

  it('prefers the running refresh over a previous error', () => {
    expect(formatStatusLine({ ...base, status: 'loading', errorMessage: 'boom' }, NOW)).toBe(
      'Refreshing…',
    )
  })

  it('says so before the first fetch', () => {
    expect(formatStatusLine({ ...base, lastUpdatedAt: null }, NOW)).toBe('Not fetched yet')
  })

  it('says so when signed out', () => {
    expect(formatStatusLine({ ...base, status: 'signed-out' }, NOW)).toBe('Not signed in')
  })
})

describe('formatUpdateItem', () => {
  it('offers the restart once a version is downloaded', () => {
    expect(formatUpdateItem({ status: 'ready', version: '0.4.0' })).toEqual({
      label: 'Restart to update to 0.4.0',
    })
  })

  it('names the version that is actually waiting', () => {
    expect(formatUpdateItem({ status: 'ready', version: '1.2.3' })?.label).toContain('1.2.3')
  })

  it('stays silent while nothing is waiting', () => {
    expect(formatUpdateItem({ status: 'idle', version: null })).toBeNull()
  })

  // The download needs nothing from the user, and an entry that appears and
  // disappears on its own is noise.
  it('stays silent while a download is in flight', () => {
    expect(formatUpdateItem({ status: 'downloading', version: null })).toBeNull()
  })

  // Defends the `version !== null` half of the guard: a ready state with no
  // version would otherwise render "Restart to update to null".
  it('stays silent if a ready state somehow carries no version', () => {
    expect(formatUpdateItem({ status: 'ready', version: null })).toBeNull()
  })
})
