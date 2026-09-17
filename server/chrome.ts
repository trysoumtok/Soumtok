import type { Hono } from 'hono'
import { acceptSiteSeq, resolveSiteFile } from '../shared/preview.ts'

type ReadyFn = (c: { req: { raw: Request } }) => Promise<{
  session: { user: { id: string } } | null
  ready: boolean
}>

type Site = {
  userId: string
  files: Record<string, string>
  html: string
  seq?: number
  last: number
  expiresAt?: number
}

function siteExpiresAt(site: Site) {
  return site.expiresAt ?? site.last + SITE_TTL_MS
}

export const SITE_TTL_MS = 30 * 60_000

const sites = new Map<string, Site>()
const tokenByUser = new Map<string, string>()
const slugToToken = new Map<string, { token: string; expiresAt: number }>()

export function registerSiteSlug(slug: string, token: string, expiresAt: number) {
  const key = String(slug || '')
    .trim()
    .toLowerCase()
  if (!key) return
  slugToToken.set(key, { token, expiresAt })
}

export function tokenForSlug(slug: string) {
  const key = String(slug || '')
    .trim()
    .toLowerCase()
  if (!key) return null
  const entry = slugToToken.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    slugToToken.delete(key)
    return null
  }
  return entry.token
}

export function unregisterSiteSlug(slug: string) {
  const key = String(slug || '')
    .trim()
    .toLowerCase()
  if (key) slugToToken.delete(key)
}

export function removeSite(token: string) {
  if (!token) return
  sites.delete(token)
  for (const [slug, entry] of slugToToken) {
    if (entry.token === token) slugToToken.delete(slug)
  }
}

/** Restore an in-memory site from a saved deploy record (server restart). */
export function restorePublishedSite(input: {
  userId: string
  token: string
  files: Record<string, string>
  html: string
  expiresAt: number
}) {
  if (input.expiresAt <= Date.now()) return
  sites.set(input.token, {
    userId: input.userId,
    files: input.files || {},
    html: input.html || '',
    seq: 0,
    last: Date.now(),
    expiresAt: input.expiresAt,
  })
}

export type PublishSiteResult = {
  token: string
  path: string
  expiresAt: number
  ttlMinutes: number
}

/** Publish ephemeral preview HTML (+ optional project files) to the in-memory site host. */
export function publishSite(input: {
  userId: string
  files?: Record<string, string>
  html?: string
  seq?: number
  /** Mint a new token every time (Test Hub share links). Studio reuses one token per user. */
  fresh?: boolean
  /** Custom lifetime for Test Hub share links (capped by caller). */
  ttlMs?: number
}): PublishSiteResult | { token: string; path: string; skipped: true } {
  const files = input.files || {}
  const html = input.html || ''
  let token: string
  if (input.fresh) {
    token = crypto.randomUUID()
  } else {
    token = tokenByUser.get(input.userId) || crypto.randomUUID()
    tokenByUser.set(input.userId, token)
  }

  const prev = sites.get(token)
  if (!input.fresh && prev && typeof input.seq === 'number' && !acceptSiteSeq(prev.seq, input.seq)) {
    return { token, path: `/api/studio/site/${token}/`, skipped: true }
  }

  const seq = typeof input.seq === 'number' && Number.isFinite(input.seq) ? input.seq : prev?.seq || 0
  const last = Date.now()
  const ttlMs =
    input.fresh && typeof input.ttlMs === 'number' && Number.isFinite(input.ttlMs)
      ? input.ttlMs
      : SITE_TTL_MS
  const expiresAt = last + ttlMs
  sites.set(token, { userId: input.userId, files, html, seq, last, expiresAt })
  return {
    token,
    path: `/api/studio/site/${token}/`,
    expiresAt,
    ttlMinutes: Math.round(ttlMs / 60_000),
  }
}

function siteFile(files: Record<string, string>, html: string, raw: string) {
  return resolveSiteFile(files, html, raw)
}

function mimeFor(name: string) {
  if (/\.css$/i.test(name)) return 'text/css; charset=utf-8'
  if (/\.js$/i.test(name)) return 'text/javascript; charset=utf-8'
  if (/\.svg$/i.test(name)) return 'image/svg+xml'
  if (/\.png$/i.test(name)) return 'image/png'
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg'
  if (/\.webp$/i.test(name)) return 'image/webp'
  if (/\.gif$/i.test(name)) return 'image/gif'
  if (/\.ico$/i.test(name)) return 'image/x-icon'
  if (/\.json$/i.test(name)) return 'application/json; charset=utf-8'
  return 'text/html; charset=utf-8'
}

function decodeSiteBody(raw: string, fallbackMime: string) {
  const text = String(raw || '')
  const match = text.trim().match(/^data:([^;]+);base64,([\s\S]+)$/)
  if (match) {
    return { bytes: Buffer.from(match[2], 'base64'), mime: match[1] || fallbackMime }
  }
  return { bytes: text, mime: fallbackMime }
}

type SiteResponder = {
  text: (body: string, status?: number) => Response
  body: (data: string, status?: number, headers?: Record<string, string>) => Response
}

function serveSiteToken(c: SiteResponder, token: string, rest: string) {
  const site = sites.get(token)
  if (!site || siteExpiresAt(site) <= Date.now()) {
    if (site) sites.delete(token)
    return c.text('Not found', 404)
  }
  const path = (rest || 'index.html').replace(/^\//, '')
  const headers = {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    'X-Frame-Options': 'SAMEORIGIN',
  }
  if (path === 'index.html' || path === '') {
    const page = siteFile(site.files, site.html, 'index.html') || site.html?.trim()
    if (page) {
      return c.body(page, 200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' })
    }
  }
  const file = siteFile(site.files, site.html, path)
  if (!file) return c.text('Not found', 404)
  const decoded = decodeSiteBody(file, mimeFor(path))
  if (typeof decoded.bytes === 'string') {
    return c.body(decoded.bytes, 200, { ...headers, 'Content-Type': decoded.mime })
  }
  return c.body(new Uint8Array(decoded.bytes), 200, { ...headers, 'Content-Type': decoded.mime })
}

function serveSite(
  c: SiteResponder & { req: { param: (name: string) => string } },
  rest: string,
) {
  return serveSiteToken(c, c.req.param('token'), rest)
}

setInterval(() => {
  const now = Date.now()
  for (const [token, site] of sites) {
    if (siteExpiresAt(site) > now) continue
    sites.delete(token)
    if (tokenByUser.get(site.userId) === token) tokenByUser.delete(site.userId)
  }
  for (const [slug, entry] of slugToToken) {
    if (entry.expiresAt > now) continue
    slugToToken.delete(slug)
  }
}, 60_000)

export function registerChrome(app: Hono, requireReadyUser: ReadyFn) {
  app.post('/api/studio/site', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{ files?: Record<string, string>; html?: string; seq?: number }>().catch(() => ({}))
    const published = publishSite({
      userId: session.user.id,
      files: body.files || {},
      html: body.html || '',
      seq: body.seq,
    })
    if ('skipped' in published) {
      return c.json({ token: published.token, path: published.path })
    }
    return c.json({ token: published.token, path: published.path })
  })

  app.get('/api/studio/site/:token', (c) => serveSite(c, ''))
  app.get('/api/studio/site/:token/', (c) => serveSite(c, ''))
  app.get('/api/studio/site/:token/*', (c) => {
    const token = c.req.param('token')
    const rest = c.req.path.replace(`/api/studio/site/${token}/`, '').replace(`/api/studio/site/${token}`, '')
    return serveSite(c, rest)
  })

  app.get('/t/:slug', (c) => {
    const token = tokenForSlug(c.req.param('slug'))
    if (!token) return c.text('Not found', 404)
    return serveSiteToken(c, token, '')
  })
  app.get('/t/:slug/', (c) => {
    const token = tokenForSlug(c.req.param('slug'))
    if (!token) return c.text('Not found', 404)
    return serveSiteToken(c, token, '')
  })
  app.get('/t/:slug/*', (c) => {
    const slug = c.req.param('slug')
    const token = tokenForSlug(slug)
    if (!token) return c.text('Not found', 404)
    const rest = c.req.path.replace(`/t/${slug}/`, '').replace(`/t/${slug}`, '')
    return serveSiteToken(c, token, rest)
  })
}
