import type { UpdateState } from '@shared/types'
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

/**
 * How often to look for a new release. The app runs for weeks at a time, so
 * the interval is what actually delivers updates — the check at startup only
 * catches the rare relaunch.
 */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

/** A moment after launch, so the first check never competes with the first inbox fetch. */
const FIRST_CHECK_DELAY_MS = 30 * 1000

export interface UpdaterDeps {
  /** Called whenever the state changes, so the tray and the window can follow it. */
  onStateChange: (state: UpdateState) => void
}

/**
 * Wraps electron-updater: downloads a new release quietly in the background
 * and then waits, because deciding when to restart belongs to the user.
 *
 * The app has no native notifications by design, so a ready update announces
 * itself only inside the app — a line in the tray menu and a marker in the
 * window header, both fed from `getState()`.
 */
export class Updater {
  private state: UpdateState = { status: 'idle', version: null }
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly deps: UpdaterDeps) {}

  getState(): UpdateState {
    return this.state
  }

  /**
   * Begins checking. Does nothing unless the app is packaged: an unpackaged
   * build has no `app-update.yml`, so electron-updater would only ever throw,
   * and a dev run would report failures that say nothing about the release.
   */
  start(): void {
    if (!app.isPackaged) return

    // The download is meant to go unnoticed; installing is not, so it waits
    // for `install()` or for the user to quit on their own.
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('download-progress', () => {
      this.setState({ status: 'downloading', version: null })
    })

    autoUpdater.on('update-downloaded', (info) => {
      this.setState({ status: 'ready', version: info.version })
    })

    // A failed check is not worth surfacing: the user did not ask for one, and
    // the next check is hours away at worst. Reset so a failed download in
    // progress does not leave the interface claiming one is still running.
    autoUpdater.on('error', (error) => {
      console.warn('[updater]', error.message)
      if (this.state.status !== 'ready') this.setState({ status: 'idle', version: null })
    })

    this.timer = setInterval(() => this.check(), CHECK_INTERVAL_MS)
    setTimeout(() => this.check(), FIRST_CHECK_DELAY_MS)
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }

  /** Quits and relaunches into the downloaded version. */
  install(): void {
    if (this.state.status !== 'ready') return
    autoUpdater.quitAndInstall()
  }

  private check(): void {
    // Nothing to look for once a version is sitting there waiting.
    if (this.state.status === 'ready') return
    void autoUpdater.checkForUpdates().catch((error: Error) => {
      console.warn('[updater] check failed:', error.message)
    })
  }

  private setState(next: UpdateState): void {
    if (next.status === this.state.status && next.version === this.state.version) return
    this.state = next
    this.deps.onStateChange(next)
  }
}
