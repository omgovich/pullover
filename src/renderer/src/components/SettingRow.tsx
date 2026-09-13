import { ChevronRight } from 'lucide-react'
import { Actionable, Icon, Text, View } from 'reshaped/bundle'

interface Props {
  label: string
  /** A pill beside the label, where the setting has a state worth a glance. */
  badge?: React.ReactNode
  /** A control before the label, where the setting reads better led by it. */
  leading?: React.ReactNode
  /** A second line under the label, for a setting whose name is not enough. */
  description?: string
  /** A second line that is something wrong, so it is coloured like one. */
  problem?: string
  /** The current value, shown before the control or the chevron. */
  value?: string
  /** Makes the whole row pressable and gives it a chevron: it opens a subpage. */
  onClick?: () => void
  /** The control on the right — a switch, a segmented picker, a button. */
  children?: React.ReactNode
}

function Body({
  label,
  badge,
  leading,
  description,
  problem,
  value,
  onClick,
  children,
}: Props): React.JSX.Element {
  return (
    <View direction="row" align="center" gap={3} padding={3}>
      {leading}
      <View grow minWidth={0}>
        <View direction="row" align="center" gap={2}>
          <Text variant="body-2">{label}</Text>
          {badge}
        </View>
        {description !== undefined && (
          <Text variant="caption-1" color="neutral-faded">
            {description}
          </Text>
        )}
        {problem !== undefined && (
          <Text variant="caption-1" color="critical">
            {problem}
          </Text>
        )}
      </View>
      {/* A step down from the label: it is the setting's state, not its name. */}
      {value !== undefined && (
        <Text variant="caption-1" color="neutral-faded" numeric>
          {value}
        </Text>
      )}
      {children}
      {onClick !== undefined && <Icon svg={ChevronRight} size={4} color="neutral-faded" />}
    </View>
  )
}

export default function SettingRow(props: Props): React.JSX.Element {
  if (props.onClick === undefined) return <Body {...props} />

  return (
    <Actionable onClick={props.onClick} fullWidth>
      <Body {...props} />
    </Actionable>
  )
}
