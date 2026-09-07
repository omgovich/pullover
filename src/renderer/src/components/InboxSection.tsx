import { sectionRows } from '@core/stack'
import {
  CATEGORY_TITLES,
  type Category,
  type ClassifiedPullRequest,
  type Layout,
} from '@shared/types'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { forwardRef, useEffect, useRef } from 'react'
import { Actionable, Icon, Text, View } from 'reshaped/bundle'
import CompactPullRequestCard, {
  ROW_PADDING_INLINE as COMPACT_ROW_PADDING_INLINE,
} from './CompactPullRequestCard'
import PullRequestCard, { type PullRequestCardHandle, ROW_PADDING_INLINE } from './PullRequestCard'

/**
 * The block a section occupies: the inset the cards sit at, and the room
 * below the last of them. Both used to come from the scroll container's own
 * padding; they are spent in here instead so that the rules App draws
 * between sections reach the window's edges, and so that the space either
 * side of one is the section's own and therefore equal.
 *
 * The room *above* the heading stays on the heading, where it also serves as
 * the backdrop the cards scroll under; `PADDING_BLOCK_END` plus the heading's
 * own bottom padding is what matches it, which is what makes a collapsed
 * section sit evenly between two rules.
 *
 * `PADDING_INLINE` is spent on the cards and again on the heading rather than
 * once on the section, so that the heading's backdrop is the full width of
 * the window while the cards stay inset from it. On the section it left an
 * 8px gutter down each edge that the backdrop didn't cover, and a rule
 * travelling up behind a stuck heading stayed visible in it.
 */
const PADDING_INLINE = 2
const PADDING_BLOCK_END = 2

interface Props {
  category: Category
  /** Already in draw order (App applies `orderSection`, so the keyboard
      cursor and the screen agree on where each card sits). */
  items: ClassifiedPullRequest[]
  now: string
  layout: Layout
  open: boolean
  onToggle: () => void
  activePrId: string | null
  onHoverCard: (prId: string) => void
  onSelectCard: (prId: string) => void
  onSnoozed: (item: ClassifiedPullRequest) => void
  registerCard: (prId: string, handle: PullRequestCardHandle | null) => void
}

const InboxSection = forwardRef<HTMLDivElement, Props>(function InboxSection(
  {
    category,
    items,
    now,
    layout,
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

  const compact = layout === 'compact'
  const rows = sectionRows(items)

  return (
    <div ref={ref}>
      <View direction="column" paddingBottom={PADDING_BLOCK_END}>
        <Actionable onClick={onToggle} fullWidth>
          <View
            direction="row"
            align="center"
            gap={2}
            paddingTop={3.5}
            paddingBottom={1.5}
            paddingInline={
              (compact ? COMPACT_ROW_PADDING_INLINE : ROW_PADDING_INLINE) + PADDING_INLINE
            }
            position="sticky"
            insetTop={0}
            zIndex={2}
            backgroundColor="elevation-overlay"
          >
            <Text as="span" variant="caption-1" weight="semibold" color="neutral">
              {CATEGORY_TITLES[category]}
            </Text>
            {/* Compact leaves the count bare; comfortable sets it in a plain
                View rather than a `Badge`, whose only borderless variant swaps
                in a solid neutral background instead of this faint wash. */}
            {compact ? (
              <Text as="span" variant="caption-1" color="neutral-faded" numeric>
                {items.length}
              </Text>
            ) : (
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
            )}
            <View.Item grow />
            <Icon svg={open ? ChevronDown : ChevronRight} size="15px" color="neutral-faded" />
          </View>
        </Actionable>

        {/* No gap between cards: the stack line runs from row to row, and any
            gap would break it. */}
        {open && (
          <View direction="column" paddingInline={PADDING_INLINE}>
            {rows.map((row) =>
              compact ? (
                <CompactPullRequestCard
                  key={row.item.pr.id}
                  ref={getCardRefCallback(row.item.pr.id)}
                  row={row}
                  isActive={row.item.pr.id === activePrId}
                  onHover={onHoverCard}
                  onSelect={onSelectCard}
                  onSnoozed={onSnoozed}
                />
              ) : (
                <PullRequestCard
                  key={row.item.pr.id}
                  ref={getCardRefCallback(row.item.pr.id)}
                  row={row}
                  now={now}
                  isActive={row.item.pr.id === activePrId}
                  onHover={onHoverCard}
                  onSelect={onSelectCard}
                  onSnoozed={onSnoozed}
                />
              ),
            )}
          </View>
        )}
      </View>
    </div>
  )
})

export default InboxSection
