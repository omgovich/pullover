import type { StackCardRow } from '@core/stack'
import { Check, Clock, Layers, X } from 'lucide-react'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Avatar, Icon, Text, View } from 'reshaped/bundle'
import type { PullRequestCardHandle } from './PullRequestCard'
import { CI_PILL_COLORS, statusPillColor } from './pr-colors'
import StackConnector from './StackConnector'

interface Props {
  row: StackCardRow
  isActive: boolean
  onHover: (prId: string | null) => void
  onSelect: (prId: string) => void
}

// Reshaped units, spent directly on the props below, so the connector and the
// layout it hides behind cannot drift apart. Only the row height is a pixel
// literal: 30px is off the 4px grid, and nothing shorter fits a 20px avatar.
const UNIT_PX = 4
const AVATAR_SIZE = 5
const ROW_PADDING_INLINE = 2
const ROW_HEIGHT_PX = 30
const AVATAR_SIZE_PX = AVATAR_SIZE * UNIT_PX
const ROW_PADDING_INLINE_PX = ROW_PADDING_INLINE * UNIT_PX

const CONNECTOR_WIDTH_PX = 2
const CONNECTOR_LEFT_PX = ROW_PADDING_INLINE_PX + AVATAR_SIZE_PX / 2 - CONNECTOR_WIDTH_PX / 2
const AVATAR_TOP_PX = (ROW_HEIGHT_PX - AVATAR_SIZE_PX) / 2

const CI_ICONS = { success: Check, failure: X, pending: Clock } as const

function initialsOf(login: string): string {
  return login.slice(0, 2).toUpperCase()
}

/**
 * One row per pull request. The repository name, the age and the diff counts
 * are dropped rather than shrunk — at this density something has to go, and
 * those are the three that least often decide whether to open a PR.
 */
const CompactPullRequestCard = forwardRef<PullRequestCardHandle, Props>(
  function CompactPullRequestCard({ row, isActive, onHover, onSelect }: Props, ref) {
    const { item } = row
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
          paddingInline={ROW_PADDING_INLINE}
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

            {/* The icon carries the CI state alone here, so the label the
                comfortable card prints becomes the accessible name. */}
            {pr.ciStatus !== 'none' && ci !== null && (
              <View
                width="16px"
                height="16px"
                align="center"
                justify="center"
                borderRadius="small"
                backgroundColor={ci.background}
                border
                borderColor={ci.border}
                attributes={{ role: 'img', 'aria-label': ci.label }}
              >
                <Icon svg={CI_ICONS[pr.ciStatus]} size="10px" color={ci.text} />
              </View>
            )}

            {/* Uncapped, so the title yields instead: the reason is why the
                row is in the inbox at all, and a clipped one ("Re-review
                reque…") says less than the title it was protecting. Every
                reason `classify` produces is short — the longest is
                "Waiting on reviewers". */}
            {status !== null && (
              <Text as="span" variant="caption-1" weight="semibold" color={status.text}>
                {item.reason}
              </Text>
            )}
          </View>
        </View>
      </div>
    )
  },
)

export default CompactPullRequestCard
