/**
 * Load SKILL.md files (Cursor-style) from the workspace, user home, and Soumtok bundled skills.
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

function parseFrontmatter(raw) {
  const text = String(raw || '')
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!m) return { name: '', description: '', body: text.trim() }
  const meta = {}
  for (const line of m[1].split('\n')) {
    const at = line.indexOf(':')
    if (at < 0) continue
    meta[line.slice(0, at).trim()] = line.slice(at + 1).trim().replace(/^["']|["']$/g, '')
  }
  return {
    name: meta.name || '',
    description: meta.description || '',
    body: m[2].trim(),
  }
}

function readSkillFile(file, source) {
  try {
    const parsed = parseFrontmatter(fs.readFileSync(file, 'utf8'))
    const name = parsed.name || path.basename(path.dirname(file))
    return {
      name,
      description: parsed.description || name,
      body: parsed.body,
      source,
      path: file,
    }
  } catch {
    return null
  }
}

function walkSkillRoots(dir, source, out, limit = 24) {
  if (!dir || !fs.existsSync(dir) || out.length >= limit) return
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (out.length >= limit) return
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const skillMd = path.join(full, 'SKILL.md')
      if (fs.existsSync(skillMd)) {
        const row = readSkillFile(skillMd, source)
        if (row) out.push(row)
      } else walkSkillRoots(full, source, out, limit)
    } else if (/^skill\.md$/i.test(entry.name)) {
      const row = readSkillFile(full, source)
      if (row) out.push(row)
    }
  }
}

function bundledSkillsDir() {
  return path.join(__dirname, '../../resources/agent-skills')
}

function listAgentSkills(workspaceRoot, opts = {}) {
  const out = []
  const seen = new Set()
  const third = opts.thirdPartyImports !== false
  const roots = [
    [bundledSkillsDir(), 'soumtok'],
    [path.join(os.homedir(), '.soumtok', 'skills'), 'user'],
    third ? [path.join(os.homedir(), '.cursor', 'skills'), 'cursor-user'] : null,
    workspaceRoot ? path.join(workspaceRoot, '.soumtok', 'skills') : '',
    workspaceRoot ? path.join(workspaceRoot, '.agents', 'skills') : '',
    third && workspaceRoot ? path.join(workspaceRoot, '.cursor', 'skills') : '',
    third && workspaceRoot ? path.join(workspaceRoot, '.github', 'skills') : '',
  ].filter(Boolean)
  for (const item of roots) {
    const dir = Array.isArray(item) ? item[0] : item
    const source = Array.isArray(item) ? item[1] : 'project'
    walkSkillRoots(dir, source, out)
  }
  const unique = []
  for (const row of out) {
    const key = row.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(row)
  }
  return unique
}

function skillsCatalogBlock(workspaceRoot, opts = {}) {
  const skills = listAgentSkills(workspaceRoot, opts)
  if (!skills.length) return ''
  const lines = ['SKILLS (read_skill(name) to load full instructions when the job matches):']
  for (const row of skills.slice(0, 20)) {
    lines.push(`- ${row.name} [${row.source}]: ${String(row.description).slice(0, 180)}`)
  }
  return lines.join('\n')
}

function readSkillByName(workspaceRoot, name) {
  const want = String(name || '').trim().toLowerCase()
  if (!want) return { ok: false, text: 'read_skill needs name' }
  const hit = listAgentSkills(workspaceRoot, {}).find(
    (s) => s.name.toLowerCase() === want || s.name.toLowerCase().includes(want),
  )
  if (!hit) return { ok: false, text: `No skill named "${name}". Call read_skill after listing catalog in system.` }
  return { ok: true, text: `SKILL ${hit.name} (${hit.source})\n\n${hit.body.slice(0, 12_000)}` }
}

module.exports = { listAgentSkills, skillsCatalogBlock, readSkillByName }
