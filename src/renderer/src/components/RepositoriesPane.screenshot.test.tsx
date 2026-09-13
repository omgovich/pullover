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

function pane(selected: string[], watchAll: boolean): React.JSX.Element {
  stubApi()
  return (
    <div style={{ height: WINDOW_HEIGHT_PX }}>
      <RepositoriesPane
        knownRepositories={KNOWN}
        selected={selected}
        watchAll={watchAll}
        onBack={() => {}}
      />
    </div>
  )
}

// Watching everything: the switch is on and a line says what that means.
visualCase('watching-all', () => pane([], true))

// Narrowed down, which is when the filter and the list earn their place.
visualCase('picked', () => pane(['acme/api', 'acme/web'], false))
