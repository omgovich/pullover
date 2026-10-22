import type { InboxSnapshot } from '@shared/ipc'
import type { UpdateState } from '@shared/types'
import { NOW, visualCase } from '../test/visual'
import Header from './Header'

const noop = (): void => {}

function snapshot(overrides: Partial<InboxSnapshot> = {}): InboxSnapshot {
  return {
    status: 'ready',
    items: [],
    attentionCount: 4,
    lastUpdatedAt: '2026-08-01T11:58:00Z',
    errorMessage: null,
    myLogin: 'alice',
    knownRepositories: [],
    ...overrides,
  }
}

const NO_UPDATE: UpdateState = { status: 'idle', version: null }

function header(
  snap: InboxSnapshot,
  update: UpdateState = NO_UPDATE,
  noGitLabMrs = false,
): React.JSX.Element {
  return (
    <Header
      snapshot={snap}
      now={NOW}
      update={update}
      onRefresh={noop}
      onOpenSettings={noop}
      onInstallUpdate={noop}
      noGitLabMrs={noGitLabMrs}
    />
  )
}

visualCase('default', header(snapshot()))

// No badge at all, not a badge reading zero.
visualCase('inbox-zero', header(snapshot({ attentionCount: 0 })))
visualCase('no-gitlab-mrs', header(snapshot({ attentionCount: 0 }), NO_UPDATE, true))
visualCase(
  'partial-gitlab-inbox',
  header(snapshot({ errorMessage: 'Some MRs may be missing' }), NO_UPDATE, true),
)

// `statusText` folds the error and the staleness into one line, so the user
// can still tell how old the list on screen is.
visualCase('error', header(snapshot({ status: 'error', errorMessage: 'Rate limit exceeded' })))

// A message long enough to fill the row must clip, not push the buttons out
// of it. `View direction="row"` wraps by default, and a wrapped header puts
// refresh and settings on a second line and grows the bar to fit them.
visualCase(
  'error-long',
  header(
    snapshot({
      status: 'error',
      lastUpdatedAt: null,
      errorMessage:
        "We couldn't respond to your request in time. Sorry about that. Please try resubmitting your request and contact us if…",
    }),
  ),
)

// A restricted org leaves the inbox usable but visibly partial. Staleness
// comes first so a long warning cannot push it out of view.
visualCase(
  'restricted-org',
  header(snapshot({ errorMessage: "status-im hasn't approved Pullover" })),
)

visualCase(
  'partial-inbox',
  header(snapshot({ attentionCount: 0, errorMessage: 'Older PRs may be missing' })),
)

// Both warnings at once: longer than the line, so it fades out at the edge
// and scrolls on hover rather than ending in an ellipsis.
visualCase(
  'partial-inbox-restricted-org',
  header(
    snapshot({
      attentionCount: 0,
      errorMessage: "status-im hasn't approved Pullover · Older PRs may be missing",
    }),
  ),
)

visualCase('update-ready', header(snapshot(), { status: 'ready', version: '0.9.0' }))
