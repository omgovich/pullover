import { makePullRequest } from '@core/test-factory'
import type { ClassifiedPullRequest } from '@shared/types'
import { AVATAR_SRC, makeItem, NOW, visualCase } from '../test/visual'
import InboxSection from './InboxSection'

/**
 * The one case that holds composition rather than a single row: the heading,
 * the gaps between cards, and that both layouts line their avatars up with
 * the heading. A card screenshotted alone cannot catch any of those.
 */

const noop = (): void => {}

const ITEMS: ClassifiedPullRequest[] = [
  makeItem({
    pr: makePullRequest({
      id: 'PR_1',
      number: 41,
      title: 'Cache the classifier',
      authorAvatarUrl: AVATAR_SRC,
    }),
    reason: 'Review requested',
  }),
  makeItem({
    pr: makePullRequest({
      id: 'PR_2',
      number: 42,
      title: 'Drop the unused snooze column',
      repository: 'acme/api',
      authorLogin: 'bob',
      authorAvatarUrl: '',
      ciStatus: 'failure',
      updatedAt: '2026-07-30T08:00:00Z',
    }),
    reason: 'Changes requested',
  }),
  makeItem({
    pr: makePullRequest({
      id: 'PR_3',
      number: 43,
      title: 'Bump electron to 44',
      authorLogin: 'carol',
      authorAvatarUrl: AVATAR_SRC,
      ciStatus: 'pending',
      updatedAt: '2026-07-28T08:00:00Z',
    }),
    reason: '3 new replies',
  }),
]

function section(layout: 'comfortable' | 'compact', open = true): React.JSX.Element {
  return (
    <InboxSection
      category="needs-review"
      items={ITEMS}
      now={NOW}
      layout={layout}
      open={open}
      onToggle={noop}
      activePrId={null}
      onHoverCard={noop}
      onSelectCard={noop}
      onSnoozed={noop}
      registerCard={noop}
    />
  )
}

visualCase('comfortable', section('comfortable'))
visualCase('compact', section('compact'))
visualCase('collapsed', section('comfortable', false))
