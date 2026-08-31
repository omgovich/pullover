import { ChevronDown, ChevronRight } from 'lucide-react'
import { Actionable, Badge, Icon, Text, useToggle, View } from 'reshaped/bundle'
import { CATEGORY_TITLES, type Category, type ClassifiedPullRequest } from '@shared/types'
import { CATEGORY_ICONS } from '../categoryIcons'
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
          <Icon svg={CATEGORY_ICONS[category]} size={4} color="neutral-faded" />
          <Text variant="caption-1" weight="bold" color="neutral-faded">
            {CATEGORY_TITLES[category].toUpperCase()}
          </Text>
          <Badge size="small" variant="faded">
            {items.length}
          </Badge>
          <View grow />
          <Icon svg={open ? ChevronDown : ChevronRight} size={4} color="neutral-faded" />
        </View>
      </Actionable>

      {open &&
        items.map((item) => (
          <PullRequestCard key={item.pr.id} item={item} now={now} />
        ))}
    </View>
  )
}
