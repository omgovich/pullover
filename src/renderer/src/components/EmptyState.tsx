import type { InboxSnapshot } from '@shared/ipc'
import { Check, CloudOff, SearchX, TriangleAlert } from 'lucide-react'
import { Icon, Text, View } from 'reshaped/bundle'
import { isPartialInbox } from './inbox-status'

const STATES = {
  zero: {
    icon: Check,
    color: 'positive',
    title: 'Inbox zero',
    hint: 'Nothing waiting on you. Great job, buddy.',
  },
  error: {
    icon: CloudOff,
    color: 'critical',
    title: "Couldn't refresh",
    hint: 'What you see may be stale or incomplete.',
  },
  partial: {
    icon: TriangleAlert,
    color: 'critical',
    title: 'Partial inbox',
    hint: 'Some PRs may be missing from this list.',
  },
  'no-mrs': {
    icon: SearchX,
    color: 'neutral-faded',
    title: 'No MRs found',
    hint: 'If you expected MRs, sign out in Settings and reconnect with your personal token.',
  },
} as const

type Kind = keyof typeof STATES

export function emptyStateKind(snapshot: InboxSnapshot, noGitLabMrs = false): Kind {
  if (snapshot.status === 'error') return 'error'
  if (isPartialInbox(snapshot)) return 'partial'
  return noGitLabMrs ? 'no-mrs' : 'zero'
}

interface Props {
  kind: Kind
  account?: string | null
}

export default function EmptyState({ kind, account = null }: Props): React.JSX.Element {
  const state = STATES[kind]
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
      <Icon svg={state.icon} size="28px" color={state.color} />

      <View.Item gapBefore={3.5}>
        <Text as="div" variant="body-2" weight="semibold" color="neutral">
          {state.title}
        </Text>
      </View.Item>

      <View.Item gapBefore={0.75}>
        <Text as="div" variant="caption-1" color="neutral-faded">
          {account ? `Connected as @${account}. ${state.hint}` : state.hint}
        </Text>
      </View.Item>
    </View>
  )
}
