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
  // A fresh ref-callback closure every render would make React treat it as a
  // new ref identity, re-registering the card's handle on every re-render
  // (including the 30-second clock tick). Caching one stable callback per PR
  // id keeps registration to mount/unmount only.
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
          <Text as="span" variant="caption-1" weight="semibold" color="neutral">
            {CATEGORY_TITLES[category]}
          </Text>
          {/* A plain View instead of `Badge`: `Badge`'s only borderless
              variant swaps in a solid neutral background instead of this
              faint wash. */}
          <View
            minWidth="18px"
            paddingInline={1.5}
            align="center"
            justify="center"
            borderRadius="circular"
            attributes={{ style: { background: 'var(--pv-overlay)' } }}
          >
            <Text as="span" variant="caption-1" weight="semibold" color="neutral-faded" numeric>
              {items.length}
            </Text>
          </View>
          <View.Item grow />
          <Icon svg={open ? ChevronDown : ChevronRight} size="15px" color="neutral-faded" />
        </View>
      </Actionable>

      {open && (
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
