import { DEFAULT_SETTINGS, type Settings } from '@shared/types'
import { visualCase } from '../test/visual'
import SettingsPanel from './SettingsPanel'

/**
 * The panel pulls four things off the IPC bridge on mount, so the bridge is
 * stubbed. Nothing else here talks to main until something is clicked.
 */
function stubApi(settings: Settings, launchAtLogin: boolean, shortcutActive: boolean): void {
  window.api = {
    getSettings: () => Promise.resolve(settings),
    onSettings: () => () => {},
    getLaunchAtLogin: () => Promise.resolve(launchAtLogin),
    isShortcutActive: () => Promise.resolve(shortcutActive),
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
