import { DEFAULT_SETTINGS, type Settings } from '@shared/types'
import { useEffect, useState } from 'react'

/**
 * `Settings` as the renderer sees them: fetched once on mount, then kept in
 * step by the `settingsChanged` push from main. Anything written through
 * `window.api` comes back through that same subscription, so every caller of
 * this hook holds the same values even though each holds its own copy.
 */
export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    // Falling back rather than staying null: App holds the whole inbox behind
    // these arriving, so a rejected fetch would leave a spinner and nothing else.
    void window.api
      .getSettings()
      .catch(() => DEFAULT_SETTINGS)
      .then(setSettings)
    return window.api.onSettings(setSettings)
  }, [])

  return settings
}
