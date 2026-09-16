/**
 * Local meaning search (identifier + path + comment BM25). Not a neural embedding index —
 * good enough to find "auth login flow" when the file is named session.ts.
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')

const SKIP_DIR = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  'coverage',
  '.soumtok',
  'release',
  'vendor',
])
const CODE_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.css',
  '.html',
  '.md',
  '.json',
  '.vue',
  '.svelte',
  '.php',
  '.rb',
  '.cs',
])

const cache = new Map()

const QUERY_SYNONYMS = {
  login: ['auth', 'session', 'signin'],
  auth: ['login', 'session', 'oauth'],
  session: ['auth', 'cookie', 'token'],
  cube: ['three', 'mesh', 'rubik', 'geometry'],
  look: ['style', 'css', 'theme', 'ui'],
  visual: ['style', 'css', 'canvas', 'three', 'ui'],
  style: ['css', 'theme', 'look'],
  black: ['material', 'color', 'spot', 'canvas'],
  spot: ['material', 'texture', 'gap', 'color'],
  footer: ['header', 'nav', 'layout'],
  theme: ['css', 'dark', 'light', 'color'],
}

function tokenize(text) {
  const raw = String(text || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_./\\-]+/g, ' ')
    .toLowerCase()
  return raw.split(/[^a-z0-9]+/).filter((t) => t.length > 1)
}

function walkFiles(root, limit = 800) {
  const files = []
  function walk(dir, depth) {
    if (depth > 12 || files.length >= limit) return
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (SKIP_DIR.has(entry.name) || entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full, depth + 1)
      else if (CODE_EXT.has(path.extname(entry.name).toLowerCase())) files.push(full)
    }
  }
  walk(root, 0)
  return files
}

function chunkFile(root, file) {
  let body = ''
  try {
    body = fs.readFileSync(file, 'utf8')
  } catch {
    return []
  }
  if (body.length > 200_000) body = body.slice(0, 200_000)
  const rel = path.relative(root, file).replace(/\\/g, '/')
  const lines = body.split('\n')
  const chunks = []
  const size = 70
  for (let i = 0; i < lines.length; i += size) {
    const slice = lines.slice(i, i + size)
    const text = slice.join('\n')
    const comment = (text.match(/\/\*\*[\s\S]*?\*\/|\/\/.+|#.+/g) || []).join(' ').slice(0, 800)
    chunks.push({
      path: rel,
      start: i + 1,
      text,
      tokens: tokenize(`${rel} ${comment} ${text}`),
    })
  }
  return chunks
}

function buildIndex(root) {
  const files = walkFiles(root)
  const chunks = []
  const df = new Map()
  for (const file of files) {
    for (const chunk of chunkFile(root, file)) {
      chunks.push(chunk)
      const uniq = new Set(chunk.tokens)
      for (const t of uniq) df.set(t, (df.get(t) || 0) + 1)
    }
  }
  return { chunks, df, n: chunks.length || 1, builtAt: Date.now() }
}

function indexStorePath(root) {
  const key = crypto.createHash('sha1').update(String(root)).digest('hex').slice(0, 16)
  const dir = path.join(os.homedir(), '.soumtok', 'indexes')
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    /* ignore */
  }
  return path.join(dir, `${key}.json`)
}

function saveDiskIndex(root, idx) {
  try {
    const slim = {
      root,
      builtAt: idx.builtAt,
      n: idx.n,
      chunks: idx.chunks.map((c) => ({
        path: c.path,
        start: c.start,
        tokens: c.tokens.slice(0, 80),
        preview: String(c.text || '').split('\n').slice(0, 8).join('\n'),
      })),
      df: [...idx.df.entries()].slice(0, 8000),
    }
    fs.writeFileSync(indexStorePath(root), JSON.stringify(slim))
  } catch {
    /* disk optional */
  }
}

function loadDiskIndex(root) {
  try {
    const raw = JSON.parse(fs.readFileSync(indexStorePath(root), 'utf8'))
    if (!raw?.chunks?.length) return null
    const df = new Map(raw.df || [])
    const chunks = raw.chunks.map((c) => ({
      path: c.path,
      start: c.start,
      tokens: c.tokens || [],
      text: c.preview || '',
    }))
    return { chunks, df, n: raw.n || chunks.length || 1, builtAt: raw.builtAt || 0, fromDisk: true }
  } catch {
    return null
  }
}

function getIndex(root) {
  const hit = cache.get(root)
  if (hit && Date.now() - hit.builtAt < 5 * 60_000) return hit
  const disk = loadDiskIndex(root)
  if (disk && Date.now() - disk.builtAt < 10 * 60_000) {
    cache.set(root, disk)
    return disk
  }
  const idx = buildIndex(root)
  cache.set(root, idx)
  saveDiskIndex(root, idx)
  return idx
}

function invalidateIndex(root) {
  if (root) {
    cache.delete(root)
    try {
      fs.unlinkSync(indexStorePath(root))
    } catch {
      /* missing */
    }
  } else cache.clear()
}

const watchers = new Map()

function watchIndex(root) {
  if (!root || watchers.has(root)) return
  let timer = null
  try {
    const w = fs.watch(root, { recursive: true }, (_ev, name) => {
      if (!name || /node_modules|[\\/]\.git[\\/]|[\\/]dist[\\/]/.test(String(name))) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        invalidateIndex(root)
        try {
          getIndex(root)
        } catch {
          /* rebuild optional */
        }
      }, 500)
    })
    watchers.set(root, w)
  } catch {
    /* watch optional on this OS */
  }
}

function unwatchIndex(root) {
  const w = watchers.get(root)
  if (!w) return
  try {
    w.close()
  } catch {
    /* ignore */
  }
  watchers.delete(root)
}

function expandQueryTokens(tokens) {
  const list = Array.isArray(tokens) ? tokens : []
  const out = [...list]
  const seen = new Set(list)
  for (const term of list) {
    if (!Object.prototype.hasOwnProperty.call(QUERY_SYNONYMS, term)) continue
    const extra = QUERY_SYNONYMS[term]
    if (!Array.isArray(extra)) continue
    for (const syn of extra) {
      if (seen.has(syn)) continue
      seen.add(syn)
      out.push(syn)
    }
  }
  return out.slice(0, 24)
}

const QUERY_STOP = new Set([
  'go',
  'on',
  'yes',
  'ok',
  'okay',
  'sure',
  'please',
  'the',
  'a',
  'an',
  'to',
  'it',
  'do',
  'that',
])

function searchHits(root, query, limit = 8) {
  const q = expandQueryTokens(tokenize(query)).filter((t) => !QUERY_STOP.has(t) && t.length > 2)
  if (!q.length) return []
  const idx = getIndex(root)
  if (!idx.chunks.length) return []
  const scored = []
  for (const chunk of idx.chunks) {
    const tf = new Map()
    for (const t of chunk.tokens) tf.set(t, (tf.get(t) || 0) + 1)
    let score = 0
    for (const term of q) {
      const f = tf.get(term) || 0
      if (!f) continue
      const idf = Math.log(1 + idx.n / (1 + (idx.df.get(term) || 0)))
      score += ((f * 2.2) / (f + 1.2)) * idf
      const base = path.basename(chunk.path).toLowerCase()
      if (chunk.path.toLowerCase().includes(term)) score += 1.4
      if (base.includes(term)) score += 0.8
    }
    if (score > 0) scored.push({ score, chunk })
  }
  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, Math.min(Number(limit) || 8, 12))
  const seen = new Set()
  const hits = []
  for (const row of top) {
    if (seen.has(row.chunk.path)) continue
    seen.add(row.chunk.path)
    hits.push({
      path: row.chunk.path,
      start: row.chunk.start,
      score: row.score,
      preview: row.chunk.text.split('\n').slice(0, 8).join('\n'),
    })
  }
  return hits
}

function searchCodebase(root, query, limit = 12) {
  const q = tokenize(query)
  if (!q.length) return { ok: false, text: 'codebase_search needs query' }
  const hits = searchHits(root, query, limit)
  if (!hits.length) {
    const idx = getIndex(root)
    if (!idx.chunks.length) return { ok: true, text: 'Index empty — workspace has no searchable source yet.' }
    return { ok: true, text: `No semantic hits for "${query}". Try grep() for exact text.` }
  }
  const blocks = hits.map(
    (row, i) => `${i + 1}. ${row.path}:${row.start}  (score ${row.score.toFixed(2)})\n${row.preview}`,
  )
  return { ok: true, text: `codebase_search "${query}"\n\n${blocks.join('\n\n')}` }
}

module.exports = {
  searchCodebase,
  searchHits,
  invalidateIndex,
  getIndex,
  watchIndex,
  unwatchIndex,
  tokenize,
  expandQueryTokens,
}
