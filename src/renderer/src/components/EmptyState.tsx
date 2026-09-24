import { Check, CloudOff, SearchX, TriangleAlert } from 'lucide-react'
import { Icon, Text, View } from 'reshaped/bundle'

interface Props {
  /** True when the empty state is empty because a refresh failed, not because there's nothing to do. */
  isError: boolean
  /** True when GitHub returned some results but stopped before the search finished. */
  isPartial?: boolean
  /** Shown only when GitLab returned no visible MRs for the connected account. */
  gitlabAccount?: string | null
}

function contentFor({ isError, isPartial, gitlabAccount }: Props) {
  if (isError) {
    return {
      icon: CloudOff,
      color: 'critical' as const,
      title: "Couldn't refresh",
      description: 'What you see may be stale or incomplete.',
    }
  }
  if (isPartial) {
    return {
      icon: TriangleAlert,
      color: 'critical' as const,
      title: 'Partial inbox',
      description: 'Some PRs may be missing. Try refreshing later.',
    }
  }
  if (gitlabAccount) {
    return {
      icon: SearchX,
      color: 'neutral-faded' as const,
      title: 'No MRs found',
      description: `Connected as @${gitlabAccount}. If you expected MRs, sign out in Settings and reconnect with your personal token.`,
    }
  }
  return {
    icon: Check,
    color: 'positive' as const,
    title: 'Inbox zero',
    description: 'Nothing waiting on you. Great job, buddy.',
  }
}

export default function EmptyState({
  isError,
  isPartial = false,
  gitlabAccount = null,
}: Props): React.JSX.Element {
  const content = contentFor({ isError, isPartial, gitlabAccount })
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
      <Icon svg={content.icon} size="28px" color={content.color} />

      <View.Item gapBefore={3.5}>
        <Text as="div" variant="body-2" weight="semibold" color="neutral">
          {content.title}
        </Text>
      </View.Item>

      <View.Item gapBefore={0.75}>
        <Text as="div" variant="caption-1" color="neutral-faded">
          {content.description}
        </Text>
      </View.Item>
    </View>
  )
}
