import { makeRow, makeStackRows, NOW, visualCase } from '../test/visual'
import PullRequestCard from './PullRequestCard'

/**
 * `isDraft` and `hasAutoMerge` have no case here on purpose: neither reaches
 * the renderer at all — they are inputs to `classify`, and a card drawn from
 * one would be pixel-identical to the default.
 */

const noop = (): void => {}

function card(row: ReturnType<typeof makeRow>, isActive = false): React.JSX.Element {
  return (
    <PullRequestCard
      row={row}
      now={NOW}
      isActive={isActive}
      onHover={noop}
      onSelect={noop}
      onSnoozed={noop}
    />
  )
}

visualCase('default', card(makeRow()))

// The tint, and the actions button that is in the row's flow at all times but
// only visible here.
visualCase('active', card(makeRow(), true))

const LONG_TITLE =
  'Rework the snapshot pipeline so the classifier stops re-reading threads it has already seen'

visualCase('long-title', card(makeRow({ title: LONG_TITLE })))

// The marquee only measures itself once its row is active. Frozen at its
// first frame by the harness, so what this holds is the start of the travel
// and the fade at either edge — see src/renderer/src/test/visual.css.
visualCase('long-title-active', card(makeRow({ title: LONG_TITLE }), true))

// The meta line is `wrap={false}`, so everything on it has to give way to the
// repository name's ellipsis rather than the row growing a second line.
visualCase(
  'crowded-meta',
  card(
    makeRow({
      repository: 'acme/platform-infrastructure-terraform-modules',
      additions: 9999,
      deletions: 8888,
      updatedAt: '2026-05-02T09:00:00Z',
    }),
  ),
)

visualCase(
  'ci-failure',
  card(makeRow({ ciStatus: 'failure' }, { reason: 'CI is red', category: 'my-pr-action' })),
)

visualCase('no-avatar', card(makeRow({ authorAvatarUrl: '', authorLogin: 'octocat' })))

// The two states that empty the title line's right-hand group, which is what
// decides how much width the title gets and so whether the marquee engages at
// all. `classify` produces an empty reason for the waiting category.
visualCase('no-reason', card(makeRow({}, { reason: '', category: 'waiting' })))

visualCase('no-ci', card(makeRow({ ciStatus: 'none' })))

function stack(rows: ReturnType<typeof makeStackRows>): React.JSX.Element {
  return (
    <>
      {rows.map((row) => (
        <PullRequestCard
          key={row.item.pr.id}
          row={row}
          now={NOW}
          isActive={false}
          onHover={noop}
          onSelect={noop}
          onSnoozed={noop}
        />
      ))}
    </>
  )
}

// `StackConnector` draws the line in three variants, and all three are worth
// holding: it is the only graphic in the app assembled from arithmetic rather
// than from a Reshaped component.

/** A whole chain, every position shown — solid segments throughout. */
visualCase('stack', stack(makeStackRows(3)))

/** Positions 1 and 3 of four: dotted where position 2 is missing between two
    shown rows, then fading below position 3 where the chain runs on. */
visualCase('stack-dotted', stack(makeStackRows(4, [1, 3])))

/** A lone middle member: the chain carries on past the list in both
    directions, with nothing for either segment to meet. */
visualCase('stack-open', stack(makeStackRows(3, [2])))
