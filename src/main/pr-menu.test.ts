import { describe, expect, it } from 'vitest'
import { prMenuEntries } from './pr-menu'

function labels(isSnoozed: boolean): string[] {
  return prMenuEntries(isSnoozed)
    .filter((entry) => entry.type === 'item')
    .map((entry) => entry.label)
}

describe('prMenuEntries', () => {
  it('offers the three snooze options, worded as the snooze pill words them', () => {
    expect(labels(false).slice(0, 3)).toEqual([
      'Until something changes',
      'For 4 hours',
      'Until tomorrow',
    ])
  })

  it('collapses the snooze options to Unsnooze when the pull request is snoozed', () => {
    expect(labels(true)).toEqual([
      'Unsnooze',
      'Open on GitHub',
      'Open files changed',
      'Copy link',
      'Copy branch name',
    ])
  })

  it('names and separates the snooze, open and copy sections', () => {
    const shape = prMenuEntries(false).map((entry) => entry.type)
    expect(shape).toEqual([
      'header',
      'item',
      'item',
      'item',
      'separator',
      'header',
      'item',
      'item',
      'separator',
      'header',
      'item',
      'item',
    ])

    const headers = prMenuEntries(false)
      .filter((entry) => entry.type === 'header')
      .map((entry) => entry.label)
    expect(headers).toEqual(['Snooze', 'Open', 'Copy'])
  })

  it('keeps the Snooze heading over the collapsed Unsnooze item', () => {
    expect(prMenuEntries(true)[0]).toEqual({ type: 'header', label: 'Snooze' })
  })

  it('never repeats an action', () => {
    for (const isSnoozed of [false, true]) {
      const actions = prMenuEntries(isSnoozed)
        .filter((entry) => entry.type === 'item')
        .map((entry) => entry.action)
      expect(new Set(actions).size).toBe(actions.length)
    }
  })
})
