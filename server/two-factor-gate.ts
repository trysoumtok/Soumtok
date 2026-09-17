import { createHmac } from 'node:crypto'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Context } from 'hono'
import { auth } from './auth.ts'
import { pool } from './db.ts'
import { authCrossSubDomainCookies, env } from './env.ts'

const COOKIE = 'soumtok_2fa'
const MAX_AGE = 60 * 60 * 24 * 30

function stamp(token: string) {
  return createHmac('sha256', env.betterAuthSecret || 'soumtok').update(token).digest('hex')
}

export function twoFactorCookieOk(c: Context, sessionToken: string) {
  const value = getCookie(c, COOKIE)
  return Boolean(value && value === stamp(sessionToken))
}

export function grantTwoFactorCookie(c: Context, sessionToken: string) {
  const cross = authCrossSubDomainCookies()
  setCookie(c, COOKIE, stamp(sessionToken), {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: env.betterAuthUrl.startsWith('https'),
    maxAge: MAX_AGE,
    ...(cross ? { domain: cross.domain } : {}),
  })
}

export function clearTwoFactorCookie(c: Context) {
  const cross = authCrossSubDomainCookies()
  deleteCookie(c, COOKIE, { path: '/', ...(cross ? { domain: cross.domain } : {}) })
}

export async function userTwoFactorEnabled(userId: string) {
  if (!pool) return false
  const camel = await pool
    .query(`SELECT "twoFactorEnabled" AS on FROM "user" WHERE id = $1`, [userId])
    .catch(() => null)
  if (camel?.rows[0]?.on != null) return Boolean(camel.rows[0].on)
  const snake = await pool
    .query(`SELECT two_factor_enabled AS on FROM "user" WHERE id = $1`, [userId])
    .catch(() => null)
  return Boolean(snake?.rows[0]?.on)
}

export async function sessionNeedsTwoFactor(c: Context, userId: string, sessionToken: string) {
  if (!(await userTwoFactorEnabled(userId))) return false
  return !twoFactorCookieOk(c, sessionToken)
}

export function registerTwoFactorGate(
  app: { get: Function; post: Function; all: Function },
  requireUser: (c: Context) => Promise<{ user: { id: string }; session: { token: string } } | null>,
) {
  app.get('/api/me/2fa', async (c: Context) => {
    const session = await requireUser(c)
    if (!session) return c.json({ enabled: false, needed: false })
    const enabled = await userTwoFactorEnabled(session.user.id)
    return c.json({
      enabled,
      needed: enabled && !twoFactorCookieOk(c, session.session.token),
    })
  })

  app.post('/api/me/2fa/confirm', async (c: Context) => {
    if (!auth) return c.json({ error: 'Unavailable' }, 503)
    const body = await c.req.json<{ code?: string }>().catch(() => ({ code: '' }))
    const code = body.code?.trim() || ''
    if (!code) return c.json({ error: 'Enter your authenticator or backup code' }, 400)
    const headers = c.req.raw.headers
    const verify =
      code.length === 6 && /^\d+$/.test(code)
        ? auth.api.verifyTOTP({ body: { code }, headers, asResponse: true })
        : auth.api.verifyBackupCode({ body: { code }, headers, asResponse: true })
    const res = await verify
    const data = (await res.json().catch(() => ({}))) as { token?: string; message?: string; error?: string }
    if (!res.ok) {
      return c.json({ error: data.message || data.error || 'That code is not valid' }, 400)
    }
    for (const cookie of res.headers.getSetCookie?.() || []) {
      c.header('Set-Cookie', cookie, { append: true })
    }
    const token =
      data.token ||
      (await auth.api.getSession({ headers }))?.session.token
    if (!token) return c.json({ error: 'Could not verify 2-factor' }, 400)
    grantTwoFactorCookie(c, token)
    return c.json({ ok: true })
  })

  app.post('/api/me/2fa/clear', async (c: Context) => {
    const session = await requireUser(c)
    if (!session) return c.json({ error: 'Unauthorized' }, 401)
    clearTwoFactorCookie(c)
    return c.json({ ok: true })
  })
}
