import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Reshaped, useTheme } from 'reshaped/bundle'
import 'reshaped/themes/slate/theme.css'
import 'reshaped/bundle.css'
import './pullover.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { systemColorMode, useColorMode } from './useColorMode'
import { useSettings } from './useSettings'

/**
 * Keeps Reshaped's colour mode on the resolved theme: the preference when
 * it's `light` or `dark`, the live system appearance when it's `system` (or
 * while settings haven't arrived yet).
 *
 * Its `colorMode` prop is not enough on its own: the root provider puts that
 * value in React context but never writes `data-rs-color-mode` on `<html>`,
 * and every colour token is scoped by that attribute. Only the imperative
 * `setColorMode` writes it, so the sync has to run through that.
 *
 * `useColorMode` stays subscribed unconditionally — even while an explicit
 * preference is in force — so switching the preference back to `system` is
 * immediate rather than waiting on the next system-appearance change.
 */
function ColorModeSync(): null {
  const systemMode = useColorMode()
  const settings = useSettings()
  const { setColorMode } = useTheme()

  const resolvedMode =
    settings !== null && settings.theme !== 'system' ? settings.theme : systemMode

  useEffect(() => {
    setColorMode(resolvedMode)
  }, [resolvedMode, setColorMode])

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
      <ColorModeSync />
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </Reshaped>
  </StrictMode>,
)
