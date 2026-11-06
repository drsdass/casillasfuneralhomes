import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installPrintFit } from './lib/printFit'
installPrintFit()

// After an update goes live, a tab left open from before can't find the page pieces it asks for. Reload once to pick up the new version.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  try {
    if (sessionStorage.getItem('casillas-reloaded') === String(Math.floor(Date.now() / 60000))) return   // already reloaded in the last minute: don't loop
    sessionStorage.setItem('casillas-reloaded', String(Math.floor(Date.now() / 60000)))
  } catch { /* storage blocked: still reload once */ }
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Lets phones show notifications when the app is closed (it caches nothing, so updates always load fresh).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined) })
}
