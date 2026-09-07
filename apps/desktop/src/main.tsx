import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Reuse the web UI styling wholesale (tokens + shell + pages).
import '../../frontend/src/index.css'
import '../../frontend/src/layout/shell.css'
import '../../frontend/src/pages/pages.css'
import '../../frontend/src/pages/site.css'
// Desktop-only additions: custom title bar + window chrome sizing.
import './desktop.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
