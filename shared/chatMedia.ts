export type ChatFile = {
  name: string
  mime: string
  size: number
  id?: string
  documentId?: string
  dataUrl?: string
  text?: string
  analysis?: string
}

export type ChatTurn = {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  files?: ChatFile[]
  tool_call_id?: string
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  name?: string
}

export type ModelMedia = {
  image: boolean
  video: boolean
  pdf: boolean
}

/** DeepSeek V4.1 Flash (`deepseek-flash`) is multimodal. Chat/reasoner/Pro are text-only. */
export function deepseekSeesImages(modelId: string) {
  const id = (modelId || '').toLowerCase()
  if (!/deepseek/.test(id)) return false
  if (/deepseek-chat$|reasoner|coder/.test(id) && !/vision/.test(id)) return false
  if (/v4-pro/.test(id) && !/vision/.test(id)) return false
  return /vision|deepseek-flash|v4-flash/.test(id)
}

/** What this coding model can actually see. Not every model takes media. */
export function modelMedia(modelId: string): ModelMedia {
  const id = (modelId || '').toLowerCase()
  if (/gemma|gpt-3\.5/.test(id)) return { image: false, video: false, pdf: false }
  if (/deepseek/.test(id)) {
    return { image: deepseekSeesImages(id), video: false, pdf: false }
  }
  const image =
    /gemini|claude|grok|gpt-4o|gpt-4\.1|gpt-4-turbo|^gpt-4$|gpt-5|gpt-6|codex|o3|o4|vision/.test(id)
  const video = /gemini/.test(id)
  const pdf = image && !/grok/.test(id)
  return { image, video, pdf }
}

export function messageHasBody(item: {
  role?: string
  content?: string
  files?: ChatFile[]
  tool_calls?: unknown[]
  tool_call_id?: string
}) {
  if (item.role === 'tool') return Boolean(item.tool_call_id)
  if (item.role === 'assistant' && item.tool_calls?.length) return true
  return Boolean(item.content?.trim() || item.files?.length)
}

/** Drop orphan tool rows and ensure tool_call ids before provider APIs (desktop multi-round harness). */
export function normalizeChatMessagesForAgent(messages: ChatTurn[]): ChatTurn[] {
  const kept: ChatTurn[] = []
  for (const item of messages) {
    if (item.role === 'tool') {
      const id = item.tool_call_id
      if (!id) continue
      const parent = [...kept]
        .reverse()
        .find((m) => m.role === 'assistant' && m.tool_calls?.some((tc) => tc.id === id))
      if (parent) kept.push(item)
      continue
    }
    if (!messageHasBody(item)) continue
    if (item.role === 'assistant' && item.tool_calls?.length) {
      kept.push({
        ...item,
        content: item.content?.trim() ? item.content : '',
        tool_calls: item.tool_calls.map((tc, index) => ({
          ...tc,
          id: tc.id || `call_${index}_${kept.length}`,
        })),
      })
      continue
    }
    kept.push(item)
  }
  return kept
}

/** OpenAI/DeepSeek require tool rows to follow their assistant tool_calls with no gaps. */
export function repairToolConversation(messages: ChatTurn[]): ChatTurn[] {
  const normalized = normalizeChatMessagesForAgent(messages)
  const out: ChatTurn[] = []
  let pendingIds: Set<string> | null = null

  const dropIncompleteToolTurn = () => {
    while (out.length && out[out.length - 1].role === 'tool') out.pop()
    const last = out[out.length - 1]
    if (last?.role === 'assistant' && last.tool_calls?.length) out.pop()
    pendingIds = null
  }

  for (const item of normalized) {
    if (pendingIds?.size) {
      if (item.role === 'tool' && item.tool_call_id && pendingIds.has(item.tool_call_id)) {
        out.push(item)
        pendingIds.delete(item.tool_call_id)
        if (!pendingIds.size) pendingIds = null
        continue
      }
      dropIncompleteToolTurn()
    }
    if (item.role === 'tool') continue
    if (item.role === 'assistant' && item.tool_calls?.length) {
      out.push(item)
      pendingIds = new Set(item.tool_calls.map((tc) => tc.id).filter(Boolean) as string[])
      continue
    }
    out.push(item)
  }
  if (pendingIds?.size) dropIncompleteToolTurn()
  return out
}

/** Shape-repair only. Length budgeting lives in compactConversation — never cap here. */
function toolContentPassthrough(text: unknown) {
  return String(text ?? '')
}

function toolTurnDigest(
  assistant: ChatTurn,
  tools: ChatTurn[],
): string {
  const header = assistant.content?.trim() ? `${assistant.content.trim()}\n\n` : ''
  const body = tools
    .map((t) => `[${t.name || 'tool'}]\n${toolContentPassthrough(t.content)}`)
    .join('\n\n---\n\n')
  return `${header}Tool results on the user's machine:\n${body}`
}

function providerToolCalls(item: ChatTurn) {
  return (item.tool_calls || []).map((tc, index) => ({
    ...tc,
    id: tc.id || `call_${index}`,
    type: 'function' as const,
    function: {
      name: tc.function?.name || 'tool',
      arguments: tc.function?.arguments || '{}',
    },
  }))
}

function providerToolRow(callId: string, name: string, content: unknown): ChatTurn {
  return {
    role: 'tool',
    tool_call_id: callId,
    name: name || 'tool',
    content: toolContentPassthrough(content) || '(no output)',
  }
}

/**
 * OpenAI / DeepSeek / GPT-5.5: every `role: tool` must sit immediately after the
 * assistant `tool_calls` it answers, in that same order, with matching ids.
 * Interstitial user/image rows (follow-up attaches, harness nudges) are moved
 * to after the tool results so they cannot break the chain.
 */
export function flattenToolTurnsForProvider(messages: ChatTurn[]): ChatTurn[] {
  const raw = (messages || []).filter(Boolean)
  const toolIndex = new Map<string, ChatTurn>()
  for (const item of raw) {
    if (item.role === 'tool' && item.tool_call_id && !toolIndex.has(item.tool_call_id)) {
      toolIndex.set(item.tool_call_id, item)
    }
  }
  const claimed = new Set<string>()
  const out: ChatTurn[] = []
  for (const item of raw) {
    if (item.role === 'assistant' && item.tool_calls?.length) {
      const calls = providerToolCalls(item)
      out.push({
        role: 'assistant',
        content: item.content?.trim() ? item.content : '',
        tool_calls: calls,
      })
      for (const tc of calls) {
        const hit = toolIndex.get(tc.id)
        claimed.add(tc.id)
        out.push(
          providerToolRow(
            tc.id,
            hit?.name || tc.function.name,
            hit?.content || '(tool produced no result — continue with what you have.)',
          ),
        )
      }
      continue
    }
    if (item.role === 'tool') {
      if (item.tool_call_id && claimed.has(item.tool_call_id)) continue
      out.push({
        role: 'user',
        content: `[${item.name || 'tool'}]\n${toolContentPassthrough(item.content)}`,
      })
      if (item.tool_call_id) claimed.add(item.tool_call_id)
      continue
    }
    out.push(item)
  }
  return out.filter(
    (m) => messageHasBody(m) || (m.role === 'assistant' && m.tool_calls?.length),
  )
}

/** True when every tool row immediately follows its assistant tool_calls in id order. */
export function isProviderToolChainValid(messages: ChatTurn[]): boolean {
  let pending: string[] | null = null
  for (const item of messages || []) {
    if (pending?.length) {
      if (item.role !== 'tool' || item.tool_call_id !== pending[0]) return false
      pending.shift()
      if (!pending.length) pending = null
      continue
    }
    if (item.role === 'tool') return false
    if (item.role === 'assistant' && item.tool_calls?.length) {
      pending = item.tool_calls.map((tc) => tc.id).filter(Boolean)
      if (!pending.length) return false
    }
  }
  return !pending?.length
}

/**
 * Flatten to a valid OpenAI tool chain. Never fold to a 12k digest — that
 * blinds the model (one 48KB read plus grep becomes ~9KB of mush).
 * If flatten is still illegal, repair at the source and flatten again.
 */
export function messagesForProvider(messages: ChatTurn[]): ChatTurn[] {
  const flat = flattenToolTurnsForProvider(messages)
  if (isProviderToolChainValid(flat)) return flat
  return flattenToolTurnsForProvider(repairToolConversation(messages))
}

/** Persisted / follow-up history: no tool or tool_calls roles (avoids provider chain errors). */
export function storageSafeModelMessages(messages: ChatTurn[]): ChatTurn[] {
  const flat = flattenToolTurnsForProvider(repairToolConversation(messages))
  const out: ChatTurn[] = []
  for (let i = 0; i < flat.length; i++) {
    const item = flat[i]
    if (item.role === 'assistant' && item.tool_calls?.length) {
      const tools: ChatTurn[] = []
      let j = i + 1
      while (j < flat.length && flat[j].role === 'tool') {
        tools.push(flat[j])
        j++
      }
      out.push({ role: 'user', content: toolTurnDigest(item, tools) })
      i = j - 1
      continue
    }
    if (item.role === 'tool') {
      out.push({
        role: 'user',
        content: `[${item.name || 'tool'}]\n${toolContentPassthrough(item.content)}`,
      })
      continue
    }
    if (item.role === 'assistant') {
      const text = typeof item.content === 'string' ? item.content.trim() : ''
      if (text) out.push({ role: 'assistant', content: text })
      continue
    }
    out.push(item)
  }
  return out.filter((m) => messageHasBody(m))
}

export function filesNeedMedia(files: ChatFile[]): ModelMedia {
  return {
    image: files.some((file) => file.mime.startsWith('image/')),
    video: files.some((file) => file.mime.startsWith('video/')),
    pdf: files.some((file) => file.mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')),
  }
}

export function mediaGap(files: ChatFile[], media: ModelMedia): 'image' | 'video' | 'pdf' | null {
  const need = filesNeedMedia(files)
  if (need.video && !media.video) return 'video'
  if (need.image && !media.image) return 'image'
  if (need.pdf && !media.pdf) return 'pdf'
  return null
}

export function modelCanReadFiles(modelId: string, files: ChatFile[]) {
  return !mediaGap(files, modelMedia(modelId))
}

export const TEXT_FILE_EXT =
  /\.(txt|md|csv|json|html|css|scss|js|jsx|ts|tsx|mjs|cjs|py|go|rs|java|kt|rb|php|sql|yml|yaml|toml|xml|svg|sh|env|gitignore|dockerfile|vue|svelte|astro)$/i

export function guessMime(name: string, mime = '') {
  if (mime) return mime
  const lower = name.toLowerCase()
  if (/\.png$/.test(lower)) return 'image/png'
  if (/\.jpe?g$/.test(lower)) return 'image/jpeg'
  if (/\.gif$/.test(lower)) return 'image/gif'
  if (/\.webp$/.test(lower)) return 'image/webp'
  if (/\.mp4$/.test(lower)) return 'video/mp4'
  if (/\.webm$/.test(lower)) return 'video/webm'
  if (/\.mov$/.test(lower)) return 'video/quicktime'
  if (/\.pdf$/.test(lower)) return 'application/pdf'
  if (/\.docx$/.test(lower)) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (/\.xlsx$/.test(lower)) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (/\.pptx$/.test(lower)) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  if (/\.rtf$/.test(lower)) return 'text/rtf'
  if (/\.epub$/.test(lower)) return 'application/epub+zip'
  if (/\.zip$/.test(lower)) return 'application/zip'
  return 'application/octet-stream'
}

export function isTextAttachment(name: string, mime: string) {
  if (mime.startsWith('text/')) return true
  if (/json|xml|javascript|typescript/.test(mime)) return true
  return TEXT_FILE_EXT.test(name)
}

export function analyzeAttachment(input: {
  name: string
  mime: string
  size: number
  text?: string
}) {
  const kb = Math.max(1, Math.round(input.size / 1024))
  const mime = guessMime(input.name, input.mime)
  let kind = 'file'
  if (mime.startsWith('image/')) kind = 'image'
  else if (mime.startsWith('video/')) kind = 'video'
  else if (mime === 'application/pdf' || input.name.toLowerCase().endsWith('.pdf')) kind = 'pdf'
  else if (input.text || isTextAttachment(input.name, mime)) kind = 'text'
  const lines = [`File: ${input.name}`, `Kind: ${kind}`, `Type: ${mime}`, `Size: ${kb} KB`]
  if (input.text?.trim()) {
    lines.push('', 'Extracted text:', input.text.slice(0, 8000))
    if (input.text.length > 8000) lines.push('\n…truncated')
  } else if (kind === 'image') {
    lines.push('', 'Screenshot/image attached. The model receives the pixels (or a vision description in SOUMTOK VISION).')
  } else if (kind === 'video') {
    lines.push('', 'Video stored in your documents. Gemini can watch it.')
  } else if (kind === 'pdf') {
    lines.push(
      '',
      'PDF attached — Soumtok extracts text for text-only models. If Extracted text is empty, the PDF may be scanned; ask for .txt export or page images.',
    )
  } else {
    lines.push('', 'File stored in your documents and attached to this chat.')
  }
  return { kind, title: input.name.slice(0, 80) || 'Untitled file', content: lines.join('\n') }
}

export function slimChatFiles(files?: ChatFile[]) {
  if (!files?.length) return undefined
  return files.map((file) => ({
    id: file.id,
    documentId: file.documentId,
    name: file.name,
    mime: file.mime,
    size: file.size,
    text: file.text,
    analysis: file.analysis,
    dataUrl: file.id ? undefined : file.dataUrl,
  }))
}

/** This-turn composer attachments only. History images stay on their original user message. */
export function collectAttachedImages(files?: ChatFile[], _messages?: ChatTurn[]): ChatFile[] {
  return (Array.isArray(files) ? files : []).filter(Boolean)
}

/** Providers only accept https URLs or data:base64. Relative /api/files paths fail. */
export function isProviderMediaUrl(value?: string) {
  const url = (value || '').trim()
  if (!url) return false
  if (/^https:\/\//i.test(url)) return true
  if (/^http:\/\/(?!localhost|127\.0\.0\.1)/i.test(url)) return true
  return /^data:(image|video|application\/pdf)\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i.test(url)
}

function dataUrlParts(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl)
  if (!match) return null
  return { mime: match[1], data: match[2] }
}

function textForUnsupported(files: ChatFile[], media: ModelMedia) {
  const bits: string[] = []
  for (const file of files) {
    if (file.text) {
      bits.push(`Attached file ${file.name}:\n${file.text}`)
      continue
    }
    if (file.mime.startsWith('image/') && !media.image) {
      if (file.analysis?.trim()) {
        bits.push(`Attached image ${file.name} (Soumtok vision wrap — read this instead of pixels):\n${file.analysis.trim()}`)
      } else {
        bits.push(
          `Attached image ${file.name}. A vision description belongs in ATTACHMENTS / SOUMTOK VISION. Treat that as what the user showed you. Do not say you cannot see images.`,
        )
      }
      continue
    }
    if (file.mime.startsWith('video/') && !media.video) {
      bits.push(`Attached video ${file.name}. This model cannot watch video. Gemini can.`)
      continue
    }
    if ((file.mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) && !media.pdf) {
      if (file.analysis?.trim()) {
        bits.push(`Attached PDF ${file.name} (Soumtok extracted text — read ATTACHMENTS):\n${file.analysis.trim()}`)
      } else {
        bits.push(
          `Attached PDF ${file.name}. Soumtok extracts text into ATTACHMENTS for text-only models — use that content; do not say you cannot open PDFs.`,
        )
      }
      continue
    }
    if (!file.dataUrl || !isProviderMediaUrl(file.dataUrl)) {
      bits.push(`Attached file ${file.name} (${file.mime || 'unknown type'}).`)
    }
  }
  return bits.join('\n\n')
}

export function toChatCompletionsMessages(messages: ChatTurn[], modelId: string, provider: string) {
  const media = modelMedia(modelId)
  return messages.map((item) => {
    if (item.role === 'tool') {
      return { role: 'tool', tool_call_id: item.tool_call_id, content: item.content || '' }
    }
    if (item.role === 'assistant' && item.tool_calls?.length) {
      return { role: 'assistant', content: item.content || null, tool_calls: item.tool_calls }
    }
    if (item.role !== 'user' || !item.files?.length) {
      return { role: item.role, content: item.content }
    }
    const extra = textForUnsupported(item.files, media)
    const text = [String(item.content || '').trim(), extra].filter(Boolean).join('\n\n') || 'See the attached files.'

    if (provider === 'anthropic') {
      const parts: Record<string, unknown>[] = [{ type: 'text', text }]
      for (const file of item.files) {
        const parsed = file.dataUrl ? dataUrlParts(file.dataUrl) : null
        if (!parsed) continue
        if (file.mime.startsWith('image/') && media.image) {
          parts.push({
            type: 'image',
            source: { type: 'base64', media_type: parsed.mime, data: parsed.data },
          })
        } else if (file.mime === 'application/pdf' && media.pdf) {
          parts.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: parsed.data },
          })
        }
      }
      return { role: 'user', content: parts }
    }

    const parts: Record<string, unknown>[] = [{ type: 'text', text }]
    for (const file of item.files) {
      if (file.mime.startsWith('image/') && media.image && isProviderMediaUrl(file.dataUrl)) {
        parts.push({ type: 'image_url', image_url: { url: file.dataUrl } })
      } else if (file.mime.startsWith('video/') && media.video && isProviderMediaUrl(file.dataUrl)) {
        parts.push({ type: 'video_url', video_url: { url: file.dataUrl } })
      } else if (file.mime === 'application/pdf' && media.pdf && isProviderMediaUrl(file.dataUrl)) {
        parts.push({ type: 'file', file: { filename: file.name, file_data: file.dataUrl } })
      }
    }
    return { role: item.role, content: parts }
  })
}

export function toResponsesInput(messages: ChatTurn[], modelId: string) {
  const media = modelMedia(modelId)
  const chain = flattenToolTurnsForProvider(messages)
  const out: Record<string, unknown>[] = []
  for (let i = 0; i < chain.length; i++) {
    const item = chain[i]
    if (item.role === 'system') continue
    if (item.role === 'assistant' && item.tool_calls?.length) {
      for (const tc of item.tool_calls) {
        out.push({
          type: 'function_call',
          call_id: tc.id,
          name: tc.function?.name || 'tool',
          arguments: tc.function?.arguments || '{}',
        })
      }
      continue
    }
    if (item.role === 'tool') {
      out.push({
        type: 'function_call_output',
        call_id: item.tool_call_id,
        output: String(item.content || ''),
      })
      continue
    }
    if (item.role !== 'user' || !item.files?.length) {
      out.push({ role: item.role, content: item.content })
      continue
    }
    const extra = textForUnsupported(item.files, media)
    const text = [String(item.content || '').trim(), extra].filter(Boolean).join('\n\n') || 'See the attached files.'
    const parts: Record<string, unknown>[] = [{ type: 'input_text', text }]
    for (const file of item.files) {
      if (file.mime.startsWith('image/') && media.image && isProviderMediaUrl(file.dataUrl)) {
        parts.push({ type: 'input_image', image_url: file.dataUrl })
      }
    }
    out.push({ role: 'user', content: parts })
  }
  return out
}

export function promptChars(item: ChatTurn) {
  return (
    (item.content?.length || 0) +
    (item.files || []).reduce((sum, file) => sum + (file.text?.length || Math.min(file.size, 4000)), 0)
  )
}
