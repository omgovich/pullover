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
    <div className="pv-toast">
      <span className="pv-toast-text">#{toast.number} snoozed</span>
      <button type="button" className="pv-toast-undo" onClick={onUndo}>
        Undo
      </button>
    </div>
  )
}
