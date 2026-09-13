import { Tabs, Text, View } from 'reshaped/bundle'

interface Props {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  /**
   * Whether the highlight slides to the option picked. Off where the change
   * also switches the colour mode: the highlight measures its target while
   * Reshaped has the theme off `<html>`, and lands nowhere near it.
   */
  animate?: boolean
}

/**
 * The picker at the right-hand end of a `SettingRow`. Unlike the full-width
 * tabs this grew out of, it takes only the width its options need, so the
 * setting's name keeps the rest of the row.
 */
export default function SegmentedPicker({
  value,
  options,
  onChange,
  animate = true,
}: Props): React.JSX.Element {
  return (
    <View className="pv-segmented">
      <Tabs
        variant="pills-raised"
        size="small"
        disableSelectionAnimation={!animate}
        value={value}
        onChange={({ value: next }) => onChange(next)}
      >
        <Tabs.List>
          {options.map((option) => (
            <Tabs.Item key={option.value} value={option.value}>
              <Text variant="caption-1" weight="medium">
                {option.label}
              </Text>
            </Tabs.Item>
          ))}
        </Tabs.List>
      </Tabs>
    </View>
  )
}
