import type { Hono } from 'hono'
import { pool } from './db.ts'
import { hasBunny } from './env.ts'
import { deleteFromBunny, downloadFromBunny, safeFileName, uploadToBunny } from './storage.ts'

type ReadyFn = (c: { req: { raw: Request } }) => Promise<{
  session: { user: { id: string } } | null
  ready: boolean
}>

const COLS = `id, name, file_name, size, content_type, excerpt, created_at`

const ALLOWED = /\.(pdf|md|txt|json|csv|html?|zip|png|jpe?g|webp|gif|docx|exe|msi|dmg|skill)$/i
const TEXT = /\.(md|txt|json|csv|html?|skill)$/i

function excerptFrom(name: string, bytes: Uint8Array) {
  if (!TEXT.test(name)) return null
  return new TextDecoder().decode(bytes).slice(0, 20000)
}

export function registerSkills(app: Hono, requireReadyUser: ReadyFn) {
  app.get('/api/skills', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const rows = await pool.query(`SELECT ${COLS} FROM user_skills WHERE user_id = $1 ORDER BY created_at DESC`, [
      session.user.id,
    ])
    return c.json({ skills: rows.rows })
  })

  app.post('/api/skills', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const form = await c.req.formData()
    const uploaded = form.get('file')
    if (!(uploaded instanceof File)) return c.json({ error: 'Choose a file' }, 400)
    if (uploaded.size > 25 * 1024 * 1024) return c.json({ error: 'File must be under 25 MB' }, 400)
    const fileName = safeFileName(uploaded.name)
    if (!ALLOWED.test(fileName)) {
      return c.json({ error: 'Use a PDF, text, image, zip, or installer file.' }, 400)
    }
    const bytes = new Uint8Array(await uploaded.arrayBuffer())
    const excerpt = excerptFrom(fileName, bytes)
    const id = crypto.randomUUID()
    const name = (String(form.get('name') || '').trim() || fileName.replace(/\.[^.]+$/, '')).slice(0, 80)
    const contentType = uploaded.type || 'application/octet-stream'
    let path: string | null = null
    if (hasBunny()) {
      path = `users/${session.user.id}/skills/${id}/${fileName}`
      await uploadToBunny(path, bytes, contentType)
    } else if (!excerpt) {
      return c.json({ error: 'Could not store that file right now.' }, 503)
    }
    await pool.query(
      `INSERT INTO user_skills (id, user_id, name, file_name, path, size, content_type, excerpt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, session.user.id, name, fileName, path, uploaded.size, contentType, excerpt],
    )
    const row = await pool.query(`SELECT ${COLS} FROM user_skills WHERE id = $1 AND user_id = $2`, [id, session.user.id])
    return c.json({ skill: row.rows[0] }, 201)
  })

  app.get('/api/skills/:id', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const row = await pool.query(`SELECT ${COLS} FROM user_skills WHERE id = $1 AND user_id = $2`, [
      c.req.param('id'),
      session.user.id,
    ])
    if (!row.rows[0]) return c.json({ error: 'Skill not found' }, 404)
    return c.json({ skill: row.rows[0] })
  })

  app.get('/api/skills/:id/file', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const row = await pool.query(`SELECT name, file_name, path, content_type FROM user_skills WHERE id = $1 AND user_id = $2`, [
      c.req.param('id'),
      session.user.id,
    ])
    const file = row.rows[0] as { name: string; file_name: string; path: string | null; content_type: string } | undefined
    if (!file?.path || !file.path.startsWith(`users/${session.user.id}/`)) return c.json({ error: 'Not found' }, 404)
    const stored = await downloadFromBunny(file.path)
    return new Response(stored.bytes, {
      headers: {
        'Content-Type': file.content_type,
        'Content-Disposition': `attachment; filename="${file.file_name}"`,
      },
    })
  })

  app.delete('/api/skills/:id', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const row = await pool.query(`SELECT path FROM user_skills WHERE id = $1 AND user_id = $2`, [
      c.req.param('id'),
      session.user.id,
    ])
    const path = row.rows[0]?.path as string | undefined
    if (path) await deleteFromBunny(path).catch(() => undefined)
    await pool.query(`DELETE FROM user_skills WHERE id = $1 AND user_id = $2`, [c.req.param('id'), session.user.id])
    return c.json({ ok: true })
  })
}
