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
  // The toast is a floating panel, i.e. a `Card` — `raised` gives it
  // Reshaped's own elevation shadow instead of the old bespoke single-layer
  // one calibrated for this transparent window; that's a real fidelity loss
  // (Reshaped's shadow reads fainter here) accepted per the owner's call.
  // `Card` only takes a single `padding`, not per-side values, so the old
  // asymmetric padding (2/2/4/3) is now a uniform 3. Position/inset/z-index
  // aren't in `Card`'s prop surface (only a `View` subset is), so those stay
  // on a wrapping `View`.
  return (
    <View position="absolute" insetInline="center" insetBottom={13} zIndex={3}>
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
