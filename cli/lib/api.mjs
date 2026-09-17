import { resolveApiBase, resolveAuth } from './config.mjs'

function userFromMePayload(data) {
  if (!data?.id) return null
  return { id: data.id, email: data.email, name: data.name, ready: Boolean(data.ready) }
}

/** Match shared/session.ts — send every name Better Auth may read (esp. __Secure- on HTTPS). */
function sessionCookieNames(base) {
  const secure = String(base || '').startsWith('https://')
  return secure
    ? [
        '__Secure-soumtok.session_token',
        'soumtok.session_token',
        '__Secure-better-auth.session_token',
        'better-auth.session_token',
      ]
    : ['soumtok.session_token', 'better-auth.session_token']
}

export function sessionAuthHeaders(base, token) {
  const names = sessionCookieNames(base)
  const cookie = names.map((name) => `${name}=${token}`).join('; ')
  return { Cookie: cookie, 'X-Soumtok-Session': token }
}

function authHeaders(base) {
  const auth = resolveAuth()
  if (!auth) return {}
  if (auth.kind === 'apiKey') return { Authorization: `Bearer ${auth.value}` }
  return sessionAuthHeaders(base, auth.value)
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

export function createApiClient(baseOverride) {
  const base = resolveApiBase(baseOverride)

  async function request(method, pathname, body, timeoutMs = 15_000) {
    const agentRound = /\/agent\/round/.test(pathname)
    const waitMs = agentRound ? Math.max(timeoutMs, 510_000) : timeoutMs
    const url = `${base}${pathname}`
    const res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SoumtokCLI/0.1',
        'X-Soumtok-Client': 'cli',
        ...(body != null ? { 'Content-Type': 'application/json' } : {}),
        ...authHeaders(base),
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(waitMs),
    })
    const text = await res.text()
    return { status: res.status, data: parseJson(text) }
  }

  async function getBuffer(method, pathname, timeoutMs = 20_000) {
    const url = `${base}${pathname}`
    const res = await fetch(url, {
      method,
      headers: {
        ...authHeaders(base),
        Accept: '*/*',
        'User-Agent': 'SoumtokCLI/0.1',
        'X-Soumtok-Client': 'cli',
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf
  }

  return {
    base,
    api: request,
    getBuffer,
    async session() {
      const auth = resolveAuth()
      if (auth?.kind === 'apiKey') {
        const res = await request('GET', '/api/v1/me')
        if (res.status === 200) return userFromMePayload(res.data)
        if (typeof res.data?.raw === 'string' && res.data.raw.trimStart().startsWith('<!')) {
          throw new Error('API returned HTML instead of JSON — check SOUMTOK_API / network')
        }
        return null
      }
      const res = await request('GET', '/api/auth/get-session')
      if (res.status === 200 && res.data?.user) return res.data.user
      if (res.data?.session?.user) return res.data.session.user
      if (typeof res.data?.raw === 'string' && res.data.raw.trimStart().startsWith('<!')) {
        throw new Error('API returned HTML instead of JSON — check SOUMTOK_API / network')
      }
      return null
    },
    async models() {
      const res = await request('GET', '/api/desktop/models')
      if (res.status !== 200) throw new Error(res.data?.error || `HTTP ${res.status}`)
      return res.data?.models || []
    },
    async health() {
      const res = await request('GET', '/api/health')
      return res.data
    },
  }
}
