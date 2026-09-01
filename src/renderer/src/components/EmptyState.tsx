import { Check, Clock, RefreshCw } from 'lucide-react'
import { Icon, Text, View } from 'reshaped/bundle'

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
        width={19}
        height={19}
        position="relative"
        align="center"
        justify="center"
        borderRadius="circular"
        border
        borderColor="primary-faded"
      >
        <Icon svg={Check} size={32} />
      </View>

      <Text as="div" variant="featured-5" weight="bold" className="pv-empty-heading">
        {isError ? "Couldn't refresh" : 'Inbox zero'}
      </Text>
      <Text as="div" color="neutral-faded" className="pv-empty-body">
        {isError
          ? 'What you see may be stale or incomplete.'
          : 'You have reviewed everything waiting on you. New pull requests will land here.'}
      </Text>

      {snoozedCount > 0 && (
        <View className="pv-empty-stats" direction="row" align="center" position="relative">
          <View className="pv-stat-pill" direction="row" align="center" borderRadius="circular">
            <Icon svg={Clock} size={12} />
            {snoozedCount} snoozed
          </View>
        </View>
      )}

      {/* Not `Button`: same reasoning as the header's icon buttons — see Header.tsx. */}
      <View className="pv-empty-actions" direction="row" align="center" gap={2} position="relative">
        {snoozedCount > 0 && (
          <button type="button" className="pv-btn pv-btn-ghost" onClick={onShowSnoozed}>
            Show snoozed
          </button>
        )}
        <button
          type="button"
          className="pv-btn pv-btn-accent"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <Icon svg={RefreshCw} size={13} className={refreshing ? 'pv-spin' : undefined} />
          Check again
        </button>
      </View>
    </View>
  )
}
