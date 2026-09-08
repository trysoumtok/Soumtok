import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { app, ensureMigrated } from './app.ts'
import { env } from './env.ts'

await ensureMigrated().catch((error) => {
  console.warn('Database migrate skipped:', error instanceof Error ? error.message : error)
})

app.use('/*', serveStatic({ root: './dist' }))
app.get('/*', serveStatic({ root: './dist', path: 'index.html' }))

serve({
  fetch: app.fetch,
  port: env.port,
})

console.log(`Soumtok running on http://localhost:${env.port}`)
