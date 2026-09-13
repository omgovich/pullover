import type { McpStatus } from '@shared/ipc'
import { visualCase } from '../test/visual'
import McpSection from './McpSection'
import SettingsGroup from './SettingsGroup'

const LISTENING: McpStatus = { listening: true, url: 'http://127.0.0.1:7855/mcp', error: null }

const PORT_TAKEN: McpStatus = {
  listening: false,
  url: 'http://127.0.0.1:7855/mcp',
  error: 'Port 7855 is in use — quit whatever holds it, then turn this off and on.',
}

function section(enabled: boolean, status: McpStatus | null): React.JSX.Element {
  return (
    <div style={{ padding: 12 }}>
      <SettingsGroup>
        <McpSection enabled={enabled} status={status} onToggle={() => {}} />
      </SettingsGroup>
    </div>
  )
}

visualCase('off', () => section(false, null))

// Switched on a moment ago, with main yet to answer: the switch has moved
// and nothing else has, because nothing is known yet to badge or report.
visualCase('awaiting-status', () => section(true, null))

// Switched on, and main has answered that the bind has not come back yet:
// the badge says so and there is no URL to hand out.
visualCase('starting', () =>
  section(true, { listening: false, url: 'http://127.0.0.1:7855/mcp', error: null }),
)

// The URL an agent connects to, and the way to the setup guide.
visualCase('on', () => section(true, LISTENING))

// The only critical-coloured text in the section: the switch is on but
// nothing is listening.
visualCase('port-taken', () => section(true, PORT_TAKEN))
