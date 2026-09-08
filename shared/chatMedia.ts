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

/** What this coding model can actually see. Not every model takes media. */
export function modelMedia(modelId: string): ModelMedia {
  const id = (modelId || '').toLowerCase()
  if (/gemma|gpt-3\.5/.test(id)) return { image: false, video: false, pdf: false }
  if (/deepseek/.test(id)) {
    const vision = /vision/.test(id)
    return { image: vision, video: false, pdf: false }
  }
  const image =
    /gemini|claude|grok|gpt-4o|gpt-4\.1|gpt-4-turbo|^gpt-4$|gpt-5|gpt-6|codex|o3|o4|vision/.test(id)
  const video = /gemini/.test(id)
  const pdf = image && !/grok/.test(id)
  return { image, video, pdf }
}

export function messageHasBody(item: { content?: string; files?: ChatFile[] }) {
  return Boolean(item.content?.trim() || item.files?.length)
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
    lines.push('', 'Image stored in your documents. Vision models receive the pixels.')
  } else if (kind === 'video') {
    lines.push('', 'Video stored in your documents. Gemini can watch it.')
  } else if (kind === 'pdf') {
    lines.push('', 'PDF stored in your documents. Claude, Gemini, or GPT can open it.')
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
      bits.push(
        `Attached image ${file.name}. This model cannot see images. Switch to Claude, Gemini, GPT, Grok, or DeepSeek V4 Flash Vision.`,
      )
      continue
    }
    if (file.mime.startsWith('video/') && !media.video) {
      bits.push(`Attached video ${file.name}. This model cannot watch video. Gemini can.`)
      continue
    }
    if ((file.mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) && !media.pdf) {
      bits.push(`Attached PDF ${file.name}. This model cannot open PDFs. Claude, Gemini, or GPT can.`)
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
    const text = [item.content.trim(), extra].filter(Boolean).join('\n\n') || 'See the attached files.'

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
  return messages
    .filter((item) => item.role !== 'system' && item.role !== 'tool')
    .map((item) => {
      if (item.role === 'assistant' && item.tool_calls?.length) {
        return { role: 'assistant', content: item.content || '', tool_calls: item.tool_calls }
      }
      if (item.role !== 'user' || !item.files?.length) {
        return { role: item.role, content: item.content }
      }
      const extra = textForUnsupported(item.files, media)
      const text = [item.content.trim(), extra].filter(Boolean).join('\n\n') || 'See the attached files.'
      const parts: Record<string, unknown>[] = [{ type: 'input_text', text }]
      for (const file of item.files) {
        if (file.mime.startsWith('image/') && media.image && isProviderMediaUrl(file.dataUrl)) {
          parts.push({ type: 'input_image', image_url: file.dataUrl })
        }
      }
      return { role: 'user', content: parts }
    })
}

export function promptChars(item: ChatTurn) {
  return (
    (item.content?.length || 0) +
    (item.files || []).reduce((sum, file) => sum + (file.text?.length || Math.min(file.size, 4000)), 0)
  )
}
