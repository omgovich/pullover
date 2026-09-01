import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader, ScrollArea, Text, View, useHotkeys } from 'reshaped/bundle'
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

// Hints-bar keycaps: a plain View instead of `Badge` — the design drops
// their border in favor of a faint wash plus a custom text color, and
// `Badge`'s only borderless variant swaps in a solid background instead.
function KeyCap({ children }: { children: string }): React.JSX.Element {
  return (
    <View
      paddingBlock={0.25}
      paddingInline={1.25}
      borderRadius="small"
      attributes={{ style: { background: '#ffffff14' } }}
    >
      <Text
        as="span"
        variant="caption-1"
        weight="semibold"
        attributes={{ style: { color: '#c0c6d6' } }}
      >
        {children}
      </Text>
    </View>
  )
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
      cardHandles.current.get(nextId)?.element?.scrollIntoView({ block: 'nearest' })
    },
    [visibleItems, selectedId],
  )

  // `useHotkeys` (from `reshaped/bundle`) replaces the manual `window`
  // keydown listener. It has no built-in "ignore while typing" guard, so
  // that check moves inside each callback instead — same effect, since the
  // callback still receives the raw `KeyboardEvent`. It's split into two
  // calls rather than one because `preventDefault` applies to every key in
  // a single `useHotkeys` call: only the arrow keys need it (so they don't
  // scroll anything natively), while Enter/S/R must not risk swallowing a
  // keystroke a future text field might want.
  useHotkeys(
    {
      arrowdown: (event?: KeyboardEvent) => {
        if (isTypingTarget(event?.target ?? null)) return
        moveSelection(1)
      },
      arrowup: (event?: KeyboardEvent) => {
        if (isTypingTarget(event?.target ?? null)) return
        moveSelection(-1)
      },
    },
    [moveSelection],
    { disabled: showSettings, preventDefault: true },
  )

  useHotkeys(
    {
      enter: (event?: KeyboardEvent) => {
        if (isTypingTarget(event?.target ?? null)) return
        if (selectedId === null) return
        const item = snapshot.items.find((i) => i.pr.id === selectedId)
        if (item !== undefined) void window.api.openPr(item.pr.url)
      },
      s: (event?: KeyboardEvent) => {
        if (isTypingTarget(event?.target ?? null)) return
        if (selectedId === null) return
        cardHandles.current.get(selectedId)?.activateSnooze()
      },
      r: (event?: KeyboardEvent) => {
        if (isTypingTarget(event?.target ?? null)) return
        if (refreshing) return
        void refresh()
      },
    },
    [selectedId, snapshot.items, refreshing, refresh],
    { disabled: showSettings },
  )

  const activeId = hoveredId ?? selectedId
  const showEmptyState = snapshot.attentionCount === 0

  // `App` always renders the one `.pv-shell` card (see pullover.css); only
  // what goes inside it changes between states, so the window's silhouette
  // never changes when signing in or opening settings.
  let body: React.JSX.Element
  if (snapshot.status === 'signed-out') {
    body = (
      <View grow minHeight={0} direction="column">
        <SignIn />
      </View>
    )
  } else if (showSettings) {
    body = (
      <View grow minHeight={0} direction="column">
        <SettingsPanel
          knownRepositories={snapshot.knownRepositories}
          onClose={() => setShowSettings(false)}
        />
      </View>
    )
  } else if (snapshot.status === 'loading' && snapshot.items.length === 0) {
    body = (
      <View grow minHeight={0} direction="column">
        <View height="100%" minHeight={0} align="center" justify="center">
          <Loader size="medium" />
        </View>
      </View>
    )
  } else {
    body = (
      <>
        <Header
          snapshot={snapshot}
          now={now}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          onOpenSettings={() => setShowSettings(true)}
        />

        <ScrollArea
          ref={scroll.ref}
          onScroll={scroll.onScroll}
          maxHeight="620px"
          className="pv-scroll"
          scrollableClassName="pv-scroll-content"
        >
          {showEmptyState && <EmptyState isError={snapshot.status === 'error'} />}

          {VISIBLE_CATEGORIES.map((category) => (
            <InboxSection
              key={category}
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
        </ScrollArea>

        <View
          direction="row"
          align="center"
          gap={3.5}
          paddingBlock={2.5}
          paddingInline={4}
          borderColor="neutral-faded"
          borderTop
          backgroundColor="elevation-base"
        >
          <View direction="row" align="center" gap={1}>
            <KeyCap>↑↓</KeyCap>
            <Text as="span" variant="caption-1" color="neutral-faded">
              Move
            </Text>
          </View>
          <View direction="row" align="center" gap={1}>
            <KeyCap>⏎</KeyCap>
            <Text as="span" variant="caption-1" color="neutral-faded">
              Review
            </Text>
          </View>
          <View direction="row" align="center" gap={1}>
            <KeyCap>S</KeyCap>
            <Text as="span" variant="caption-1" color="neutral-faded">
              Snooze
            </Text>
          </View>
          <View direction="row" align="center" gap={1}>
            <KeyCap>R</KeyCap>
            <Text as="span" variant="caption-1" color="neutral-faded">
              Refresh
            </Text>
          </View>
        </View>

        {toast !== null && <Toast toast={toast} onUndo={undoToast} />}
      </>
    )
  }

  return (
    <View
      className="pv-shell"
      height="100%"
      direction="column"
      overflow="hidden"
      backgroundColor="elevation-overlay"
      borderRadius="large"
      border
      borderColor="neutral"
    >
      {body}
    </View>
  )
}
