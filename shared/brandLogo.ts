/** When the user asks for a real brand logo / SVG, fetch Simple Icons and teach the coding model how to add it. */

const LOGO_NOUN = /\b(logos?|logoof|svgs?|wordmark|brand[\s-]?mark|favicon)\b/i
const LOGO_VERB =
  /\b(add|put|use|real|find|insert|replace|fetch|search|get|download|install|the real)\b/i

const SKIP = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'your',
  'have',
  'what',
  'when',
  'make',
  'just',
  'into',
  'about',
  'want',
  'need',
  'please',
  'could',
  'would',
  'should',
  'can',
  'you',
  'add',
  'put',
  'use',
  'real',
  'find',
  'insert',
  'replace',
  'fetch',
  'search',
  'get',
  'download',
  'install',
  'logo',
  'logos',
  'svg',
  'svgs',
  'wordmark',
  'brand',
  'mark',
  'favicon',
  'icon',
  'icons',
  'page',
  'pages',
  'website',
  'site',
  'header',
  'nav',
  'my',
  'in',
  'of',
  'any',
  'more',
  'another',
  'new',
  'extra',
  'other',
  'html',
  'css',
  'file',
  'files',
  'image',
  'images',
  'inline',
  'every',
  'teh',
  'tehreal',
  'webioste',
  'logoof',
  'please',
])

export function wantsBrandAsset(text: string) {
  if (!LOGO_VERB.test(text)) return false
  if (LOGO_NOUN.test(text)) return true
  return /\bicons?\b/i.test(text) && /\b(logo|svg|brand|simple.?icons)\b/i.test(text)
}

export function brandFromPrompt(text: string) {
  const of = text.match(
    /\b(?:logo|svg|wordmark|icon)s?\s+(?:of|for|from)\s+([a-z0-9][a-z0-9 .&'-]{0,40}?)(?:\s+(?:and|in|on|to|into)\b|[.?!]|$)/i,
  )
  if (of?.[1]) return of[1].trim()
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !SKIP.has(word))
  return tokens[0] || ''
}

export function brandLogoSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function brandLogoFetchUrls(text: string) {
  const slug = brandLogoSlug(brandFromPrompt(text))
  if (!slug) return []
  return [
    `https://cdn.simpleicons.org/${slug}`,
    `https://cdn.jsdelivr.net/npm/simple-icons/icons/${slug}.svg`,
    `https://unpkg.com/simple-icons/icons/${slug}.svg`,
  ]
}

/** SVG (and other non-HTML) fetch bodies must keep tags. htmlToText would destroy a logo. */
export function isRawFetchBody(contentType: string, url: string, raw: string) {
  const type = contentType.toLowerCase()
  if (type.includes('svg') || type.includes('json') || type.includes('text/plain') || type.includes('xml')) return true
  if (/\.svg(\?|#|$)/i.test(url)) return true
  const start = raw.trimStart().slice(0, 240).toLowerCase()
  return start.startsWith('<svg') || (start.startsWith('<?xml') && start.includes('<svg'))
}

export const BRAND_LOGO_SKILL = `SKILL: brand logos (already installed for this turn — follow it; do not ask whether to use it).

When they ask for a logo, SVG, wordmark, brand mark, favicon, or icon of a named brand:

1. Search Simple Icons by slug: lowercase letters and digits only. KFC → kfc. McDonald's → mcdonalds.
   - https://cdn.simpleicons.org/{slug}
   - https://cdn.jsdelivr.net/npm/simple-icons/icons/{slug}.svg
2. If FETCHED PAGES already contain an <svg> for that brand, copy that markup. Those bytes are the logo.
3. If it is missing, call fetch on those URLs. Keep the raw SVG — never strip tags into plain text.
4. Write the SVG to images/{slug}.svg in this workspace (writing the file creates the folder).
5. Put that file in the header on every HTML page: <img src="images/{slug}.svg" alt="{Brand}"> or the same inline <svg>. Same mark on every page. The job is the top-left mark the user sees in Preview — if it still says leftover letters from another brand, that node (or CSS content:) IS the logo. Replace it.
6. Do not leave a text-only mark like <div class="logo">KFC</div>. Do not draw letters as a fake logo.
7. Do not scrape the brand's official marketing site first. Simple Icons / jsDelivr first. Wikimedia Commons only if those 404.
8. Keep the official path geometry. Do not restyle the mark into a different logo.
9. Unless they also asked for more pages, do ONLY the logo. Do not add pages, rewrite hero/about/menu/contact copy, or replace whole HTML files. Diff the logo node and any CSS that paints those letters.`

export function brandLogoContext(text: string) {
  const name = brandFromPrompt(text)
  const slug = brandLogoSlug(name)
  const urls = brandLogoFetchUrls(text)
  const bits = [BRAND_LOGO_SKILL]
  if (slug) {
    bits.push(
      `Brand for this request: ${name || slug}. Slug: ${slug}. Save as images/${slug}.svg. Fetch: ${urls.join(' ')}`,
    )
  }
  return bits.join('\n\n')
}

export function isLogoOnlyAsk(text: string) {
  if (!wantsBrandAsset(text)) return false
  if (/\b((more|another|any|new|extra|other) pages?|add (a |an |any |more )?pages?)\b/i.test(text)) return false
  if (/\b(theme|toggle|rename|github)\b/i.test(text)) return false
  return true
}

export function extractSvgFromFetch(text: string) {
  const raw = (text || '').trim()
  const start = raw.search(/<svg[\s>]/i)
  if (start < 0) return ''
  const end = raw.toLowerCase().indexOf('</svg>', start)
  if (end < 0) return ''
  let svg = raw.slice(start, end + 6).trim()
  if (svg.length < 40 || svg.length > 80_000) return ''
  if (/<script/i.test(svg)) return ''
  if (!/\sxmlns=/i.test(svg)) svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  return svg
}

function innerText(html: string) {
  return html
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function logoImgTag(slug: string, name: string) {
  const label = (name || slug).replace(/[<>&"]/g, '').slice(0, 40) || slug
  return `<img src="images/${slug}.svg" alt="${label}" class="brand-mark">`
}

function patchLogoHtml(html: string, img: string) {
  const node =
    /<(a|div|span|p|h1|h2)(\s[^>]*?(?:class|id)=["'][^"']*(?:logo|brand|wordmark|site-title)[^"']*["'][^>]*)>([\s\S]{0,500}?)<\/\1>/gi
  let hits = 0
  const next = html.replace(node, (full, tag: string, attrs: string, inner: string) => {
    if (/<img\b[^>]*src=["'][^"']+\.svg/i.test(inner)) return full
    hits += 1
    return `<${tag}${attrs}>${img}</${tag}>`
  })
  if (hits) return next
  if (/<img[^>]*class=["'][^"']*brand-mark/i.test(html) || /src=["']images\/[^"']+\.svg["']/i.test(html)) return html
  if (/<header[\s>]/i.test(html)) {
    return html.replace(/<header([^>]*)>/i, `<header$1><a class="logo" href="index.html">${img}</a>`)
  }
  return html
}

function stripLogoCssContent(css: string) {
  return css.replace(
    /((?:\.logo|\.brand|\.wordmark)[^{]{0,120}\{[^}]*?)content\s*:\s*['"][^'"]*['"]\s*;?/gi,
    '$1',
  )
}

function ensureLogoCss(css: string) {
  const cleaned = stripLogoCssContent(css)
  if (/\.brand-mark\b/.test(cleaned)) return cleaned
  return `${cleaned.replace(/\s+$/, '')}

.logo img, .brand img, .wordmark img, .brand-mark {
  height: 36px;
  width: auto;
  display: block;
}
.logo::before, .logo::after, .brand::before, .brand::after {
  content: none !important;
}
`
}

export type BrandLogoChange = {
  files: Record<string, string>
  changed: string[]
  slug: string
  name: string
}

/** Fetch is already done. Write the SVG and put it in the visible header — do not wait on the coding model. */
export function applyBrandLogo(
  files: Record<string, string>,
  input: { text?: string; svg: string; slug?: string; name?: string },
): BrandLogoChange | null {
  const svg = extractSvgFromFetch(input.svg)
  if (!svg) return null
  const name = (input.name || brandFromPrompt(input.text || '') || input.slug || '').trim()
  const slug = brandLogoSlug(input.slug || name)
  if (!slug) return null
  const htmlPaths = Object.keys(files).filter((path) => /\.html?$/i.test(path) && typeof files[path] === 'string')
  if (!htmlPaths.length) return null
  const img = logoImgTag(slug, name || slug)
  const next = { ...files, [`images/${slug}.svg`]: svg }
  const changed = new Set<string>([`images/${slug}.svg`])
  for (const path of htmlPaths) {
    const patched = patchLogoHtml(files[path], img)
    if (patched !== files[path]) {
      next[path] = patched
      changed.add(path)
    }
  }
  const cssPath = Object.keys(files).find((path) => /\.css$/i.test(path))
  if (cssPath) {
    const patched = ensureLogoCss(files[cssPath])
    if (patched !== files[cssPath]) {
      next[cssPath] = patched
      changed.add(cssPath)
    }
  }
  if (changed.size <= 1 && htmlPaths.every((path) => next[path] === files[path])) return null
  return { files: next, changed: [...changed], slug, name: name || slug }
}

export function svgFromFetchedPages(pages: { text?: string; ok?: boolean }[]) {
  for (const page of pages) {
    if (page.ok === false) continue
    const svg = extractSvgFromFetch(page.text || '')
    if (svg) return svg
  }
  return ''
}

/** Letters currently painted in the top-left header — that is the logo to replace. */
export function visibleHeaderMarks(files: Record<string, string>) {
  const marks = new Set<string>()
  for (const [path, body] of Object.entries(files)) {
    if (typeof body !== 'string') continue
    if (/\.html?$/i.test(path)) {
      const header = body.match(/<header[\s\S]{0,4000}/i)?.[0] || body.slice(0, 2800)
      for (const match of header.matchAll(
        /<(?:a|div|span|p|h1|h2)[^>]*(?:class|id)=["'][^"']*(?:logo|brand|wordmark|site-title)[^"']*["'][^>]*>([\s\S]{0,120}?)<\//gi,
      )) {
        const text = innerText(match[1])
        if (text.length >= 2 && text.length <= 32) marks.add(text)
      }
      for (const match of header.matchAll(/<img[^>]*(?:logo|brand)[^>]*>/gi)) {
        const alt = match[0].match(/\balt=["']([^"']+)["']/i)?.[1]?.trim()
        if (alt && alt.length <= 32) marks.add(alt)
      }
    }
    if (/\.css$/i.test(path)) {
      for (const match of body.matchAll(
        /(?:logo|brand|wordmark)[^{]{0,120}\{[^}]{0,500}?content:\s*['"]([^'"]+)['"]/gi,
      )) {
        const text = match[1].trim()
        if (text.length >= 2 && text.length <= 32) marks.add(text)
      }
    }
  }
  return [...marks]
}
