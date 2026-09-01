import { Text, View } from 'reshaped/bundle'

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
      borderRadius="large"
      border
      borderColor="neutral"
      backgroundColor="elevation-raised"
    >
      <Text as="span" variant="caption-1" color="neutral">
        #{toast.number} snoozed
      </Text>
      {/* Not `Button`: same reasoning as the header's icon buttons — see Header.tsx. */}
      <button type="button" className="pv-toast-undo" onClick={onUndo}>
        Undo
      </button>
    </View>
  )
}
