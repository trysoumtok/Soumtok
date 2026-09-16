export type ThemePref = 'system' | 'light' | 'dark'

/** Public marketing pages always render dark — independent of dashboard theme / OS setting. */
export function isMarketingPath(path: string) {
  const p = path.split('?')[0] || '/'
  if (p === '/' || p === '/agents' || p === '/help' || p === '/contact' || p === '/download') return true
  if (p === '/login' || p === '/signup') return true
  if (p.startsWith('/docs')) return true
  if (p.startsWith('/desktop-link')) return true
  return false
}

function paintMarketingDark() {
  const root = document.documentElement
  root.dataset.surface = 'marketing'
  root.dataset.theme = 'dark'
  root.classList.remove('theme-light', 'light')
  root.classList.add('theme-dark', 'dark')
  root.style.colorScheme = 'dark'
  if (document.body) document.body.style.colorScheme = 'dark'
}

export function setMarketingSurface(active: boolean) {
  if (active) {
    paintMarketingDark()
    return
  }
  delete document.documentElement.dataset.surface
  applyTheme(getThemePref(), { force: true })
}

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

export function applyTheme(pref: ThemePref, opts?: { force?: boolean }) {
  if (document.documentElement.dataset.surface === 'marketing' && !opts?.force) return
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
    if (document.documentElement.dataset.surface === 'marketing') return
    if (getThemePref() === 'system') applyTheme('system')
  }
  media.addEventListener('change', onSystem)
  return () => media.removeEventListener('change', onSystem)
}
