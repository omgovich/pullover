import { formatAge } from '@core/format'
import { describe, expect, it } from 'vitest'

const NOW = '2026-08-10T12:00:00Z'

describe('formatAge', () => {
  it('reports minutes under an hour', () => {
    expect(formatAge('2026-08-10T11:30:00Z', NOW)).toBe('30m ago')
  })

  it('reports "just now" under a minute', () => {
    expect(formatAge('2026-08-10T11:59:30Z', NOW)).toBe('just now')
  })

  it('reports hours under a day', () => {
    expect(formatAge('2026-08-10T09:00:00Z', NOW)).toBe('3h ago')
  })

  it('reports days beyond a day', () => {
    expect(formatAge('2026-08-05T12:00:00Z', NOW)).toBe('5d ago')
  })

  it('clamps a future timestamp to "just now"', () => {
    expect(formatAge('2026-08-10T13:00:00Z', NOW)).toBe('just now')
  })

  it('pins minute boundary at exactly 60 seconds', () => {
    expect(formatAge('2026-08-10T11:59:00Z', NOW)).toBe('1m ago')
  })

  it('pins hour boundary at exactly 3600 seconds', () => {
    expect(formatAge('2026-08-10T11:00:00Z', NOW)).toBe('1h ago')
  })

  it('pins day boundary at exactly 86400 seconds', () => {
    expect(formatAge('2026-08-09T12:00:00Z', NOW)).toBe('1d ago')
  })
})
