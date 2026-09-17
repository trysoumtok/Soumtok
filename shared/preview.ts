export function isImageFilePath(path: string) {
  return /\.(png|jpe?g|gif|webp|ico|bmp|avif)$/i.test(path)
}

export function isImageDataUrl(content: string) {
  return /^data:image\//i.test(String(content || '').trim())
}

/** Workspace files that must not be shown as text diffs or pasted into chat snippets. */
export function isBinaryWorkspaceFile(path: string, content: string) {
  const body = String(content || '').trim()
  if (!body) return false
  if (isImageDataUrl(body)) return true
  return isImageFilePath(path) && body.length > 800
}

export function slimSiteFiles(files: Record<string, string>) {
  const out: Record<string, string> = {}
  for (const [path, content] of Object.entries(files)) {
    if (isBinaryWorkspaceFile(path, content)) continue
    if (content.length > 400_000) continue
    out[path] = content
  }
  return out
}

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
    `js/${name.replace(/^js\//, '')}`,
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
    return (
      files['style.css'] ||
      files['styles/main.css'] ||
      files['src/index.css'] ||
      files['index.css'] ||
      files['styles.css'] ||
      files['app.css']
    )
  }
  if (/\.js$/i.test(base)) {
    return (
      files['script.js'] ||
      files['scripts/main.js'] ||
      files['scripts/game.js'] ||
      files['src/main.js'] ||
      files['app.js'] ||
      files['main.js']
    )
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

/** Only apply a newer preview POST. Older in-flight uploads must not overwrite. */
export function acceptSiteSeq(stored: number | undefined, incoming: unknown) {
  const next = typeof incoming === 'number' ? incoming : Number(incoming)
  if (!Number.isFinite(next)) return true
  if (stored == null) return true
  return next >= stored
}

/** Changes when any preview file body changes, even if the length stays the same. */
export function previewStamp(html: string, files: Record<string, string>) {
  const parts = [html || '']
  for (const path of Object.keys(files).sort()) parts.push(path, files[path] || '')
  const text = parts.join('\u0001')
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `${text.length.toString(36)}-${(hash >>> 0).toString(36)}`
}

const PREVIEW_CDN_IMPORTS: Record<string, string> = {
  three: 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js',
}

/** Bare ESM imports (e.g. `from 'three'`) need a map in static preview iframes. */
export function injectPreviewImportMap(html: string) {
  const page = String(html || '')
  if (!page.trim() || /<script[^>]*type=["']importmap["']/i.test(page)) return page
  const imports: Record<string, string> = {}
  for (const [spec, url] of Object.entries(PREVIEW_CDN_IMPORTS)) {
    const re = new RegExp(`\\bfrom\\s+['"]${spec}['"]|\\bimport\\s*\\(\\s*['"]${spec}['"]`, 'i')
    if (re.test(page)) imports[spec] = url
  }
  if (!Object.keys(imports).length) return page
  const tag = `<script type="importmap">${JSON.stringify({ imports })}</script>`
  if (/<head[\s>]/i.test(page)) return page.replace(/<head(\s[^>]*)?>/i, (m) => `${m}${tag}`)
  return `${tag}${page}`
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
  page = page.replace(/<img\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>/gi, (tag, pre, src, post) => {
    if (/^https?:|^data:/i.test(src)) return tag
    const body = fileLookup(files, String(src))
    if (!body) return tag
    if (isImageDataUrl(body) || /^\/api\/studio\/images\//i.test(body)) {
      return `<img${pre}src="${body}"${post}>`
    }
    if (/\.svg(\?|$)/i.test(src) || /^\s*<svg[\s>]/i.test(body)) {
      return `<img${pre}src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(body)}"${post}>`
    }
    return tag
  })
  const css =
    files['styles/main.css'] || files['src/index.css'] || files['index.css'] || files['styles.css'] || ''
  if (css && !/<style[\s>]|rel=["']stylesheet["']/i.test(page)) {
    page = page.includes('</head>') ? page.replace(/<\/head>/i, `<style>${css}</style></head>`) : `<style>${css}</style>${page}`
  }
  for (const js of Object.values(files)) {
    if (typeof js === 'string' && js.trim()) {
      for (const spec of Object.keys(PREVIEW_CDN_IMPORTS)) {
        const re = new RegExp(`\\bfrom\\s+['"]${spec}['"]|\\bimport\\s*\\(\\s*['"]${spec}['"]`, 'i')
        if (re.test(js)) {
          page = injectPreviewImportMap(page)
          return page
        }
      }
    }
  }
  return injectPreviewImportMap(page)
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
