import type { ChatFile } from '../../shared/chatMedia'
import type { DesktopAgentMode } from '../../shared/desktopHarness'
import type { AgentDriver } from '../../shared/soumtokBot'
import { openaiToolCalls, studioToolsFromNative, type NativeToolCall } from '../../shared/nativeTools'
import { friendlyStreamError } from '../../shared/streamDrop'
import type { StudioRun } from './api'

export type StudioAgentMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  files?: ChatFile[]
  tool_calls?: ReturnType<typeof openaiToolCalls>
  tool_call_id?: string
  name?: string
}

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
    command?: string
  }) => void
}

export type StudioAgentHarnessInput = {
  model: string
  mode: DesktopAgentMode
  messages: StudioAgentMessage[]
  files: Record<string, string>
  workspaceRoot?: string
  openFiles?: string[]
  repo?: string
  agentPrefs?: Record<string, unknown>
  analysisKind?: string
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

async function runTools(
  tools: ReturnType<typeof studioToolsFromNative>,
  files: Record<string, string>,
  repo?: string,
  signal?: AbortSignal,
) {
  const res = await fetch('/api/studio/tools/run', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tools, files, repo }),
    signal,
  })
  const data = (await res.json().catch(() => ({}))) as {
    error?: string
    files?: Record<string, string>
    outcomes?: { name: string; ok: boolean; text: string; files?: Record<string, string> }[]
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
  const maxRounds = input.maxRounds ?? 12
  const work = stripSystem(input.messages).map((item) => ({ ...item }))
  let files = { ...input.files }
  let lastText = ''
  let promptTokens = 0
  let completionTokens = 0

  for (let round = 0; round < maxRounds; round++) {
    if (input.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    input.onStatus?.(round === 0 ? 'Soumtok Agent is thinking…' : `Working · step ${round + 1}…`)

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

    if (thought) input.onStatus?.(thought)
    else if (intent && round === 0) input.onStatus?.(`Intent: ${String(intent).replace(/_/g, ' ')}`)
    if (wrapNote && round === 0) input.onStatus?.(wrapNote)

    if (lastText) {
      input.onText?.(lastText)
      input.onRound?.(lastText, round)
    }

    const calls = toolCalls || []
    if (!calls.length) {
      return { text: lastText, promptTokens, completionTokens, files }
    }

    const tools = studioToolsFromNative(calls)
    input.onTools?.(tools.map((item) => ({ name: item.name, args: item.args })))

    const executed = await runTools(tools, files, input.repo, input.signal)
    files = { ...(executed.files || files) }

    for (const [index, out] of (executed.outcomes || []).entries()) {
      input.onResult?.({
        name: out.name,
        ok: out.ok,
        text: out.text,
        files: out.files,
        command: tools[index]?.args.command || tools[index]?.args.cmd,
      })
    }

    work.push({
      role: 'assistant',
      content: text || '',
      tool_calls: openaiToolCalls(calls),
    })
    ;(executed.outcomes || []).forEach((out, index) => {
      work.push({
        role: 'tool',
        tool_call_id: calls[index]?.id,
        name: out.name,
        content: out.text.slice(0, 12_000),
      })
    })

    if (executed.followUp) {
      work.push({ role: 'user', content: executed.followUp })
    }
  }

  return { text: lastText, promptTokens, completionTokens, files }
}
