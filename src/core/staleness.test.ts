import { describe, expect, it } from 'vitest'
import { shouldRefreshOnOpen } from './staleness'

const NOW = '2026-08-10T12:00:00Z'

describe('shouldRefreshOnOpen', () => {
  it('fetches when nothing has been fetched yet', () => {
    expect(shouldRefreshOnOpen({ status: 'ready', lastUpdatedAt: null }, NOW)).toBe(true)
  })

  it('fetches when the list on screen is over a minute old', () => {
    const snapshot = { status: 'ready', lastUpdatedAt: '2026-08-10T11:58:00Z' } as const
    expect(shouldRefreshOnOpen(snapshot, NOW)).toBe(true)
  })

  it('leaves a list fetched moments ago alone', () => {
    const snapshot = { status: 'ready', lastUpdatedAt: '2026-08-10T11:59:30Z' } as const
    expect(shouldRefreshOnOpen(snapshot, NOW)).toBe(false)
  })

  // The one this exists for: at startup the first fetch is still running and
  // has set no `lastUpdatedAt` yet, so age alone said "fetch" and the open
  // queued a second, identical pass behind it.
  it('asks for nothing while a fetch is already running', () => {
    expect(shouldRefreshOnOpen({ status: 'loading', lastUpdatedAt: null }, NOW)).toBe(false)
    const stale = { status: 'loading', lastUpdatedAt: '2026-08-10T10:00:00Z' } as const
    expect(shouldRefreshOnOpen(stale, NOW)).toBe(false)
  })

  // A failed refresh keeps the last good list, and `lastUpdatedAt` still
  // dates that list — so the decision goes by its age, exactly as it does
  // when nothing failed. A recent list is left alone; an old one is refetched
  // whether or not the last attempt errored.
  it('goes by the age of the list, not by whether the last attempt failed', () => {
    const fresh = { status: 'error', lastUpdatedAt: '2026-08-10T11:59:55Z' } as const
    expect(shouldRefreshOnOpen(fresh, NOW)).toBe(false)
    const old = { status: 'error', lastUpdatedAt: '2026-08-10T11:50:00Z' } as const
    expect(shouldRefreshOnOpen(old, NOW)).toBe(true)
  })
})
