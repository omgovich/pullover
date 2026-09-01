import type { InboxSnapshot } from '@shared/ipc'
import { useEffect, useState } from 'react'

const EMPTY: InboxSnapshot = {
  status: 'loading',
  items: [],
  attentionCount: 0,
  lastUpdatedAt: null,
  errorMessage: null,
  myLogin: null,
  knownRepositories: [],
}

export function useSnapshot(): InboxSnapshot {
  const [snapshot, setSnapshot] = useState<InboxSnapshot>(EMPTY)

  useEffect(() => {
    void window.api.getSnapshot().then(setSnapshot)
    return window.api.onSnapshot(setSnapshot)
  }, [])

  return snapshot
}
