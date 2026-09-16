/**
 * Smoke-test every Soumtok coding model with user message "hy" (platform keys from .env).
 * Run: npx tsx scripts/test-all-models-hy.ts
 * Optional: TEST_MODELS=gpt-4.1-mini,claude-opus-5 npx tsx scripts/test-all-models-hy.ts
 */
import { config } from 'dotenv'

config()

import { modelById, soumtokCodingModels, upstreamModelId } from '../shared/models.ts'
import { platformKey } from '../server/env.ts'
import { completionUrl, extractError, extractText, requestBody } from '../server/studio.ts'

const PROMPT = 'hy'
const MAX_TOKENS = 128
const TIMEOUT_MS = 45_000
const filter = process.env.TEST_MODELS?.split(',').map((s) => s.trim()).filter(Boolean)

const models = soumtokCodingModels().filter((m) => !filter?.length || filter.includes(m.id))

async function tryModel(catalogId: string) {
  const meta = modelById(catalogId)
  const provider = meta.provider
  const key = platformKey(provider)
  if (!key) return { id: catalogId, ok: false, skip: true, error: 'no platform key' }

  const requestModel = upstreamModelId(catalogId)
  const messages = [{ role: 'user' as const, content: PROMPT }]
  const url = completionUrl(provider, requestModel)
  const body = requestBody(provider, requestModel, messages, {
    temperature: 0.35,
    maxTokens: MAX_TOKENS,
    tools: false,
  })

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
  if (provider === 'anthropic') {
    headers['x-api-key'] = key
    headers['anthropic-version'] = '2023-06-01'
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const data = (await res.json()) as Parameters<typeof extractText>[0] & Parameters<typeof extractError>[0]
    if (!res.ok) {
      return { id: catalogId, provider, requestModel, ok: false, error: extractError(data).slice(0, 120) }
    }
    const text = extractText(data).trim()
    if (!text) return { id: catalogId, provider, requestModel, ok: false, error: 'empty reply' }
    return { id: catalogId, provider, requestModel, ok: true, preview: text.slice(0, 60) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { id: catalogId, provider, requestModel, ok: false, error: msg.slice(0, 120) }
  }
}

async function main() {
  console.log(`Testing ${models.length} models with "${PROMPT}"…\n`)
  const results: Awaited<ReturnType<typeof tryModel>>[] = []
  for (const m of models) {
    process.stdout.write(`${m.id}… `)
    const r = await tryModel(m.id)
    results.push(r)
    if (r.skip) console.log('SKIP (no key)')
    else if (r.ok) console.log(`OK  ${r.preview}`)
    else console.log(`FAIL ${r.error}`)
  }

  const ok = results.filter((r) => r.ok)
  const fail = results.filter((r) => !r.ok && !r.skip)
  const skip = results.filter((r) => r.skip)
  console.log(`\n---\nOK ${ok.length}  FAIL ${fail.length}  SKIP ${skip.length}`)
  if (fail.length) {
    console.log('\nFailed:')
    for (const r of fail) console.log(`  ${r.id} (${r.requestModel}): ${r.error}`)
  }
  process.exit(fail.length ? 1 : 0)
}

main()
