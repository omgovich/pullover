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

// Active but held at the first frame, where the marquee has measured itself
// and not yet moved: the tint and the actions button are what separate this
// from `long-title`.
visualCase('long-title-active', card(makeRow({ title: LONG_TITLE }), true))

/** The longest reason `classify` produces. */
const LONGEST_REASON = 'Waiting on reviewers'

// Everything on the row long at once. `StatusText` is uncapped on purpose —
// "the title yields instead" — and this is the only case where there is
// anything for it to take the width from.
visualCase(
  'long-title-and-repo',
  card(
    makeRow(
      { title: LONG_TITLE, repository: 'acme/platform-infrastructure-terraform-modules' },
      { reason: LONGEST_REASON, category: 'waiting' },
    ),
  ),
)

// A long title with nothing on its right to yield to: the widest the title
// ever gets, and the only case where its own clip is what ends it.
visualCase(
  'long-title-alone',
  card(makeRow({ title: LONG_TITLE, ciStatus: 'none' }, { reason: '', category: 'waiting' })),
)

// The meta line is `wrap={false}`, so everything on it has to give way to the
// repository name's ellipsis rather than the row growing a second line.
visualCase(
  'crowded-meta',
  card(
    makeRow(
      {
        repository: 'acme/platform-infrastructure-terraform-modules',
        additions: 9999,
        deletions: 8888,
        updatedAt: '2026-05-02T09:00:00Z',
      },
      // Named here too, or the waiting time — which is what the meta line
      // actually prints — would stay two hours wide and leave this case
      // testing a meta line that isn't crowded.
      { waitingSince: '2026-05-02T09:00:00Z' },
    ),
  ),
)

visualCase(
  'ci-failure',
  card(makeRow({ ciStatus: 'failure' }, { reason: 'CI is red', category: 'my-pr-action' })),
)

// The meta line's other half: nothing in `waiting` is the user's move, so
// the row has no waiting time and prints the last activity instead. Every
// other case here is on the `waiting Xh` side of that branch.
visualCase(
  'waiting-on-author',
  card(makeRow({}, { category: 'waiting', reason: 'Waiting on author' })),
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
