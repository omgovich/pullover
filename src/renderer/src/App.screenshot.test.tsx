import { makePullRequest } from '@core/test-factory'
import type { InboxSnapshot } from '@shared/ipc'
import { Reshaped } from 'reshaped/bundle'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import App from './App'
import { stubApi } from './test/app-api'
import { AVATAR_SRC, makeItem } from './test/visual'
import type { ColorMode } from './useColorMode'

/**
 * Inbox zero, which is the one arrangement no single component holds: the
 * empty state takes the room the list isn't using, so the collapsed `waiting`
 * section ends up on the bottom edge of the scroll area — and gives that room
 * back the moment the section is opened. Both facts live in the shell (the
 * flex column in pullover.css and `EmptyState`'s `grow`), so this renders a
 * real `App` at the popup's real size rather than a component on its own.
 *
 * The list here is deliberately just long enough to overflow when opened;
 * with fewer rows the second case would be indistinguishable from the first.
 */

/** `CARD_WIDTH` and `CARD_HEIGHT` in src/main/window.ts. */
const SHELL_WIDTH_PX = 440
const SHELL_HEIGHT_PX = 620

const COLOR_MODES: readonly ColorMode[] = ['light', 'dark']

const HOUR_MS = 3_600_000

/** Long enough that opening the section overflows the popup. */
const TITLES = [
  'Retry the token refresh',
  'Drop the legacy poller',
  'Widen the repository filter',
  'Cache the classifier',
  'Bump electron to 44',
  'Tidy the snooze migration',
  'Split the fetch queue',
]

/**
 * Nothing waiting on the user, and a `waiting` section long enough to overflow
 * the popup once it's opened.
 *
 * Ages are offsets from `now` rather than the fixed clock the component cases
 * use, for the reason `demoSnapshot` gives: `App` reads its own clock and
 * nothing here can hand it one, while an offset still renders a constant.
 */
function inboxZero(now: number): InboxSnapshot {
  return {
    status: 'ready',
    items: TITLES.map((title, index) =>
      makeItem({
        category: 'waiting',
        reason: 'Waiting on reviewers',
        pr: makePullRequest({
          id: `PR_${index}`,
          number: 3512 - index,
          title,
          authorAvatarUrl: AVATAR_SRC,
          updatedAt: new Date(now - (index + 1) * HOUR_MS).toISOString(),
        }),
      }),
    ),
    attentionCount: 0,
    lastUpdatedAt: new Date(now - 12_000).toISOString(),
    errorMessage: null,
    myLogin: 'vlad',
    knownRepositories: ['acme/web'],
  }
}

function shellCase(name: string, openWaiting: boolean): void {
  for (const mode of COLOR_MODES) {
    test(`${name} (${mode})`, async () => {
      // Written onto `<html>` as well as passed to the provider, for the
      // reason spelled out in test/visual.tsx.
      document.documentElement.setAttribute('data-rs-color-mode', mode)
      stubApi(inboxZero(Date.now()), 'comfortable')

      const screen = await render(
        <Reshaped theme="slate" defaultColorMode={mode}>
          <div
            data-testid="shell"
            style={{ width: `${SHELL_WIDTH_PX}px`, height: `${SHELL_HEIGHT_PX}px` }}
          >
            <App />
          </div>
        </Reshaped>,
      )

      // The snapshot and the settings both arrive a microtask after mount, and
      // until they do `App` holds a spinner.
      const heading = screen.getByText('Waiting on others')
      await expect.element(heading).toBeVisible()
      if (openWaiting) {
        // Dispatched rather than clicked with the mouse: a real click leaves
        // the pointer sitting where the rows it just revealed now are, and
        // the cursor follows the pointer onto one of them — so the capture
        // would come out with a tinted row and its actions showing.
        const button = heading.element().closest('button')
        if (button === null) throw new Error('the section heading is not a button')
        button.click()
      }

      await expect.element(screen.getByTestId('shell')).toMatchScreenshot(`${name}-${mode}`)
    })
  }
}

shellCase('inbox-zero-pinned', false)
shellCase('inbox-zero-opened', true)
