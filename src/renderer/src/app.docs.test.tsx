import type { InboxSnapshot } from '@shared/ipc'
import { DEFAULT_SETTINGS, type Layout } from '@shared/types'
import { Reshaped } from 'reshaped/bundle'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import App from './App'
import { demoSnapshot } from './test/demo-inbox'
import DesktopFrame from './test/desktop'
import type { ColorMode } from './useColorMode'

/**
 * The two pictures README shows, recorded the same way the component
 * screenshots are: a real `App` in a real Chromium, compared against the
 * committed PNG. Their baselines are `docs/*.png` themselves — see the `docs`
 * project in vitest.config.ts — so a change to the interface turns the run
 * red until `npm run docs:shots` brings the documentation back in step, and
 * the update lands in the pull request as an image diff.
 *
 * The one thing they can't cover is anything reached by clicking: the app
 * gets no menus, no settings panel and no hover here.
 */

/**
 * `App` pulls three things off the IPC bridge on mount and subscribes to each
 * of them. Nothing else is reachable without a click, so the rest of the
 * bridge stays absent.
 */
function stubApi(snapshot: InboxSnapshot, layout: Layout): void {
  window.api = {
    getSnapshot: () => Promise.resolve(snapshot),
    onSnapshot: () => () => {},
    getSettings: () => Promise.resolve({ ...DEFAULT_SETTINGS, layout }),
    onSettings: () => () => {},
    getUpdate: () => Promise.resolve({ status: 'idle', version: null }),
    onUpdate: () => () => {},
  } as unknown as typeof window.api
}

function documentationShot(name: string, mode: ColorMode, layout: Layout): void {
  test(name, async () => {
    // Written onto `<html>` as well as passed to the provider, for the reason
    // spelled out in visual.tsx.
    document.documentElement.setAttribute('data-rs-color-mode', mode)

    const snapshot = demoSnapshot(Date.now())
    stubApi(snapshot, layout)

    const screen = await render(
      <Reshaped theme="slate" defaultColorMode={mode}>
        <DesktopFrame mode={mode} count={snapshot.attentionCount}>
          <App />
        </DesktopFrame>
      </Reshaped>,
    )

    // The list arrives a microtask after mount, and until it does `App` holds
    // a spinner. Without this the capture can land on that frame.
    await expect.element(screen.getByText('Needs your review')).toBeVisible()

    await expect.element(screen.getByTestId('desktop')).toMatchScreenshot(name)
  })
}

documentationShot('screenshot-light', 'light', 'comfortable')
documentationShot('screenshot-dark', 'dark', 'compact')
