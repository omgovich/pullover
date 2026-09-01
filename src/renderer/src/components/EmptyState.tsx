import { Check } from 'lucide-react'
import { Icon, Text, View } from 'reshaped/bundle'

interface Props {
  /** True when the empty state is empty because a refresh failed, not because there's nothing to do. */
  isError: boolean
}

export default function EmptyState({ isError }: Props): React.JSX.Element {
  return (
    <View
      align="center"
      textAlign="center"
      paddingTop={16}
      paddingBottom={15}
      paddingInline={6}
    >
      <Icon svg={Check} size="28px" color="positive" />

      <View.Item gapBefore={3.5}>
        <Text as="div" variant="body-2" weight="semibold" color="neutral">
          {isError ? "Couldn't refresh" : 'Inbox zero'}
        </Text>
      </View.Item>

      <View.Item gapBefore={0.75}>
        <Text as="div" variant="caption-1" color="neutral-faded">
          {isError
            ? 'What you see may be stale or incomplete.'
            : 'Nothing waiting on you. Great job, buddy.'}
        </Text>
      </View.Item>
    </View>
  )
}
