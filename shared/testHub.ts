import type { ChatFile } from './chatMedia.ts'
import { inlineAssets } from './preview.ts'

export const TEST_HUB_SYSTEM = `You are in Soumtok Test Hub — direct model access with no agent harness, no tools, and no automatic workspace scan.

Only use text the user sends, files they explicitly attach, and the project files already in this chat session.

You cannot see their folders, desktop, or repo unless they attach those files or paste paths and contents.

If they refer to files or images you were not given, say so and ask them to attach what you need.

This chat has memory: earlier turns and the current project files stay in context. When the user asks for changes, edits, fixes, or follow-ups, update the existing project — do not start over from scratch unless they ask for a brand-new app.

Answer directly and helpfully — build, explain, review, or debug based on what they provide.

When the user asks you to build or change a page, app, or UI: always include runnable fenced files with paths, e.g. a full \`\`\`html file="index.html"\`\`\` block. Add separate \`\`\`css\`\`\` and \`\`\`javascript\`\`\` blocks when styles or scripts are separate. Prefer rewriting the full updated file contents for each changed path so the live preview stays correct.

Soumtok renders those files in the Preview panel on the right — that live preview is how the user sees what you built.`

export type TestHubMessage = {
  role: 'user' | 'assistant'
  content: string
  files?: ChatFile[]
}

const FENCE_RE = /```([^\n`]*)\r?\n([\s\S]*?)```/g
const EMBEDDED_FENCE_RE = /\r?\n```([^\n`]*)\r?\n/
const FENCE_OPEN_RE = /```([^\n`]*)\r?\n/g

/** Models often close one fence and open the next with the same ``` marker. */
function normalizeGluedFences(text: string) {
  const src = String(text || '')
  let out = ''
  let open = false
  let last = 0
  FENCE_OPEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
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

function escapeHtml(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function extToLang(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  if (ext === 'html' || ext === 'htm') return 'html'
  if (ext === 'css') return 'css'
  if (ext === 'js' || ext === 'jsx') return 'javascript'
  if (ext === 'ts' || ext === 'tsx') return 'typescript'
  return ext || 'text'
}

function parseFenceInfo(raw: string) {
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

function fallbackArtifactPath(lang: string, n: number): string {
  const l = lang.toLowerCase()
  if (l === 'html' || l === 'htm') return 'index.html'
  if (l === 'css') return 'style.css'
  if (l === 'js' || l === 'javascript' || l === 'jsx') return 'script.js'
  if (l === 'md' || l === 'markdown') return 'notes.md'
  return `snippet-${n}.${l || 'txt'}`
}

function looksLikeHtml(body: string) {
  const t = body.trim()
  return /^<!DOCTYPE html/i.test(t) || /^<html[\s>]/i.test(t) || (/<body[\s>]/i.test(t) && t.length > 40)
}

function looksLikeCss(body: string) {
  const t = body.trim()
  return /[{;}]/.test(t) && /[.#]?[\w-]+\s*\{/.test(t)
}

function stripLeadingFilename(body: string) {
  const lines = body.split('\n')
  if (lines.length > 1 && /^[\w./-]+\.\w+$/.test(lines[0].trim())) {
    return lines.slice(1).join('\n').trim()
  }
  return body.trim()
}

function resolveArtifactPath(info: { lang: string; path: string }, body: string, n: number) {
  if (info.path) return info.path
  const lang = info.lang.toLowerCase()
  if (/^[\w./-]+\.\w+$/.test(lang)) return lang.replace(/^\.\//, '')
  if (looksLikeHtml(body)) return 'index.html'
  if (lang === 'css' || (looksLikeCss(body) && !lang)) return fallbackArtifactPath('css', n)
  if (lang === 'js' || lang === 'javascript') return fallbackArtifactPath('javascript', n)
  return fallbackArtifactPath(lang, n)
}

/** Models often glue the next fence onto the previous body: </html>\\n```css ... */
function peelEmbeddedFences(body: string, startN = 1): { body: string; files: Record<string, string> } {
  const files: Record<string, string> = {}
  let primary = String(body || '')
  let n = startN
  for (let guard = 0; guard < 24; guard++) {
    const match = primary.match(EMBEDDED_FENCE_RE)
    if (!match || match.index == null) break
    const info = parseFenceInfo(match[1])
    if (!info.lang && !info.path) break
    const before = primary.slice(0, match.index).trimEnd()
    const afterOpen = primary.slice(match.index + match[0].length)
    const closeAt = afterOpen.search(/\r?\n```(?:\s|$)/)
    let chunk: string
    let rest = ''
    if (closeAt >= 0) {
      chunk = afterOpen.slice(0, closeAt)
      rest = afterOpen.slice(closeAt).replace(/^\r?\n```/, '')
    } else {
      chunk = afterOpen
    }
    const cleaned = stripLeadingFilename(chunk)
    if (cleaned) {
      files[resolveArtifactPath(info, cleaned, ++n)] = cleaned
    }
    primary = before + (rest ? `\n${rest}` : '')
  }
  primary = primary.replace(/\r?\n```[\s\S]*$/, '').trimEnd()
  return { body: primary.trim(), files }
}

function truncateHtmlDocument(html: string) {
  const end = html.search(/<\/html>/i)
  if (end >= 0) return html.slice(0, end + '</html>'.length).trim()
  return html.replace(/\r?\n```[\s\S]*$/, '').trim()
}

function wrapHtmlFragment(html: string) {
  const t = html.trim()
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

function promoteHtmlFiles(files: Record<string, string>) {
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

function storeArtifact(files: Record<string, string>, path: string, body: string, n: number) {
  const peeled = peelEmbeddedFences(body, n)
  let content = peeled.body
  if (/\.html?$/i.test(path) || looksLikeHtml(content)) {
    content = truncateHtmlDocument(content)
  }
  if (content) files[path] = content
  Object.assign(files, peeled.files)
  return n + Object.keys(peeled.files).length
}

/** Parse complete fenced code blocks with optional file="path" into a path → content map. */
export function filesFromFences(text: string): Record<string, string> {
  const files: Record<string, string> = {}
  let match: RegExpExecArray | null
  let n = 0
  const source = normalizeGluedFences(text)
  FENCE_RE.lastIndex = 0
  while ((match = FENCE_RE.exec(source))) {
    const info = parseFenceInfo(match[1])
    const lang = info.lang.toLowerCase()
    if (lang === 'json') continue
    const body = stripLeadingFilename(match[2])
    if (!body) continue
    const path = resolveArtifactPath(info, body, ++n)
    n = storeArtifact(files, path, body, n)
  }
  return files
}

/** Collect runnable files from assistant text, including partial fences while streaming. */
export function extractBuildArtifacts(text: string): Record<string, string> {
  const source = normalizeGluedFences(text)
  const files = filesFromFences(source)
  const partial = source.match(/```([^\n`]*)\r?\n([\s\S]*)$/)
  if (partial && !source.trimEnd().endsWith('```')) {
    const info = parseFenceInfo(partial[1])
    const lang = info.lang.toLowerCase()
    const body = stripLeadingFilename(partial[2])
    if (lang !== 'json' && body) {
      const path = resolveArtifactPath(info, body, 1)
      storeArtifact(files, path, body, Object.keys(files).length)
    }
  }
  return promoteHtmlFiles(files)
}

const PREVIEW_ERROR_BRIDGE = `<script data-soumtok-preview-bridge>(function(){function send(level,message,source,line){try{parent.postMessage({type:'soumtok-preview-log',level:level||'error',message:String(message||''),source:source||'',line:line||0},'*')}catch(e){}}window.addEventListener('error',function(e){send('error',e.message,e.filename,e.lineno)});window.addEventListener('unhandledrejection',function(e){var r=e.reason;send('error',r&&r.message?r.message:String(r))});var oe=console.error;console.error=function(){send('error',Array.prototype.join.call(arguments,' '));try{oe.apply(console,arguments)}catch(x){}};})();</script>`

/** Inject runtime error forwarding for Test Hub preview iframes. */
export function injectPreviewErrorBridge(html: string) {
  const page = String(html || '')
  if (!page.trim() || page.includes('data-soumtok-preview-bridge')) return page
  if (page.includes('</body>')) return page.replace(/<\/body>/i, `${PREVIEW_ERROR_BRIDGE}</body>`)
  if (page.includes('</head>')) return page.replace(/<\/head>/i, `${PREVIEW_ERROR_BRIDGE}</head>`)
  return page + PREVIEW_ERROR_BRIDGE
}

/** Build srcdoc HTML for the Test Hub preview iframe from extracted artifact files. */
export function buildPreviewHtml(files: Record<string, string>): string {
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
  const wrapped = wrapHtmlFragment(truncateHtmlDocument(page))
  let out = inlineAssets(wrapped, merged)
  out = truncateHtmlDocument(out)
  const css =
    merged['styles/main.css'] ||
    merged['src/index.css'] ||
    merged['index.css'] ||
    merged['styles.css'] ||
    merged['style.css'] ||
    Object.entries(merged).find(([k]) => k.endsWith('.css'))?.[1] ||
    ''
  if (css && !/<style[\s>]/i.test(out)) {
    out = out.includes('</head>')
      ? out.replace(/<\/head>/i, `<style>${css}</style></head>`)
      : `<style>${css}</style>${out}`
  }
  const js =
    merged['scripts/main.js'] ||
    merged['src/main.js'] ||
    merged['main.js'] ||
    merged['script.js'] ||
    Object.entries(merged).find(([k]) => k.endsWith('.js'))?.[1] ||
    ''
  if (js && !/<script[\s>]/i.test(out) && out.includes('</body>')) {
    out = out.replace(/<\/body>/i, `<script>${js}<\/script></body>`)
  }
  return truncateHtmlDocument(out)
}

export function normalizeHighlightLang(lang: string) {
  const l = String(lang || '').toLowerCase()
  if (l === 'js' || l === 'jsx' || l === 'javascript' || l.endsWith('.js')) return 'javascript'
  if (l === 'ts' || l === 'tsx' || l === 'typescript' || l.endsWith('.ts') || l.endsWith('.tsx')) return 'typescript'
  if (l === 'htm' || l === 'html' || l.endsWith('.html') || l.endsWith('.htm')) return 'html'
  if (l === 'css' || l.endsWith('.css')) return 'css'
  return l || 'text'
}

function parkHighlight(parts: string[], html: string) {
  const i = parts.length
  parts.push(html)
  return `@@@SOUMTOK_HL_${i}@@@`
}

function highlightJsLike(text: string) {
  const parts: string[] = []
  let s = escapeHtml(text)
  s = s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m) => parkHighlight(parts, `<span class="hl-cmt">${m}</span>`))
  s = s.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, (m) =>
    parkHighlight(parts, `<span class="hl-str">${m}</span>`),
  )
  s = s.replace(
    /\b(const|let|var|function|return|import|export|from|async|await|class|if|else|for|while|try|catch|new|typeof|true|false|null|undefined)\b/g,
    '<span class="hl-kw">$1</span>',
  )
  s = s.replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="hl-num">$1</span>')
  return s.replace(/@@@SOUMTOK_HL_(\d+)@@@/g, (_, i) => parts[Number(i)] || '')
}

function highlightCss(text: string) {
  let s = escapeHtml(text)
  s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => `<span class="hl-cmt">${m}</span>`)
  s = s.replace(/([.#]?[\w-]+)(\s*\{)/g, '<span class="hl-sel">$1</span>$2')
  s = s.replace(/\b(-?\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%|s|ms)?)\b/g, '<span class="hl-num">$1</span>')
  s = s.replace(/(:\s*)([^;{}]+)(;)/g, (_, pre, val, end) => `${pre}<span class="hl-str">${val.trim()}</span>${end}`)
  return s
}

function highlightHtml(text: string) {
  let s = escapeHtml(text)
  s = s.replace(/(&lt;\/?)([\w-]+)([\s\S]*?)(\/?&gt;)/g, (_, open, tag, mid, close) => {
    const attrs = mid.replace(
      /([\w:-]+)(=)(&quot;[\s\S]*?&quot;|&#39;[\s\S]*?&#39;|'[^']*')/g,
      '$1<span class="hl-str">$2$3</span>',
    )
    return `<span class="hl-kw">${open}${tag}</span>${attrs}<span class="hl-kw">${close}</span>`
  })
  return s
}

export function highlightCode(body: string, lang: string) {
  const text = String(body || '').slice(0, 24_000)
  const kind = normalizeHighlightLang(lang)
  if (kind === 'css') return highlightCss(text)
  if (kind === 'html') return highlightHtml(text)
  if (kind === 'javascript' || kind === 'typescript') return highlightJsLike(text)
  return highlightJsLike(text)
}

export function formatProseHtml(raw: string) {
  const text = escapeHtml(String(raw || '').trim())
  if (!text) return ''

  const inlineFormat = (s: string) =>
    s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

  const lines = text.split('\n')
  const out: string[] = []
  let para: string[] = []
  let list: string[] = []

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

export function parseSegments(text: string) {
  const parts: { kind: 'text' | 'code'; content: string; lang?: string; file?: string }[] = []
  const re = /```([^\n`]*)\r?\n([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null
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

export function fileGlyph(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  if (ext === 'html' || ext === 'htm') return { label: 'HTML', tone: '#e44d26' }
  if (ext === 'css') return { label: 'CSS', tone: '#264de4' }
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs') return { label: 'JS', tone: '#f7df1e' }
  if (ext === 'ts' || ext === 'tsx') return { label: 'TS', tone: '#3178c6' }
  if (ext === 'json') return { label: '{}', tone: '#cbcb41' }
  if (ext === 'md' || ext === 'mdx') return { label: 'MD', tone: '#519aba' }
  return { label: ext.slice(0, 3).toUpperCase() || 'FILE', tone: '#8b8b8b' }
}

function projectFilesSnapshot(files: Record<string, string> | undefined) {
  if (!files) return ''
  const paths = Object.keys(files).sort()
  if (!paths.length) return ''
  const parts: string[] = []
  let total = 0
  const maxTotal = 120_000
  const maxEach = 40_000
  for (const path of paths) {
    let body = String(files[path] ?? '')
    if (body.length > maxEach) body = `${body.slice(0, maxEach)}\n/* …truncated… */`
    const chunk = `### ${path}\n\`\`\`\n${body}\n\`\`\``
    if (total + chunk.length > maxTotal) {
      parts.push(`### ${path}\n(/* omitted — context limit */)`)
      break
    }
    parts.push(chunk)
    total += chunk.length
  }
  return `Current project files in this Test Hub session (includes any user edits). Continue from these when the user asks for changes:\n\n${parts.join('\n\n')}`
}

export function buildTestHubApiMessages(
  history: TestHubMessage[],
  opts?: { files?: Record<string, string> },
): { role: 'user' | 'assistant' | 'system'; content: string; files?: ChatFile[] }[] {
  const snapshot = projectFilesSnapshot(opts?.files)
  const out: { role: 'user' | 'assistant' | 'system'; content: string; files?: ChatFile[] }[] = [
    { role: 'system', content: snapshot ? `${TEST_HUB_SYSTEM}\n\n${snapshot}` : TEST_HUB_SYSTEM },
  ]
  for (const msg of history) {
    if (!msg.content?.trim() && !msg.files?.length) continue
    out.push({
      role: msg.role,
      content: msg.content || (msg.files?.length ? '(see attached files)' : ''),
      files: msg.files?.length ? msg.files : undefined,
    })
  }
  return out
}
