import { env, hasFal, hasImageGen, hasReplicate, platformKey } from './env.ts'
import { IMAGE_MODEL, IMAGE_MODELS, imageModelById, isImageModel } from '../shared/models.ts'
import { DEFAULT_STILL_ASPECT, falImageSize, normalizeStillAspect, parseStillRequest } from '../shared/stillAspect.ts'

const VIDEO_OR_MUSIC = /video|veo|sora|lyria|music|audio|tts/i
const MAX_EXAMINE_BYTES = 12 * 1024 * 1024

export function rejectNonStillImage(modelId: string) {
  return VIDEO_OR_MUSIC.test(modelId || '')
}

type FalImage = {
  url?: string
  content_type?: string
  contentType?: string
  file_data?: string
  fileData?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/** FAL wraps stills as images[0].url, data.images, or a data-URL / base64 blob. */
export function falStillFromResponse(data: unknown): { url: string; base64: string; contentType: string } {
  const root = asRecord(data) || {}
  const nested = asRecord(root.data) || asRecord(root.output) || {}
  const images = (Array.isArray(root.images) ? root.images : Array.isArray(nested.images) ? nested.images : []) as FalImage[]
  const first = images.find((row) => row && (row.url || row.file_data || row.fileData)) || images[0] || {}
  const imageObj = asRecord(root.image) || asRecord(nested.image)
  const url =
    String(first.url || imageObj?.url || (typeof root.image === 'string' ? root.image : '') || '').trim()
  const base64 = String(first.file_data || first.fileData || imageObj?.file_data || '').replace(/^data:[^;]+;base64,/, '')
  const contentType = String(
    first.content_type || first.contentType || imageObj?.content_type || 'image/jpeg',
  )
  return { url, base64, contentType }
}

function extFromContentType(contentType: string) {
  const t = String(contentType || '').toLowerCase()
  if (t.includes('png')) return 'png'
  if (t.includes('webp')) return 'webp'
  return 'jpg'
}

function bytesFromDataUrl(url: string) {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(String(url || '').trim())
  if (!m) return null
  const bytes = Buffer.from(m[2], 'base64')
  if (!bytes.length) return null
  return { bytes: new Uint8Array(bytes), contentType: m[1] }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type CatalogImage = (typeof IMAGE_MODELS)[number]

export function replicateOutputUrl(output: unknown): string {
  if (typeof output === 'string') {
    const t = output.trim()
    return /^https?:\/\//i.test(t) ? t : ''
  }
  if (Array.isArray(output)) {
    for (const item of output) {
      const url = replicateOutputUrl(item)
      if (url) return url
    }
    return ''
  }
  const row = asRecord(output)
  if (!row) return ''
  if (typeof row.url === 'string' && /^https?:\/\//i.test(row.url)) return row.url.trim()
  if (row.output !== undefined) return replicateOutputUrl(row.output)
  return ''
}

function replicateError(data: unknown, fallback: string) {
  const row = asRecord(data) || {}
  if (typeof row.error === 'string' && row.error.trim()) return row.error.trim()
  const errObj = asRecord(row.error)
  if (typeof errObj?.message === 'string' && errObj.message.trim()) return errObj.message.trim()
  if (typeof row.detail === 'string' && row.detail.trim()) return row.detail.trim()
  if (Array.isArray(row.detail)) {
    const parts = row.detail
      .map((item) => {
        if (typeof item === 'string') return item
        const rec = asRecord(item)
        return String(rec?.msg || rec?.message || '').trim()
      })
      .filter(Boolean)
    if (parts.length) return parts.join(' ')
  }
  if (typeof row.title === 'string' && row.title.trim()) return row.title.trim()
  return fallback
}

function qualityStillPrompt(prompt: string, modelId: string) {
  const t = prompt.trim()
  if (modelId.includes('flux-2')) {
    if (/\b(photograph|photoreal|editorial|studio lighting)\b/i.test(t)) return t
    return `${t}. Professional photograph, sharp focus, natural lighting, clean composition.`
  }
  if (modelId.startsWith('google/imagen')) {
    if (/\b(photograph|photoreal|editorial)\b/i.test(t)) return t
    return `${t}. Professional photograph, fine material detail, natural lighting, sharp focus.`
  }
  if (/\b(messy|grainy|noisy|glitch|distorted)\b/i.test(t)) return t
  if (/\b(photoreal|clean still|sharp focus|no watermark)\b/i.test(t)) return t
  return `${t}. Clean photorealistic still photograph, sharp focus, natural lighting.`
}

export function replicateInput(modelId: string, prompt: string, aspect = DEFAULT_STILL_ASPECT): Record<string, unknown> {
  const cleaned = qualityStillPrompt(prompt, modelId)
  const aspectRatio = normalizeStillAspect(aspect)
  if (modelId.startsWith('google/imagen')) {
    return {
      prompt: cleaned,
      aspect_ratio: aspectRatio,
      output_format: 'jpg',
      safety_filter_level: 'block_only_high',
    }
  }
  if (modelId.includes('flux-2')) {
    return {
      prompt: cleaned,
      aspect_ratio: aspectRatio,
      resolution: '2 MP',
      output_format: 'jpg',
      output_quality: 95,
      safety_tolerance: 2,
      prompt_upsampling: false,
    }
  }
  return {
    prompt: cleaned,
    aspect_ratio: aspectRatio,
    output_format: 'jpg',
    output_quality: 90,
    safety_tolerance: 2,
    prompt_upsampling: true,
  }
}

function defaultModel(provider: CatalogImage['provider']): CatalogImage {
  return IMAGE_MODELS.find((model) => model.provider === provider) || IMAGE_MODEL
}

function pickStillBackend(requested: string): { provider: 'replicate' | 'fal'; model: CatalogImage } {
  const catalog = imageModelById(requested)
  if (catalog.provider === 'replicate' && hasReplicate()) return { provider: 'replicate', model: catalog }
  if (catalog.provider === 'fal' && hasFal()) return { provider: 'fal', model: catalog }
  if (hasReplicate()) return { provider: 'replicate', model: defaultModel('replicate') }
  if (hasFal()) return { provider: 'fal', model: defaultModel('fal') }
  throw new Error('Image model is not configured (REPLICATE_API_TOKEN)')
}

async function downloadStill(url: string, contentTypeHint: string, imageModel: CatalogImage) {
  const fromData = bytesFromDataUrl(url)
  if (fromData) {
    return {
      bytes: fromData.bytes,
      contentType: fromData.contentType,
      ext: extFromContentType(fromData.contentType),
      model: imageModel,
      remoteUrl: url,
    }
  }
  const imageRes = await fetch(url, {
    headers: { Accept: 'image/*,*/*', 'User-Agent': 'Soumtok/1.0' },
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  })
  if (!imageRes.ok) throw new Error(`Could not download the generated image (${imageRes.status})`)
  const bytes = new Uint8Array(await imageRes.arrayBuffer())
  if (!bytes.length) throw new Error('Generated image was empty')
  const contentType = imageRes.headers.get('content-type') || contentTypeHint || 'image/jpeg'
  return { bytes, contentType, ext: extFromContentType(contentType), model: imageModel, remoteUrl: url }
}

async function generateViaFal(prompt: string, imageModel: CatalogImage, aspect = DEFAULT_STILL_ASPECT) {
  const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: {
      Authorization: `Key ${env.falKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      prompt: prompt.trim(),
      image_size: falImageSize(aspect),
      num_inference_steps: 4,
      enable_safety_checker: true,
    }),
    signal: AbortSignal.timeout(90_000),
  })
  const data = (await res.json()) as {
    detail?: string | { msg?: string }[]
    error?: { message?: string } | string
  }
  if (!res.ok) {
    const detail = Array.isArray(data.detail)
      ? data.detail.map((item) => item.msg).filter(Boolean).join(' ')
      : data.detail
    const message =
      detail ||
      (typeof data.error === 'string' ? data.error : data.error?.message) ||
      'Image generation failed'
    throw new Error(message)
  }
  const still = falStillFromResponse(data)
  if (still.base64) {
    const bytes = new Uint8Array(Buffer.from(still.base64, 'base64'))
    if (!bytes.length) throw new Error('No image returned')
    return {
      bytes,
      contentType: still.contentType || 'image/jpeg',
      ext: extFromContentType(still.contentType),
      model: imageModel,
      remoteUrl: still.url || '',
    }
  }
  if (!still.url) throw new Error('No image returned')
  return downloadStill(still.url, still.contentType || 'image/jpeg', imageModel)
}

async function runReplicatePrediction(prompt: string, imageModel: CatalogImage, aspect = DEFAULT_STILL_ASPECT) {
  const token = env.replicateToken
  const create = await fetch(`https://api.replicate.com/v1/models/${imageModel.id}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'wait=60',
    },
    body: JSON.stringify({
      input: replicateInput(imageModel.id, prompt, aspect),
    }),
    signal: AbortSignal.timeout(120_000),
  })
  let data: Record<string, unknown> = {}
  try {
    data = asRecord(await create.json()) || {}
  } catch {
    data = {}
  }
  if (!create.ok && create.status !== 201) {
    throw new Error(replicateError(data, 'Image generation failed'))
  }
  let status = String(data.status || '')
  const id = String(data.id || '')
  for (let i = 0; i < 60 && id && !['succeeded', 'failed', 'canceled'].includes(status); i++) {
    await sleep(2000)
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    })
    data = asRecord(await poll.json()) || {}
    status = String(data.status || '')
  }
  if (status !== 'succeeded') {
    throw new Error(replicateError(data, status === 'failed' ? 'Image generation failed' : 'Image generation timed out'))
  }
  const url = replicateOutputUrl(data.output) || replicateOutputUrl(data)
  if (!url) throw new Error('No image returned')
  return downloadStill(url, 'image/jpeg', imageModel)
}

const REPLICATE_FALLBACK_IDS = [
  'black-forest-labs/flux-2-max',
  'black-forest-labs/flux-2-pro',
  'black-forest-labs/flux-1.1-pro',
] as const

async function generateViaReplicate(prompt: string, imageModel: CatalogImage, aspect = DEFAULT_STILL_ASPECT) {
  const queue: CatalogImage[] = []
  const seen = new Set<string>()
  for (const model of [imageModel, ...REPLICATE_FALLBACK_IDS.map((id) => imageModelById(id))]) {
    if (model.provider !== 'replicate' || seen.has(model.id)) continue
    seen.add(model.id)
    queue.push(model)
  }
  let lastError = 'Image generation failed'
  for (const model of queue) {
    try {
      return await runReplicatePrediction(prompt, model, aspect)
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError
    }
  }
  throw new Error(lastError)
}

export async function generateStillImage(prompt: string, modelId?: string, aspect?: string) {
  const requested = (modelId || IMAGE_MODEL.id).trim()
  if (rejectNonStillImage(requested)) {
    throw new Error('Soumtok only generates still images. Video and music models are off.')
  }
  if (requested && !isImageModel(requested)) throw new Error('Unknown image model')
  if (!prompt.trim()) throw new Error('Write a prompt')
  if (prompt.length > 2000) throw new Error('Prompt is too long')
  if (!hasImageGen()) throw new Error('Image model is not configured (REPLICATE_API_TOKEN)')

  const parsed = parseStillRequest(prompt)
  const ratio = normalizeStillAspect(aspect || parsed.aspect)
  const clean = parsed.prompt
  const backend = pickStillBackend(requested || IMAGE_MODEL.id)
  const still =
    backend.provider === 'replicate'
      ? await generateViaReplicate(clean, backend.model, ratio)
      : await generateViaFal(clean, backend.model, ratio)
  return { ...still, aspect: ratio }
}

function geminiText(data: unknown) {
  const row = data as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } }
  if (row.error?.message) throw new Error(row.error.message)
  const text = (row.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('\n').trim()
  return text
}

async function geminiExamine(mime: string, base64: string, prompt: string) {
  const key = platformKey('google')
  if (!key) throw new Error('Video/image examine needs GOOGLE_AI_API_KEY on the server')
  const model = 'gemini-2.0-flash'
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mime, data: base64 } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    },
  )
  const data = await res.json()
  const text = geminiText(data)
  if (!res.ok || !text) throw new Error((data as { error?: { message?: string } }).error?.message || 'Gemini examine failed')
  return { analysis: text, model }
}

async function openaiExamine(mime: string, base64: string, prompt: string) {
  const key = platformKey('openai')
  if (!key) throw new Error('Image examine needs OPENAI_API_KEY or GOOGLE_AI_API_KEY')
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1200,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  })
  const data = (await res.json()) as {
    error?: { message?: string }
    choices?: { message?: { content?: string } }[]
  }
  const text = data.choices?.[0]?.message?.content?.trim() || ''
  if (!res.ok || !text) throw new Error(data.error?.message || 'Image examine failed')
  return { analysis: text, model: 'gpt-4o-mini' }
}

export async function examineMediaBytes(input: {
  mime: string
  base64: string
  prompt?: string
}) {
  const mime = String(input.mime || '').toLowerCase() || 'image/jpeg'
  const isVideo = mime.startsWith('video/')
  const isImage = mime.startsWith('image/')
  if (!isVideo && !isImage) throw new Error('Only images and videos can be examined')
  const raw = Buffer.from(input.base64, 'base64')
  if (!raw.length) throw new Error('Empty media')
  if (raw.length > MAX_EXAMINE_BYTES) throw new Error('Media is too large to examine (12 MB max)')
  const prompt =
    String(input.prompt || '').trim() ||
    (isVideo
      ? 'Describe this video for a coding agent: what happens on screen, UI, errors, readable text. Do not generate media.'
      : 'Describe this image for a coding agent: layout, UI, errors, readable text, colors, what looks broken.')
  if (isVideo) return geminiExamine(mime, input.base64, prompt)
  try {
    if (platformKey('google')) return await geminiExamine(mime, input.base64, prompt)
  } catch {
    /* fall through */
  }
  return openaiExamine(mime, input.base64, prompt)
}
