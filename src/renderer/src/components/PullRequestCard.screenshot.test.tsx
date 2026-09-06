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

// Three rows of one chain: the badge counts, and the connector segments each
// row draws between the avatars.
visualCase(
  'stack',
  <>
    {makeStackRows(3).map((row) => (
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
  </>,
)
