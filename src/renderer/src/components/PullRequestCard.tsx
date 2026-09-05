import { formatAge } from '@core/format'
import type { ClassifiedPullRequest } from '@shared/types'
import { Layers } from 'lucide-react'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Avatar, Badge, Text, View } from 'reshaped/bundle'
import { CI_PILL_COLORS, statusPillColor } from './pr-colors'
import SnoozeMenu from './SnoozeMenu'

interface Props {
  item: ClassifiedPullRequest
  now: string
  isActive: boolean
  /** Stack line this row draws above/below the avatar; see `sectionRows` (@core/stack). */
  lineAbove: boolean
  lineBelow: boolean
  /** Draws that segment dotted: members exist there but aren't shown. */
  gapAbove: boolean
  gapBelow: boolean
  /** That segment has nothing to meet, so it fades out rather than dotting. */
  gapAboveOpen: boolean
  gapBelowOpen: boolean
  onHover: (prId: string | null) => void
  onSelect: (prId: string) => void
  onSnoozed: (item: ClassifiedPullRequest) => void
}

// The connector's geometry is derived from this row's own layout rather
// than tuned by hand: the constants below are the values the props further
// down are actually given, so changing the padding or the avatar moves the
// line with it.
const UNIT_PX = 4
// Reshaped units, spent directly on the props below, so the connector and
// the layout it hides behind cannot drift apart.
const AVATAR_SIZE = 8
const ROW_PADDING_INLINE = 2.5
const ROW_PADDING_TOP = 2.25
const AVATAR_SIZE_PX = AVATAR_SIZE * UNIT_PX
const ROW_PADDING_INLINE_PX = ROW_PADDING_INLINE * UNIT_PX
const ROW_PADDING_TOP_PX = ROW_PADDING_TOP * UNIT_PX

const CONNECTOR_WIDTH_PX = 2
const CONNECTOR_LEFT_PX = ROW_PADDING_INLINE_PX + AVATAR_SIZE_PX / 2 - CONNECTOR_WIDTH_PX / 2
const CONNECTOR_BELOW_TOP_PX = ROW_PADDING_TOP_PX + AVATAR_SIZE_PX

/** How far the fade at an open end reaches before it has gone entirely. */
const OPEN_GAP_BELOW_PX = 12

/** Imperative surface App needs for keyboard navigation. */
export interface PullRequestCardHandle {
  element: HTMLElement | null
  /** Moves real DOM focus onto the card, without also scrolling (App handles that itself). */
  focus: () => void
}

/**
 * `above` flips whichever variant is chosen so it runs away from the avatar:
 * the dots anchor their cycle at the seam, the fade starts opaque at the
 * avatar.
 */
function connectorClass(isGap: boolean, isOpen: boolean, above: boolean): string {
  if (!isGap) return 'pv-stack-connector'
  const variant = isOpen ? 'fade' : 'gap'
  const suffix = above ? ` pv-stack-connector--${variant}-up` : ''
  return `pv-stack-connector pv-stack-connector--${variant}${suffix}`
}

function initialsOf(login: string): string {
  return login.slice(0, 1).toUpperCase()
}

const PullRequestCard = forwardRef<PullRequestCardHandle, Props>(function PullRequestCard(
  {
    item,
    now,
    isActive,
    lineAbove,
    lineBelow,
    gapAbove,
    gapBelow,
    gapAboveOpen,
    gapBelowOpen,
    onHover,
    onSelect,
    onSnoozed,
  }: Props,
  ref,
) {
  const { pr } = item
  const ci = pr.ciStatus === 'none' ? null : CI_PILL_COLORS[pr.ciStatus]
  const status = item.reason !== '' ? statusPillColor(item.reason) : null
  const cardRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    element: cardRef.current,
    focus: () => cardRef.current?.focus({ preventScroll: true }),
  }))

  // The card body opens the PR, on click and (via App's `enter` hotkey) on
  // Enter for whichever card is keyboard-selected. Clicking also selects the
  // card, so the keyboard cursor picks up from wherever the mouse last was.
  const handleOpen = (): void => {
    onSelect(pr.id)
    void window.api.openPr(pr.url)
  }

  // A plain `<div>`, not `View`, wraps the row: `View` isn't `forwardRef`, so
  // it can't carry `cardRef`. `tabIndex={-1}` makes it focusable via the
  // handle's `focus()` without adding it to the Tab order; `role="button"`
  // stays for assistive tech.
  return (
    <div ref={cardRef} tabIndex={-1} className="pv-card-focus">
      <View
        direction="row"
        align="start"
        gap={2.75}
        paddingTop={ROW_PADDING_TOP}
        paddingInline={ROW_PADDING_INLINE}
        paddingBottom={2.5}
        borderRadius="large"
        backgroundColor={isActive ? 'neutral-faded' : undefined}
        position="relative"
        attributes={{
          role: 'button',
          onClick: handleOpen,
          onMouseEnter: () => onHover(pr.id),
          onMouseLeave: () => onHover(null),
          style: {
            cursor: 'pointer',
            transition: 'background 140ms',
          },
        }}
      >
        {/* The line behind the avatar joining this row to the chain: dotted
            where members are missing between two shown rows, fading out where
            the chain leaves the list. Rendered before `Avatar` so it paints
            underneath it, and drawn inside the row's own segment so an
            omission costs no height and every row stays the same. */}
        {lineAbove && (
          <div
            className={connectorClass(gapAbove, gapAboveOpen, true)}
            style={{ left: CONNECTOR_LEFT_PX, top: 0, height: ROW_PADDING_TOP_PX }}
            aria-hidden="true"
          />
        )}
        {lineBelow && (
          <div
            className={connectorClass(gapBelow, gapBelowOpen, false)}
            style={
              gapBelowOpen
                ? {
                    left: CONNECTOR_LEFT_PX,
                    top: CONNECTOR_BELOW_TOP_PX,
                    height: OPEN_GAP_BELOW_PX,
                  }
                : { left: CONNECTOR_LEFT_PX, top: CONNECTOR_BELOW_TOP_PX, bottom: 0 }
            }
            aria-hidden="true"
          />
        )}

        <Avatar
          src={pr.authorAvatarUrl !== '' ? pr.authorAvatarUrl : undefined}
          initials={initialsOf(pr.authorLogin)}
          size={AVATAR_SIZE}
          variant="faded"
          color="primary"
          // No `Avatar` prop reaches `letter-spacing` or lets font-size be
          // set directly (no Reshaped prop does either).
          attributes={{ style: { letterSpacing: '0.02em', fontSize: '11.5px' } }}
        />

        <View.Item grow>
          <View direction="column" gap={1} minWidth={0}>
            {/* Meta row: repo, #number, age, diff counts. `wrap={false}` keeps
                it one line so the repo name ellipsises instead of wrapping. */}
            <View direction="row" align="center" gap={2} wrap={false} minWidth={0}>
              <View shrink minWidth={0}>
                <Text as="span" variant="caption-1" color="neutral-faded" maxLines={1}>
                  {pr.repository}
                </Text>
              </View>
              <View as="span" direction="row" align="center" gap={1}>
                <Text as="span" variant="caption-1" numeric color="primary">
                  #{pr.number}
                </Text>
                {item.stack !== null && (
                  <Badge size="small" color="primary" variant="faded" icon={Layers}>
                    <Text as="span" numeric>
                      {item.stack.index}/{item.stack.total}
                    </Text>
                  </Badge>
                )}
              </View>
              <Text
                as="span"
                variant="caption-1"
                color="neutral-faded"
                attributes={{ style: { opacity: 0.45 } }}
              >
                ·
              </Text>
              <Text as="span" variant="caption-1" color="neutral-faded" numeric>
                {formatAge(pr.updatedAt, now)}
              </Text>
              <Text
                as="span"
                variant="caption-1"
                color="neutral-faded"
                attributes={{ style: { opacity: 0.45 } }}
              >
                ·
              </Text>
              <View as="span" direction="row" gap={1}>
                <Text as="span" variant="caption-1" weight="semibold" numeric color="positive">
                  +{pr.additions}
                </Text>
                <Text as="span" variant="caption-1" weight="semibold" numeric color="critical">
                  {'−'}
                  {pr.deletions}
                </Text>
              </View>
            </View>

            <Text as="div" variant="body-2" weight="semibold" maxLines={1}>
              {pr.title}
            </Text>

            {/* Status pill, CI pill, a spacer, then the snooze pill.
                `wrap={false}` keeps it one line so the status pill shrinks
                and ellipsises instead of the row wrapping. */}
            <View direction="row" align="center" gap={2} wrap={false} minWidth={0}>
              {status !== null && (
                <View
                  shrink
                  minWidth={0}
                  overflow="hidden"
                  paddingBlock={0.5}
                  paddingInline={2.25}
                  borderRadius="circular"
                  backgroundColor={status.background}
                  border
                  borderColor={status.border}
                >
                  <Text
                    as="span"
                    variant="caption-1"
                    weight="semibold"
                    maxLines={1}
                    color={status.text}
                  >
                    {item.reason}
                  </Text>
                </View>
              )}

              {ci !== null && (
                <View
                  direction="row"
                  align="center"
                  gap={1.5}
                  paddingBlock={0.5}
                  paddingInline={2.25}
                  borderRadius="circular"
                  backgroundColor={ci.background}
                  border
                  borderColor={ci.border}
                >
                  <View
                    width="5px"
                    height="5px"
                    borderRadius="circular"
                    backgroundColor={ci.text}
                    attributes={{ style: { flexShrink: 0 } }}
                  />
                  <Text
                    as="span"
                    variant="caption-1"
                    weight="semibold"
                    maxLines={1}
                    color={ci.text}
                  >
                    {ci.label}
                  </Text>
                </View>
              )}

              {/* Snooze pill: stays in the flow (visibility/opacity via CSS,
                  not conditional rendering) so hovering between cards never
                  reflows the row. `gapBefore="auto"` pins it to the row's end. */}
              <View.Item gapBefore="auto">
                <View
                  className={`pv-card-actions${isActive ? ' pv-card-actions--active' : ''}`}
                  attributes={{ 'aria-hidden': !isActive }}
                >
                  <SnoozeMenu
                    prId={pr.id}
                    isSnoozed={item.isSnoozed}
                    onSnoozed={() => onSnoozed(item)}
                  />
                </View>
              </View.Item>
            </View>
          </View>
        </View.Item>
      </View>
    </div>
  )
})

export default PullRequestCard
