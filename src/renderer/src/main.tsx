import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Reshaped } from 'reshaped/bundle'
import 'reshaped/themes/slate/theme.css'
import 'reshaped/bundle.css'
import './pullover.css'
import App from './App'
import { useColorMode } from './useColorMode'

/**
 * `colorMode` rather than `defaultColorMode`: the controlled prop is what lets
 * the app follow the system appearance as it changes, instead of only reading
 * it once at startup.
 */
function Root(): React.JSX.Element {
  return (
    <Reshaped theme="slate" colorMode={useColorMode()}>
      <App />
    </Reshaped>
  )
}

const container = document.getElementById('root')
if (!container) throw new Error('#root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
