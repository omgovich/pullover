import type { ClassifiedPullRequest } from '@shared/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ToastState } from './components/Toast'

const TOAST_DURATION_MS = 4000

export interface ToastControls {
  toast: ToastState | null
  showToast: (item: ClassifiedPullRequest) => void
  dismissToast: () => void
  undoToast: () => void
}

export function useToast(): ToastControls {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((item: ClassifiedPullRequest): void => {
    if (timer.current !== null) clearTimeout(timer.current)
    setToast({ prId: item.pr.id, number: item.pr.number })
    timer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS)
  }, [])

  const dismissToast = useCallback((): void => {
    if (timer.current !== null) clearTimeout(timer.current)
    setToast(null)
  }, [])

  const undoToast = useCallback((): void => {
    if (toast === null) return
    void window.api.unsnooze(toast.prId)
    dismissToast()
  }, [toast, dismissToast])

  // Clears the timer on unmount so it never fires against a gone component.
  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])

  return { toast, showToast, dismissToast, undoToast }
}
