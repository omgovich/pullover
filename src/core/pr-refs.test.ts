import { formatRef, parseReferences, refKey } from '@core/pr-refs'
import { describe, expect, it } from 'vitest'

const SELF = { repository: 'acme/web', number: 7 }

describe('parseReferences', () => {
  it('reads a qualified reference, a pull request URL and a bare number, in order', () => {
    const body = [
      'Depends on acme/api#12 being deployed first.',
      'See https://github.com/other/lib/pull/3 and #5.',
    ].join('\n')

    expect(parseReferences(body, SELF)).toEqual([
      { repository: 'acme/api', number: 12 },
      { repository: 'other/lib', number: 3 },
      { repository: 'acme/web', number: 5 },
    ])
  })

  it('keeps the first of several spellings of the same pull request', () => {
    const body = 'acme/api#12, then https://github.com/Acme/API/pull/12 again'
    expect(parseReferences(body, SELF)).toEqual([{ repository: 'acme/api', number: 12 }])
  })

  it('leaves out the pull request itself', () => {
    const body = 'Follows #7 and https://github.com/acme/web/pull/7#discussion_r1'
    expect(parseReferences(body, SELF)).toEqual([])
  })

  it('does not read a fragment, an issue URL or a path segment as a reference', () => {
    const body = [
      'https://github.com/acme/web/pull/9#issuecomment-123',
      'https://github.com/acme/api/issues/4',
      'https://github.com/acme/api#readme',
      'heading ## Why',
      'step1#2',
      'xhttps://github.com/acme/api/pull/8',
      'https://github.com/acme/api/pull/12abc',
    ].join('\n')

    expect(parseReferences(body, SELF)).toEqual([{ repository: 'acme/web', number: 9 }])
  })

  it('skips a number no pull request can have, which GitHub would refuse to look up', () => {
    expect(parseReferences('#0 and #2147483648, then #2147483647', SELF)).toEqual([
      { repository: 'acme/web', number: 2_147_483_647 },
    ])
  })

  it('finds nothing in an empty description', () => {
    expect(parseReferences('', SELF)).toEqual([])
  })
})

describe('formatRef', () => {
  it('drops what the reference shares with the pull request it is shown on', () => {
    expect(formatRef({ repository: 'acme/web', number: 5 }, 'acme/web')).toBe('#5')
    expect(formatRef({ repository: 'acme/api', number: 5 }, 'acme/web')).toBe('api#5')
    expect(formatRef({ repository: 'other/lib', number: 5 }, 'acme/web')).toBe('other/lib#5')
  })

  it('compares owners and names without regard to case', () => {
    expect(formatRef({ repository: 'Acme/Web', number: 5 }, 'acme/web')).toBe('#5')
  })
})

describe('refKey', () => {
  it('is the same for any casing of the repository', () => {
    expect(refKey({ repository: 'Acme/API', number: 1 })).toBe(
      refKey({ repository: 'acme/api', number: 1 }),
    )
  })
})
