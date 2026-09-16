/** MCP OAuth discovery (RFC 9728 + RFC 8414 + WWW-Authenticate resource_metadata). */

export type McpOauthDiscovery = {
  noAuth?: boolean
  authorization_endpoint?: string
  token_endpoint?: string
  registration_endpoint?: string
  resource?: string
}

export type OauthServerMeta = {
  issuer?: string
  authorization_endpoint?: string
  token_endpoint?: string
  registration_endpoint?: string
}

type FetchLike = typeof fetch

export function parseWwwAuthenticate(header: string | null | undefined) {
  const raw = String(header || '')
  const quoted = raw.match(/resource_metadata\s*=\s*"([^"]+)"/i)?.[1]
  const bare = raw.match(/resource_metadata\s*=\s*([^,\s]+)/i)?.[1]
  return { resourceMetadata: String(quoted || bare || '').replace(/\/$/, '') }
}

export function protectedResourceMetadataUrls(mcpUrl: URL, headerHint?: string | null) {
  const out: string[] = []
  const hinted = parseWwwAuthenticate(headerHint).resourceMetadata
  if (hinted) out.push(hinted)
  const origin = mcpUrl.origin
  const path = mcpUrl.pathname.replace(/\/+$/, '')
  if (path && path !== '/') out.push(`${origin}/.well-known/oauth-protected-resource${path}`)
  out.push(`${origin}/.well-known/oauth-protected-resource`)
  return [...new Set(out)]
}

export function authorizationServerMetadataUrls(issuer: string) {
  const u = new URL(issuer)
  const path = u.pathname.replace(/\/+$/, '')
  const base = issuer.replace(/\/+$/, '')
  const urls: string[] = []
  if (path && path !== '/') {
    urls.push(`${u.origin}/.well-known/oauth-authorization-server${path}`)
    urls.push(`${u.origin}/.well-known/openid-configuration${path}`)
    urls.push(`${base}/.well-known/oauth-authorization-server`)
    urls.push(`${base}/.well-known/openid-configuration`)
  }
  urls.push(`${u.origin}/.well-known/oauth-authorization-server`)
  urls.push(`${u.origin}/.well-known/openid-configuration`)
  return [...new Set(urls)]
}

async function fetchJson(fetchFn: FetchLike, url: string, init: RequestInit = {}, timeoutMs = 12_000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchFn(url, { ...init, redirect: 'follow', signal: ctrl.signal })
    const text = await res.text().catch(() => '')
    let json: Record<string, unknown> = {}
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    } catch {
      json = {}
    }
    return { res, json, text }
  } finally {
    clearTimeout(timer)
  }
}

export async function discoverMcpOauth(mcpUrl: string, fetchFn: FetchLike = fetch): Promise<McpOauthDiscovery> {
  const url = new URL(mcpUrl)
  const resource = url.toString()
  const init = await fetchJson(
    fetchFn,
    resource,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2025-06-18',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          clientInfo: { name: 'soumtok', version: '1.0' },
        },
      }),
    },
  )
  const needsAuth = init.res.status === 401 || init.res.status === 403
  const www = init.res.headers.get('www-authenticate') || init.res.headers.get('WWW-Authenticate')
  let issuer = url.origin
  let foundIssuer = false
  for (const metaUrl of protectedResourceMetadataUrls(url, www)) {
    try {
      const meta = await fetchJson(fetchFn, metaUrl, { method: 'GET', headers: { Accept: 'application/json' } })
      if (!meta.res.ok) continue
      const servers = meta.json.authorization_servers
      if (Array.isArray(servers) && typeof servers[0] === 'string' && servers[0]) {
        issuer = servers[0]
        foundIssuer = true
        break
      }
    } catch {
      /* try next */
    }
  }

  for (const metaUrl of authorizationServerMetadataUrls(issuer)) {
    try {
      const as = await fetchJson(fetchFn, metaUrl, { method: 'GET', headers: { Accept: 'application/json' } })
      if (!as.res.ok) continue
      const authorization_endpoint = String(as.json.authorization_endpoint || '')
      const token_endpoint = String(as.json.token_endpoint || '')
      if (!authorization_endpoint || !token_endpoint) continue
      return {
        authorization_endpoint,
        token_endpoint,
        registration_endpoint: String(as.json.registration_endpoint || '') || undefined,
        resource,
      }
    } catch {
      /* try next */
    }
  }
  if (init.res.ok && !needsAuth && !foundIssuer) return { noAuth: true, resource }
  throw new Error('No OAuth metadata on that server. Paste a token instead.')
}
