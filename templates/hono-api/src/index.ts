import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()
const port = Number(process.env.PORT) || 3000

app.get('/health', (c) => c.json({ ok: true, service: '{{title}}' }))

app.get('/', (c) => c.json({ name: '{{title}}', routes: ['/health'] }))

app.notFound((c) => c.json({ error: 'Not found' }, 404))

console.log(`http://localhost:${port}`)
serve({ fetch: app.fetch, port })
