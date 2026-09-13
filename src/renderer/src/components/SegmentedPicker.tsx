import { Tabs, Text, View } from 'reshaped/bundle'

interface Props {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}

/**
 * The picker at the right-hand end of a `SettingRow`. Unlike the full-width
 * tabs this grew out of, it takes only the width its options need, so the
 * setting's name keeps the rest of the row.
 */
export default function SegmentedPicker({ value, options, onChange }: Props): React.JSX.Element {
  return (
    <View className="pv-segmented">
      <Tabs
        variant="pills-raised"
        size="small"
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
