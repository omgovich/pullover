import { RefreshCw, Settings } from 'lucide-react'
import { Badge, Button, Text, View } from 'reshaped/bundle'
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
      height={11}
      paddingStart={3}
      paddingEnd={2}
      backgroundColor="elevation-raised"
      borderColor="neutral"
      borderBottom
    >
      <View direction="row" align="center" gap={2} minWidth={0}>
        {snapshot.attentionCount > 0 ? (
          <>
            {/* `primary`/`faded` is Reshaped's closest built-in pairing to
                the design's dark-indigo chip (muted indigo background,
                bright indigo foreground) — close enough that the old
                `--pv-accent-text` override isn't worth carrying over here. */}
            <Badge color="primary" variant="faded" size="small">
              {snapshot.attentionCount}
            </Badge>
            <Text as="span" variant="caption-1" weight="semibold" color="neutral" maxLines={1}>
              waiting on you
            </Text>
          </>
        ) : (
          <Text as="span" variant="caption-1" weight="semibold" color="neutral" maxLines={1}>
            All clear
          </Text>
        )}
        {/* An empty `Badge` is Reshaped's dot: `rounded` makes it circular,
            and dropping `variant` gives the solid color fill. It's a plain
            neutral bullet now, not a status light — the error state reads
            through `statusText` below instead. */}
        <Badge color="neutral" size="small" rounded />
        {/* Wrapping in its own `minWidth={0}` `View` is what lets `Text`'s
            `maxLines={1}` actually truncate instead of overflowing: a flex
            child's min-width defaults to its content size otherwise. */}
        <View minWidth={0}>
          <Text as="span" variant="caption-1" color="neutral-faded" maxLines={1}>
            {statusText(snapshot, now)}
          </Text>
        </View>
      </View>

      <View direction="row" align="center" gap={0.5}>
        <Button
          variant="outline"
          color="neutral"
          size="small"
          icon={RefreshCw}
          loading={refreshing}
          onClick={onRefresh}
          attributes={{ title: 'Refresh — R', 'aria-label': 'Refresh — R' }}
        />
        <Button
          variant="outline"
          color="neutral"
          size="small"
          icon={Settings}
          onClick={onOpenSettings}
          attributes={{ title: 'Settings', 'aria-label': 'Settings' }}
        />
      </View>
    </View>
  )
}
