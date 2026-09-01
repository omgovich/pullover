import { RefreshCw, Settings } from 'lucide-react'
import { Button, Text, View } from 'reshaped/bundle'
import { formatAge } from '@core/format'
import type { InboxSnapshot } from '@shared/ipc'

interface Props {
  snapshot: InboxSnapshot
  now: string
  refreshing: boolean
  onRefresh: () => void
  onOpenSettings: () => void
}

/**
 * Staleness must stay visible even while an error is showing — otherwise the
 * user can't tell whether the list on screen is a minute or three days old.
 */
function statusText(snapshot: InboxSnapshot, now: string): string {
  if (snapshot.errorMessage === null) {
    return snapshot.lastUpdatedAt === null
      ? 'Not fetched yet'
      : `Updated ${formatAge(snapshot.lastUpdatedAt, now)}`
  }
  if (snapshot.lastUpdatedAt === null) {
    return snapshot.errorMessage
  }
  return `${snapshot.errorMessage} · last updated ${formatAge(snapshot.lastUpdatedAt, now)}`
}

// Button's size steps don't land on 32×32 with a 9px radius (small is closer
// to 28px, per the old design; medium overshoots to 36px), so the box itself
// is set directly via `attributes.style` rather than through `size`. The
// hover color/background shift the design also calls for isn't reachable the
// same way — `--rs-button-color` isn't hover-conditional, and Button's own
// cascade out-specifies a plain external class — so this keeps Button's
// ghost/neutral defaults (transparent at rest, its own faint hover wash)
// rather than fight that with custom CSS, per the project's own rule that a
// visual mismatch is preferable to writing it.
const iconButtonStyle = {
  width: '32px',
  height: '32px',
  minWidth: '32px',
  minHeight: '32px',
  padding: 0,
  borderRadius: '9px',
}

export default function Header({
  snapshot,
  now,
  refreshing,
  onRefresh,
  onOpenSettings,
}: Props): React.JSX.Element {
  return (
    <View
      direction="row"
      align="center"
      justify="space-between"
      gap={3}
      height={13}
      paddingStart={4}
      paddingEnd={2.5}
      backgroundColor="elevation-raised"
      borderColor="neutral-faded"
      borderBottom
    >
      <View direction="row" align="center" gap={2.5} minWidth={0}>
        {snapshot.attentionCount > 0 && (
          // Neutral text on a faint white wash — no longer accent-colored.
          // A plain View instead of `Badge`: `Badge`'s own `Text` is fixed at
          // weight="medium" with no tabular-nums, but this count changes and
          // the design calls for weight 700 and tabular figures, so it stays
          // custom.
          <View
            minWidth="26px"
            height={6}
            paddingInline={2}
            align="center"
            justify="center"
            borderRadius="medium"
            attributes={{ style: { background: '#ffffff12' } }}
          >
            <Text as="span" variant="caption-1" weight="bold" numeric color="neutral-faded">
              {snapshot.attentionCount}
            </Text>
          </View>
        )}
        <View direction="column" minWidth={0}>
          <Text as="span" variant="body-2" weight="semibold" color="neutral" maxLines={1}>
            {snapshot.attentionCount > 0 ? 'waiting on you' : 'All clear'}
          </Text>
          <Text as="span" variant="caption-1" color="neutral-faded" maxLines={1}>
            {statusText(snapshot, now)}
          </Text>
        </View>
      </View>

      <View direction="row" align="center" gap={1}>
        <Button
          variant="ghost"
          color="neutral"
          size="small"
          icon={RefreshCw}
          loading={refreshing}
          onClick={onRefresh}
          attributes={{
            title: 'Refresh — R',
            'aria-label': 'Refresh — R',
            style: iconButtonStyle,
          }}
        />
        <Button
          variant="ghost"
          color="neutral"
          size="small"
          icon={Settings}
          onClick={onOpenSettings}
          attributes={{
            title: 'Settings',
            'aria-label': 'Settings',
            style: iconButtonStyle,
          }}
        />
      </View>
    </View>
  )
}
