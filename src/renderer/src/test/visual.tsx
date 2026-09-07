import { orderSection, type StackCardRow, sectionRows } from '@core/stack'
import { makePullRequest } from '@core/test-factory'
import type { ClassifiedPullRequest, PullRequest, StackPosition } from '@shared/types'
import { Reshaped } from 'reshaped/bundle'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import type { ColorMode } from '../useColorMode'

/** The popup's own width — `CARD_WIDTH` in src/main/window.ts. */
const SHELL_WIDTH_PX = 440

const COLOR_MODES: readonly ColorMode[] = ['light', 'dark']

/**
 * Every fixture dates itself against this rather than against the clock, so
 * `formatAge` renders a constant.
 */
export const NOW = '2026-08-01T12:00:00Z'

/**
 * A flat square, inline rather than fetched: an avatar over the network
 * would make the screenshots depend on a third party being up, and an empty
 * `src` only ever exercises the initials fallback.
 */
export const AVATAR_SRC =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%236e56cf'/%3E%3C/svg%3E"

/** Two hours before `NOW`, matching the fixture PR's own `updatedAt`. */
const WAITING_SINCE = '2026-08-01T10:00:00Z'

export function makeItem(overrides: Partial<ClassifiedPullRequest> = {}): ClassifiedPullRequest {
  const category = overrides.category ?? 'needs-review'
  return {
    pr: makePullRequest({ authorAvatarUrl: AVATAR_SRC }),
    category,
    reason: 'Waiting on you',
    // Derived the way `classify` derives it — null exactly where nothing is
    // waiting on the user — so a `waiting` case cannot lock in a card the
    // app never draws.
    waitingSince: category === 'waiting' ? null : WAITING_SINCE,
    isSnoozed: false,
    stack: null,
    ...overrides,
  }
}

/** A lone card: no stack, so no connector segments above or below it. */
export function makeRow(
  pr: Partial<PullRequest> = {},
  item: Partial<ClassifiedPullRequest> = {},
): StackCardRow {
  const row = sectionRows([
    makeItem({ pr: makePullRequest({ authorAvatarUrl: AVATAR_SRC, ...pr }), ...item }),
  ])[0]
  if (row === undefined) throw new Error('sectionRows returned nothing')
  return row
}

/**
 * A stack's rows, put through the same two steps the app uses —
 * `orderSection` then `sectionRows`. Which segments each row draws is the
 * logic these screenshots exist to protect, so the fixture must not be the
 * thing that decides it: an earlier version handed `sectionRows` a
 * descending list and locked in a baseline of an arrangement the app never
 * draws.
 *
 * `shown` are the positions of the chain the list actually holds, out of
 * `total`. Holding every position draws solid segments; leaving a middle
 * position out is what draws a dotted break; leaving an end out is what
 * makes the line fade past the list.
 */
export function makeStackRows(
  total: number,
  shown: number[] = Array.from({ length: total }, (_, i) => i + 1),
): StackCardRow[] {
  const stack = (index: number): StackPosition => ({ id: 'PR_1', index, total })
  return sectionRows(
    orderSection(
      shown.map((index) =>
        makeItem({
          pr: makePullRequest({
            id: `PR_${index}`,
            number: index,
            title: `Stack member ${index}`,
            authorAvatarUrl: AVATAR_SRC,
          }),
          stack: stack(index),
        }),
      ),
    ),
  )
}

/**
 * Declares one visual case, screenshotted once per colour mode.
 *
 * Nothing here has to stop `Marquee` from animating, though it looks like it
 * should: `@vitest/browser` takes the screenshot with Playwright's
 * `animations: 'disabled'`, which rewinds an infinite animation to its first
 * frame and disables transitions. That is also why a case cannot capture the
 * marquee mid-travel — a stylesheet can seek it in the DOM, but the capture
 * puts it back.
 *
 * A function is called inside the test rather than at collection, which is
 * what a case needing setup of its own — a stubbed IPC bridge, say — hangs
 * that setup off.
 *
 * The mode is written onto `<html>` as well as passed to the provider: every
 * colour token is scoped by `data-rs-color-mode`, and the provider's prop
 * alone only reaches React context. See src/renderer/src/main.tsx.
 */
export function visualCase(name: string, ui: React.ReactNode | (() => React.ReactNode)): void {
  for (const mode of COLOR_MODES) {
    test(`${name} (${mode})`, async () => {
      document.documentElement.setAttribute('data-rs-color-mode', mode)
      const screen = await render(
        <Reshaped theme="slate" defaultColorMode={mode}>
          <div
            data-testid="visual-root"
            style={{
              width: `${SHELL_WIDTH_PX}px`,
              background: 'var(--rs-color-background-elevation-overlay)',
            }}
          >
            {typeof ui === 'function' ? ui() : ui}
          </div>
        </Reshaped>,
      )

      await expect.element(screen.getByTestId('visual-root')).toMatchScreenshot(`${name}-${mode}`)
    })
  }
}
