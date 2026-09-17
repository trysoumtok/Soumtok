/** Still-image aspect ratios. Default is always 1:1 unless the user asked otherwise. */

const DEFAULT_STILL_ASPECT = '1:1'
const STILL_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']
const KNOWN = new Set(STILL_ASPECTS)

function normalizeStillAspect(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace('x', ':')
    .replace('/', ':')
  if (KNOWN.has(t)) return t
  const m = t.match(/^(\d{1,2}):(\d{1,2})$/)
  if (m) {
    const key = `${Number(m[1])}:${Number(m[2])}`
    if (KNOWN.has(key)) return key
  }
  return DEFAULT_STILL_ASPECT
}

function ratioFromPair(a, b) {
  const key = `${Number(a)}:${Number(b)}`
  return KNOWN.has(key) ? key : ''
}

function stillAspectFromText(text) {
  const t = String(text || '')
  const labeled = t.match(
    /\b(?:aspect(?:\s*ratio)?|ratio|rato)\s*(?:of|:|=|is)?\s*(\d{1,2})\s*[:x/]\s*(\d{1,2})\b/i,
  )
  if (labeled) {
    const hit = ratioFromPair(labeled[1], labeled[2])
    if (hit) return hit
  }
  const pair = t.match(/\b(\d{1,2})\s*[:x/]\s*(\d{1,2})\b/)
  if (pair) {
    const hit = ratioFromPair(pair[1], pair[2])
    if (hit) return hit
  }
  const lower = t.toLowerCase()
  if (/\b(in|as)\s+square\b/.test(lower) || /\bsquare\s+(format|ratio|aspect|crop)\b/.test(lower)) {
    return '1:1'
  }
  if (
    /\b(in|as)\s+(portrait|vertical)\b/.test(lower) ||
    /\b(portrait|vertical)\s+(format|ratio|aspect|mode|orientation)\b/.test(lower)
  ) {
    return '9:16'
  }
  if (
    /\b(in|as)\s+(landscape|widescreen|horizontal)\b/.test(lower) ||
    /\b(landscape|widescreen|horizontal)\s+(format|ratio|aspect|mode|orientation)\b/.test(lower)
  ) {
    return '16:9'
  }
  return DEFAULT_STILL_ASPECT
}

const STRIPPERS = [
  /\b(?:aspect(?:\s*ratio)?|ratio|rato)\s*(?:of|:|=|is)?\s*(?:\d{1,2}\s*[:x/]\s*\d{1,2}|square|portrait|landscape|widescreen|vertical|horizontal)\b/gi,
  /\b(?:in|as)\s+(?:square|portrait|landscape|widescreen|vertical|horizontal)\b/gi,
  /\b(?:square|portrait|landscape|widescreen|vertical|horizontal)\s+(?:format|ratio|aspect|crop|mode|orientation)\b/gi,
  /\b(\d{1,2})\s*[:x/]\s*(\d{1,2})\b/g,
]

function stripStillAspectFromPrompt(text) {
  let out = String(text || '')
  for (const re of STRIPPERS) out = out.replace(re, ' ')
  return out.replace(/\s+/g, ' ').replace(/^[,.\-–—:]+|[,.\-–—:]+$/g, '').trim()
}

function parseStillRequest(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim()
  const aspect = stillAspectFromText(raw)
  const prompt = stripStillAspectFromPrompt(raw)
  return { prompt: prompt || 'image', aspect }
}

function stillAspectForImageUse(prompt, pathHint) {
  const combined = `${String(prompt || '')} ${String(pathHint || '')}`.toLowerCase()
  const explicit = stillAspectFromText(combined)
  if (explicit !== DEFAULT_STILL_ASPECT) return explicit
  if (
    /\b(hero|banner|cover|header[\s-]?image|landing|og[\s-]?image|wide[\s-]?shot|background[\s-]?image)\b/.test(
      combined,
    )
  ) {
    return '16:9'
  }
  return DEFAULT_STILL_ASPECT
}

function falImageSize(aspect) {
  const a = normalizeStillAspect(aspect)
  if (a === '1:1') return 'square_hd'
  if (a === '16:9' || a === '3:2') return 'landscape_16_9'
  if (a === '9:16' || a === '2:3') return 'portrait_16_9'
  if (a === '4:3') return 'landscape_4_3'
  if (a === '3:4') return 'portrait_4_3'
  return 'square_hd'
}

function stillAspectCss(aspect) {
  const [w, h] = normalizeStillAspect(aspect).split(':')
  return `${w} / ${h}`
}

module.exports = {
  DEFAULT_STILL_ASPECT,
  STILL_ASPECTS,
  normalizeStillAspect,
  stillAspectFromText,
  stripStillAspectFromPrompt,
  parseStillRequest,
  stillAspectForImageUse,
  falImageSize,
  stillAspectCss,
}
