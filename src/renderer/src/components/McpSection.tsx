import type { McpStatus } from '@shared/ipc'
import { ExternalLink } from 'lucide-react'
import { Badge, Icon, Link, Switch, Text, View } from 'reshaped/bundle'
import SettingRow from './SettingRow'

/** What the Setup instructions link opens: the setup guide in the repository. */
const SETUP_DOC = 'https://github.com/omgovich/pullover/blob/main/MCP.md'

interface Props {
  enabled: boolean
  /** Null until main has answered; the row below waits for it rather than guessing. */
  status: McpStatus | null
  onToggle: (enabled: boolean) => void
}

/**
 * Whether the server is actually up, which is not what the switch says: the
 * setting stays on when the port is taken, and there is a moment after the
 * switch before the socket is bound.
 */
function statusBadge(status: McpStatus): React.JSX.Element {
  if (status.error !== null) {
    return (
      <Badge color="critical" variant="faded" size="small">
        Not running
      </Badge>
    )
  }

  if (!status.listening) {
    return (
      <Badge variant="faded" size="small">
        Starting…
      </Badge>
    )
  }

  return (
    <Badge color="positive" variant="faded" size="small">
      Running
    </Badge>
  )
}

/**
 * What the section has to say beyond the badge, or nothing while it is
 * starting. The URL follows `listening` rather than the absence of an error,
 * so the moment between the switch and the bind does not offer an address
 * that cannot be reached yet.
 */
function detail(status: McpStatus): React.JSX.Element | null {
  if (status.error !== null) {
    return (
      <Text variant="caption-1" color="critical">
        {status.error}
      </Text>
    )
  }

  if (!status.listening) return null

  return (
    <View direction="row" align="center" gap={2}>
      {/* Monospaced because it is something to be read character by character
          and typed into another program's config. */}
      <Text variant="caption-1" color="neutral-faded" maxLines={1} monospace>
        {status.url}
      </Text>
      <View grow />
      <Link
        variant="plain"
        onClick={() => void window.api.openPr(SETUP_DOC)}
        attributes={{ title: SETUP_DOC }}
      >
        <View direction="row" align="center" gap={1}>
          <Text variant="caption-1" weight="medium">
            Setup instructions
          </Text>
          <Icon svg={ExternalLink} size={3} />
        </View>
      </Link>
    </View>
  )
}

export default function McpSection({ enabled, status, onToggle }: Props): React.JSX.Element {
  // Off, or before main has answered, there is no state to report: the switch
  // is the whole story.
  const live = enabled ? status : null
  const body = live === null ? null : detail(live)

  return (
    <>
      <SettingRow
        label="MCP server"
        badge={live === null ? undefined : statusBadge(live)}
        description="Lets Claude and other local agents read this inbox."
      >
        <Switch
          name="mcp-server"
          inputAttributes={{ 'aria-label': 'MCP server' }}
          checked={enabled}
          onChange={({ checked }) => onToggle(checked)}
        />
      </SettingRow>
      {/* No padding of its own on top: the row above already ends in twelve
          pixels, and a second helping reads as a gap. */}
      {body !== null && (
        <View paddingTop={0} paddingBottom={3} paddingInline={3}>
          {body}
        </View>
      )}
    </>
  )
}
