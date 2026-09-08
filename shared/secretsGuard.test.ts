import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ensureEnvFiles,
  filesForModel,
  findSecrets,
  redactSecrets,
  sanitizeAgentFiles,
  scanSecrets,
  stripEnvValues,
} from './secretsGuard.ts'

test('detects common API keys and redacts them', () => {
  const text = 'use this sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345 and AKIAIOSFODNN7EXAMPLE'
  const hits = findSecrets(text)
  assert.ok(hits.some((item) => item.kind === 'api-key'))
  assert.ok(hits.some((item) => item.kind === 'aws'))
  const redacted = redactSecrets(text)
  assert.doesNotMatch(redacted, /sk-ant-api03/)
  assert.doesNotMatch(redacted, /AKIAIOSFODNN7EXAMPLE/)
  assert.match(redacted, /\[redacted api-key\]/)
})

test('blocks pasted keys and offering language', () => {
  assert.equal(scanSecrets('this is my api key').blocked, true)
  assert.equal(scanSecrets('this is my api').blocked, true)
  assert.equal(scanSecrets('here is my openai key').offering, true)
  assert.equal(scanSecrets('sk-proj-abcdefghijklmnopqrstuvwxyz0123').blocked, true)
  assert.equal(scanSecrets('make the header sticky').blocked, false)
  assert.equal(scanSecrets('this is my coffee shop in Nairobi').blocked, false)
})

test('asking where to put a key still blocks chat storage', () => {
  const scan = scanSecrets('where should I put my API key?')
  assert.equal(scan.blocked, true)
  assert.equal(scan.asking, true)
  assert.equal(scan.hits.length, 0)
  assert.equal(scanSecrets('build a settings page so users can add an API key').blocked, false)
})

test('env files are created and gitignored', () => {
  const files = ensureEnvFiles({})
  assert.match(files['.env'], /never in chat/)
  assert.match(files['.env.example'], /Copy to \.env/)
  assert.match(files['.gitignore'], /^\.env$/m)
})

test('model context never includes env values', () => {
  const packed = filesForModel({
    '.env': 'OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz0123',
    'index.html': '<h1>Hi</h1>',
  })
  assert.match(packed['.env'], /redacted/)
  assert.doesNotMatch(packed['.env'], /sk-proj/)
  assert.equal(packed['index.html'], '<h1>Hi</h1>')
})

test('model-written secrets are stripped from files', () => {
  const files = sanitizeAgentFiles({
    '.env': 'OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz0123',
    'app.ts': 'const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345"',
  })
  assert.equal(stripEnvValues('OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz0123'), 'OPENAI_API_KEY=')
  assert.doesNotMatch(files['.env'], /sk-proj/)
  assert.match(files['app.ts'], /\[redacted api-key\]/)
})
