const fs = require('fs')
const path = require('path')

const ENV_FILE_CANDIDATES = [
  path.resolve(__dirname, '../../../.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
]

function readEnvVarFromFiles(name) {
  const re = new RegExp(`^${name}=(.*)$`)
  for (const file of ENV_FILE_CANDIDATES) {
    try {
      if (!fs.existsSync(file)) continue
      const raw = fs.readFileSync(file, 'utf8')
      for (const line of raw.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const m = trimmed.match(re)
        if (m) {
          const val = m[1].trim().replace(/^["']|["']$/g, '')
          if (val) return val
        }
      }
    } catch {
      /* ignore */
    }
  }
  return null
}

function readOpenAiKeyFromEnvFile() {
  return readEnvVarFromFiles('OPENAI_API_KEY')
}

async function transcribeWithOpenAiDirect(apiKey, payload) {
  const audio = String(payload?.audio || '').trim()
  if (!audio) return { error: 'Missing audio' }
  const buf = Buffer.from(audio, 'base64')
  if (buf.length < 400) return { text: '' }
  const mime = String(payload?.mime || 'audio/webm')
  const ext = mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : 'wav'
  const form = new FormData()
  form.append('file', new Blob([buf], { type: mime }), `speech.${ext}`)
  form.append('model', 'whisper-1')
  const lang = String(payload?.language || '')
    .trim()
    .split('-')[0]
  if (/^[a-z]{2}$/i.test(lang)) form.append('language', lang.toLowerCase())
  const prompt = String(payload?.prompt || '')
    .trim()
    .slice(-400)
  if (prompt) form.append('prompt', prompt)
  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(22_000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = data?.error?.message || `OpenAI transcription failed (${res.status})`
      return { error: msg }
    }
    return { text: String(data.text || '').trim() }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'OpenAI transcription failed' }
  }
}

module.exports = {
  readEnvVarFromFiles,
  readOpenAiKeyFromEnvFile,
  transcribeWithOpenAiDirect,
}
