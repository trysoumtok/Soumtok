/** Test Hub — parse model fences and build live preview HTML (renderer + main). */
;(function (root, factory) {
  const api = factory()
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  } else {
    root.SoumtokTestHubArtifacts = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function testHubArtifactsFactory() {
  const FENCE_RE = /```([^\n`]*)\r?\n([\s\S]*?)```/g
  const EMBEDDED_FENCE_RE = /\r?\n```([^\n`]*)\r?\n/
  const FENCE_OPEN_RE = /```([^\n`]*)\r?\n/g

  function normalizeGluedFences(text) {
    const src = String(text || '')
    let out = ''
    let open = false
    let last = 0
    FENCE_OPEN_RE.lastIndex = 0
    let match
    while ((match = FENCE_OPEN_RE.exec(src))) {
      out += src.slice(last, match.index)
      const info = String(match[1] || '').trim()
      if (open && info) {
        out += '```\n```' + match[1] + '\n'
        open = true
      } else if (open && !info) {
        out += match[0]
        open = false
      } else {
        out += match[0]
        open = true
      }
      last = match.index + match[0].length
    }
    out += src.slice(last)
    return out
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function extToLang(path) {
    const ext = String(path || '').split('.').pop()?.toLowerCase() || ''
    if (ext === 'html' || ext === 'htm') return 'html'
    if (ext === 'css') return 'css'
    if (ext === 'js' || ext === 'jsx') return 'javascript'
    if (ext === 'ts' || ext === 'tsx') return 'typescript'
    return ext || 'text'
  }

  function parseFenceInfo(raw) {
    const info = String(raw || '').trim()
    const fileAttr = info.match(/file=["']([^"']+)["']/)
    if (fileAttr) {
      const lang = info.replace(/file=["'][^"']+["']/g, '').trim()
      return { lang, path: fileAttr[1].replace(/^\.\//, '') }
    }
    const colon = info.match(/^([\w#+. -]+):([\w./-]+\.\w+)$/)
    if (colon) return { lang: colon[1].trim(), path: colon[2].replace(/^\.\//, '') }
    if (/^[\w./-]+\.\w+$/.test(info)) return { lang: extToLang(info), path: info.replace(/^\.\//, '') }
    return { lang: info.split(/\s+/)[0] || '', path: '' }
  }

  function fallbackPath(lang, n) {
    const l = String(lang || '').toLowerCase()
    if (l === 'html' || l === 'htm') return 'index.html'
    if (l === 'css') return 'style.css'
    if (l === 'js' || l === 'javascript' || l === 'jsx') return 'script.js'
    if (l === 'md' || l === 'markdown') return 'notes.md'
    return `snippet-${n}.${l || 'txt'}`
  }

  function looksLikeHtml(body) {
    const t = String(body || '').trim()
    return /^<!DOCTYPE html/i.test(t) || /^<html[\s>]/i.test(t) || (/<body[\s>]/i.test(t) && t.length > 40)
  }

  function looksLikeCss(body) {
    const t = String(body || '').trim()
    return /[{;}]/.test(t) && /[.#]?[\w-]+\s*\{/.test(t)
  }

  function resolvePath(info, body, n) {
    if (info.path) return info.path
    const lang = String(info.lang || '').toLowerCase()
    if (/^[\w./-]+\.\w+$/.test(lang)) return lang.replace(/^\.\//, '')
    if (looksLikeHtml(body)) return 'index.html'
    if (lang === 'css' || (looksLikeCss(body) && !lang)) return fallbackPath('css', n)
    if (lang === 'js' || lang === 'javascript' || lang === 'jsx') return fallbackPath('javascript', n)
    return fallbackPath(lang, n)
  }

  function stripLeadingFilename(body) {
    const lines = String(body || '').split('\n')
    if (lines.length > 1 && /^[\w./-]+\.\w+$/.test(lines[0].trim())) {
      return lines.slice(1).join('\n').trim()
    }
    return String(body || '').trim()
  }

  function peelEmbeddedFences(body, startN) {
    const files = {}
    let primary = String(body || '')
    let n = startN || 1
    for (let guard = 0; guard < 24; guard++) {
      const match = primary.match(EMBEDDED_FENCE_RE)
      if (!match || match.index == null) break
      const info = parseFenceInfo(match[1])
      if (!info.lang && !info.path) break
      const before = primary.slice(0, match.index).trimEnd()
      const afterOpen = primary.slice(match.index + match[0].length)
      const closeAt = afterOpen.search(/\r?\n```(?:\s|$)/)
      let chunk
      let rest = ''
      if (closeAt >= 0) {
        chunk = afterOpen.slice(0, closeAt)
        rest = afterOpen.slice(closeAt).replace(/^\r?\n```/, '')
      } else {
        chunk = afterOpen
      }
      const cleaned = stripLeadingFilename(chunk)
      if (cleaned) files[resolvePath(info, cleaned, ++n)] = cleaned
      primary = before + (rest ? `\n${rest}` : '')
    }
    primary = primary.replace(/\r?\n```[\s\S]*$/, '').trimEnd()
    return { body: primary.trim(), files }
  }

  function truncateHtmlDocument(html) {
    const end = String(html || '').search(/<\/html>/i)
    if (end >= 0) return String(html).slice(0, end + '</html>'.length).trim()
    return String(html || '').replace(/\r?\n```[\s\S]*$/, '').trim()
  }

  function storeArtifact(files, path, body, n) {
    const peeled = peelEmbeddedFences(body, n)
    let content = peeled.body
    if (/\.html?$/i.test(path) || looksLikeHtml(content)) content = truncateHtmlDocument(content)
    if (content) files[path] = content
    Object.assign(files, peeled.files)
    return n + Object.keys(peeled.files).length
  }

  function filesFromFences(text) {
    const files = {}
    let match
    let n = 0
    const source = normalizeGluedFences(text)
    FENCE_RE.lastIndex = 0
    while ((match = FENCE_RE.exec(source))) {
      const info = parseFenceInfo(match[1])
      let body = stripLeadingFilename(match[2])
      if (!body) continue
      const lang = String(info.lang || '').toLowerCase()
      if (lang === 'json') continue
      const path = resolvePath(info, body, ++n)
      n = storeArtifact(files, path, body, n)
    }
    return files
  }

  function extractPartialFence(text) {
    const source = normalizeGluedFences(text)
    const open = source.match(/```([^\n`]*)\r?\n([\s\S]*)$/)
    if (!open || source.trimEnd().endsWith('```')) return null
    const info = parseFenceInfo(open[1])
    const lang = String(info.lang || '').toLowerCase()
    if (lang === 'json') return null
    const body = stripLeadingFilename(open[2])
    if (!body) return null
    return { path: resolvePath(info, body, 1), body }
  }

  function wrapHtmlFragment(html) {
    const t = String(html || '').trim()
    if (!t) return ''
    if (/^<!DOCTYPE html/i.test(t) || /^<html[\s>]/i.test(t)) {
      return /<\/html>/i.test(t) ? truncateHtmlDocument(t) : `${t}</body></html>`
    }
    if (/<body[\s>]/i.test(t)) {
      const body = /<\/body>/i.test(t) ? t : `${t}</body>`
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>${body}</html>`
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${t}</body></html>`
  }

  function promoteHtmlFiles(files) {
    if (files['index.html']?.trim()) {
      files['index.html'] = truncateHtmlDocument(files['index.html'])
      return files
    }
    for (const [path, content] of Object.entries(files)) {
      if (/\.html?$/i.test(path) && content.trim()) {
        files['index.html'] = wrapHtmlFragment(content)
        return files
      }
    }
    for (const content of Object.values(files)) {
      if (looksLikeHtml(content)) {
        files['index.html'] = wrapHtmlFragment(content)
        return files
      }
    }
    return files
  }

  function fileLookup(files, raw) {
    const name = String(raw || '')
      .replace(/^\.\//, '')
      .replace(/^\//, '')
      .split('?')[0]
      .split('#')[0]
    if (!name || name === '.' || name === './') {
      return files['index.html'] || files['public/index.html'] || files['src/index.html']
    }
    const tries = [
      name,
      `public/${name}`,
      `src/${name}`,
      `styles/${name}`,
      `scripts/${name}`,
      `${name}.html`,
      `pages/${name}`,
    ]
    for (const p of tries) {
      if (files[p]) return files[p]
    }
    const base = name.split('/').pop() || name
    const hit = Object.keys(files).find((p) => p === base || p.endsWith(`/${base}`))
    return hit ? files[hit] : undefined
  }

  function inlineAssets(html, files) {
    let page = html
    page = page.replace(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi, (tag, href) => {
      if (/^https?:/i.test(href) || /fonts\.google/i.test(href)) return tag
      const css = fileLookup(files, href)
      return css ? `<style>${css}</style>` : tag
    })
    page = page.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, pre, src, post) => {
      if (/^https?:/i.test(src)) return tag
      const js = fileLookup(files, src)
      return js ? `<script${pre}${post}>${js}</script>` : tag
    })
    const css =
      files['styles/main.css'] ||
      files['src/index.css'] ||
      files['index.css'] ||
      files['styles.css'] ||
      files['style.css'] ||
      Object.entries(files).find(([k]) => k.endsWith('.css'))?.[1] ||
      ''
    if (css && !/<style[\s>]|rel=["']stylesheet["']/i.test(page)) {
      page = page.includes('</head>')
        ? page.replace(/<\/head>/i, `<style>${css}</style></head>`)
        : `<style>${css}</style>${page}`
    }
    const js =
      files['scripts/main.js'] ||
      files['src/main.js'] ||
      files['main.js'] ||
      files['script.js'] ||
      Object.entries(files).find(([k]) => k.endsWith('.js'))?.[1] ||
      ''
    if (js && !/<script[\s>]/i.test(page) && page.includes('</body>')) {
      page = page.replace(/<\/body>/i, `<script>${js}<\/script></body>`)
    }
    return page
  }

  const PREVIEW_ERROR_BRIDGE = `<script data-soumtok-preview-bridge>(function(){function send(level,message,source,line){try{parent.postMessage({type:'soumtok-preview-log',level:level||'error',message:String(message||''),source:source||'',line:line||0},'*')}catch(e){}}window.addEventListener('error',function(e){send('error',e.message,e.filename,e.lineno)});window.addEventListener('unhandledrejection',function(e){var r=e.reason;send('error',r&&r.message?r.message:String(r))});var oe=console.error;console.error=function(){send('error',Array.prototype.join.call(arguments,' '));try{oe.apply(console,arguments)}catch(x){}};})();</script>`

  function injectPreviewErrorBridge(html) {
    const page = String(html || '')
    if (!page.trim() || page.includes('data-soumtok-preview-bridge')) return page
    if (page.includes('</body>')) return page.replace(/<\/body>/i, `${PREVIEW_ERROR_BRIDGE}</body>`)
    if (page.includes('</head>')) return page.replace(/<\/head>/i, `${PREVIEW_ERROR_BRIDGE}</head>`)
    return page + PREVIEW_ERROR_BRIDGE
  }

  function buildPreviewHtml(files) {
    const merged = promoteHtmlFiles({ ...files })
    for (const [path, content] of Object.entries(merged)) {
      if (/\.html?$/i.test(path)) merged[path] = truncateHtmlDocument(content)
    }
    let page = merged['index.html'] || merged['public/index.html'] || merged['src/index.html'] || ''
    if (!page.trim()) {
      const css = Object.entries(merged).find(([k]) => k.endsWith('.css'))?.[1] || ''
      const js = Object.entries(merged).find(([k]) => k.endsWith('.js'))?.[1] || ''
      if (css || js) {
        page = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css ? `<style>${css}</style>` : ''}</head><body><div id="app"></div>${js ? `<script>${js}<\/script>` : ''}</body></html>`
      }
    }
    if (!page.trim()) return ''
    return truncateHtmlDocument(inlineAssets(wrapHtmlFragment(truncateHtmlDocument(page)), merged))
  }

  function extractBuildArtifacts(text) {
    const files = filesFromFences(text)
    const partial = extractPartialFence(text)
    if (partial) storeArtifact(files, partial.path, partial.body, Object.keys(files).length)
    return promoteHtmlFiles(files)
  }

  function normalizeHighlightLang(lang) {
    const l = String(lang || '').toLowerCase()
    if (l === 'js' || l === 'jsx' || l === 'javascript') return 'javascript'
    if (l === 'ts' || l === 'tsx' || l === 'typescript') return 'typescript'
    if (l === 'htm' || l === 'html') return 'html'
    if (l.endsWith('.css')) return 'css'
    if (l.endsWith('.js')) return 'javascript'
    if (l.endsWith('.html') || l.endsWith('.htm')) return 'html'
    return l || 'text'
  }

  function highlightJsLike(text) {
    const parts = []
    const park = (html) => {
      const i = parts.length
      parts.push(html)
      return `@@@SOUMTOK_HL_${i}@@@`
    }
    let s = escapeHtml(text)
    s = s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m) => park(`<span class="hl-cmt">${m}</span>`))
    s = s.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, (m) => park(`<span class="hl-str">${m}</span>`))
    s = s.replace(
      /\b(const|let|var|function|return|import|export|from|async|await|class|if|else|for|while|try|catch|new|typeof|true|false|null|undefined)\b/g,
      '<span class="hl-kw">$1</span>',
    )
    s = s.replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="hl-num">$1</span>')
    return s.replace(/@@@SOUMTOK_HL_(\d+)@@@/g, (_, i) => parts[Number(i)] || '')
  }

  function formatProseHtml(raw) {
    const text = escapeHtml(String(raw || '').trim())
    if (!text) return ''
    const inlineFormat = (s) =>
      s
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    const lines = text.split('\n')
    const out = []
    let para = []
    let list = []
    const flushPara = () => {
      if (!para.length) return
      out.push(`<p>${inlineFormat(para.join(' '))}</p>`)
      para = []
    }
    const flushList = () => {
      if (!list.length) return
      out.push(`<ul>${list.map((item) => `<li>${inlineFormat(item)}</li>`).join('')}</ul>`)
      list = []
    }
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        flushList()
        flushPara()
        continue
      }
      const heading = trimmed.match(/^(#{1,3})\s+(.+)$/)
      if (heading) {
        flushList()
        flushPara()
        const level = Math.min(Math.max(heading[1].length, 1), 3)
        out.push(`<h${level}>${inlineFormat(heading[2])}</h${level}>`)
        continue
      }
      const bullet = trimmed.match(/^[-*•]\s+(.+)$/)
      if (bullet) {
        flushPara()
        list.push(bullet[1])
        continue
      }
      flushList()
      para.push(trimmed)
    }
    flushList()
    flushPara()
    return out.join('')
  }

  function highlightCss(text) {
    let s = escapeHtml(text)
    s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => `<span class="hl-cmt">${m}</span>`)
    s = s.replace(/([.#]?[\w-]+)(\s*\{)/g, '<span class="hl-sel">$1</span>$2')
    s = s.replace(/\b(-?\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%|s|ms)?)\b/g, '<span class="hl-num">$1</span>')
    s = s.replace(/(:\s*)([^;{}]+)(;)/g, (_, pre, val, end) => `${pre}<span class="hl-str">${val.trim()}</span>${end}`)
    return s
  }

  function highlightHtml(text) {
    let s = escapeHtml(text)
    s = s.replace(/(&lt;\/?)([\w-]+)([\s\S]*?)(\/?&gt;)/g, (_, open, tag, mid, close) => {
      const attrs = mid.replace(/([\w:-]+)(=)(&quot;[\s\S]*?&quot;|&#39;[\s\S]*?&#39;|'[^']*')/g, '$1<span class="hl-str">$2$3</span>')
      return `<span class="hl-kw">${open}${tag}</span>${attrs}<span class="hl-kw">${close}</span>`
    })
    return s
  }

  function highlightCode(body, lang) {
    const text = String(body || '').slice(0, 24_000)
    const kind = normalizeHighlightLang(lang)
    if (kind === 'css') return highlightCss(text)
    if (kind === 'html') return highlightHtml(text)
    if (kind === 'javascript' || kind === 'typescript') return highlightJsLike(text)
    return highlightJsLike(text)
  }

  function parseSegments(text) {
    const parts = []
    const re = /```([^\n`]*)\r?\n([\s\S]*?)```/g
    let last = 0
    let m
    while ((m = re.exec(text))) {
      if (m.index > last) parts.push({ kind: 'text', content: text.slice(last, m.index) })
      const info = parseFenceInfo(m[1])
      parts.push({
        kind: 'code',
        lang: info.lang || 'text',
        file: info.path || '',
        content: stripLeadingFilename(m[2]),
      })
      last = m.index + m[0].length
    }
    if (last < text.length) parts.push({ kind: 'text', content: text.slice(last) })
    if (!parts.length) parts.push({ kind: 'text', content: text })
    return parts
  }

  function looksLikeViteProject(files) {
    const pkgRaw = files?.['package.json']
    if (!pkgRaw) return false
    try {
      const pkg = JSON.parse(pkgRaw)
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
      const scripts = Object.values(pkg.scripts || {}).join(' ')
      return Boolean(deps.vite || /vite/i.test(scripts))
    } catch {
      return false
    }
  }

  function scoreCompareRun(run) {
    if (run?.status === 'error') return 0
    const files = extractBuildArtifacts(run?.text || '')
    const fileCount = Object.keys(files).length
    const hasPreview = Boolean(buildPreviewHtml(files))
    let score = 0
    if (fileCount > 0) score += Math.min(30, fileCount * 10)
    if (hasPreview) score += 25
    if (run?.viteBuildOk === true) score += 25
    else if (run?.viteBuildOk === false) score -= 15
    score -= Math.min(30, (run?.previewErrors || 0) * 10)
    if (run?.ms && run.ms > 0 && run.ms < 120000) score += Math.max(0, 15 - Math.floor(run.ms / 5000))
    const chars = (run?.text || '').length
    if (chars > 200) score += Math.min(10, Math.floor(chars / 800))
    return Math.max(0, Math.min(100, Math.round(score)))
  }

  return {
    filesFromFences,
    extractBuildArtifacts,
    buildPreviewHtml,
    injectPreviewErrorBridge,
    highlightCode,
    formatProseHtml,
    parseFenceInfo,
    parseSegments,
    looksLikeViteProject,
    scoreCompareRun,
  }
})
