const HIDE_ARGS = new Set([
  'content',
  'body',
  'text',
  'source',
  'code',
  'html',
  'file_content',
  'old_string',
  'new_string',
  'lines',
  'hunk',
  'patch',
])

/** One short line for the chat feed. Never dump a file body. */
export function toolFeedLine(name: string, args: Record<string, string> = {}) {
  const path = args.path || args.file || ''
  if (name === 'write' || name === 'diff' || name === 'edit' || name === 'str_replace' || name === 'replace') {
    return path || 'file'
  }
  if (name === 'read') return path || 'file'
  if (name === 'grep') return [args.pattern || args.query, args.glob || path].filter(Boolean).join(' in ') || 'search'
  if (name === 'terminal') return args.command || args.cmd || 'command'
  if (name === 'fetch') return args.url || args.query || args.q || 'page'
  if (name === 'github') return args.action || args.repo || args.fullName || 'GitHub'
  if (name === 'mcp') return [args.server, args.tool || args.name].filter(Boolean).join(' · ') || 'mcp'
  if (name === 'generate_image') return args.path || String(args.prompt || 'image').slice(0, 48)
  if (name === 'examine_media') return args.path || 'media'
  const bits = Object.entries(args)
    .filter(([key, value]) => value && !HIDE_ARGS.has(key.toLowerCase()))
    .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, ' ').slice(0, 72)}`)
  return bits.length ? `${name} · ${bits.join(' · ')}` : name
}

export function toolFeedLabel(name: string) {
  if (name === 'write') return 'Wrote'
  if (name === 'diff' || name === 'edit' || name === 'str_replace' || name === 'replace') return 'Edited'
  if (name === 'read') return 'Read'
  if (name === 'grep') return 'Search'
  if (name === 'terminal') return 'Terminal'
  if (name === 'fetch') return 'Fetch'
  if (name === 'github') return 'GitHub'
  if (name === 'mcp') return 'MCP'
  if (name === 'generate_image') return 'Image'
  if (name === 'examine_media') return 'Media'
  return 'Tool'
}

type LiveStepEvent =
  | { kind: 'diff'; path: string; removed?: number }
  | { kind: 'tool'; name: string; args?: Record<string, string> }
  | { kind: 'result'; name: string; ok?: boolean }
  | { kind: 'thought'; text: string }
  | { kind: 'fetch'; title?: string; url: string }
  | { kind: 'command'; command: string }
  | { kind: 'note'; title: string }
  | { kind: string; name?: string; text?: string; title?: string; path?: string; command?: string; url?: string; removed?: number; args?: Record<string, string>; ok?: boolean }

/** Spinner line under the agent — present tense while work is in flight. */
export function liveStepLabel(event: LiveStepEvent): string {
  if (event.kind === 'diff') {
    const path = 'path' in event ? event.path : ''
    return event.removed ? `Editing ${path}` : `Writing ${path}`
  }
  if (event.kind === 'tool') {
    const path = event.args?.path || event.args?.file
    if (event.name === 'read' && path) return `Reading ${path}`
    if (event.name === 'write' && path) return `Writing ${path}`
    if (event.name === 'grep') {
      const target = event.args?.glob || path || event.args?.pattern
      return target ? `Searching ${target}` : 'Searching'
    }
    if (event.name === 'terminal') return event.args?.command || event.args?.cmd || 'Running a command'
    if (event.name === 'generate_image') return event.args?.prompt ? `Generating image` : 'Generating image'
    if (event.name === 'examine_media') return path ? `Examining ${path}` : 'Examining media'
    if (event.name === 'mcp') return event.args?.server ? `MCP ${event.args.server}` : 'MCP'
    return path ? `Running ${event.name} · ${path}` : `Running ${event.name}`
  }
  if (event.kind === 'result') {
    if (event.ok === false) {
      if (event.name === 'read') return 'Read failed'
      if (event.name === 'write') return 'Write failed'
      return `${event.name} failed`
    }
    return ''
  }
  if (event.kind === 'thought') {
    const line = (event.text || '').split('\n')[0]?.trim() || ''
    if (/analyzing your request|analyzing and understanding/i.test(line)) return 'Analyzing and understanding'
    if (line) return line.slice(0, 72)
    return 'Thinking'
  }
  if (event.kind === 'fetch') return `Reading ${event.title || event.url}`
  if (event.kind === 'command') return event.command || 'Running a command'
  if (event.kind === 'note' && event.title === 'Passed to the model') return 'Passed to the model'
  return 'Working'
}

export function normalizeLiveStep(step: string) {
  const text = step.trim()
  if (!text) return 'Working'
  if (/^(read|write|grep|terminal|fetch|github|mcp|tool|diff) ok$/i.test(text)) return 'Working'
  if (/^passed to the model$/i.test(text)) return 'Passed to the model'
  if (/^analyzing (your request|and understanding)$/i.test(text)) return 'Analyzing and understanding'
  return text
}
