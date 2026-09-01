import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Reshaped } from 'reshaped/bundle'
import 'reshaped/themes/slate/theme.css'
import 'reshaped/bundle.css'
import './pullover.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Reshaped theme="slate" defaultColorMode="dark">
      <App />
    </Reshaped>
  </StrictMode>,
)
