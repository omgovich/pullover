import { forwardRef, useImperativeHandle, useRef } from 'react'
import type { CSSProperties } from 'react'
import { Avatar, Text, View } from 'reshaped/bundle'
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

const CI_LABELS = {
  success: { label: 'CI green', text: '#18ab66', bg: '#1f2a23', border: '#264431' },
  failure: { label: 'CI failing', text: '#f36a6a', bg: '#3e1f1f', border: '#5a2e29' },
  pending: { label: 'CI running', text: '#b4920c', bg: '#2c271f', border: '#453c1e' },
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

  const openPr = (event: React.MouseEvent): void => {
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
      position="relative"
      borderRadius="large"
      border
      borderColor="neutral-faded"
      backgroundColor="elevation-raised"
      attributes={{
        ref: cardRef,
        onClick: () => onSelect(pr.id),
        onMouseEnter: () => onHover(pr.id),
        onMouseLeave: () => onHover(null),
      }}
    >
      <View
        className={`pv-card-ring${isActive ? ' pv-card-ring--active' : ''}`}
        position="absolute"
        inset={0}
        borderRadius="large"
        border
        borderColor="primary"
      />

      <Avatar
        className="pv-avatar"
        src={pr.authorAvatarUrl !== '' ? pr.authorAvatarUrl : undefined}
        initials={initialsOf(pr.authorLogin)}
        size={8}
      />

      <View.Item grow>
        <View className="pv-card-body" direction="column">
          {/* No `variant` on the children below: this row is 11px, between
              caption-1 (12px) and caption-2 (10px) — the size comes from the
              `.pv-meta-row` class instead. */}
          <View className="pv-meta-row" direction="row" align="center" gap={1}>
            <Text as="span" className="pv-meta-repo">
              {pr.repository}
            </Text>
            <Text as="span" weight="semibold" className="pv-meta-number">
              #{pr.number}
            </Text>
            <Text as="span" className="pv-meta-dot">
              ·
            </Text>
            <Text as="span" className="pv-meta-age">
              {formatAge(pr.updatedAt, now)}
            </Text>
            <View.Item grow />
            {ci !== null && (
              <View
                className="pv-ci-pill"
                direction="row"
                align="center"
                borderRadius="circular"
                attributes={{
                  style: {
                    '--pv-ci-text': ci.text,
                    '--pv-ci-bg': ci.bg,
                    '--pv-ci-border': ci.border,
                  } as CSSProperties,
                }}
              >
                <span className="pv-ci-dot" />
                <Text as="span" variant="caption-2" weight="semibold">
                  {ci.label}
                </Text>
              </View>
            )}
          </View>

          <Text as="div" variant="body-2" weight="semibold" className="pv-title">
            {pr.title}
          </Text>

          <View
            className="pv-footer-row"
            direction="row"
            align="center"
            gap={2}
            minHeight={6}
          >
            <Text as="span" className="pv-diff">
              <Text as="span" className="pv-diff-add">
                +{pr.additions}
              </Text>
              <Text as="span" className="pv-diff-del">
                {'−'}
                {pr.deletions}
              </Text>
            </Text>
            {/* No `variant`: 11px, no token (see the meta row above). */}
            {item.reason !== '' && (
              <Text as="span" className="pv-reason-pill">
                {item.reason}
              </Text>
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
              {/* Not `Button`: same reasoning as the header's icon buttons — see Header.tsx. */}
              <button type="button" className="pv-review-btn" onClick={openPr} title="Review — ⏎">
                Review
              </button>
            </View>
          </View>
        </View>
      </View.Item>
    </View>
  )
})

export default PullRequestCard
