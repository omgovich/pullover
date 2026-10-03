import { describe, expect, it } from 'vitest'
import { prMenuEntries } from './pr-menu'

function labels(isSnoozed: boolean, isOwn = true): string[] {
  return prMenuEntries({ isSnoozed, isOwn })
    .filter((entry) => entry.type === 'item')
    .map((entry) => entry.label)
}

describe('prMenuEntries', () => {
  it('leads with the opens, then the copies, then snooze', () => {
    expect(labels(false)).toEqual([
      'Open on GitHub',
      'Open files changed',
      'Copy link',
      'Copy branch name',
      'Snooze until new activity',
      'Snooze for 4 hours',
      'Snooze until tomorrow',
    ])
  })

  it("offers to wait for a re-request on someone else's pull request, last", () => {
    expect(labels(false, false).slice(-2)).toEqual([
      'Snooze until tomorrow',
      'Snooze until re-requested',
    ])
  })

  it('never offers it on your own pull request, which nobody asks you to review', () => {
    expect(labels(false, true)).not.toContain('Snooze until re-requested')
  })

  it('collapses it into Unsnooze like the rest while snoozed', () => {
    expect(labels(true, false)).not.toContain('Snooze until re-requested')
  })

  it('gives every item its own verb, so none leans on the section above it', () => {
    for (const label of labels(false, false)) {
      expect(label).toMatch(/^(Open|Copy|Snooze) /)
    }
  })

  it('collapses the snooze options to Unsnooze when the pull request is snoozed', () => {
    expect(labels(true)).toEqual([
      'Open on GitHub',
      'Open files changed',
      'Copy link',
      'Copy branch name',
      'Unsnooze',
    ])
  })

  it('separates the opens, the copies and snooze into three sections', () => {
    const shape = prMenuEntries({ isSnoozed: false, isOwn: true }).map((entry) => entry.type)
    expect(shape).toEqual([
      'item',
      'item',
      'separator',
      'item',
      'item',
      'separator',
      'item',
      'item',
      'item',
    ])
  })

  it('never repeats an action', () => {
    for (const isSnoozed of [false, true]) {
      const actions = prMenuEntries({ isSnoozed, isOwn: false })
        .filter((entry) => entry.type === 'item')
        .map((entry) => entry.action)
      expect(new Set(actions).size).toBe(actions.length)
    }
  })
})
