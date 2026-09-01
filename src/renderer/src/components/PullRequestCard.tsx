import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Avatar, Badge, Button, Card, Text, View } from 'reshaped/bundle'
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

  // `Card` is used with its own `onClick` (not `attributes.onClick`, which
  // Card's non-actionable render path clobbers with its own undefined
  // `onClick` prop — checked in Card.js). With the default `as` ("div"),
  // `onClick` routes through `Actionable`, which only renders a literal
  // `<button>` when `as` is left undefined; Card always passes an explicit
  // `as` down, so this renders a div with `role="button"` instead — safe to
  // nest the Review/snooze `Button`s inside. `selected` drives the ring
  // Reshaped ships (an inset primary-blue box-shadow, not this app's purple,
  // and not the old bespoke ring) and the actionable hover tint is whatever
  // Card gives for free — both accepted per the owner's call.
  return (
    <Card
      direction="row"
      align="start"
      gap={3}
      padding={3}
      raised
      selected={isActive}
      onClick={() => onSelect(pr.id)}
      attributes={{
        // `Card`'s `attributes.ref` type is intersected from both a plain
        // `<div>`'s ref and `Actionable`'s button-shaped `AttributesRef` —
        // two mutually exclusive element types no single ref value can ever
        // satisfy (see Card.types.d.ts / Actionable.types.d.ts). The element
        // really is a div (see the comment above), so this is a type-level
        // cast only; `cardRef.current` stays an `HTMLDivElement`.
        ref: cardRef as unknown as never,
        onMouseEnter: () => onHover(pr.id),
        onMouseLeave: () => onHover(null),
      }}
    >
      <Avatar
        src={pr.authorAvatarUrl !== '' ? pr.authorAvatarUrl : undefined}
        initials={initialsOf(pr.authorLogin)}
        size={8}
        variant="faded"
        color="primary"
        // No `Avatar` prop reaches `letter-spacing` (no Reshaped prop does).
        attributes={{ style: { letterSpacing: '0.02em' } }}
      />

      <View.Item grow>
        <View direction="column" gap={1} minWidth={0}>
          <View direction="row" align="center" gap={1}>
            {/* Only this row's flexible element: `shrink`/`minWidth={0}`
                override the `flex-shrink: 0` Reshaped's `View` already
                applies to every item here once a sibling (the spacer below)
                has `grow` — everything else in the row keeps that default. */}
            <View shrink minWidth={0}>
              <Text as="span" variant="caption-1" color="neutral-faded" maxLines={1}>
                {pr.repository}
              </Text>
            </View>
            <Text
              as="span"
              variant="caption-1"
              weight="semibold"
              numeric
              // Custom accent purple — one of the three places the owner
              // wants it kept (see pullover.css), not a Reshaped token.
              attributes={{ style: { color: 'var(--pv-accent-text)' } }}
            >
              #{pr.number}
            </Text>
            <Text as="span" variant="caption-1" color="neutral-faded">
              ·
            </Text>
            <Text as="span" variant="caption-1" color="neutral-faded" numeric>
              {formatAge(pr.updatedAt, now)}
            </Text>
            <View.Item grow />
            {ci !== null && (
              <Badge variant="faded" color={ci.color} size="small">
                {ci.label}
              </Badge>
            )}
          </View>

          <Text as="div" variant="body-2" weight="semibold" maxLines={1}>
            {pr.title}
          </Text>

          <View direction="row" align="center" gap={2} minHeight={6}>
            <View as="span" direction="row" gap={1}>
              <Text as="span" variant="caption-1" weight="semibold" numeric color="positive">
                +{pr.additions}
              </Text>
              <Text as="span" variant="caption-1" weight="semibold" numeric color="critical">
                {'−'}
                {pr.deletions}
              </Text>
            </View>
            {/*
             * A `Badge` now, per the owner's call — its internal `Text` isn't
             * reachable via `className`, so a long reason clips abruptly at
             * `maxWidth` with no "…" rather than ellipsising. That's an
             * accepted loss of detail, not a missing capability: the pill's
             * color/background/radius/padding are all real tokens/props.
             */}
            {item.reason !== '' && (
              <View maxWidth="200px" overflow="hidden" shrink minWidth={0}>
                <Badge variant="faded" color="primary" size="small" rounded>
                  {item.reason}
                </Badge>
              </View>
            )}

            {/*
             * Always in the flow, revealed on hover. Rendering it conditionally
             * would reflow the row every time the pointer moves between cards.
             * `gapBefore="auto"` pins it to the row's end (Reshaped's own
             * `margin-inline-start: auto` mechanism, replacing the old
             * hand-rolled one); visibility/opacity/transition have no
             * Reshaped equivalent for "keep the layout space while hidden",
             * so that part stays custom CSS.
             */}
            <View.Item gapBefore="auto">
              <View
                className={`pv-card-actions${isActive ? ' pv-card-actions--active' : ''}`}
                direction="row"
                align="center"
                gap={2}
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
            </View.Item>
          </View>
        </View>
      </View.Item>
    </Card>
  )
})

export default PullRequestCard
