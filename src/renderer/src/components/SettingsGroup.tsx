import { Card, View } from 'reshaped/bundle'

interface Props {
  children: React.ReactNode
  /** Fills the height it is given, for a card whose own content scrolls. */
  fill?: boolean
}

/**
 * A card of `SettingRow`s, ruled off from each other. The card carries no
 * padding of its own: each row sets its own, so the rules between them run
 * the full width.
 */
export default function SettingsGroup({ children, fill }: Props): React.JSX.Element {
  if (fill !== true) {
    return (
      <Card padding={0}>
        <View divided>{children}</View>
      </Card>
    )
  }

  // A filling card is laid out as a column on purpose: `divided` alone leaves
  // the rows in normal flow, where a row cannot be told to take the height
  // the others leave over — which is what a row that scrolls needs.
  return (
    <Card padding={0} height="100%">
      <View divided direction="column" height="100%">
        {children}
      </View>
    </Card>
  )
}
