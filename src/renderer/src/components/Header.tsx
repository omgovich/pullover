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
  const hasError = snapshot.errorMessage !== null

  return (
    <View
      direction="row"
      align="start"
      justify="space-between"
      gap={3}
      paddingTop={3}
      paddingBottom={3}
      paddingStart={4}
      paddingEnd={3}
      backgroundColor="elevation-raised"
      borderColor="neutral"
      borderBottom
    >
      <View direction="row" align="baseline" gap={2} minWidth={0}>
        {snapshot.attentionCount > 0 ? (
          <>
            {/* 19px in the design, between `featured-6` (18px) and
                `featured-5` (20px) — `featured-6` reads better here: its
                24px line-height stays close to the "waiting on you" label's
                own line-height, instead of opening up extra vertical space
                the compact header doesn't have. */}
            <Text
              as="span"
              variant="featured-6"
              weight="extrabold"
              numeric
              attributes={{ style: { color: 'var(--pv-accent-text)' } }}
            >
              {snapshot.attentionCount}
            </Text>
            <Text as="span" variant="body-2" weight="semibold" color="neutral">
              waiting on you
            </Text>
          </>
        ) : (
          <Text as="span" variant="body-2" weight="semibold" color="neutral">
            All clear
          </Text>
        )}
        <View direction="row" align="center" gap={1} minWidth={0}>
          {/* An empty `Badge` is Reshaped's dot: `rounded` makes it
              circular, and dropping `variant` gives the solid color fill. */}
          <Badge color={hasError ? 'critical' : 'positive'} size="small" rounded />
          {/* `maxLines={1}` keeps the status line from wrapping to a second
              line when the row gets tight — same intent as the old
              `white-space: nowrap`, just expressed through `Text`'s own
              truncation prop instead of a CSS class. */}
          <Text as="span" variant="caption-1" color="neutral-faded" maxLines={1}>
            {statusText(snapshot, now)}
          </Text>
        </View>
      </View>

      <View direction="row" align="center" gap={2}>
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
