import type { CiStatus } from '@shared/types'
import { Check, Clock, X } from 'lucide-react'
import { Icon, Text, View } from 'reshaped/bundle'
import { accentTint, CI_BADGES, statusAccent } from './pr-colors'

/**
 * The pieces both card layouts draw the same way. They were compact's alone
 * until the comfortable row was rebuilt around the same right-hand group;
 * keeping one copy is what stops the two layouts drifting apart on a colour
 * or a size that is meant to read as the same thing.
 */

const CI_ICONS = { success: Check, failure: X, pending: Clock } as const

/** Every badge on a meta line stands this tall, so a row's badges line up. */
export const BADGE_HEIGHT_PX = 16

/** Two letters: one is ambiguous at a glance across a list of teammates. */
export function initialsOf(login: string): string {
  return login.slice(0, 2).toUpperCase()
}

/**
 * The CI state as an icon alone. The chip is the only thing carrying it, so
 * the label rides along as the accessible name rather than as visible text.
 *
 * Fill and no border, which is why the background comes from `accentTint`
 * rather than a `backgroundColor` token — see `pr-colors.ts` for why a
 * `*-faded` fill cannot hold an edge by itself.
 */
export function CiChip({ status }: { status: CiStatus }): React.JSX.Element | null {
  if (status === 'none') return null
  const ci = CI_BADGES[status]

  return (
    <View
      width={`${BADGE_HEIGHT_PX}px`}
      height={`${BADGE_HEIGHT_PX}px`}
      align="center"
      justify="center"
      borderRadius="small"
      attributes={{
        role: 'img',
        'aria-label': ci.label,
        style: { backgroundColor: accentTint(ci.accent) },
      }}
    >
      <Icon svg={CI_ICONS[status]} size="10px" color={ci.accent} />
    </View>
  )
}

/**
 * Why the row is in the inbox, as plain coloured text.
 *
 * Uncapped, so the title yields instead: a clipped reason ("Re-review
 * reque…") says less than the title it was protecting, and every reason
 * `classify` produces is short — the longest is "Waiting on reviewers".
 */
export function StatusText({ reason }: { reason: string }): React.JSX.Element | null {
  if (reason === '') return null

  return (
    <Text as="span" variant="caption-1" weight="semibold" color={statusAccent(reason)}>
      {reason}
    </Text>
  )
}
