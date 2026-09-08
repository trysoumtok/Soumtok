import type { Hono } from 'hono'
import { catalogPlugin, PLUGIN_CATALOG, type PluginMcp, type PluginSkill } from '../shared/plugins.ts'
import { requirePluginSlot } from './connectors.ts'
import { pool } from './db.ts'
import { hasBunny } from './env.ts'
import { deleteFromBunny, uploadToBunny } from './storage.ts'

type ReadyFn = (c: { req: { raw: Request } }) => Promise<{
  session: { user: { id: string } } | null
  ready: boolean
}>

const PLUGIN_COLS = `id, plugin_id, name, kind, mcp_url, required, enabled, skills, mcps, bundle_path, publisher, description, created_at, updated_at`

function bundlePath(userId: string, pluginId: string) {
  return `users/${userId}/plugins/${pluginId}.json`
}

function snapshotSkills(pluginId: string, fallback: PluginSkill[] = []): PluginSkill[] {
  return catalogPlugin(pluginId)?.skills || fallback
}

function snapshotMcps(pluginId: string, fallback: PluginMcp[] = []): PluginMcp[] {
  return catalogPlugin(pluginId)?.mcps || fallback
}

async function saveBundle(userId: string, payload: {
  pluginId: string
  name: string
  kind: string
  mcpUrl: string | null
  publisher: string | null
  description: string | null
  skills: PluginSkill[]
  mcps: PluginMcp[]
}) {
  const path = bundlePath(userId, payload.pluginId)
  if (!hasBunny()) return null
  const body = new TextEncoder().encode(
    JSON.stringify(
      {
        ...payload,
        savedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  )
  await uploadToBunny(path, body, 'application/json')
  return path
}

async function dropBundle(path: string | null) {
  if (!path || !hasBunny()) return
  await deleteFromBunny(path).catch(() => undefined)
}

export function registerPlugins(app: Hono, requireReadyUser: ReadyFn) {
  app.get('/api/plugins', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const installed = await pool.query(
      `SELECT ${PLUGIN_COLS} FROM user_plugins WHERE user_id = $1 ORDER BY created_at DESC`,
      [session.user.id],
    )
    for (const row of installed.rows) {
      const catalog = catalogPlugin(row.plugin_id)
      const savedSkills = Array.isArray(row.skills) ? row.skills : []
      const savedMcps = Array.isArray(row.mcps) ? row.mcps : []
      if (catalog && ((savedSkills.length === 0 && catalog.skills.length > 0) || (savedMcps.length === 0 && catalog.mcps.length > 0))) {
        const skills = savedSkills.length ? savedSkills : catalog.skills
        const mcps = savedMcps.length ? savedMcps : catalog.mcps
        const path = await saveBundle(session.user.id, {
          pluginId: catalog.id,
          name: catalog.name,
          kind: catalog.kind,
          mcpUrl: row.mcp_url || catalog.mcpHint || mcps[0]?.url || null,
          publisher: catalog.publisher,
          description: catalog.description,
          skills,
          mcps,
        }).catch(() => row.bundle_path)
        await pool.query(
          `UPDATE user_plugins
           SET skills = $3::jsonb, mcps = $4::jsonb, publisher = $5, description = $6, bundle_path = COALESCE($7, bundle_path), updated_at = NOW()
           WHERE id = $1 AND user_id = $2`,
          [row.id, session.user.id, JSON.stringify(skills), JSON.stringify(mcps), catalog.publisher, catalog.description, path],
        )
        row.skills = skills
        row.mcps = mcps
        row.publisher = catalog.publisher
        row.description = catalog.description
        row.bundle_path = path || row.bundle_path
      }
    }
    return c.json({ catalog: PLUGIN_CATALOG, installed: installed.rows })
  })

  app.post('/api/plugins', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{ pluginId?: string; name?: string; mcpUrl?: string; required?: boolean }>()
    const catalog = body.pluginId ? catalogPlugin(body.pluginId) : null
    const slot = await requirePluginSlot(session.user.id, catalog?.id)
    if (!slot.ok) return c.json({ error: slot.error }, 402)
    const pluginId = catalog?.id || `custom-${crypto.randomUUID().slice(0, 8)}`
    const name = catalog?.name || body.name?.trim()
    if (!name) return c.json({ error: 'Name the plugin' }, 400)
    const mcpUrl = body.mcpUrl?.trim() || catalog?.mcpHint || catalog?.mcps[0]?.url || null
    const kind = catalog?.kind || 'mcp'
    const skills = snapshotSkills(pluginId)
    const catalogMcps = snapshotMcps(pluginId)
    const mcps =
      catalogMcps.length > 0
        ? catalogMcps
        : mcpUrl
          ? [{ id: pluginId, label: pluginId, url: mcpUrl, sourceUrl: mcpUrl }]
          : []
    const publisher = catalog?.publisher || null
    const description = catalog?.description || null
    const id = crypto.randomUUID()
    let path: string | null = null
    try {
      path = await saveBundle(session.user.id, {
        pluginId,
        name,
        kind,
        mcpUrl,
        publisher,
        description,
        skills,
        mcps,
      })
    } catch {
      path = null
    }
    await pool.query(
      `INSERT INTO user_plugins (id, user_id, plugin_id, name, kind, mcp_url, required, skills, mcps, bundle_path, publisher, description, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, NOW())
       ON CONFLICT (user_id, plugin_id) DO UPDATE SET
         name = EXCLUDED.name,
         mcp_url = COALESCE(EXCLUDED.mcp_url, user_plugins.mcp_url),
         skills = EXCLUDED.skills,
         mcps = EXCLUDED.mcps,
         bundle_path = COALESCE(EXCLUDED.bundle_path, user_plugins.bundle_path),
         publisher = EXCLUDED.publisher,
         description = EXCLUDED.description,
         enabled = true,
         updated_at = NOW()`,
      [id, session.user.id, pluginId, name, kind, mcpUrl, Boolean(body.required), JSON.stringify(skills), JSON.stringify(mcps), path, publisher, description],
    )
    const row = await pool.query(`SELECT ${PLUGIN_COLS} FROM user_plugins WHERE user_id = $1 AND plugin_id = $2`, [
      session.user.id,
      pluginId,
    ])
    return c.json({ plugin: row.rows[0], stored: { neon: true, bunny: Boolean(row.rows[0]?.bundle_path) } })
  })

  app.put('/api/plugins/:id', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{ required?: boolean; enabled?: boolean; mcpUrl?: string }>()
    await pool.query(
      `UPDATE user_plugins
       SET required = COALESCE($3, required),
           enabled = COALESCE($4, enabled),
           mcp_url = COALESCE($5, mcp_url),
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [c.req.param('id'), session.user.id, body.required, body.enabled, body.mcpUrl?.trim() || null],
    )
    return c.json({ ok: true })
  })

  app.delete('/api/plugins/:id', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const existing = await pool.query(`SELECT bundle_path FROM user_plugins WHERE id = $1 AND user_id = $2`, [
      c.req.param('id'),
      session.user.id,
    ])
    await dropBundle(existing.rows[0]?.bundle_path || null)
    await pool.query(`DELETE FROM user_plugins WHERE id = $1 AND user_id = $2`, [c.req.param('id'), session.user.id])
    return c.json({ ok: true })
  })
}
