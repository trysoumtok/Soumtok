const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ARCHIVE_CAP = 220_000
const SESSION_CAP = 160_000
const DISK_CAP = 180_000

/** @type {Map<string, { cwd?: string, log: string, lastAt: number }> | null} */
let shellSessions = null

/** Per-workspace rolling log — kept when a shell exits or tab is closed (for agent read_terminal). */
/** @type {Map<string, { log: string, lastAt: number }>} */
const workspaceArchives = new Map()

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const persistTimers = new Map()

let homeOverride = null

function setSoumtokHomeForTests(dir) {
  homeOverride = dir || null
}

function soumtokHome() {
  return homeOverride || path.join(os.homedir(), '.soumtok')
}

function bindShellSessions(map) {
  shellSessions = map
}

function appendWorkspaceLog(cwd, data) {
  appendToWorkspaceArchive(cwd, data)
}

function appendToWorkspaceArchive(cwd, data) {
  const key = normalizeCwd(cwd)
  if (!key || !data) return
  const row = workspaceArchives.get(key) || { log: '', lastAt: 0 }
  row.log += data
  if (row.log.length > ARCHIVE_CAP) row.log = row.log.slice(-ARCHIVE_CAP)
  row.lastAt = Date.now()
  workspaceArchives.set(key, row)
  schedulePersistWorkspaceLog(cwd)
}

function appendSessionLog(id, chunk, meta = {}) {
  if (!id || chunk == null) return
  const data = typeof chunk === 'string' ? chunk : String(chunk)
  if (!shellSessions) return
  const session = shellSessions.get(id)
  if (session) {
    if (!session.log) session.log = ''
    session.log += data
    if (session.log.length > SESSION_CAP) session.log = session.log.slice(-SESSION_CAP)
    session.lastOutAt = Date.now()
    if (meta.cwd && !session.cwd) session.cwd = meta.cwd
    if (session.cwd) appendToWorkspaceArchive(session.cwd, data)
  }
}

function archiveSessionLog(session) {
  if (!session?.cwd || !session.log) return
  const key = normalizeCwd(session.cwd)
  const row = workspaceArchives.get(key) || { log: '', lastAt: 0 }
  if (session.log.length > row.log.length) {
    row.log = session.log.length > ARCHIVE_CAP ? session.log.slice(-ARCHIVE_CAP) : session.log
    row.lastAt = Date.now()
    workspaceArchives.set(key, row)
  }
  persistWorkspaceLog(session.cwd)
}

function stripAnsi(text) {
  return String(text || '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[@-_]/g, '')
}

function summarizeTerminalLog(log) {
  const clean = stripAnsi(log)
  if (!clean.trim()) return ''
  const urls = [...clean.matchAll(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0):\d+/gi)].map((m) => m[0])
  const lines = []
  if (urls.length) lines.push(`Likely URLs:\n${[...new Set(urls)].slice(-8).join('\n')}`)
  if (/\b(ready in|ready on|started server|listening on|compiled successfully|Local:\s|✓ Ready)/i.test(clean)) {
    lines.push('Status: dev server looks READY in terminal output.')
  }
  if (/EADDRINUSE|already in use|address already in use/i.test(clean)) {
    lines.push('Status: port already in use — kill the process or use the repo reset script, then retry.')
  }
  if (/EPERM|Access is denied|spawn EPERM/i.test(clean)) {
    lines.push('Status: EPERM / access denied (often Windows AV locking node_modules native binaries).')
  }
  if (/NO LISTENER|fetch failed|ECONNREFUSED/i.test(clean)) {
    lines.push('Status: probe shows nothing listening yet — wait and read_terminal again or fix compile errors above.')
  }
  const errLines = clean
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && /error|ERR!|failed|Cannot find module|TransformError/i.test(l))
    .slice(-6)
  if (errLines.length) lines.push(`Recent errors:\n${errLines.join('\n')}`)
  return lines.length ? `\n\n--- Soumtok terminal summary ---\n${lines.join('\n\n')}` : ''
}

function formatLogForAgent(rawLog, tail = 16_000) {
  const sliced = String(rawLog || '').slice(-Math.max(500, Math.min(tail, 48_000)))
  const clean = stripAnsi(sliced)
  return clean + summarizeTerminalLog(clean)
}

function normalizeCwd(cwd) {
  if (!cwd) return ''
  try {
    let p = path.resolve(String(cwd).trim())
    if (process.platform === 'win32') p = p.toLowerCase().replace(/\//g, '\\')
    return p.replace(/\\+$/, '')
  } catch {
    return String(cwd).toLowerCase()
  }
}

function workspaceKey(dir) {
  try {
    return crypto.createHash('sha256').update(path.resolve(String(dir))).digest('hex').slice(0, 20)
  } catch {
    return ''
  }
}

function workspaceTermLogPath(cwd) {
  if (!cwd) return null
  const hash = workspaceKey(cwd)
  if (!hash) return null
  const dir = path.join(soumtokHome(), 'workspaces', hash)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    return null
  }
  return path.join(dir, 'term.log')
}

function rawLogForCwd(cwd) {
  const key = normalizeCwd(cwd)
  let merged = key ? workspaceArchives.get(key)?.log || '' : ''
  if (shellSessions && shellSessions.size > 0) {
    for (const session of shellSessions.values()) {
      const dir = normalizeCwd(session.cwd)
      const log = session.log || ''
      if (!log) continue
      if (key && dir && dir !== key) continue
      if (log.length >= merged.length) merged = log
    }
  }
  return merged.slice(-DISK_CAP)
}

function schedulePersistWorkspaceLog(cwd) {
  const key = normalizeCwd(cwd)
  if (!key) return
  const prev = persistTimers.get(key)
  if (prev) clearTimeout(prev)
  persistTimers.set(
    key,
    setTimeout(() => {
      persistTimers.delete(key)
      persistWorkspaceLog(cwd)
    }, 280),
  )
}

function persistWorkspaceLog(cwd) {
  const file = workspaceTermLogPath(cwd)
  if (!file) return
  try {
    fs.writeFileSync(file, rawLogForCwd(cwd), 'utf8')
  } catch {
    /* ignore disk errors */
  }
}

function flushAllWorkspaceLogs() {
  const seen = new Set()
  const flush = (cwd) => {
    const key = normalizeCwd(cwd)
    if (!key || seen.has(key)) return
    seen.add(key)
    const timer = persistTimers.get(key)
    if (timer) {
      clearTimeout(timer)
      persistTimers.delete(key)
    }
    persistWorkspaceLog(cwd)
  }
  for (const [key, row] of workspaceArchives) flush(key)
  if (shellSessions) {
    for (const session of shellSessions.values()) {
      if (session.cwd) flush(session.cwd)
    }
  }
}

function loadPersistedWorkspaceLog(cwd) {
  const key = normalizeCwd(cwd)
  if (!key) return ''
  let disk = ''
  try {
    const file = workspaceTermLogPath(cwd)
    if (file) disk = fs.readFileSync(file, 'utf8')
  } catch {
    disk = ''
  }
  if (disk) {
    const row = workspaceArchives.get(key) || { log: '', lastAt: 0 }
    if (disk.length >= (row.log || '').length) {
      row.log = disk.slice(-ARCHIVE_CAP)
      row.lastAt = Date.now()
      workspaceArchives.set(key, row)
    }
  }
  const live = rawLogForCwd(cwd)
  return (live.length >= disk.length ? live : disk).slice(-DISK_CAP)
}

function readLogsForCwd(cwd, tail = 16_000) {
  const want = normalizeCwd(cwd)
  if (want && !workspaceArchives.get(want)?.log) loadPersistedWorkspaceLog(cwd)
  let merged = want ? workspaceArchives.get(want)?.log || '' : ''
  if (shellSessions && shellSessions.size > 0) {
    /** @type {{ log: string, at: number }[]} */
    const chunks = []
    for (const session of shellSessions.values()) {
      const dir = normalizeCwd(session.cwd)
      const log = session.log || ''
      if (!log) continue
      if (want && dir && dir !== want) continue
      chunks.push({ log, at: session.lastOutAt || 0 })
    }
    if (!chunks.length) {
      for (const session of shellSessions.values()) {
        const log = session.log || ''
        if (log) chunks.push({ log, at: session.lastOutAt || 0 })
      }
    }
    chunks.sort((a, b) => a.at - b.at)
    for (const c of chunks) {
      if (c.log.length > merged.length) merged = c.log
    }
  }
  if (!merged && want) {
    for (const [, row] of workspaceArchives) {
      if (row.log.length > merged.length) merged = row.log
    }
  }
  return formatLogForAgent(merged, tail)
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForLogGrowth(cwd, { waitMs = 15_000, minChars = 40, pollMs = 500 } = {}) {
  const startLen = readLogsForCwd(cwd, 200_000).length
  const deadline = Date.now() + Math.min(Math.max(waitMs, 2000), 60_000)
  while (Date.now() < deadline) {
    await sleep(pollMs)
    const nowLen = readLogsForCwd(cwd, 200_000).length
    if (nowLen - startLen >= minChars) break
  }
  return readLogsForCwd(cwd, 16_000)
}

module.exports = {
  bindShellSessions,
  appendSessionLog,
  archiveSessionLog,
  appendWorkspaceLog,
  stripAnsi,
  summarizeTerminalLog,
  formatLogForAgent,
  readLogsForCwd,
  rawLogForCwd,
  persistWorkspaceLog,
  flushAllWorkspaceLogs,
  loadPersistedWorkspaceLog,
  setSoumtokHomeForTests,
  waitForLogGrowth,
  sleep,
  normalizeCwd,
}
