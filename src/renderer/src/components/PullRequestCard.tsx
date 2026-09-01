import { forwardRef, useImperativeHandle, useRef } from 'react'
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

// The status pill's colors, keyed off the exact reason strings
// `src/core/classify.ts` produces. The counted reasons ("3 new replies", "2
// open threads") and the remaining ones ("Review requested", "Re-review
// requested", "New commits") aren't listed here on purpose — they fall
// through to the default accent pair below rather than being parsed.
const STATUS_PILL_COLORS: Record<string, { text: string; background: string }> = {
  'CI is red': { text: '#f36a6a', background: '#3a2020' },
  'Changes requested': { text: '#f36a6a', background: '#3a2020' },
  'Ready to merge': { text: '#18ab66', background: '#1d2b23' },
  'Waiting on author': { text: '#9aa4b8', background: '#ffffff12' },
  'Waiting on reviewers': { text: '#9aa4b8', background: '#ffffff12' },
  Snoozed: { text: '#9aa4b8', background: '#ffffff12' },
  Mentioned: { text: '#f1c512', background: '#2e2818' },
}

// Same purple as `--pv-accent-text` in pullover.css (the PR number below
// uses that CSS variable directly); kept as a literal here so every entry in
// this lookup reads the same way, but the two should stay in sync.
const DEFAULT_STATUS_PILL_COLOR = { text: '#8b8af7', background: '#252544' }

function statusPillColor(reason: string): { text: string; background: string } {
  return STATUS_PILL_COLORS[reason] ?? DEFAULT_STATUS_PILL_COLOR
}

// The design's CI pill drops the three-color `Badge` mapping the old
// Review-button footer used, in favor of its own hand-picked hex pairs plus
// a leading dot — nothing left here maps onto a `Badge` color/variant.
const CI_PILL_COLORS = {
  success: { text: '#18ab66', background: '#1f2a23', label: 'CI green' },
  failure: { text: '#f36a6a', background: '#3e1f1f', label: 'CI failing' },
  pending: { text: '#b4920c', background: '#2c271f', label: 'CI running' },
} as const

function initialsOf(login: string): string {
  return login.slice(0, 1).toUpperCase()
}

const PullRequestCard = forwardRef<PullRequestCardHandle, Props>(function PullRequestCard(
  { item, now, isActive, onHover, onSelect, onSnoozed }: Props,
  ref,
) {
  const { pr } = item
  const ci = pr.ciStatus === 'none' ? null : CI_PILL_COLORS[pr.ciStatus]
  const status = item.reason !== '' ? statusPillColor(item.reason) : null
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

  // The Review button is gone from the design, so the card body itself is
  // now what opens the pull request — on click, and (via App's `enter`
  // hotkey, unchanged) on Enter for whichever card is keyboard-selected.
  // Clicking still also selects the card, so the keyboard cursor picks up
  // from wherever the mouse last was.
  const handleOpen = (): void => {
    onSelect(pr.id)
    void window.api.openPr(pr.url)
  }

  // A plain `<div>`, not `View`, wraps the row for the sake of `cardRef`:
  // `View` isn't `forwardRef`, and unlike `Card` (see the old version of
  // this file) its `attributes` type has no `ref` field at all to cast
  // into, satisfiable or not. Everything visual still lives on the `View`
  // inside it — this wrapper carries no styling of its own.
  //
  // It's deliberately not focusable (no `tabIndex`): keyboard navigation
  // already runs entirely through App's arrow-key/Enter hotkeys against
  // `selectedId`, not DOM focus, and making this row Tab-focusable would
  // give it its own native Enter-to-click behavior on top of that global
  // handler — double-opening the PR when the row happens to hold focus.
  // `role="button"` stays, for assistive tech, without `tabIndex`.
  return (
    <div ref={cardRef}>
      <View
        direction="row"
        align="start"
        gap={2.75}
        paddingTop={2.25}
        paddingInline={2.5}
        paddingBottom={2.5}
        borderRadius="large"
        attributes={{
          role: 'button',
          onClick: handleOpen,
          onMouseEnter: () => onHover(pr.id),
          onMouseLeave: () => onHover(null),
          style: {
            cursor: 'pointer',
            background: isActive ? '#ffffff12' : 'transparent',
            transition: 'background 140ms',
          },
        }}
      >
        <Avatar
          src={pr.authorAvatarUrl !== '' ? pr.authorAvatarUrl : undefined}
          initials={initialsOf(pr.authorLogin)}
          size={8}
          variant="faded"
          color="primary"
          // No `Avatar` prop reaches `letter-spacing` or lets font-size be
          // set directly (no Reshaped prop does either).
          attributes={{ style: { letterSpacing: '0.02em', fontSize: '11.5px' } }}
        />

        <View.Item grow>
          <View direction="column" gap={1} minWidth={0}>
            {/* Meta row: repo, #number, age, and now the diff counts too,
                moved up here from the footer. `wrap={false}` replaces the
                nowrap that used to come as a side effect of the trailing
                `View.Item grow` this row no longer has now that the CI pill
                moved to the row below. */}
            <View direction="row" align="center" gap={2} wrap={false} minWidth={0}>
              <View shrink minWidth={0}>
                <Text as="span" variant="caption-1" color="neutral-faded" maxLines={1}>
                  {pr.repository}
                </Text>
              </View>
              <Text
                as="span"
                variant="caption-1"
                numeric
                // Custom accent purple — the one place besides the status
                // pill's default this app keeps it (see pullover.css). No
                // longer bold, per the design.
                attributes={{ style: { color: 'var(--pv-accent-text)' } }}
              >
                #{pr.number}
              </Text>
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

            {/* Third row: status pill, CI pill, a spacer, then the snooze
                pill — replaces the old footer's reason `Badge` plus the
                Review/snooze button pair. `wrap={false}` keeps it one line
                so the status pill shrinks and ellipsises instead of the row
                wrapping — nothing here has a `grow` child to trigger nowrap
                as a side effect the way the meta row's diff pair used to. */}
            <View direction="row" align="center" gap={2} wrap={false} minWidth={0}>
              {status !== null && (
                <View
                  shrink
                  minWidth={0}
                  overflow="hidden"
                  paddingBlock={0.5}
                  paddingInline={2.25}
                  borderRadius="circular"
                  attributes={{ style: { background: status.background } }}
                >
                  <Text
                    as="span"
                    variant="caption-1"
                    weight="semibold"
                    maxLines={1}
                    attributes={{ style: { color: status.text } }}
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
                  attributes={{ style: { background: ci.background } }}
                >
                  <View
                    width="5px"
                    height="5px"
                    borderRadius="circular"
                    attributes={{ style: { background: ci.text, flexShrink: 0 } }}
                  />
                  <Text
                    as="span"
                    variant="caption-1"
                    weight="semibold"
                    maxLines={1}
                    attributes={{ style: { color: ci.text } }}
                  >
                    {ci.label}
                  </Text>
                </View>
              )}

              {/*
               * The snooze pill: always in the flow, revealed on
               * hover/active rather than rendered conditionally, so the
               * pointer moving between cards never reflows the row. No
               * Reshaped prop expresses "hidden but still holding its
               * layout space" — `hidden` props elsewhere in the library
               * remove elements from flow or scale them to 0, neither of
               * which reserves the space — so this stays custom CSS.
               * `gapBefore="auto"` pins it to the row's end.
               */}
              <View.Item gapBefore="auto">
                <View
                  className={`pv-card-actions${isActive ? ' pv-card-actions--active' : ''}`}
                  attributes={{ 'aria-hidden': !isActive }}
                >
                  <SnoozeMenu
                    prId={pr.id}
                    isSnoozed={item.isSnoozed}
                    instanceRef={snoozeInstanceRef}
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
