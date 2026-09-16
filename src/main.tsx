import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Seo } from './components/Seo'
import { isMarketingPath, setMarketingSurface, watchTheme } from './lib/theme'

watchTheme()
if (typeof window !== 'undefined') setMarketingSurface(isMarketingPath(window.location.pathname))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Seo />
    <App />
  </StrictMode>,
)
