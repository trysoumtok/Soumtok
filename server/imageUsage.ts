import type { Pool } from 'pg'
import { imageChargeTokens, imageChargeUsd, imageVendorUsd } from '../shared/imageBilling.ts'
import { TRIAL_TOKEN_QUOTA } from '../shared/plans.ts'
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

export async function assertPlatformTokenBudget(pool: Pool, userId: string, planId: string, extraTokens: number) {
  if (openAccessForBuilding()) return { ok: true as const }
  if (planId !== 'hobby' && planId !== 'trial') return { ok: true as const }
  const used = await platformTokensUsed(pool, userId)
  if (used + extraTokens > TRIAL_TOKEN_QUOTA) {
    return {
      ok: false as const,
      error: 'Your free trial ended. Upgrade to Pro to keep coding and generating images.',
      status: 402 as const,
    }
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
