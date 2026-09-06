import type { StackCardRow } from '@core/stack'
import type { ClassifiedPullRequest } from '@shared/types'
import { Layers } from 'lucide-react'
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { Avatar, Icon, Text, Tooltip, View } from 'reshaped/bundle'
import { pointerAnchor, showPrMenu } from '../pr-menu'
import type { PullRequestCardHandle } from './PullRequestCard'
import { CiChip, initialsOf, StatusText } from './pr-row-parts'
import StackConnector from './StackConnector'

interface Props {
  row: StackCardRow
  isActive: boolean
  onHover: (prId: string) => void
  onSelect: (prId: string) => void
  /** Fired after the context menu snoozes, so the card can show the undo toast. */
  onSnoozed: (item: ClassifiedPullRequest) => void
}

// Reshaped units, spent directly on the props below, so the connector and the
// layout it hides behind cannot drift apart. The row height is the exception:
// 30px is off the 4px grid, chosen for the breathing room around the avatar
// that the next step down, 28px, does not leave.
const UNIT_PX = 4
const AVATAR_SIZE = 5
/** Also spent on the section heading, so it lines up with the avatars. */
export const ROW_PADDING_INLINE = 2
const ROW_HEIGHT_PX = 30
const AVATAR_SIZE_PX = AVATAR_SIZE * UNIT_PX
const ROW_PADDING_INLINE_PX = ROW_PADDING_INLINE * UNIT_PX

const CONNECTOR_WIDTH_PX = 2
const CONNECTOR_LEFT_PX = ROW_PADDING_INLINE_PX + AVATAR_SIZE_PX / 2 - CONNECTOR_WIDTH_PX / 2
const AVATAR_TOP_PX = (ROW_HEIGHT_PX - AVATAR_SIZE_PX) / 2

// A constant speed, not a constant duration: the same number of seconds for
// every title makes a barely-clipped one crawl and a very long one race.
const MARQUEE_PX_PER_SECOND = 32
/**
 * Pause at either end of a pass. `alternate` runs the easing backwards on the
 * return, so each turnaround holds twice this before setting off again.
 */
const MARQUEE_HOLD_SECONDS = 0.7

/**
 * One row per pull request. The repository name, the age and the diff counts
 * are dropped rather than shrunk — at this density something has to go, and
 * those are the three that least often decide whether to open a PR.
 */
const CompactPullRequestCard = forwardRef<PullRequestCardHandle, Props>(
  function CompactPullRequestCard({ row, isActive, onHover, onSelect, onSnoozed }: Props, ref) {
    const { item } = row
    const { pr } = item
    const cardRef = useRef<HTMLDivElement>(null)
    const titleRef = useRef<HTMLDivElement>(null)
    // `off` for a title that fits — there is nothing to scroll, and running an
    // animation that cannot move would also swap the ellipsis for a clip on
    // every row the cursor rests on. `holding` starts the animation, whose
    // easing sits at zero, so the ellipsis survives the opening pause; only
    // `moving` opens the box to the full title.
    const [marquee, setMarquee] = useState<'off' | 'holding' | 'moving'>('off')

    // Measured per activation rather than once: the reason, the CI chip and
    // the stack count all share the row and size what is left for the title.
    // Laid out before paint, so a row never paints mid-swap.
    useLayoutEffect(() => {
      if (!isActive) {
        setMarquee('off')
        return
      }
      const clip = titleRef.current
      const text = clip?.firstElementChild
      if (clip == null || text == null) return
      const overflow = Math.max(0, text.scrollWidth - clip.clientWidth)
      if (overflow === 0) return

      const seconds = MARQUEE_HOLD_SECONDS * 2 + overflow / MARQUEE_PX_PER_SECOND
      const holdPercent = (MARQUEE_HOLD_SECONDS / seconds) * 100
      clip.style.setProperty('--pv-marquee-duration', `${seconds}s`)
      clip.style.setProperty(
        '--pv-marquee-ease',
        `linear(0 0%, 0 ${holdPercent}%, 1 ${100 - holdPercent}%, 1 100%)`,
      )
      setMarquee('holding')

      const timer = setTimeout(() => setMarquee('moving'), MARQUEE_HOLD_SECONDS * 1000)
      return () => clearTimeout(timer)
    }, [isActive])

    useImperativeHandle(ref, () => ({
      element: cardRef.current,
      focus: () => cardRef.current?.focus({ preventScroll: true }),
    }))

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

    return (
      <div ref={cardRef} tabIndex={-1} className="pv-card-focus">
        <View
          direction="row"
          align="center"
          gap={2}
          height={`${ROW_HEIGHT_PX}px`}
          paddingInline={ROW_PADDING_INLINE}
          borderRadius="medium"
          backgroundColor={isActive ? 'neutral-faded' : undefined}
          position="relative"
          wrap={false}
          attributes={{
            role: 'button',
            onClick: handleOpen,
            onContextMenu: handleContextMenu,
            onMouseEnter: () => onHover(pr.id),
            style: { cursor: 'pointer', transition: 'background 140ms' },
          }}
        >
          <StackConnector
            row={row}
            compact
            left={CONNECTOR_LEFT_PX}
            aboveHeight={AVATAR_TOP_PX}
            belowTop={AVATAR_TOP_PX + AVATAR_SIZE_PX}
          />
          <Avatar
            src={pr.authorAvatarUrl !== '' ? pr.authorAvatarUrl : undefined}
            initials={initialsOf(pr.authorLogin)}
            size={AVATAR_SIZE}
            variant="faded"
            color="primary"
            className="pv-avatar-initials"
          />

          {/* The repository name has no room on the row, so the number it
              belongs to hands it back on hover. `disableContentHover` takes
              the tooltip out of the hit test entirely: it overlaps the row
              below, and catching the pointer there would stop that row from
              highlighting as the cursor travels down the list. */}
          <Tooltip text={pr.repository} position="bottom-start" color="dark" disableContentHover>
            {(attributes) => (
              <Text
                as="span"
                variant="caption-1"
                numeric
                color="neutral-faded"
                attributes={attributes}
              >
                #{pr.number}
              </Text>
            )}
          </Tooltip>

          {/* `maxLines` would clamp with -webkit-line-clamp, which the
              marquee cannot slide; `.pv-marquee` ellipsises the same way and
              scrolls a title too long for the row while the row is active. */}
          <View.Item
            grow
            className={`pv-marquee${marquee !== 'off' ? ' pv-marquee--active' : ''}${
              marquee === 'moving' ? ' pv-marquee--moving' : ''
            }`}
            attributes={{ ref: titleRef }}
          >
            <Text as="div" variant="body-2" weight="medium">
              {pr.title}
            </Text>
          </View.Item>

          <View direction="row" align="center" gap={1.75} wrap={false}>
            {item.stack !== null && (
              <View direction="row" align="center" gap={0.75} wrap={false}>
                <Icon svg={Layers} size="10px" color="primary" />
                <Text as="span" variant="caption-1" weight="semibold" numeric color="primary">
                  {item.stack.index}/{item.stack.total}
                </Text>
              </View>
            )}

            <CiChip status={pr.ciStatus} />
            <StatusText reason={item.reason} />
          </View>
        </View>
      </div>
    )
  },
)

export default CompactPullRequestCard
