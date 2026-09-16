import type { Hono } from 'hono'
import { catalogConnector, CONNECTOR_CATALOG, connectorLoginUrl, FREE_CONNECTOR_LIMIT, type ConnectorAuthMode, type ConnectorOAuthClient } from '../shared/connectors.ts'
import { catalogPlugin } from '../shared/plugins.ts'
import { hasPaidPlan } from '../shared/plans.ts'
import { pool } from './db.ts'
import { env } from './env.ts'
import { encryptSecret, decryptSecret } from './secrets.ts'
import { githubAccessToken } from './github.ts'
import { authorizeUrl, oauthRedirect, pkceChallenge } from './oauth.ts'
import { discoverMcpOauth } from './mcpOauth.ts'

type ReadyFn = (c: { req: { raw: Request } }) => Promise<{
  session: { user: { id: string } } | null
  ready: boolean
}>

const COLS = `id, slug, name, kind, source, plugin_id, mcp_url, auth_mode, oauth_client, connected, last_check, created_at, updated_at`

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|0\.|::1|\[::1\])/i

export async function userPlan(userId: string) {
  if (!pool) return 'hobby'
  const row = await pool.query(`SELECT plan FROM profiles WHERE user_id = $1`, [userId])
  return String(row.rows[0]?.plan || 'hobby')
}

export async function connectorUsage(userId: string) {
  const plan = await userPlan(userId)
  const paid = hasPaidPlan(plan)
  if (!pool) return { plan, paid, limit: paid ? null : FREE_CONNECTOR_LIMIT, used: 0, remaining: paid ? null : FREE_CONNECTOR_LIMIT }
  const count = await pool.query(`SELECT COUNT(*)::int AS n FROM user_connectors WHERE user_id = $1`, [userId])
  const used = Number(count.rows[0]?.n || 0)
  const limit = paid ? null : FREE_CONNECTOR_LIMIT
  const remaining = paid ? null : Math.max(0, FREE_CONNECTOR_LIMIT - used)
  return { plan, paid, limit, used, remaining }
}

export async function requireConnectorSlot(userId: string, mcpUrl?: string) {
  const usage = await connectorUsage(userId)
  if (usage.paid) return { ok: true as const, ...usage }
  if (mcpUrl && pool) {
    const existing = await pool.query(`SELECT id FROM user_connectors WHERE user_id = $1 AND mcp_url = $2`, [userId, mcpUrl])
    if (existing.rows[0]) return { ok: true as const, ...usage }
  }
  if ((usage.remaining ?? 0) <= 0) {
    return { ok: false as const, error: 'Free plan allows 1 connector. Upgrade to add more.', ...usage }
  }
  return { ok: true as const, ...usage }
}

export async function requirePluginSlot(userId: string, pluginId?: string) {
  const plan = await userPlan(userId)
  if (hasPaidPlan(plan)) return { ok: true as const, plan }
  if (!pool) return { ok: false as const, plan, error: 'Free plan allows 1 connector. Upgrade to add more.' }
  if (pluginId) {
    const existing = await pool.query(`SELECT id FROM user_plugins WHERE user_id = $1 AND plugin_id = $2`, [userId, pluginId])
    if (existing.rows[0]) return { ok: true as const, plan }
  }
  const count = await pool.query(`SELECT COUNT(*)::int AS n FROM user_plugins WHERE user_id = $1`, [userId])
  if (Number(count.rows[0]?.n || 0) >= FREE_CONNECTOR_LIMIT) {
    return { ok: false as const, plan, error: 'Free plan allows 1 connector. Upgrade to add more.' }
  }
  return { ok: true as const, plan }
}

function parseMcpUrl(raw: string) {
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'https:') return null
    if (PRIVATE_HOST.test(url.hostname) || url.hostname.endsWith('.local')) return null
    const parts = url.hostname.split('.')
    if (parts.length === 4 && parts.every((part) => /^\d+$/.test(part))) {
      const a = Number(parts[0])
      const b = Number(parts[1])
      if (a === 172 && b >= 16 && b <= 31) return null
      if (a === 169 && b === 254) return null
    }
    return url
  } catch {
    return null
  }
}

type ProbeStep = { id: string; label: string; status: 'done' | 'fail' | 'skip'; code?: string; detail: string }

type McpInfo = {
  serverName: string | null
  serverVersion: string | null
  protocol: string | null
  instructions: string | null
  capabilities: string[]
  tools: { name: string; description: string }[]
  resources: { uri: string; name: string }[]
  prompts: { name: string }[]
  toolsLocked: boolean
}

function emptyMcp(): McpInfo {
  return {
    serverName: null,
    serverVersion: null,
    protocol: null,
    instructions: null,
    capabilities: [],
    tools: [],
    resources: [],
    prompts: [],
    toolsLocked: false,
  }
}

async function fetchUrl(url: string, init: RequestInit) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    return await fetch(url, { ...init, redirect: 'follow', signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

type RpcBody = { result?: Record<string, unknown>; error?: { message?: string } }

function unwrapRpc(parsed: unknown): RpcBody | null {
  if (!parsed || typeof parsed !== 'object') return null
  if (Array.isArray(parsed)) {
    const hit = parsed.find((item) => item && typeof item === 'object' && ('result' in item || 'error' in item))
    return (hit || parsed[0] || null) as RpcBody | null
  }
  return parsed as RpcBody
}

function parseRpc(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return null
  const tryParse = (raw: string) => {
    try {
      return unwrapRpc(JSON.parse(raw))
    } catch {
      return null
    }
  }
  const direct = tryParse(trimmed)
  if (direct) return direct
  const chunks: string[] = []
  for (const line of trimmed.split(/\r?\n/)) {
    if (line.startsWith('data:')) chunks.push(line.slice(5).trim())
  }
  if (chunks.length) {
    const joined = tryParse(chunks.join('\n')) || tryParse(chunks[chunks.length - 1])
    if (joined) return joined
  }
  const match = trimmed.match(/\{[\s\S]*"jsonrpc"[\s\S]*\}/)
  return match ? tryParse(match[0]) : null
}

async function mcpRpc(
  url: string,
  method: string,
  opts: {
    id?: number
    params?: Record<string, unknown>
    sessionId?: string | null
    protocol?: string | null
    auth?: string | null
  } = {},
) {
  const payload: Record<string, unknown> = { jsonrpc: '2.0', method }
  if (opts.id != null) payload.id = opts.id
  if (opts.params) payload.params = opts.params
  const headers: Record<string, string> = {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
  }
  if (opts.sessionId) headers['Mcp-Session-Id'] = opts.sessionId
  if (opts.protocol) headers['MCP-Protocol-Version'] = opts.protocol
  if (opts.auth) headers.Authorization = opts.auth.startsWith('Bearer ') ? opts.auth : `Bearer ${opts.auth}`
  const res = await fetchUrl(url, { method: 'POST', headers, body: JSON.stringify(payload) })
  const text = await res.text().catch(() => '')
  return {
    res,
    rpc: parseRpc(text),
    sessionId: res.headers.get('mcp-session-id') || opts.sessionId || null,
  }
}

function applyInitialize(info: McpInfo, rpc: RpcBody | null) {
  const server = (rpc?.result?.serverInfo || {}) as { name?: string; version?: string }
  const caps = (rpc?.result?.capabilities || {}) as Record<string, unknown>
  info.serverName = server.name || null
  info.serverVersion = server.version || null
  info.protocol = typeof rpc?.result?.protocolVersion === 'string' ? rpc.result.protocolVersion : null
  info.instructions = typeof rpc?.result?.instructions === 'string' ? rpc.result.instructions : null
  info.capabilities = Object.keys(caps)
  return caps
}

async function listMcp(url: string, info: McpInfo, sessionId: string | null, protocol: string | null, auth?: string | null) {
  await mcpRpc(url, 'notifications/initialized', { sessionId, protocol, auth }).catch(() => undefined)
  const tryList = async (method: string, id: number) => {
    const call = await mcpRpc(url, method, { id, params: {}, sessionId, protocol, auth })
    if (call.res.status === 401 || call.res.status === 403) info.toolsLocked = true
    return call.rpc?.result || {}
  }
  const caps = new Set(info.capabilities)
  const shouldTools = caps.size === 0 || caps.has('tools')
  const shouldResources = caps.size === 0 || caps.has('resources')
  const shouldPrompts = caps.size === 0 || caps.has('prompts')
  const [tools, resources, prompts] = await Promise.all([
    shouldTools ? tryList('tools/list', 3) : Promise.resolve({}),
    shouldResources ? tryList('resources/list', 4) : Promise.resolve({}),
    shouldPrompts ? tryList('prompts/list', 5) : Promise.resolve({}),
  ])
  info.tools = ((tools.tools || []) as { name?: string; description?: string }[])
    .filter((item) => item.name)
    .map((item) => ({ name: item.name!, description: item.description || '' }))
  info.resources = ((resources.resources || []) as { uri?: string; name?: string }[])
    .filter((item) => item.uri)
    .map((item) => ({ uri: item.uri!, name: item.name || item.uri! }))
  info.prompts = ((prompts.prompts || []) as { name?: string }[])
    .filter((item) => item.name)
    .map((item) => ({ name: item.name! }))
  return info
}

async function readMcp(url: URL): Promise<McpInfo> {
  const opened = await openMcp(url)
  if (opened.needsAuth || opened.step.status === 'fail') return opened.mcp
  return listMcp(url.toString(), opened.mcp, opened.sessionId, opened.mcp.protocol)
}

async function openMcp(
  url: URL,
  auth?: string | null,
): Promise<{
  step: ProbeStep
  needsAuth: boolean
  headers: Headers
  sessionId: string | null
  mcp: McpInfo
}> {
  const mcp = emptyMcp()
  try {
    const init = await mcpRpc(url.toString(), 'initialize', {
      id: 1,
      params: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {}, resources: {}, prompts: {} },
        clientInfo: { name: 'soumtok', version: '1.0' },
      },
      auth,
    })
    const needsAuth = init.res.status === 401 || init.res.status === 403
    applyInitialize(mcp, init.rpc)
    if (needsAuth) mcp.toolsLocked = true
    if (init.res.ok || needsAuth) {
      return {
        step: {
          id: 'connect',
          label: 'Connect to the server',
          status: 'done',
          detail: needsAuth
            ? 'Reached. Sign-in is required before tools open.'
            : mcp.serverName
              ? `Opened ${mcp.serverName}${mcp.serverVersion ? ` ${mcp.serverVersion}` : ''}.`
              : 'MCP initialize succeeded.',
        },
        needsAuth,
        headers: init.res.headers,
        sessionId: init.sessionId,
        mcp,
      }
    }
    return {
      step: {
        id: 'connect',
        label: 'Connect to the server',
        status: 'fail',
        detail: `The server answered ${init.res.status}. Check the URL.`,
      },
      needsAuth: false,
      headers: init.res.headers,
      sessionId: init.sessionId,
      mcp,
    }
  } catch {
    return {
      step: {
        id: 'connect',
        label: 'Connect to the server',
        status: 'fail',
        detail: 'Could not reach that HTTPS address.',
      },
      needsAuth: false,
      headers: new Headers(),
      sessionId: null,
      mcp,
    }
  }
}

async function probeConnect(url: URL): Promise<ProbeStep & { needsAuth: boolean; headers: Headers }> {
  const opened = await openMcp(url)
  return { ...opened.step, needsAuth: opened.needsAuth, headers: opened.headers }
}

async function probeAuth(url: URL, connectHeaders: Headers): Promise<ProbeStep & { authUrl: string | null }> {
  const hint =
    connectHeaders.get('www-authenticate') ||
    connectHeaders.get('link') ||
    ''
  const wellKnown = new URL('/.well-known/oauth-protected-resource', url.origin)
  try {
    const res = await fetchUrl(wellKnown.toString(), { method: 'GET', headers: { Accept: 'application/json' } })
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { authorization_servers?: string[] }
      return {
        id: 'auth',
        label: 'Find the authorization server',
        status: 'done',
        code: String(res.status),
        detail: data.authorization_servers?.[0] || 'OAuth metadata found.',
        authUrl: data.authorization_servers?.[0] || wellKnown.toString(),
      }
    }
  } catch {
    /* fall through */
  }
  if (/oauth|bearer|login/i.test(hint)) {
    return {
      id: 'auth',
      label: 'Find the authorization server',
      status: 'done',
      detail: 'Authorization challenge found on the MCP response.',
      authUrl: url.origin,
    }
  }
  return {
    id: 'auth',
    label: 'Find the authorization server',
    status: 'skip',
    detail: 'No OAuth metadata yet. You can still save the connector.',
    authUrl: null,
  }
}

async function probeOauth(authUrl: string | null): Promise<ProbeStep> {
  if (!authUrl) {
    return {
      id: 'oauth',
      label: 'Verifying OAuth configuration',
      status: 'skip',
      detail: 'No authorization server to verify.',
    }
  }
  try {
    const meta = new URL('/.well-known/oauth-authorization-server', authUrl)
    const res = await fetchUrl(meta.toString(), { method: 'GET', headers: { Accept: 'application/json' } })
    if (res.ok) {
      return {
        id: 'oauth',
        label: 'Verifying OAuth configuration',
        status: 'done',
        code: String(res.status),
        detail: 'Authorization server metadata is valid.',
      }
    }
  } catch {
    /* fall through */
  }
  return {
    id: 'oauth',
    label: 'Verifying OAuth configuration',
    status: 'skip',
    detail: 'Could not read OAuth metadata. Pick how users should sign in.',
  }
}

async function registerOauthClient(registrationEndpoint: string, redirect: string) {
  const res = await fetchUrl(registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_name: 'Soumtok',
      redirect_uris: [redirect],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
    }),
  })
  const data = (await res.json().catch(() => ({}))) as { client_id?: string; client_secret?: string; error?: string }
  if (!res.ok || !data.client_id) throw new Error(data.error || 'Dynamic client registration failed. Paste a token instead.')
  return { client_id: data.client_id, client_secret: data.client_secret || '' }
}

export async function callMcpTool(
  mcpUrl: string,
  name: string,
  args: Record<string, unknown> = {},
  auth?: string | null,
) {
  const url = parseMcpUrl(mcpUrl)
  if (!url) throw new Error('That MCP URL is not allowed')
  const opened = await openMcp(url, auth)
  if (opened.needsAuth && !auth) {
    throw new Error('That MCP server needs sign-in. Say “connect” plus the service name to get a link and a code.')
  }
  const call = await mcpRpc(url.toString(), 'tools/call', {
    id: 9,
    params: { name, arguments: args },
    sessionId: opened.sessionId,
    protocol: opened.mcp.protocol,
    auth,
  })
  if (call.res.status === 401 || call.res.status === 403) {
    throw new Error('That MCP tool is locked until you sign in. Open the connect card, click the link, and enter the code.')
  }
  if (call.rpc?.error?.message) throw new Error(call.rpc.error.message)
  return call.rpc?.result || { ok: true }
}

async function connectorAuth(
  userId: string,
  row: { plugin_id?: string | null; mcp_url?: string; token_ciphertext?: string | null },
) {
  if (row.token_ciphertext) {
    try {
      return decryptSecret(row.token_ciphertext)
    } catch {
      /* stored token unreadable — try GitHub fallback */
    }
  }
  if (row.plugin_id === 'github' || /github/i.test(row.mcp_url || '')) {
    return (await githubAccessToken(userId)) || null
  }
  return null
}

export async function ensureCatalogConnector(userId: string, pluginId: string) {
  if (!pool) return null
  const plugin = catalogPlugin(pluginId)
  const mcpUrl = plugin?.mcps[0]?.url
  if (!plugin || !mcpUrl) return null
  const parsed = parseMcpUrl(mcpUrl)
  if (!parsed) return null
  const existing = await pool.query(
    `SELECT ${COLS} FROM user_connectors WHERE user_id = $1 AND (plugin_id = $2 OR mcp_url = $3) LIMIT 1`,
    [userId, pluginId, parsed.toString()],
  )
  if (existing.rows[0]) {
    return existing.rows[0] as {
      id: string
      name: string
      plugin_id?: string | null
      mcp_url: string
      connected: boolean
    }
  }
  const slot = await requireConnectorSlot(userId, parsed.toString())
  if (!slot.ok) throw new Error(slot.error)
  const id = crypto.randomUUID()
  const slug = crypto.randomUUID().slice(0, 12)
  await pool.query(
    `INSERT INTO user_connectors
      (id, user_id, slug, name, kind, source, plugin_id, mcp_url, auth_mode, oauth_client, connected, updated_at)
     VALUES ($1, $2, $3, $4, 'web', 'catalog', $5, $6, 'always', 'dcr', false, NOW())
     ON CONFLICT (user_id, mcp_url) DO UPDATE SET
       plugin_id = COALESCE(EXCLUDED.plugin_id, user_connectors.plugin_id),
       name = EXCLUDED.name,
       updated_at = NOW()`,
    [id, userId, slug, plugin.name, plugin.id, parsed.toString()],
  )
  const row = await pool.query(`SELECT ${COLS} FROM user_connectors WHERE user_id = $1 AND mcp_url = $2`, [
    userId,
    parsed.toString(),
  ])
  return (row.rows[0] as
    | { id: string; name: string; plugin_id?: string | null; mcp_url: string; connected: boolean }
    | undefined) || null
}

export async function connectorBearer(userId: string, connectorId: string) {
  if (!pool) return null
  const row = await pool.query(
    `SELECT plugin_id, mcp_url, token_ciphertext FROM user_connectors WHERE id = $1 AND user_id = $2`,
    [connectorId, userId],
  )
  if (!row.rows[0]) return null
  return connectorAuth(userId, row.rows[0])
}

export function registerConnectors(app: Hono, requireReadyUser: ReadyFn) {
  app.get('/api/connectors', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const usage = await connectorUsage(session.user.id)
    const rows = await pool.query(
      `SELECT ${COLS}, (token_ciphertext IS NOT NULL AND length(token_ciphertext) > 0) AS has_token
       FROM user_connectors WHERE user_id = $1 ORDER BY created_at DESC`,
      [session.user.id],
    )
    return c.json({
      ...usage,
      catalog: CONNECTOR_CATALOG,
      connectors: rows.rows.map((row) => ({
        ...row,
        hasToken: Boolean(row.has_token),
        has_token: undefined,
      })),
    })
  })

  app.post('/api/connectors/probe', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{ url?: string; phase?: 'connect' | 'auth' | 'oauth' | 'full'; authUrl?: string }>()
    const url = parseMcpUrl(body.url || '')
    if (!url) return c.json({ error: 'Use an HTTPS MCP URL, not a local or private address.' }, 400)
    if (body.phase === 'auth') {
      const connect = await probeConnect(url)
      const auth = await probeAuth(url, connect.headers)
      return c.json({ step: auth, needsAuth: connect.needsAuth })
    }
    if (body.phase === 'oauth') {
      const oauth = await probeOauth(body.authUrl || null)
      return c.json({ step: oauth })
    }
    if (body.phase !== 'full') {
      const connect = await probeConnect(url)
      return c.json({ step: connect, needsAuth: connect.needsAuth })
    }
    const opened = await openMcp(url)
    const auth = await probeAuth(url, opened.headers)
    const [oauth, mcp] = await Promise.all([
      probeOauth(auth.authUrl),
      opened.needsAuth || opened.step.status === 'fail'
        ? Promise.resolve(opened.mcp)
        : listMcp(url.toString(), opened.mcp, opened.sessionId, opened.mcp.protocol),
    ])
    return c.json({
      steps: [opened.step, auth, oauth],
      needsAuth: opened.needsAuth,
      authUrl: auth.authUrl,
      mcp,
    })
  })

  app.post('/api/connectors', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{
      catalogId?: string
      name?: string
      mcpUrl?: string
      authMode?: ConnectorAuthMode
      oauthClient?: ConnectorOAuthClient
      lastCheck?: unknown
    }>()
    const catalog = body.catalogId ? catalogConnector(body.catalogId) : null
    const plugin = catalog ? catalogPlugin(catalog.pluginId) : null
    const name = (body.name || catalog?.name || '').trim()
    const mcpUrl = parseMcpUrl(body.mcpUrl || catalog?.mcpUrl || '')
    if (!name) return c.json({ error: 'Name the connector' }, 400)
    if (!mcpUrl) return c.json({ error: 'Use an HTTPS MCP URL.' }, 400)
    const slot = await requireConnectorSlot(session.user.id, mcpUrl.toString())
    if (!slot.ok) return c.json({ error: slot.error }, 402)
    const id = crypto.randomUUID()
    const slug = crypto.randomUUID().slice(0, 12)
    const authMode = body.authMode || 'always'
    const oauthClient = body.oauthClient || 'dcr'
    await pool.query(
      `INSERT INTO user_connectors
        (id, user_id, slug, name, kind, source, plugin_id, mcp_url, auth_mode, oauth_client, connected, last_check, updated_at)
       VALUES ($1, $2, $3, $4, 'web', $5, $6, $7, $8, $9, false, $10::jsonb, NOW())
       ON CONFLICT (user_id, mcp_url) DO UPDATE SET
         name = EXCLUDED.name,
         auth_mode = EXCLUDED.auth_mode,
         oauth_client = EXCLUDED.oauth_client,
         plugin_id = COALESCE(EXCLUDED.plugin_id, user_connectors.plugin_id),
         last_check = COALESCE(EXCLUDED.last_check, user_connectors.last_check),
         updated_at = NOW()`,
      [
        id,
        session.user.id,
        slug,
        name,
        catalog ? 'catalog' : 'custom',
        catalog?.pluginId || null,
        mcpUrl.toString(),
        authMode,
        oauthClient,
        body.lastCheck ? JSON.stringify(body.lastCheck) : null,
      ],
    )
    const row = await pool.query(`SELECT ${COLS} FROM user_connectors WHERE user_id = $1 AND mcp_url = $2`, [
      session.user.id,
      mcpUrl.toString(),
    ])
    return c.json({
      connector: row.rows[0],
      plugin: plugin ? { id: plugin.id, name: plugin.name } : null,
      mcpUrl: mcpUrl.toString(),
      loginUrl: connectorLoginUrl(catalog?.pluginId || '') || plugin?.signupUrl || null,
      needsLogin: true,
    })
  })

  app.post('/api/connectors/:id/connect', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const existing = await pool.query(
      `SELECT ${COLS}, token_ciphertext FROM user_connectors WHERE id = $1 AND user_id = $2`,
      [c.req.param('id'), session.user.id],
    )
    const row = existing.rows[0]
    if (!row) return c.json({ error: 'Connector not found' }, 404)
    const url = parseMcpUrl(row.mcp_url)
    if (!url) return c.json({ error: 'Saved URL is not usable.' }, 400)
    const auth = await connectorAuth(session.user.id, row)
    const opened = await openMcp(url, auth)
    const mcp =
      opened.needsAuth || opened.step.status === 'fail'
        ? opened.mcp
        : await listMcp(url.toString(), opened.mcp, opened.sessionId, opened.mcp.protocol, auth)
    const needsLogin = opened.needsAuth && !auth
    const connected = opened.step.status === 'done' && !opened.needsAuth
    const check = { ...opened.step, mcp, needsAuth: opened.needsAuth }
    await pool.query(
      `UPDATE user_connectors
       SET connected = $3, last_check = $4::jsonb, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [row.id, session.user.id, connected, JSON.stringify(check)],
    )
    const plugin = row.plugin_id ? catalogPlugin(row.plugin_id) : null
    const loginUrl = connectorLoginUrl(row.plugin_id || '') || plugin?.signupUrl || url.origin
    return c.json({
      connected,
      needsLogin,
      step: opened.step,
      mcp,
      mcpUrl: row.mcp_url,
      loginUrl,
      signupUrl: loginUrl,
      connector: { ...row, connected, last_check: check },
    })
  })

  app.delete('/api/connectors/:id', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    await pool.query(`DELETE FROM user_connectors WHERE id = $1 AND user_id = $2`, [c.req.param('id'), session.user.id])
    return c.json({ ok: true })
  })

  app.put('/api/connectors/:id/token', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{ token?: string }>()
    const token = body.token?.trim() || ''
    if (token.length < 12) return c.json({ error: 'That token looks too short' }, 400)
    const existing = await pool.query(`SELECT id FROM user_connectors WHERE id = $1 AND user_id = $2`, [
      c.req.param('id'),
      session.user.id,
    ])
    if (!existing.rows[0]) return c.json({ error: 'Connector not found' }, 404)
    await pool.query(
      `UPDATE user_connectors SET token_ciphertext = $3, connected = true, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
      [c.req.param('id'), session.user.id, encryptSecret(token)],
    )
    return c.json({ ok: true, hasToken: true })
  })

  app.delete('/api/connectors/:id/token', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    await pool.query(`UPDATE user_connectors SET token_ciphertext = NULL, updated_at = NOW() WHERE id = $1 AND user_id = $2`, [
      c.req.param('id'),
      session.user.id,
    ])
    return c.json({ ok: true, hasToken: false })
  })

  app.get('/api/connectors/:id/oauth/start', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const row = await pool.query(`SELECT id, mcp_url, oauth_client_id FROM user_connectors WHERE id = $1 AND user_id = $2`, [
      c.req.param('id'),
      session.user.id,
    ])
    const connector = row.rows[0] as { id: string; mcp_url: string; oauth_client_id?: string | null } | undefined
    if (!connector) return c.json({ error: 'Connector not found' }, 404)
    try {
      if (!parseMcpUrl(connector.mcp_url)) return c.json({ error: 'Saved URL is not usable.' }, 400)
      const discovered = await discoverMcpOauth(connector.mcp_url)
      if (discovered.noAuth || !discovered.authorization_endpoint || !discovered.token_endpoint) {
        if (c.req.query('json')) return c.json({ url: null, actionUrl: null, noAuth: true })
        return c.redirect(`${env.betterAuthUrl.replace(/\/$/, '')}/dashboard/connectors?oauth=ok`, 302)
      }
      const redirect = oauthRedirect(env.betterAuthUrl)
      let clientId = connector.oauth_client_id || ''
      let clientSecret = ''
      if (!clientId) {
        if (!discovered.registration_endpoint) {
          return c.json({ error: 'This server does not offer OAuth registration. Paste an access token instead.' }, 400)
        }
        const registered = await registerOauthClient(discovered.registration_endpoint, redirect)
        clientId = registered.client_id
        clientSecret = registered.client_secret || ''
        await pool.query(`UPDATE user_connectors SET oauth_client_id = $3, updated_at = NOW() WHERE id = $1 AND user_id = $2`, [
          connector.id,
          session.user.id,
          clientId,
        ])
      }
      const pkce = pkceChallenge()
      await pool.query(`DELETE FROM connector_oauth_pending WHERE user_id = $1 AND connector_id = $2`, [
        session.user.id,
        connector.id,
      ])
      await pool.query(
        `INSERT INTO connector_oauth_pending
         (state, user_id, connector_id, verifier, token_endpoint, client_id, client_secret_cipher, resource, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
        [
          pkce.state,
          session.user.id,
          connector.id,
          pkce.verifier,
          discovered.token_endpoint,
          clientId,
          clientSecret ? encryptSecret(clientSecret) : null,
          discovered.resource,
        ],
      )
      const location = authorizeUrl(discovered.authorization_endpoint, {
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirect,
        state: pkce.state,
        code_challenge: pkce.challenge,
        code_challenge_method: 'S256',
        resource: discovered.resource || connector.mcp_url,
      })
      if (c.req.query('json')) return c.json({ url: location, actionUrl: location, authorizationUrl: location })
      return c.redirect(location, 302)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Could not start OAuth' }, 400)
    }
  })

  app.get('/api/connectors/oauth/callback', async (c) => {
    const dash = `${env.betterAuthUrl.replace(/\/$/, '')}/dashboard/connectors`
    const failed = (message: string) => c.redirect(`${dash}?oauth=error&detail=${encodeURIComponent(message.slice(0, 180))}`, 302)
    const { session } = await requireReadyUser(c)
    if (!pool) return failed('Database is not connected')
    const code = c.req.query('code') || ''
    const state = c.req.query('state') || ''
    if (!code || !state) return failed(c.req.query('error_description') || c.req.query('error') || 'OAuth was cancelled')
    const pending = await pool.query(`SELECT * FROM connector_oauth_pending WHERE state = $1`, [state])
    const row = pending.rows[0] as
      | {
          user_id: string
          connector_id: string
          verifier: string
          token_endpoint: string
          client_id: string
          client_secret_cipher?: string | null
          resource?: string | null
        }
      | undefined
    if (!row) return failed('That sign-in expired. Start again.')
    if (session && session.user.id !== row.user_id) return failed('Signed in as a different account')
    try {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: oauthRedirect(env.betterAuthUrl),
        code_verifier: row.verifier,
        client_id: row.client_id,
      })
      if (row.resource) body.set('resource', row.resource)
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      }
      if (row.client_secret_cipher) {
        try {
          const secret = decryptSecret(row.client_secret_cipher)
          headers.Authorization = `Basic ${Buffer.from(`${row.client_id}:${secret}`).toString('base64')}`
        } catch {
          /* public PKCE client */
        }
      }
      const tokenRes = await fetchUrl(row.token_endpoint, { method: 'POST', headers, body })
      const token = (await tokenRes.json().catch(() => ({}))) as {
        access_token?: string
        refresh_token?: string
        expires_in?: number
        error?: string
        error_description?: string
      }
      if (!tokenRes.ok || !token.access_token) {
        return failed(token.error_description || token.error || 'Token exchange failed')
      }
      const expires = token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : null
      await pool.query(
        `UPDATE user_connectors
         SET token_ciphertext = $3,
             token_refresh_ciphertext = $4,
             token_expires_at = $5,
             connected = true,
             updated_at = NOW()
         WHERE id = $1 AND user_id = $2`,
        [
          row.connector_id,
          row.user_id,
          encryptSecret(token.access_token),
          token.refresh_token ? encryptSecret(token.refresh_token) : null,
          expires,
        ],
      )
      await pool.query(`DELETE FROM connector_oauth_pending WHERE state = $1`, [state])
      const device = await pool.query(
        `UPDATE connector_device_codes
         SET status = 'authorized'
         WHERE connector_id = $1 AND user_id = $2 AND status = 'pending' AND expires_at > NOW()
         RETURNING code`,
        [row.connector_id, row.user_id],
      )
      const slug = await pool.query(`SELECT slug FROM user_connectors WHERE id = $1`, [row.connector_id])
      const origin = env.betterAuthUrl.replace(/\/$/, '')
      if (device.rows[0]?.code) {
        return c.redirect(`${origin}/connect/${device.rows[0].code}?oauth=ok`, 302)
      }
      const path = slug.rows[0]?.slug ? `${dash}/${slug.rows[0].slug}` : dash
      return c.redirect(`${path}?oauth=ok`, 302)
    } catch (error) {
      return failed(error instanceof Error ? error.message : 'OAuth failed')
    }
  })
}
