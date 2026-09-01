import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Avatar, Badge, Button, Text, View } from 'reshaped/bundle'
import type { DropdownMenuInstance } from 'reshaped/bundle'
import { formatAge } from '@core/format'
import type { ClassifiedPullRequest } from '@shared/types'
import SnoozeMenu from './SnoozeMenu'

interface Props {
  item: ClassifiedPullRequest
  now: string
  isActive: boolean
  onHover: (prId: string | null) => void
  onSelect: (prId: string) => void
  onSnoozed: (item: ClassifiedPullRequest) => void
}

/** Imperative surface App needs for keyboard navigation. */
export interface PullRequestCardHandle {
  element: HTMLElement | null
  /** Opens the snooze menu, or triggers unsnooze directly if already snoozed. */
  activateSnooze: () => void
}

// The design's nine hand-picked hexes (three states × text/background/border)
// were approximating exactly the three semantic colors `Badge` already has —
// so the CI pill is a `Badge` now and only the labels survive.
const CI_LABELS = {
  success: { label: 'CI green', color: 'positive' },
  failure: { label: 'CI failing', color: 'critical' },
  pending: { label: 'CI running', color: 'warning' },
} as const

function initialsOf(login: string): string {
  return login.slice(0, 1).toUpperCase()
}

const PullRequestCard = forwardRef<PullRequestCardHandle, Props>(function PullRequestCard(
  { item, now, isActive, onHover, onSelect, onSnoozed }: Props,
  ref,
) {
  const { pr } = item
  const ci = pr.ciStatus === 'none' ? null : CI_LABELS[pr.ciStatus]
  const cardRef = useRef<HTMLDivElement>(null)
  const snoozeInstanceRef = useRef<DropdownMenuInstance>(null)

  useImperativeHandle(ref, () => ({
    element: cardRef.current,
    activateSnooze: () => {
      if (item.isSnoozed) {
        void window.api.unsnooze(pr.id)
      } else {
        snoozeInstanceRef.current?.open()
      }
    },
  }))

  const openPr = (event: React.MouseEvent | React.KeyboardEvent): void => {
    event.stopPropagation()
    void window.api.openPr(pr.url)
  }

  // `Card`'s `selected` state renders a 2px inset box-shadow ring with no
  // background tint, and its `onClick` prop marks it "actionable" which adds
  // an unconditional hover background tint with no prop to turn off — the
  // design has neither (only this hover/select-driven ring, no tint), so the
  // card stays a plain `View`, not a `Card`. It also stays a `div` rather
  // than a `button` (`as="button"`, which `onClick`-handled Views elsewhere
  // in this file use): it contains the Review and snooze/unsnooze buttons,
  // and a `<button>` nested inside another `<button>` is invalid HTML —
  // browsers silently restructure the DOM around it, breaking the inner
  // buttons' clicks. That's exactly how the original plain div with class
  // "pv-card" avoided the problem too.
  return (
    <View
      className="pv-card"
      direction="row"
      align="start"
      gap={3}
      position="relative"
      borderRadius="large"
      border
      borderColor="neutral-faded"
      backgroundColor="elevation-raised"
      paddingBlock={3}
      paddingInline={3}
      attributes={{
        ref: cardRef,
        onClick: () => onSelect(pr.id),
        onMouseEnter: () => onHover(pr.id),
        onMouseLeave: () => onHover(null),
      }}
    >
      {/* The selection ring: driven by React state (`isActive`), not
          `:hover`/`:focus`, and tinted with the accent purple the header
          count and PR number use — not `borderColor="primary"` (Reshaped's
          blue), which is a different color entirely, not a near-miss of it. */}
      <View
        className={`pv-card-ring${isActive ? ' pv-card-ring--active' : ''}`}
        position="absolute"
        inset={0}
        borderRadius="large"
        border
      />

      <Avatar
        className="pv-avatar"
        src={pr.authorAvatarUrl !== '' ? pr.authorAvatarUrl : undefined}
        initials={initialsOf(pr.authorLogin)}
        size={8}
        variant="faded"
        color="primary"
      />

      <View.Item grow>
        <View direction="column" gap={1} minWidth={0}>
          <View direction="row" align="center" gap={1}>
            <Text as="span" variant="caption-1" color="neutral-faded" className="pv-meta-repo">
              {pr.repository}
            </Text>
            <Text
              as="span"
              variant="caption-1"
              weight="semibold"
              numeric
              className="pv-meta-number"
            >
              #{pr.number}
            </Text>
            <Text as="span" variant="caption-1" color="neutral-faded" className="pv-meta-dot">
              ·
            </Text>
            <Text
              as="span"
              variant="caption-1"
              color="neutral-faded"
              numeric
              className="pv-meta-age"
            >
              {formatAge(pr.updatedAt, now)}
            </Text>
            <View.Item grow />
            {ci !== null && (
              <Badge variant="faded" color={ci.color} size="small">
                {ci.label}
              </Badge>
            )}
          </View>

          <Text as="div" variant="body-2" weight="semibold" className="pv-title">
            {pr.title}
          </Text>

          <View direction="row" align="center" gap={2} minHeight={6}>
            <Text as="span" variant="caption-1" weight="semibold" numeric>
              <Text as="span" color="positive">
                +{pr.additions}
              </Text>
              <Text as="span" color="critical" className="pv-diff-del">
                {'−'}
                {pr.deletions}
              </Text>
            </Text>
            {/*
             * Stays a plain `View`/`Text` rather than a `Badge`: the row
             * shrinks this pill and ellipsises its text rather than letting
             * it push the Review/snooze buttons out of the row, which needs
             * `min-width: 0` plus `white-space`/`text-overflow` on the
             * element holding the text itself. `Badge` wraps its children in
             * an internal `Text` inside a flex `.content` span that isn't
             * reachable via `className`, so those three properties would
             * land on `Badge`'s flex *root* instead — which clips the text
             * abruptly with no "…" rather than ellipsising it, since
             * `text-overflow` doesn't apply to a flex container's overflow.
             * Everything else about it (color, background, radius, padding)
             * is real tokens/props now, and the accent purple is dropped in
             * favor of Reshaped's own `primary` per the same scoping as the
             * avatar and Review button below.
             */}
            {item.reason !== '' && (
              <View
                as="span"
                className="pv-reason-pill"
                backgroundColor="primary-faded"
                borderRadius="circular"
                paddingInline={2}
                maxWidth="200px"
              >
                <Text as="span" variant="caption-1" color="primary">
                  {item.reason}
                </Text>
              </View>
            )}

            {/*
             * Always in the flow, revealed on hover. Rendering it conditionally
             * would reflow the row every time the pointer moves between cards.
             */}
            <View
              className={`pv-card-actions${isActive ? ' pv-card-actions--active' : ''}`}
              direction="row"
              align="center"
              attributes={{ 'aria-hidden': !isActive }}
            >
              <SnoozeMenu
                prId={pr.id}
                isSnoozed={item.isSnoozed}
                instanceRef={snoozeInstanceRef}
                onSnoozed={() => onSnoozed(item)}
              />
              <Button
                variant="solid"
                color="primary"
                size="small"
                onClick={openPr}
                attributes={{ title: 'Review — ⏎' }}
              >
                Review
              </Button>
            </View>
          </View>
        </View>
      </View.Item>
    </View>
  )
})

export default PullRequestCard
