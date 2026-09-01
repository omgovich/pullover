import { type ClassifiedPullRequest, VISIBLE_CATEGORIES } from '@shared/types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader, ScrollArea, Text, useHotkeys, View } from 'reshaped/bundle'
import EmptyState from './components/EmptyState'
import Header from './components/Header'
import InboxSection from './components/InboxSection'
import SettingsPanel from './components/SettingsPanel'
import SignIn from './components/SignIn'
import Toast from './components/Toast'
import { useScrollMemory } from './useScrollMemory'
import { useSectionCollapse } from './useSectionCollapse'
import { useSelection } from './useSelection'
import { useSnapshot } from './useSnapshot'
import { useToast } from './useToast'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

// Hints-bar keycaps: a plain View instead of `Badge` — `Badge`'s only
// borderless variant swaps in a solid background instead of this faint wash.
function KeyCap({ children }: { children: string }): React.JSX.Element {
  return (
    <View
      paddingBlock={0.25}
      paddingInline={1.25}
      borderRadius="small"
      backgroundColor="neutral-faded"
    >
      <Text as="span" variant="caption-1" weight="semibold" color="neutral-faded">
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
  const { collapsed, toggleCategory } = useSectionCollapse()
  const { toast, showToast, undoToast } = useToast()

  // Keeps the relative ages honest without re-fetching anything.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const refresh = useCallback((): void => {
    void window.api.refresh()
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

  const { activeId, selectedId, setHoveredId, setSelectedId, moveSelection, registerCard } =
    useSelection(visibleItems)

  // `useHotkeys` (from `reshaped/bundle`) has no built-in "ignore while
  // typing" guard, so that check moves inside each callback instead. It's
  // split into two calls because `preventDefault` applies to every key in a
  // single `useHotkeys` call: only the arrow keys need it (so they don't
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
        const item = snapshot.items.find((i) => i.pr.id === selectedId)
        if (item === undefined) return
        if (item.isSnoozed) {
          void window.api.unsnooze(selectedId)
        } else {
          // Skips the dropdown the mouse path uses and snoozes straight
          // away with "until something changes" — the keyboard shortcut is
          // for speed, not for picking a duration. Still raises the same
          // toast as the mouse path so Undo keeps working.
          void window.api.snooze(selectedId, 'until-activity').then(() => showToast(item))
        }
      },
      r: (event?: KeyboardEvent) => {
        if (isTypingTarget(event?.target ?? null)) return
        refresh()
      },
    },
    [selectedId, snapshot.items, refresh, showToast],
    { disabled: showSettings },
  )

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
          myLogin={snapshot.myLogin}
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
          onRefresh={refresh}
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
