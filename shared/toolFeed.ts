const HIDE_ARGS = new Set(['content', 'body', 'text', 'source', 'code', 'html', 'file_content'])

/** One short line for the chat feed. Never dump a file body. */
export function toolFeedLine(name: string, args: Record<string, string> = {}) {
  const path = args.path || args.file || ''
  if (name === 'write') return path || 'file'
  if (name === 'read') return path || 'file'
  if (name === 'grep') return [args.pattern || args.query, args.glob || path].filter(Boolean).join(' in ') || 'search'
  if (name === 'terminal') return args.command || args.cmd || 'command'
  if (name === 'fetch') return args.url || args.query || args.q || 'page'
  if (name === 'github') return args.action || args.repo || args.fullName || 'GitHub'
  if (name === 'mcp') return [args.server, args.tool || args.name].filter(Boolean).join(' · ') || 'mcp'
  const bits = Object.entries(args)
    .filter(([key, value]) => value && !HIDE_ARGS.has(key.toLowerCase()))
    .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, ' ').slice(0, 72)}`)
  return bits.length ? `${name} · ${bits.join(' · ')}` : name
}

export function toolFeedLabel(name: string) {
  if (name === 'write') return 'Wrote'
  if (name === 'read') return 'Read'
  if (name === 'grep') return 'Search'
  if (name === 'terminal') return 'Terminal'
  if (name === 'fetch') return 'Fetch'
  if (name === 'github') return 'GitHub'
  return 'Tool'
}
