import type { Pool } from 'pg'
import { imageChargeTokens, imageChargeUsd, imageVendorUsd } from '../shared/imageBilling.ts'
import { checkPoolAccess, sumPoolUsageUsd } from '../shared/usagePools.ts'
import { openAccessForBuilding } from './env.ts'

export async function platformTokensUsed(pool: Pool, userId: string) {
  const used = await pool.query<{ tokens: number }>(
    `SELECT coalesce(sum(prompt_tokens + completion_tokens), 0)::int AS tokens
     FROM usage_events
     WHERE user_id = $1
       AND billed_to = 'platform'
       AND created_at >= date_trunc('month', now())`,
    [userId],
  )
  return used.rows[0]?.tokens || 0
}

export async function assertPlatformTokenBudget(
  pool: Pool,
  userId: string,
  planId: string,
  _extraTokens: number,
  modelId?: string,
) {
  if (openAccessForBuilding()) return { ok: true as const }
  const profile = await pool.query(`SELECT plan_started_at FROM profiles WHERE user_id = $1`, [userId])
  const started = profile.rows[0]?.plan_started_at
  const since =
    started && planId !== 'hobby' && planId !== 'trial'
      ? new Date(started)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const rows = await pool.query(
    `SELECT model, prompt_tokens, completion_tokens, billed_to
     FROM usage_events
     WHERE user_id = $1 AND billed_to = 'platform' AND created_at >= $2`,
    [userId, since.toISOString()],
  )
  const used = sumPoolUsageUsd(rows.rows as { model: string; prompt_tokens?: number; completion_tokens?: number; billed_to?: string }[])
  const est = modelId ? imageChargeUsd(modelId) : 0.08
  const gate = checkPoolAccess({
    planId,
    modelId: 'deepseek-v4-flash',
    usedCheapUsd: used.cheap,
    usedPremiumUsd: used.premium,
    estTurnUsd: est,
  })
  if (!gate.ok) {
    return { ok: false as const, error: gate.error, status: gate.status }
  }
  return { ok: true as const }
}

export async function recordImageUsage(
  pool: Pool,
  userId: string,
  modelId: string,
  provider: string,
  source: 'studio' | 'desktop' = 'studio',
) {
  const tokens = imageChargeTokens(modelId)
  await pool.query(
    `INSERT INTO usage_events (id, user_id, provider, model, prompt_tokens, completion_tokens, billed_to, source)
     VALUES ($1, $2, $3, $4, 0, $5, 'platform', $6)`,
    [crypto.randomUUID(), userId, provider, modelId, tokens, source],
  )
  return {
    tokens,
    vendorUsd: imageVendorUsd(modelId),
    chargeUsd: imageChargeUsd(modelId),
  }
}
