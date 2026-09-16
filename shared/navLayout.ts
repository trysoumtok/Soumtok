const NAV_FIX_START = '/* soumtok-nav-fix'
const NAV_FIX_END = '/* end soumtok-nav-fix */'

const NAV_FIX_BLOCK = `${NAV_FIX_START}: hamburger and the link list never share the bar */
.nav-toggle,
.menu-toggle,
.hamburger {
  display: none;
}
.nav-links,
.menu-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1.25rem;
}
header,
.site-header,
.nav-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
@media (max-width: 820px) {
  .nav-toggle,
  .menu-toggle,
  .hamburger {
    display: inline-flex;
  }
  .nav-links,
  .menu-links {
    display: none;
  }
  .nav-links.open,
  .menu-links.open {
    display: flex;
    flex-direction: column;
    position: absolute;
    top: 100%;
    right: 1rem;
    left: 1rem;
    z-index: 40;
    padding: 1rem;
  }
}
${NAV_FIX_END}`

const HAS_TOGGLE = /nav-toggle|menu-toggle|hamburger/i
const HAS_LINKS = /nav-links|menu-links/i

export function htmlHasCollidingNav(source: string) {
  return HAS_TOGGLE.test(source) && HAS_LINKS.test(source)
}

export function cssLooksClosed(css: string) {
  let depth = 0
  for (const char of css) {
    if (char === '{') depth += 1
    else if (char === '}') depth -= 1
    if (depth < 0) return false
  }
  return depth === 0 && css.includes('{')
}

export function navCollisionNeedsFix(files: Record<string, string>) {
  if (!htmlHasCollidingNav(Object.values(files).join('\n'))) return false
  const css =
    files['styles/main.css'] ||
    Object.entries(files).find(([path]) => /\.css$/i.test(path))?.[1] ||
    ''
  return !css.includes(NAV_FIX_START)
}

export function applyNavCollisionFix(files: Record<string, string>): Record<string, string> {
  const joined = Object.values(files).join('\n')
  if (!htmlHasCollidingNav(joined)) return files
  const cssPath =
    Object.keys(files).find((path) => path === 'styles/main.css') ||
    Object.keys(files).find((path) => /\.css$/i.test(path))
  if (!cssPath) return files
  const css = files[cssPath] || ''
  if (css.trim() && !cssLooksClosed(css)) return files
  const stripped = stripNavFix(css)
  const next = `${stripped.trimEnd()}\n\n${NAV_FIX_BLOCK}\n`
  if (next === css) return files
  return { ...files, [cssPath]: next }
}

function stripNavFix(css: string) {
  const start = css.indexOf(NAV_FIX_START)
  if (start < 0) return css
  const end = css.indexOf(NAV_FIX_END, start)
  if (end < 0) return css.slice(0, start)
  return `${css.slice(0, start)}${css.slice(end + NAV_FIX_END.length)}`
}
