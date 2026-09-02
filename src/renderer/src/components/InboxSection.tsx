import { sectionRows } from '@core/stack'
import { CATEGORY_TITLES, type Category, type ClassifiedPullRequest } from '@shared/types'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { forwardRef, useEffect, useRef } from 'react'
import { Actionable, Icon, Text, View } from 'reshaped/bundle'
import PullRequestCard, { CONNECTOR_LEFT_PX, type PullRequestCardHandle } from './PullRequestCard'

interface Props {
  category: Category
  /** Already in draw order (App applies `orderSection`, so the keyboard
      cursor and the screen agree on where each card sits). */
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
  const cardRefCallbacks = useRef(new Map<string, (handle: PullRequestCardHandle | null) => void>())

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

  // Lays the section out as cards interleaved with the dotted breaks that
  // stand in for stack members not shown.
  const rows = sectionRows(items)

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
            backgroundColor="neutral-faded"
          >
            <Text as="span" variant="caption-1" weight="semibold" color="neutral-faded" numeric>
              {items.length}
            </Text>
          </View>
          <View.Item grow />
          <Icon svg={open ? ChevronDown : ChevronRight} size="15px" color="neutral-faded" />
        </View>
      </Actionable>

      {/* No gap between cards: the stack connector runs from card to card, and
          any gap would break the line (bridging it with overshoot and negative
          margins only traded the seam for overlap artefacts). The cards' own
          padding already separates them. */}
      {open && (
        <View direction="column">
          {rows.map((row) =>
            row.kind === 'break' ? (
              <div
                key={row.key}
                className="pv-stack-break"
                style={{ marginLeft: CONNECTOR_LEFT_PX }}
                aria-hidden="true"
              />
            ) : (
              <PullRequestCard
                key={row.item.pr.id}
                ref={getCardRefCallback(row.item.pr.id)}
                item={row.item}
                now={now}
                isActive={row.item.pr.id === activePrId}
                lineAbove={row.lineAbove}
                lineBelow={row.lineBelow}
                onHover={onHoverCard}
                onSelect={onSelectCard}
                onSnoozed={onSnoozed}
              />
            ),
          )}
        </View>
      )}
    </div>
  )
})

export default InboxSection
