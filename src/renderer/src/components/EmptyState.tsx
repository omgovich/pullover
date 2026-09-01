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
  // Every margin-top the design called for between these stacked, centered
  // elements (20 / 4 / 20 / 24px) is now a `gap`/`gapBefore` on this column
  // instead of a per-element `margin-top` — `View`'s default `gap` (4px)
  // already matches the heading→body spacing, so only the other three need
  // an explicit `gapBefore` to reach their larger, different totals.
  return (
    <View
      align="center"
      textAlign="center"
      position="relative"
      overflow="hidden"
      paddingTop={13}
      paddingBottom={11}
      paddingInline={6}
      gap={1}
    >
      {/* The masked radial-gradient dot field has no Reshaped equivalent. */}
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

      <View.Item gapBefore={5}>
        <Text as="div" variant="featured-5" weight="bold">
          {isError ? "Couldn't refresh" : 'Inbox zero'}
        </Text>
      </View.Item>
      {/* 13px in the design — between `caption-1` (12px) and `body-2` (14px);
          `body-2` reads better as a subtitle under a `featured-5` heading. */}
      <View maxWidth="280px">
        <Text
          as="div"
          variant="body-2"
          color="neutral-faded"
          // `text-wrap: pretty` has no `Text` equivalent (`wrap` only offers
          // `"balance"`, a different line-breaking algorithm).
          attributes={{ style: { textWrap: 'pretty' } }}
        >
          {isError
            ? 'What you see may be stale or incomplete.'
            : 'You have reviewed everything waiting on you. New pull requests will land here.'}
        </Text>
      </View>

      {snoozedCount > 0 && (
        <View.Item gapBefore={5}>
          <View direction="row" align="center" position="relative">
            <Badge variant="faded" color="neutral" size="small" icon={Clock} rounded>
              {snoozedCount} snoozed
            </Badge>
          </View>
        </View.Item>
      )}

      <View.Item gapBefore={6}>
        <View direction="row" align="center" gap={2} position="relative">
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
      </View.Item>
    </View>
  )
}
