import { forwardRef, useEffect, useRef } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Divider, Icon, Text, View } from 'reshaped/bundle'
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
      <View
        as="button"
        className="pv-section-header"
        direction="row"
        align="center"
        gap={2}
        position="sticky"
        insetTop={0}
        zIndex={2}
        backgroundColor="elevation-overlay"
        attributes={{ type: 'button', onClick: onToggle }}
      >
        <Text as="span" weight="bold" color="neutral-faded" className="pv-section-label">
          {CATEGORY_TITLES[category].toUpperCase()}
        </Text>
        <Text as="span" weight="semibold" color="neutral-faded" className="pv-section-count">
          {items.length}
        </Text>
        <View.Item grow>
          <Divider />
        </View.Item>
        <View className="pv-section-chevron">
          <Icon svg={open ? ChevronDown : ChevronRight} size={14} color="neutral-faded" />
        </View>
      </View>

      {open && (
        <View className="pv-card-list" direction="column">
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
