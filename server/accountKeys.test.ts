import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import 'dotenv/config'
import { app, ensureMigrated } from './app.ts'
import { pool } from './db.ts'
import { hasDatabase } from './env.ts'
import { hashSecret, last4 } from './secrets.ts'
import { fingerprintPublicKey, generateSshKey, validPublicKey } from './ssh.ts'

function mintToken() {
  return `sk-soumtok-${randomBytes(24).toString('base64url')}`
}

async function callApi(method: string, path: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body != null) headers['Content-Type'] = 'application/json'
  const res = await app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    }),
  )
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(text) as Record<string, unknown>
  } catch {
    data = { raw: text }
  }
  return { status: res.status, data }
}

describe('account keys — crypto helpers', () => {
  it('mints sk-soumtok tokens with stable hashes', () => {
    const token = mintToken()
    assert.match(token, /^sk-soumtok-[A-Za-z0-9_-]+$/)
    assert.equal(hashSecret(token), hashSecret(token))
    assert.equal(last4(token), token.slice(-4))
  })

  it('validates and fingerprints SSH public keys', () => {
    const generated = generateSshKey('soumtok-test')
    assert.ok(validPublicKey(generated.publicKey))
    assert.ok(generated.fingerprint.startsWith('SHA256:'))
    assert.equal(fingerprintPublicKey(generated.publicKey), generated.fingerprint)
    assert.equal(validPublicKey('not-a-key'), false)
  })
})

const dbReady = hasDatabase() && pool && process.env.SOUMTOK_SKIP_DB_TESTS !== '1'

describe('account keys — HTTP integration', { skip: dbReady ? false : 'DATABASE_URL not configured' }, () => {
  const testUserId = randomUUID()
  const testEmail = `keys-test-${testUserId.slice(0, 8)}@soumtok-test.invalid`
  const testUsername = `keytest${testUserId.replace(/-/g, '').slice(0, 10)}`
  let bootstrapToken = ''
  let bootstrapKeyId = ''
  let createdKeyId = ''
  let createdKeyToken = ''
  let sshKeyId = ''

  before(async () => {
    await ensureMigrated()
    bootstrapToken = mintToken()
    bootstrapKeyId = randomUUID()

    await pool!.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, NOW(), NOW())`,
      [testUserId, 'Keys Test User', testEmail],
    )
    await pool!.query(
      `INSERT INTO profiles (user_id, username, completed_at, email_verified_at, plan, updated_at)
       VALUES ($1, $2, NOW(), NOW(), 'pro', NOW())`,
      [testUserId, testUsername],
    )
    await pool!.query(
      `INSERT INTO user_api_keys (id, user_id, name, key_hash, last4)
       VALUES ($1, $2, $3, $4, $5)`,
      [bootstrapKeyId, testUserId, 'Bootstrap', hashSecret(bootstrapToken), last4(bootstrapToken)],
    )
  })

  after(async () => {
    if (!pool) return
    await pool.query(`DELETE FROM user_api_keys WHERE user_id = $1`, [testUserId]).catch(() => undefined)
    await pool.query(`DELETE FROM ssh_keys WHERE user_id = $1`, [testUserId]).catch(() => undefined)
    await pool.query(`DELETE FROM provider_keys WHERE user_id = $1`, [testUserId]).catch(() => undefined)
    await pool.query(`DELETE FROM profiles WHERE user_id = $1`, [testUserId]).catch(() => undefined)
    await pool.query(`DELETE FROM "user" WHERE id = $1`, [testUserId]).catch(() => undefined)
    await pool.end().catch(() => undefined)
  })

  it('rejects unauthenticated access', async () => {
    const me = await callApi('GET', '/api/v1/me')
    assert.equal(me.status, 401)
    const list = await callApi('GET', '/api/account-keys')
    assert.equal(list.status, 401)
  })

  it('rejects invalid bearer tokens', async () => {
    const res = await callApi('GET', '/api/v1/me', 'sk-soumtok-not-a-real-key')
    assert.equal(res.status, 401)
  })

  it('authenticates with user API key on /api/v1/me', async () => {
    const res = await callApi('GET', '/api/v1/me', bootstrapToken)
    assert.equal(res.status, 200)
    assert.equal(res.data.id, testUserId)
    assert.equal(res.data.ready, true)
  })

  it('lists account keys with bearer auth', async () => {
    const res = await callApi('GET', '/api/account-keys', bootstrapToken)
    assert.equal(res.status, 200)
    const apiKeys = res.data.apiKeys as { id: string; name: string }[]
    assert.ok(Array.isArray(apiKeys))
    assert.ok(apiKeys.some((row) => row.id === bootstrapKeyId))
  })

  it('creates a new user API key via POST /api/account-keys', async () => {
    const res = await callApi('POST', '/api/account-keys', bootstrapToken, {
      name: 'CI test key',
      expiresInDays: 30,
    })
    assert.equal(res.status, 200)
    assert.match(String(res.data.token || ''), /^sk-soumtok-/)
    createdKeyId = String(res.data.id)
    createdKeyToken = String(res.data.token)
    assert.equal(res.data.name, 'CI test key')
  })

  it('authenticates with the newly created key', async () => {
    const res = await callApi('GET', '/api/v1/me', createdKeyToken)
    assert.equal(res.status, 200)
    assert.equal(res.data.id, testUserId)
  })

  it('loads models with bearer auth', async () => {
    const res = await callApi('GET', '/api/desktop/models', createdKeyToken)
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.data.models))
  })

  it('creates and lists SSH keys', async () => {
    const generated = generateSshKey('soumtok-integration')
    const res = await callApi('POST', '/api/ssh-keys', bootstrapToken, {
      name: 'Integration SSH',
      publicKey: generated.publicKey,
    })
    assert.equal(res.status, 200)
    sshKeyId = String(res.data.id)
    assert.equal(res.data.fingerprint, generated.fingerprint)

    const list = await callApi('GET', '/api/account-keys', bootstrapToken)
    const sshKeys = list.data.sshKeys as { id: string; name: string }[]
    assert.ok(sshKeys.some((row) => row.id === sshKeyId && row.name === 'Integration SSH'))
  })

  it('saves and lists provider keys on Pro plan', async () => {
    const secret = `sk-test-${randomBytes(16).toString('hex')}`
    const save = await callApi('PUT', '/api/keys', bootstrapToken, {
      provider: 'openai',
      key: secret,
      label: 'Test OpenAI',
    })
    assert.equal(save.status, 200)

    const list = await callApi('GET', '/api/keys', bootstrapToken)
    assert.equal(list.status, 200)
    const keys = list.data.keys as { provider: string; last4: string }[]
    assert.ok(keys.some((row) => row.provider === 'openai' && row.last4 === secret.slice(-4)))

    const del = await callApi('DELETE', '/api/keys/openai', bootstrapToken)
    assert.equal(del.status, 200)
  })

  it('revokes keys and SSH keys', async () => {
    if (createdKeyId) {
      const delApi = await callApi('DELETE', `/api/account-keys/${createdKeyId}`, bootstrapToken)
      assert.equal(delApi.status, 200)
      const dead = await callApi('GET', '/api/v1/me', createdKeyToken)
      assert.equal(dead.status, 401)
    }
    if (sshKeyId) {
      const delSsh = await callApi('DELETE', `/api/ssh-keys/${sshKeyId}`, bootstrapToken)
      assert.equal(delSsh.status, 200)
    }
  })
})
