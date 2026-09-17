import type { Context, Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readSessionCookie } from '../shared/session.ts'
import { pool } from './db.ts'
import { env } from './env.ts'

function sessionCookieToken(c: Context) {
  return readSessionCookie((name) => getCookie(c, name))
}

function verifierHash(verifier: string) {
  return createHash('sha256').update(verifier).digest('hex')
}

function newVerifier() {
  return randomBytes(32).toString('base64url')
}

type UserFn = (c: Context) => Promise<{ session?: { token?: string } } | null>

const pollHits = new Map<string, number[]>()

function rateLimitPoll(ip: string) {
  const now = Date.now()
  const recent = (pollHits.get(ip) || []).filter((at) => now - at < 60_000)
  if (recent.length >= 120) return false
  recent.push(now)
  pollHits.set(ip, recent)
  return true
}

async function ensureDesktopLoginTable() {
  if (!pool) return
  await pool.query(
    `CREATE TABLE IF NOT EXISTS desktop_login (
       id TEXT PRIMARY KEY,
       session_token TEXT,
       verifier_hash TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       expires_at TIMESTAMPTZ NOT NULL
     )`,
  )
  await pool.query(`ALTER TABLE desktop_login ADD COLUMN IF NOT EXISTS verifier_hash TEXT`)
}

export function registerDesktopAuth(app: Hono, requireUser: UserFn) {
  app.post('/api/desktop/start', async (c) => {
    if (!pool) return c.json({ error: 'Not ready' }, 503)
    await ensureDesktopLoginTable()
    const id = randomUUID().replaceAll('-', '')
    const verifier = newVerifier()
    await pool.query(`DELETE FROM desktop_login WHERE expires_at < NOW()`)
    await pool.query(
      `INSERT INTO desktop_login (id, verifier_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
      [id, verifierHash(verifier)],
    )
    const mode = ((await c.req.json().catch(() => ({}))) as { mode?: string }).mode
    const path = mode === 'up' ? '/signup' : '/login'
    const origin = env.betterAuthUrl.replace(/\/$/, '') || 'https://soumtok.com'
    return c.json({ id, verifier, url: `${origin}${path}?desktop=${id}` })
  })

  app.get('/api/desktop/poll/:id', async (c) => {
    if (!pool) return c.json({ status: 'pending' })
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
    if (!rateLimitPoll(ip)) return c.json({ status: 'pending' })
    const id = c.req.param('id')
    const verifier = (c.req.query('verifier') || '').trim()
    if (!verifier) return c.json({ status: 'pending' })
    const row = await pool.query(
      `SELECT session_token, verifier_hash, expires_at FROM desktop_login WHERE id = $1`,
      [id],
    )
    const item = row.rows[0] as
      | { session_token: string | null; verifier_hash: string | null; expires_at: string }
      | undefined
    if (!item || new Date(item.expires_at).getTime() < Date.now()) return c.json({ status: 'expired' })
    if (!item.verifier_hash || verifierHash(verifier) !== item.verifier_hash) {
      return c.json({ status: 'pending' })
    }
    if (!item.session_token) return c.json({ status: 'pending' })
    await pool.query(`DELETE FROM desktop_login WHERE id = $1`, [id])
    return c.json({ status: 'ready', token: item.session_token })
  })

  app.post('/api/desktop/finish', async (c) => {
    const session = await requireUser(c)
    if (!session || !pool) return c.json({ error: 'Sign in first' }, 401)
    const token = sessionCookieToken(c) || session.session?.token || ''
    if (!token) return c.json({ error: 'No session cookie' }, 401)
    const body = (await c.req.json().catch(() => ({}))) as { id?: string; verifier?: string }
    const id = String(body.id || '').trim()
    const verifier = String(body.verifier || '').trim()
    if (!id || !verifier) return c.json({ error: 'Missing login proof' }, 400)
    const updated = await pool.query(
      `UPDATE desktop_login
       SET session_token = $1
       WHERE id = $2
         AND expires_at > NOW()
         AND verifier_hash = $3
       RETURNING id`,
      [token, id, verifierHash(verifier)],
    )
    if (!updated.rowCount) {
      return c.json({ error: 'This sign-in expired or is invalid. Try again from the app.' }, 410)
    }
    return c.json({ ok: true })
  })
}
