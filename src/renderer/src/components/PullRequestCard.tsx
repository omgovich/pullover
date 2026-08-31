import { CircleCheck, CircleDashed, CircleX } from 'lucide-react'
import { Actionable, Avatar, Badge, Card, Text, View } from 'reshaped/bundle'
import { formatAge, formatDiff } from '@core/format'
import type { ClassifiedPullRequest } from '@shared/types'
import SnoozeMenu from './SnoozeMenu'

interface Props {
  item: ClassifiedPullRequest
  now: string
}

const CI_LABELS = {
  success: { label: 'CI green', color: 'positive', icon: CircleCheck },
  failure: { label: 'CI red', color: 'critical', icon: CircleX },
  pending: { label: 'CI running', color: 'warning', icon: CircleDashed },
} as const

export default function PullRequestCard({
  item,
  now,
}: Props): React.JSX.Element {
  const { pr } = item
  const ci = pr.ciStatus === 'none' ? null : CI_LABELS[pr.ciStatus]

  const open = (): void => {
    void window.api.openPr(pr.url)
  }

  return (
    <Card padding={3}>
      <View gap={2}>
        <View direction="row" gap={2} align="center">
          <Text variant="caption-1" color="neutral-faded">
            {pr.repository} #{pr.number}
          </Text>
          <View grow />
          <Text variant="caption-1" color="neutral-faded">
            {formatAge(pr.updatedAt, now)}
          </Text>
        </View>

        <Actionable onClick={open}>
          <Text variant="body-2" weight="medium" maxLines={2} align="start">
            {pr.title}
          </Text>
        </Actionable>

        <View direction="row" gap={2} align="center">
          <Avatar src={pr.authorAvatarUrl} size={5} initials={pr.authorLogin[0]} />
          <Text variant="caption-1" color="neutral-faded">
            {pr.authorLogin}
          </Text>
          <Text variant="caption-1" color="neutral-faded" monospace>
            {formatDiff(pr.additions, pr.deletions)}
          </Text>
          {ci !== null && (
            <Badge color={ci.color} icon={ci.icon} size="small" variant="faded">
              {ci.label}
            </Badge>
          )}
        </View>

        <View direction="row" gap={2} align="center">
          <Text variant="caption-1" color="primary">
            {item.reason}
          </Text>
          <View grow />
          <SnoozeMenu prId={pr.id} isSnoozed={item.isSnoozed} />
        </View>
      </View>
    </Card>
  )
}
