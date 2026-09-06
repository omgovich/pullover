import { visualCase } from '../test/visual'
import Toast from './Toast'

/**
 * The toast positions itself absolutely against the shell, so it needs a
 * positioned box with real height under it or it collapses to nothing.
 */
visualCase(
  'snoozed',
  <div style={{ position: 'relative', height: 120 }}>
    <Toast toast={{ prId: 'PR_1', number: 42 }} onUndo={() => {}} />
  </div>,
)
