import { Card, View } from 'reshaped/bundle'

interface Props {
  children: React.ReactNode
}

/**
 * A card of `SettingRow`s, ruled off from each other. The card carries no
 * padding of its own: each row sets its own, so the rules between them run
 * the full width.
 */
export default function SettingsGroup({ children }: Props): React.JSX.Element {
  return (
    <Card padding={0}>
      <View divided>{children}</View>
    </Card>
  )
}
