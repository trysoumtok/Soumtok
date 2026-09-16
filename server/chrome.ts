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
}

const sites = new Map<string, Site>()
const tokenByUser = new Map<string, string>()

function siteFile(files: Record<string, string>, html: string, raw: string) {
  return resolveSiteFile(files, html, raw)
}

function mimeFor(name: string) {
  if (/\.css$/i.test(name)) return 'text/css; charset=utf-8'
  if (/\.js$/i.test(name)) return 'text/javascript; charset=utf-8'
  if (/\.svg$/i.test(name)) return 'image/svg+xml'
  if (/\.json$/i.test(name)) return 'application/json; charset=utf-8'
  return 'text/html; charset=utf-8'
}

function serveSite(
  c: {
    req: { param: (name: string) => string }
    text: (body: string, status?: number) => Response
    body: (data: string, status?: number, headers?: Record<string, string>) => Response
  },
  rest: string,
) {
  const token = c.req.param('token')
  const site = sites.get(token)
  if (!site) return c.text('Not found', 404)
  const file = siteFile(site.files, site.html, rest || 'index.html')
  if (!file) return c.text('Not found', 404)
  return c.body(file, 200, {
    'Content-Type': mimeFor(rest || 'index.html'),
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    'X-Frame-Options': 'SAMEORIGIN',
  })
}

setInterval(() => {
  const cutoff = Date.now() - 30 * 60_000
  for (const [token, site] of sites) {
    if (site.last > cutoff) continue
    sites.delete(token)
    if (tokenByUser.get(site.userId) === token) tokenByUser.delete(site.userId)
  }
}, 60_000)

export function registerChrome(app: Hono, requireReadyUser: ReadyFn) {
  app.post('/api/studio/site', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{ files?: Record<string, string>; html?: string; seq?: number }>().catch(() => ({}))
    const html = body.html || ''
    const files = body.files || {}
    let token = tokenByUser.get(session.user.id)
    if (!token) {
      token = crypto.randomUUID()
      tokenByUser.set(session.user.id, token)
    }
    const prev = sites.get(token)
    if (prev && !acceptSiteSeq(prev.seq, body.seq)) {
      return c.json({ token, path: `/api/studio/site/${token}/` })
    }
    const seq = typeof body.seq === 'number' && Number.isFinite(body.seq) ? body.seq : (prev?.seq || 0)
    sites.set(token, { userId: session.user.id, files, html, seq, last: Date.now() })
    return c.json({ token, path: `/api/studio/site/${token}/` })
  })

  app.get('/api/studio/site/:token', (c) => serveSite(c, ''))
  app.get('/api/studio/site/:token/', (c) => serveSite(c, ''))
  app.get('/api/studio/site/:token/*', (c) => {
    const token = c.req.param('token')
    const rest = c.req.path.replace(`/api/studio/site/${token}/`, '').replace(`/api/studio/site/${token}`, '')
    return serveSite(c, rest)
  })
}
