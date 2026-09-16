/**
 * Durable per-folder brief so the agent does not rediscover the repo every turn.
 * Stored next to chat cache: ~/.soumtok/workspaces/<hash>/project-memory.json
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { pickRunCommandFromFolder, inferIntentForFolder } = require('./buildDirector')

function workspaceKey(dir) {
  return crypto.createHash('sha256').update(path.resolve(dir)).digest('hex').slice(0, 20)
}

function memoryPath(dir) {
  const dirPath = path.join(os.homedir(), '.soumtok', 'workspaces', workspaceKey(dir))
  fs.mkdirSync(dirPath, { recursive: true })
  return path.join(dirPath, 'project-memory.json')
}

function readPackage(folder) {
  try {
    return JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}

function readReadme(folder) {
  for (const name of ['README.md', 'readme.md', 'README.txt']) {
    try {
      return fs.readFileSync(path.join(folder, name), 'utf8').slice(0, 800)
    } catch {
      /* missing */
    }
  }
  return ''
}

function listEntries(folder) {
  const names = [
    'src/main.tsx',
    'src/main.ts',
    'src/index.tsx',
    'src/index.ts',
    'src/App.tsx',
    'src/cube3d.ts',
    'index.html',
    'main.py',
    'server.js',
    'index.js',
    'package.json',
  ]
  return names.filter((rel) => {
    try {
      return fs.existsSync(path.join(folder, rel))
    } catch {
      return false
    }
  })
}

function buildProjectMemory(folder) {
  const pkg = readPackage(folder)
  const intent = inferIntentForFolder(folder, '')
  const runCommand = pickRunCommandFromFolder(folder)
  const scripts =
    pkg?.scripts && typeof pkg.scripts === 'object' ? Object.keys(pkg.scripts).slice(0, 10) : []
  const readme = readReadme(folder)
  const firstLine =
    readme
      .split(/\r?\n/)
      .map((line) => line.replace(/^#+\s*/, '').trim())
      .find(Boolean) || ''
  const summary =
    String(pkg?.description || '').trim() ||
    firstLine.slice(0, 180) ||
    `${path.basename(folder)} (${intent?.kind || 'project'})`
  return {
    folder: path.resolve(folder),
    name: pkg?.name || path.basename(folder),
    stack: intent?.kind || (pkg ? 'node' : 'files'),
    scripts,
    runCommand,
    entryFiles: listEntries(folder),
    summary,
    updatedAt: new Date().toISOString(),
    lastQuery: '',
    lastQueryPaths: [],
  }
}

function loadProjectMemory(folder) {
  try {
    return JSON.parse(fs.readFileSync(memoryPath(folder), 'utf8'))
  } catch {
    return null
  }
}

function saveProjectMemory(folder, mem) {
  fs.writeFileSync(memoryPath(folder), JSON.stringify(mem, null, 2))
}

function refreshProjectMemory(folder, query) {
  const next = buildProjectMemory(folder)
  const prev = loadProjectMemory(folder) || {}
  const q = String(query || '').trim()
  const queryChanged = Boolean(q && q !== String(prev.lastQuery || ''))
  next.lastQuery = q || prev.lastQuery || ''
  next.lastQueryPaths = queryChanged ? [] : prev.lastQueryPaths || []
  saveProjectMemory(folder, next)
  return { ...next, queryChanged: Boolean(queryChanged || !prev.updatedAt) }
}

function composeProjectBrief(mem, taskKind) {
  if (!mem) return ''
  const entries = (mem.entryFiles || []).slice(0, 8).join(', ') || '(none listed)'
  const scripts = (mem.scripts || []).join(', ') || '(none)'
  const runHint =
    taskKind === 'run'
      ? `This turn is RUN. Call terminal("${mem.runCommand}") then read_terminal({ wait_ms: 20000 }). Do not rewrite files unless start fails. A localhost URL inside source is not a running server.`
      : ''
  return `PROJECT BRIEF (stored for this folder — trust this over old KNOWN FILES):
Name: ${mem.name}
What: ${mem.summary}
Stack: ${mem.stack}
Run: ${mem.runCommand}
Scripts: ${scripts}
Entries: ${entries}
${runHint}`.trim()
}

module.exports = {
  workspaceKey,
  memoryPath,
  buildProjectMemory,
  loadProjectMemory,
  saveProjectMemory,
  refreshProjectMemory,
  composeProjectBrief,
}
