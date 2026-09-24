import { DEFAULT_SETTINGS, type Settings } from '@shared/types'
import { Reshaped } from 'reshaped/bundle'
import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { visualCase } from '../test/visual'
import SettingsPanel from './SettingsPanel'

/**
 * The panel pulls five things off the IPC bridge on mount, so the bridge is
 * stubbed. Nothing else here talks to main until something is clicked.
 */
function stubApi(settings: Settings, launchAtLogin: boolean, shortcutActive: boolean): void {
  window.api = {
    getSettings: () => Promise.resolve(settings),
    onSettings: () => () => {},
    getLaunchAtLogin: () => Promise.resolve(launchAtLogin),
    isShortcutActive: () => Promise.resolve(shortcutActive),
    getMcpStatus: () =>
      Promise.resolve({ listening: true, url: 'http://127.0.0.1:7855/mcp', error: null }),
    switchProvider: async () => {},
  } as unknown as typeof window.api
}

const KNOWN = ['acme/web', 'acme/api', 'acme/infra']

/** The window's real height — `CARD_HEIGHT` in src/main/window.ts. */
const WINDOW_HEIGHT_PX = 620

/**
 * Always the window's own height. A taller box does not reveal more of the
 * panel: its root is `height="100%"`, so it sizes itself off the viewport
 * rather than off this box, and the extra only lands as dead space with the
 * footer dropped. So whatever a case does not fit is off-screen in the app
 * too, and scrolling to it is the app's job, not the fixture's.
 */
function panel(
  settings: Partial<Settings> = {},
  { launchAtLogin = false, shortcutActive = true, myLogin = 'alice' as string | null } = {},
): React.JSX.Element {
  stubApi({ ...DEFAULT_SETTINGS, ...settings }, launchAtLogin, shortcutActive)

  return (
    <div style={{ height: WINDOW_HEIGHT_PX }}>
      <SettingsPanel knownRepositories={KNOWN} myLogin={myLogin} onClose={() => {}} />
    </div>
  )
}

visualCase('default', () => panel())
visualCase('gitlab-account', () =>
  panel({ provider: 'gitlab', gitlabUrl: 'https://gitlab.example.com' }, { myLogin: 'devuser' }),
)

// Watching named repositories rather than all of them opens the list.
visualCase('repositories-picked', () =>
  panel({ watchAllRepositories: false, repositories: ['acme/api'] }),
)

// The only critical-coloured text on the screen: macOS refused the
// accelerator, so the shortcut is set but dead.
visualCase('shortcut-inactive', () => panel({}, { shortcutActive: false }))

// Compact layout selected, launch-at-login on — two controls whose selected
// state pullover.css repaints over Reshaped's own.
visualCase('compact-and-launch', () => panel({ layout: 'compact' }, { launchAtLogin: true }))

test('switches from GitLab to GitHub without signing out', async () => {
  document.documentElement.setAttribute('data-rs-color-mode', 'light')
  const screen = await render(
    <Reshaped theme="slate" defaultColorMode="light">
      <div style={{ width: '440px', height: WINDOW_HEIGHT_PX }}>
        {panel({ provider: 'gitlab' }, { myLogin: 'alenev' })}
      </div>
    </Reshaped>,
  )
  const switchProvider = vi.fn(async () => {})
  window.api.switchProvider = switchProvider
  await screen.getByRole('tab', { name: 'GitHub' }).click()
  expect(switchProvider).toHaveBeenCalledWith('github')
})

test('aligns Sign out with the right edge of other settings controls', async () => {
  const screen = await render(
    <Reshaped theme="slate" defaultColorMode="light">
      <div style={{ width: '440px', height: WINDOW_HEIGHT_PX }}>{panel()}</div>
    </Reshaped>,
  )

  const accountButton = screen.getByRole('tab', { name: 'GitHub' })
  const signOut = screen.getByRole('button', { name: 'Sign out' })
  const sponsor = screen.getByRole('button', { name: 'Sponsor' })
  await expect.element(accountButton).toBeVisible()
  await expect.element(signOut).toBeVisible()
  await expect.element(sponsor).toBeVisible()

  const accountRight = accountButton.element().getBoundingClientRect().right
  const signOutRight = signOut.element().getBoundingClientRect().right
  const sponsorRight = sponsor.element().getBoundingClientRect().right
  expect(Math.abs(signOutRight - accountRight)).toBeLessThanOrEqual(1)
  expect(Math.abs(sponsorRight - accountRight)).toBeLessThanOrEqual(1)
})
