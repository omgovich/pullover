import { makeRow, makeStackRows, visualCase } from '../test/visual'
import CompactPullRequestCard from './CompactPullRequestCard'

/**
 * The compact row drops the repository, the age and the diff counts, so it
 * takes no `now` and is a constant on its own. What is left worth holding is
 * the density: one 30px row, and the same right-hand group the comfortable
 * layout draws, which is the thing the two are meant not to drift apart on.
 */

const noop = (): void => {}

function card(row: ReturnType<typeof makeRow>, isActive = false): React.JSX.Element {
  return (
    <CompactPullRequestCard
      row={row}
      isActive={isActive}
      onHover={noop}
      onSelect={noop}
      onSnoozed={noop}
    />
  )
}

visualCase('default', card(makeRow()))

visualCase('active', card(makeRow(), true))

const LONG_TITLE =
  'Rework the snapshot pipeline so the classifier stops re-reading threads it has already seen'

visualCase('long-title-active', card(makeRow({ title: LONG_TITLE }), true))

visualCase(
  'ci-failure',
  card(makeRow({ ciStatus: 'failure' }, { reason: 'CI is red', category: 'my-pr-action' })),
)

function stack(rows: ReturnType<typeof makeStackRows>): React.JSX.Element {
  return (
    <>
      {rows.map((row) => (
        <CompactPullRequestCard
          key={row.item.pr.id}
          row={row}
          isActive={false}
          onHover={noop}
          onSelect={noop}
          onSnoozed={noop}
        />
      ))}
    </>
  )
}

// Repeated here rather than left to the comfortable layout: the connector
// takes a `compact` flag and draws from its own set of CSS rules, sized to
// the 30px row.
visualCase('stack', stack(makeStackRows(3)))
visualCase('stack-dotted', stack(makeStackRows(4, [1, 3])))
visualCase('stack-open', stack(makeStackRows(3, [2])))
