const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')

const MAX_CHECKPOINTS = 24

function workspaceKey(root) {
  return crypto.createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 20)
}

/** Checkpoints live under ~/.soumtok/workspaces/<hash>/ — not inside the user's repo. */
function checkpointDir(root) {
  return path.join(os.homedir(), '.soumtok', 'workspaces', workspaceKey(root), 'checkpoints')
}

function legacyCheckpointDir(root) {
  return path.join(root, '.soumtok', 'checkpoints')
}

function resolveCheckpointFile(root, id) {
  const primary = path.join(checkpointDir(root), `${id}.json`)
  if (fs.existsSync(primary)) return primary
  const legacy = path.join(legacyCheckpointDir(root), `${id}.json`)
  if (fs.existsSync(legacy)) return legacy
  return primary
}

function pruneCheckpoints(dir) {
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    if (files.length <= MAX_CHECKPOINTS) return
    const sorted = files
      .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => a.m - b.m)
    for (let i = 0; i < sorted.length - MAX_CHECKPOINTS; i++) {
      fs.unlinkSync(path.join(dir, sorted[i].f))
    }
  } catch {
    /* ignore */
  }
}

function createCheckpoint(root, relPaths) {
  const id = crypto.randomUUID()
  const dir = checkpointDir(root)
  fs.mkdirSync(dir, { recursive: true })
  const files = {}
  const seen = new Set()
  for (const rel of relPaths || []) {
    const r = String(rel || '')
      .replace(/^[/\\]+/, '')
      .replace(/\\/g, '/')
    if (!r || seen.has(r)) continue
    seen.add(r)
    const full = path.join(root, r)
    try {
      files[r] = fs.readFileSync(full, 'utf8')
    } catch {
      files[r] = null
    }
  }
  const payload = { id, at: new Date().toISOString(), files }
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(payload), 'utf8')
  pruneCheckpoints(dir)
  return { id, paths: Object.keys(files) }
}

function restoreCheckpoint(root, id, onlyPaths) {
  const file = resolveCheckpointFile(root, id)
  if (!fs.existsSync(file)) return { ok: false, text: 'Checkpoint not found' }
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'))
  const filter = Array.isArray(onlyPaths) && onlyPaths.length ? new Set(onlyPaths.map(String)) : null
  let restored = 0
  for (const [rel, content] of Object.entries(payload.files || {})) {
    if (filter && !filter.has(rel)) continue
    const full = path.join(root, rel)
    if (content === null) {
      if (fs.existsSync(full)) {
        fs.unlinkSync(full)
        restored++
      }
    } else {
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, content, 'utf8')
      restored++
    }
  }
  return { ok: true, text: `Restored ${restored} file(s)`, paths: Object.keys(payload.files || {}) }
}

function listCheckpoints(root) {
  const dir = checkpointDir(root)
  const legacy = legacyCheckpointDir(root)
  const out = []
  for (const base of [dir, legacy]) {
    try {
      if (!fs.existsSync(base)) continue
      for (const f of fs.readdirSync(base).filter((n) => n.endsWith('.json'))) {
        const full = path.join(base, f)
        const payload = JSON.parse(fs.readFileSync(full, 'utf8'))
        out.push({
          id: payload.id || f.replace(/\.json$/, ''),
          at: payload.at || '',
          paths: Object.keys(payload.files || {}),
        })
      }
    } catch {
      /* ignore */
    }
  }
  out.sort((a, b) => String(b.at).localeCompare(String(a.at)))
  const seen = new Set()
  return out.filter((row) => {
    if (seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
}

module.exports = { createCheckpoint, restoreCheckpoint, listCheckpoints, checkpointDir, workspaceKey }
