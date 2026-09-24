import { Check, CloudOff, TriangleAlert } from 'lucide-react'
import { Icon, Text, View } from 'reshaped/bundle'

interface Props {
  /** True when the empty state is empty because a refresh failed, not because there's nothing to do. */
  isError: boolean
  isPartial?: boolean
}

export default function EmptyState({ isError, isPartial = false }: Props): React.JSX.Element {
  const partial = !isError && isPartial
  return (
    // Grows into whatever room the list leaves, which is what pushes a
    // collapsed section onto the bottom edge of the scroll area; the paddings
    // are the height it falls back to once an open section needs the room.
    <View
      grow
      justify="center"
      align="center"
      textAlign="center"
      paddingTop={16}
      paddingBottom={15}
      paddingInline={8}
    >
      <Icon
        svg={isError ? CloudOff : partial ? TriangleAlert : Check}
        size="28px"
        color={isError || partial ? 'critical' : 'positive'}
      />

      <View.Item gapBefore={3.5}>
        <Text as="div" variant="body-2" weight="semibold" color="neutral">
          {isError ? "Couldn't refresh" : partial ? 'Partial inbox' : 'Inbox zero'}
        </Text>
      </View.Item>

      <View.Item gapBefore={0.75}>
        <Text as="div" variant="caption-1" color="neutral-faded">
          {isError
            ? 'What you see may be stale or incomplete.'
            : partial
              ? 'Some PRs may be missing. Try refreshing later.'
              : 'Nothing waiting on you. Great job, buddy.'}
        </Text>
      </View.Item>
    </View>
  )
}
