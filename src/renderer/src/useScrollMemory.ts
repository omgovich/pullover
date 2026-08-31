import { useCallback } from 'react'
import type { UIEvent } from 'react'

/**
 * Remembers where the inbox was scrolled to, across unmounts of the list.
 *
 * The popup hides rather than closes, so its DOM normally survives and the
 * browser keeps `scrollTop` on its own. What loses the position is a remount:
 * opening Settings replaces the whole tree, and so does a refresh that arrives
 * while the list happens to be empty. Both would otherwise drop the user back
 * at the top of a list they were halfway through.
 *
 * The position lives in a module variable rather than storage because it is
 * only meaningful for the lifetime of the window — a reloaded renderer has
 * nothing worth restoring.
 */
let savedTop = 0

export interface ScrollMemory {
  ref: (node: HTMLDivElement | null) => void
  onScroll: (event: UIEvent<HTMLDivElement>) => void
}

export function useScrollMemory(): ScrollMemory {
  const onScroll = useCallback((event: UIEvent<HTMLDivElement>): void => {
    savedTop = event.currentTarget.scrollTop
  }, [])

  const ref = useCallback((node: HTMLDivElement | null): void => {
    // Restoring past the current content height simply clamps, which is the
    // right outcome when the list came back shorter than it was.
    if (node !== null) node.scrollTop = savedTop
  }, [])

  return { ref, onScroll }
}
