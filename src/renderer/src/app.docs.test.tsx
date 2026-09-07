import type { Layout } from '@shared/types'
import { Reshaped } from 'reshaped/bundle'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import App from './App'
import { stubApi } from './test/app-api'
import { DEMO_AVATAR_URLS, demoSnapshot } from './test/demo-inbox'
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
 * Puts the avatars in the browser's cache before anything renders. They are
 * the one thing here that comes over the network, and a capture that beats
 * them to it records empty circles — silently, since a missing avatar is a
 * state the app draws rather than an error.
 */
async function warmAvatars(): Promise<void> {
  await Promise.all(
    DEMO_AVATAR_URLS.map(
      (src) =>
        new Promise<void>((resolve) => {
          const image = new Image()
          image.onload = () => resolve()
          image.onerror = () => resolve()
          image.src = src
        }),
    ),
  )
}

function documentationShot(name: string, mode: ColorMode, layout: Layout): void {
  test(name, async () => {
    await warmAvatars()

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
    // `complete` alone would be satisfied by an avatar that 404'd — an image
    // reports it either way — so this waits on the decoded size instead.
    await expect
      .poll(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0))
      .toBe(true)

    await expect.element(screen.getByTestId('desktop')).toMatchScreenshot(name)
  })
}

documentationShot('screenshot-light', 'light', 'comfortable')
documentationShot('screenshot-dark', 'dark', 'compact')
