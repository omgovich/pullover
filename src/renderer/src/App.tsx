import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader, View } from 'reshaped/bundle'
import { VISIBLE_CATEGORIES, type Category, type ClassifiedPullRequest } from '@shared/types'
import EmptyState from './components/EmptyState'
import Header from './components/Header'
import InboxSection from './components/InboxSection'
import type { PullRequestCardHandle } from './components/PullRequestCard'
import SettingsPanel from './components/SettingsPanel'
import SignIn from './components/SignIn'
import Toast, { type ToastState } from './components/Toast'
import { useScrollMemory } from './useScrollMemory'
import { useSnapshot } from './useSnapshot'

const TOAST_DURATION_MS = 4000

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

export default function App(): React.JSX.Element {
  const snapshot = useSnapshot()
  const scroll = useScrollMemory()
  const [showSettings, setShowSettings] = useState(false)
  const [now, setNow] = useState(() => new Date().toISOString())
  const [refreshing, setRefreshing] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<Category>>(() => new Set(['waiting']))
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)

  const waitingSectionRef = useRef<HTMLDivElement | null>(null)
  const cardHandles = useRef(new Map<string, PullRequestCardHandle>())
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keeps the relative ages honest without re-fetching anything.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    setRefreshing(true)
    try {
      await window.api.refresh()
    } finally {
      setRefreshing(false)
    }
  }, [])

  const registerCard = useCallback(
    (prId: string, handle: PullRequestCardHandle | null): void => {
      if (handle === null) cardHandles.current.delete(prId)
      else cardHandles.current.set(prId, handle)
    },
    [],
  )

  const toggleCategory = useCallback((category: Category): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }, [])

  const showToast = useCallback((item: ClassifiedPullRequest): void => {
    if (toastTimer.current !== null) clearTimeout(toastTimer.current)
    setToast({ prId: item.pr.id, number: item.pr.number })
    toastTimer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS)
  }, [])

  const dismissToast = useCallback((): void => {
    if (toastTimer.current !== null) clearTimeout(toastTimer.current)
    setToast(null)
  }, [])

  const undoToast = useCallback((): void => {
    if (toast === null) return
    void window.api.unsnooze(toast.prId)
    dismissToast()
  }, [toast, dismissToast])

  const showSnoozed = useCallback((): void => {
    setCollapsed((prev) => {
      if (!prev.has('waiting')) return prev
      const next = new Set(prev)
      next.delete('waiting')
      return next
    })
    waitingSectionRef.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  // Clears the toast timer on unmount so it never fires against a gone component.
  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current)
    }
  }, [])

  // The order the keyboard cursor travels: visual order, skipping collapsed sections.
  const visibleItems = useMemo(() => {
    const result: ClassifiedPullRequest[] = []
    for (const category of VISIBLE_CATEGORIES) {
      if (collapsed.has(category)) continue
      for (const item of snapshot.items) {
        if (item.category === category) result.push(item)
      }
    }
    return result
  }, [snapshot.items, collapsed])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (showSettings) return
      if (isTypingTarget(event.target)) return

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (visibleItems.length === 0) return
        event.preventDefault()
        const delta = event.key === 'ArrowDown' ? 1 : -1
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
        cardHandles.current.get(nextId)?.element?.scrollIntoView({ block: 'nearest' })
        return
      }

      if (event.key === 'Enter') {
        if (selectedId === null) return
        const item = snapshot.items.find((i) => i.pr.id === selectedId)
        if (item !== undefined) void window.api.openPr(item.pr.url)
        return
      }

      if (event.key === 's' || event.key === 'S') {
        if (selectedId === null) return
        cardHandles.current.get(selectedId)?.activateSnooze()
        return
      }

      if (event.key === 'r' || event.key === 'R') {
        if (refreshing) return
        void refresh()
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [visibleItems, selectedId, showSettings, snapshot.items, refreshing, refresh])

  if (snapshot.status === 'signed-out') return <SignIn />

  if (showSettings) {
    return (
      <SettingsPanel
        knownRepositories={snapshot.knownRepositories}
        onClose={() => setShowSettings(false)}
      />
    )
  }

  if (snapshot.status === 'loading' && snapshot.items.length === 0) {
    return (
      <View height="100%" align="center" justify="center" backgroundColor="elevation-overlay">
        <Loader size="medium" />
      </View>
    )
  }

  const snoozedCount = snapshot.items.filter((item) => item.isSnoozed).length
  const activeId = hoveredId ?? selectedId
  const showEmptyState = snapshot.attentionCount === 0

  // The window is transparent padding around the card (see
  // src/shared/geometry.ts), and Electron still delivers clicks anywhere in
  // that transparent area — a click there should dismiss the popup like any
  // popover, rather than silently doing nothing. Checking that the click
  // target is this wrapper itself (not a descendant) means a click on the
  // card doesn't have to stop its own propagation to be exempt.
  const dismissIfPadding = (event: React.MouseEvent): void => {
    if (event.target === event.currentTarget) void window.api.hidePopup()
  }

  return (
    <div className="pv-window-padding" onClick={dismissIfPadding}>
      <div className="pv-shell">
        <Header
          snapshot={snapshot}
          now={now}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          onOpenSettings={() => setShowSettings(true)}
        />

        <div className="pv-scroll" ref={scroll.ref} onScroll={scroll.onScroll}>
          {showEmptyState && (
            <EmptyState
              isError={snapshot.status === 'error'}
              snoozedCount={snoozedCount}
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              onShowSnoozed={showSnoozed}
            />
          )}

          {VISIBLE_CATEGORIES.map((category) => (
            <InboxSection
              key={category}
              ref={category === 'waiting' ? waitingSectionRef : undefined}
              category={category}
              items={snapshot.items.filter((item) => item.category === category)}
              now={now}
              open={!collapsed.has(category)}
              onToggle={() => toggleCategory(category)}
              activePrId={activeId}
              onHoverCard={setHoveredId}
              onSelectCard={setSelectedId}
              onSnoozed={showToast}
              registerCard={registerCard}
            />
          ))}
        </div>

        <div className="pv-hints">
          <span className="pv-hint">
            <span className="pv-keycap">↑↓</span>Move
          </span>
          <span className="pv-hint">
            <span className="pv-keycap">⏎</span>Review
          </span>
          <span className="pv-hint">
            <span className="pv-keycap">S</span>Snooze
          </span>
          <span className="pv-hint">
            <span className="pv-keycap">R</span>Refresh
          </span>
        </div>

        {toast !== null && <Toast toast={toast} onUndo={undoToast} />}
      </div>
    </div>
  )
}
