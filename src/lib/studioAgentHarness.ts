import type { AskQuestion } from '../../shared/agent'
import type { ChatFile } from '../../shared/chatMedia'
import { maxToolRoundsForPrefs, type DesktopAgentPrefs } from '../../shared/desktopAgentPrefs'
import type { DesktopAgentMode } from '../../shared/desktopHarness'
import { openaiToolCalls, studioToolsFromNative, type NativeToolCall } from '../../shared/nativeTools'
import type { AgentDriver } from '../../shared/soumtokBot'
import { friendlyStreamError } from '../../shared/streamDrop'
import { shortenAgentStatus } from '../../shared/toolFeed'
import {
  filesChangedThisTurn,
  formatToolResults,
  isEditTool,
  shouldNudgeWrite,
  type StudioTool,
  writeNudgeMessage,
} from '../../shared/tools'
import type { StudioRun } from './api'

export type StudioAgentMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  files?: ChatFile[]
  tool_calls?: ReturnType<typeof openaiToolCalls>
  tool_call_id?: string
  name?: string
}

export type StudioHarnessAskEvent = {
  id: string
  title: string
  intro: string
  questions: AskQuestion[]
}

export type StudioHarnessTodo = { id?: string; content?: string; status?: string }

export type StudioAgentHarnessCallbacks = {
  onText?: (text: string) => void
  onStatus?: (text: string) => void
  onRound?: (text: string, round: number) => void
  onTools?: (tools: { name: string; args: Record<string, string> }[]) => void
  onResult?: (result: {
    name: string
    ok: boolean
    text: string
    files?: Record<string, string>
    deleted?: string[]
    command?: string
  }) => void
  onAsk?: (event: StudioHarnessAskEvent) => void
  onTodo?: (todos: StudioHarnessTodo[], merge: boolean) => void
  onModeSwitch?: (target: DesktopAgentMode, explanation: string) => void
}

export type StudioAgentHarnessInput = {
  model: string
  mode: DesktopAgentMode
  messages: StudioAgentMessage[]
  files: Record<string, string>
  workspaceRoot?: string
  openFiles?: string[]
  repo?: string
  agentPrefs?: DesktopAgentPrefs | Record<string, unknown>
  analysisKind?: string
  /** Thread memory, workspace snapshot, and analyzed request — same block Desktop injects. */
  contextPrompt?: string
  signal?: AbortSignal
  maxRounds?: number
  driver?: AgentDriver
} & StudioAgentHarnessCallbacks

type RoundResponse = {
  text?: string
  toolCalls?: NativeToolCall[]
  model?: string
  error?: string
  thought?: string
  intent?: string
  wrapNote?: string
  promptTokens?: number
  completionTokens?: number
}

const WRITE_TOOLS = /^(write|diff|edit|str_replace|replace|apply_patch|delete|wipe_workspace|clear_workspace|generate_image)$/i
const INTERACTIVE = new Set(['ask_question', 'askquestion', 'switch_mode', 'todo_write', 'attempt_completion', 'finish'])
const askWaiters = new Map<string, (answers: Record<string, string[]>) => void>()

export function resolveStudioAskReply(askId: string, answers: Record<string, string[]>) {
  const id = String(askId || '')
  const resolve = askWaiters.get(id)
  if (!resolve) return false
  askWaiters.delete(id)
  resolve(answers && typeof answers === 'object' ? answers : {})
  return true
}

function waitForAskReply(askId: string, signal?: AbortSignal) {
  return new Promise<Record<string, string[]>>((resolve, reject) => {
    const id = String(askId || '')
    if (!id) {
      reject(new Error('Missing ask id'))
      return
    }
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    askWaiters.set(id, resolve)
    const onAbort = () => {
      askWaiters.delete(id)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function formatHarnessAskReply(questions: AskQuestion[], answers: Record<string, string[]>) {
  const lines = ['User answers:']
  for (const q of questions) {
    const picked = answers?.[q.id] || []
    lines.push(`Q: ${q.prompt}`)
    lines.push(`A: ${Array.isArray(picked) ? picked.join(', ') : picked || '(skipped)'}`)
  }
  return lines.join('\n')
}

function isPlanPath(path: string) {
  const norm = path.replace(/\\/g, '/').toLowerCase()
  return norm.endsWith('plan.md') || norm.includes('/plan.md') || norm.endsWith('canvas.md')
}

function editPathFromArgs(args: Record<string, string>) {
  return String(args.path || args.file || '').replace(/^\/+/, '')
}

function parseJsonArray(raw: unknown) {
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function applyDeleted(files: Record<string, string>, deleted?: string[]) {
  if (!deleted?.length) return files
  const next = { ...files }
  for (const path of deleted) delete next[path]
  return next
}

async function postAgentRound(body: Record<string, unknown>, signal?: AbortSignal) {
  const paths = ['/api/studio/desktop/agent/round', '/api/desktop/agent/round']
  let last: { ok: boolean; status: number; data: RoundResponse } = { ok: false, status: 404, data: {} }
  for (const path of paths) {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    const data = (await res.json().catch(() => ({}))) as RoundResponse
    last = { ok: res.ok, status: res.status, data }
    if (res.status !== 404) return last
  }
  return last
}

async function runServerTools(
  tools: StudioTool[],
  files: Record<string, string>,
  repo: string | undefined,
  agentPrefs: DesktopAgentPrefs | Record<string, unknown> | undefined,
  signal?: AbortSignal,
) {
  const res = await fetch('/api/studio/tools/run', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tools, files, repo, agentPrefs }),
    signal,
  })
  const data = (await res.json().catch(() => ({}))) as {
    error?: string
    files?: Record<string, string>
    outcomes?: { name: string; ok: boolean; text: string; files?: Record<string, string>; deleted?: string[] }[]
    followUp?: string
  }
  if (!res.ok) throw new Error(data.error || 'Tool run failed')
  return data
}

function stripSystem(messages: StudioAgentMessage[]) {
  return messages.filter((item) => item.role !== 'system')
}

/** Same round loop as Soumtok Desktop — server prepares the harness; tools run in Studio sandbox. */
export async function runStudioAgentHarness(input: StudioAgentHarnessInput): Promise<
  StudioRun & { files?: Record<string, string> }
> {
  const prefs = (input.agentPrefs || {}) as DesktopAgentPrefs
  const maxRounds = input.maxRounds ?? maxToolRoundsForPrefs(input.driver ?? 'ide', prefs)
  const work = stripSystem(input.messages).map((item) => ({ ...item }))
  let files = { ...input.files }
  let lastText = ''
  let promptTokens = 0
  let completionTokens = 0
  let todos: StudioHarnessTodo[] = []
  let attemptedCompletion = false
  let completionText = ''

  for (let round = 0; round < maxRounds; round++) {
    if (input.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    input.onStatus?.(round === 0 ? 'Thinking…' : `Working · step ${round + 1}…`)

    const res = await postAgentRound(
      {
        model: input.model,
        mode: input.mode,
        driver: input.driver ?? 'ide',
        messages: work,
        workspaceRoot: input.workspaceRoot || input.repo || 'studio-sandbox',
        openFiles: input.openFiles,
        repo: input.repo,
        agentPrefs: input.agentPrefs,
        analysisKind: input.analysisKind,
        contextPrompt: input.contextPrompt,
        hasWorkspaceFiles: Object.keys(files).length > 0,
        runtime: 'studio-web',
        client: 'studio-web',
        files: round === 0 ? work.at(-1)?.files : undefined,
      },
      input.signal,
    )

    if (res.status === 401) throw new Error('Sign in with your Soumtok account.')
    if (res.status === 403) throw new Error('Finish account setup first.')
    if (!res.ok || res.data.error) {
      throw new Error(friendlyStreamError(res.data.error || 'Agent request failed'))
    }

    const { text, toolCalls, thought, intent, wrapNote } = res.data
    lastText = text || lastText
    promptTokens += res.data.promptTokens || 0
    completionTokens += res.data.completionTokens || 0

    if (thought) input.onStatus?.(shortenAgentStatus(thought))
    else if (intent && round === 0) input.onStatus?.(shortenAgentStatus(`Intent: ${String(intent).replace(/_/g, ' ')}`))
    if (wrapNote && round === 0) input.onStatus?.(shortenAgentStatus(wrapNote))

    if (lastText) {
      input.onText?.(lastText)
      input.onRound?.(lastText, round)
    }

    const calls = toolCalls || []
    if (!calls.length) {
      if (
        shouldNudgeWrite({
          agent: input.mode === 'agent',
          round,
          maxRounds,
          stillIdle: !filesChangedThisTurn(input.files, files),
          toolCount: 0,
        })
      ) {
        work.push({ role: 'user', content: writeNudgeMessage() })
        continue
      }
      return { text: lastText, promptTokens, completionTokens, files }
    }

    const tools = studioToolsFromNative(calls)
    input.onTools?.(tools.map((item) => ({ name: item.name, args: item.args })))

    const filesBefore = { ...files }
    type Outcome = { name: string; ok: boolean; text: string; files?: Record<string, string>; deleted?: string[] }
    const outcomes: Outcome[] = new Array(tools.length)
    const serverBatch: { index: number; tool: StudioTool }[] = []

    async function flushServerBatch() {
      if (!serverBatch.length) return
      const batch = [...serverBatch]
      serverBatch.length = 0
      const ran = await runServerTools(
        batch.map((item) => item.tool),
        files,
        input.repo,
        input.agentPrefs,
        input.signal,
      )
      files = { ...(ran.files || files) }
      ;(ran.outcomes || []).forEach((out, batchIndex) => {
        const { index, tool } = batch[batchIndex]
        files = applyDeleted(files, out.deleted)
        if (out.files) files = { ...files, ...out.files }
        outcomes[index] = out
        input.onResult?.({
          name: out.name,
          ok: out.ok,
          text: out.text,
          files: out.files,
          deleted: out.deleted,
          command: tool.args.command || tool.args.cmd,
        })
      })
    }

    for (let index = 0; index < tools.length; index++) {
      const tool = tools[index]
      const n = tool.name.toLowerCase()
      const args = tool.args || {}
      const uiMode = String(input.mode || 'agent').toLowerCase()

      if ((uiMode === 'plan' || uiMode === 'ask') && WRITE_TOOLS.test(n)) {
        const rel = editPathFromArgs(args)
        const planDocOk = uiMode === 'plan' && isPlanPath(rel)
        if (!planDocOk) {
          await flushServerBatch()
          const blocked = {
            name: tool.name,
            ok: false,
            text: `${tool.name} is blocked in ${uiMode} mode. Use switch_mode(agent) after the user confirms, or ask_question to clarify first.`,
          }
          outcomes[index] = blocked
          input.onResult?.({ ...blocked, command: args.command || args.cmd })
          continue
        }
      }

      if (INTERACTIVE.has(n)) {
        await flushServerBatch()
        if (n === 'ask_question' || n === 'askquestion') {
          const questions = parseJsonArray(args.questions) as AskQuestion[]
          if (!questions.length) {
            const bad = { name: tool.name, ok: false, text: 'ask_question needs questions: JSON array of {id, prompt, options:[{id,label}]}' }
            outcomes[index] = bad
            input.onResult?.(bad)
            continue
          }
          const askId = `ask_${crypto.randomUUID()}`
          input.onAsk?.({
            id: askId,
            title: String(args.title || 'Quick question'),
            intro: String(args.intro || ''),
            questions,
          })
          let answers: Record<string, string[]> = {}
          try {
            answers = await waitForAskReply(askId, input.signal)
          } catch {
            const cancelled = { name: tool.name, ok: false, text: 'User cancelled the question.' }
            outcomes[index] = cancelled
            input.onResult?.(cancelled)
            continue
          }
          const reply = formatHarnessAskReply(questions, answers)
          const ok = { name: tool.name, ok: true, text: reply }
          outcomes[index] = ok
          input.onResult?.(ok)
          continue
        }

        if (n === 'switch_mode') {
          const target = String(args.target_mode_id || args.mode || 'agent').toLowerCase()
          const mode = (['plan', 'ask', 'debug', 'agent'].includes(target) ? target : 'agent') as DesktopAgentMode
          input.onModeSwitch?.(mode, String(args.explanation || ''))
          const ok = {
            name: tool.name,
            ok: true,
            text: `Mode switch requested: ${mode}. Continue with ${mode === 'plan' || mode === 'ask' ? 'read-only' : mode === 'debug' ? 'debug/evidence' : 'full'} tools.`,
          }
          outcomes[index] = ok
          input.onResult?.(ok)
          continue
        }

        if (n === 'todo_write') {
          const incoming = parseJsonArray(args.todos) as StudioHarnessTodo[]
          const merge = args.merge !== 'false' && args.merge !== false
          if (merge && todos.length) {
            const byId = new Map(todos.map((item) => [String(item.id || item.content), item]))
            for (const item of incoming) byId.set(String(item.id || item.content), { ...byId.get(String(item.id || item.content)), ...item })
            todos = [...byId.values()]
          } else {
            todos = incoming
          }
          input.onTodo?.(todos, merge)
          const summary = todos.map((item) => `- [${item.status || 'pending'}] ${item.content || item.id}`).join('\n')
          const ok = { name: tool.name, ok: true, text: summary || 'Todos updated' }
          outcomes[index] = ok
          input.onResult?.(ok)
          continue
        }

        if (n === 'attempt_completion' || n === 'finish') {
          const summary = String(args.result || args.summary || args.text || args.evidence || '').trim()
          const changed = filesChangedThisTurn(filesBefore, files)
          const hasStaticPreview = Boolean(files['index.html'] || files['public/index.html'])
          if (!changed && input.mode === 'agent' && !hasStaticPreview) {
            const bad = {
              name: tool.name,
              ok: false,
              text: `Not complete — workspace files did not change.${summary ? ` (${summary.slice(0, 240)})` : ''} Keep using tools until files actually change.`,
            }
            outcomes[index] = bad
            input.onResult?.(bad)
            continue
          }
          attemptedCompletion = true
          completionText = summary || 'Task marked complete.'
          const ok = { name: tool.name, ok: true, text: completionText }
          outcomes[index] = ok
          input.onResult?.(ok)
          continue
        }
      }

      serverBatch.push({ index, tool })
    }

    await flushServerBatch()

    const resolvedOutcomes = outcomes.filter((item): item is Outcome => Boolean(item))

    work.push({
      role: 'assistant',
      content: text || '',
      tool_calls: openaiToolCalls(calls),
    })
    outcomes.forEach((out, index) => {
      if (!out) return
      work.push({
        role: 'tool',
        tool_call_id: calls[index]?.id,
        name: out.name,
        content: out.text.slice(0, 12_000),
      })
    })

    if (attemptedCompletion) {
      return { text: lastText, promptTokens, completionTokens, files, completionText: completionText || undefined }
    }

    const followUp = formatToolResults(resolvedOutcomes)
    if (followUp) work.push({ role: 'user', content: followUp })

    if (
      shouldNudgeWrite({
        agent: input.mode === 'agent',
        round,
        maxRounds,
        stillIdle: !filesChangedThisTurn(filesBefore, files),
        toolCount: tools.length,
      })
    ) {
      work.push({ role: 'user', content: writeNudgeMessage() })
    }
  }

  return { text: lastText, promptTokens, completionTokens, files, completionText: completionText || undefined }
}
