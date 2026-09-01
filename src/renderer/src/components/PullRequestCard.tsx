import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Avatar, Text, View, type TextProps, type ViewProps } from 'reshaped/bundle'
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
  /** Moves real DOM focus onto the card, without also scrolling (App handles that itself). */
  focus: () => void
}

interface PillColor {
  text: NonNullable<TextProps['color']>
  background: NonNullable<ViewProps['backgroundColor']>
}

// Keyed off the exact reason strings `src/core/classify.ts` produces. The
// counted reasons ("3 new replies", "2 open threads") aren't listed here on
// purpose — they fall through to the default accent pair below.
const STATUS_PILL_COLORS: Record<string, PillColor> = {
  'CI is red': { text: 'critical', background: 'critical-faded' },
  'Changes requested': { text: 'critical', background: 'critical-faded' },
  'Ready to merge': { text: 'positive', background: 'positive-faded' },
  'Waiting on author': { text: 'neutral-faded', background: 'neutral-faded' },
  'Waiting on reviewers': { text: 'neutral-faded', background: 'neutral-faded' },
  Snoozed: { text: 'neutral-faded', background: 'neutral-faded' },
  Mentioned: { text: 'warning', background: 'warning-faded' },
}

const DEFAULT_STATUS_PILL_COLOR: PillColor = { text: 'primary', background: 'primary-faded' }

function statusPillColor(reason: string): PillColor {
  return STATUS_PILL_COLORS[reason] ?? DEFAULT_STATUS_PILL_COLOR
}

const CI_PILL_COLORS: Record<'success' | 'failure' | 'pending', PillColor & { label: string }> = {
  success: { text: 'positive', background: 'positive-faded', label: 'CI green' },
  failure: { text: 'critical', background: 'critical-faded', label: 'CI failing' },
  pending: { text: 'warning', background: 'warning-faded', label: 'CI running' },
}

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
        paddingTop={2.25}
        paddingInline={2.5}
        paddingBottom={2.5}
        borderRadius="large"
        backgroundColor={isActive ? 'neutral-faded' : undefined}
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
            {/* Meta row: repo, #number, age, diff counts. `wrap={false}` keeps
                it one line so the repo name ellipsises instead of wrapping. */}
            <View direction="row" align="center" gap={2} wrap={false} minWidth={0}>
              <View shrink minWidth={0}>
                <Text as="span" variant="caption-1" color="neutral-faded" maxLines={1}>
                  {pr.repository}
                </Text>
              </View>
              <Text as="span" variant="caption-1" numeric color="primary">
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
                >
                  <Text as="span" variant="caption-1" weight="semibold" maxLines={1} color={status.text}>
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
                >
                  <View
                    width="5px"
                    height="5px"
                    borderRadius="circular"
                    backgroundColor={ci.text}
                    attributes={{ style: { flexShrink: 0 } }}
                  />
                  <Text as="span" variant="caption-1" weight="semibold" maxLines={1} color={ci.text}>
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
