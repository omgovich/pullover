import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Reshaped } from 'reshaped/bundle'
import 'reshaped/themes/slate/theme.css'
import 'reshaped/bundle.css'
import './pullover.css'
import App from './App'

const container = document.getElementById('root')
if (!container) throw new Error('#root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <Reshaped theme="slate" defaultColorMode="dark">
      <App />
    </Reshaped>
  </StrictMode>,
)
