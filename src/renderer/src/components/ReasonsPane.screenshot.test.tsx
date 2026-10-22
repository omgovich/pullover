import type { Provider, Trigger } from '@shared/types'
import { visualCase } from '../test/visual'
import ReasonsPane from './ReasonsPane'

/** The window's real height — `CARD_HEIGHT` in src/main/window.ts. */
const WINDOW_HEIGHT_PX = 620

function pane(muted: Trigger[], provider: Provider = 'github'): React.JSX.Element {
  // The switches reach the bridge only from a handler.
  window.api = {} as unknown as typeof window.api
  return (
    <div style={{ height: WINDOW_HEIGHT_PX }}>
      <ReasonsPane muted={muted} provider={provider} onBack={() => {}} />
    </div>
  )
}

visualCase('all-on', () => pane([]))

visualCase('new-commits-off', () => pane(['new-commits']))

visualCase('gitlab', () => pane([], 'gitlab'))
