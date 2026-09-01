import { forwardRef, useEffect, useRef } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Actionable, Icon, Text, View } from 'reshaped/bundle'
import { CATEGORY_TITLES, type Category, type ClassifiedPullRequest } from '@shared/types'
import PullRequestCard, { type PullRequestCardHandle } from './PullRequestCard'

interface Props {
  category: Category
  items: ClassifiedPullRequest[]
  now: string
  open: boolean
  onToggle: () => void
  activePrId: string | null
  onHoverCard: (prId: string | null) => void
  onSelectCard: (prId: string) => void
  onSnoozed: (item: ClassifiedPullRequest) => void
  registerCard: (prId: string, handle: PullRequestCardHandle | null) => void
}

const InboxSection = forwardRef<HTMLDivElement, Props>(function InboxSection(
  {
    category,
    items,
    now,
    open,
    onToggle,
    activePrId,
    onHoverCard,
    onSelectCard,
    onSnoozed,
    registerCard,
  }: Props,
  ref,
) {
  // A fresh ref-callback closure on every render makes React treat it as a
  // new ref identity, so it unregisters and re-registers the card's handle
  // on every re-render — including the 30-second clock tick that re-renders
  // the whole list. Caching one stable callback per PR id keeps registration
  // to mount/unmount only, matching what the DOM ref itself already does.
  const cardRefCallbacks = useRef(
    new Map<string, (handle: PullRequestCardHandle | null) => void>(),
  )

  useEffect(() => {
    const cache = cardRefCallbacks.current
    const presentIds = new Set(items.map((item) => item.pr.id))
    for (const id of cache.keys()) {
      if (!presentIds.has(id)) cache.delete(id)
    }
  })

  function getCardRefCallback(prId: string): (handle: PullRequestCardHandle | null) => void {
    const cache = cardRefCallbacks.current
    let callback = cache.get(prId)
    if (callback === undefined) {
      callback = (handle) => registerCard(prId, handle)
      cache.set(prId, callback)
    }
    return callback
  }

  if (items.length === 0) return null

  return (
    <div ref={ref}>
      {/* `Actionable` replaces the hand-reset `as="button"` `View` — its own
          native-button reset (border/padding/background/cursor/text-align)
          covers everything `.pv-section-header` used to, so none of that CSS
          survives. `fullWidth` matches the old explicit `width: 100%`. */}
      <Actionable onClick={onToggle} fullWidth>
        <View
          direction="row"
          align="center"
          gap={2}
          paddingTop={3.5}
          paddingBottom={1.5}
          paddingInline={2.5}
          position="sticky"
          insetTop={0}
          zIndex={2}
          backgroundColor="elevation-overlay"
        >
          {/* No longer uppercase or letter-spaced, and full neutral instead
              of faded — both dropped along with the divider rule below. */}
          <Text as="span" variant="caption-1" weight="semibold" color="neutral">
            {CATEGORY_TITLES[category]}
          </Text>
          {/* A plain View instead of `Badge`: the design drops the count
              pill's border, and `Badge`'s only borderless variant swaps in a
              solid neutral background instead of this faint wash. */}
          <View
            minWidth="18px"
            paddingInline={1.5}
            align="center"
            justify="center"
            borderRadius="circular"
            attributes={{ style: { background: '#ffffff14' } }}
          >
            <Text as="span" variant="caption-1" weight="semibold" color="neutral-faded" numeric>
              {items.length}
            </Text>
          </View>
          {/* Plain flexible spacer — the divider rule is gone. */}
          <View.Item grow />
          {/* `size` takes a literal string for an exact pixel value instead
              of the 4px-unit multiplier used elsewhere in this file. */}
          <Icon svg={open ? ChevronDown : ChevronRight} size="15px" color="neutral-faded" />
        </View>
      </Actionable>

      {open && (
        // 1px between cards, almost flush — was a much larger gap.
        <View direction="column" gap={0.25}>
          {items.map((item) => (
            <PullRequestCard
              key={item.pr.id}
              ref={getCardRefCallback(item.pr.id)}
              item={item}
              now={now}
              isActive={item.pr.id === activePrId}
              onHover={onHoverCard}
              onSelect={onSelectCard}
              onSnoozed={onSnoozed}
            />
          ))}
        </View>
      )}
    </div>
  )
})

export default InboxSection
