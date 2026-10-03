import { describe, expect, it } from 'vitest'
import { prMenuEntries } from './pr-menu'

function labels({ isSnoozed, isOwn = true }: { isSnoozed: boolean; isOwn?: boolean }): string[] {
  return prMenuEntries({ isSnoozed, isOwn })
    .filter((entry) => entry.type === 'item')
    .map((entry) => entry.label)
}

describe('prMenuEntries', () => {
  it('leads with the opens, then the copies, then snooze', () => {
    expect(labels({ isSnoozed: false })).toEqual([
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
    expect(labels({ isSnoozed: false, isOwn: false }).slice(-2)).toEqual([
      'Snooze until tomorrow',
      'Snooze until re-requested',
    ])
  })

  it('never offers it on your own pull request, which nobody asks you to review', () => {
    expect(labels({ isSnoozed: false, isOwn: true })).not.toContain('Snooze until re-requested')
  })

  it('collapses it into Unsnooze like the rest while snoozed', () => {
    expect(labels({ isSnoozed: true, isOwn: false })).not.toContain('Snooze until re-requested')
  })

  it('gives every item its own verb, so none leans on the section above it', () => {
    for (const label of labels({ isSnoozed: false, isOwn: false })) {
      expect(label).toMatch(/^(Open|Copy|Snooze) /)
    }
  })

  it('collapses the snooze options to Unsnooze when the pull request is snoozed', () => {
    expect(labels({ isSnoozed: true })).toEqual([
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
