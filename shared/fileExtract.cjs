/** Universal file text extraction for agent attachments and read(). */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { PDFParse } = require('pdf-parse')
const mammoth = require('mammoth')
const XLSX = require('xlsx')
const JSZip = require('jszip')
const WordExtractor = require('word-extractor')

const FILE_TEXT_MAX = 200_000
const INNER_ZIP_MAX = 6
const INNER_FILE_MAX = 80_000

const TEXT_EXT =
  /\.(txt|md|csv|json|html?|css|scss|js|jsx|ts|tsx|mjs|cjs|py|go|rs|java|kt|rb|php|sql|yml|yaml|toml|xml|svg|sh|env|gitignore|dockerfile|vue|svelte|astro|rtf|log|ini|cfg|conf|skill|tex|rst|adoc|properties)$/i

const OFFICE_EXT = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|epub|rtf|zip|7z|rar)$/i

function classifyFile(name, mime = '') {
  const lower = String(name || '').toLowerCase()
  const type = String(mime || '').toLowerCase()
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|ico|avif|svg)$/i.test(lower)) return 'image'
  if (type.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(lower)) return 'video'
  if (type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(lower)) return 'audio'
  if (type === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf'
  if (type.includes('wordprocessingml') || lower.endsWith('.docx')) return 'docx'
  if (lower.endsWith('.doc')) return 'doc'
  if (type.includes('spreadsheetml') || /\.(xlsx|xlsm|xlsb)$/i.test(lower)) return 'xlsx'
  if (lower.endsWith('.xls')) return 'xls'
  if (type.includes('presentationml') || lower.endsWith('.pptx')) return 'pptx'
  if (lower.endsWith('.ppt')) return 'ppt'
  if (lower.endsWith('.odt') || lower.endsWith('.ods') || lower.endsWith('.odp')) return 'odf'
  if (lower.endsWith('.epub')) return 'epub'
  if (lower.endsWith('.rtf') || type === 'text/rtf') return 'rtf'
  if (type.includes('zip') || lower.endsWith('.zip')) return 'zip'
  if (type.startsWith('text/') || TEXT_EXT.test(lower)) return 'text'
  if (/json|xml|javascript|typescript/.test(type)) return 'text'
  return 'binary'
}

function isExtractableDocument(name, mime = '') {
  const kind = classifyFile(name, mime)
  return ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'odf', 'epub', 'rtf', 'zip', 'text'].includes(kind)
    ? kind
    : null
}

function dataUrlToBuffer(dataUrl) {
  const raw = String(dataUrl || '').trim()
  const match = /^data:[^;]+;base64,(.+)$/i.exec(raw)
  if (!match) return null
  try {
    return Buffer.from(match[1].replace(/\s+/g, ''), 'base64')
  } catch {
    return null
  }
}

function safeInboxName(name) {
  return String(name || 'attachment')
    .replace(/[<>:"/\\|?*]+/g, '_')
    .slice(0, 180)
}

function clipText(text, max = FILE_TEXT_MAX) {
  const s = String(text || '').replace(/\r\n/g, '\n').trim()
  if (s.length <= max) return { text: s, truncated: false }
  return { text: s.slice(0, max), truncated: true }
}

function decodeText(bytes) {
  for (const enc of ['utf8', 'latin1']) {
    try {
      const raw = bytes.toString(enc)
      if (raw.includes('\uFFFD') && enc === 'utf8') continue
      return clipText(raw)
    } catch {
      /* try next */
    }
  }
  return clipText(bytes.toString('latin1'))
}

function stripXml(xml) {
  return String(xml || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripRtf(rtf) {
  return String(rtf || '')
    .replace(/\{\\[^}]+\}/g, '')
    .replace(/\\[a-z]+\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stringsFromBuffer(buf, minLen = 5) {
  const raw = buf.toString('latin1')
  const parts = raw.match(/[\x20-\x7e\r\n\t\u00a0-\u00ff]{5,}/g) || []
  return clipText(parts.join('\n'), 60_000)
}

async function extractPdfText(bytes) {
  const parser = new PDFParse({ data: bytes })
  try {
    const result = await parser.getText()
    return clipText(result?.text || '')
  } finally {
    await parser.destroy().catch(() => {})
  }
}

async function extractDocText(bytes) {
  const tmp = path.join(os.tmpdir(), `soumtok-${Date.now()}-${Math.random().toString(36).slice(2)}.doc`)
  try {
    fs.writeFileSync(tmp, bytes)
    const extractor = new WordExtractor()
    const doc = await extractor.extract(tmp)
    return clipText([doc.getBody(), doc.getFootnotes(), doc.getEndnotes()].filter(Boolean).join('\n\n'))
  } finally {
    try {
      fs.unlinkSync(tmp)
    } catch {
      /* ignore */
    }
  }
}

async function extractXlsxText(bytes) {
  const wb = XLSX.read(bytes, { type: 'buffer', cellDates: true })
  const chunks = []
  for (const sheetName of wb.SheetNames.slice(0, 12)) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName] || {})
    if (csv.trim()) chunks.push(`## ${sheetName}\n${csv}`)
  }
  return clipText(chunks.join('\n\n'))
}

async function extractPptxText(bytes) {
  const zip = await JSZip.loadAsync(bytes)
  const slides = []
  for (const [p, file] of Object.entries(zip.files)) {
    if (!/ppt\/slides\/slide\d+\.xml$/i.test(p) || file.dir) continue
    slides.push(stripXml(await file.async('string')))
  }
  slides.sort()
  return clipText(slides.map((t, i) => `Slide ${i + 1}: ${t}`).join('\n\n'))
}

async function extractOdfText(bytes) {
  const zip = await JSZip.loadAsync(bytes)
  const content = zip.file('content.xml')
  if (!content) return { text: '', truncated: false }
  return clipText(stripXml(await content.async('string')))
}

async function extractEpubText(bytes) {
  const zip = await JSZip.loadAsync(bytes)
  const chunks = []
  for (const [p, file] of Object.entries(zip.files)) {
    if (file.dir) continue
    if (!/\.(xhtml|html|htm|xml)$/i.test(p)) continue
    chunks.push(stripXml(await file.async('string')))
    if (chunks.join('\n').length > FILE_TEXT_MAX) break
  }
  return clipText(chunks.join('\n\n'))
}

async function extractZipText(bytes) {
  const zip = await JSZip.loadAsync(bytes)
  const entries = Object.entries(zip.files)
    .filter(([, f]) => !f.dir)
    .sort(([a], [b]) => a.localeCompare(b))
  const chunks = []
  let count = 0
  for (const [p, file] of entries) {
    if (count >= INNER_ZIP_MAX) break
    const base = path.basename(p)
    const kind = classifyFile(base, '')
    if (!['text', 'pdf', 'docx', 'xlsx', 'rtf'].includes(kind) && !TEXT_EXT.test(base)) continue
    const inner = await file.async('nodebuffer')
    const got = await extractFileContent(base, '', inner)
    if (got.text?.trim()) {
      chunks.push(`### ${p}\n${got.text.slice(0, INNER_FILE_MAX)}`)
      count++
    }
  }
  if (!chunks.length) {
    const listing = entries.slice(0, 40).map(([p]) => p).join('\n')
    return clipText(`ZIP archive (${entries.length} files):\n${listing}`)
  }
  return clipText(chunks.join('\n\n'))
}

async function extractFileContent(name, mime, bytes) {
  const kind = classifyFile(name, mime)
  const empty = { text: '', kind, truncated: false, error: '', hint: '' }
  if (!bytes?.length) return empty
  try {
    if (kind === 'text') {
      const got = decodeText(bytes)
      return { ...empty, ...got }
    }
    if (kind === 'pdf') {
      const got = await extractPdfText(bytes)
      return { ...empty, ...got }
    }
    if (kind === 'docx') {
      const parsed = await mammoth.extractRawText({ buffer: bytes })
      return { ...empty, ...clipText(parsed?.value || '') }
    }
    if (kind === 'doc') {
      const got = await extractDocText(bytes)
      return { ...empty, ...got }
    }
    if (kind === 'xlsx' || kind === 'xls') {
      const got = await extractXlsxText(bytes)
      return { ...empty, ...got }
    }
    if (kind === 'pptx' || kind === 'ppt') {
      if (kind === 'ppt') return { ...empty, hint: 'Legacy .ppt — export as .pptx or PDF for best results.' }
      const got = await extractPptxText(bytes)
      return { ...empty, ...got }
    }
    if (kind === 'odf') {
      const got = await extractOdfText(bytes)
      return { ...empty, ...got }
    }
    if (kind === 'epub') {
      const got = await extractEpubText(bytes)
      return { ...empty, ...got }
    }
    if (kind === 'rtf') {
      return { ...empty, ...clipText(stripRtf(decodeText(bytes).text)) }
    }
    if (kind === 'zip') {
      const got = await extractZipText(bytes)
      return { ...empty, ...got }
    }
    if (kind === 'image') {
      return { ...empty, hint: 'Image — use examine_media(path) or rely on SOUMTOK VISION / attachment pixels.' }
    }
    if (kind === 'video') {
      return { ...empty, hint: 'Video — Gemini-class models can watch it; otherwise describe what you need from it.' }
    }
    if (kind === 'audio') {
      return { ...empty, hint: 'Audio file — transcribe externally or paste a transcript if the model cannot listen.' }
    }
    const got = stringsFromBuffer(bytes)
    return {
      ...empty,
      ...got,
      hint: got.text ? 'Binary file — showing embedded printable strings.' : 'Binary file — no readable text extracted.',
    }
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) }
  }
}

async function extractDocumentText(name, mime, bytes) {
  const out = await extractFileContent(name, mime, bytes)
  return {
    text: out.text,
    kind: out.kind,
    truncated: out.truncated,
    error: out.error,
    hint: out.hint,
  }
}

function attachmentAnalysis(file, extracted) {
  const parts = []
  if (file.analysis) parts.push(file.analysis)
  if (extracted.text) {
    parts.push(
      `Soumtok extracted ${String(extracted.kind || 'file').toUpperCase()} content (${extracted.text.length} chars). Use this text — do not say you cannot open the file.`,
    )
  } else if (extracted.hint) {
    parts.push(extracted.hint)
  } else if (extracted.error) {
    parts.push(`Extraction failed (${file.name}): ${extracted.error}`)
  }
  return parts.filter(Boolean).join('\n')
}

async function enrichAttachmentText(file) {
  if (file?.text?.trim()) return file
  const name = String(file?.name || '')
  const mime = String(file?.mime || '')
  const kind = classifyFile(name, mime)
  const buf = file.dataUrl ? dataUrlToBuffer(file.dataUrl) : file.bytes || null
  if (!buf?.length) {
    if (kind === 'image' || kind === 'video') {
      return {
        ...file,
        analysis: attachmentAnalysis(file, { kind, text: '', hint: kind === 'image' ? 'Image attached for vision.' : 'Video attached.' }),
      }
    }
    return file
  }
  const extracted = await extractFileContent(name, mime, buf)
  if (!extracted.text && !extracted.hint && !extracted.error) return file
  return {
    ...file,
    text: extracted.text || file.text,
    analysis: attachmentAnalysis(file, extracted),
  }
}

async function enrichAttachmentsText(files) {
  if (!Array.isArray(files) || !files.length) return files || []
  return Promise.all(files.map((file) => enrichAttachmentText(file)))
}

function persistAttachmentsToInbox(folder, files) {
  if (!folder || !Array.isArray(files) || !files.length) return files || []
  const inboxDir = path.join(folder, '.soumtok', 'inbox')
  fs.mkdirSync(inboxDir, { recursive: true })
  return files.map((file) => {
    const buf = file.dataUrl ? dataUrlToBuffer(file.dataUrl) : null
    if (!buf?.length) return file
    const safe = safeInboxName(file.name || 'attachment')
    const rel = `.soumtok/inbox/${safe}`
    try {
      fs.writeFileSync(path.join(folder, rel.replace(/\//g, path.sep)), buf)
      return { ...file, inboxPath: rel, workspacePath: rel }
    } catch {
      return file
    }
  })
}

function formatAttachedDocumentsBlock(attach) {
  const list = Array.isArray(attach) ? attach : []
  const readable = list.filter((f) => f.text?.trim())
  const hints = list.filter((f) => !f.text?.trim() && f.analysis?.trim())
  if (!readable.length && !hints.length) return ''
  const lines = [
    'ATTACHED FILES (Soumtok extracted — ground truth; use this content; do not claim you cannot open these files):',
  ]
  for (const f of readable) {
    lines.push(
      `\n### ${f.name}${f.inboxPath ? `\nWorkspace copy: read("${f.inboxPath}")` : ''}\n${String(f.text).slice(0, 100_000)}`,
    )
    if (f.text.length > 100_000) lines.push('\n…truncated')
  }
  for (const f of hints) {
    lines.push(`\n### ${f.name}\n${String(f.analysis).slice(0, 4000)}`)
  }
  return lines.join('\n')
}

module.exports = {
  FILE_TEXT_MAX,
  DOCUMENT_TEXT_MAX: FILE_TEXT_MAX,
  TEXT_EXT,
  OFFICE_EXT,
  classifyFile,
  isExtractableDocument,
  dataUrlToBuffer,
  extractFileContent,
  extractDocumentText,
  enrichAttachmentText,
  enrichAttachmentsText,
  persistAttachmentsToInbox,
  formatAttachedDocumentsBlock,
  safeInboxName,
}
