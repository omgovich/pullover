import { useCallback, useEffect, useState } from 'react'

/**
 * Whether macOS starts Pullover at login, read from the system rather than
 * from our own settings — the user can change it in System Settings too, so
 * a copy of our own would drift.
 *
 * The setter takes what main reports back after asking macOS, not what was
 * requested, so a refused change shows as the toggle springing back instead
 * of a switch that claims something untrue.
 */
export function useLaunchAtLogin(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    void window.api.getLaunchAtLogin().then(setEnabled)
  }, [])

  const change = useCallback((next: boolean) => {
    void window.api.setLaunchAtLogin(next).then(setEnabled)
  }, [])

  return [enabled, change]
}
