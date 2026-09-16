/**
 * Harness-side file map: search + git + tree run locally so the model
 * does not spend tokens listing the repo again.
 */
const fs = require('fs')
const path = require('path')
const { gitSnapshot } = require('./gitTools')
const { searchHits } = require('./semanticIndex')
const { compactGitSnapshot } = require('../shared/tokenGuard')

const SKIP = new Set([
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

function listTree(root, limit = 48) {
  const files = []
  function walk(dir, depth) {
    if (depth > 8 || files.length >= limit) return
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (files.length >= limit) return
      if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      const rel = path.relative(root, full).replace(/\\/g, '/')
      if (entry.isDirectory()) {
        files.push(`${rel}/`)
        walk(full, depth + 1)
      } else files.push(rel)
    }
  }
  walk(root, 0)
  return files
}

function buildWorkspaceAtlas(root, query) {
  if (!root) return { text: '', paths: [] }
  const tree = listTree(root)
  let git = ''
  try {
    git = compactGitSnapshot(gitSnapshot(root)?.text)
  } catch {
    git = ''
  }
  let pkgLine = ''
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    const scripts = Object.keys(pkg.scripts || {}).slice(0, 8).join(', ')
    pkgLine = `package: ${pkg.name || '(unnamed)'}  scripts: ${scripts || '(none)'}`
  } catch {
    pkgLine = ''
  }
  const hits = query ? searchHits(root, query, 8) : []
  const seen = new Set()
  let paths = []
  for (const hit of hits) {
    if (!hit.path || seen.has(hit.path)) continue
    seen.add(hit.path)
    paths.push(hit.path)
  }
  if (!paths.length) {
    paths = tree.filter((p) => /^(src\/.+\.(ts|tsx|js|jsx|css)|package\.json|index\.html)$/.test(p)).slice(0, 6)
  }
  const bodyPaths = [
    ...paths.filter((p) => p.startsWith('src/')),
    ...paths.filter((p) => !p.startsWith('src/')),
  ].slice(0, 4)
  const bodies = []
  for (const rel of bodyPaths) {
    try {
      const raw = fs.readFileSync(path.join(root, rel), 'utf8')
      bodies.push(`FILE ${rel}\n${raw.slice(0, 1800)}`)
    } catch {
      /* skip missing */
    }
  }
  const hitBlock = hits.length
    ? hits
        .map((h, i) => `${i + 1}. ${h.path}:${h.start}\n${h.preview}`)
        .join('\n\n')
    : paths.length
      ? paths.map((p, i) => `${i + 1}. ${p}`).join('\n')
      : '(no meaning hits — greenfield or empty src/)'
  const lines = [
    'KNOWN FILES (harness already searched this git repo on disk — do NOT list_dir, codebase_search, or git status again):',
    git ? `GIT:\n${git}` : 'GIT: (not a repository)',
    pkgLine,
    tree.length ? `TREE:\n${tree.slice(0, 28).join('\n')}` : 'TREE: (empty)',
    `TOUCH THESE for the user request:\n${hitBlock}`,
    bodies.length
      ? `FILE BODIES (already loaded — diff/write these, do not read() them first):\n${bodies.join('\n\n')}`
      : '',
    'Next step: diff() or write() the TOUCH THESE paths. Searching the tree again wastes credits.',
  ]
  let text = lines.filter(Boolean).join('\n\n')
  if (text.length > 7200) text = `${text.slice(0, 7200)}\n…(atlas truncated)`
  return { text, paths, git, tree }
}

module.exports = { buildWorkspaceAtlas, listTree }
