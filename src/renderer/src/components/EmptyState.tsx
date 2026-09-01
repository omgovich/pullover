import { Check, Clock, RefreshCw } from 'lucide-react'
import { Badge, Button, Icon, Text, View } from 'reshaped/bundle'

interface Props {
  /** True when the empty state is empty because a refresh failed, not because there's nothing to do. */
  isError: boolean
  snoozedCount: number
  refreshing: boolean
  onRefresh: () => void
  onShowSnoozed: () => void
}

export default function EmptyState({
  isError,
  snoozedCount,
  refreshing,
  onRefresh,
  onShowSnoozed,
}: Props): React.JSX.Element {
  return (
    <View
      className="pv-empty"
      align="center"
      textAlign="center"
      position="relative"
      overflow="hidden"
      paddingTop={13}
      paddingBottom={11}
      paddingInline={6}
    >
      <View className="pv-empty-dots" position="absolute" />

      <View
        className="pv-empty-badge"
        width={5}
        height={5}
        position="relative"
        align="center"
        justify="center"
        borderRadius="circular"
        backgroundColor="primary-faded"
        border
        borderColor="primary-faded"
      >
        <Icon svg={Check} size={32} color="primary" />
      </View>

      <Text as="div" variant="featured-5" weight="bold" className="pv-empty-heading">
        {isError ? "Couldn't refresh" : 'Inbox zero'}
      </Text>
      {/* 13px in the design — between `caption-1` (12px) and `body-2` (14px);
          `body-2` reads better as a subtitle under a `featured-5` heading. */}
      <Text as="div" variant="body-2" color="neutral-faded" className="pv-empty-body">
        {isError
          ? 'What you see may be stale or incomplete.'
          : 'You have reviewed everything waiting on you. New pull requests will land here.'}
      </Text>

      {snoozedCount > 0 && (
        <View className="pv-empty-stats" direction="row" align="center" position="relative">
          <Badge variant="faded" color="neutral" size="small" icon={Clock} rounded>
            {snoozedCount} snoozed
          </Badge>
        </View>
      )}

      <View className="pv-empty-actions" direction="row" align="center" gap={2} position="relative">
        {snoozedCount > 0 && (
          <Button variant="outline" color="neutral" onClick={onShowSnoozed}>
            Show snoozed
          </Button>
        )}
        <Button
          variant="solid"
          color="primary"
          icon={RefreshCw}
          loading={refreshing}
          onClick={onRefresh}
        >
          Check again
        </Button>
      </View>
    </View>
  )
}
