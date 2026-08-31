import { describe, expect, it } from 'vitest'
import { formatAge, formatDiff } from '@core/format'

const NOW = '2026-08-10T12:00:00Z'

describe('formatAge', () => {
  it('reports minutes under an hour', () => {
    expect(formatAge('2026-08-10T11:30:00Z', NOW)).toBe('30 мин назад')
  })

  it('reports "только что" under a minute', () => {
    expect(formatAge('2026-08-10T11:59:30Z', NOW)).toBe('только что')
  })

  it('reports hours under a day', () => {
    expect(formatAge('2026-08-10T09:00:00Z', NOW)).toBe('3 ч назад')
  })

  it('reports days beyond a day', () => {
    expect(formatAge('2026-08-05T12:00:00Z', NOW)).toBe('5 дн назад')
  })

  it('clamps a future timestamp to "только что"', () => {
    expect(formatAge('2026-08-10T13:00:00Z', NOW)).toBe('только что')
  })
})

describe('formatDiff', () => {
  it('renders both sides', () => {
    expect(formatDiff(12, 3)).toBe('+12 −3')
  })

  it('renders zeroes', () => {
    expect(formatDiff(0, 0)).toBe('+0 −0')
  })
})
