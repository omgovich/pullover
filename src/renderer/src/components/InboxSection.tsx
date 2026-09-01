import { forwardRef } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { CATEGORY_TITLES, type Category, type ClassifiedPullRequest } from '@shared/types'
import PullRequestCard, { type PullRequestCardHandle } from './PullRequestCard'

interface Props {
  category: Category
  items: ClassifiedPullRequest[]
  now: string
  open: boolean
  onToggle: () => void
  activePrId: string | null
  onHoverCard: (prId: string | null) => void
  onSelectCard: (prId: string) => void
  onSnoozed: (item: ClassifiedPullRequest) => void
  registerCard: (prId: string, handle: PullRequestCardHandle | null) => void
}

const InboxSection = forwardRef<HTMLDivElement, Props>(function InboxSection(
  {
    category,
    items,
    now,
    open,
    onToggle,
    activePrId,
    onHoverCard,
    onSelectCard,
    onSnoozed,
    registerCard,
  }: Props,
  ref,
) {
  if (items.length === 0) return null

  return (
    <div ref={ref}>
      <button type="button" className="pv-section-header" onClick={onToggle}>
        <span className="pv-section-label">{CATEGORY_TITLES[category].toUpperCase()}</span>
        <span className="pv-section-count">{items.length}</span>
        <span className="pv-section-rule" />
        <span className="pv-section-chevron">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {open && (
        <div className="pv-card-list">
          {items.map((item) => (
            <PullRequestCard
              key={item.pr.id}
              ref={(handle) => {
                registerCard(item.pr.id, handle)
                return () => registerCard(item.pr.id, null)
              }}
              item={item}
              now={now}
              isActive={item.pr.id === activePrId}
              onHover={onHoverCard}
              onSelect={onSelectCard}
              onSnoozed={onSnoozed}
            />
          ))}
        </div>
      )}
    </div>
  )
})

export default InboxSection
