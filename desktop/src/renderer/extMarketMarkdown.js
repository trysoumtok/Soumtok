/** Safe subset of Markdown for VS Marketplace README/changelog in extension detail. */
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
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const href = String(url).trim()
    if (!/^https?:\/\//i.test(href)) return label
    return `<a href="#" class="ext-md-link" data-href="${escapeHtml(href)}">${label}</a>`
  })
  return s
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

window.SoumtokExtMarkdown = { renderMarketMarkdown }
