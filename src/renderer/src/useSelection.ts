import type { ClassifiedPullRequest } from '@shared/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PullRequestCardHandle } from './components/PullRequestCard'

/**
 * Where the cursor is, and whether arriving there should carry the view with
 * it. Pointer moves are quiet: they must not scroll the list out from under
 * the pointer, and DOM focus must not chase the mouse around the window.
 */
interface Cursor {
  prId: string
  quiet: boolean
}

export interface Selection {
  selectedId: string | null
  /** Moves the cursor to the card the pointer is over. */
  pointAt: (prId: string) => void
  /** Moves the cursor deliberately — a click — and takes focus with it. */
  selectCard: (prId: string) => void
  moveSelection: (delta: 1 | -1) => void
  registerCard: (prId: string, handle: PullRequestCardHandle | null) => void
}

/**
 * The one cursor: the row the keys act on, the row that is tinted, the row
 * whose snooze pill shows. Hovering moves it rather than shadowing it with a
 * second state, so nothing appears to jump back when the pointer leaves the
 * window — what is highlighted is simply wherever it was last put, by mouse
 * or by keys alike.
 */
export function useSelection(visibleItems: ClassifiedPullRequest[]): Selection {
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const cardHandles = useRef(new Map<string, PullRequestCardHandle>())
  const selectedId = cursor?.prId ?? null

  const registerCard = useCallback((prId: string, handle: PullRequestCardHandle | null): void => {
    if (handle === null) cardHandles.current.delete(prId)
    else cardHandles.current.set(prId, handle)
  }, [])

  // Keeping the same object when the id hasn't changed means re-entering the
  // card the keys already chose doesn't downgrade that move to a quiet one.
  const pointAt = useCallback((prId: string): void => {
    setCursor((current) => (current?.prId === prId ? current : { prId, quiet: true }))
  }, [])

  const selectCard = useCallback((prId: string): void => {
    setCursor({ prId, quiet: false })
  }, [])

  const moveSelection = useCallback(
    (delta: 1 | -1): void => {
      if (visibleItems.length === 0) return
      const currentIndex = visibleItems.findIndex((item) => item.pr.id === selectedId)
      const nextIndex =
        currentIndex === -1
          ? delta === 1
            ? 0
            : visibleItems.length - 1
          : (currentIndex + delta + visibleItems.length) % visibleItems.length
      setCursor({ prId: visibleItems[nextIndex].pr.id, quiet: false })
    },
    [visibleItems, selectedId],
  )

  // Puts the cursor on the first card as soon as there is one — this is what
  // focuses a card the moment the popup opens, rather than leaving focus on
  // the header's refresh button.
  useEffect(() => {
    if (cursor === null && visibleItems.length > 0) {
      setCursor({ prId: visibleItems[0].pr.id, quiet: false })
    }
  }, [visibleItems, cursor])

  // Keeps real DOM focus in lockstep with a deliberate move, whatever made it
  // (arrow keys, a click, or the opening select above): the highlight and the
  // focus ring must land on the same card.
  useEffect(() => {
    if (cursor === null || cursor.quiet) return
    const handle = cardHandles.current.get(cursor.prId)
    handle?.element?.scrollIntoView({ block: 'nearest' })
    handle?.focus()
  }, [cursor])

  // The popup hides rather than unmounts, so when it's shown again the
  // window regains focus but the DOM's own focus state was never touched —
  // re-focus the cursor's card explicitly.
  useEffect(() => {
    const handleWindowFocus = (): void => {
      if (selectedId === null) return
      cardHandles.current.get(selectedId)?.focus()
    }
    window.addEventListener('focus', handleWindowFocus)
    return () => window.removeEventListener('focus', handleWindowFocus)
  }, [selectedId])

  return { selectedId, pointAt, selectCard, moveSelection, registerCard }
}
