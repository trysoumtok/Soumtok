import type { AgentEvent } from './agent.ts'
import { isGitPushCommand, parseSandboxCommand } from '../server/sandbox.ts'

export type StudioToolName = 'read' | 'grep' | 'write' | 'terminal' | 'github' | 'fetch' | 'mcp'

export type StudioTool = Extract<AgentEvent, { kind: 'tool' }>

export type ToolOutcome = {
  name: string
  ok: boolean
  text: string
  files?: Record<string, string>
}

const INSPECT = new Set<string>(['read', 'grep', 'github', 'terminal', 'fetch', 'mcp'])

export function pendingTools(events: AgentEvent[]): StudioTool[] {
  return events.filter((item): item is StudioTool => item.kind === 'tool' && Boolean(item.name))
}

export function pendingRunnableCommands(events: AgentEvent[]): StudioTool[] {
  const tools: StudioTool[] = []
  for (const event of events) {
    if (event.kind !== 'command' || event.ok !== undefined) continue
    const command = event.command.trim()
    if (!command) continue
    if (isGitPushCommand(command) || parseSandboxCommand(command)) {
      tools.push({ kind: 'tool', name: 'terminal', args: { command } })
    }
  }
  return tools
}

export function pendingToolsForRun(events: AgentEvent[]): StudioTool[] {
  const tools = pendingTools(events)
  const have = new Set(tools.filter((item) => item.name === 'terminal').map((item) => item.args.command || item.args.cmd || ''))
  for (const extra of pendingRunnableCommands(events)) {
    if (!have.has(extra.args.command)) tools.push(extra)
  }
  return tools.slice(0, 8)
}

export function toolsNeedFollowUp(events: AgentEvent[]) {
  const tools = pendingToolsForRun(events)
  if (tools.length === 0) return false
  if (events.some((item) => item.kind === 'summary')) return false
  return toolsNeedAnotherRound(tools)
}

/** Skip reads of files the model already has, so a restyle does not re-scan the workspace. */
export function skipKnownReads(tools: StudioTool[], files: Record<string, string>) {
  return tools.filter((tool) => {
    if (tool.name !== 'read') return true
    const path = String(tool.args.path || tool.args.file || '').replace(/^\/+/, '')
    return !path || !(path in files)
  })
}

export function toolsNeedAnotherRound(tools: StudioTool[]) {
  return tools.some((item) => {
    if (item.name === 'write') return false
    if (item.name === 'terminal') {
      const command = item.args.command || item.args.cmd || ''
      return !/^(ls|dir|pwd|whoami|echo|cat|type|mkdir|md|touch)\b/i.test(command.trim())
    }
    return INSPECT.has(item.name)
  })
}

export function grepWorkspace(files: Record<string, string>, pattern: string, glob = '') {
  let re: RegExp
  try {
    re = new RegExp(pattern, 'i')
  } catch {
    return `Invalid pattern: ${pattern}`
  }
  const globHit = glob.replace(/^\*/, '').replace(/\*$/, '')
  const lines: string[] = []
  for (const [path, content] of Object.entries(files)) {
    if (glob && globHit && !path.includes(globHit.replace(/^\./, ''))) continue
    content.split('\n').forEach((line, index) => {
      if (re.test(line)) lines.push(`${path}:${index + 1}: ${line.slice(0, 240)}`)
    })
    if (lines.length >= 80) break
  }
  return lines.length ? lines.slice(0, 80).join('\n') : 'No matches.'
}

export function runLocalTool(tool: StudioTool, files: Record<string, string>): ToolOutcome {
  const name = tool.name
  const args = tool.args || {}
  if (name === 'read') {
    const path = String(args.path || args.file || '').replace(/^\/+/, '')
    if (!path) return { name, ok: false, text: 'read needs a path' }
    if (!(path in files)) return { name, ok: false, text: `No file at ${path}. Workspace: ${Object.keys(files).slice(0, 24).join(', ') || '(empty)'}` }
    const body = files[path]
    return { name, ok: true, text: `${path} (${body.split('\n').length} lines)\n${body.slice(0, 24_000)}` }
  }
  if (name === 'grep') {
    const pattern = String(args.pattern || args.query || '')
    if (!pattern) return { name, ok: false, text: 'grep needs a pattern' }
    return { name, ok: true, text: grepWorkspace(files, pattern, String(args.glob || args.path || '')) }
  }
  if (name === 'write') {
    const path = String(args.path || '').replace(/^\/+/, '')
    const content = String(args.content || args.body || '')
    if (!path) return { name, ok: false, text: 'write needs a path' }
    return { name, ok: true, text: `Wrote ${path}`, files: { [path]: content } }
  }
  return { name, ok: false, text: `${name} runs on the server` }
}

export function formatToolResults(results: ToolOutcome[]) {
  if (results.length === 0) return ''
  return `TOOL RESULTS — continue from these. If you have enough, write files. If not, emit more tool events.\n${results
    .map((item) => `### ${item.name} ${item.ok ? 'ok' : 'failed'}\n${item.text.slice(0, 12_000)}`)
    .join('\n\n')}`
}

export function countChars(parts: string[]) {
  return parts.reduce((sum, item) => sum + (item?.length || 0), 0)
}
