import type { Hono } from 'hono'
import { randomBytes } from 'node:crypto'
import { pool } from './db.ts'
import { hashSecret, last4 } from './secrets.ts'
import { fingerprintPublicKey, generateSshKey, validPublicKey } from './ssh.ts'

type ReadyFn = (c: { req: { raw: Request; header: (name: string) => string | undefined } }) => Promise<{
  session: { user: { id: string; email?: string | null; name?: string | null } } | null
  ready: boolean
}>

export function registerAccountKeys(app: Hono, requireReadyUser: ReadyFn) {
  app.get('/api/account-keys', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const [apiKeys, sshKeys] = await Promise.all([
      pool.query(
        `SELECT id, name, last4, created_at, last_used_at, expires_at
         FROM user_api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
        [session.user.id],
      ),
      pool.query(
        `SELECT id, name, public_key, fingerprint, created_at
         FROM ssh_keys WHERE user_id = $1 ORDER BY created_at DESC`,
        [session.user.id],
      ),
    ])
    return c.json({
      apiKeys: apiKeys.rows.map((row) => ({
        ...row,
        status: row.expires_at && new Date(row.expires_at) <= new Date() ? 'expired' : 'active',
      })),
      sshKeys: sshKeys.rows.map((row) => ({ ...row, status: 'active' })),
    })
  })

  app.post('/api/account-keys', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{ name?: string; expiresInDays?: number | null }>()
    const name = body.name?.trim() || 'User API Key'
    const days = body.expiresInDays
    const expiresAt =
      typeof days === 'number' && days > 0 ? new Date(Date.now() + days * 86_400_000) : null
    const token = `sk-soumtok-${randomBytes(24).toString('base64url')}`
    const id = crypto.randomUUID()
    await pool.query(
      `INSERT INTO user_api_keys (id, user_id, name, key_hash, last4, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, session.user.id, name, hashSecret(token), last4(token), expiresAt],
    )
    return c.json({
      id,
      name,
      token,
      last4: last4(token),
      status: 'active',
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    })
  })

  app.delete('/api/account-keys/:id', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    await pool.query(`DELETE FROM user_api_keys WHERE id = $1 AND user_id = $2`, [c.req.param('id'), session.user.id])
    return c.json({ ok: true })
  })

  app.post('/api/ssh-keys', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{ name?: string; publicKey?: string }>()
    const name = body.name?.trim() || 'Soumtok'
    const comment = `soumtok-${name.replace(/\s+/g, '-').toLowerCase()}`
    let publicKey = body.publicKey?.trim() || ''
    let privateKey = ''
    let fingerprint = ''
    if (publicKey) {
      if (!validPublicKey(publicKey)) return c.json({ error: 'Paste a valid SSH public key.' }, 400)
      fingerprint = fingerprintPublicKey(publicKey)
    } else {
      const generated = generateSshKey(comment)
      publicKey = generated.publicKey
      privateKey = generated.privateKey
      fingerprint = generated.fingerprint
    }
    const id = crypto.randomUUID()
    await pool.query(
      `INSERT INTO ssh_keys (id, user_id, name, public_key, fingerprint) VALUES ($1, $2, $3, $4, $5)`,
      [id, session.user.id, name, publicKey, fingerprint],
    )
    return c.json({ id, name, publicKey, privateKey, fingerprint, status: 'active' })
  })

  app.delete('/api/ssh-keys/:id', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    await pool.query(`DELETE FROM ssh_keys WHERE id = $1 AND user_id = $2`, [c.req.param('id'), session.user.id])
    return c.json({ ok: true })
  })

  app.get('/api/v1/me', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session) return c.json({ error: 'Unauthorized' }, 401)
    return c.json({
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      ready,
    })
  })
}
