import type { McpStatus } from '@shared/ipc'
import { Button, Switch, Text, View } from 'reshaped/bundle'

interface Props {
  enabled: boolean
  /** Null until main has answered; the row below waits for it rather than guessing. */
  status: McpStatus | null
  onToggle: (enabled: boolean) => void
  onCopyCommand: () => void
}

/**
 * The three things the section can have to say once the switch is on. The URL
 * follows `listening` rather than the absence of an error, so the moment
 * between the switch and the bind does not offer a command that cannot connect
 * yet.
 */
function detail(status: McpStatus, onCopyCommand: () => void): React.JSX.Element {
  if (status.error !== null) {
    return (
      <Text variant="caption-1" color="critical">
        {status.error}
      </Text>
    )
  }

  if (!status.listening) {
    return (
      <Text variant="caption-1" color="neutral-faded">
        Starting…
      </Text>
    )
  }

  return (
    <View direction="row" align="center" gap={2}>
      <Text variant="caption-1" color="neutral-faded" maxLines={1}>
        {status.url}
      </Text>
      <View grow />
      <Button size="small" variant="outline" onClick={onCopyCommand}>
        Copy Claude Code command
      </Button>
    </View>
  )
}

export default function McpSection({
  enabled,
  status,
  onToggle,
  onCopyCommand,
}: Props): React.JSX.Element {
  return (
    <View gap={2}>
      <Text variant="caption-1" weight="bold" color="neutral-faded">
        AI AGENTS
      </Text>
      <View direction="row" align="center" gap={3}>
        <Switch name="mcp-server" checked={enabled} onChange={({ checked }) => onToggle(checked)} />
        <View grow minWidth={0}>
          <Text variant="body-2" weight="medium">
            MCP server
          </Text>
          <Text variant="caption-1" color="neutral-faded">
            Lets Claude Code and other agents on this Mac read this inbox.
          </Text>
        </View>
      </View>
      {enabled && status !== null && detail(status, onCopyCommand)}
    </View>
  )
}
