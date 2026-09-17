import { useEffect, useState } from 'react'
import { brandTheme } from './theme'

export function useBrandTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(brandTheme)
  useEffect(() => {
    const sync = () => setTheme(brandTheme())
    window.addEventListener('soumtok-theme', sync)
    const obs = new MutationObserver(sync)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-surface'] })
    return () => {
      window.removeEventListener('soumtok-theme', sync)
      obs.disconnect()
    }
  }, [])
  return theme
}
