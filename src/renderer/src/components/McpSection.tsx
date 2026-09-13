import type { McpStatus } from '@shared/ipc'
import { Button, Switch, Text, View } from 'reshaped/bundle'

interface Props {
  enabled: boolean
  /** Null until main has answered; the URL row waits for it rather than guessing. */
  status: McpStatus | null
  onToggle: (enabled: boolean) => void
  onCopyCommand: () => void
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
      {enabled && status !== null && status.error !== null && (
        <Text variant="caption-1" color="critical">
          {status.error}
        </Text>
      )}
      {enabled && status !== null && status.error === null && (
        <View direction="row" align="center" gap={2}>
          <Text variant="caption-1" color="neutral-faded" maxLines={1}>
            {status.url}
          </Text>
          <View grow />
          <Button size="small" variant="outline" onClick={onCopyCommand}>
            Copy Claude Code command
          </Button>
        </View>
      )}
    </View>
  )
}
