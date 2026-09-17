import { Router } from 'express'

/** @type {{ id: string, name: string }[]} */
let items = [
  { id: '1', name: 'Sample item' },
  { id: '2', name: 'Another item' },
]

export const itemsRouter = Router()

itemsRouter.get('/', (_req, res) => {
  res.json({ items })
})

itemsRouter.post('/', (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'name required' })
  const item = { id: String(Date.now()), name }
  items = [...items, item]
  res.status(201).json(item)
})
