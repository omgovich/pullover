import type { ClassifiedPullRequest } from '@shared/types'
import { Check, Clock, Layers, X } from 'lucide-react'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Avatar, Icon, Text, View } from 'reshaped/bundle'
import type { PullRequestCardHandle } from './PullRequestCard'
import { CI_PILL_COLORS, statusPillColor } from './pr-colors'

interface Props {
  item: ClassifiedPullRequest
  isActive: boolean
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
}

// Pixels, not Reshaped units: the row is 30px around a 20px avatar and none
// of that lands on the 4px grid. The connector runs behind the avatar, as in
// the comfortable card, so its offset is the avatar's centre.
const ROW_HEIGHT_PX = 30
const AVATAR_SIZE_PX = 20
const ROW_PADDING_INLINE_PX = 8
const CONNECTOR_WIDTH_PX = 2
const AVATAR_TOP_PX = (ROW_HEIGHT_PX - AVATAR_SIZE_PX) / 2

const COMPACT_CONNECTOR_LEFT_PX =
  ROW_PADDING_INLINE_PX + AVATAR_SIZE_PX / 2 - CONNECTOR_WIDTH_PX / 2

const CI_ICONS = { success: Check, failure: X, pending: Clock } as const

function connectorClass(isGap: boolean, isOpen: boolean, above: boolean): string {
  const base = 'pv-stack-connector pv-stack-connector--compact'
  if (!isGap) return base
  const variant = isOpen ? 'fade' : 'gap'
  const suffix = above ? ` pv-stack-connector--${variant}-up` : ''
  return `${base} pv-stack-connector--${variant}${suffix}`
}

function initialsOf(login: string): string {
  return login.slice(0, 2).toUpperCase()
}

/**
 * One row per pull request. The repository name, the age and the diff counts
 * are dropped rather than shrunk — at this density something has to go, and
 * those are the three that least often decide whether to open a PR.
 */
const CompactPullRequestCard = forwardRef<PullRequestCardHandle, Props>(
  function CompactPullRequestCard(
    {
      item,
      isActive,
      lineAbove,
      lineBelow,
      gapAbove,
      gapBelow,
      gapAboveOpen,
      gapBelowOpen,
      onHover,
      onSelect,
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

    const handleOpen = (): void => {
      onSelect(pr.id)
      void window.api.openPr(pr.url)
    }

    return (
      <div ref={cardRef} tabIndex={-1} className="pv-card-focus">
        <View
          direction="row"
          align="center"
          gap={2}
          height={`${ROW_HEIGHT_PX}px`}
          paddingInline={2}
          borderRadius="medium"
          backgroundColor={isActive ? 'neutral-faded' : undefined}
          position="relative"
          wrap={false}
          attributes={{
            role: 'button',
            onClick: handleOpen,
            onMouseEnter: () => onHover(pr.id),
            onMouseLeave: () => onHover(null),
            style: { cursor: 'pointer', transition: 'background 140ms' },
          }}
        >
          {/* The break never becomes a row of its own here: an extra 11px
              between two cards would break the even rhythm this layout is
              for, and reads as a rendering fault rather than an omission. */}
          {lineAbove && (
            <div
              className={connectorClass(gapAbove, gapAboveOpen, true)}
              style={{ left: COMPACT_CONNECTOR_LEFT_PX, top: 0, height: AVATAR_TOP_PX }}
              aria-hidden="true"
            />
          )}
          {lineBelow && (
            <div
              className={connectorClass(gapBelow, gapBelowOpen, false)}
              style={{
                left: COMPACT_CONNECTOR_LEFT_PX,
                top: AVATAR_TOP_PX + AVATAR_SIZE_PX,
                bottom: 0,
              }}
              aria-hidden="true"
            />
          )}
          <Avatar
            src={pr.authorAvatarUrl !== '' ? pr.authorAvatarUrl : undefined}
            initials={initialsOf(pr.authorLogin)}
            size={5}
            variant="faded"
            color="primary"
            attributes={{ style: { fontSize: '9px' } }}
          />

          <Text as="span" variant="caption-1" numeric color="neutral-faded">
            #{pr.number}
          </Text>

          <View.Item grow>
            <Text as="div" variant="body-3" weight="medium" maxLines={1}>
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

            {ci !== null && (
              <View
                width="16px"
                height="16px"
                align="center"
                justify="center"
                borderRadius="small"
                backgroundColor={ci.background}
                border
                borderColor={ci.border}
              >
                <Icon
                  svg={CI_ICONS[pr.ciStatus as keyof typeof CI_ICONS]}
                  size="10px"
                  color={ci.text}
                />
              </View>
            )}

            {status !== null && (
              <View maxWidth="112px">
                <Text
                  as="span"
                  variant="caption-1"
                  weight="semibold"
                  color={status.text}
                  maxLines={1}
                >
                  {item.reason}
                </Text>
              </View>
            )}
          </View>
        </View>
      </div>
    )
  },
)

export default CompactPullRequestCard
