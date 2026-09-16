/**
 * Credit-saving control layer: the harness does inspect/classify/git locally,
 * then every model (Flash, Fable, Auto) gets a short CONTROL packet + pruned tools.
 * Same results, far fewer tokens.
 */

import type { AgentPlan } from './agent.ts'
import type { ChatFile } from './chatMedia.ts'
import { attachmentContextBlock } from './modelWrap.ts'
import type { DesktopAgentMode } from './desktopHarness.ts'
import { modelFamilyFromId } from './modelHarness.ts'
import type { RequestAnalysis } from './requestAnalyze.ts'
import { SOUMTOK_PRODUCT_GUIDE } from './soumtokProductGuide.ts'
import type { DesktopAgentPrefs } from './desktopAgentPrefs.ts'
import { parseAgentDriver, soumtokBotDesktopExtra, type AgentDriver } from './soumtokBot.ts'

/**
 * The desktop harness already caps each tool result at 12k chars, so the newest
 * results must survive whole here. Trimming a source file below its real length
 * made the agent re-read the same paths forever, never seeing the tail it needed.
 */
export const TOOL_RESULT_RECENT_CHARS = 48_000
export const TOOL_RESULT_OLD_CHARS = 1_500
export const TOOL_RESULT_RECENT_COUNT = 2
export const TOOL_DIGEST_MAX_CHARS = 12_000
export const GIT_SNAPSHOT_CHARS = 800
export const SCAN_FILE_CHARS = 1800

const BUILD_TOOLS = [
  'list_dir',
  'read',
  'write',
  'diff',
  'grep',
  'glob',
  'codebase_search',
  'terminal',
  'read_terminal',
  'todo_write',
  'browser',
  'read_lints',
  'delete',
  'attempt_completion',
  'wipe_workspace',
  'generate_image',
] as const

const FIX_TOOLS = [
  'read',
  'grep',
  'glob',
  'list_dir',
  'diff',
  'write',
  'delete',
  'terminal',
  'read_terminal',
  'codebase_search',
  'browser',
  'read_lints',
  'todo_write',
  'attempt_completion',
  'git',
  'generate_image',
  'examine_media',
] as const

const ASK_TOOLS = ['read', 'grep', 'glob', 'list_dir', 'codebase_search', 'read_lints', 'git', 'examine_media'] as const
const IMAGE_TOOLS = ['generate_image', 'examine_media', 'todo_write', 'attempt_completion'] as const
const RUN_TOOLS = [
  'read',
  'grep',
  'glob',
  'list_dir',
  'write',
  'diff',
  'terminal',
  'read_terminal',
  'browser',
  'read_lints',
  'todo_write',
  'attempt_completion',
  'generate_image',
] as const

/** Always in agent mode (except wipe). Intent is advisory — never strip read/edit/search. */
const CORE_AGENT_TOOLS = [
  'read',
  'grep',
  'glob',
  'list_dir',
  'diff',
  'write',
  'terminal',
  'read_terminal',
  'codebase_search',
  'todo_write',
  'read_lints',
  'delete',
  'attempt_completion',
  'generate_image',
  'examine_media',
  'ask_question',
  'switch_mode',
] as const

function mergeCoreAgentTools(names: string[]) {
  const out = [...names]
  for (const n of CORE_AGENT_TOOLS) {
    if (!out.includes(n)) out.push(n)
  }
  return out
}

const DEBUG_TOOLS = [
  'read',
  'grep',
  'glob',
  'list_dir',
  'codebase_search',
  'read_lints',
  'terminal',
  'read_terminal',
  'todo_write',
  'attempt_completion',
  'ask_question',
  'git',
  'examine_media',
  'fetch',
] as const

export function toolsForIntent(input: {
  kind?: string
  uiMode?: DesktopAgentMode
  prefs?: Partial<DesktopAgentPrefs> | null
}): string[] {
  const kind = String(input.kind || 'chat')
  const ui = input.uiMode || 'agent'
  if (ui === 'debug') return [...DEBUG_TOOLS]
  if (ui === 'ask' || ui === 'plan') return [...ASK_TOOLS, 'ask_question', 'switch_mode']
  let names: string[]
  if (kind === 'wipe') {
    names = ['wipe_workspace', 'list_dir', 'delete', 'git', 'read']
  } else if (kind === 'image') {
    names = [...IMAGE_TOOLS]
  } else if (kind === 'chat') {
    names = ['fetch', 'generate_image', 'examine_media', 'attempt_completion']
  } else if (kind === 'question') {
    names = ['read', 'grep', 'glob', 'codebase_search', 'examine_media', 'fetch', 'attempt_completion']
  } else {
    names = mergeCoreAgentTools([
      ...BUILD_TOOLS,
      ...FIX_TOOLS,
      ...RUN_TOOLS,
      'fetch',
      'mcp',
      'git',
      'read_skill',
      'task',
      'browser',
    ]).filter((n) => n !== 'wipe_workspace')
  }
  if (input.prefs?.browserVerify === false) names = names.filter((n) => n !== 'browser')
  if (input.prefs?.codebaseSearch === false) names = names.filter((n) => n !== 'codebase_search')
  if (input.prefs?.skillsEnabled === false) names = names.filter((n) => n !== 'read_skill')
  if (input.prefs?.mcpConnectors === false) names = names.filter((n) => n !== 'mcp')
  return names
}

export function compactGitSnapshot(text?: string) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  if (raw.length <= GIT_SNAPSHOT_CHARS) return raw
  return `${raw.slice(0, GIT_SNAPSHOT_CHARS)}\n…(git truncated)`
}

function hashSnippet(text: string) {
  let h = 0
  const s = String(text || '')
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(16).slice(0, 8)
}

/** Old tool rows become a hash + finding, not a blunt 12k crush of every result. */
export function summarizeToolResult(name: string | undefined, content: string) {
  const n = String(name || 'tool').toLowerCase()
  const c = String(content || '')
  const h = hashSnippet(c)
  const size = c.length < 1024 ? `${c.length} chars` : `${Math.max(1, Math.round(c.length / 1024))} KB`
  const first = c.split('\n')[0].trim().slice(0, 180)
  if (/KNOWN FILES \(harness already searched|SCAFFOLD ON DISK/i.test(c)) {
    return c.length <= 8000 ? c : `${c.slice(0, 8000)}\n…(atlas truncated)`
  }
  if (/^(write|diff|edit|str_replace|apply_patch|delete|wipe_workspace)$/.test(n)) {
    return `${n}: ${first || c.slice(0, 200)} (hash ${h})`
  }
  if (n === 'read' || n === 'read_file') {
    return `Read ${first || 'file'} (${size}, hash ${h}). Call read({ path, start_line, end_line }) for a range — do not re-read the whole file.`
  }
  if (n === 'grep' || n === 'glob' || n === 'codebase_search' || n === 'list_dir') {
    const lines = c.split('\n').filter((line) => line.trim())
    return `${n}: ${lines.length} line(s) (${size}, hash ${h}). First: ${(lines[0] || '(none)').slice(0, 160)}`
  }
  if (n === 'terminal' || n === 'read_terminal' || n === 'read_lints') {
    return `${n} (${size}, hash ${h}): …${c.slice(-360).replace(/\s+/g, ' ').trim()}`
  }
  return `${n} (${size}, hash ${h}): ${c.slice(0, 280)}`
}

export function compactToolContent(text: string, fromEnd: number, name?: string) {
  const s = String(text || '')
  if (/KNOWN FILES \(harness already searched|SCAFFOLD ON DISK/i.test(s)) {
    if (s.length <= 8000) return s
    return `${s.slice(0, 8000)}\n…(atlas truncated)`
  }
  if (fromEnd >= TOOL_RESULT_RECENT_COUNT) {
    return summarizeToolResult(name, s)
  }
  const max = TOOL_RESULT_RECENT_CHARS
  if (s.length <= max) return s
  const head = Math.max(240, Math.floor(max * 0.7))
  const tail = Math.max(160, max - head)
  return `${s.slice(0, head)}\n…(middle trimmed by Soumtok to save credits — call read({ path, start_line, end_line }) for an exact range instead of re-reading the whole file)\n${s.slice(-tail)}`
}

const RE_READ_TOOLS = new Set(['read', 'read_file'])

/** Identical repeat reads key on their `path (N lines)` header so stale copies can go. */
function toolDumpKey(item: { content?: string; name?: string }) {
  if (!RE_READ_TOOLS.has(String(item.name || '').toLowerCase())) return ''
  const first = String(item.content || '').split('\n')[0].trim()
  if (!/\(\d+\s+lines\)/.test(first)) return ''
  return first
}

function supersededNote(header: string) {
  return `[${header.slice(0, 140)} — identical read repeated; the newer copy is below. Do not read this path again.]`
}

function looksLikeToolDump(item: { role?: string; content?: string; name?: string }) {
  if (item.role === 'tool') return true
  const c = String(item.content || '')
  return (
    item.role === 'user' &&
    (/Tool results on the user's machine/i.test(c) || /^\[[a-z_][a-z0-9_]*\]\n/i.test(c))
  )
}

const ROUND_COLLAPSE_AFTER = 10
const ROUND_KEEP_RECENT = 4

function isHarnessUser(content: string) {
  return /^\[Soumtok (harness|steer)/i.test(content)
}

function isLiveUserTurn(item: { role?: string; content?: string }) {
  return item.role === 'user' && !isHarnessUser(String(item.content || ''))
}

function countLiveUserRounds(messages: { role?: string; content?: string }[]) {
  return messages.filter((m) => isLiveUserTurn(m)).length
}

/** After many rounds, collapse older history into a short decision log. */
export function summarizeOldRoundsIfNeeded<
  T extends { role?: string; content?: string; name?: string; tool_calls?: unknown[] },
>(messages: T[]): T[] {
  const src = Array.isArray(messages) ? messages : []
  if (countLiveUserRounds(src) < ROUND_COLLAPSE_AFTER) return src.map((m) => ({ ...m }))

  const system: T[] = []
  let i = 0
  while (i < src.length && src[i].role === 'system') {
    system.push({ ...src[i] })
    i += 1
  }
  const body = src.slice(i).map((m) => ({ ...m }))
  const rounds: T[][] = []
  let cur: T[] = []
  for (const m of body) {
    if (isLiveUserTurn(m) && cur.length) {
      rounds.push(cur)
      cur = [m]
    } else {
      cur.push(m)
    }
  }
  if (cur.length) rounds.push(cur)
  if (rounds.length < ROUND_COLLAPSE_AFTER) return src.map((m) => ({ ...m }))

  const old = rounds.slice(0, -ROUND_KEEP_RECENT)
  const recent = rounds.slice(-ROUND_KEEP_RECENT)
  const summaryLines = old.map((round, idx) => {
    const parts = [`--- Round ${idx + 1} ---`]
    for (const m of round) {
      if (m.role === 'user') parts.push(`User: ${String(m.content || '').slice(0, 180)}`)
      if (m.role === 'assistant') {
        const tc = Array.isArray(m.tool_calls) && m.tool_calls.length ? `[${m.tool_calls.length} tool call(s)]` : ''
        parts.push(`Assistant: ${String(m.content || tc).slice(0, 180)}`)
      }
      if (m.role === 'tool') parts.push(summarizeToolResult(m.name, String(m.content || '')))
    }
    return parts.join('\n')
  })
  const summary = {
    role: 'user',
    content: `[Soumtok harness] Earlier rounds (${old.length}) compressed — decision history only:\n${summaryLines.join('\n\n')}`,
  } as T
  return [...system, summary, ...recent.flat()]
}

export function compactConversation<T extends { role?: string; content?: string; name?: string }>(messages: T[]): T[] {
  const list = summarizeOldRoundsIfNeeded(Array.isArray(messages) ? messages.map((m) => ({ ...m })) : [])
  let toolSeen = 0
  const seenRead = new Set<string>()
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i]
    if (looksLikeToolDump(item)) {
      const key = toolDumpKey(item)
      // Walking backwards, the first copy we meet is the newest. Older identical
      // reads carry nothing new, so they collapse instead of eating the budget.
      if (key && seenRead.has(key)) {
        item.content = supersededNote(key)
        continue
      }
      if (key) seenRead.add(key)
      item.content = compactToolContent(String(item.content || ''), toolSeen, item.name)
      toolSeen++
      continue
    }
    if (item.role === 'assistant' && String(item.content || '').length > 2400 && i < list.length - 3) {
      item.content = `${String(item.content).slice(0, 1400)}\n…(older reply truncated)`
    }
  }
  const out: T[] = []
  const seenHarness = new Set<string>()
  for (const item of list) {
    const c = String(item.content || '')
    if (item.role === 'user' && /^\[Soumtok harness\]/i.test(c)) {
      const key = c.slice(0, 120)
      if (seenHarness.has(key)) continue
      seenHarness.add(key)
    }
    out.push(item)
  }
  return out
}

export function estimatePayloadChars(messages: { content?: string }[]) {
  return (messages || []).reduce((n, m) => n + String(m.content || '').length, 0)
}

function familyHint(model?: string) {
  const family = modelFamilyFromId(model)
  if (family === 'deepseek') return 'DeepSeek: never emit <write> XML. First build round is write().'
  if (family === 'openai') return 'OpenAI: tight diff old_string/new_string. First build round is write().'
  if (family === 'anthropic') return 'Claude: keep calling tools until files exist and localhost is verified.'
  if (family === 'xai') return 'Grok: use write/diff/terminal; do not dump a spec as the only reply.'
  if (family === 'google') return 'Gemini: JSON tool calls only; chat code is not a file.'
  return 'Any model: JSON tools only. Chat code is not a file.'
}

export function compactControlSystem(input: {
  workspaceRoot?: string
  openFiles?: string[]
  branch?: string
  mode?: DesktopAgentMode
  driver?: AgentDriver
  files?: ChatFile[]
  plan: AgentPlan
  analysis: RequestAnalysis
  enabledTools?: string[]
  model?: string
  userText?: string
  gitSnapshot?: string
  knownFiles?: string
}): string {
  const uiMode = input.mode || 'agent'
  const kind = input.analysis.kind
  const root = input.workspaceRoot || '(open a folder first)'
  const open = input.openFiles?.length ? input.openFiles.join(', ') : 'none'
  const tools = (input.enabledTools || []).join(', ') || 'none'
  const pin = String(input.userText || '').trim()
  const job = pin || input.plan.goal || input.analysis.meaning
  const doLines = (input.analysis.do || []).slice(0, 4).map((d) => `- ${d}`).join('\n')
  const dontLines = (input.analysis.dont || []).slice(0, 4).map((d) => `- ${d}`).join('\n')
  const stepLine = (input.plan.steps || []).filter(Boolean).slice(0, 6).join(' → ')
  const doneWhen = (input.plan.deliverables || []).filter(Boolean).slice(0, 4).join('; ')
  const mustLine = (input.plan.mustHave || []).filter(Boolean).slice(0, 4).join('; ')
  const modeLine =
    uiMode === 'ask'
      ? 'MODE: ask — read only unless they ask to apply.'
      : uiMode === 'plan'
        ? 'MODE: plan — inspect, do not write until they confirm.'
        : uiMode === 'debug'
          ? 'MODE: debug — gather runtime evidence (logs, terminal, reads). Hypothesize, test, fix. No speculative rewrites without evidence.'
          : 'MODE: agent — tools until the user request is done.'
  const product =
    kind === 'chat' || kind === 'connect' || kind === 'question' ? SOUMTOK_PRODUCT_GUIDE : ''
  const attach = input.files?.length ? attachmentContextBlock(input.files) : ''
  const driver = parseAgentDriver(input.driver)
  const bot = soumtokBotDesktopExtra(driver)
  const git = compactGitSnapshot(input.gitSnapshot)

  const body = [
    'You are Soumtok Agent. Do the USER ASKED job in this WORKSPACE with JSON tools.',
    modeLine,
    `WORKSPACE: ${root}`,
    `OPEN: ${open}`,
    input.branch ? `GIT BRANCH: ${input.branch}` : '',
    `TOOLS: ${tools}`,
    'CONTROL:',
    'UNDERSTAND FIRST: read the user request (typos still count). Then execute only that job.',
    kind === 'image'
      ? 'Intent: image — generate_image NOW. Do not list_dir, read, grep, or scan the project.'
      : kind === 'chat'
        ? 'Intent: chat — answer from knowledge. Do not list_dir, read, or grep unless they asked about this project.'
        : kind === 'question'
          ? 'Intent: question — understand first, then read only the files needed to answer. Do not write or explore the whole tree.'
        : `Intent: ${kind} (advisory — you still have read/edit/search tools)`,
    `Job: ${job}`,
    input.analysis.where ? `Where: ${input.analysis.where}` : '',
    stepLine ? `Steps: ${stepLine}` : '',
    doneWhen ? `Done when: ${doneWhen}` : '',
    mustLine ? `Must: ${mustLine}` : '',
    doLines ? `Do:\n${doLines}` : '',
    dontLines ? `Don't:\n${dontLines}` : '',
    git ? `GIT:\n${git}` : '',
    input.knownFiles ? input.knownFiles : '',
    'RULES: JSON function tools only. Chat/XML code is not a file. Stay in WORKSPACE. Windows PowerShell: ; not &&. Misspellings still count — follow ANALYZED REQUEST and call the matching tool. After tool results, either call the next tool or answer the user — do not wait for permission or a hidden harness message. After you finish, tell the user what happened (paths, URL). Never say sandboxed.',
    familyHint(input.model),
    bot,
    product,
    attach,
  ]
    .filter(Boolean)
    .join('\n')

  if (!pin) return body
  return `${body}\n\nLIVE USER REQUEST (highest priority — do this now):\n${pin}`
}

const DESKTOP_HARNESS_MARKERS = [
  'PROJECT BRIEF',
  'PROJECT RULES (from this repo',
  'SOUMTOK PLATFORM CONTEXT',
  'SOUMTOK DO WORK NOW',
  'SOUMTOK CONTINUE NOW',
  'TASK LEDGER',
  'SCAFFOLD ON DISK',
  'KNOWN FILES (harness already searched',
  'SOUMTOK BUILD DIRECTOR',
  'SOUMTOK MESSY WORKSPACE RECOVERY',
  'SOUMTOK LOOP',
  'SOUMTOK THINK FIRST',
  'SOUMTOK TASK INTENT',
  'SOUMTOK VISUAL EDIT',
  'SOUMTOK WORKSPACE WIPE',
  'SOUMTOK IMAGE NOW',
  'SOUMTOK STEER',
  'SOUMTOK RUN STATE',
  'SOUMTOK PREVIEW RUN',
  'WORKSPACE SCAN',
  'DEV SCRIPTS (run with terminal',
  'SKILLS (read_skill',
]

/** Keep Desktop harness blocks when /api/studio rebuilds CONTROL — otherwise atlas/scaffold never reach the model. */
export function extractDesktopHarnessBlocks(prevSys?: string) {
  const src = String(prevSys || '')
  if (!src) return ''
  const hits: { marker: string; i: number }[] = []
  for (const marker of DESKTOP_HARNESS_MARKERS) {
    const i = src.indexOf(marker)
    if (i < 0) continue
    hits.push({ marker, i })
  }
  if (!hits.length) return ''
  hits.sort((a, b) => a.i - b.i)
  const chunks: string[] = []
  for (let n = 0; n < hits.length; n++) {
    const start = hits[n].i
    const end = n + 1 < hits.length ? hits[n + 1].i : src.length
    let chunk = src.slice(start, end).trim()
    if (chunk.length > 7500) chunk = `${chunk.slice(0, 7500)}\n…(harness block truncated)`
    chunks.push(chunk)
  }
  let out = chunks.join('\n\n')
  if (out.length > 32_000) out = `${out.slice(0, 32_000)}\n…(harness context truncated)`
  return out
}

function stripLiveUserPin(sys: string) {
  return String(sys || '')
    .replace(/\n*LIVE USER REQUEST \(highest priority[\s\S]*$/i, '')
    .trim()
}

function controlCore(sys: string) {
  const src = stripLiveUserPin(sys)
  let end = src.length
  for (const marker of DESKTOP_HARNESS_MARKERS) {
    const i = src.indexOf(marker)
    if (i >= 0 && i < end) end = i
  }
  return src.slice(0, end).trim()
}

function fingerprintText(text: string) {
  const s = String(text || '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return `${s.length}:${Math.abs(h).toString(16)}`
}

/**
 * Reuse the previous CONTROL packet when it has not changed.
 * Avoids rebuilding + re-truncating atlas/scaffold every round.
 */
export function mergeDesktopSystem(prevSys: string | undefined, nextControl: string, userText?: string) {
  const pin = String(userText || '').trim()
  const nextBody = stripLiveUserPin(nextControl)
  const prev = String(prevSys || '')
  const prevBody = stripLiveUserPin(prev)
  const sameControl =
    Boolean(prevBody) && fingerprintText(controlCore(prevBody)) === fingerprintText(controlCore(nextBody))
  let merged
  const harness = extractDesktopHarnessBlocks(prev)
  if (sameControl) {
    const core = controlCore(prevBody) || nextBody
    merged = harness ? `${core}\n\n${harness}` : core
  } else {
    merged = harness ? `${nextBody}\n\n${harness}` : nextBody
  }
  merged = merged.replace(/\n{3,}/g, '\n\n').trim()
  if (!pin) return merged
  return `${merged}\n\nLIVE USER REQUEST (highest priority — do this now):\n${pin}`
}
