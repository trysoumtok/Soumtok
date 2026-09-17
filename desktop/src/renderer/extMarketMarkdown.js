/** Safe subset of Markdown/HTML for VS Marketplace README/changelog in extension detail. */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inlineMarkdown(text) {
  let s = escapeHtml(text)
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    const href = String(url).trim()
    if (!/^https?:\/\//i.test(href)) return alt
    return `<img class="ext-md-img" src="${escapeHtml(href)}" alt="${escapeHtml(alt)}" loading="lazy" referrerpolicy="no-referrer" />`
  })
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const href = String(url).trim()
    if (!/^https?:\/\//i.test(href)) return label
    return `<a href="#" class="ext-md-link" data-href="${escapeHtml(href)}">${label}</a>`
  })
  return s
}

function markdownSignals(source) {
  const s = String(source || '')
  return (
    (s.match(/^#{1,6}\s+/gm) || []).length +
    (s.match(/^\|.+\|/gm) || []).length +
    (s.match(/^```/gm) || []).length +
    (s.match(/^!\[[^\]]*\]\([^)]+\)/gm) || []).length
  )
}

function looksLikeHtml(source) {
  const s = String(source || '').trim()
  if (!s) return false
  const mdScore = markdownSignals(s)
  const htmlTags = s.match(
    /<\/?(?:div|table|tr|td|th|thead|tbody|p|br|h[1-6]|ul|ol|li|a|img|span|strong|em|center|section|header|footer|blockquote)\b/gi,
  )
  const htmlCount = htmlTags?.length || 0
  if (/^<\!?[a-z]/i.test(s) && mdScore < 2) return true
  if (htmlCount >= 4 && htmlCount > mdScore) return true
  if (htmlCount >= 2 && mdScore === 0) return true
  return false
}

function sanitizeMarketHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html')
  const blocked = new Set([
    'script',
    'iframe',
    'object',
    'embed',
    'form',
    'input',
    'button',
    'meta',
    'link',
    'style',
    'base',
  ])
  const walk = (node) => {
    if (node.nodeType !== 1) return
    const tag = node.tagName.toLowerCase()
    if (blocked.has(tag)) {
      node.remove()
      return
    }
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase()
      const val = attr.value || ''
      if (name.startsWith('on')) node.removeAttribute(attr.name)
      /* Strip inline layout only — keep class/id so badge rows and icons still render. */
      if (name === 'style') {
        node.removeAttribute(attr.name)
        continue
      }
      if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(val)) node.removeAttribute(attr.name)
      if (name === 'src' && val.startsWith('//')) node.setAttribute('src', `https:${val}`)
    }
    if (tag === 'a') {
      const href = node.getAttribute('href') || ''
      if (/^https?:\/\//i.test(href)) {
        node.setAttribute('rel', 'noopener noreferrer')
      }
    }
    if (tag === 'img') {
      node.setAttribute('loading', 'lazy')
      node.setAttribute('referrerpolicy', 'no-referrer')
    }
    ;[...node.childNodes].forEach(walk)
  }
  ;[...doc.body.childNodes].forEach(walk)
  return doc.body.innerHTML
}

function isTableRow(line) {
  return /^\|.+\|$/.test(String(line || '').trim())
}

function isTableSep(line) {
  return /^\|[-:\s|]+\|$/.test(String(line || '').trim())
}

function renderMarkdownTable(lines, start) {
  const rows = []
  let i = start
  while (i < lines.length && isTableRow(lines[i])) {
    rows.push(lines[i].trim())
    i += 1
  }
  if (rows.length < 2) return null
  const bodyRows = isTableSep(rows[1]) ? rows.filter((_, idx) => idx !== 1) : rows
  if (!bodyRows.length) return null
  const parseRow = (row) =>
    row
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim())
  const head = parseRow(bodyRows[0])
  const data = bodyRows.slice(1).map(parseRow)
  const thead = `<thead><tr>${head.map((c) => `<th>${inlineMarkdown(c)}</th>`).join('')}</tr></thead>`
  const tbody = `<tbody>${data
    .map((row) => `<tr>${row.map((c) => `<td>${inlineMarkdown(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody>`
  return { html: `<table class="ext-md-table">${thead}${tbody}</table>`, next: i }
}

function renderMarketReadme(source) {
  const src = String(source || '')
  if (!src.trim()) return ''
  if (looksLikeHtml(src)) {
    return `<div class="ext-md-body ext-md-html">${sanitizeMarketHtml(src)}</div>`
  }
  return renderMarketMarkdown(src)
}

function renderMarketMarkdown(source) {
  const md = String(source || '')
  if (!md.trim()) return ''
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out = []
  let inCode = false
  let codeBuf = []
  let listType = null

  const flushList = () => {
    if (listType) {
      out.push(listType === 'ol' ? '</ol>' : '</ul>')
      listType = null
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const next = lines[i + 1]
    if (isTableRow(line)) {
      flushList()
      const table = renderMarkdownTable(lines, i)
      if (table) {
        out.push(table.html)
        i = table.next - 1
        continue
      }
    }
    if (next && line.trim() && /^=+\s*$/.test(next)) {
      flushList()
      out.push(`<h1>${inlineMarkdown(line.trim())}</h1>`)
      i += 1
      continue
    }
    if (next && line.trim() && /^-+\s*$/.test(next) && !line.startsWith('- ')) {
      flushList()
      out.push(`<h2>${inlineMarkdown(line.trim())}</h2>`)
      i += 1
      continue
    }
    if (line.startsWith('```')) {
      flushList()
      if (!inCode) {
        inCode = true
        codeBuf = []
      } else {
        inCode = false
        out.push(`<pre class="ext-md-code"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`)
      }
      continue
    }
    if (inCode) {
      codeBuf.push(line)
      continue
    }
    const h3 = line.match(/^###\s+(.+)/)
    const h2 = line.match(/^##\s+(.+)/)
    const h1 = line.match(/^#\s+(.+)/)
    if (h3) {
      flushList()
      out.push(`<h3>${inlineMarkdown(h3[1])}</h3>`)
      continue
    }
    if (h2) {
      flushList()
      out.push(`<h2>${inlineMarkdown(h2[1])}</h2>`)
      continue
    }
    if (h1) {
      flushList()
      out.push(`<h1>${inlineMarkdown(h1[1])}</h1>`)
      continue
    }
    const ul = line.match(/^[-*]\s+(.+)/)
    const ol = line.match(/^\d+\.\s+(.+)/)
    if (ul) {
      if (listType !== 'ul') {
        flushList()
        out.push('<ul>')
        listType = 'ul'
      }
      out.push(`<li>${inlineMarkdown(ul[1])}</li>`)
      continue
    }
    if (ol) {
      if (listType !== 'ol') {
        flushList()
        out.push('<ol>')
        listType = 'ol'
      }
      out.push(`<li>${inlineMarkdown(ol[1])}</li>`)
      continue
    }
    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/)
    if (img) {
      flushList()
      const url = img[2].trim()
      if (/^https?:\/\//i.test(url)) {
        out.push(
          `<figure class="ext-md-figure"><img class="ext-md-img" src="${escapeHtml(url)}" alt="${escapeHtml(img[1])}" loading="lazy" referrerpolicy="no-referrer" /></figure>`,
        )
      }
      continue
    }
    if (/^---+\s*$/.test(line.trim()) || /^\*\*\*+\s*$/.test(line.trim())) {
      flushList()
      out.push('<hr class="ext-md-hr" />')
      continue
    }
    if (!line.trim()) {
      flushList()
      out.push('<p class="ext-md-gap"></p>')
      continue
    }
    flushList()
    out.push(`<p>${inlineMarkdown(line)}</p>`)
  }
  flushList()
  if (inCode && codeBuf.length) {
    out.push(`<pre class="ext-md-code"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`)
  }
  return `<div class="ext-md-body">${out.join('\n')}</div>`
}

window.SoumtokExtMarkdown = { renderMarketMarkdown, renderMarketReadme }
