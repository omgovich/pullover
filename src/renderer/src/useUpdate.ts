import type { UpdateState } from '@shared/types'
import { useEffect, useState } from 'react'

/**
 * What the auto-updater is doing. Fetches once on mount, then follows the
 * `updateChanged` push from main — the same pattern `useSettings` uses, so
 * the header and the tray menu read one state rather than two copies.
 */
export function useUpdate(): UpdateState {
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle', version: null })

  useEffect(() => {
    void window.api.getUpdate().then(setUpdate)
    return window.api.onUpdate(setUpdate)
  }, [])

  return update
}
