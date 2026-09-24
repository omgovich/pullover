import { useCallback, useLayoutEffect, useRef } from 'react'

// Remembers scroll position across remounts of the list (opening Settings,
// or a refresh that arrives while the list is empty) — not across a
// renderer reload, so a module variable is enough.
let savedTop = 0

export interface ScrollMemory {
  ref: (node: HTMLDivElement | null) => void
  onScroll: () => void
}

// Must be passed as `ScrollArea`'s own `ref` (not `scrollableAttributes`) to
// receive the real scrolling node — see its usage in App.tsx. A change of
// `resetKey` (the active account) starts the list back at the top.
export function useScrollMemory(resetKey: string | null): ScrollMemory {
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const restoredNodeRef = useRef<HTMLDivElement | null>(null)
  const keyRef = useRef(resetKey)

  // A layout effect, so it runs after a remount's ref callback has restored
  // the previous account's position, and before that position is painted.
  useLayoutEffect(() => {
    if (keyRef.current === resetKey) return
    keyRef.current = resetKey
    savedTop = 0
    if (nodeRef.current !== null) nodeRef.current.scrollTop = 0
  }, [resetKey])

  const onScroll = useCallback((): void => {
    if (nodeRef.current !== null) savedTop = nodeRef.current.scrollTop
  }, [])

  // Reshaped re-invokes this ref callback on every render of `ScrollArea`,
  // not just mount/unmount, so restoredNodeRef guards against reassigning
  // scrollTop mid-scroll on a node we've already restored.
  const ref = useCallback((node: HTMLDivElement | null): void => {
    nodeRef.current = node
    if (node !== null && restoredNodeRef.current !== node) {
      node.scrollTop = savedTop
      restoredNodeRef.current = node
    }
  }, [])

  return { ref, onScroll }
}
