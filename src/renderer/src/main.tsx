import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Reshaped } from 'reshaped/bundle'
import { WINDOW_PADDING } from '@shared/geometry'
import 'reshaped/themes/slate/theme.css'
import 'reshaped/bundle.css'
import './pullover.css'
import App from './App'

// Feeds pullover.css's `--pv-window-padding-*` from the same numbers
// src/main/window.ts sizes the BrowserWindow with, so the transparent
// padding the CSS reserves always matches what the window actually has.
// Runs before the first render, so there's no flash of the CSS file's own
// (zero) fallback values.
const root = document.documentElement.style
root.setProperty('--pv-window-padding-top', `${WINDOW_PADDING.top}px`)
root.setProperty('--pv-window-padding-right', `${WINDOW_PADDING.right}px`)
root.setProperty('--pv-window-padding-bottom', `${WINDOW_PADDING.bottom}px`)
root.setProperty('--pv-window-padding-left', `${WINDOW_PADDING.left}px`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Reshaped theme="slate" defaultColorMode="dark">
      <App />
    </Reshaped>
  </StrictMode>,
)
