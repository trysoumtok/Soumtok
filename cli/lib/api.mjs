import { resolveApiBase, resolveAuth } from './config.mjs'

function authHeaders() {
  const auth = resolveAuth()
  if (!auth) return {}
  if (auth.kind === 'apiKey') return { Authorization: `Bearer ${auth.value}` }
  return { Cookie: `soumtok.session_token=${auth.value}` }
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
        ...authHeaders(),
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
        ...authHeaders(),
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
      const res = await request('GET', '/api/auth/get-session')
      return res.data?.user || res.data?.session?.user || null
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
