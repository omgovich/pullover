import { formatAge, repositoryName } from '@core/format'
import type { StackCardRow } from '@core/stack'
import type { ClassifiedPullRequest } from '@shared/types'
import { Ellipsis, Layers } from 'lucide-react'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Actionable, Avatar, Badge, Icon, Text, View } from 'reshaped/bundle'
import { pointerAnchor, showPrMenu } from '../pr-menu'
import { useMarquee } from '../useMarquee'
import { CiChip, initialsOf, StatusText } from './pr-row-parts'
import StackConnector from './StackConnector'

interface Props {
  row: StackCardRow
  now: string
  isActive: boolean
  onHover: (prId: string) => void
  onSelect: (prId: string) => void
  onSnoozed: (item: ClassifiedPullRequest) => void
}

// The connector's geometry is derived from this row's own layout rather than
// tuned by hand: the constants below are the values the props further down are
// actually given, so changing the padding or the avatar moves the line with it.
const UNIT_PX = 4
const AVATAR_SIZE = 7
/** Also spent on the section heading, so it lines up with the avatars. */
export const ROW_PADDING_INLINE = 1.5
const ROW_PADDING_TOP = 2
const ROW_PADDING_BOTTOM = 2.25

// Both lines are given a fixed height, which is what makes the row's own
// height — and so the centred avatar and the connector below it — arithmetic
// rather than a measurement.
const META_HEIGHT_PX = 15
const TITLE_HEIGHT_PX = 20
/** Reshaped units, spent on the column below and counted into the row height. */
const LINE_GAP = 0.5

const AVATAR_SIZE_PX = AVATAR_SIZE * UNIT_PX
const ROW_PADDING_INLINE_PX = ROW_PADDING_INLINE * UNIT_PX
const ROW_HEIGHT_PX =
  ROW_PADDING_TOP * UNIT_PX +
  META_HEIGHT_PX +
  LINE_GAP * UNIT_PX +
  TITLE_HEIGHT_PX +
  ROW_PADDING_BOTTOM * UNIT_PX

const CONNECTOR_WIDTH_PX = 2
const CONNECTOR_LEFT_PX = ROW_PADDING_INLINE_PX + AVATAR_SIZE_PX / 2 - CONNECTOR_WIDTH_PX / 2
const AVATAR_TOP_PX = (ROW_HEIGHT_PX - AVATAR_SIZE_PX) / 2
const CONNECTOR_BELOW_TOP_PX = AVATAR_TOP_PX + AVATAR_SIZE_PX

/** The segment below the avatar runs to the card's edge, so a fade over all
    of it would smear; it has gone by here instead. */
const OPEN_FADE_BELOW_PX = 12

/** Breathing room between the actions button and the menu it drops. */
const MENU_GAP_PX = 4

// Wider than it is tall, so the three dots get room without the button
// growing past the meta line it sits in.
const MENU_BUTTON_WIDTH_PX = 22
const MENU_BUTTON_HEIGHT_PX = 20

/** Imperative surface App needs for keyboard navigation. */
export interface PullRequestCardHandle {
  element: HTMLElement | null
  /** Moves real DOM focus onto the card, without also scrolling (App handles that itself). */
  focus: () => void
}

/**
 * Two lines per pull request: the meta line comfortable always had, over the
 * title-and-status line compact fits into one. Nothing is dropped — this is
 * the dense row with the repository, the age and the diff counts put back.
 */
const PullRequestCard = forwardRef<PullRequestCardHandle, Props>(function PullRequestCard(
  { row, now, isActive, onHover, onSelect, onSnoozed }: Props,
  ref,
) {
  const { item } = row
  const { pr } = item
  const cardRef = useRef<HTMLDivElement>(null)
  const marquee = useMarquee(isActive)

  useImperativeHandle(ref, () => ({
    element: cardRef.current,
    focus: () => cardRef.current?.focus({ preventScroll: true }),
  }))

  // The card body opens the PR, on click and (via App's `enter` hotkey) on
  // Enter for whichever card the cursor is on. Clicking selects deliberately,
  // which — unlike the hover that put the cursor here — takes focus with it.
  const handleOpen = (): void => {
    onSelect(pr.id)
    void window.api.openPr(pr.url)
  }

  // Selects first, so the card the menu acts on is also the one that is
  // tinted — a right-click can land on a card the pointer never entered.
  const handleContextMenu = (event: React.MouseEvent): void => {
    onSelect(pr.id)
    void showPrMenu(item, pointerAnchor(event), onSnoozed)
  }

  // A plain `<div>`, not `View`, wraps the row: `View` isn't `forwardRef`, so
  // it can't carry `cardRef`. `tabIndex={-1}` makes it focusable via the
  // handle's `focus()` without adding it to the Tab order; `role="button"`
  // stays for assistive tech.
  return (
    <div ref={cardRef} tabIndex={-1} className="pv-card-focus">
      <View
        direction="row"
        align="center"
        gap={2.5}
        wrap={false}
        paddingTop={ROW_PADDING_TOP}
        paddingBottom={ROW_PADDING_BOTTOM}
        paddingInline={ROW_PADDING_INLINE}
        borderRadius="medium"
        backgroundColor={isActive ? 'neutral-faded' : undefined}
        position="relative"
        attributes={{
          role: 'button',
          onClick: handleOpen,
          onContextMenu: handleContextMenu,
          onMouseEnter: () => onHover(pr.id),
          style: { cursor: 'pointer', transition: 'background 140ms' },
        }}
      >
        {/* Before `Avatar`, so the line paints underneath it. */}
        <StackConnector
          row={row}
          left={CONNECTOR_LEFT_PX}
          aboveHeight={AVATAR_TOP_PX}
          belowTop={CONNECTOR_BELOW_TOP_PX}
          fadeBelowHeight={OPEN_FADE_BELOW_PX}
        />

        <Avatar
          src={pr.authorAvatarUrl !== '' ? pr.authorAvatarUrl : undefined}
          initials={initialsOf(pr.authorLogin)}
          size={AVATAR_SIZE}
          variant="faded"
          color="primary"
          // Through `className`, not `attributes.style`: `Avatar` writes its
          // own `style` after spreading the caller's, so a style set here is
          // dropped. No Reshaped prop reaches font-size or letter-spacing.
          className="pv-avatar-initials"
        />

        <View.Item grow>
          <View direction="column" gap={LINE_GAP} minWidth={0}>
            {/* Meta line: repo, #number, stack, age, diff counts, then the
                actions button. `wrap={false}` keeps it one line so the repo
                name ellipsises instead of the row wrapping. */}
            <View
              direction="row"
              align="center"
              gap={2}
              wrap={false}
              minWidth={0}
              height={`${META_HEIGHT_PX}px`}
            >
              {/* The owner is dropped: it is the same for most of the list
                  and eats the width the repository name needs. It comes back
                  on hover, where two same-named repositories are told apart. */}
              <View shrink minWidth={0}>
                <Text
                  as="span"
                  variant="caption-1"
                  color="neutral-faded"
                  maxLines={1}
                  attributes={{ title: pr.repository }}
                >
                  {repositoryName(pr.repository)}
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

              {/* The same menu the right-click and the M key open — the
                  button is only the affordance that says it is there. Stays
                  in the flow (visibility via CSS, not conditional rendering)
                  so hovering between cards never reflows the row.
                  `gapBefore="auto"` pins it to the line's end. */}
              <View.Item gapBefore="auto">
                <View
                  className={`pv-card-actions${isActive ? ' pv-card-actions--active' : ''}`}
                  attributes={{ 'aria-hidden': !isActive }}
                >
                  {/* `Actionable`, not `Button`: Reshaped's smallest button
                      is 28px tall — body-2's leading plus its padding — and
                      this sits in a 15px line. */}
                  <Actionable
                    className="pv-card-menu"
                    stopPropagation
                    onClick={(event) => {
                      const box = event.currentTarget.getBoundingClientRect()
                      onSelect(pr.id)
                      void showPrMenu(item, { x: box.left, y: box.bottom + MENU_GAP_PX }, onSnoozed)
                    }}
                    attributes={{ title: 'Actions — M', 'aria-label': 'Actions' }}
                  >
                    <View
                      width={`${MENU_BUTTON_WIDTH_PX}px`}
                      height={`${MENU_BUTTON_HEIGHT_PX}px`}
                      align="center"
                      justify="center"
                    >
                      <Icon svg={Ellipsis} size="15px" color="neutral-faded" />
                    </View>
                  </Actionable>
                </View>
              </View.Item>
            </View>

            {/* Title line: the title yields to the CI chip and the reason. */}
            <View
              direction="row"
              align="center"
              gap={2}
              wrap={false}
              minWidth={0}
              height={`${TITLE_HEIGHT_PX}px`}
            >
              <View.Item grow className={marquee.className} attributes={{ ref: marquee.ref }}>
                <Text as="div" variant="body-2" weight="medium">
                  {pr.title}
                </Text>
              </View.Item>

              <View direction="row" align="center" gap={1.75} wrap={false}>
                <CiChip status={pr.ciStatus} />
                <StatusText reason={item.reason} />
              </View>
            </View>
          </View>
        </View.Item>
      </View>
    </div>
  )
})

export default PullRequestCard
