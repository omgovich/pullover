import type { Settings } from '@shared/types'
import { useEffect, useState } from 'react'

/**
 * The single shared copy of `Settings`. Fetches once on mount, then stays in
 * sync via the `settingsChanged` push from main — anything that writes
 * through `window.api` (here or elsewhere) comes back through this same
 * subscription, so there is only ever one copy to drift.
 */
export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    void window.api.getSettings().then(setSettings)
    return window.api.onSettings(setSettings)
  }, [])

  return settings
}
