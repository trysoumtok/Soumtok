/**
 * Per-project skill memory — skills the user attached (picker, files, cloud) are analyzed once
 * and recalled on later turns so the agent can offer to apply them.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { skillFromDocument } = require('./agentSkills')

function workspaceKey(dir) {
  return crypto.createHash('sha256').update(path.resolve(dir)).digest('hex').slice(0, 20)
}

function threadScopeId(threadId) {
  return String(threadId || 'legacy').replace(/[^\w-]/g, '_').slice(0, 64)
}

function memoryPath(dir, threadId) {
  const dirPath = path.join(require('os').homedir(), '.soumtok', 'workspaces', workspaceKey(dir))
  fs.mkdirSync(dirPath, { recursive: true })
  const id = threadScopeId(threadId)
  return path.join(dirPath, `skill-memory-${id}.json`)
}

function loadSkillMemory(folder, threadId) {
  if (!folder) return { skills: [] }
  try {
    const data = JSON.parse(fs.readFileSync(memoryPath(folder, threadId), 'utf8'))
    return { skills: Array.isArray(data.skills) ? data.skills : [] }
  } catch {
    return { skills: [] }
  }
}

function saveSkillMemory(folder, mem, threadId) {
  if (!folder) return
  fs.writeFileSync(memoryPath(folder, threadId), JSON.stringify({ ...mem, threadId: threadScopeId(threadId) }, null, 2))
}

function keywordsFromSkill(row) {
  const bits = [row.name, row.description, row.fileName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3)
  return [...new Set(bits)].slice(0, 24)
}

function normalizeSkillRow(row) {
  const name = String(row.name || '').trim()
  if (!name) return null
  return {
    name,
    description: String(row.description || name).slice(0, 500),
    body: String(row.body || row.excerpt || '').slice(0, 24_000),
    source: row.source || 'local',
    fileName: row.fileName || row.file_name || '',
    keywords: row.keywords || keywordsFromSkill(row),
    savedAt: row.savedAt || new Date().toISOString(),
    lastUsedAt: row.lastUsedAt || row.savedAt || new Date().toISOString(),
    useCount: Number(row.useCount) || 0,
  }
}

function rememberSkills(folder, rows, threadId) {
  if (!folder || !rows?.length) return loadSkillMemory(folder, threadId)
  const mem = loadSkillMemory(folder, threadId)
  const byName = new Map(mem.skills.map((s) => [s.name.toLowerCase(), s]))
  for (const raw of rows) {
    const next = normalizeSkillRow(raw)
    if (!next) continue
    const key = next.name.toLowerCase()
    const prev = byName.get(key)
    byName.set(key, {
      ...(prev || {}),
      ...next,
      savedAt: prev?.savedAt || next.savedAt,
      useCount: (prev?.useCount || 0) + 1,
      lastUsedAt: new Date().toISOString(),
    })
  }
  const skills = [...byName.values()].sort((a, b) => String(b.lastUsedAt).localeCompare(String(a.lastUsedAt)))
  saveSkillMemory(folder, { skills: skills.slice(0, 48) }, threadId)
  return { skills }
}

function skillsFromAttachments(files) {
  const out = []
  for (const file of files || []) {
    const text = String(file?.text || '').trim()
    if (!text) continue
    const doc = skillFromDocument(text, file.name || 'SKILL.md', 'file')
    if (doc) out.push(doc)
  }
  return out
}

function matchSkillsForQuery(skills, userText, excludeNames = new Set()) {
  const q = String(userText || '').trim().toLowerCase()
  if (!q || !skills?.length) return []
  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 3)
  const scored = []
  for (const row of skills) {
    if (excludeNames.has(String(row.name || '').toLowerCase())) continue
    const hay = `${row.name} ${row.description} ${(row.keywords || []).join(' ')}`.toLowerCase()
    let score = 0
    if (q.includes(String(row.name || '').toLowerCase())) score += 8
    for (const w of words) {
      if (hay.includes(w)) score += 2
    }
    if (score > 0) scored.push({ row, score })
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((hit) => hit.row)
}

function composeSkillMemoryBrief(mem) {
  const skills = mem?.skills || []
  if (!skills.length) return ''
  const lines = [
    'SAVED SKILLS FOR THIS CHAT (user attached these in this agent tab — offer read_skill or ask to apply when relevant):',
  ]
  for (const row of skills.slice(0, 12)) {
    lines.push(
      `- ${row.name} [${row.source}]: ${String(row.description || '').slice(0, 140)}${row.fileName ? ` (from ${row.fileName})` : ''}`,
    )
  }
  lines.push(
    'When a saved skill clearly matches the request and is not already attached, use ask_question to offer applying it before guessing.',
  )
  return lines.join('\n')
}

function buildSkillUseAsk(skills) {
  const picks = (skills || []).slice(0, 4)
  if (!picks.length) return null
  return {
    title: 'Use a saved skill?',
    intro: 'You saved skill playbooks in this project that may fit this request.',
    questions: [
      {
        id: 'use_skill',
        prompt: 'Should I follow one of these skills for this task?',
        allowCustom: true,
        options: [
          ...picks.map((s) => ({
            id: `skill:${s.name}`,
            label: `${s.name} — ${String(s.description || '').slice(0, 72)}`,
          })),
          { id: 'none', label: 'Continue without a skill' },
        ],
      },
    ],
  }
}

function skillBodyFromMemory(mem, name) {
  const want = String(name || '').trim().toLowerCase()
  const hit = (mem?.skills || []).find((s) => s.name.toLowerCase() === want)
  return hit || null
}

function formatChosenSkillBlock(skill) {
  if (!skill) return ''
  const lines = [`USER CHOSE SAVED SKILL: ${skill.name}`, skill.description || '']
  const body = String(skill.body || '').trim()
  if (body) {
    lines.push('\n--- SKILL.md ---')
    lines.push(body.slice(0, 20_000))
  }
  lines.push('Follow this skill for the rest of the run. Acknowledge it briefly in your reply.')
  return lines.join('\n')
}

module.exports = {
  loadSkillMemory,
  rememberSkills,
  skillsFromAttachments,
  matchSkillsForQuery,
  composeSkillMemoryBrief,
  buildSkillUseAsk,
  skillBodyFromMemory,
  formatChosenSkillBlock,
}
