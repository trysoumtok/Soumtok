import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Seo } from './components/Seo'
import { isMarketingPath, setMarketingSurface, watchTheme } from './lib/theme'

if (import.meta.env.DEV) {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    console.warn('[soumtok] Dev module cache glitch — reloading once')
    window.location.reload()
  })
}

watchTheme()
if (typeof window !== 'undefined') setMarketingSurface(isMarketingPath(window.location.pathname))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Seo />
    <App />
  </StrictMode>,
)
