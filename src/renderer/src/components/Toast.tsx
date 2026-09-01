import { Button, Text, View } from 'reshaped/bundle'

export interface ToastState {
  prId: string
  number: number
}

interface Props {
  toast: ToastState
  onUndo: () => void
}

export default function Toast({ toast, onUndo }: Props): React.JSX.Element {
  return (
    <View
      className="pv-toast"
      direction="row"
      align="center"
      gap={3}
      position="absolute"
      insetInline="center"
      insetBottom={13}
      zIndex={3}
      paddingTop={2}
      paddingBottom={2}
      paddingStart={4}
      paddingEnd={3}
      borderRadius="large"
      border
      borderColor="neutral"
      backgroundColor="elevation-raised"
    >
      <Text as="span" variant="caption-1" color="neutral">
        #{toast.number} snoozed
      </Text>
      <Button variant="outline" color="primary" size="small" onClick={onUndo}>
        Undo
      </Button>
    </View>
  )
}
