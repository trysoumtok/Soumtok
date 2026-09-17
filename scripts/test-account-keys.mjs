#!/usr/bin/env node
/**
 * Smoke test for user API keys: hash round-trip + optional live /api/v1/me.
 * Live: SOUMTOK_API_KEY=sk-soumtok-… SOUMTOK_API=https://soumtok.com node scripts/test-account-keys.mjs
 */
import { createHash, randomBytes } from 'node:crypto'

const failures = []
function ok(label) {
  console.log(`✓ ${label}`)
}
function fail(label, detail) {
  failures.push(`${label}: ${detail}`)
  console.error(`✗ ${label} — ${detail}`)
}

function hashSecret(value) {
  return createHash('sha256').update(value).digest('hex')
}

function mintToken() {
  return `sk-soumtok-${randomBytes(24).toString('base64url')}`
}

// 1) Token format + hash stability
const token = mintToken()
if (!token.startsWith('sk-soumtok-') || token.length < 24) fail('token format', token)
else ok('token format')

const h1 = hashSecret(token)
const h2 = hashSecret(token)
if (h1 !== h2 || h1.length !== 64) fail('hash stability', `${h1.length} chars`)
else ok('hash stability')

// 2) Optional live API key auth
const liveKey = process.env.SOUMTOK_API_KEY?.trim()
const liveApi = (process.env.SOUMTOK_API || 'https://soumtok.com').replace(/\/$/, '')
if (liveKey) {
  try {
    const me = await fetch(`${liveApi}/api/v1/me`, {
      headers: { Authorization: `Bearer ${liveKey}`, Accept: 'application/json' },
    })
    const data = await me.json().catch(() => ({}))
    if (!me.ok || !data?.id) fail('live /api/v1/me', data.error || `HTTP ${me.status}`)
    else ok(`live /api/v1/me (${data.email || data.name || data.id})`)

    const models = await fetch(`${liveApi}/api/desktop/models`, {
      headers: { Authorization: `Bearer ${liveKey}`, Accept: 'application/json' },
    })
    const md = await models.json().catch(() => ({}))
    if (!models.ok || !Array.isArray(md.models)) fail('live /api/desktop/models', md.error || `HTTP ${models.status}`)
    else ok(`live models (${md.models.length})`)
  } catch (err) {
    fail('live api', err instanceof Error ? err.message : String(err))
  }
} else {
  console.log('SKIP live API (set SOUMTOK_API_KEY to verify Bearer auth on production)')
}

console.log('')
if (failures.length) {
  console.error(`${failures.length} failure(s)`)
  process.exit(1)
}
console.log('Account key tests passed.')
