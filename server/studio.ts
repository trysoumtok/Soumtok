import type { Hono } from 'hono'
import {
  CODING_MODELS,
  IMAGE_MODEL,
  IMAGE_MODELS,
  KEY_PROVIDERS,
  NATIVE_FALLBACK,
  anthropicOmitsSamplingParams,
  desktopCodingModels,
  openaiOmitsTemperature,
  soumtokCodingModels,
  SOUMTOK_CODING_PROVIDERS,
  PROVIDER_LABEL,
  isAutoModel,
  isTrialModel,
  modelById,
  pickAutoModel,
  sortModelsByPower,
  upstreamModelId,
  usesMaxCompletionTokens,
  usesResponsesApi,
  type ModelProvider,
} from '../shared/models.ts'
import {
  analyzeAttachment,
  guessMime,
  isProviderMediaUrl,
  isTextAttachment,
  messagesForProvider,
  storageSafeModelMessages,
  modelMedia,
  promptChars,
  toChatCompletionsMessages,
  toResponsesInput,
  type ChatFile,
  type ChatTurn,
} from '../shared/chatMedia.ts'
import { redactChatFiles, redactSecrets, scanSecrets } from '../shared/secretsGuard.ts'
import {
  looksLikePlanTalk,
  parseAgentRun,
  packWorkspaceFiles,
  promptManifestSpec,
  missingManifestFiles,
  type AgentRunMode,
} from '../shared/agent.ts'
import { type DesktopAgentMode } from '../shared/desktopHarness.ts'
import { prepareDesktopAgentTurn } from '../shared/desktopAgent.ts'
import { compactConversation, mergeDesktopSystem } from '../shared/agentControlLayer.ts'
import { shouldForceToolChoice, isHarnessUserText } from '../shared/modelHarness.ts'
import { analyzeUserRequest } from '../shared/requestAnalyze.ts'
import { applyRunModeToPrefs, mergeDesktopAgentPrefs, openFilesForAgent } from '../shared/desktopAgentPrefs.ts'
import {
  needsVisionWrap,
  stampAttachmentMeta,
  visionReplyLooksBlind,
  visionWrapCandidates,
  visionWrapPrompt,
} from '../shared/modelWrap.ts'
import { isTransientStreamError, friendlyStreamError } from '../shared/streamDrop.ts'
import { pendingToolsForRun, skipKnownReads, skipDisplayDiffs, toolsShouldContinue, filesStamp, shouldNudgeWrite, writeNudgeMessage, liveToolProgress } from '../shared/tools.ts'
import {
  anthropicStudioTools,
  openaiStudioTools,
  openaiToolCalls,
  responsesStudioTools,
  studioToolsFromNative,
  type NativeToolCall,
} from '../shared/nativeTools.ts'
import { createSandboxDir, removeSandboxDir } from './sandbox.ts'
import {
  PLAN_CREDIT,
  TOKENS_PER_CREDIT,
  TRIAL_TOKEN_QUOTA,
  paidPlan,
  planLabel,
  planPriceLine,
} from '../shared/plans.ts'
import { normalizeUsername, usernameError } from '../shared/username.ts'
import { auth } from './auth.ts'
import { pool } from './db.ts'
import { env, hasBunny, hasFal, hasImageGen, hasReplicate, openAccessForBuilding, platformKey } from './env.ts'
import { examineMediaBytes, generateStillImage } from './studioMedia.ts'
import { decryptSecret, encryptSecret, last4 } from './secrets.ts'
import { securityChangeEmail, sendMail } from './mail.ts'
import { deleteFromBunny, downloadFromBunny, safeFileName, uploadToBunny } from './storage.ts'
import { consumeCode, issueCode } from './verify.ts'
import { registerChrome } from './chrome.ts'
import { registerStudioTools, runStudioTools, sanitizeToolFiles } from './studioTools.ts'
import { flagDeletedEmail, normalizeEmail } from './blocked-emails.ts'
import { imageChargeTokens, imageChargeUsd } from '../shared/imageBilling.ts'
import { assertPlatformTokenBudget, recordImageUsage } from './imageUsage.ts'

type ReadyFn = (c: { req: { raw: Request } }) => Promise<{
  session: { user: { id: string; email?: string | null; name?: string | null } } | null
  ready: boolean
}>

function parseIsoDate(value?: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const ENDPOINTS: Record<ModelProvider, string> = {
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
  xai: 'https://api.x.ai/v1/chat/completions',
}

const RESPONSES_ENDPOINTS: Partial<Record<ModelProvider, string>> = {
  openai: 'https://api.openai.com/v1/responses',
  xai: 'https://api.x.ai/v1/responses',
}

type StudioMessage = ChatTurn

export function completionUrl(provider: ModelProvider, modelId: string) {
  if (usesResponsesApi(provider, modelId)) {
    return RESPONSES_ENDPOINTS[provider] || ENDPOINTS[provider]
  }
  return ENDPOINTS[provider]
}

export function extractError(data: {
  error?: { message?: string } | string
  message?: string
}) {
  if (typeof data.error === 'string') return data.error
  return data.error?.message || data.message || 'The model request failed'
}

export function extractText(data: {
  output_text?: string
  output?: { content?: { text?: string; type?: string }[] }[]
  choices?: { message?: { content?: string; reasoning_content?: string } }[]
  content?: { text?: string }[]
}) {
  const fromResponses = (data.output || [])
    .flatMap((item) => item.content || [])
    .map((part) => part.text || '')
    .join('')
  if (fromResponses.trim()) return fromResponses
  if (data.output_text?.trim()) return data.output_text
  const message = data.choices?.[0]?.message
  return (
    message?.content ||
    message?.reasoning_content ||
    data.content?.map((part) => part.text || '').join('') ||
    ''
  )
}

type StreamFrame = Record<string, unknown>

/** Yields each parsed `data:` payload from a provider SSE body. */
async function* sseFrames(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamFrame> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let cut = buffer.indexOf('\n')
    while (cut >= 0) {
      const line = buffer.slice(0, cut).trim()
      buffer = buffer.slice(cut + 1)
      cut = buffer.indexOf('\n')
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        yield JSON.parse(payload) as StreamFrame
      } catch {
        // Providers occasionally split a frame across reads; skip the fragment.
      }
    }
  }
}

/** Pulls the text delta out of a frame, whatever shape the provider uses. */
function streamDelta(frame: StreamFrame) {
  const choice = (frame.choices as { delta?: { content?: string; reasoning_content?: string } }[] | undefined)?.[0]
  if (choice?.delta?.content) return choice.delta.content
  if (typeof frame.delta === 'string' && frame.type === 'response.output_text.delta') return frame.delta
  const block = frame.delta as { text?: string; type?: string } | undefined
  if (block?.text && frame.type === 'content_block_delta') return block.text
  return ''
}

function frameError(frame: StreamFrame) {
  const err = frame.error
  if (typeof err === 'string' && err.trim()) return err.trim()
  if (err && typeof err === 'object') {
    const row = err as { message?: string; type?: string }
    if (row.message?.trim()) return row.message.trim()
  }
  if (frame.type === 'error' || frame.type === 'response.failed') {
    const message = String((frame as { message?: string }).message || '').trim()
    if (message) return message
  }
  return ''
}

/** Load attached files from the user's documents store so the model gets the saved bytes. */
async function hydrateChatFiles(userId: string, messages: StudioMessage[]): Promise<StudioMessage[]> {
  if (!pool) return messages
  const next: StudioMessage[] = []
  for (const item of messages) {
    if (!item.files?.length) {
      next.push(item)
      continue
    }
    const files: ChatFile[] = []
    for (const file of item.files) {
      if (file.text) {
        files.push(file)
        continue
      }
      if (isProviderMediaUrl(file.dataUrl)) {
        files.push(file)
        continue
      }
      if (!file.id) {
        files.push({ ...file, dataUrl: undefined })
        continue
      }
      const row = await pool.query(
        `SELECT name, path, size, content_type FROM files WHERE id = $1 AND user_id = $2`,
        [file.id, userId],
      )
      const stored = row.rows[0] as { name: string; path: string; size: number; content_type: string } | undefined
      const owned = `users/${userId}/`
      if (!stored || !stored.path.startsWith(owned)) {
        files.push({ ...file, dataUrl: undefined })
        continue
      }
      if (!hasBunny()) {
        files.push({
          ...file,
          name: stored.name,
          mime: stored.content_type || file.mime,
          size: Number(stored.size),
          dataUrl: undefined,
        })
        continue
      }
      try {
        const blob = await downloadFromBunny(stored.path)
        const mime = stored.content_type || file.mime
        if (isTextAttachment(stored.name, mime)) {
          files.push({
            ...file,
            name: stored.name,
            mime,
            size: Number(stored.size),
            text: new TextDecoder().decode(blob.bytes).slice(0, 200_000),
            dataUrl: undefined,
          })
        } else {
          files.push({
            ...file,
            name: stored.name,
            mime,
            size: Number(stored.size),
            dataUrl: `data:${mime};base64,${Buffer.from(blob.bytes).toString('base64')}`,
          })
        }
      } catch {
        files.push({ ...file, dataUrl: undefined })
      }
    }
    next.push({ ...item, files })
  }
  return next
}

const TOOL_ROUND_MARKER = '<<<SOUMTOK TOOL ROUND>>>'

function stripToolRoundBlock(content?: string) {
  const at = String(content || '').indexOf(TOOL_ROUND_MARKER)
  return at < 0 ? String(content || '') : String(content).slice(0, at).trimEnd()
}

function clampTokens(n?: number) {
  if (!n || !Number.isFinite(n)) return 16384
  return Math.min(32768, Math.max(256, Math.round(n)))
}

function clampTemp(n?: number) {
  if (n === undefined || !Number.isFinite(n)) return 0.35
  return Math.min(1, Math.max(0, n))
}

function providerToolChoice(provider: ModelProvider, required: boolean) {
  if (provider === 'anthropic') return { type: required ? 'any' : 'auto' }
  return required ? 'required' : 'auto'
}

export function requestBody(
  provider: ModelProvider,
  modelId: string,
  messages: StudioMessage[],
  opts?: {
    temperature?: number
    maxTokens?: number
    tools?: boolean
    toolNames?: string[]
    forceTools?: boolean
    packModel?: string
  },
) {
  const packId = opts?.packModel || modelId
  const maxTokens = Math.min(provider === 'anthropic' ? 16384 : 32768, clampTokens(opts?.maxTokens))
  const temperature = clampTemp(opts?.temperature)
  const toolsOn = Boolean(opts?.tools)
  const toolNames = toolsOn ? opts?.toolNames : undefined
  const toolChoice = toolsOn ? providerToolChoice(provider, Boolean(opts?.forceTools)) : undefined
  if (provider === 'anthropic') {
    const anthropic: Record<string, unknown> = {
      model: modelId.split('/').pop(),
      max_tokens: maxTokens,
      messages: toAnthropicMessages(messagesForProvider(messages), packId),
      system: anthropicSystemWithCache(messages.find((item) => item.role === 'system')?.content) ||
        messages.find((item) => item.role === 'system')?.content,
      ...(toolsOn ? { tools: anthropicStudioTools(toolNames), tool_choice: toolChoice } : {}),
    }
    if (!anthropicOmitsSamplingParams(modelId)) anthropic.temperature = temperature
    return anthropic
  }
  if (usesResponsesApi(provider, modelId)) {
    const system = messages.find((item) => item.role === 'system')?.content
    return {
      model: modelId,
      input: toResponsesInput(messagesForProvider(messages), packId),
      store: false,
      max_output_tokens: maxTokens,
      ...(system ? { instructions: system } : {}),
      ...(provider === 'xai' && /multi-agent/i.test(modelId)
        ? { reasoning: { effort: 'medium' } }
        : {}),
      ...(provider === 'xai' ? { temperature } : {}),
      ...(toolsOn ? { tools: responsesStudioTools(toolNames), tool_choice: toolChoice } : {}),
    }
  }
  const chat: Record<string, unknown> = {
    model: modelId,
    messages: toChatCompletionsMessages(messagesForProvider(messages), packId, provider),
    ...(toolsOn ? { tools: openaiStudioTools(toolNames), tool_choice: toolChoice } : {}),
  }
  if (provider === 'openai' && !openaiOmitsTemperature(modelId)) chat.temperature = temperature
  else if (provider !== 'openai') chat.temperature = temperature
  if (usesMaxCompletionTokens(provider, modelId)) {
    chat.max_completion_tokens = maxTokens
  } else {
    chat.max_tokens = maxTokens
  }
  return chat
}

function anthropicRequestHeaders(apiKey: string) {
  return {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'prompt-caching-2024-07-31',
  }
}

function anthropicSystemWithCache(system?: string) {
  const raw = String(system || '').trim()
  if (!raw) return undefined
  const liveIdx = raw.indexOf('\n\nLIVE USER REQUEST')
  const live = liveIdx >= 0 ? raw.slice(liveIdx).trim() : ''
  const rest = liveIdx >= 0 ? raw.slice(0, liveIdx).trim() : raw
  const markers = [
    'PROJECT BRIEF',
    'PROJECT RULES (from this repo',
    'SOUMTOK PLATFORM CONTEXT',
    'SCAFFOLD ON DISK',
    'KNOWN FILES (harness already searched',
    'TASK LEDGER',
  ]
  let split = rest.length
  for (const marker of markers) {
    const i = rest.indexOf(marker)
    if (i >= 0 && i < split) split = i
  }
  const stable = rest.slice(0, split).trim()
  const volatile = [rest.slice(split).trim(), live].filter(Boolean).join('\n\n')
  const blocks: { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[] = []
  if (stable) blocks.push({ type: 'text', text: stable, cache_control: { type: 'ephemeral' } })
  if (volatile) blocks.push({ type: 'text', text: volatile })
  if (!blocks.length) return undefined
  return blocks
}

function toAnthropicMessages(messages: StudioMessage[], modelId: string) {
  return messages.flatMap((item) => {
    if (item.role === 'system') return []
    if (item.role === 'tool') {
      return [
        {
          role: 'user' as const,
          content: [{ type: 'tool_result', tool_use_id: item.tool_call_id, content: item.content || '' }],
        },
      ]
    }
    if (item.role === 'assistant' && item.tool_calls?.length) {
      const content: Record<string, unknown>[] = []
      if (item.content) content.push({ type: 'text', text: item.content })
      for (const call of item.tool_calls) {
        let input: unknown = {}
        try {
          input = JSON.parse(call.function.arguments || '{}')
        } catch {
          input = {}
        }
        content.push({ type: 'tool_use', id: call.id, name: call.function.name, input })
      }
      return [{ role: 'assistant' as const, content }]
    }
    if (item.role === 'user' && item.files?.length) {
      return toChatCompletionsMessages([item], modelId, 'anthropic')
    }
    return [{ role: item.role, content: item.content }]
  })
}

type AccCall = { id: string; name: string; args: string }

function applyToolFrame(frame: StreamFrame, acc: Map<string, AccCall>) {
  const choice = (
    frame.choices as
      | { delta?: { tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[]
      | undefined
  )?.[0]
  for (const call of choice?.delta?.tool_calls || []) {
    const key = String(call.index ?? call.id ?? acc.size)
    const cur = acc.get(key) || { id: '', name: '', args: '' }
    if (call.id) cur.id = call.id
    if (call.function?.name) cur.name += call.function.name
    if (call.function?.arguments) cur.args += call.function.arguments
    acc.set(key, cur)
  }
  if (frame.type === 'content_block_start') {
    const block = frame.content_block as { type?: string; id?: string; name?: string } | undefined
    if (block?.type === 'tool_use') {
      acc.set(String(frame.index ?? block.id), { id: block.id || '', name: block.name || '', args: '' })
    }
  }
  if (frame.type === 'content_block_delta') {
    const delta = frame.delta as { type?: string; partial_json?: string } | undefined
    if (delta?.partial_json) {
      const cur = acc.get(String(frame.index ?? ''))
      if (cur) cur.args += delta.partial_json
    }
  }
  if (frame.type === 'response.output_item.added') {
    const item = frame.item as { type?: string; id?: string; call_id?: string; name?: string } | undefined
    if (item?.type === 'function_call') {
      const key = item.id || item.call_id || String(acc.size)
      acc.set(key, { id: item.call_id || item.id || key, name: item.name || '', args: '' })
    }
  }
  if (frame.type === 'response.function_call_arguments.delta') {
    const cur = acc.get(String(frame.item_id || ''))
    if (cur) cur.args += String(frame.delta || '')
  }
}

function nativeFromAcc(acc: Map<string, AccCall>): NativeToolCall[] {
  return [...acc.values()]
    .filter((item) => item.name)
    .map((item) => ({ id: item.id || crypto.randomUUID(), name: item.name, arguments: item.args || '{}' }))
}

/** Vision model describes images so text-only coding models can still act on screenshots. */
async function visionWrapDesktopFiles(files: ChatFile[], userText: string, requestModel: string) {
  if (!files.length || !needsVisionWrap(requestModel, files)) return { files, note: '' }
  const images = files.filter((f) => f.mime?.startsWith('image/') && isProviderMediaUrl(f.dataUrl))
  if (!images.length) return { files, note: '' }
  const candidates = visionWrapCandidates((provider) => Boolean(platformKey(provider)))
  for (const pick of candidates) {
    const apiKey = platformKey(pick.provider)
    if (!apiKey) continue
    try {
      const ran = await streamModel({
        provider: pick.provider,
        requestModel: upstreamModelId(pick.id),
        mediaModel: pick.id,
        apiKey,
        messages: [{ role: 'user', content: visionWrapPrompt(userText), files: images }],
        tools: false,
        temperature: 0.2,
        maxTokens: 2048,
        timeoutMs: 120_000,
      })
      const desc = (ran.text || '').trim()
      if (!desc || visionReplyLooksBlind(desc)) continue
      const stamp = `SOUMTOK VISION:\n${desc}`
      const next = files.map((file) =>
        file.mime?.startsWith('image/')
          ? { ...file, analysis: [file.analysis, stamp].filter(Boolean).join('\n\n') }
          : file,
      )
      return { files: next, note: 'Soumtok analyzed your image with a vision model so this model can use it.' }
    } catch {
      /* try the next vision model */
    }
  }
  return { files, note: '' }
}

function isToolChainProviderError(message: string) {
  return /role ['"]tool['"]|tool_calls/i.test(String(message || ''))
}

async function streamModel(input: {
  provider: ModelProvider
  requestModel: string
  apiKey: string
  messages: StudioMessage[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
  onDelta?: (delta: string) => void
  onToolProgress?: (calls: ReturnType<typeof liveToolProgress>) => void
  tools?: boolean
  toolNames?: string[]
  timeoutMs?: number
  forceTools?: boolean
  mediaModel?: string
  foldedToolChain?: boolean
}) {
  const upstream = await fetch(completionUrl(input.provider, input.requestModel), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
      ...(input.provider === 'openrouter'
        ? { 'HTTP-Referer': env.betterAuthUrl, 'X-Title': 'Soumtok' }
        : {}),
      ...(input.provider === 'anthropic' ? anthropicRequestHeaders(input.apiKey) : {}),
    },
    body: JSON.stringify({
      ...requestBody(input.provider, input.requestModel, input.messages, {
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        tools: input.tools,
        toolNames: input.toolNames,
        forceTools: input.forceTools,
        packModel: input.mediaModel || input.requestModel,
      }),
      stream: true,
      ...(usesResponsesApi(input.provider, input.requestModel) || input.provider === 'anthropic'
        ? {}
        : { stream_options: { include_usage: true } }),
    }),
    signal: input.signal || AbortSignal.timeout(input.timeoutMs || (input.tools ? 480_000 : 180_000)),
  })
  if (!upstream.ok || !upstream.body) {
    const failed = await upstream.json().catch(() => ({}))
    const message = extractError(failed as { error?: string | { message?: string }; message?: string })
    if (isToolChainProviderError(message) && !input.foldedToolChain) {
      return streamModel({
        ...input,
        messages: storageSafeModelMessages(input.messages),
        foldedToolChain: true,
      })
    }
    if (input.forceTools) {
      return streamModel({ ...input, forceTools: false })
    }
    throw new Error(message)
  }
  let text = ''
  let promptTokens = 0
  let completionTokens = 0
  const acc = new Map<string, AccCall>()
  let lastProg = ''
  let lastProgAt = 0
  const emitProgress = (force = false) => {
    if (!input.onToolProgress || !acc.size) return
    const now = Date.now()
    const calls = liveToolProgress([...acc.values()])
    const mark = JSON.stringify(calls.map((item) => [item.name, item.path || '', item.chars]))
    if (!force && mark === lastProg && now - lastProgAt < 280) return
    lastProg = mark
    lastProgAt = now
    input.onToolProgress(calls)
  }
  const finish = () => {
    emitProgress(true)
    if (!completionTokens) completionTokens = Math.ceil(text.length / 4)
    if (!promptTokens) promptTokens = Math.ceil(input.messages.reduce((sum, item) => sum + promptChars(item), 0) / 4)
    return { text, promptTokens, completionTokens, toolCalls: nativeFromAcc(acc) }
  }
  try {
    for await (const frame of sseFrames(upstream.body)) {
      const fail = frameError(frame)
      if (fail) {
        if (text || acc.size) break
        throw new Error(fail)
      }
      applyToolFrame(frame, acc)
      emitProgress()
      const nested = (frame.response as { usage?: Record<string, number> } | undefined)?.usage
      const usage = (frame.usage as Record<string, number> | undefined) || nested
      if (usage) {
        promptTokens = usage.prompt_tokens || usage.input_tokens || promptTokens
        completionTokens = usage.completion_tokens || usage.output_tokens || completionTokens
      }
      const delta = streamDelta(frame)
      if (!delta) continue
      text += delta
      input.onDelta?.(delta)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const name = error instanceof Error ? error.name : ''
    if ((name === 'AbortError' || name === 'TimeoutError' || isTransientStreamError(message)) && (text || acc.size)) {
      return finish()
    }
    throw error
  }
  return finish()
}

async function userKey(userId: string, provider: ModelProvider) {
  const result = await pool!.query(
    `SELECT key_ciphertext FROM provider_keys WHERE user_id = $1 AND provider = $2`,
    [userId, provider],
  )
  const row = result.rows[0] as { key_ciphertext: string } | undefined
  return row ? decryptSecret(row.key_ciphertext) : ''
}

async function track(
  userId: string | null,
  name: string,
  path: string | null,
  meta: Record<string, unknown> = {},
) {
  await pool!.query(
    `INSERT INTO analytics_events (id, user_id, name, path, meta)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [crypto.randomUUID(), userId, name, path, JSON.stringify(meta)],
  )
}

const PROJECT_COLS = `id, title, model, repo, skill_ids, messages, workspace, created_at, updated_at`
const LIST_COLS = `id, title, model, repo, skill_ids, created_at, updated_at,
  coalesce((
    select sum(coalesce((e->>'added')::int, 0))
    from jsonb_array_elements(
      case
        when jsonb_typeof(workspace->'events') = 'array' then workspace->'events'
        else '[]'::jsonb
      end
    ) e
    where e->>'kind' = 'diff'
  ), 0)::int as code_lines`

function mapProject(row: Record<string, unknown>, opts?: { list?: boolean }) {
  return {
    id: String(row.id),
    title: String(row.title || 'New chat'),
    model: (row.model as string | null) || null,
    repo: row.repo || null,
    skillIds: Array.isArray(row.skill_ids) ? row.skill_ids : [],
    messages: opts?.list ? [] : Array.isArray(row.messages) ? row.messages : [],
    workspace: opts?.list ? {} : row.workspace && typeof row.workspace === 'object' ? row.workspace : {},
    codeLines: Number(row.code_lines || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function registerStudio(
  app: Hono,
  requireReadyUser: ReadyFn,
) {
  registerChrome(app, requireReadyUser)
  registerStudioTools(app, requireReadyUser)

  app.post('/api/studio/attachments', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const form = await c.req.formData()
    const uploaded = form.get('file')
    if (!(uploaded instanceof File)) return c.json({ error: 'Choose a file' }, 400)
    if (uploaded.size > 12 * 1024 * 1024) return c.json({ error: 'File must be under 12 MB' }, 400)

    const name = safeFileName(uploaded.name)
    const mime = guessMime(name, uploaded.type)
    const bytes = new Uint8Array(await uploaded.arrayBuffer())
    const text = isTextAttachment(name, mime) ? new TextDecoder().decode(bytes).slice(0, 200_000) : undefined
    const analysis = analyzeAttachment({ name, mime, size: uploaded.size, text })

    let fileId: string | undefined
    if (hasBunny()) {
      fileId = crypto.randomUUID()
      const path = `users/${session.user.id}/${fileId}/${name}`
      await uploadToBunny(path, bytes, mime)
      await pool.query(
        `INSERT INTO files (id, user_id, name, path, size, content_type)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [fileId, session.user.id, name, path, uploaded.size, mime],
      )
    }

    const documentId = crypto.randomUUID()
    const content = fileId ? `${analysis.content}\n\nStored file id: ${fileId}` : analysis.content
    await pool.query(
      `INSERT INTO documents (id, user_id, title, content)
       VALUES ($1, $2, $3, $4)`,
      [documentId, session.user.id, analysis.title, content],
    )

    return c.json(
      {
        id: fileId,
        documentId,
        name,
        mime,
        size: uploaded.size,
        text,
        analysis: analysis.content,
        preview: fileId && mime.startsWith('image/') ? `/api/files/${fileId}/download?inline=1` : undefined,
        stored: Boolean(fileId),
      },
      201,
    )
  })

  app.get('/api/studio/projects', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const rows = await pool.query(
      `SELECT ${LIST_COLS} FROM studio_projects WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 80`,
      [session.user.id],
    )
    return c.json({ projects: rows.rows.map((row) => mapProject(row as Record<string, unknown>, { list: true })) })
  })

  app.get('/api/studio/projects/:id', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const row = await pool.query(`SELECT ${PROJECT_COLS} FROM studio_projects WHERE id = $1 AND user_id = $2`, [
      c.req.param('id'),
      session.user.id,
    ])
    if (!row.rows[0]) return c.json({ error: 'Project not found' }, 404)
    return c.json({ project: mapProject(row.rows[0] as Record<string, unknown>) })
  })

  app.post('/api/studio/projects', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{
      title?: string
      model?: string | null
      repo?: unknown
      skillIds?: string[]
      messages?: unknown[]
      workspace?: unknown
    }>()
    const id = crypto.randomUUID()
    const title = (body.title || 'New chat').trim().slice(0, 80) || 'New chat'
    await pool.query(
      `INSERT INTO studio_projects (id, user_id, title, model, repo, skill_ids, messages, workspace, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, NOW())`,
      [
        id,
        session.user.id,
        title,
        body.model || null,
        JSON.stringify(body.repo || null),
        JSON.stringify(body.skillIds || []),
        JSON.stringify(body.messages || []),
        JSON.stringify(body.workspace || {}),
      ],
    )
    const row = await pool.query(`SELECT ${PROJECT_COLS} FROM studio_projects WHERE id = $1`, [id])
    return c.json({ project: mapProject(row.rows[0] as Record<string, unknown>) }, 201)
  })

  app.put('/api/studio/projects/:id', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{
      title?: string
      model?: string | null
      repo?: unknown
      skillIds?: string[]
      messages?: unknown[]
      workspace?: unknown
    }>()
    const title = (body.title || 'New chat').trim().slice(0, 80) || 'New chat'
    const result = await pool.query(
      `UPDATE studio_projects
       SET title = $3, model = $4, repo = $5::jsonb, skill_ids = $6::jsonb, messages = $7::jsonb, workspace = $8::jsonb, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING ${PROJECT_COLS}`,
      [
        c.req.param('id'),
        session.user.id,
        title,
        body.model || null,
        JSON.stringify(body.repo || null),
        JSON.stringify(body.skillIds || []),
        JSON.stringify(body.messages || []),
        JSON.stringify(body.workspace || {}),
      ],
    )
    if (!result.rows[0]) return c.json({ error: 'Project not found' }, 404)
    return c.json({ project: mapProject(result.rows[0] as Record<string, unknown>) })
  })

  app.delete('/api/studio/projects/:id', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    await pool.query(`DELETE FROM studio_projects WHERE id = $1 AND user_id = $2`, [c.req.param('id'), session.user.id])
    return c.json({ ok: true })
  })

  app.get('/api/models', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const keys = await pool.query(
      `SELECT provider FROM provider_keys WHERE user_id = $1`,
      [session.user.id],
    )
    const have = new Set(keys.rows.map((row: { provider: string }) => row.provider))
    const profile = await pool.query(`SELECT plan FROM profiles WHERE user_id = $1`, [session.user.id])
    const planId = String(profile.rows[0]?.plan || 'hobby')
    const base = soumtokCodingModels()
    const catalog =
      !openAccessForBuilding() && (planId === 'hobby' || planId === 'trial')
        ? base.filter((model) => isTrialModel(model.id))
        : base
    return c.json({
      models: sortModelsByPower(catalog).map((model) => {
        const fallback = NATIVE_FALLBACK[model.id]
        const ready =
          have.has(model.provider) ||
          have.has('openrouter') ||
          Boolean(platformKey(model.provider)) ||
          Boolean(fallback && platformKey(fallback.provider))
        return { ...model, ready, media: modelMedia(model.id) }
      }),
      images: IMAGE_MODELS.map((model) => ({
        ...model,
        ready: model.provider === 'replicate' ? hasReplicate() : model.provider === 'fal' ? hasFal() : false,
        chargeTokens: imageChargeTokens(model.id),
        chargeUsd: imageChargeUsd(model.id),
      })),
      image: { ...IMAGE_MODEL, ready: hasImageGen() },
      providers: KEY_PROVIDERS.filter((item) => SOUMTOK_CODING_PROVIDERS.includes(item.id)).map((item) => ({
        ...item,
        connected:
          have.has(item.id) ||
          have.has('openrouter') ||
          Boolean(platformKey(item.id)),
      })),
    })
  })

  /** Desktop IDE: DeepSeek, OpenAI, Anthropic, Grok — full catalog with key readiness. */
  app.get('/api/desktop/models', async (c) => {
    const { session, ready: accountReady } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)

    const keys = await pool.query(`SELECT provider FROM provider_keys WHERE user_id = $1`, [session.user.id])
    const have = new Set(keys.rows.map((row: { provider: string }) => row.provider))
    const catalog = desktopCodingModels()
    return c.json({
      accountReady,
      models: sortModelsByPower(catalog).map((model) => {
        const fallback = NATIVE_FALLBACK[model.id]
        const modelReady =
          have.has(model.provider) ||
          have.has('openrouter') ||
          Boolean(platformKey(model.provider)) ||
          Boolean(fallback && platformKey(fallback.provider))
        return { ...model, ready: modelReady, media: modelMedia(model.id) }
      }),
    })
  })

  /** Billing, usage, and provider keys for Soumtok Desktop settings. */
  app.get('/api/desktop/summary', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const profile = await pool.query(
      `SELECT plan, plan_status, plan_cycle, plan_started_at, plan_renews_at
       FROM profiles WHERE user_id = $1`,
      [session.user.id],
    )
    const row = profile.rows[0] || {}
    const planRaw = String(row.plan || 'hobby')
    const planId = planRaw === 'teams' ? 'team' : planRaw
    const isTrial = planId === 'hobby' || planId === 'trial'
    const credit = PLAN_CREDIT[planId] || PLAN_CREDIT.hobby
    const quota = isTrial ? TRIAL_TOKEN_QUOTA : credit * TOKENS_PER_CREDIT
    const currentPaid = paidPlan(planId)

    const usage = await pool.query(
      `SELECT billed_to,
              coalesce(sum(prompt_tokens + completion_tokens), 0)::int AS tokens,
              count(*)::int AS calls
       FROM usage_events
       WHERE user_id = $1 AND created_at >= date_trunc('month', now())
       GROUP BY billed_to`,
      [session.user.id],
    )
    let includedTokens = 0
    let byokTokens = 0
    for (const u of usage.rows as { billed_to: string; tokens: number }[]) {
      if (u.billed_to === 'user') byokTokens += u.tokens || 0
      else includedTokens += u.tokens || 0
    }

    const topModels = await pool.query(
      `SELECT model, provider, coalesce(sum(prompt_tokens + completion_tokens), 0)::int AS tokens
       FROM usage_events
       WHERE user_id = $1 AND created_at >= date_trunc('month', now())
       GROUP BY model, provider
       ORDER BY tokens DESC
       LIMIT 10`,
      [session.user.id],
    )

    const keys = await pool.query(`SELECT provider FROM provider_keys WHERE user_id = $1`, [session.user.id])
    const have = new Set(keys.rows.map((r: { provider: string }) => r.provider))
    const desktopProviders = ['deepseek', 'openai', 'anthropic', 'xai'] as const
    const providers = desktopProviders.map((id) => ({
      id,
      name: PROVIDER_LABEL[id],
      connected:
        have.has(id) ||
        have.has('openrouter') ||
        Boolean(platformKey(id)),
    }))

    const upgradeOrder = ['hobby', 'trial', 'pro', 'pro_plus', 'ultra'] as const
    let upgrade: { id: string; name: string; price: string; tagline: string } | null = null
    const idx = upgradeOrder.indexOf(planRaw as (typeof upgradeOrder)[number])
    const nextId =
      idx >= 0 && idx < upgradeOrder.length - 1
        ? upgradeOrder[idx + 1]
        : planId === 'hobby' || planId === 'trial'
          ? 'pro'
          : null
    if (nextId && nextId !== 'trial') {
      const next = paidPlan(nextId)
      if (next) {
        upgrade = {
          id: next.id,
          name: next.name,
          price: planPriceLine(next),
          tagline: next.tagline,
        }
      }
    }

    const renewsAt = row.plan_renews_at ? new Date(row.plan_renews_at) : null
    let renewsInDays: number | null = null
    if (renewsAt && !Number.isNaN(renewsAt.getTime())) {
      renewsInDays = Math.max(0, Math.ceil((renewsAt.getTime() - Date.now()) / 86400000))
    }

    return c.json({
      plan: planRaw,
      planStatus: row.plan_status || 'active',
      planCycle: row.plan_cycle === 'annual' ? 'annual' : 'monthly',
      planRenewsAt: row.plan_renews_at || null,
      planLabel: planLabel(planRaw),
      planPrice: currentPaid ? planPriceLine(currentPaid) : 'Free',
      quota,
      includedTokens,
      byokTokens,
      includedPct: Math.min(100, Math.round((includedTokens / Math.max(quota, 1)) * 100)),
      byokPct: byokTokens > 0 ? Math.min(100, Math.round((byokTokens / Math.max(quota, 1)) * 100)) : 0,
      topModels: topModels.rows,
      providers,
      upgrade,
      renewsInDays,
    })
  })

  /** Soumtok Desktop voice input — OpenAI Whisper (Web Speech fails in Electron). */
  app.post('/api/desktop/speech/transcribe', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const body = await c.req.json<{ audio?: string; mime?: string; language?: string; prompt?: string }>()
    const b64 = body.audio?.trim() ?? ''
    if (!b64) return c.json({ error: 'Missing audio' }, 400)

    let apiKey = await userKey(session.user.id, 'openai')
    let billedTo: 'user' | 'platform' = 'user'
    if (!apiKey) {
      const native = platformKey('openai')
      if (native) {
        apiKey = native
        billedTo = 'platform'
      }
    }
    if (!apiKey) {
      return c.json(
        {
          error:
            'Voice transcription needs an OpenAI key. Add one in Desktop Settings → Keys, or upgrade for platform access.',
        },
        402,
      )
    }

    if (billedTo === 'platform' && !openAccessForBuilding()) {
      const profile = await pool.query(`SELECT plan FROM profiles WHERE user_id = $1`, [session.user.id])
      const planId = String(profile.rows[0]?.plan || 'hobby')
      if (planId === 'hobby' || planId === 'trial') {
        const used = await pool.query(
          `SELECT coalesce(sum(prompt_tokens + completion_tokens), 0)::int AS tokens
           FROM usage_events
           WHERE user_id = $1 AND billed_to = 'platform' AND created_at >= date_trunc('month', now())`,
          [session.user.id],
        )
        if ((used.rows[0]?.tokens || 0) >= TRIAL_TOKEN_QUOTA) {
          return c.json({ error: 'Your free trial ended. Upgrade to Pro to keep using voice.' }, 402)
        }
      }
    }

    let buf: Buffer
    try {
      buf = Buffer.from(b64, 'base64')
    } catch {
      return c.json({ error: 'Invalid audio payload' }, 400)
    }
    if (buf.length < 400) return c.json({ text: '' })
    if (buf.length > 12 * 1024 * 1024) return c.json({ error: 'Audio chunk too large' }, 400)

    const mime = body.mime?.trim() || 'audio/webm'
    const ext = mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : 'wav'
    const form = new FormData()
    form.append('file', new Blob([buf], { type: mime }), `speech.${ext}`)
    form.append('model', 'whisper-1')
    const lang = body.language?.trim().split('-')[0]
    if (lang && /^[a-z]{2}$/i.test(lang)) form.append('language', lang.toLowerCase())
    const prompt = body.prompt?.trim().slice(-400)
    if (prompt) form.append('prompt', prompt)

    const started = Date.now()
    try {
      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(22_000),
      })
      const payload = (await res.json().catch(() => ({}))) as { text?: string; error?: { message?: string } }
      if (!res.ok) {
        const msg = payload.error?.message || `Transcription failed (${res.status})`
        return c.json({ error: friendlyStreamError(msg) }, 400)
      }
      const text = String(payload.text || '').trim()
      if (text && billedTo === 'platform') {
        const estPrompt = Math.max(1, Math.round(buf.length / 80))
        await recordRun(
          session.user.id,
          { provider: 'openai', requestModel: 'whisper-1', billedTo },
          { promptTokens: estPrompt, completionTokens: Math.max(1, text.length) },
          started,
        ).catch(() => {})
      }
      return c.json({ text })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transcription failed'
      return c.json({ error: friendlyStreamError(message) }, 400)
    }
  })

  /** One agent round for Soumtok Desktop — model + tools; tools execute on the client. */
  const desktopAgentRound = async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const body = await c.req.json<{
      model?: string
      mode?: DesktopAgentMode
      driver?: 'ide' | 'bot'
      messages?: StudioMessage[]
      workspaceRoot?: string
      openFiles?: string[]
      branch?: string
      files?: ChatFile[]
      agentPrefs?: Record<string, unknown>
      analysisKind?: string
    }>()

    const agentPrefs = applyRunModeToPrefs(mergeDesktopAgentPrefs(body.agentPrefs))
    const openFiles = openFilesForAgent(body.openFiles, agentPrefs)

    const stamped = stampAttachmentMeta(Array.isArray(body.files) ? body.files.filter(Boolean) : [])
    const prepDraft = prepareDesktopAgentTurn({
      messages: body.messages,
      workspaceRoot: body.workspaceRoot,
      openFiles,
      branch: body.branch,
      mode: body.mode || 'agent',
      driver: body.driver,
      files: stamped,
      agentPrefs,
      model: body.model,
      analysisKind: body.analysisKind,
    })

    const runBody = { ...body, files: stamped }
    if (stamped.length && body.messages?.length) {
      const msgs = body.messages.map((item) => ({ ...item }))
      const lastIdx = msgs.length - 1
      if (msgs[lastIdx]?.role === 'user') {
        msgs[lastIdx] = { ...msgs[lastIdx], files: stamped }
        runBody.messages = msgs
      }
    }

    const access = await resolveRun(session.user.id, runBody)
    if (!access.ok) return c.json({ error: access.error, keys: access.keys }, access.status)
    const { provider, requestModel, apiKey, billedTo, messages, catalogModel } = access
    const wrapped = await visionWrapDesktopFiles(stamped, prepDraft.userText, catalogModel || requestModel)
    const prep = prepareDesktopAgentTurn({
      messages: body.messages,
      workspaceRoot: body.workspaceRoot,
      openFiles,
      branch: body.branch,
      mode: body.mode || 'agent',
      driver: body.driver,
      files: wrapped.files,
      agentPrefs,
      model: requestModel,
      analysisKind: body.analysisKind,
    })

    const work = messages.map((item) => ({ ...item }))
    const lastIdx = work.length - 1
    if (wrapped.files.length && work[lastIdx]?.role === 'user') {
      work[lastIdx] = {
        ...work[lastIdx],
        content: prep.userText,
        files: wrapped.files,
      }
    } else {
      for (let i = work.length - 1; i >= 0; i--) {
        if (work[i].role === 'user') {
          work[i] = {
            ...work[i],
            content: prep.userText,
          }
          break
        }
      }
    }
    const sysIdx = work.findIndex((item) => item.role === 'system')
    const prevSys = sysIdx >= 0 ? String(work[sysIdx].content || '') : ''
    const mergedSystem = mergeDesktopSystem(prevSys, prep.systemPrompt, prep.userText)
    if (sysIdx >= 0) work[sysIdx].content = mergedSystem
    else work.unshift({ role: 'system', content: mergedSystem })
    const last = work[work.length - 1]
    const lastUser = [...work].reverse().find((item) => item.role === 'user')
    const openToolCalls = Boolean(last?.role === 'assistant' && last.tool_calls?.length)
    if (lastUser && last !== lastUser && last?.role !== 'tool' && !openToolCalls) {
      work.push({
        role: 'user',
        content: prep.userText,
        files: wrapped.files.length ? wrapped.files : lastUser.files,
      })
    }

    const started = Date.now()
    try {
      const ran = await streamModel({
        provider,
        requestModel,
        mediaModel: catalogModel || requestModel,
        apiKey,
        messages: compactConversation(work),
        tools: prep.toolsEnabled,
        toolNames: prep.toolNames,
        temperature: prep.temperature,
        maxTokens: prep.maxTokens,
        timeoutMs: 480_000,
        forceTools: shouldForceToolChoice({
          toolsEnabled: prep.toolsEnabled,
          intent: prep.analysis.kind,
          model: requestModel,
          hasWrites: work.some((item) => {
            const name = String(item.name || '').toLowerCase()
            if (item.role === 'tool' && /^(write|diff|edit|str_replace|apply_patch)$/.test(name)) return true
            const c = String(item.content || '')
            return /\[Soumtok harness — (write|diff|edit)/i.test(c) || /SCAFFOLD ON DISK/i.test(c)
          }),
        }),
      })
      await recordRun(
        session.user.id,
        { provider, requestModel, billedTo },
        { promptTokens: ran.promptTokens, completionTokens: ran.completionTokens },
        started,
        'desktop',
      )
      return c.json({
        text: ran.text,
        toolCalls: ran.toolCalls,
        model: requestModel,
        provider,
        billedTo,
        promptTokens: ran.promptTokens,
        completionTokens: ran.completionTokens,
        thought: prep.analysis.thought,
        planMode: prep.plan.mode,
        intent: prep.analysis.kind,
        wrapNote: wrapped.note || undefined,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent round failed'
      return c.json({ error: friendlyStreamError(message) }, 400)
    }
  }
  app.post('/api/desktop/agent/round', desktopAgentRound)
  app.post('/api/studio/desktop/agent/round', desktopAgentRound)

  app.get('/api/keys', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const result = await pool.query(
      `SELECT id, provider, label, last4, created_at
       FROM provider_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [session.user.id],
    )
    return c.json({ keys: result.rows })
  })

  app.put('/api/keys', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const body = await c.req.json<{ provider?: ModelProvider; key?: string; label?: string }>()
    const provider = body.provider
    const key = body.key?.trim() ?? ''
    if (!provider || !KEY_PROVIDERS.some((item) => item.id === provider)) {
      return c.json({ error: 'Unknown provider' }, 400)
    }
    if (key.length < 12) return c.json({ error: 'That key looks too short' }, 400)

    await pool.query(
      `INSERT INTO provider_keys (id, user_id, provider, label, key_ciphertext, last4)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, provider) DO UPDATE SET
         label = EXCLUDED.label,
         key_ciphertext = EXCLUDED.key_ciphertext,
         last4 = EXCLUDED.last4`,
      [
        crypto.randomUUID(),
        session.user.id,
        provider,
        body.label?.trim() || provider,
        encryptSecret(key),
        last4(key),
      ],
    )
    await track(session.user.id, 'key_saved', '/dashboard/keys', { provider })
    return c.json({ ok: true, last4: last4(key) })
  })

  app.delete('/api/keys/:provider', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    await pool.query(`DELETE FROM provider_keys WHERE user_id = $1 AND provider = $2`, [
      session.user.id,
      c.req.param('provider'),
    ])
    return c.json({ ok: true })
  })

  app.post('/api/analytics', async (c) => {
    const { session } = await requireReadyUser(c)
    const body = await c.req.json<{ name?: string; path?: string; meta?: Record<string, unknown> }>()
    if (!body.name) return c.json({ error: 'Missing event' }, 400)
    await track(session?.user.id ?? null, body.name, body.path ?? null, body.meta ?? {})
    return c.json({ ok: true })
  })

  app.get('/api/analytics/summary', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const from = parseIsoDate(c.req.query('from'))
    const to = parseIsoDate(c.req.query('to'))
    const usageFrom = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const usageTo = to || new Date()
    const usage = await pool.query(
      `SELECT model, provider, billed_to,
              count(*)::int AS calls,
              coalesce(sum(prompt_tokens), 0)::int AS prompt_tokens,
              coalesce(sum(completion_tokens), 0)::int AS completion_tokens
       FROM usage_events
       WHERE user_id = $1 AND created_at >= $2 AND created_at < $3
       GROUP BY model, provider, billed_to
       ORDER BY calls DESC`,
      [session.user.id, usageFrom, usageTo],
    )
    const series = await pool.query(
      `SELECT (created_at AT TIME ZONE 'UTC')::date::text AS day,
              model,
              coalesce(sum(prompt_tokens + completion_tokens), 0)::int AS tokens
       FROM usage_events
       WHERE user_id = $1 AND created_at >= $2 AND created_at < $3
       GROUP BY 1, 2
       ORDER BY 1`,
      [session.user.id, usageFrom, usageTo],
    )
    const rows = await pool.query(
      `SELECT id, created_at, provider, model, billed_to, coalesce(source, 'studio') AS source,
              prompt_tokens::int AS prompt_tokens,
              completion_tokens::int AS completion_tokens,
              (prompt_tokens + completion_tokens)::int AS tokens
       FROM usage_events
       WHERE user_id = $1 AND created_at >= $2 AND created_at < $3
       ORDER BY created_at DESC
       LIMIT 2000`,
      [session.user.id, usageFrom, usageTo],
    )
    const events = await pool.query(
      `SELECT name, count(*)::int AS n
       FROM analytics_events
       WHERE user_id = $1 AND created_at > now() - interval '30 days'
       GROUP BY name
       ORDER BY n DESC`,
      [session.user.id],
    )
    const activity = await pool.query(
      `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
              billed_to,
              coalesce(sum(prompt_tokens + completion_tokens), 0)::int AS edits,
              count(*)::int AS calls
       FROM usage_events
       WHERE user_id = $1 AND created_at > now() - interval '400 days'
       GROUP BY 1, 2
       ORDER BY 1`,
      [session.user.id],
    )
    return c.json({
      usage: usage.rows,
      events: events.rows,
      activity: activity.rows,
      series: series.rows,
      rows: rows.rows,
    })
  })

  type RunAccess =
    | { ok: false; error: string; status: 400 | 402; keys?: string }
    | {
        ok: true
        provider: ModelProvider
        requestModel: string
        apiKey: string
        billedTo: 'user' | 'platform'
        catalogModel?: string
        messages: StudioMessage[]
        temperature?: number
        maxTokens?: number
      }

  async function resolveRun(
    userId: string,
    body: { model?: string; messages?: StudioMessage[]; temperature?: number; maxTokens?: number },
  ): Promise<RunAccess> {
    const raw = messagesForProvider(body.messages ?? [])
    const messages = await hydrateChatFiles(userId, raw)
    if (messages.length === 0) return { ok: false, error: 'Write a prompt', status: 400 }
    const lastUser = [...messages].reverse().find(
      (item) => item.role === 'user' && !isHarnessUserText(typeof item.content === 'string' ? item.content : ''),
    )
    const lastText = typeof lastUser?.content === 'string' ? lastUser.content : ''
    const profile = await pool!.query(`SELECT plan FROM profiles WHERE user_id = $1`, [userId])
    const planId = String(profile.rows[0]?.plan || 'hobby')
    const desktopRun = (body as { mode?: AgentRunMode; workspaceRoot?: string }).mode
    const autoCatalog =
      !openAccessForBuilding() && (planId === 'hobby' || planId === 'trial')
        ? soumtokCodingModels().filter((item) => isTrialModel(item.id))
        : soumtokCodingModels()
    const hasFiles = Boolean((body as { workspaceRoot?: string }).workspaceRoot)
    const hasImage =
      (lastUser?.files || []).some((file) => /image\//.test(file.mime || '')) ||
      ((body as { files?: ChatFile[] }).files || []).some((file) => /image\//.test(file.mime || ''))
    const analysis = analyzeUserRequest(lastText, { hasFiles, hasImage, attachments: Boolean(lastUser?.files?.length) })
    const intelligence = String((body as { agentPrefs?: { intelligence?: string } }).agentPrefs?.intelligence || '')
    const requested = isAutoModel(body.model)
      ? pickAutoModel({
          models: autoCatalog.map((item) => ({ ...item, ready: true })),
          task: lastText,
          plan: planId,
          runMode: desktopRun || 'agent',
          hasFiles,
          hasImage,
          analysisKind: analysis.kind,
          intelligence: intelligence === 'fast' || intelligence === 'balanced' || intelligence === 'max' ? intelligence : undefined,
        })
      : body.model ?? ''
    const model = modelById(requested)
    const attached = (lastUser?.files || []).flatMap((file) => [file.text || '', file.analysis || ''])
    const leaked = scanSecrets(lastText, attached)
    if (leaked.hits.length > 0 || leaked.offering) {
      return {
        ok: false,
        status: 400,
        error: 'Do not paste API keys in chat. Add them in the workspace .env file or Dashboard → Keys.',
      }
    }
    for (const item of messages) {
      if (typeof item.content === 'string') item.content = redactSecrets(item.content)
      if (item.files) item.files = redactChatFiles(item.files) || []
    }

    let provider = model.provider
    let requestModel = upstreamModelId(model.id)
    let billedTo: 'user' | 'platform' = 'user'
    let apiKey = await userKey(userId, provider)
    if (!apiKey && provider !== 'openrouter') {
      const routed = await userKey(userId, 'openrouter')
      if (routed) {
        apiKey = routed
        provider = 'openrouter'
      }
    }
    if (!apiKey) {
      const native = platformKey(provider)
      if (native) {
        apiKey = native
        billedTo = 'platform'
      }
    }
    if (!apiKey && provider === 'openrouter') {
      const fallback = NATIVE_FALLBACK[model.id]
      const native = fallback ? platformKey(fallback.provider) : ''
      if (fallback && native) {
        apiKey = native
        provider = fallback.provider
        requestModel = fallback.model
        billedTo = 'platform'
      }
    }
    if (!apiKey) {
      return {
        ok: false,
        status: 402,
        error: `Add your ${model.provider} or OpenRouter key in API keys, or ask an admin to set the platform key.`,
        keys: model.keys,
      }
    }

    if (!openAccessForBuilding() && (planId === 'hobby' || planId === 'trial')) {
      const used = await pool!.query(
        `SELECT coalesce(sum(prompt_tokens + completion_tokens), 0)::int AS tokens
         FROM usage_events
         WHERE user_id = $1
           AND billed_to = 'platform'
           AND created_at >= date_trunc('month', now())`,
        [userId],
      )
      if ((used.rows[0]?.tokens || 0) >= TRIAL_TOKEN_QUOTA) {
        return { ok: false, status: 402, error: 'Your free trial ended. Upgrade to Pro to keep coding.' }
      }
    }

    return { ok: true, provider, requestModel, apiKey, billedTo, catalogModel: model.id, messages, temperature: body.temperature, maxTokens: body.maxTokens }
  }

  async function recordRun(
    userId: string,
    run: { provider: ModelProvider; requestModel: string; billedTo: 'user' | 'platform' },
    tokens: { promptTokens: number; completionTokens: number },
    started: number,
    source: 'studio' | 'desktop' = 'studio',
  ) {
    await pool!.query(
      `INSERT INTO usage_events (id, user_id, provider, model, prompt_tokens, completion_tokens, billed_to, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        crypto.randomUUID(),
        userId,
        run.provider,
        run.requestModel,
        tokens.promptTokens,
        tokens.completionTokens,
        run.billedTo,
        source,
      ],
    )
    await track(userId, source === 'desktop' ? 'desktop_agent_round' : 'studio_complete', source === 'desktop' ? '/desktop' : '/dashboard/studio', {
      model: run.requestModel,
      provider: run.provider,
      billedTo: run.billedTo,
      ms: Date.now() - started,
    })
  }

  app.post('/api/studio/complete', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const payload = await c.req.json()
    const access = await resolveRun(session.user.id, payload)
    if (!access.ok) return c.json({ error: access.error, keys: access.keys }, access.status)
    const { provider, requestModel, apiKey, billedTo, messages, temperature, maxTokens, catalogModel } = access

    const started = Date.now()
    const res = await fetch(completionUrl(provider, requestModel), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(provider === 'openrouter'
          ? { 'HTTP-Referer': env.betterAuthUrl, 'X-Title': 'Soumtok' }
          : {}),
        ...(provider === 'anthropic' ? anthropicRequestHeaders(apiKey) : {}),
      },
        body: JSON.stringify(requestBody(provider, requestModel, messages, { temperature, maxTokens, packModel: catalogModel || requestModel })),
      signal: AbortSignal.timeout(180_000),
    })

    const data = (await res.json()) as {
      error?: { message?: string } | string
      message?: string
      output_text?: string
      output?: { content?: { text?: string; type?: string }[] }[]
      choices?: { message?: { content?: string; reasoning_content?: string } }[]
      content?: { text?: string }[]
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        input_tokens?: number
        output_tokens?: number
      }
    }

    if (!res.ok) {
      const raw = extractError(data)
      const error =
        /no longer available to new users/i.test(raw)
          ? 'Google blocked Gemini 2.5 for new API keys. Soumtok uses Gemini 3.1 / 3.5 Flash Lite instead.'
          : /no credits remaining/i.test(raw)
            ? 'OpenAI has no credits left. Add billing credit, then GPT-4.1 Mini, Codex, and GPT-6 Astra will run.'
            : raw
      return c.json({ error }, 400)
    }

    const text = extractText(data)

    const promptTokens = data.usage?.prompt_tokens || data.usage?.input_tokens || 0
    const completionTokens = data.usage?.completion_tokens || data.usage?.output_tokens || 0

    await recordRun(session.user.id, { provider, requestModel, billedTo }, { promptTokens, completionTokens }, started)

    const shownModel = isAutoModel(payload.model) ? 'auto' : modelById(payload.model ?? '').id
    return c.json({
      text,
      model: shownModel,
      requestModel,
      provider,
      billedTo,
      promptTokens,
      completionTokens,
    })
  })

  app.post('/api/studio/complete/stream', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const payload = await c.req.json<{
      model?: string
      messages?: StudioMessage[]
      temperature?: number
      maxTokens?: number
      agent?: boolean
      files?: Record<string, string>
      repo?: string
      mode?: DesktopAgentMode
      agentPrefs?: Record<string, unknown>
      workspaceRoot?: string
      openFiles?: string[]
    }>()
    const access = await resolveRun(session.user.id, payload)
    if (!access.ok) return c.json({ error: access.error, keys: access.keys }, access.status)
    let { provider, requestModel, apiKey, billedTo, messages, temperature, maxTokens, catalogModel } = access

    const started = Date.now()
    const body = payload

    if (body.agent) {
      const agentPrefs = applyRunModeToPrefs(mergeDesktopAgentPrefs(body.agentPrefs))
      const prep = prepareDesktopAgentTurn({
        messages: body.messages,
        workspaceRoot: body.workspaceRoot || body.repo || 'studio-sandbox',
        openFiles: openFilesForAgent(body.openFiles, agentPrefs),
        mode: body.mode || 'agent',
        agentPrefs,
        model: catalogModel || requestModel,
      })
      const work = messages.map((item) => ({ ...item }))
      const sysIdx = work.findIndex((item) => item.role === 'system')
      if (sysIdx >= 0) work[sysIdx] = { ...work[sysIdx], content: prep.systemPrompt }
      else work.unshift({ role: 'system', content: prep.systemPrompt })
      for (let i = work.length - 1; i >= 0; i--) {
        if (work[i].role === 'user') {
          work[i] = { ...work[i], content: prep.userText }
          break
        }
      }
      messages = compactConversation(work)
      temperature = prep.temperature
      maxTokens = prep.maxTokens
    }

    const userId = session.user.id
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder()
        const send = (payload: Record<string, unknown>) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))

        let promptTokens = 0
        let completionTokens = 0
        let lastText = ''
        let files = sanitizeToolFiles(body.files)
        const startStamp = filesStamp(files)
        const work = messages.map((item) => ({ ...item }))
        const sandboxDir = body.agent ? await createSandboxDir() : undefined
        const maxRounds = body.agent ? 12 : 1
        let failed = ''
        try {
          for (let round = 0; round < maxRounds; round++) {
            let ran: Awaited<ReturnType<typeof streamModel>>
            try {
              ran = await streamModel({
                provider,
                requestModel,
                mediaModel: catalogModel || requestModel,
                apiKey,
                messages: work,
                temperature,
                maxTokens,
                tools: Boolean(body.agent),
                timeoutMs: body.agent ? 480_000 : 180_000,
                onDelta: (delta) => send({ delta }),
                onToolProgress: (calls) => send({ progress: calls }),
              })
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error)
              const written = Object.keys(files).filter((path) => files[path]?.trim() && !path.endsWith('/.keep'))
              if (body.agent && isTransientStreamError(message) && round < maxRounds - 1) {
                work.push({
                  role: 'user',
                  content: written.length
                    ? `The last stream was cut off. Continue from the files already in the workspace (${written.join(', ')}). Call write for the next missing file with the full body. Do not start over.`
                    : 'The last stream was cut off. Continue. Call write for the next file with the full body.',
                })
                send({ reset: true })
                continue
              }
              throw error
            }
            lastText = ran.text
            promptTokens += ran.promptTokens
            completionTokens += ran.completionTokens
            if (!body.agent) break
            const parsed = parseAgentRun(ran.text)
            for (const [path, content] of Object.entries(parsed.files || {})) {
              if (typeof content === 'string' && content.trim() && !path.endsWith('/.keep')) files[path] = content
            }
            const native = studioToolsFromNative(ran.toolCalls)
            const jsonTools = pendingToolsForRun(parsed.events)
            const tools = skipDisplayDiffs(skipKnownReads(native.length ? native : jsonTools, files))
            send({ round, text: ran.text })
            const systemPrompt = work.find((item) => item.role === 'system')?.content || ''
            const missing = missingManifestFiles(files, promptManifestSpec(systemPrompt))
            const written = Object.keys(files).filter((path) => files[path]?.trim() && !path.endsWith('/.keep'))
            if (tools.length === 0) {
              const stillIdle = filesStamp(files) === startStamp
              if (
                shouldNudgeWrite({
                  agent: Boolean(body.agent),
                  round,
                  maxRounds,
                  stillIdle,
                  toolCount: tools.length,
                  systemPrompt,
                  modelText: ran.text || '',
                  missing,
                }) ||
                (body.agent && round < 2 && stillIdle && looksLikePlanTalk(ran.text || ''))
              ) {
                work.push({
                  role: 'user',
                  content: writeNudgeMessage(missing, written),
                })
                send({ reset: true })
                continue
              }
              break
            }
            send({ tools: tools.map((item) => ({ name: item.name, args: item.args })) })
            const executed = await runStudioTools(userId, tools, files, { repo: body.repo, sandboxDir })
            files = executed.files
            for (const [index, out] of executed.outcomes.entries()) {
              send({
                result: {
                  name: out.name,
                  ok: out.ok,
                  text: out.text.slice(0, 2500),
                  files: out.files,
                  command: tools[index]?.args.command || tools[index]?.args.cmd,
                },
              })
            }
            const stillMissing = missingManifestFiles(files, promptManifestSpec(systemPrompt))
            if (!toolsShouldContinue(tools, executed.outcomes, { missing: stillMissing })) break
            if (native.length) {
              work.push({
                role: 'assistant',
                content: ran.text,
                tool_calls: openaiToolCalls(ran.toolCalls),
              })
              executed.outcomes.forEach((out, index) => {
                work.push({
                  role: 'tool',
                  tool_call_id: native[index]?.id || ran.toolCalls[index]?.id,
                  content: out.text.slice(0, 12_000),
                  name: out.name,
                })
              })
            } else {
              const extra = `${TOOL_ROUND_MARKER}\n${executed.followUp}\n\nWORKSPACE FILES AFTER TOOLS:\n${packWorkspaceFiles(files, 60_000)}`
              const system = work.find((item) => item.role === 'system')
              // Replace last round's block. Appending stacked a stale copy of the whole
              // workspace every round until the real instructions were buried.
              if (system) system.content = `${stripToolRoundBlock(system.content)}\n\n${extra}`
              else work.unshift({ role: 'system', content: extra })
            }
            if (stillMissing.length) {
              work.push({
                role: 'user',
                content: writeNudgeMessage(
                  stillMissing,
                  Object.keys(files).filter((path) => files[path]?.trim() && !path.endsWith('/.keep')),
                ),
              })
            }
            send({ reset: true })
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Stream failed'
          const written = Object.keys(files).filter((path) => files[path]?.trim() && !path.endsWith('/.keep'))
          if (body.agent && written.length && isTransientStreamError(message)) {
            failed = ''
          } else {
            failed = friendlyStreamError(message)
            send({ error: failed })
          }
        } finally {
          await removeSandboxDir(sandboxDir)
        }

        await recordRun(userId, { provider, requestModel, billedTo }, { promptTokens, completionTokens }, started).catch(
          () => undefined,
        )
        if (!failed) {
          send({ done: true, text: lastText, model: requestModel, provider, billedTo, promptTokens, completionTokens, files })
        }
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  })

  app.post('/api/studio/image', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const body = await c.req.json<{ prompt?: string; model?: string; aspect?: string; source?: string }>()
    const usageSource = body.source === 'desktop' ? 'desktop' : 'studio'
    const prompt = body.prompt?.trim() ?? ''
    const started = Date.now()
    const modelId = body.model?.trim() || IMAGE_MODEL.id
    const chargeTokens = imageChargeTokens(modelId)
    const profile = await pool.query(`SELECT plan FROM profiles WHERE user_id = $1`, [session.user.id])
    const planId = String(profile.rows[0]?.plan || 'hobby')
    const budget = await assertPlatformTokenBudget(pool, session.user.id, planId, chargeTokens)
    if (!budget.ok) return c.json({ error: budget.error }, budget.status)

    let generated
    try {
      generated = await generateStillImage(prompt, body.model, body.aspect)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Image generation failed'
      const status = /not configured/i.test(message) ? 503 : 400
      return c.json({ error: message }, status)
    }

    const id = crypto.randomUUID()
    let url: string | null = null
    if (hasBunny()) {
      await uploadToBunny(
        `users/${session.user.id}/studio/${id}.${generated.ext}`,
        generated.bytes,
        generated.contentType,
      )
      url = `/api/studio/images/${id}.${generated.ext}`
    }

    const billed = await recordImageUsage(pool, session.user.id, generated.model.id, generated.model.provider, usageSource)
    await track(session.user.id, usageSource === 'desktop' ? 'desktop_image' : 'studio_image', usageSource === 'desktop' ? '/desktop' : '/dashboard/studio', {
      model: generated.model.id,
      ms: Date.now() - started,
      tokens: billed.tokens,
      chargeUsd: billed.chargeUsd,
      vendorUsd: billed.vendorUsd,
    })

    const payload: Record<string, unknown> = {
      id,
      url,
      ext: generated.ext,
      contentType: generated.contentType,
      model: generated.model.id,
      aspect: generated.aspect,
      billedTo: 'platform',
      tokens: billed.tokens,
      chargeUsd: billed.chargeUsd,
      vendorUsd: billed.vendorUsd,
    }
    // Do not stuff a full JPEG as base64 into JSON when a URL exists — Cloudflare
    // truncates that payload and Desktop then reports "No image bytes returned".
    if (!url) payload.base64 = Buffer.from(generated.bytes).toString('base64')
    return c.json(payload)
  })

  app.post('/api/studio/examine-media', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{ mime?: string; base64?: string; prompt?: string }>()
    const mime = String(body.mime || '').trim()
    const base64 = String(body.base64 || '').replace(/^data:[^;]+;base64,/, '')
    if (!base64) return c.json({ error: 'Attach image or video bytes' }, 400)
    try {
      const out = await examineMediaBytes({ mime, base64, prompt: body.prompt })
      return c.json({ ok: true, ...out })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not examine media'
      const status = /needs .*API_KEY/i.test(message) ? 503 : 400
      return c.json({ error: message }, status)
    }
  })

  app.get('/api/studio/images/:file', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const file = safeFileName(c.req.param('file'))
    if (!/^[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i.test(file)) {
      return c.json({ error: 'Not found' }, 404)
    }

    const stored = await downloadFromBunny(`users/${session.user.id}/studio/${file}`)
    return new Response(stored.bytes, {
      headers: { 'Content-Type': stored.contentType, 'Cache-Control': 'private, max-age=300' },
    })
  })

  app.put('/api/me/photo/:kind', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    if (!hasBunny()) return c.json({ error: 'Storage is not connected' }, 503)

    const kind = c.req.param('kind')
    if (kind !== 'avatar' && kind !== 'company') return c.json({ error: 'Unknown photo' }, 400)

    const form = await c.req.formData()
    const uploaded = form.get('file')
    if (!(uploaded instanceof File)) return c.json({ error: 'Choose an image' }, 400)
    if (uploaded.size > 6 * 1024 * 1024) return c.json({ error: 'Image must be under 6 MB' }, 400)
    if (!uploaded.type.startsWith('image/')) return c.json({ error: 'Upload an image' }, 400)

    const name = safeFileName(uploaded.name)
    const path = `users/${session.user.id}/${kind}/${name}`
    await uploadToBunny(path, new Uint8Array(await uploaded.arrayBuffer()), uploaded.type)
    const column = kind === 'avatar' ? 'avatar_path' : 'company_logo_path'
    await pool.query(`UPDATE profiles SET ${column} = $2, updated_at = NOW() WHERE user_id = $1`, [
      session.user.id,
      path,
    ])
    await track(session.user.id, 'photo_saved', '/dashboard/settings', { kind })
    return c.json({ ok: true, kind })
  })

  app.get('/api/me/photo/:kind', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const kind = c.req.param('kind')
    const column = kind === 'company' ? 'company_logo_path' : 'avatar_path'
    const result = await pool.query(`SELECT ${column} AS path FROM profiles WHERE user_id = $1`, [
      session.user.id,
    ])
    const path = result.rows[0]?.path as string | undefined
    if (!path) return c.json({ error: 'Not found' }, 404)
    const stored = await downloadFromBunny(path)
    return new Response(stored.bytes, {
      headers: { 'Content-Type': stored.contentType, 'Cache-Control': 'private, max-age=120' },
    })
  })

  app.put('/api/me/workspace', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{ companyName?: string; companyRole?: string }>()
    await pool.query(
      `UPDATE profiles
       SET company_name = $2, company_role = $3, updated_at = NOW()
       WHERE user_id = $1`,
      [session.user.id, body.companyName?.trim() || null, body.companyRole?.trim() || null],
    )
    return c.json({ ok: true })
  })

  app.put('/api/me/settings', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const body = await c.req.json<{
      firstName?: string
      lastName?: string
      links?: string[]
      publicProfile?: boolean
      shareUsageData?: boolean
      theme?: string
      lightTheme?: string
      darkTheme?: string
      prProvider?: string
      username?: string
    }>()

    let username: string | undefined
    if (body.username != null) {
      username = normalizeUsername(body.username)
      const issue = usernameError(username)
      if (issue) return c.json({ error: issue }, 400)
      const taken = await pool.query(
        `SELECT user_id FROM profiles WHERE lower(username) = lower($1) AND user_id <> $2`,
        [username, session.user.id],
      )
      if (taken.rowCount) return c.json({ error: 'That username is already taken' }, 409)
    }

    const links = Array.isArray(body.links)
      ? body.links.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
      : null
    const theme = ['system', 'light', 'dark'].includes(body.theme || '') ? body.theme : null
    const prProvider = ['github', 'soumtok', 'graphite'].includes(body.prProvider || '')
      ? body.prProvider
      : null

    await pool.query(
      `UPDATE profiles SET
         first_name = $2,
         last_name = $3,
         profile_links = $4::jsonb,
         public_profile = $5,
         share_usage_data = $6,
         theme = $7,
         light_theme = $8,
         dark_theme = $9,
         pr_provider = $10,
         username = COALESCE($11, username),
         updated_at = NOW()
       WHERE user_id = $1`,
      [
        session.user.id,
        body.firstName?.trim() || null,
        body.lastName?.trim() || null,
        JSON.stringify(links ?? []),
        Boolean(body.publicProfile),
        body.shareUsageData !== false,
        theme || 'system',
        body.lightTheme || 'soumtok-light',
        body.darkTheme || 'soumtok-dark',
        prProvider || 'github',
        username || null,
      ],
    )
    return c.json({ ok: true })
  })

  app.put('/api/me/public-profile', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const body = await c.req.json<{
      username?: string
      links?: string[]
      publicProfile?: boolean
    }>()

    let username: string | undefined
    if (body.username != null) {
      username = normalizeUsername(body.username)
      const issue = usernameError(username)
      if (issue) return c.json({ error: issue }, 400)
      const taken = await pool.query(
        `SELECT user_id FROM profiles WHERE lower(username) = lower($1) AND user_id <> $2`,
        [username, session.user.id],
      )
      if (taken.rowCount) return c.json({ error: 'That username is already taken' }, 409)
    }

    const links = Array.isArray(body.links)
      ? body.links.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
      : null

    await pool.query(
      `UPDATE profiles SET
         username = COALESCE($2, username),
         profile_links = COALESCE($3::jsonb, profile_links),
         public_profile = COALESCE($4, public_profile),
         updated_at = NOW()
       WHERE user_id = $1`,
      [
        session.user.id,
        username || null,
        links ? JSON.stringify(links) : null,
        typeof body.publicProfile === 'boolean' ? body.publicProfile : null,
      ],
    )
    return c.json({ ok: true })
  })

  app.get('/api/me/sessions', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const cols = await sessionCols(pool)
    const rows = await pool.query(
      `SELECT id, ${cols.createdAt} AS created_at, ${cols.userAgent} AS user_agent, ${cols.token} AS token
       FROM ${cols.table} WHERE ${cols.userId} = $1 ORDER BY ${cols.createdAt} DESC`,
      [session.user.id],
    )
    const currentToken = 'token' in session && typeof session.token === 'string' ? session.token : ''
    return c.json({
      sessions: rows.rows.map((row: { id: string; created_at: Date | string; user_agent: string | null; token: string }) => ({
        id: row.id,
        createdAt: row.created_at,
        device: deviceLabel(row.user_agent),
        current: Boolean(currentToken && row.token === currentToken),
      })),
    })
  })

  app.delete('/api/me/sessions/:id', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const cols = await sessionCols(pool)
    await pool.query(`DELETE FROM ${cols.table} WHERE id = $1 AND ${cols.userId} = $2`, [
      c.req.param('id'),
      session.user.id,
    ])
    return c.json({ ok: true })
  })

  app.get('/api/me/security', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !auth) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const headers = c.req.raw.headers
    const accounts = await auth.api.listUserAccounts({ headers }).catch(() => [])
    const passkeys = await auth.api.listPasskeys({ headers }).catch(() => [])
    const hasPassword = (Array.isArray(accounts) ? accounts : []).some(
      (item: { providerId?: string }) => item.providerId === 'credential',
    )
    return c.json({
      twoFactorEnabled: Boolean((session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled),
      hasPassword,
      passkeys: (Array.isArray(passkeys) ? passkeys : []).map(
        (item: { id?: string; name?: string | null; createdAt?: Date | string }) => ({
          id: item.id,
          name: item.name || 'Passkey',
          createdAt: item.createdAt,
        }),
      ),
    })
  })

  app.post('/api/me/security/code', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    if (!session.user.email) return c.json({ error: 'No email on this account' }, 400)
    const body = await c.req.json<{ action?: string }>().catch(() => ({ action: '' }))
    const action = body.action?.trim() || 'change a security method'
    const code = await issueCode(session.user.id, 'security', session.user.email)
    const mail = securityChangeEmail(code, action)
    await sendMail(session.user.email, mail.subject, mail.text, mail.html)
    return c.json({ ok: true, email: session.user.email })
  })

  app.post('/api/me/security/remove', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !auth || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{ type?: string; code?: string; passkeyId?: string }>()
    const code = body.code?.trim() || ''
    const type = body.type
    if (!code) return c.json({ error: 'Enter the 6-digit code from your email' }, 400)
    if (type !== '2fa' && type !== 'passkey' && type !== 'password') {
      return c.json({ error: 'Unknown security method' }, 400)
    }
    if (!session.user.email) return c.json({ error: 'No email on this account' }, 400)
    const ok = await consumeCode(session.user.id, 'security', session.user.email, code)
    if (!ok) return c.json({ error: 'That code is invalid or expired' }, 400)

    if (type === '2fa') {
      await pool.query(`UPDATE "user" SET "twoFactorEnabled" = false WHERE id = $1`, [session.user.id]).catch(() =>
        pool!.query(`UPDATE "user" SET two_factor_enabled = false WHERE id = $1`, [session.user.id]),
      )
      await pool.query(`DELETE FROM "twoFactor" WHERE "userId" = $1`, [session.user.id]).catch(() =>
        pool!.query(`DELETE FROM two_factor WHERE user_id = $1`, [session.user.id]),
      )
      return c.json({ ok: true, removed: '2fa' })
    }

    if (type === 'password') {
      await pool.query(`DELETE FROM account WHERE "userId" = $1 AND "providerId" = 'credential'`, [session.user.id]).catch(
        () => pool!.query(`DELETE FROM account WHERE user_id = $1 AND provider_id = 'credential'`, [session.user.id]),
      )
      return c.json({ ok: true, removed: 'password' })
    }

    const keys = await auth.api.listPasskeys({ headers: c.req.raw.headers }).catch(() => [])
    const list = Array.isArray(keys) ? keys : []
    const ids = body.passkeyId ? [body.passkeyId] : list.map((item: { id?: string }) => item.id).filter(Boolean)
    for (const id of ids) {
      await auth.api.deletePasskey({ body: { id: String(id) }, headers: c.req.raw.headers }).catch(() => undefined)
    }
    return c.json({ ok: true, removed: 'passkey' })
  })

  app.post('/api/me/password', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !auth) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{ currentPassword?: string; newPassword?: string }>()
    const next = body.newPassword?.trim() || ''
    if (next.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400)
    try {
      if (body.currentPassword?.trim()) {
        await auth.api.changePassword({
          body: { currentPassword: body.currentPassword.trim(), newPassword: next },
          headers: c.req.raw.headers,
        })
      } else {
        await auth.api.setPassword({
          body: { newPassword: next },
          headers: c.req.raw.headers,
        })
      }
      return c.json({ ok: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update password'
      return c.json({ error: message.replace(/^API Error:?\s*/i, '') || 'Could not update password' }, 400)
    }
  })

  app.post('/api/automations/hook/:token', async (c) => {
    if (!pool) return c.json({ error: 'Unavailable' }, 503)
    const token = c.req.param('token')
    const found = await pool.query(
      `SELECT id, user_id, title FROM automations
       WHERE EXISTS (
           SELECT 1 FROM jsonb_array_elements(triggers) AS item
           WHERE item->>'type' = 'webhook' AND item->'config'->>'token' = $1
         )
       LIMIT 1`,
      [token],
    )
    if (!found.rowCount) return c.json({ error: 'Unknown webhook' }, 404)
    const runId = crypto.randomUUID()
    await pool.query(
      `INSERT INTO automation_runs (id, automation_id, user_id, status, detail)
       VALUES ($1, $2, $3, 'queued', $4)`,
      [runId, found.rows[0].id, found.rows[0].user_id, `Webhook · ${found.rows[0].title || 'Untitled'}`],
    )
    return c.json({ ok: true, runId })
  })

  app.get('/api/automations', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const result = await pool.query(
      `SELECT id, title, active, repo_id, repo_name, instructions, model, triggers, tools, created_at, updated_at
       FROM automations WHERE user_id = $1 ORDER BY updated_at DESC`,
      [session.user.id],
    )
    return c.json({ automations: result.rows })
  })

  app.post('/api/automations', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const id = crypto.randomUUID()
    await pool.query(
      `INSERT INTO automations (id, user_id) VALUES ($1, $2)`,
      [id, session.user.id],
    )
    const result = await pool.query(`SELECT * FROM automations WHERE id = $1`, [id])
    return c.json(result.rows[0])
  })

  app.put('/api/automations/:id', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{
      title?: string
      active?: boolean
      repoId?: string | null
      repoName?: string | null
      instructions?: string
      model?: string | null
      triggers?: unknown
      tools?: unknown
    }>()
    const triggers = Array.isArray(body.triggers) ? body.triggers : []
    if (triggers.length === 0) return c.json({ error: 'Add a trigger before saving.' }, 400)
    await pool.query(
      `UPDATE automations SET
         title = $3,
         active = $4,
         repo_id = $5,
         repo_name = $6,
         instructions = $7,
         model = $8,
         triggers = $9::jsonb,
         tools = $10::jsonb,
         updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [
        c.req.param('id'),
        session.user.id,
        (body.title || 'Untitled').trim() || 'Untitled',
        Boolean(body.active),
        body.repoId || null,
        body.repoName || null,
        body.instructions || '',
        body.model || null,
        JSON.stringify(triggers),
        JSON.stringify(Array.isArray(body.tools) ? body.tools : []),
      ],
    )
    const result = await pool.query(`SELECT * FROM automations WHERE id = $1 AND user_id = $2`, [
      c.req.param('id'),
      session.user.id,
    ])
    if (!result.rowCount) return c.json({ error: 'Not found' }, 404)
    return c.json(result.rows[0])
  })

  app.get('/api/automations/:id/runs', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const owned = await pool.query(
      `SELECT id FROM automations WHERE id = $1 AND user_id = $2`,
      [c.req.param('id'), session.user.id],
    )
    if (!owned.rowCount) return c.json({ error: 'Not found' }, 404)
    const result = await pool.query(
      `SELECT id, status, detail, created_at FROM automation_runs
       WHERE automation_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 50`,
      [c.req.param('id'), session.user.id],
    )
    return c.json({ runs: result.rows })
  })

  app.post('/api/automations/:id/test', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const owned = await pool.query(
      `SELECT id, triggers, title FROM automations WHERE id = $1 AND user_id = $2`,
      [c.req.param('id'), session.user.id],
    )
    if (!owned.rowCount) return c.json({ error: 'Not found' }, 404)
    const triggers = owned.rows[0].triggers
    if (!Array.isArray(triggers) || triggers.length === 0) {
      return c.json({ error: 'Add a trigger before saving.' }, 400)
    }
    const body = await c.req.json<{ detail?: string }>().catch(() => ({ detail: '' }))
    const id = crypto.randomUUID()
    await pool.query(
      `INSERT INTO automation_runs (id, automation_id, user_id, status, detail)
       VALUES ($1, $2, $3, 'queued', $4)`,
      [
        id,
        c.req.param('id'),
        session.user.id,
        body.detail?.trim() || `Test run for ${owned.rows[0].title || 'Untitled'}`,
      ],
    )
    const result = await pool.query(`SELECT id, status, detail, created_at FROM automation_runs WHERE id = $1`, [id])
    return c.json(result.rows[0])
  })

  app.delete('/api/me', async (c) => {
    const { session } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    const body = await c.req.json<{ email?: string; confirm?: string }>().catch(() => ({}))
    const accountEmail = session.user.email || ''
    if (!accountEmail) return c.json({ error: 'This account has no email to confirm.' }, 400)
    if (normalizeEmail(body.email || '') !== normalizeEmail(accountEmail)) {
      return c.json({ error: 'Type the email on this account to confirm.' }, 400)
    }
    if ((body.confirm || '').trim().toLowerCase() !== 'delete') {
      return c.json({ error: 'Type delete to confirm.' }, 400)
    }
    const id = session.user.id
    await flagDeletedEmail(accountEmail, id)
    const pluginBundles = await pool.query(`SELECT bundle_path FROM user_plugins WHERE user_id = $1`, [id]).catch(() => ({ rows: [] as { bundle_path: string | null }[] }))
    for (const row of pluginBundles.rows) {
      if (row.bundle_path) await deleteFromBunny(row.bundle_path).catch(() => undefined)
    }
    const wipe = [
      `DELETE FROM user_api_keys WHERE user_id = $1`,
      `DELETE FROM ssh_keys WHERE user_id = $1`,
      `DELETE FROM user_plugins WHERE user_id = $1`,
      `DELETE FROM user_connectors WHERE user_id = $1`,
      `DELETE FROM user_skills WHERE user_id = $1`,
      `DELETE FROM studio_projects WHERE user_id = $1`,
      `DELETE FROM usage_events WHERE user_id = $1`,
      `DELETE FROM analytics_events WHERE user_id = $1`,
      `DELETE FROM provider_keys WHERE user_id = $1`,
      `DELETE FROM automation_runs WHERE user_id = $1`,
      `DELETE FROM automations WHERE user_id = $1`,
      `DELETE FROM documents WHERE user_id = $1`,
      `DELETE FROM files WHERE user_id = $1`,
      `DELETE FROM billing_orders WHERE user_id = $1`,
      `DELETE FROM billing_events WHERE user_id = $1`,
      `DELETE FROM verification_codes WHERE user_id = $1`,
      `DELETE FROM profiles WHERE user_id = $1`,
    ]
    for (const sql of wipe) {
      await pool.query(sql, [id]).catch(() => undefined)
    }
    const cols = await sessionCols(pool)
    await pool.query(`DELETE FROM ${cols.table} WHERE ${cols.userId} = $1`, [id]).catch(() => undefined)
    await pool.query(`DELETE FROM "twoFactor" WHERE "userId" = $1`, [id]).catch(() =>
      pool!.query(`DELETE FROM two_factor WHERE user_id = $1`, [id]).catch(() => undefined),
    )
    await pool.query(`DELETE FROM passkey WHERE "userId" = $1`, [id]).catch(() =>
      pool!.query(`DELETE FROM passkey WHERE user_id = $1`, [id]).catch(() => undefined),
    )
    await pool.query(`DELETE FROM "account" WHERE "userId" = $1`, [id]).catch(() => undefined)
    await pool.query(`DELETE FROM account WHERE user_id = $1`, [id]).catch(() => undefined)
    await pool.query(`DELETE FROM "user" WHERE id = $1`, [id]).catch(() => undefined)
    return c.json({
      ok: true,
      flagged: true,
      message:
        'Your account is deleted. This email is flagged and cannot be used again to create a Soumtok account.',
    })
  })
}

function deviceLabel(agent: string | null) {
  const value = (agent || '').toLowerCase()
  if (/electron|soumtok|desktop/.test(value)) return 'Desktop App'
  return 'Web'
}

async function sessionCols(db: NonNullable<typeof pool>) {
  const result = await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND lower(table_name) = 'session'`,
  )
  const names = new Set(result.rows.map((row: { column_name: string }) => row.column_name))
  const table = names.has('userId') || names.has('createdAt') ? '"session"' : 'session'
  const q = (camel: string, snake: string) => (names.has(camel) ? `"${camel}"` : snake)
  return {
    table,
    userId: q('userId', 'user_id'),
    createdAt: q('createdAt', 'created_at'),
    userAgent: q('userAgent', 'user_agent'),
    token: names.has('token') ? 'token' : 'token',
  }
}
