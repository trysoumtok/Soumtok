import type { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { pool } from './db.ts'
import { publishSite, registerSiteSlug, removeSite, restorePublishedSite, tokenForSlug, unregisterSiteSlug } from './chrome.ts'
import { buildPreviewHtml } from '../shared/testHub.ts'
import {
  clampShareTtlMinutes,
  shareTtlMsFromMinutes,
  testHubSharePath,
  testHubSlugError,
  normalizeTestHubSlug,
} from '../shared/testHubDeploy.ts'
import { benchmarkPayloadFromCompare, type CompareRunStats } from '../shared/testHubBenchmark.ts'

type ReadyFn = (c: { req: { raw: Request } }) => Promise<{
  session: { user: { id: string } } | null
  ready: boolean
}>

export const testHubBenchmarksSql = `
CREATE TABLE IF NOT EXISTS test_hub_benchmarks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'compare',
  prompt TEXT NOT NULL DEFAULT '',
  models JSONB NOT NULL DEFAULT '[]'::jsonb,
  winner_model TEXT,
  winner_score REAL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS test_hub_benchmarks_user_idx ON test_hub_benchmarks (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS test_hub_benchmarks_winner_idx ON test_hub_benchmarks (winner_model, created_at DESC);
CREATE TABLE IF NOT EXISTS test_hub_deploys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL,
  file_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS test_hub_deploys_user_idx ON test_hub_deploys (user_id, created_at DESC);
ALTER TABLE test_hub_deploys ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE test_hub_deploys ADD COLUMN IF NOT EXISTS files JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE test_hub_deploys ADD COLUMN IF NOT EXISTS project_id TEXT;
ALTER TABLE test_hub_deploys ADD COLUMN IF NOT EXISTS project_title TEXT;
CREATE INDEX IF NOT EXISTS test_hub_deploys_slug_idx ON test_hub_deploys (slug);
CREATE INDEX IF NOT EXISTS test_hub_deploys_project_idx ON test_hub_deploys (user_id, project_id, created_at DESC);
`

export async function hydrateTestHubDeploys(db = pool) {
  if (!db) return
  const { rows } = await db.query(
    `SELECT user_id, token, slug, files, expires_at
     FROM test_hub_deploys
     WHERE expires_at > NOW() AND slug IS NOT NULL`,
  )
  for (const row of rows) {
    const raw = row.files
    const files =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, string>) : {}
    if (!Object.keys(files).length) continue
    const html = buildPreviewHtml(files)
    if (!html.trim()) continue
    const expiresAt = new Date(row.expires_at).getTime()
    restorePublishedSite({
      userId: row.user_id,
      token: row.token,
      files,
      html,
      expiresAt,
    })
    registerSiteSlug(row.slug, row.token, expiresAt)
  }
}

export async function cleanupExpiredDeploys(db = pool) {
  if (!db) return 0
  const { rows } = await db.query(
    `DELETE FROM test_hub_deploys WHERE expires_at <= NOW() RETURNING token, slug`,
  )
  for (const row of rows) {
    removeSite(row.token)
    if (row.slug) unregisterSiteSlug(row.slug)
  }
  return rows.length
}

let deployCleanupTimer: ReturnType<typeof setInterval> | null = null

function startDeployCleanupLoop() {
  if (deployCleanupTimer) return
  deployCleanupTimer = setInterval(() => {
    void cleanupExpiredDeploys().catch(() => undefined)
  }, 5 * 60_000)
}

export function registerTestHub(app: Hono, requireReadyUser: ReadyFn) {
  startDeployCleanupLoop()
  app.post('/api/test-hub/benchmarks', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const body = await c.req.json<{
      kind?: string
      prompt?: string
      models?: unknown
      winnerModel?: string | null
      winnerScore?: number | null
      meta?: Record<string, unknown>
      runs?: CompareRunStats[]
      compareMode?: boolean
      viteEnabled?: boolean
    }>()

    let row = body
    if (Array.isArray(body.runs) && body.runs.length) {
      row = benchmarkPayloadFromCompare({
        prompt: body.prompt || '',
        runs: body.runs,
        compareMode: body.compareMode,
        viteEnabled: body.viteEnabled,
      })
    }

    const models = Array.isArray(row.models) ? row.models : []
    if (!models.length) return c.json({ error: 'No model runs to save' }, 400)

    const id = randomUUID()
    await pool.query(
      `INSERT INTO test_hub_benchmarks (id, user_id, kind, prompt, models, winner_model, winner_score, meta)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb)`,
      [
        id,
        session.user.id,
        String(row.kind || 'compare').slice(0, 32),
        String(row.prompt || '').slice(0, 4000),
        JSON.stringify(models),
        row.winnerModel || null,
        row.winnerScore ?? null,
        JSON.stringify(row.meta && typeof row.meta === 'object' ? row.meta : {}),
      ],
    )
    return c.json({ ok: true, id, winnerModel: row.winnerModel || null, winnerScore: row.winnerScore ?? null })
  })

  app.get('/api/test-hub/benchmarks', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') || 20)))
    const model = String(c.req.query('model') || '').trim()
    const params: unknown[] = [session.user.id, limit]
    let sql = `SELECT id, kind, prompt, models, winner_model, winner_score, meta, created_at
               FROM test_hub_benchmarks
               WHERE user_id = $1`
    if (model) {
      params.push(model)
      sql += ` AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(models) elem
        WHERE elem->>'model' = $${params.length}
      )`
    }
    sql += ` ORDER BY created_at DESC LIMIT $2`

    const { rows } = await pool.query(sql, params)
    return c.json({ rows })
  })

  app.get('/api/test-hub/benchmarks/summary', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const { rows } = await pool.query(
      `SELECT elem->>'model' AS model,
              elem->>'modelName' AS model_name,
              count(*)::int AS runs,
              round(avg((elem->>'autoScore')::numeric), 1) AS avg_score,
              round(avg((elem->>'ms')::numeric), 0) AS avg_ms,
              round(avg((elem->>'fileCount')::numeric), 1) AS avg_files
       FROM test_hub_benchmarks b,
            jsonb_array_elements(b.models) elem
       WHERE b.user_id = $1
       GROUP BY elem->>'model', elem->>'modelName'
       ORDER BY avg_score DESC NULLS LAST, runs DESC
       LIMIT 24`,
      [session.user.id],
    )
    return c.json({ rows })
  })

  app.post('/api/test-hub/publish', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const body = await c.req
      .json<{
        files?: Record<string, string>
        title?: string
        slug?: string
        projectId?: string
        projectTitle?: string
        ttlMinutes?: number
      }>()
      .catch(() => ({}))
    const files = body.files && typeof body.files === 'object' ? body.files : {}
    const names = Object.keys(files)
    if (!names.length) return c.json({ error: 'No files to publish' }, 400)

    const slugErr = testHubSlugError(body.slug || '')
    if (slugErr) return c.json({ error: slugErr }, 400)
    const slug = normalizeTestHubSlug(body.slug || '')

    const html = buildPreviewHtml(files)
    if (!html.trim()) return c.json({ error: 'Nothing to preview — add HTML or CSS/JS first' }, 400)

    if (tokenForSlug(slug)) return c.json({ error: 'That slug is already live — pick another' }, 409)
    const { rows: takenRows } = await pool.query(
      `SELECT id FROM test_hub_deploys WHERE slug = $1 AND expires_at > NOW() LIMIT 1`,
      [slug],
    )
    if (takenRows.length) return c.json({ error: 'That slug is already live — pick another' }, 409)

    const ttlMinutes = clampShareTtlMinutes(body.ttlMinutes)
    const published = publishSite({
      userId: session.user.id,
      files,
      html,
      fresh: true,
      ttlMs: shareTtlMsFromMinutes(ttlMinutes),
    })
    if ('skipped' in published) return c.json({ error: 'Publish failed' }, 500)

    registerSiteSlug(slug, published.token, published.expiresAt)
    const sharePath = testHubSharePath(slug)
    const origin = new URL(c.req.url).origin
    const url = `${origin}${sharePath}`
    const title = String(body.title || '').trim().slice(0, 200) || 'Test Hub preview'
    const projectId = String(body.projectId || '').trim().slice(0, 64) || null
    const projectTitle = String(body.projectTitle || '').trim().slice(0, 120) || null
    const id = randomUUID()

    await pool.query(
      `INSERT INTO test_hub_deploys (id, user_id, token, slug, title, path, file_count, files, project_id, project_title, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, to_timestamp($11 / 1000.0))`,
      [
        id,
        session.user.id,
        published.token,
        slug,
        title,
        sharePath,
        names.length,
        JSON.stringify(files),
        projectId,
        projectTitle,
        published.expiresAt,
      ],
    )

    return c.json({
      ok: true,
      id,
      slug,
      url,
      path: sharePath,
      projectId,
      projectTitle,
      expiresAt: new Date(published.expiresAt).toISOString(),
      ttlMinutes: published.ttlMinutes,
    })
  })

  app.get('/api/test-hub/deploys', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    await cleanupExpiredDeploys(pool)

    const limit = Math.min(30, Math.max(1, Number(c.req.query('limit') || 10)))
    const projectId = String(c.req.query('project') || '').trim()
    const origin = new URL(c.req.url).origin
    const params: unknown[] = [session.user.id]
    let sql = `SELECT id, token, slug, title, path, file_count, project_id, project_title, expires_at, created_at
               FROM test_hub_deploys
               WHERE user_id = $1 AND expires_at > NOW()`
    if (projectId) {
      params.push(projectId)
      sql += ` AND project_id = $${params.length}`
    }
    params.push(limit)
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`
    const { rows } = await pool.query(sql, params)
    return c.json({
      rows: rows.map((row) => ({
        ...row,
        url: `${origin}${row.path}`,
        expired: new Date(row.expires_at).getTime() <= Date.now(),
        live: new Date(row.expires_at).getTime() > Date.now() && Boolean(tokenForSlug(row.slug || '')),
      })),
    })
  })

  app.delete('/api/test-hub/deploys/:id', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const id = String(c.req.param('id') || '').trim()
    if (!id) return c.json({ error: 'Missing deploy id' }, 400)

    const { rows } = await pool.query(
      `DELETE FROM test_hub_deploys WHERE id = $1 AND user_id = $2 RETURNING token, slug`,
      [id, session.user.id],
    )
    if (!rows.length) return c.json({ error: 'Link not found' }, 404)

    const row = rows[0]
    removeSite(row.token)
    if (row.slug) unregisterSiteSlug(row.slug)
    return c.json({ ok: true })
  })
}
