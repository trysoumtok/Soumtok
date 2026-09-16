import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { auth } from './auth.ts'
import { pool } from './db.ts'
import { normalizeUsername, usernameError } from '../shared/username.ts'
import {
  env,
  hasBunny,
  hasDatabase,
  hasImageGen,
  hasGithub,
  hasGoogle,
  hasPayhero,
  hasPaypal,
  hasSmtp,
  hasTwilio,
  isAllowedOrigin,
  oauthRedirectUris,
  openAccessForBuilding,
} from './env.ts'
import { contactInboxEmail, sendMail, verificationEmail } from './mail.ts'
import { consumeCode, issueCode } from './verify.ts'
import { migrate } from './migrate.ts'
import { deleteFromBunny, downloadFromBunny, safeFileName, uploadToBunny } from './storage.ts'
import { registerGithubSetup } from './github-setup.ts'
import { registerGithub, syncGithubProfile } from './github.ts'
import { registerStudio } from './studio.ts'
import { registerBilling } from './billing.ts'
import { registerTwoFactorGate, sessionNeedsTwoFactor } from './two-factor-gate.ts'
import { registerAccountKeys } from './account-keys.ts'
import { registerPlugins } from './plugins.ts'
import { registerConnectors } from './connectors.ts'
import { registerDevice } from './device.ts'
import { registerDesktopAuth } from './desktop-auth.ts'
import { registerTestHub } from './testHub.ts'
import { registerSkills } from './skills.ts'
import { registerSeo } from './seo.ts'
import { hashSecret } from './secrets.ts'
import { BLOCKED_EMAIL_MESSAGE, isBlockedEmail } from './blocked-emails.ts'

export const app = new Hono()
registerSeo(app)
registerGithubSetup(app)
registerGithub(app, requireReadyUser)
registerStudio(app, requireReadyUser)
registerTestHub(app, requireReadyUser)
registerBilling(app, requireReadyUser)
registerAccountKeys(app, requireReadyUser)
registerPlugins(app, requireReadyUser)
registerConnectors(app, requireReadyUser)
registerDevice(app, requireReadyUser)
registerDesktopAuth(app, requireUser)
registerSkills(app, requireReadyUser)
registerTwoFactorGate(app, requireUser)

app.use(
  '/api/*',
  cors({
    origin: (origin) => (origin && isAllowedOrigin(origin) ? origin : env.betterAuthUrl),
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  }),
)

app.get('/api/signup/status', async (c) => {
  const email = c.req.query('email') || ''
  if (!email.trim()) return c.json({ blocked: false })
  const blocked = await isBlockedEmail(email)
  return c.json({
    blocked,
    message: blocked ? BLOCKED_EMAIL_MESSAGE : '',
  })
})

const contactHits = new Map<string, number[]>()

app.post('/api/contact', async (c) => {
  const body = await c.req.json<{ email?: string; topic?: string; message?: string }>().catch(() => ({}))
  const email = body.email?.trim() || ''
  const topic = body.topic?.trim() || ''
  const message = body.message?.trim() || ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'Please enter a valid work email address.' }, 400)
  }
  if (!topic) return c.json({ error: 'Select what we can help you with.' }, 400)
  if (message.length < 8) return c.json({ error: 'Write a short message so we know how to help.' }, 400)
  if (message.length > 4000) return c.json({ error: 'Keep the message under 4000 characters.' }, 400)
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  const now = Date.now()
  const recent = (contactHits.get(ip) || []).filter((at) => now - at < 10 * 60_000)
  if (recent.length >= 5) return c.json({ error: 'Too many messages. Try again in a few minutes.' }, 429)
  recent.push(now)
  contactHits.set(ip, recent)
  const mail = contactInboxEmail({ email, topic, message })
  try {
    await sendMail('support@soumtok.com', mail.subject, mail.text, mail.html, email)
  } catch (error) {
    console.error('[contact] send failed', error)
    return c.json({ error: 'Could not deliver that message. Try again.' }, 502)
  }
  return c.json({ ok: true, inbox: 'support@soumtok.com' })
})

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    database: hasDatabase(),
    google: hasGoogle(),
    github: hasGithub(),
    oauth: oauthRedirectUris(),
    storage: hasBunny(),
    mail: hasSmtp(),
    sms: hasTwilio(),
    image: hasImageGen(),
    paypal: hasPaypal(),
    payhero: hasPayhero(),
    coding: {
      openai: Boolean(env.openaiKey),
      anthropic: Boolean(env.anthropicKey),
      google: Boolean(env.googleAiKey),
      deepseek: Boolean(env.deepseekKey),
      xai: Boolean(env.xaiKey),
    },
    openAccess: openAccessForBuilding(),
  }),
)

app.all('/api/auth/*', async (c) => {
  if (!auth) {
    return c.json(
      {
        error:
          'Database is not connected. Add DATABASE_URL from Neon to your .env file, then run npm run db:migrate.',
      },
      503,
    )
  }
  const res = await auth.handler(c.req.raw)
  if (c.req.path.includes('sign-out')) {
    const next = new Response(res.body, res)
    next.headers.append('Set-Cookie', 'soumtok_2fa=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax')
    return next
  }
  return res
})

async function requireUser(c: Context) {
  if (!auth) return null
  return auth.api.getSession({ headers: c.req.raw.headers })
}

async function sessionFromApiKey(c: Context) {
  const header = c.req.header('Authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token.startsWith('sk-soumtok-') || !pool) return null
  const found = await pool.query(
    `SELECT id, user_id FROM user_api_keys
     WHERE key_hash = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
    [hashSecret(token)],
  )
  const row = found.rows[0] as { id: string; user_id: string } | undefined
  if (!row) return null
  await pool.query(`UPDATE user_api_keys SET last_used_at = now() WHERE id = $1`, [row.id])
  const user = await pool.query(`SELECT id, email, name FROM "user" WHERE id = $1`, [row.user_id])
  const account = user.rows[0] as { id: string; email?: string | null; name?: string | null } | undefined
  if (!account) return null
  return {
    user: account,
    session: { token: `api-key:${row.id}` },
  }
}

async function requireReadyUser(c: Context) {
  const cookieSession = await requireUser(c)
  const session = cookieSession || (await sessionFromApiKey(c))
  if (!session || !pool) return { session: null as typeof cookieSession, ready: false }
  if (cookieSession && (await sessionNeedsTwoFactor(c, cookieSession.user.id, cookieSession.session.token))) {
    return { session: null as typeof cookieSession, ready: false }
  }

  const result = await pool.query(
    `SELECT completed_at, email_verified_at, username
     FROM profiles WHERE user_id = $1`,
    [session.user.id],
  )
  const row = result.rows[0]
  return {
    session,
    ready: Boolean(row?.completed_at && row.email_verified_at && row.username),
  }
}

app.get('/api/me', async (c) => {
  const session = await requireUser(c)
  if (!session) return c.json({ user: null }, 401)
  return c.json(session)
})

app.get('/api/usernames/check', async (c) => {
  if (!pool) return c.json({ available: false, error: 'Database is not connected' }, 503)

  const username = normalizeUsername(c.req.query('username') ?? '')
  const issue = usernameError(username)
  if (issue) return c.json({ available: false, error: issue })

  const session = await requireUser(c)
  const taken = await pool.query(
    `SELECT user_id FROM profiles WHERE lower(username) = lower($1) AND user_id <> $2`,
    [username, session?.user.id ?? ''],
  )
  if ((taken.rowCount ?? 0) > 0) {
    return c.json({ available: false, error: 'That username is already taken' })
  }
  return c.json({ available: true })
})

app.get('/api/documents', async (c) => {
  const { session, ready } = await requireReadyUser(c)
  if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
  if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

  const result = await pool.query(
    `SELECT id, title, content, folder, created_at, updated_at
     FROM documents
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [session.user.id],
  )
  return c.json({ documents: result.rows })
})

const PROFILE_SELECT = `username, how_found, how_found_other, country, state, po_box, birth_date, phone, phone_verified_at, email_verified_at, completed_at, github_id, github_login, avatar_path, company_name, company_role, company_logo_path, plan, plan_status, first_name, last_name, profile_links, public_profile, share_usage_data, theme, light_theme, dark_theme, pr_provider`

type ProfileRow = {
  username: string | null
  how_found: string | null
  how_found_other: string | null
  country: string | null
  state: string | null
  po_box: string | null
  birth_date: string | Date | null
  phone: string | null
  phone_verified_at: string | Date | null
  email_verified_at: string | Date | null
  completed_at: string | Date | null
  github_id: string | null
  github_login: string | null
  avatar_path: string | null
  company_name: string | null
  company_role: string | null
  company_logo_path: string | null
  plan?: string | null
  plan_status?: string | null
  first_name?: string | null
  last_name?: string | null
  profile_links?: unknown
  public_profile?: boolean | null
  share_usage_data?: boolean | null
  theme?: string | null
  light_theme?: string | null
  dark_theme?: string | null
  pr_provider?: string | null
}

function parseLinks(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 8)
}

function rowToProfile(row: ProfileRow | undefined) {
  if (!row) {
    return {
      username: null,
      howFound: null,
      howFoundOther: null,
      country: null,
      state: null,
      poBox: null,
      birthDate: null,
      phone: null,
      phoneVerified: false,
      emailVerified: false,
      completed: false,
      githubId: null,
      githubLogin: null,
      hasAvatar: false,
      companyName: null,
      companyRole: null,
      hasCompanyLogo: false,
      plan: 'hobby',
      planStatus: 'active',
      firstName: null,
      lastName: null,
      links: [] as string[],
      publicProfile: false,
      shareUsageData: true,
      theme: 'system',
      lightTheme: 'soumtok-light',
      darkTheme: 'soumtok-dark',
      prProvider: 'github',
    }
  }

  const birth =
    row.birth_date instanceof Date
      ? row.birth_date.toISOString().slice(0, 10)
      : row.birth_date

  return {
    username: row.username,
    howFound: row.how_found,
    howFoundOther: row.how_found_other,
    country: row.country,
    state: row.state,
    poBox: row.po_box,
    birthDate: birth,
    phone: row.phone,
    phoneVerified: Boolean(row.phone_verified_at),
    emailVerified: Boolean(row.email_verified_at),
    completed: Boolean(row.completed_at),
    githubId: row.github_id,
    githubLogin: row.github_login,
    hasAvatar: Boolean(row.avatar_path),
    companyName: row.company_name,
    companyRole: row.company_role,
    hasCompanyLogo: Boolean(row.company_logo_path),
    plan: row.plan || 'hobby',
    planStatus: row.plan_status || 'active',
    firstName: row.first_name || null,
    lastName: row.last_name || null,
    links: parseLinks(row.profile_links),
    publicProfile: Boolean(row.public_profile),
    shareUsageData: row.share_usage_data !== false,
    theme: row.theme || 'system',
    lightTheme: row.light_theme || 'soumtok-light',
    darkTheme: row.dark_theme || 'soumtok-dark',
    prProvider: row.pr_provider || 'github',
  }
}

async function loadProfile(userId: string) {
  const result = await pool!.query(`SELECT ${PROFILE_SELECT} FROM profiles WHERE user_id = $1`, [userId])
  return rowToProfile(result.rows[0])
}

async function finishIfReady(userId: string) {
  await pool!.query(
    `UPDATE profiles
     SET completed_at = NOW(), updated_at = NOW()
     WHERE user_id = $1
       AND username IS NOT NULL
       AND how_found IS NOT NULL
       AND country IS NOT NULL
       AND email_verified_at IS NOT NULL
       AND completed_at IS NULL`,
    [userId],
  )
}

app.get('/api/me/profile', async (c) => {
  const session = await requireUser(c)
  if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)

  await pool.query(
    `INSERT INTO profiles (user_id, updated_at) VALUES ($1, NOW())
     ON CONFLICT (user_id) DO NOTHING`,
    [session.user.id],
  )

  await pool.query(
    `UPDATE profiles p
     SET github_id = a."accountId",
         updated_at = NOW()
     FROM account a
     WHERE p.user_id = $1
       AND a."userId" = p.user_id
       AND a."providerId" = 'github'`,
    [session.user.id],
  )
  await syncGithubProfile(session.user.id).catch(() => undefined)

  await finishIfReady(session.user.id)
  return c.json(await loadProfile(session.user.id))
})

app.put('/api/me/profile', async (c) => {
  const session = await requireUser(c)
  if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json<{
    step?: number
    username?: string
    howFound?: string
    howFoundOther?: string
    country?: string
    state?: string
    poBox?: string
    birthDate?: string
  }>()

  const step = body.step ?? 0

  if (step === 1) {
    const username = normalizeUsername(body.username ?? '')
    const issue = usernameError(username)
    if (issue) return c.json({ error: issue }, 400)

    const taken = await pool.query(
      `SELECT user_id FROM profiles WHERE lower(username) = lower($1) AND user_id <> $2`,
      [username, session.user.id],
    )
    if ((taken.rowCount ?? 0) > 0) {
      return c.json({ error: 'That username is already taken' }, 409)
    }

    try {
      await pool.query(
        `INSERT INTO profiles (user_id, username, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username, updated_at = NOW()`,
        [session.user.id, username],
      )
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      if (code === '23505') return c.json({ error: 'That username is already taken' }, 409)
      throw error
    }
  } else if (step === 2) {
    const howFound = body.howFound?.trim() ?? ''
    if (!howFound) return c.json({ error: 'Tell us how you found Soumtok' }, 400)
    const howFoundOther = howFound === 'Other' ? body.howFoundOther?.trim() || null : null
    if (howFound === 'Other' && !howFoundOther) {
      return c.json({ error: 'Tell us a bit more' }, 400)
    }

    await pool.query(
      `INSERT INTO profiles (user_id, how_found, how_found_other, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         how_found = EXCLUDED.how_found,
         how_found_other = EXCLUDED.how_found_other,
         updated_at = NOW()`,
      [session.user.id, howFound, howFoundOther],
    )
  } else if (step === 3) {
    const prior = await pool.query(
      `SELECT username, how_found FROM profiles WHERE user_id = $1`,
      [session.user.id],
    )
    if (!prior.rows[0]?.username || !prior.rows[0]?.how_found) {
      return c.json({ error: 'Finish username and how you found us first' }, 400)
    }

    const country = body.country?.trim() ?? ''
    const state = body.state?.trim() ?? ''
    const poBox = body.poBox?.trim() ?? ''
    const birthDate = body.birthDate?.trim() ?? ''
    if (!country || country.length < 2) return c.json({ error: 'Country is required' }, 400)
    if (state.length < 2 || state.length > 80) return c.json({ error: 'Enter your state or region' }, 400)
    if (poBox.length < 3 || poBox.length > 40) {
      return c.json({ error: 'PO box must be 3–40 characters' }, 400)
    }
    if (!birthDate) return c.json({ error: 'Birth date is required' }, 400)

    const born = new Date(birthDate)
    if (Number.isNaN(born.getTime())) return c.json({ error: 'Enter a valid birth date' }, 400)
    const today = new Date()
    if (born > today) return c.json({ error: 'Birth date cannot be in the future' }, 400)
    const oldest = new Date()
    oldest.setFullYear(oldest.getFullYear() - 120)
    if (born < oldest) return c.json({ error: 'Enter a valid birth date' }, 400)
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - 13)
    if (born > cutoff) return c.json({ error: 'You must be at least 13' }, 400)

    await pool.query(
      `INSERT INTO profiles (user_id, country, state, po_box, birth_date, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         country = EXCLUDED.country,
         state = EXCLUDED.state,
         po_box = EXCLUDED.po_box,
         birth_date = EXCLUDED.birth_date,
         updated_at = NOW()`,
      [session.user.id, country, state, poBox, birthDate],
    )
  } else {
    return c.json({ error: 'Unknown step' }, 400)
  }

  return c.json(await loadProfile(session.user.id))
})

app.post('/api/me/verify/email/send', async (c) => {
  const session = await requireUser(c)
  if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
  if (!session.user.email) return c.json({ error: 'No email on this account' }, 400)

  if (await loadProfile(session.user.id).then((profile) => profile.emailVerified)) {
    return c.json({ ok: true, already: true, via: 'code' })
  }

  const code = await issueCode(session.user.id, 'email', session.user.email)
  const mail = verificationEmail(code)
  await sendMail(session.user.email, mail.subject, mail.text, mail.html)
  return c.json({ ok: true, via: hasSmtp() ? 'email' : 'log' })
})

app.post('/api/me/verify/email/confirm', async (c) => {
  const session = await requireUser(c)
  if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
  const { code } = await c.req.json<{ code?: string }>()
  if (!code?.trim()) return c.json({ error: 'Enter the 6-digit code' }, 400)

  const ok = await consumeCode(session.user.id, 'email', session.user.email, code)
  if (!ok) return c.json({ error: 'That code is invalid or expired' }, 400)

  await pool.query(
    `UPDATE profiles SET email_verified_at = NOW(), updated_at = NOW() WHERE user_id = $1`,
    [session.user.id],
  )
  await finishIfReady(session.user.id)
  return c.json(await loadProfile(session.user.id))
})

app.post('/api/documents', async (c) => {
  const { session, ready } = await requireReadyUser(c)
  if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
  if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

  const body = await c.req.json<{ title?: string; content?: string; folder?: string }>()
  const title = body.title?.trim() || 'Untitled'
  const content = body.content?.trim() ?? ''
  const folder = body.folder?.trim().replace(/^\/+|\/+$/g, '') || ''
  const id = crypto.randomUUID()

  await pool.query(
    `INSERT INTO documents (id, user_id, title, content, folder)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, session.user.id, title, content, folder],
  )

  return c.json({ id, title, content, folder }, 201)
})

app.put('/api/documents/:id', async (c) => {
  const { session, ready } = await requireReadyUser(c)
  if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
  if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
  const body = await c.req.json<{ title?: string; content?: string; folder?: string }>()
  const result = await pool.query(
    `UPDATE documents
        SET title = COALESCE($3, title),
            content = COALESCE($4, content),
            folder = COALESCE($5, folder),
            updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING id, title, content, folder, created_at, updated_at`,
    [c.req.param('id'), session.user.id, body.title?.trim() || null, body.content ?? null, body.folder?.trim() ?? null],
  )
  if (!result.rows[0]) return c.json({ error: 'Document not found' }, 404)
  return c.json(result.rows[0])
})

app.delete('/api/documents/:id', async (c) => {
  const { session, ready } = await requireReadyUser(c)
  if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
  if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
  await pool.query(`DELETE FROM documents WHERE id = $1 AND user_id = $2`, [c.req.param('id'), session.user.id])
  return c.json({ ok: true })
})

app.get('/api/files', async (c) => {
  const { session, ready } = await requireReadyUser(c)
  if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
  if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

  const result = await pool.query(
    `SELECT id, name, size, content_type, created_at
     FROM files
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [session.user.id],
  )
  return c.json({ files: result.rows })
})

app.post('/api/files', async (c) => {
  const { session, ready } = await requireReadyUser(c)
  if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
  if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
  if (!hasBunny()) return c.json({ error: 'Storage is not connected' }, 503)

  const form = await c.req.formData()
  const uploaded = form.get('file')
  if (!(uploaded instanceof File)) return c.json({ error: 'Choose a file' }, 400)
  if (uploaded.size > 25 * 1024 * 1024) return c.json({ error: 'File must be under 25 MB' }, 400)

  const id = crypto.randomUUID()
  const name = safeFileName(uploaded.name)
  const path = `users/${session.user.id}/${id}/${name}`
  const bytes = new Uint8Array(await uploaded.arrayBuffer())
  const contentType = uploaded.type || 'application/octet-stream'

  await uploadToBunny(path, bytes, contentType)
  await pool.query(
    `INSERT INTO files (id, user_id, name, path, size, content_type)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, session.user.id, name, path, uploaded.size, contentType],
  )

  return c.json({ id, name, size: uploaded.size, contentType }, 201)
})

app.get('/api/files/:id/download', async (c) => {
  const { session, ready } = await requireReadyUser(c)
  if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
  if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

  const result = await pool.query(
    `SELECT name, path, content_type FROM files WHERE id = $1 AND user_id = $2`,
    [c.req.param('id'), session.user.id],
  )
  const file = result.rows[0] as { name: string; path: string; content_type: string } | undefined
  const ownedPrefix = `users/${session.user.id}/`
  if (!file || !file.path.startsWith(ownedPrefix)) return c.json({ error: 'Not found' }, 404)

  const stored = await downloadFromBunny(file.path)
  const inline = c.req.query('inline') === '1' || file.content_type.startsWith('image/')
  return new Response(stored.bytes, {
    headers: {
      'Content-Type': file.content_type || stored.contentType,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${file.name}"`,
    },
  })
})

app.delete('/api/files/:id', async (c) => {
  const { session, ready } = await requireReadyUser(c)
  if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
  if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

  const result = await pool.query(
    `SELECT path FROM files WHERE id = $1 AND user_id = $2`,
    [c.req.param('id'), session.user.id],
  )
  const file = result.rows[0] as { path: string } | undefined
  const ownedPrefix = `users/${session.user.id}/`
  if (!file || !file.path.startsWith(ownedPrefix)) return c.json({ error: 'Not found' }, 404)

  await deleteFromBunny(file.path)
  await pool.query(`DELETE FROM files WHERE id = $1 AND user_id = $2`, [c.req.param('id'), session.user.id])
  return c.json({ ok: true })
})

app.get('/api/u/:username', async (c) => {
  if (!pool) return c.json({ error: 'Unavailable' }, 503)
  const username = normalizeUsername(c.req.param('username') ?? '')
  if (usernameError(username)) return c.json({ error: 'Not found' }, 404)
  const result = await pool.query(
    `SELECT user_id, username, first_name, last_name, profile_links, public_profile, avatar_path
     FROM profiles WHERE lower(username) = lower($1)`,
    [username],
  )
  const row = result.rows[0] as
    | {
        user_id: string
        username: string
        first_name: string | null
        last_name: string | null
        profile_links: unknown
        public_profile: boolean
        avatar_path: string | null
      }
    | undefined
  if (!row) return c.json({ error: 'Not found' }, 404)
  const viewer = await requireUser(c)
  const own = viewer?.user.id === row.user_id
  if (!row.public_profile && !own) return c.json({ error: 'This profile is private', private: true }, 404)
  return c.json({
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    links: parseLinks(row.profile_links),
    publicProfile: Boolean(row.public_profile),
    hasAvatar: Boolean(row.avatar_path),
    own,
  })
})

app.get('/api/u/:username/photo', async (c) => {
  if (!pool) return c.json({ error: 'Unavailable' }, 503)
  const username = normalizeUsername(c.req.param('username') ?? '')
  if (usernameError(username)) return c.json({ error: 'Not found' }, 404)
  const result = await pool.query(
    `SELECT user_id, avatar_path, public_profile FROM profiles WHERE lower(username) = lower($1)`,
    [username],
  )
  const row = result.rows[0] as
    | { user_id: string; avatar_path: string | null; public_profile: boolean }
    | undefined
  if (!row?.avatar_path) return c.json({ error: 'Not found' }, 404)
  const viewer = await requireUser(c)
  if (!row.public_profile && viewer?.user.id !== row.user_id) return c.json({ error: 'Not found' }, 404)
  const stored = await downloadFromBunny(row.avatar_path)
  return new Response(stored.bytes, {
    headers: { 'Content-Type': stored.contentType, 'Cache-Control': 'public, max-age=120' },
  })
})

let migrated = false

export async function ensureMigrated() {
  if (!hasDatabase()) return
  if (migrated) {
    await migrate()
    return
  }
  await migrate()
  migrated = true
}
