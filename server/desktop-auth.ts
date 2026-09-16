import type { Context, Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { randomUUID } from 'node:crypto'
import { readSessionCookie } from '../shared/session.ts'
import { pool } from './db.ts'
import { env } from './env.ts'

function sessionCookieToken(c: Context) {
  return readSessionCookie((name) => getCookie(c, name))
}

type UserFn = (c: Context) => Promise<{ session?: { token?: string } } | null>

export function registerDesktopAuth(app: Hono, requireUser: UserFn) {
  app.post('/api/desktop/start', async (c) => {
    if (!pool) return c.json({ error: 'Not ready' }, 503)
    const id = randomUUID().replaceAll('-', '')
    await pool.query(
      `CREATE TABLE IF NOT EXISTS desktop_login (
         id TEXT PRIMARY KEY,
         session_token TEXT,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         expires_at TIMESTAMPTZ NOT NULL
       )`,
    )
    await pool.query(`DELETE FROM desktop_login WHERE expires_at < NOW()`)
    await pool.query(`INSERT INTO desktop_login (id, expires_at) VALUES ($1, NOW() + INTERVAL '15 minutes')`, [id])
    const mode = ((await c.req.json().catch(() => ({}))) as { mode?: string }).mode
    const path = mode === 'up' ? '/signup' : '/login'
    const origin = env.betterAuthUrl.replace(/\/$/, '') || 'https://soumtok.com'
    return c.json({ id, url: `${origin}${path}?desktop=${id}` })
  })

  app.get('/api/desktop/poll/:id', async (c) => {
    if (!pool) return c.json({ status: 'pending' })
    const id = c.req.param('id')
    const row = await pool.query(`SELECT session_token, expires_at FROM desktop_login WHERE id = $1`, [id])
    const item = row.rows[0] as { session_token: string | null; expires_at: string } | undefined
    if (!item || new Date(item.expires_at).getTime() < Date.now()) return c.json({ status: 'expired' })
    if (!item.session_token) return c.json({ status: 'pending' })
    return c.json({ status: 'ready', token: item.session_token })
  })

  app.post('/api/desktop/finish', async (c) => {
    const session = await requireUser(c)
    if (!session || !pool) return c.json({ error: 'Sign in first' }, 401)
    const token = sessionCookieToken(c) || session.session?.token || ''
    if (!token) return c.json({ error: 'No session cookie' }, 401)
    const body = (await c.req.json().catch(() => ({}))) as { id?: string }
    const id = String(body.id || '').trim()
    if (!id) return c.json({ error: 'Missing login id' }, 400)
    const updated = await pool.query(
      `UPDATE desktop_login SET session_token = $1 WHERE id = $2 AND expires_at > NOW() RETURNING id`,
      [token, id],
    )
    if (!updated.rowCount) return c.json({ error: 'This sign-in expired. Try again from the app.' }, 410)
    return c.json({ ok: true })
  })
}
