import { resolveModelId, CODING_MODELS, type ModelProvider } from './models.ts'
import { analyzeAttachment, modelCanReadFiles, modelMedia, type ChatFile } from './chatMedia.ts'

/** When to search vs when to leave code alone — injected into desktop agent prompts. */
export const SURGICAL_AGENT_RULES = `SURGICAL CODE DISCIPLINE:
- Questions, explanations, and plan mode: use read/grep only. Do not write or diff unless the user explicitly asked to change code.
- Before any edit: grep for symbols, strings, or filenames related to the bug. read only the files you will touch.
- Fix the smallest region that solves the problem. Prefer diff over write. Do not refactor unrelated files.
- If ANALYZED REQUEST or an attachment says the issue is in a specific area (footer, header, auth), start grep/read there — do not read the whole repo blindly.
- If you cannot find the code after reasonable search, say what you searched and ask one focused question — do not guess and rewrite large files.`

export const VISION_WRAP_MODEL_IDS = [
  'deepseek-v4-flash-vision-exp',
  'gpt-4o-mini',
  'gemini-3.1-flash-lite',
  'claude-haiku-4-5-20251001',
  'gpt-4o',
  'grok-4.6',
] as const

export function pickVisionWrapModel(hasKey: (provider: ModelProvider) => boolean) {
  for (const id of VISION_WRAP_MODEL_IDS) {
    const model = CODING_MODELS.find((row) => row.id === resolveModelId(id) || row.id === id)
    if (!model) continue
    if (!modelMedia(model.id).image) continue
    if (hasKey(model.provider)) return { id: model.id, provider: model.provider }
  }
  return null
}

export function visionWrapCandidates(hasKey: (provider: ModelProvider) => boolean) {
  const out: { id: string; provider: ModelProvider }[] = []
  const seen = new Set<string>()
  for (const id of VISION_WRAP_MODEL_IDS) {
    const model = CODING_MODELS.find((row) => row.id === resolveModelId(id) || row.id === id)
    if (!model || seen.has(model.id)) continue
    if (!modelMedia(model.id).image) continue
    if (!hasKey(model.provider)) continue
    seen.add(model.id)
    out.push({ id: model.id, provider: model.provider })
  }
  return out
}

export function visionReplyLooksBlind(text: string) {
  return /can(?:not|'t)\s+see|don'?t come through|no image|images? (?:don'?t|do not) (?:come|reach)|working blind|i(?:'m| am) (?:not )?(?:unable|unable to see)/i.test(
    String(text || ''),
  )
}

export function needsVisionWrap(modelId: string, files: ChatFile[]) {
  if (!files.some((f) => f.mime?.startsWith('image/'))) return false
  return !modelCanReadFiles(modelId, files)
}

export function visionWrapPrompt(userText: string) {
  return `You are Soumtok Vision Wrap — a helper that describes images for another coding model that cannot see pixels.

User message (context): ${userText.slice(0, 500)}

For each attached image, output:
1. Kind: screenshot-of-app | ui-mock | diagram | photo-unrelated | other
2. Whether this is about code in their open project (yes/no) and why
3. If yes: what appears broken or requested, visible text, colors, layout, error messages, likely file areas (e.g. footer CSS, nav component)
4. If no: say it is not a coding task and what the user might have meant

Never refuse. Never say you cannot see images. Be concrete so a text-only agent can act.`
}

export function stampAttachmentMeta(files: ChatFile[]) {
  return files.map((file) => {
    if (file.analysis?.trim()) return file
    const meta = analyzeAttachment({
      name: file.name,
      mime: file.mime,
      size: file.size,
      text: file.text,
    })
    return { ...file, analysis: meta.content }
  })
}

export function attachmentContextBlock(files: ChatFile[]) {
  if (!files.length) return ''
  const lines = ['ATTACHMENTS (Soumtok analyzed — treat as ground truth for intent):']
  for (const file of files) {
    const meta = analyzeAttachment({
      name: file.name,
      mime: file.mime,
      size: file.size,
      text: file.text,
    })
    lines.push(`--- ${file.name} (${meta.kind}) ---`)
    if (file.analysis?.trim()) lines.push(file.analysis.trim())
    else lines.push(meta.content)
  }
  lines.push(
    'If Kind is image and analysis says screenshot-of-app or ui-mock, this is about their codebase — grep/read the matching area before editing.',
  )
  lines.push(
    'If Extracted text is present for any attachment, that IS the file contents — read and follow it. Never tell the user you cannot open attached files when extracted text is here.',
  )
  return lines.join('\n')
}

export function modelWrapNote(modelId: string, files: ChatFile[]) {
  const gap = files.some((f) => f.mime?.startsWith('image/')) && !modelMedia(modelId).image
  if (!gap) return ''
  const wrapped = files.some((f) => f.mime?.startsWith('image/') && f.analysis?.includes('SOUMTOK VISION'))
  if (wrapped) {
    return 'Soumtok wrapped this image with a vision model so your selected model can still act on it via ATTACHMENTS.'
  }
  return ''
}
