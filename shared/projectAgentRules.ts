/**
 * Optional project rules text for system prompt (when workspace files are available server-side).
 * Desktop loads via projectRules.js on the client.
 */

export function formatProjectRulesBlock(raw: string) {
  const text = raw.trim()
  if (!text) return ''
  return text.slice(0, 24_000)
}
