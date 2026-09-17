/** Shared helpers for installed plugin skill packs (GitHub playbooks). */

type PluginSkillRow = {
  id: string
  skillId?: string
  label?: string
  pluginId?: string
  pluginName?: string
  description?: string
  insert?: string
  sourceUrl?: string
  body?: string
}

export function githubBlobToRaw(url: string) {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i.exec(String(url || '').trim())
  if (!m) return null
  return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`
}

export function pluginSkillReadName(skill: PluginSkillRow) {
  const sid = skill.skillId || (skill.id && String(skill.id).includes(':') ? skill.id.split(':').pop() : skill.id)
  const pid = skill.pluginId || (skill.id && String(skill.id).includes(':') ? skill.id.split(':')[0] : '')
  if (pid && sid) return `${pid}:${sid}`
  return String(skill.label || skill.id || '')
}

export function flattenInstalledPluginSkills(
  plugins: { plugin_id?: string; pluginId?: string; name?: string; skills?: PluginSkillRow[] }[],
) {
  const out: PluginSkillRow[] = []
  for (const plug of plugins || []) {
    const pluginId = plug.plugin_id || plug.pluginId || ''
    const pluginName = plug.name || pluginId
    const skills = Array.isArray(plug.skills) ? plug.skills : []
    for (const skill of skills) {
      if (!skill?.id) continue
      out.push({
        id: `${pluginId}:${skill.id}`,
        skillId: skill.id,
        pluginId,
        pluginName,
        label: skill.label || skill.id,
        description: skill.description || '',
        insert: skill.insert || '',
        sourceUrl: skill.sourceUrl || '',
      })
    }
  }
  return out
}

export function findPluginSkill(pluginSkills: PluginSkillRow[], name: string) {
  const want = String(name || '').trim().toLowerCase()
  if (!want || !Array.isArray(pluginSkills)) return null
  return (
    pluginSkills.find((row) => {
      const id = String(row.id || '').toLowerCase()
      const skillId = String(row.skillId || '').toLowerCase()
      const label = String(row.label || '').toLowerCase()
      const compound = `${row.pluginId || ''}:${row.skillId || ''}`.toLowerCase()
      return (
        id === want ||
        skillId === want ||
        label === want ||
        compound === want ||
        id.endsWith(`:${want}`) ||
        label.includes(want)
      )
    }) || null
  )
}

export function formatAttachedPluginSkillsBlock(skills: PluginSkillRow[], opts: { compact?: boolean } = {}) {
  const rows = (skills || []).filter((row) => row?.label || row?.id)
  if (!rows.length) return ''
  const lines = [
    'USER SKILL PACKS ATTACHED (installed from GitHub — follow these when relevant):',
    'When skills are attached, start your reply by briefly confirming which skills you loaded and what you can do with them.',
  ]
  for (const row of rows) {
    const title = row.label || row.skillId || row.id
    lines.push(`\n## ${title}${row.pluginName ? ` (${row.pluginName})` : ''}`)
    if (row.description) lines.push(String(row.description).trim())
    const insert = String(row.insert || '').trim()
    if (insert) lines.push(insert)
    const body = String(row.body || '').trim()
    if (body) {
      lines.push('\n--- SKILL.md ---')
      lines.push(body.slice(0, 20_000))
    } else {
      const readName = pluginSkillReadName(row)
      lines.push(`Call read_skill({ name: "${readName}" }) to load the full GitHub playbook if you need more detail.`)
    }
  }
  lines.push(
    '\nObey attached skill instructions before generic guesses. Use mcp() only after Connectors sign-in when live tools are required.',
  )
  if (opts.compact) return lines.join('\n')
  return lines.join('\n')
}
