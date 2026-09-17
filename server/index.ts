import { readFile } from 'node:fs/promises'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { SITE_URL, injectSeo, seoForPath } from '../shared/seo.ts'
import { app, ensureMigrated } from './app.ts'
import { env } from './env.ts'
import { registerInstallStatic } from './install-static.ts'

await ensureMigrated().catch((error) => {
  console.warn('Database migrate skipped:', error instanceof Error ? error.message : error)
})

const indexHtml = await readFile('./dist/index.html', 'utf8')

registerInstallStatic(app)
app.use('/install/*', serveStatic({ root: './dist' }))
app.use('/*', serveStatic({ root: './dist' }))
app.get('/*', (c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Not found', path: c.req.path }, 404)
  }
  if (c.req.path.startsWith('/install/')) {
    return c.text('Install script not found.', 404)
  }
  return c.html(injectSeo(indexHtml, seoForPath(c.req.path), SITE_URL))
})

serve({
  fetch: app.fetch,
  port: env.port,
})

console.log(`Soumtok running on http://localhost:${env.port}`)
