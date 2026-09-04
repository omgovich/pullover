import { globalShortcut } from 'electron'

/**
 * Owns the global shortcut that opens the popup.
 *
 * `register` returns false when something else already owns the accelerator,
 * and macOS gives no way to find out who. The caller is told, so settings can
 * say the shortcut isn't working rather than leaving a key that does nothing.
 */
export class Shortcut {
  private accelerator: string | null = null

  constructor(private readonly onTrigger: () => void) {}

  /**
   * Re-checked rather than remembered: the app holding the accelerator may
   * have quit since, and a cached `false` would keep reporting a conflict
   * that is over — and keep the key dead — for the rest of the session.
   */
  isActive(): boolean {
    if (this.accelerator === null) return false
    if (globalShortcut.isRegistered(this.accelerator)) return true
    return this.apply(this.accelerator)
  }

  apply(accelerator: string | null): boolean {
    if (this.accelerator !== null) globalShortcut.unregister(this.accelerator)
    this.accelerator = accelerator
    if (accelerator === null) return false

    const registered = globalShortcut.register(accelerator, this.onTrigger)
    if (!registered) console.warn(`[shortcut] ${accelerator} is already taken`)
    return registered
  }
}
