import { useState } from 'react'
import { RefreshCw, Settings } from 'lucide-react'
import { Button, Text, View } from 'reshaped/bundle'
import { formatAge } from '@core/format'
import type { InboxSnapshot } from '@shared/ipc'

interface Props {
  snapshot: InboxSnapshot
  now: string
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
  onOpenSettings,
}: Props): React.JSX.Element {
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      await window.api.refresh()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <View
      direction="row"
      gap={2}
      align="center"
      padding={3}
      borderColor="neutral-faded"
      borderBottom
    >
      <View gap={0}>
        <Text variant="body-2" weight="bold">
          {snapshot.attentionCount > 0
            ? `${snapshot.attentionCount} waiting on you`
            : 'All clear'}
        </Text>
        <Text
          variant="caption-2"
          color={snapshot.errorMessage === null ? 'neutral-faded' : 'critical'}
        >
          {statusText(snapshot, now)}
        </Text>
      </View>

      <View grow />

      <Button
        size="small"
        variant="ghost"
        icon={RefreshCw}
        loading={refreshing}
        onClick={() => void refresh()}
        attributes={{ title: 'Refresh', 'aria-label': 'Refresh' }}
      />
      <Button
        size="small"
        variant="ghost"
        icon={Settings}
        onClick={onOpenSettings}
        attributes={{ title: 'Settings', 'aria-label': 'Settings' }}
      />
    </View>
  )
}
