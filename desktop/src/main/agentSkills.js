/**
 * Load SKILL.md files (Cursor-style) from the workspace, user home, and Soumtok bundled skills.
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const {
  githubBlobToRaw,
  findPluginSkill,
  flattenInstalledPluginSkills,
} = require('../../../shared/pluginSkillsRuntime.cjs')
const { resolveMcpConnector } = require('../../../shared/connectorsRuntime.cjs')

const skillBodyCache = new Map()

function isSkillLikeFileName(name) {
  const n = String(name || '')
  return /skill\.md$/i.test(n) || /\.skill$/i.test(n) || /\/skills?\//i.test(n.replace(/\\/g, '/'))
}

function skillFromDocument(raw, fileName, source = 'file') {
  const text = String(raw || '').trim()
  if (!text) return null
  const parsed = parseFrontmatter(text)
  const base = path.basename(String(fileName || 'SKILL.md'), path.extname(String(fileName || '.md')))
  const name = parsed.name || base || 'skill'
  const hasFrontmatter = parsed.name || parsed.description
  const looksLikeSkill =
    isSkillLikeFileName(fileName) ||
    hasFrontmatter ||
    /^#\s+skill\b/im.test(text) ||
    /\bwhen to use\b/i.test(text.slice(0, 1200))
  if (!looksLikeSkill) return null
  return {
    name,
    description: parsed.description || name,
    body: parsed.body || text,
    source,
    fileName: fileName || '',
  }
}

async function enrichAttachedCloudSkills(attached, getBuffer) {
  const out = []
  for (const row of attached || []) {
    const merged = { ...row, source: row.source || 'cloud' }
    const excerpt = String(merged.excerpt || '').trim()
    if (!excerpt && typeof getBuffer === 'function' && merged.id) {
      try {
        const res = await getBuffer('GET', `/api/skills/${encodeURIComponent(merged.id)}/file`, 60_000)
        if (res?.buffer?.length) {
          const ct = String(res.contentType || '')
          const fname = merged.file_name || merged.name || 'skill.md'
          if (/text|json|markdown|html|xml|csv/i.test(ct) || /\.(md|txt|skill)$/i.test(fname)) {
            const text = res.buffer.toString('utf8')
            const doc = skillFromDocument(text, fname, 'cloud')
            if (doc) {
              merged.name = merged.name || doc.name
              merged.description = merged.description || doc.description
              merged.excerpt = doc.body
              merged.body = doc.body
            } else {
              merged.excerpt = text.slice(0, 20_000)
              merged.body = text.slice(0, 20_000)
            }
          }
        }
      } catch {
        /* optional fetch */
      }
    } else if (excerpt && !merged.body) {
      merged.body = excerpt
    }
    out.push(merged)
  }
  return out
}

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

function findCloudSkill(cloudSkills, name) {
  const want = String(name || '').trim().toLowerCase()
  if (!want || !Array.isArray(cloudSkills)) return null
  return (
    cloudSkills.find(
      (row) =>
        String(row.id || '').toLowerCase() === want ||
        String(row.name || '').toLowerCase() === want ||
        String(row.file_name || '').toLowerCase() === want ||
        String(row.name || '').toLowerCase().includes(want),
    ) || null
  )
}

async function fetchGithubSkillMarkdown(sourceUrl) {
  const raw = githubBlobToRaw(sourceUrl)
  if (!raw) return null
  if (skillBodyCache.has(raw)) return skillBodyCache.get(raw)
  try {
    const res = await fetch(raw, {
      headers: { 'User-Agent': 'Soumtok-Desktop/1.0' },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return null
    const text = await res.text()
    skillBodyCache.set(raw, text)
    return text
  } catch {
    return null
  }
}

async function readInstalledPluginSkill(toolCtx, name) {
  const list = toolCtx?.pluginSkills || []
  const hit = findPluginSkill(list, name)
  if (!hit) return null
  const lines = [`SKILL ${hit.label || hit.skillId} (${hit.pluginName || hit.pluginId})`]
  if (hit.description) lines.push(String(hit.description).trim())
  if (hit.insert) lines.push(String(hit.insert).trim())
  if (hit.body) {
    lines.push('\n--- SKILL.md ---\n' + String(hit.body).slice(0, 12_000))
    return { ok: true, text: lines.join('\n\n') }
  }
  if (hit.sourceUrl) {
    const body = await fetchGithubSkillMarkdown(hit.sourceUrl)
    if (body) {
      hit.body = body
      lines.push('\n--- SKILL.md ---\n' + body.slice(0, 12_000))
      return { ok: true, text: lines.join('\n\n') }
    }
  }
  if (lines.length > 1) return { ok: true, text: lines.join('\n\n') }
  return { ok: false, text: `Plugin skill "${name}" has no readable content.` }
}

function enrichAttachedLocalSkills(workspaceRoot, attached) {
  const out = []
  for (const row of attached || []) {
    if (!row?.name) continue
    const merged = { ...row }
    const hit = listAgentSkills(workspaceRoot, {}).find(
      (s) => s.name.toLowerCase() === String(row.name).trim().toLowerCase(),
    )
    if (hit) {
      merged.description = merged.description || hit.description || ''
      merged.source = merged.source || hit.source || 'local'
      if (hit.body) merged.body = hit.body
    }
    out.push(merged)
  }
  return out
}

function connectorHintsForAttachedSkills(localRows, pluginRows, connectors) {
  const list = Array.isArray(connectors) ? connectors : []
  const live = list.filter((c) => c?.connected)
  const lines = []
  const needsMcp =
    (localRows || []).some((row) => row.name === 'plugins-mcp') || (pluginRows || []).length > 0
  if (!needsMcp) return ''
  if (!live.length) {
    lines.push(
      'CONNECTOR STATUS: No MCP connectors are connected yet. If the user attached plugins-mcp or a plugin skill pack, use ask_question to offer opening Settings → Connectors so they can sign in — do not call mcp() until connected.',
    )
  }
  for (const row of pluginRows || []) {
    const slug = row.pluginId || row.pluginName || row.label || ''
    const hit = resolveMcpConnector(list, slug) || resolveMcpConnector(list, row.pluginName || row.label || '')
    if (!hit?.connected) {
      lines.push(
        `CONNECTOR STATUS: "${row.pluginName || row.label}" skill is attached but its connector is not connected — tell the user to open Settings → Connectors (or tap Connect on the Installed skills tab) and sign in to ${row.pluginName || row.label} before live mcp() calls.`,
      )
    } else if (/figma|canva/i.test(String(row.pluginName || row.pluginId || ''))) {
      lines.push(
        `DESIGN: ${row.pluginName || row.label} is connected — use mcp({ server: "${row.pluginId || row.pluginName}", tool: "..." }) to read the user's design, then edit the open project template/code to match.`,
      )
    }
  }
  return lines.join('\n')
}

async function enrichAttachedPluginSkills(attached, accountPluginSkills) {
  const byId = new Map((accountPluginSkills || []).map((row) => [row.id, row]))
  const out = []
  for (const row of attached || []) {
    const meta = byId.get(row.id) || findPluginSkill(accountPluginSkills, row.id) || {}
    const merged = {
      ...meta,
      ...row,
      description: row.description || meta.description || '',
      insert: row.insert || meta.insert || '',
      sourceUrl: row.sourceUrl || meta.sourceUrl || '',
    }
    if (!merged.body && merged.sourceUrl) {
      const body = await fetchGithubSkillMarkdown(merged.sourceUrl)
      if (body) merged.body = body
    }
    out.push(merged)
  }
  return out
}

async function readCloudSkill(toolCtx, name) {
  const hit = findCloudSkill(toolCtx?.cloudSkills, name)
  if (!hit) return null
  if (hit.excerpt) {
    return { ok: true, text: `SKILL ${hit.name} (cloud)\n\n${String(hit.excerpt).slice(0, 20_000)}` }
  }
  const getBuffer = toolCtx?.getBuffer
  if (typeof getBuffer === 'function' && hit.id) {
    const res = await getBuffer('GET', `/api/skills/${encodeURIComponent(hit.id)}/file`, 60_000)
    if (res?.buffer?.length) {
      const ct = String(res.contentType || '')
      if (/text|json|markdown|html|xml|csv/i.test(ct) || /\.(md|txt|json|csv|html|skill)$/i.test(hit.file_name || '')) {
        return { ok: true, text: `SKILL ${hit.name} (cloud)\n\n${res.buffer.toString('utf8').slice(0, 20_000)}` }
      }
      return { ok: true, text: `SKILL ${hit.name} (cloud file: ${hit.file_name || 'attachment'}, ${res.buffer.length} bytes). Use the excerpt in system context.` }
    }
  }
  return { ok: false, text: `Skill "${hit.name}" has no readable text excerpt.` }
}

async function readSkillByNameOrCloud(workspaceRoot, name, toolCtx) {
  const local = readSkillByName(workspaceRoot, name)
  if (local.ok) return local
  const plugin = await readInstalledPluginSkill(toolCtx, name)
  if (plugin?.ok) return plugin
  const cloud = await readCloudSkill(toolCtx, name)
  if (cloud) return cloud
  return plugin && !plugin.ok ? plugin : local
}

module.exports = {
  listAgentSkills,
  skillsCatalogBlock,
  readSkillByName,
  findCloudSkill,
  readCloudSkill,
  readSkillByNameOrCloud,
  fetchGithubSkillMarkdown,
  skillFromDocument,
  isSkillLikeFileName,
  enrichAttachedLocalSkills,
  enrichAttachedCloudSkills,
  enrichAttachedPluginSkills,
  connectorHintsForAttachedSkills,
  flattenInstalledPluginSkills,
}
