import type { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { pool } from './db.ts'
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
`

export function registerTestHub(app: Hono, requireReadyUser: ReadyFn) {
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
}
