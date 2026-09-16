const fs = require('fs')
const path = require('path')

function readIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim()
  } catch {
    return ''
  }
}

function walkRulesDir(dir, label, limit = 6) {
  const parts = []
  try {
    const names = fs.readdirSync(dir).slice(0, limit)
    for (const name of names) {
      if (!/\.(md|mdc|txt)$/i.test(name)) continue
      const body = readIfExists(path.join(dir, name))
      if (body) parts.push(`${label} ${name}:\n${body.slice(0, 8000)}`)
    }
  } catch {
    /* no dir */
  }
  return parts
}

function walkNestedAgents(root, depth = 0, acc = []) {
  if (depth > 2 || acc.length >= 8) return acc
  let entries = []
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const entry of entries) {
    if (acc.length >= 8) break
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue
    const full = path.join(root, entry.name)
    if (entry.isFile() && /^agents\.md$/i.test(entry.name) && depth > 0) {
      const body = readIfExists(full)
      if (body) acc.push(`PROJECT ${path.relative(path.dirname(root), full).replace(/\\/g, '/')}:\n${body.slice(0, 4000)}`)
    } else if (entry.isDirectory() && depth < 2) {
      walkNestedAgents(full, depth + 1, acc)
    }
  }
  return acc
}

/** Optional repo rules — AGENTS.md, nested package AGENTS.md, .soumtok/rules, .cursor/rules. */
function loadProjectRules(root) {
  if (!root || !fs.existsSync(root)) return ''
  const parts = []
  const agents = readIfExists(path.join(root, 'AGENTS.md'))
  if (agents) parts.push(`PROJECT AGENTS.md:\n${agents.slice(0, 14_000)}`)
  const nested = readIfExists(path.join(root, '.soumtok', 'AGENTS.md'))
  if (nested) parts.push(`PROJECT .soumtok/AGENTS.md:\n${nested.slice(0, 8000)}`)
  parts.push(...walkNestedAgents(root))
  parts.push(...walkRulesDir(path.join(root, '.soumtok', 'rules'), 'Soumtok rule'))
  parts.push(...walkRulesDir(path.join(root, '.cursor', 'rules'), 'Cursor rule'))
  if (!parts.length) return ''
  let text = `PROJECT RULES (from this repo — follow when relevant):\n\n${parts.join('\n\n')}`
  if (text.length > 18_000) text = `${text.slice(0, 18_000)}\n…(rules truncated)`
  return text
}

module.exports = { loadProjectRules }
