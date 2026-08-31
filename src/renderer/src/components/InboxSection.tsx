import { Actionable, Badge, Text, useToggle, View } from 'reshaped/bundle'
import { CATEGORY_TITLES, type Category, type ClassifiedPullRequest } from '@shared/types'
import PullRequestCard from './PullRequestCard'

interface Props {
  category: Category
  items: ClassifiedPullRequest[]
  now: string
  /** The waiting section starts collapsed; attention sections start open. */
  defaultCollapsed: boolean
}

export default function InboxSection({
  category,
  items,
  now,
  defaultCollapsed,
}: Props): React.JSX.Element | null {
  const { active: open, toggle } = useToggle(!defaultCollapsed)

  if (items.length === 0) return null

  return (
    <View gap={2}>
      <Actionable onClick={toggle}>
        <View direction="row" gap={2} align="center" paddingBlock={1}>
          <Text variant="caption-1" weight="bold" color="neutral-faded">
            {CATEGORY_TITLES[category].toUpperCase()}
          </Text>
          <Badge size="small" variant="faded">
            {items.length}
          </Badge>
          <View grow />
          <Text variant="caption-1" color="neutral-faded">
            {open ? '▾' : '▸'}
          </Text>
        </View>
      </Actionable>

      {open &&
        items.map((item) => (
          <PullRequestCard key={item.pr.id} item={item} now={now} />
        ))}
    </View>
  )
}
