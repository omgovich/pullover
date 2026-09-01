import type { ClassifiedPullRequest } from '@shared/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PullRequestCardHandle } from './components/PullRequestCard'

export interface Selection {
  activeId: string | null
  selectedId: string | null
  setHoveredId: (prId: string | null) => void
  setSelectedId: (prId: string) => void
  moveSelection: (delta: 1 | -1) => void
  registerCard: (prId: string, handle: PullRequestCardHandle | null) => void
}

/** The visible-item order the keyboard cursor moves through, hover state, and card focus/scroll. */
export function useSelection(visibleItems: ClassifiedPullRequest[]): Selection {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const cardHandles = useRef(new Map<string, PullRequestCardHandle>())

  const registerCard = useCallback((prId: string, handle: PullRequestCardHandle | null): void => {
    if (handle === null) cardHandles.current.delete(prId)
    else cardHandles.current.set(prId, handle)
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
      const nextId = visibleItems[nextIndex].pr.id
      setSelectedId(nextId)
      setHoveredId(null)
    },
    [visibleItems, selectedId],
  )

  // Selects the first visible card as soon as there's something to select —
  // this is what puts focus on a card the moment the popup opens, rather
  // than leaving it on the header's refresh button.
  useEffect(() => {
    if (selectedId === null && visibleItems.length > 0) {
      setSelectedId(visibleItems[0].pr.id)
    }
  }, [visibleItems, selectedId])

  // Keeps real DOM focus in lockstep with `selectedId`, whatever moved it
  // (arrow keys, a click, or the auto-select above) — the highlight and the
  // focus ring must always land on the same card.
  useEffect(() => {
    if (selectedId === null) return
    const handle = cardHandles.current.get(selectedId)
    handle?.element?.scrollIntoView({ block: 'nearest' })
    handle?.focus()
  }, [selectedId])

  // The popup hides rather than unmounts, so when it's shown again the
  // window regains focus but the DOM's own focus state was never touched —
  // re-focus the selected card explicitly.
  useEffect(() => {
    const handleWindowFocus = (): void => {
      if (selectedId === null) return
      cardHandles.current.get(selectedId)?.focus()
    }
    window.addEventListener('focus', handleWindowFocus)
    return () => window.removeEventListener('focus', handleWindowFocus)
  }, [selectedId])

  return {
    activeId: hoveredId ?? selectedId,
    selectedId,
    setHoveredId,
    setSelectedId,
    moveSelection,
    registerCard,
  }
}
