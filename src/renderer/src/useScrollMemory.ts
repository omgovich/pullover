import { useCallback, useRef } from 'react'

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
  onScroll: () => void
}

/**
 * `ScrollArea`'s `scrollableAttributes` prop looked like the natural fit
 * (see App.tsx's usage of `ScrollArea`), but it lands on a wrapper `div`
 * *inside* the actually-scrolling element, and any `ref` passed through it
 * is discarded — `ScrollArea.js` spreads `scrollableAttributes` and then
 * writes its own `ref: contentRef` afterwards in the same object literal, so
 * an attribute-supplied ref is always overwritten. That inner div also never
 * fires native `scroll` events, since it isn't the overflowing element.
 *
 * What Reshaped forwards a *working* ref to is `ScrollArea` itself — its
 * `React.useImperativeHandle(ref, () => scrollableRef.current)` exposes the
 * real scrolling node. Its own `onScroll` prop fires correctly (it's bound
 * to that same node), but reports fractional scroll position, not a pixel
 * `scrollTop`, so this hook ignores that argument and reads `scrollTop`
 * straight off the node it captured via `ref` instead — the same value the
 * original plain-`div` version tracked.
 *
 * One more wrinkle: that `useImperativeHandle` has no dependency array, so
 * Reshaped re-invokes the ref callback on *every* render of `ScrollArea`,
 * not just mount/unmount like a plain DOM ref. Reassigning `scrollTop` on
 * every one of those calls would fight the browser's own scrolling —
 * including interrupting inertial/momentum scrolling — so the restore below
 * only runs the first time a given node instance is seen.
 */
export function useScrollMemory(): ScrollMemory {
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const restoredNodeRef = useRef<HTMLDivElement | null>(null)

  const onScroll = useCallback((): void => {
    if (nodeRef.current !== null) savedTop = nodeRef.current.scrollTop
  }, [])

  const ref = useCallback((node: HTMLDivElement | null): void => {
    nodeRef.current = node
    // Restoring past the current content height simply clamps, which is the
    // right outcome when the list came back shorter than it was.
    if (node !== null && restoredNodeRef.current !== node) {
      node.scrollTop = savedTop
      restoredNodeRef.current = node
    }
  }, [])

  return { ref, onScroll }
}
