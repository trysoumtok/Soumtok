import type { Hono } from 'hono'
import { catalogPlugin } from '../shared/plugins.ts'
import { connectorLoginUrl } from '../shared/connectors.ts'
import { formatUserCode, mintUserCode, normalizeUserCode } from '../shared/connectLinks.ts'
import { pool } from './db.ts'
import { env, hasGithub } from './env.ts'
import { encryptSecret } from './secrets.ts'
import { ensureCatalogConnector } from './connectors.ts'
import { githubAccessToken } from './github.ts'

type ReadyFn = (c: { req: { raw: Request } }) => Promise<{
  session: { user: { id: string } } | null
  ready: boolean
}>

type DeviceRow = {
  code: string
  user_id: string
  connector_id: string | null
  plugin_id: string | null
  kind: string
  github_device_code: string | null
  github_interval: number | null
  verification_uri: string | null
  status: string
  expires_at: Date | string
}

function origin() {
  return env.betterAuthUrl.replace(/\/$/, '') || 'http://localhost:5173'
}

function publicPayload(row: DeviceRow, extra: Record<string, unknown> = {}) {
  const plugin = row.plugin_id ? catalogPlugin(row.plugin_id) : null
  return {
    code: formatUserCode(row.code),
    provider: row.plugin_id || plugin?.id || 'service',
    name: plugin?.name || 'Service',
    kind: row.kind,
    status: row.status,
    url: row.verification_uri || `${origin()}/connect/${formatUserCode(row.code)}`,
    verificationUri: row.verification_uri || `${origin()}/connect/${formatUserCode(row.code)}`,
    connectorId: row.connector_id,
    expiresAt: row.expires_at,
    loginUrl: connectorLoginUrl(row.plugin_id || '') || plugin?.signupUrl || null,
    ...extra,
  }
}

async function loadDevice(code: string) {
  if (!pool) return null
  const normalized = normalizeUserCode(code)
  if (normalized.length < 6) return null
  const row = await pool.query(`SELECT * FROM connector_device_codes WHERE code = $1`, [normalized])
  return (row.rows[0] as DeviceRow | undefined) || null
}

async function startGithubDevice() {
  if (!hasGithub()) return null
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: env.githubClientId,
      scope: 'repo read:user user:email',
    }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    device_code?: string
    user_code?: string
    verification_uri?: string
    verification_uri_complete?: string
    expires_in?: number
    interval?: number
    error?: string
    error_description?: string
  }
  if (!res.ok || !data.device_code || !data.user_code) return null
  return data
}

async function pollGithubDevice(deviceCode: string) {
  const body = new URLSearchParams({
    client_id: env.githubClientId,
    device_code: deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device-code',
  })
  if (env.githubClientSecret) body.set('client_secret', env.githubClientSecret)
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  return (await res.json().catch(() => ({}))) as {
    access_token?: string
    error?: string
    error_description?: string
  }
}

async function markAuthorized(row: DeviceRow, token?: string) {
  if (!pool) return
  if (row.connector_id && token) {
    await pool.query(
      `UPDATE user_connectors
       SET token_ciphertext = $3, connected = true, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [row.connector_id, row.user_id, encryptSecret(token)],
    )
  } else if (row.connector_id) {
    await pool.query(
      `UPDATE user_connectors SET connected = true, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
      [row.connector_id, row.user_id],
    )
  }
  await pool.query(`UPDATE connector_device_codes SET status = 'authorized' WHERE code = $1`, [row.code])
}

async function refreshDevice(row: DeviceRow) {
  if (!pool) return { ...row, status: row.status }
  if (row.status === 'authorized') return row
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await pool.query(`UPDATE connector_device_codes SET status = 'expired' WHERE code = $1 AND status = 'pending'`, [
      row.code,
    ])
    return { ...row, status: 'expired' }
  }
  if (row.kind === 'github' && row.github_device_code) {
    const token = await pollGithubDevice(row.github_device_code)
    if (token.access_token) {
      await markAuthorized(row, token.access_token)
      return { ...row, status: 'authorized' }
    }
    if (token.error === 'authorization_pending' || token.error === 'slow_down') return row
    if (token.error === 'expired_token' || token.error === 'access_denied') {
      await pool.query(`UPDATE connector_device_codes SET status = $2 WHERE code = $1`, [
        row.code,
        token.error === 'access_denied' ? 'denied' : 'expired',
      ])
      return { ...row, status: token.error === 'access_denied' ? 'denied' : 'expired' }
    }
  }
  if (row.kind === 'github') {
    const existing = await githubAccessToken(row.user_id)
    if (existing) {
      await markAuthorized(row, existing)
      return { ...row, status: 'authorized' }
    }
  }
  if (row.connector_id) {
    const conn = await pool.query(`SELECT connected, token_ciphertext FROM user_connectors WHERE id = $1 AND user_id = $2`, [
      row.connector_id,
      row.user_id,
    ])
    if (conn.rows[0]?.connected || conn.rows[0]?.token_ciphertext) {
      await pool.query(`UPDATE connector_device_codes SET status = 'authorized' WHERE code = $1`, [row.code])
      return { ...row, status: 'authorized' }
    }
  }
  return row
}

export function registerDevice(app: Hono, requireReadyUser: ReadyFn) {
  app.post('/api/connect/start', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{ pluginId?: string; connectorId?: string }>()
    const pluginId = (body.pluginId || '').trim()
    const plugin = catalogPlugin(pluginId)
    if (!plugin) return c.json({ error: 'Unknown service' }, 400)
    let connector: { id: string; name: string; connected: boolean } | null = null
    try {
      connector = body.connectorId
        ? ((
            await pool.query(`SELECT id, name, connected FROM user_connectors WHERE id = $1 AND user_id = $2`, [
              body.connectorId,
              session.user.id,
            ])
          ).rows[0] as { id: string; name: string; connected: boolean } | undefined) || null
        : await ensureCatalogConnector(session.user.id, plugin.id)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Could not add that connector' }, 402)
    }

    await pool.query(
      `DELETE FROM connector_device_codes WHERE user_id = $1 AND (expires_at < NOW() OR (plugin_id = $2 AND status = 'pending'))`,
      [session.user.id, plugin.id],
    )

    if (plugin.id === 'github') {
      const gh = await startGithubDevice()
      if (gh?.user_code && gh.device_code) {
        const code = normalizeUserCode(gh.user_code)
        const url = gh.verification_uri_complete || gh.verification_uri || 'https://github.com/login/device'
        await pool.query(
          `INSERT INTO connector_device_codes
           (code, user_id, connector_id, plugin_id, kind, github_device_code, github_interval, verification_uri, status, expires_at)
           VALUES ($1,$2,$3,$4,'github',$5,$6,$7,'pending', NOW() + ($8::int * INTERVAL '1 second'))`,
          [
            code,
            session.user.id,
            connector?.id || null,
            plugin.id,
            gh.device_code,
            gh.interval || 5,
            url,
            String(gh.expires_in || 900),
          ],
        )
        return c.json({
          code: formatUserCode(code),
          url,
          verificationUri: url,
          provider: plugin.id,
          name: plugin.name,
          connectorId: connector?.id || null,
          kind: 'github',
          detail: 'Open GitHub, enter the code, then come back and tap I’ve connected.',
        })
      }
    }

    const minted = mintUserCode()
    const code = normalizeUserCode(minted)
    const url = `${origin()}/connect/${formatUserCode(code)}`
    await pool.query(
      `INSERT INTO connector_device_codes
       (code, user_id, connector_id, plugin_id, kind, verification_uri, status, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,'pending', NOW() + INTERVAL '15 minutes')`,
      [code, session.user.id, connector?.id || null, plugin.id, plugin.id === 'github' ? 'github' : 'mcp', url],
    )
    return c.json({
      code: formatUserCode(code),
      url,
      verificationUri: url,
      provider: plugin.id,
      name: plugin.name,
      connectorId: connector?.id || null,
      kind: plugin.id === 'github' ? 'github' : 'mcp',
      oauthStart: connector?.id ? `/api/connectors/${connector.id}/oauth/start` : null,
      detail: `Open the link, sign in to ${plugin.name}, and enter ${formatUserCode(code)} if asked. Then tap I’ve connected.`,
    })
  })

  app.get('/api/connect/device/:code', async (c) => {
    const row = await loadDevice(c.req.param('code'))
    if (!row) return c.json({ error: 'Unknown code' }, 404)
    const { session } = await requireReadyUser(c)
    if (!session || session.user.id !== row.user_id) {
      return c.json(publicPayload(row))
    }
    const next = await refreshDevice(row)
    return c.json(publicPayload(next, { mine: true }))
  })

  app.post('/api/connect/device/:code/authorize', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const row = await loadDevice(c.req.param('code'))
    if (!row) return c.json({ error: 'Unknown code' }, 404)
    if (row.user_id !== session.user.id) return c.json({ error: 'That code belongs to another account' }, 403)
    const next = await refreshDevice(row)
    if (next.status === 'authorized') return c.json(publicPayload(next, { mine: true }))
    if (next.status === 'expired' || next.status === 'denied') return c.json(publicPayload(next, { mine: true }), 410)

    if (row.kind === 'github') {
      const token = await githubAccessToken(session.user.id)
      if (token) {
        await markAuthorized(row, token)
        return c.json(publicPayload({ ...row, status: 'authorized' }, { mine: true }))
      }
      return c.json(
        publicPayload(next, {
          mine: true,
          oauthStart: null,
          github: true,
          detail: 'Open GitHub, enter the code, or sign in with GitHub on this page.',
        }),
      )
    }

    if (row.connector_id) {
      return c.json(
        publicPayload(next, {
          mine: true,
          oauthStart: `/api/connectors/${row.connector_id}/oauth/start`,
        }),
      )
    }

    await markAuthorized(row)
    return c.json(publicPayload({ ...row, status: 'authorized' }, { mine: true }))
  })
}
