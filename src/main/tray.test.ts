import { describe, expect, it } from 'vitest'
import { formatBadgeTitle } from './tray'

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
