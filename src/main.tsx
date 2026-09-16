import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Seo } from './components/Seo'
import { watchTheme } from './lib/theme'

watchTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Seo />
    <App />
  </StrictMode>,
)
