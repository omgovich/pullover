import { Button, Card, Text, View } from 'reshaped/bundle'

export interface ToastState {
  prId: string
  number: number
}

interface Props {
  toast: ToastState
  onUndo: () => void
}

export default function Toast({ toast, onUndo }: Props): React.JSX.Element {
  // Position/inset/z-index aren't in `Card`'s prop surface, so those stay on
  // a wrapping `View`.
  return (
    <View position="absolute" insetInline="center" insetBottom={14} zIndex={3}>
      <Card raised direction="row" align="center" gap={3} padding={3}>
        <Text
          as="span"
          variant="caption-1"
          color="neutral"
          // No `Text` prop reaches `white-space`.
          attributes={{ style: { whiteSpace: 'nowrap' } }}
        >
          #{toast.number} snoozed
        </Text>
        <Button variant="outline" color="primary" size="small" onClick={onUndo}>
          Undo
        </Button>
      </Card>
    </View>
  )
}
