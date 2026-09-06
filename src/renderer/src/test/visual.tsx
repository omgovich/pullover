import { type StackCardRow, sectionRows } from '@core/stack'
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

export function makeItem(overrides: Partial<ClassifiedPullRequest> = {}): ClassifiedPullRequest {
  return {
    pr: makePullRequest({ authorAvatarUrl: AVATAR_SRC }),
    category: 'needs-review',
    reason: 'Waiting on you',
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
 * A whole stack's rows, built through `sectionRows` rather than by hand —
 * which segments each row draws is exactly the logic the connectors are
 * being screenshotted to protect.
 */
export function makeStackRows(count: number): StackCardRow[] {
  const stack = (index: number): StackPosition => ({ id: 'PR_1', index, total: count })
  return sectionRows(
    Array.from({ length: count }, (_, i) =>
      makeItem({
        pr: makePullRequest({
          id: `PR_${i + 1}`,
          number: i + 1,
          title: `Stack member ${i + 1}`,
          authorAvatarUrl: AVATAR_SRC,
        }),
        stack: stack(count - i),
      }),
    ),
  )
}

/**
 * Declares one visual case, screenshotted once per colour mode.
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
