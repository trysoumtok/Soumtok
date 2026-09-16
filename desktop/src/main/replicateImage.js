/** Local Flux 2 Max stills via Replicate when REPLICATE_API_TOKEN is in .env. */
const { parseStillRequest, normalizeStillAspect, DEFAULT_STILL_ASPECT } = require('../shared/stillAspect.js')
const { readEnvVarFromFiles } = require('./speechTranscribeCore')

const DEFAULT_MODEL = {
  id: 'black-forest-labs/flux-2-max',
  name: 'Flux 2 Max',
  provider: 'replicate',
}

function replicateToken() {
  return (
    process.env.REPLICATE_API_TOKEN ||
    process.env.REPLICATE_API_KEY ||
    readEnvVarFromFiles('REPLICATE_API_TOKEN') ||
    readEnvVarFromFiles('REPLICATE_API_KEY') ||
    ''
  ).trim()
}

function qualityStillPrompt(prompt, modelId) {
  const t = String(prompt || '').trim()
  if (String(modelId || '').startsWith('google/imagen')) {
    if (/\b(photograph|photoreal|editorial)\b/i.test(t)) return t
    return `${t}. Professional photograph, fine material detail, natural lighting, sharp focus.`
  }
  if (/\b(photograph|photoreal|editorial|studio lighting)\b/i.test(t)) return t
  return `${t}. Professional photograph, sharp focus, natural lighting, clean composition.`
}

function replicateInput(modelId, prompt, aspect) {
  const cleaned = qualityStillPrompt(prompt, modelId)
  const aspectRatio = normalizeStillAspect(aspect)
  if (String(modelId).startsWith('google/imagen')) {
    return {
      prompt: cleaned,
      aspect_ratio: aspectRatio,
      output_format: 'jpg',
      safety_filter_level: 'block_only_high',
    }
  }
  if (String(modelId).includes('flux-2')) {
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

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function replicateOutputUrl(output) {
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

function replicateError(data, fallback) {
  const row = asRecord(data) || {}
  if (typeof row.error === 'string' && row.error.trim()) return row.error.trim()
  const errObj = asRecord(row.error)
  if (typeof errObj?.message === 'string' && errObj.message.trim()) return errObj.message.trim()
  if (typeof row.detail === 'string' && row.detail.trim()) return row.detail.trim()
  return fallback
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const FALLBACK_MODELS = [
  DEFAULT_MODEL,
  { id: 'black-forest-labs/flux-2-pro', name: 'Flux 2 Pro', provider: 'replicate' },
]

async function runReplicatePrediction(token, model, text, aspect) {
  const create = await fetch(`https://api.replicate.com/v1/models/${model.id}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'wait=60',
    },
    body: JSON.stringify({
      input: replicateInput(model.id, text, aspect),
    }),
    signal: AbortSignal.timeout(120_000),
  })
  let data = asRecord(await create.json().catch(() => ({}))) || {}
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
    data = asRecord(await poll.json().catch(() => ({}))) || {}
    status = String(data.status || '')
  }
  if (status !== 'succeeded') {
    throw new Error(replicateError(data, status === 'failed' ? 'Image generation failed' : 'Image generation timed out'))
  }
  const url = replicateOutputUrl(data.output) || replicateOutputUrl(data)
  if (!url) throw new Error('No image returned')
  const imageRes = await fetch(url, {
    headers: { Accept: 'image/*,*/*', 'User-Agent': 'Soumtok/1.0' },
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  })
  if (!imageRes.ok) throw new Error(`Could not download the generated image (${imageRes.status})`)
  const buf = Buffer.from(await imageRes.arrayBuffer())
  if (!buf.length) throw new Error('Generated image was empty')
  const contentType = imageRes.headers.get('content-type') || 'image/jpeg'
  return {
    ok: true,
    base64: buf.toString('base64'),
    ext: 'jpg',
    contentType,
    model: model.id,
    aspect,
  }
}

async function generateStillViaReplicate(prompt, aspect) {
  const token = replicateToken()
  if (!token) return null
  const text = String(prompt || '').trim()
  if (!text) return { ok: false, error: 'Write a prompt' }
  const parsed = parseStillRequest(text)
  const ratio = normalizeStillAspect(aspect || parsed.aspect || DEFAULT_STILL_ASPECT)
  const clean = parsed.prompt
  let lastError = 'Image generation failed'
  for (const model of FALLBACK_MODELS) {
    try {
      return await runReplicatePrediction(token, model, clean, ratio)
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError
    }
  }
  return { ok: false, error: lastError }
}

module.exports = { generateStillViaReplicate, replicateOutputUrl, replicateToken }
