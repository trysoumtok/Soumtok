/** Block private, link-local, and metadata hosts for outbound https fetches. */
export function isBlockedFetchHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true
  if (host === 'metadata.google.internal' || host === 'metadata.google') return true
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split('.').map(Number)
    if (a === 10) return true
    if (a === 127) return true
    if (a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
  }
  if (/^127\.|^10\.|^192\.168\.|^169\.254\.|^0\.|^::1$/i.test(host)) return true
  return false
}

export function publicHttpsUrl(raw: string) {
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'https:') return null
    if (isBlockedFetchHost(url.hostname)) return null
    if (url.username || url.password) return null
    return url
  } catch {
    return null
  }
}

const MAX_REDIRECTS = 3

export async function safeHttpsFetch(url: URL, init: RequestInit = {}, depth = 0): Promise<Response> {
  if (depth > MAX_REDIRECTS) throw new Error('Too many redirects')
  const res = await fetch(url, { ...init, redirect: 'manual' })
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location')
    if (!location) throw new Error('Redirect blocked')
    const next = publicHttpsUrl(new URL(location, url).toString())
    if (!next) throw new Error('Redirect to blocked host')
    return safeHttpsFetch(next, init, depth + 1)
  }
  return res
}
