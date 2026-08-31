import { useState } from 'react'
import { Button, Text, View } from 'reshaped/bundle'
import { formatAge } from '@core/format'
import type { InboxSnapshot } from '@shared/ipc'

interface Props {
  snapshot: InboxSnapshot
  now: string
  onOpenSettings: () => void
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
            ? `${snapshot.attentionCount} требуют внимания`
            : 'Всё чисто'}
        </Text>
        <Text
          variant="caption-2"
          color={snapshot.errorMessage === null ? 'neutral-faded' : 'critical'}
        >
          {snapshot.errorMessage ??
            (snapshot.lastUpdatedAt === null
              ? 'Ещё не обновлялось'
              : `Обновлено ${formatAge(snapshot.lastUpdatedAt, now)}`)}
        </Text>
      </View>

      <View grow />

      <Button
        size="small"
        variant="ghost"
        loading={refreshing}
        onClick={() => void refresh()}
      >
        Обновить
      </Button>
      <Button size="small" variant="ghost" onClick={onOpenSettings}>
        Настройки
      </Button>
    </View>
  )
}
