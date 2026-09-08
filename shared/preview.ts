export function fileLookup(files: Record<string, string>, raw: string) {
  const name = raw.replace(/^\.\//, '').replace(/^\//, '').split('?')[0].split('#')[0]
  if (!name || name === '.' || name === './') {
    return files['index.html'] || files['public/index.html'] || files['src/index.html']
  }
  const tries = [
    name,
    name.replace(/^pages\//, ''),
    `public/${name}`,
    `src/${name}`,
    `styles/${name}`,
    `scripts/${name}`,
    `${name}.html`,
    `pages/${name}.html`,
  ]
  for (const path of tries) {
    if (files[path]) return files[path]
  }
  const base = name.split('/').pop() || name
  const match = Object.keys(files).find((path) => path === base || path.endsWith(`/${base}`) || path.endsWith(`/${base}.html`))
  if (match) return files[match]
  if (/\.css$/i.test(base)) {
    return files['styles/main.css'] || files['src/index.css'] || files['index.css'] || files['styles.css'] || files['app.css']
  }
  if (/\.js$/i.test(base)) {
    return files['scripts/main.js'] || files['scripts/game.js'] || files['src/main.js'] || files['app.js'] || files['main.js']
  }
  return undefined
}

/** Prefer the real workspace page over a stale previewHtml blob. */
export function resolveSiteFile(files: Record<string, string>, html: string, raw: string) {
  const name = decodeURIComponent((raw || '').replace(/^\//, '').split('?')[0] || 'index.html')
  if (!name || name === '.' || name === 'index.html') {
    return files['index.html'] || files['public/index.html'] || files['src/index.html'] || html || ''
  }
  return fileLookup(files, name) || ''
}

export function inlineAssets(html: string, files: Record<string, string>) {
  let page = html
  page = page.replace(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi, (tag, href) => {
    if (/^https?:/i.test(href) || /fonts\.google/i.test(href)) return tag
    if (!/\.css(\?|$)/i.test(href) && !/rel=["']stylesheet["']/i.test(tag)) return tag
    const css = fileLookup(files, String(href))
    return css ? `<style>${css}</style>` : tag
  })
  page = page.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, pre, src, post) => {
    if (/^https?:/i.test(src)) return tag
    const js = fileLookup(files, String(src))
    if (!js) return tag
    return `<script${pre}${post}>${js}</script>`
  })
  const css =
    files['styles/main.css'] || files['src/index.css'] || files['index.css'] || files['styles.css'] || ''
  if (css && !/<style[\s>]|rel=["']stylesheet["']/i.test(page)) {
    page = page.includes('</head>') ? page.replace(/<\/head>/i, `<style>${css}</style></head>`) : `<style>${css}</style>${page}`
  }
  return page
}

export function looksTruncatedSource(path: string, content: string) {
  const text = content.replace(/\s+$/, '')
  if (!text) return true
  const ext = (path.split('.').pop() || '').toLowerCase()
  if (ext === 'html' && /<(html|head|body)\b/i.test(text) && !/<\/html>/i.test(text)) return true
  if (['css', 'js', 'ts', 'tsx', 'jsx', 'json'].includes(ext)) {
    const open = (text.match(/\{/g) || []).length
    const close = (text.match(/\}/g) || []).length
    if (open > close) return true
  }
  if (['js', 'ts', 'tsx', 'jsx'].includes(ext)) {
    const parens = (text.match(/\(/g) || []).length - (text.match(/\)/g) || []).length
    if (parens > 0) return true
  }
  return false
}
