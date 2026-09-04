import { globalShortcut } from 'electron'

/**
 * Owns the global shortcut that opens the popup.
 *
 * `register` returns false when something else already owns the accelerator,
 * and macOS gives no way to find out who. The caller is told, so settings can
 * say the shortcut isn't working rather than leaving a key that does nothing.
 */
export class Shortcut {
  private active = false

  constructor(private readonly onTrigger: () => void) {}

  isActive(): boolean {
    return this.active
  }

  apply(accelerator: string | null): boolean {
    globalShortcut.unregisterAll()
    this.active = accelerator !== null && globalShortcut.register(accelerator, this.onTrigger)
    if (accelerator !== null && !this.active) {
      console.warn(`[shortcut] ${accelerator} is already taken`)
    }
    return this.active
  }
}
