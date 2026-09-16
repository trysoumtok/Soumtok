import { manifestNudgeMessage, type AgentEvent } from './agent.ts'
import { isGitPushCommand, parseSandboxCommand } from './sandboxAllow.ts'

export type StudioToolName =
  | 'read'
  | 'grep'
  | 'glob'
  | 'list_dir'
  | 'write'
  | 'diff'
  | 'terminal'
  | 'github'
  | 'fetch'
  | 'mcp'
  | 'generate_image'
  | 'examine_media'
  | 'read_lints'
  | 'task'
  | 'delete'
  | 'switch_mode'
  | 'todo_write'
  | 'git'
  | 'codebase_search'
  | 'browser'
  | 'read_skill'

export type StudioTool = Extract<AgentEvent, { kind: 'tool' }>

export type ToolOutcome = {
  name: string
  ok: boolean
  text: string
  files?: Record<string, string>
}

const INSPECT = new Set<string>([
  'read',
  'grep',
  'glob',
  'list_dir',
  'github',
  'terminal',
  'fetch',
  'mcp',
  'examine_media',
  'read_lints',
  'task',
  'git',
  'codebase_search',
  'browser',
  'read_skill',
])
const EDIT = new Set(['write', 'diff', 'edit', 'str_replace', 'replace', 'apply_patch', 'generate_image'])

export function isEditTool(name: string) {
  return EDIT.has(name)
}

function parseToolLines(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const row = item as { kind?: string; type?: string; text?: string; content?: string }
        const kind = String(row.kind || row.type || '')
        const text = String(row.text ?? row.content ?? '')
        if (!kind && !text) return null
        return { kind, text }
      })
      .filter((item): item is { kind: string; text: string } => Boolean(item))
  } catch {
    return []
  }
}

function countOccurrences(source: string, find: string) {
  if (!find) return 0
  let n = 0
  let i = 0
  while (true) {
    const j = source.indexOf(find, i)
    if (j < 0) break
    n++
    i = j + Math.max(1, find.length)
  }
  return n
}

function replaceInFile(source: string, find: string, repl: string) {
  if (!find) return null
  const n = countOccurrences(source, find)
  if (n !== 1) return null
  const at = source.indexOf(find)
  return source.slice(0, at) + repl + source.slice(at + find.length)
}

function applyDiffLines(source: string, lines: { kind: string; text: string }[]) {
  const dels = lines.filter((line) => /^(del|delete|remove|-)$/i.test(line.kind)).map((line) => line.text)
  const adds = lines.filter((line) => /^(add|insert|\+)$/i.test(line.kind)).map((line) => line.text)
  if (!dels.length && !adds.length) return null
  if (dels.length) {
    const block = replaceInFile(source, dels.join('\n'), adds.join('\n'))
    if (block != null) return block
    let next = source
    for (let i = 0; i < dels.length; i++) {
      const swapped = replaceInFile(next, dels[i], adds[i] ?? '')
      if (swapped == null) return null
      next = swapped
    }
    return next
  }
  if (adds.length && !source.includes(adds.join('\n'))) return `${source.trimEnd()}\n${adds.join('\n')}\n`
  return source
}

/** write, or a model-shaped "diff/edit" call, into a new file body. */
export function applyWorkspaceEdit(files: Record<string, string>, args: Record<string, string>, name = 'write') {
  const path = String(args.path || args.file || '').replace(/^\/+/, '')
  if (!path) return { ok: false as const, text: 'edit needs a path' }
  const full = args.content || args.body || args.source || ''
  const prev = files[path]
  const asWrite = name === 'write' || !prev
  if (full && (asWrite || full.includes('\n') || full.length > 80)) {
    return { ok: true as const, path, content: full, text: `Wrote ${path}` }
  }
  if (prev == null) {
    return {
      ok: false as const,
      text: `No file at ${path}. Workspace: ${Object.keys(files).slice(0, 24).join(', ') || '(empty)'}`,
    }
  }
  const find = args.old_string || args.search || args.find || args.old || args.from
  const repl = args.new_string ?? args.replace ?? args.new ?? args.to
  if (find && repl != null) {
    const n = countOccurrences(prev, find)
    if (n === 0) return { ok: false as const, text: `Could not find that text in ${path}` }
    if (n > 1) {
      return {
        ok: false as const,
        text: `old_string matched ${n} times in ${path} — make it unique with more surrounding lines.`,
      }
    }
    const next = replaceInFile(prev, find, repl)
    if (next == null) return { ok: false as const, text: `Could not find that text in ${path}` }
    if (next === prev) return { ok: false as const, text: `${path} already has that text` }
    return { ok: true as const, path, content: next, text: `Edited ${path}` }
  }
  const lines = parseToolLines(args.lines || args.hunk || args.patch || '')
  if (lines.length) {
    const next = applyDiffLines(prev, lines)
    if (next == null) return { ok: false as const, text: `Could not apply those diff lines to ${path}` }
    if (next === prev) return { ok: true as const, path, content: prev, text: `Kept ${path}` }
    return { ok: true as const, path, content: next, text: `Edited ${path}` }
  }
  return { ok: true as const, path, content: prev, text: `Kept ${path}` }
}

function hasEditPayload(args: Record<string, string>) {
  if (args.content || args.body || args.source) return true
  if (args.old_string || args.search || args.find || args.old || args.from) return true
  if (args.new_string || args.replace || args.new || args.to) return true
  return parseToolLines(args.lines || args.hunk || args.patch || '').length > 0
}

/** Drop feed-shaped diff calls (path + added/removed counts). Those do not edit files. */
export function skipDisplayDiffs(tools: StudioTool[]) {
  return tools.filter((tool) => {
    if (tool.name !== 'diff' && tool.name !== 'edit' && tool.name !== 'str_replace') return true
    return hasEditPayload(tool.args)
  })
}

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

/** Drop duplicate reads in the same batch. Keep the first so the user sees it. */
export function skipKnownReads(tools: StudioTool[], _files?: Record<string, string>) {
  const seen = new Set<string>()
  return tools.filter((tool) => {
    if (tool.name !== 'read') return true
    const path = String(tool.args.path || tool.args.file || '').replace(/^\/+/, '')
    if (!path) return true
    if (seen.has(path)) return false
    seen.add(path)
    return true
  })
}

export function toolsNeedAnotherRound(tools: StudioTool[]) {
  return tools.some((item) => {
    if (isEditTool(item.name)) return false
    if (item.name === 'terminal') {
      const command = item.args.command || item.args.cmd || ''
      return !/^(ls|dir|pwd|whoami|echo|cat|type|mkdir|md|touch)\b/i.test(command.trim())
    }
    return INSPECT.has(item.name)
  })
}

/** Keep going if an edit failed, or the manifest still has files to write. */
export function toolsShouldContinue(
  tools: StudioTool[],
  outcomes: ToolOutcome[] = [],
  opts?: { missing?: string[] },
) {
  if (outcomes.some((out) => !out.ok)) return true
  if (opts?.missing?.length) return true
  return toolsNeedAnotherRound(tools)
}

export function filesStamp(files: Record<string, string> = {}) {
  return JSON.stringify(Object.keys(files).sort().map((path) => [path, files[path]?.length || 0]))
}

export function filesChangedThisTurn(before: Record<string, string> = {}, after: Record<string, string> = {}) {
  const names = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const path of names) {
    if ((before[path] || '') !== (after[path] || '')) return true
  }
  return false
}

/** Coding turns must write. Chat/ask/plan may stop after a reply. */
export function runExpectsFileEdits(systemPrompt = '') {
  if (/FOLLOW-UP KIND: question/.test(systemPrompt)) return false
  if (/MODE is (chat|ask|plan)\b|\bMODE: (chat|ask|plan)\b/i.test(systemPrompt)) return false
  if (/Do not write or rewrite files/.test(systemPrompt)) return false
  if (/Intent: (chat|question|connect)\b/.test(systemPrompt)) return false
  return (
    /\bMODE: (fix|build|app|code|write|data|research)\b/.test(systemPrompt) ||
    /FOLLOW-UP KIND: task/.test(systemPrompt) ||
    /Intent: (theme|rename|edit|build)\b/.test(systemPrompt)
  )
}

const WRITE_NUDGE =
  'You read the files but did not change them. The user is still waiting. Call write or diff now with the real code. Do not reply Done. Do not only emit a summary. The run is not finished until the files on disk have actually changed.'

/** After a silent Done / no tools, send the model back to write. */
export function shouldNudgeWrite(input: {
  agent?: boolean
  round: number
  maxRounds?: number
  stillIdle: boolean
  toolCount: number
  systemPrompt?: string
  modelText?: string
  missing?: string[]
}) {
  if (!input.agent || input.toolCount > 0) return false
  const max = input.maxRounds ?? 6
  if (input.round >= max - 1) return false
  if (!runExpectsFileEdits(input.systemPrompt || '')) return false
  if (input.missing?.length) return true
  return input.stillIdle
}

export function writeNudgeMessage(missing: string[] = [], written: string[] = []) {
  if (missing.length) return manifestNudgeMessage(missing, written)
  return WRITE_NUDGE
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

function globPatternToRegExp(pattern: string) {
  const norm = pattern.replace(/\\/g, '/').replace(/^\.\//, '')
  const esc = norm.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const re = esc.replace(/\*\*/g, '§§').replace(/\*/g, '[^/]*').replace(/§§/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${re}$`, 'i')
}

function globWorkspace(files: Record<string, string>, pattern: string, limit = 200) {
  let re: RegExp
  try {
    re = globPatternToRegExp(pattern || '**/*')
  } catch {
    return 'Invalid glob pattern.'
  }
  const hits = Object.keys(files)
    .filter((key) => re.test(key.replace(/\\/g, '/')))
    .sort()
    .slice(0, limit)
  return hits.length ? hits.join('\n') : 'No matches.'
}

export function runLocalTool(tool: StudioTool, files: Record<string, string>): ToolOutcome {
  const name = tool.name
  const args = tool.args || {}
  if (name === 'read') {
    const path = String(args.path || args.file || '').replace(/^\/+/, '')
    if (!path) return { name, ok: false, text: 'read needs a path' }
    if (!(path in files)) return { name, ok: false, text: `No file at ${path}. Workspace: ${Object.keys(files).slice(0, 24).join(', ') || '(empty)'}` }
    const body = files[path]
    const all = body.split('\n')
    const total = all.length
    const from = Math.max(1, Number(args.start_line ?? args.startLine) || 1)
    const to = Math.min(total, Number(args.end_line ?? args.endLine) || total)
    const ranged = from > 1 || to < total
    const slice = ranged ? all.slice(from - 1, to).join('\n') : body
    const head = ranged ? `${path} (${total} lines) [lines ${from}-${to}]` : `${path} (${total} lines)`
    return { name, ok: true, text: `${head}\n${slice.slice(0, 24_000)}` }
  }
  if (name === 'grep') {
    const pattern = String(args.pattern || args.query || '')
    if (!pattern) return { name, ok: false, text: 'grep needs a pattern' }
    return { name, ok: true, text: grepWorkspace(files, pattern, String(args.glob || args.path || '')) }
  }
  if (name === 'glob') {
    const pattern = String(args.pattern || args.glob || '**/*')
    return { name, ok: true, text: globWorkspace(files, pattern) }
  }
  if (name === 'list_dir') {
    const dir = String(args.path || args.dir || '.').replace(/^\/+/, '').replace(/\/$/, '')
    const prefix = dir && dir !== '.' ? `${dir}/` : ''
    const names = new Set<string>()
    for (const key of Object.keys(files)) {
      const rel = key.replace(/\\/g, '/')
      if (prefix && !rel.startsWith(prefix)) continue
      const rest = prefix ? rel.slice(prefix.length) : rel
      const head = rest.split('/')[0]
      if (head) names.add(prefix ? `${prefix}${head}` : head)
    }
    const list = [...names].sort().slice(0, 200)
    return { name, ok: true, text: list.length ? list.join('\n') : '(empty)' }
  }
  if (name === 'write' || isEditTool(name)) {
    const edited = applyWorkspaceEdit(files, args, name)
    if (!edited.ok) return { name, ok: false, text: edited.text }
    return { name, ok: true, text: edited.text, files: { [edited.path]: edited.content } }
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

export function unescapeToolJson(value: string) {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

/** Pull path/content out of a tool-call argument string that may still be truncated. */
export function peekToolArgs(raw: string) {
  const args: Record<string, string> = {}
  const path = /"(?:path|file)"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw)?.[1]
  if (path) args.path = unescapeToolJson(path)
  const content = /"(?:content|body|source)"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(raw)?.[1]
  if (content) args.content = unescapeToolJson(content)
  const next = /"(?:new_string|replace|new)"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(raw)?.[1]
  if (next) args.new_string = unescapeToolJson(next)
  const command = /"(?:command|cmd)"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw)?.[1]
  if (command) args.command = unescapeToolJson(command)
  return args
}

export type ToolProgress = {
  name: string
  path?: string
  chars: number
  content?: string
}

export function liveToolProgress(calls: { name: string; args?: string; arguments?: string }[]): ToolProgress[] {
  return calls
    .filter((item) => item.name)
    .map((item) => {
      const raw = item.arguments || item.args || ''
      const parsed = peekToolArgs(raw)
      const body = parsed.content || parsed.new_string || ''
      return {
        name: item.name,
        path: parsed.path || undefined,
        chars: body.length || raw.length,
        content: body ? body.slice(0, 24_000) : undefined,
      }
    })
}

export function liveProgressStep(calls: ToolProgress[]) {
  const write = calls.find((item) => item.name === 'write' || item.name === 'diff' || item.name === 'edit')
  const read = calls.find((item) => item.name === 'read')
  const first = write || read || calls[0]
  if (!first) return 'Working'
  if (first.name === 'read') return first.path ? `Reading ${first.path}` : 'Reading files'
  if (first.name === 'write' || first.name === 'diff' || first.name === 'edit') {
    return first.path ? `Writing ${first.path}` : 'Writing the change'
  }
  if (first.name === 'terminal') return 'Running a command'
  return `Running ${first.name}`
}

/** Short result line for the feed — never dump the file body. */
export function toolResultLine(name: string, text: string) {
  const first = (text || '').split('\n')[0].trim()
  if (name === 'read') {
    const hit = /^(.+?)\s+\((\d+)\s+lines\)/.exec(first)
    if (hit) return `${hit[1]} · ${hit[2]} lines`
  }
  return first.slice(0, 88) || name
}
