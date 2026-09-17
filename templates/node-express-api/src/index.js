import express from 'express'
import { itemsRouter } from './routes/items.js'

const app = express()
const port = Number(process.env.PORT) || 3000

app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: '{{title}}' })
})

app.get('/', (_req, res) => {
  res.json({ name: '{{title}}', routes: ['/health', '/api/items'] })
})

app.use('/api/items', itemsRouter)

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(port, () => {
  console.log(`http://localhost:${port}`)
})
