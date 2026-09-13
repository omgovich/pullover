import { Reshaped } from 'reshaped/bundle'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { visualCase } from '../test/visual'
import RepositoriesPane from './RepositoriesPane'

/** Both the Watch all switch and the picker reach the bridge only from a handler. */
function stubApi(): void {
  window.api = {} as unknown as typeof window.api
}

const KNOWN = [
  'acme/web',
  'acme/api',
  'acme/infra',
  'acme/design-tokens',
  'acme/mobile',
  'acme/docs',
]

/** The window's real height — `CARD_HEIGHT` in src/main/window.ts. */
const WINDOW_HEIGHT_PX = 620

function pane(selected: string[], watchAll: boolean, known = KNOWN): React.JSX.Element {
  stubApi()
  return (
    <div style={{ height: WINDOW_HEIGHT_PX }}>
      <RepositoriesPane
        knownRepositories={known}
        selected={selected}
        watchAll={watchAll}
        onBack={() => {}}
      />
    </div>
  )
}

/**
 * More repositories than the window can hold, which is the case the layout
 * has to answer: the list scrolls inside its own card, with the filter above
 * it staying put and the screen behind them not scrolling at all.
 */
const MANY = [
  ...KNOWN,
  'acme/auth',
  'acme/billing',
  'acme/cli',
  'acme/data-pipeline',
  'acme/design-system',
  'acme/edge-proxy',
  'acme/events',
  'acme/growth',
  'acme/ios',
  'acme/marketing-site',
  'acme/notifications',
  'acme/payments',
  'acme/platform-terraform-modules',
  'acme/search',
  'acme/support-tools',
  'acme/webhooks',
]

// Watching everything: the switch is on and a line says what that means.
visualCase('watching-all', () => pane([], true))

// Narrowed down, which is when the filter and the list earn their place.
visualCase('picked', () => pane(['acme/api', 'acme/web'], false))

visualCase('many-repositories', () => pane(['acme/api', 'acme/web'], false, MANY))

/**
 * Where a list too long for the window scrolls, which no screenshot can say:
 * both layouts look the same at the top of the list. The filter has to stay
 * put and the screen behind it has to stay still, which means exactly one
 * scroller on the screen, holding the repositories and not the field.
 */
test('scrolls the repository list rather than the screen', async () => {
  await render(<Reshaped theme="slate">{pane(['acme/api'], false, MANY)}</Reshaped>)

  // Both halves matter: an element that overflows without a scroller of its
  // own has simply been cut off, and one that could scroll but holds nothing
  // taller than itself is not the scroller either.
  const scrollers = [...document.body.querySelectorAll('*')].filter((el) => {
    const overflow = getComputedStyle(el).overflowY
    return (overflow === 'auto' || overflow === 'scroll') && el.scrollHeight - el.clientHeight > 1
  })

  expect(scrollers).toHaveLength(1)
  const list = scrollers[0]
  expect(list?.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThan(1)
  expect(list?.querySelector('input[name="repository-filter"]')).toBeNull()
})

/**
 * The header's title is an absolutely positioned layer over the whole bar,
 * and it comes before the back button in the markup: the button stays
 * clickable only because Reshaped gives its root a stacking context of its
 * own. A real click, not a dispatched event, so that covering the button
 * would fail this rather than pass it.
 */
test('lets the back button be clicked through the title layer over it', async () => {
  let backs = 0
  stubApi()
  const screen = await render(
    <Reshaped theme="slate">
      <div style={{ height: WINDOW_HEIGHT_PX }}>
        <RepositoriesPane
          knownRepositories={KNOWN}
          selected={['acme/api']}
          watchAll={false}
          onBack={() => {
            backs += 1
          }}
        />
      </div>
    </Reshaped>,
  )

  await screen.getByRole('button', { name: 'Settings' }).click()
  expect(backs).toBe(1)
})
