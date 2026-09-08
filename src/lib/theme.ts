export type ThemePref = 'system' | 'light' | 'dark'

export function getThemePref(): ThemePref {
  try {
    const stored = localStorage.getItem('soumtok-theme')
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function resolvedTheme(pref: ThemePref = getThemePref()) {
  if (pref === 'light') return 'light'
  if (pref === 'dark') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(pref: ThemePref) {
  try {
    localStorage.setItem('soumtok-theme', pref)
  } catch {
    /* ignore quota / private mode */
  }
  const resolved = resolvedTheme(pref)
  const root = document.documentElement
  root.dataset.theme = resolved
  root.dataset.themePref = pref
  root.classList.toggle('theme-light', resolved === 'light')
  root.classList.toggle('theme-dark', resolved === 'dark')
  root.classList.toggle('light', resolved === 'light')
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
  if (document.body) document.body.style.colorScheme = resolved
  window.dispatchEvent(new CustomEvent('soumtok-theme', { detail: pref }))
}

export function watchTheme() {
  applyTheme(getThemePref())
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onSystem = () => {
    if (getThemePref() === 'system') applyTheme('system')
  }
  media.addEventListener('change', onSystem)
  return () => media.removeEventListener('change', onSystem)
}
