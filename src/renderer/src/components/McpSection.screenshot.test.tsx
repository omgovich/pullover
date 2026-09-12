import type { McpStatus } from '@shared/ipc'
import { visualCase } from '../test/visual'
import McpSection from './McpSection'

const LISTENING: McpStatus = { listening: true, url: 'http://127.0.0.1:7855/mcp', error: null }

const PORT_TAKEN: McpStatus = {
  listening: false,
  url: 'http://127.0.0.1:7855/mcp',
  error: 'Port 7855 is in use — quit whatever holds it, then turn this off and on.',
}

function section(enabled: boolean, status: McpStatus | null): React.JSX.Element {
  return (
    <div style={{ padding: 12 }}>
      <McpSection enabled={enabled} status={status} onToggle={() => {}} onCopyCommand={() => {}} />
    </div>
  )
}

visualCase('off', () => section(false, null))

// The URL an agent connects to, and the one button a user needs.
visualCase('on', () => section(true, LISTENING))

// The only critical-coloured text in the section: the switch is on but
// nothing is listening.
visualCase('port-taken', () => section(true, PORT_TAKEN))
