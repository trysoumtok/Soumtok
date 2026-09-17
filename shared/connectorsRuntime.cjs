/** MCP connector lookup shared by Desktop harness and tests. */

function normalizeConnectorKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function connectorKeys(c) {
  if (!c || typeof c !== 'object') return []
  return [c.id, c.name, c.plugin_id, c.pluginId, c.slug]
    .map((k) => normalizeConnectorKey(String(k || '')))
    .filter(Boolean)
}

function scoreConnectorMatch(c, want) {
  const keys = connectorKeys(c)
  if (!keys.length || !want) return 0
  let score = 0
  for (const key of keys) {
    if (key === want) score = Math.max(score, 100)
    else if (key.includes(want) || want.includes(key)) score = Math.max(score, 70)
    else {
      const parts = want.split(/[\s/_-]+/).filter((p) => p.length > 2)
      if (parts.some((part) => key.includes(part))) score = Math.max(score, 45)
    }
  }
  return score
}

function resolveMcpConnector(connectors, server) {
  const want = normalizeConnectorKey(server)
  if (!want || !Array.isArray(connectors)) return null
  const ranked = connectors
    .map((c) => ({ c, score: scoreConnectorMatch(c, want) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
  return ranked[0]?.c || null
}

function connectorAliases(c) {
  const keys = connectorKeys(c)
  return [...new Set(keys.filter(Boolean))]
}

function formatConnectorRef(c) {
  if (!c) return ''
  const aliases = connectorAliases(c)
  const tools = (c.tools || []).map((t) => t.name).filter(Boolean)
  const aliasNote = aliases.length ? ` aliases: ${aliases.join(', ')}` : ''
  const toolNote = tools.length ? `: ${tools.slice(0, 8).join(', ')}` : ''
  const plugin = c.plugin_id || c.pluginId
  const pluginNote = plugin ? ` plugin_id=${plugin}` : ''
  return `- ${c.name} (id=${c.id}${pluginNote})${aliasNote}${c.mcpUrl ? ` ${c.mcpUrl}` : ''}${toolNote}`
}

function connectorWorkflowHints(connectors) {
  const live = (connectors || []).filter((c) => c?.connected)
  if (!live.length) return ''
  const lines = []
  const has = (slug) => Boolean(resolveMcpConnector(live, slug))
  if (has('figma') || has('canva')) {
    lines.push(
      'DESIGN: Figma/Canva are connected — use mcp({ server: "figma" or "Figma", tool: "..." }) to read frames, components, and tokens; apply changes in the open project (HTML/CSS/TS). Ask for a file URL if none was given.',
    )
  }
  if (has('notion') || has('linear') || has('slack')) {
    lines.push(
      'WORK APPS: Notion/Linear/Slack are connected — use mcp() for docs, issues, and threads; sync relevant updates into code or project docs.',
    )
  }
  if (has('github') || has('gitlab')) {
    lines.push('SCM: GitHub/GitLab MCP can list PRs, issues, and repo metadata — pair with local git() for commits in the workspace.')
  }
  if (has('neon') || has('supabase') || has('stripe') || has('datadog') || has('sentry')) {
    lines.push(
      'BACKEND: Connected data/payments/observability MCPs — use mcp() for schema, logs, or billing; never paste secrets into source.',
    )
  }
  return lines.join('\n')
}

module.exports = {
  normalizeConnectorKey,
  resolveMcpConnector,
  connectorAliases,
  formatConnectorRef,
  connectorWorkflowHints,
}
