import { formatAge, formatWait, formatWaiting, repositoryName } from '@core/format'
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

describe('formatWaiting', () => {
  it('reports minutes under an hour', () => {
    expect(formatWaiting('2026-08-10T11:30:00Z', NOW)).toBe('waiting 30m')
  })

  it('reports hours under a day', () => {
    expect(formatWaiting('2026-08-10T09:00:00Z', NOW)).toBe('waiting 3h')
  })

  it('reports days beyond a day', () => {
    expect(formatWaiting('2026-08-05T12:00:00Z', NOW)).toBe('waiting 5d')
  })

  it('reports "<1m" under a minute rather than "0m"', () => {
    expect(formatWaiting('2026-08-10T11:59:30Z', NOW)).toBe('waiting <1m')
  })

  it('clamps a future timestamp the same way', () => {
    expect(formatWaiting('2026-08-10T13:00:00Z', NOW)).toBe('waiting <1m')
  })

  it("shares formatAge's boundaries", () => {
    expect(formatWaiting('2026-08-10T11:59:00Z', NOW)).toBe('waiting 1m')
    expect(formatWaiting('2026-08-10T11:00:00Z', NOW)).toBe('waiting 1h')
    expect(formatWaiting('2026-08-09T12:00:00Z', NOW)).toBe('waiting 1d')
  })
})

describe('formatWait', () => {
  it('reports minutes, rounded up, under an hour', () => {
    expect(formatWait('2026-08-10T12:12:00Z', NOW)).toBe('12 minutes')
  })

  it('rounds a partial minute up rather than down', () => {
    // 12 minutes 1 second out must not read as "12 minutes" — that would be
    // a lie by a second's worth, and this is the direction where lying
    // short means telling the user to retry before GitHub will allow it.
    expect(formatWait('2026-08-10T12:12:01Z', NOW)).toBe('13 minutes')
  })

  it('reports "a minute" at or under one minute', () => {
    expect(formatWait('2026-08-10T12:00:30Z', NOW)).toBe('a minute')
    expect(formatWait('2026-08-10T12:01:00Z', NOW)).toBe('a minute')
  })

  it('reports "1 hour" for exactly one hour', () => {
    expect(formatWait('2026-08-10T13:00:00Z', NOW)).toBe('1 hour')
  })

  it('reports hours, rounded up, beyond an hour', () => {
    expect(formatWait('2026-08-10T13:30:00Z', NOW)).toBe('2 hours')
  })

  it('pins the minute boundary just past 60 seconds', () => {
    expect(formatWait('2026-08-10T12:01:01Z', NOW)).toBe('2 minutes')
  })
})

describe('repositoryName', () => {
  it('drops the owner', () => {
    expect(repositoryName('mozilla/pdf.js')).toBe('pdf.js')
    expect(repositoryName('omgovich/pullover')).toBe('pullover')
  })

  it('leaves a bare name alone', () => {
    expect(repositoryName('pullover')).toBe('pullover')
  })

  it('keeps the last segment when there are extra slashes', () => {
    expect(repositoryName('enterprise/team/repo')).toBe('repo')
  })

  it('survives the degenerate shapes rather than throwing', () => {
    expect(repositoryName('')).toBe('')
    expect(repositoryName('owner/')).toBe('')
  })
})
