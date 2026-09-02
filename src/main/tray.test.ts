import type { InboxSnapshot } from '@shared/ipc'
import { describe, expect, it } from 'vitest'
import { formatBadgeTitle, formatRefreshItem, formatStatusLine } from './tray'

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
