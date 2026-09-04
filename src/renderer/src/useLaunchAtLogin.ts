import { useCallback, useEffect, useState } from 'react'

/**
 * Whether macOS starts Pullover at login. Read from the system, not from our
 * settings — the user can change it in System Settings, so our own copy
 * would drift. The setter stores what macOS reports back, so a refused
 * change springs the switch back rather than leaving it lying.
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
