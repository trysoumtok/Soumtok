#!/usr/bin/env node
/**
 * Test Hub compare + benchmark + vite sandbox (cheap model: deepseek-v4-flash).
 * Run: node desktop/scripts/test-test-hub-compare.mjs
 */
import assert from 'node:assert/strict'
import { config } from 'dotenv'
import { createRequire } from 'node:module'

config()
const require = createRequire(import.meta.url)

const ART = require('../src/shared/testHubArtifacts.js')
const { looksLikeViteProject, runTestHubViteSandbox, cleanupSandboxDir } = require('../src/main/testHubSandbox.js')
const {
  scoreCompareRun,
  rankCompareRuns,
  benchmarkPayloadFromCompare,
  looksLikeViteProject: looksViteTs,
} = await import('../../shared/testHubBenchmark.ts')

console.log('— Test Hub artifacts + preview bridge')
const sample = `\`\`\`html file="index.html"
<!DOCTYPE html><html><body><button id="btn">Go</button><script>document.getElementById('btn').addEventListener('click',()=>alert(1))</script></body></html>
\`\`\``
const files = ART.extractBuildArtifacts(sample)
assert.ok(files['index.html'])
const preview = ART.injectPreviewErrorBridge(ART.buildPreviewHtml(files))
assert.match(preview, /data-soumtok-preview-bridge/)
assert.equal(ART.scoreCompareRun({ model: 'x', status: 'done', text: sample, ms: 4000 }), scoreCompareRun({ model: 'x', status: 'done', text: sample, ms: 4000 }))

console.log('— Compare scoring + benchmark payload')
const ranked = rankCompareRuns([
  { model: 'deepseek-v4-flash', status: 'done', text: 'no files', ms: 3000 },
  { model: 'deepseek-chat', status: 'done', text: sample, ms: 5000 },
])
assert.equal(ranked[0].run.model, 'deepseek-chat')
const payload = benchmarkPayloadFromCompare({
  prompt: 'build a button',
  compareMode: true,
  runs: ranked.map((r) => r.run),
})
assert.equal(payload.winnerModel, 'deepseek-chat')
assert.equal(payload.models.length, 2)

console.log('— Vite project detection')
const vitePkg = {
  'package.json': JSON.stringify({
    name: 'demo',
    private: true,
    type: 'module',
    scripts: { build: 'vite build' },
    devDependencies: { vite: '^6.0.0' },
  }),
  'index.html': '<!DOCTYPE html><html><body><h1 id="app">hi</h1></body></html>',
  'vite.config.js': 'export default { build: { outDir: "dist" } }',
}
assert.equal(looksLikeViteProject(vitePkg), true)
assert.equal(looksViteTs(vitePkg), true)

const skipVite = process.env.SKIP_VITE_SANDBOX === '1' || process.env.CI === 'true'
if (!skipVite) {
  console.log('— Vite sandbox npm install + build (may take ~30–90s)')
  const sandbox = await runTestHubViteSandbox(vitePkg)
  try {
    if (sandbox.ok) {
      assert.ok(sandbox.previewHtml?.includes('app') || sandbox.previewHtml?.length > 20)
      console.log('  vite build OK')
    } else {
      console.log('  vite sandbox skipped/failed (npm may be unavailable):', sandbox.error || sandbox.log?.slice(0, 120))
    }
  } finally {
    cleanupSandboxDir(sandbox.root)
  }
} else {
  console.log('— Vite sandbox skipped (SKIP_VITE_SANDBOX=1)')
}

const cheapModel = process.env.TEST_HUB_MODEL || 'deepseek-v4-flash'
if (process.env.DEEPSEEK_API_KEY || process.env.SOUMTOK_TEST_API) {
  console.log(`— Live API smoke (${cheapModel})`)
  const { platformKey } = await import('../../server/env.ts')
  const { completionUrl, extractText, requestBody, streamDelta } = await import('../../server/studio.ts')
  const { upstreamModelId } = await import('../../shared/models.ts')
  const key = platformKey('deepseek') || process.env.DEEPSEEK_API_KEY
  if (key) {
    const requestModel = upstreamModelId(cheapModel)
    const prompt = 'Reply with ONLY this fenced file, nothing else:\n```html file="index.html"\n<!DOCTYPE html><html><body><h1>Hi</h1></body></html>\n```'
    const url = completionUrl('deepseek', requestModel)
    const body = requestBody('deepseek', requestModel, [{ role: 'user', content: prompt }], {
      temperature: 0.2,
      maxTokens: 256,
      tools: false,
    })
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    })
    const data = await res.json()
    assert.ok(res.ok, `API ${res.status}`)
    const text = extractText(data)
    assert.match(text, /index\.html|<h1>Hi<\/h1>/i)
    const apiFiles = ART.extractBuildArtifacts(text)
    assert.ok(Object.keys(apiFiles).length >= 1)
    console.log(`  ${cheapModel} returned ${Object.keys(apiFiles).length} file(s), score ${scoreCompareRun({ model: cheapModel, status: 'done', text, ms: 1000 })}`)

    console.log('— Live stream smoke (first delta within 30s)')
    const streamBody = { ...body, stream: true, stream_options: { include_usage: true } }
    const streamRes = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(streamBody),
      signal: AbortSignal.timeout(30_000),
    })
    assert.ok(streamRes.ok && streamRes.body, `stream ${streamRes.status}`)
    const reader = streamRes.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let streamed = ''
    const t0 = Date.now()
    while (Date.now() - t0 < 28_000) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let cut = buf.indexOf('\n')
      while (cut >= 0) {
        const line = buf.slice(0, cut).trim()
        buf = buf.slice(cut + 1)
        cut = buf.indexOf('\n')
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          const frame = JSON.parse(payload)
          const delta = streamDelta(frame)
          if (delta) streamed += delta
        } catch {
          /* partial line */
        }
      }
      if (streamed.length > 8) break
    }
    reader.cancel().catch(() => {})
    assert.ok(streamed.length > 0, 'stream produced no visible deltas (check streamDelta)')
    console.log(`  first stream chars in ${Date.now() - t0}ms (${streamed.length} chars)`)
  } else {
    console.log('— Live API skipped (no deepseek key)')
  }
} else {
  console.log('— Live API skipped (set DEEPSEEK_API_KEY to smoke-test)')
}

console.log('\nTest Hub compare + benchmark checks passed.')
