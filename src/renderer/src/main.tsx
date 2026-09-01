import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Reshaped, useTheme } from 'reshaped/bundle'
import 'reshaped/themes/slate/theme.css'
import 'reshaped/bundle.css'
import './pullover.css'
import App from './App'
import { systemColorMode, useColorMode } from './useColorMode'

/**
 * Keeps Reshaped's colour mode on the system appearance.
 *
 * Its `colorMode` prop is not enough on its own: the root provider puts that
 * value in React context but never writes `data-rs-color-mode` on `<html>`,
 * and every colour token is scoped by that attribute. Only the imperative
 * `setColorMode` writes it, so the sync has to run through that.
 */
function SystemColorMode(): null {
  const mode = useColorMode()
  const { setColorMode } = useTheme()

  useEffect(() => {
    setColorMode(mode)
  }, [mode, setColorMode])

  return null
}

const container = document.getElementById('root')
if (!container) throw new Error('#root is missing from index.html')

// Before the first paint, so a dark system does not flash light while the
// effect above catches up. Reshaped adopts an attribute that is already there.
const initialMode = systemColorMode()
document.documentElement.setAttribute('data-rs-color-mode', initialMode)

createRoot(container).render(
  <StrictMode>
    <Reshaped theme="slate" defaultColorMode={initialMode}>
      <SystemColorMode />
      <App />
    </Reshaped>
  </StrictMode>,
)
