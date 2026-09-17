/**

 * Dual usage pools: Everyday models vs Additional models, capped in vendor USD.

 * Internal enforcement uses a safety factor — never exposed in user-facing copy.

 */



import { imageChargeUsd, isImageUsageModel } from './imageBilling.ts'

import { catalogModelId, modelById, resolveModelId, type CodingModel } from './models.ts'

import { vendorUsdForTokens } from './modelPricing.ts'

import { isUnpaidPlan } from './plans.ts'



export type UsagePool = 'cheap' | 'premium'



/** Internal cap = display budget × this factor. Not shown to users. */

export const POOL_SAFETY_FACTOR = 0.8



/** Markup on vendor cost when user buys overage (always profitable). */

export const OVERAGE_VENDOR_MARKUP = 1.25



/** Exactly three Everyday models on Start and below. */

export const EVERYDAY_MODEL_IDS = ['deepseek-v4-flash', 'deepseek-v4-pro', 'gpt-4.1-mini'] as const



/** User-facing monthly pool allowances (USD). */

export const PLAN_POOL_DISPLAY_USD: Record<string, { cheap: number; premium: number }> = {

  hobby: { cheap: 0, premium: 0 },

  trial: { cheap: 0, premium: 0 },

  start: { cheap: 5, premium: 0 },

  pro: { cheap: 10, premium: 10 },

  pro_plus: { cheap: 24, premium: 24 },

  team: { cheap: 24, premium: 24 },

  teams: { cheap: 24, premium: 24 },

  team_plus: { cheap: 60, premium: 60 },

}



export function everydayModelIds() {

  return EVERYDAY_MODEL_IDS

}



export function isEverydayModel(modelId: string) {
  return EVERYDAY_MODEL_IDS.includes(modelId as (typeof EVERYDAY_MODEL_IDS)[number])
}



export function poolBudgetUsd(planId: string, pool: UsagePool) {

  const key = planId === 'teams' ? 'team' : planId

  const row = PLAN_POOL_DISPLAY_USD[key] || PLAN_POOL_DISPLAY_USD.hobby

  return Number((row[pool] * POOL_SAFETY_FACTOR).toFixed(4))

}



export function poolDisplayUsd(planId: string, pool: UsagePool) {

  const key = planId === 'teams' ? 'team' : planId

  const row = PLAN_POOL_DISPLAY_USD[key] || PLAN_POOL_DISPLAY_USD.hobby

  return row[pool]

}



export function modelUsagePool(modelId: string): UsagePool {
  const id = catalogModelId(modelId)
  return EVERYDAY_MODEL_IDS.includes(id as (typeof EVERYDAY_MODEL_IDS)[number]) ? 'cheap' : 'premium'
}



export function planAllowsPremiumModels(planId: string) {

  const key = planId === 'teams' ? 'team' : planId

  return (PLAN_POOL_DISPLAY_USD[key]?.premium || 0) > 0

}



export function cheapModelsOnlyPlan(planId: string) {

  return !planAllowsPremiumModels(planId)

}



export type UsageRow = {

  model: string

  prompt_tokens?: number

  completion_tokens?: number

  billed_to?: string

}



export function sumPoolUsageUsd(rows: UsageRow[]) {

  let cheap = 0

  let premium = 0

  for (const row of rows) {

    if (row.billed_to === 'user') continue

    if (isImageUsageModel(row.model)) {

      cheap += imageChargeUsd(row.model)

      continue

    }

    const prompt = row.prompt_tokens || 0

    const completion = row.completion_tokens || 0

    if (!prompt && !completion) continue

    const usd = vendorUsdForTokens(row.model, prompt, completion)

    if (modelUsagePool(row.model) === 'cheap') cheap += usd

    else premium += usd

  }

  return {

    cheap: Number(cheap.toFixed(6)),

    premium: Number(premium.toFixed(6)),

  }

}



export type PoolAccessInput = {

  planId: string

  modelId: string

  usedCheapUsd: number

  usedPremiumUsd: number

  /** Rough vendor cost for this turn (pre-flight). */

  estTurnUsd?: number

}



export type PoolAccessResult =

  | { ok: true; pool: UsagePool }

  | { ok: false; status: 402; error: string; pool: UsagePool }



export function checkPoolAccess(input: PoolAccessInput): PoolAccessResult {

  const planKey = input.planId === 'teams' ? 'team' : input.planId

  const pool = modelUsagePool(input.modelId)

  const est = Math.max(0, input.estTurnUsd ?? 0.002)



  if (isUnpaidPlan(planKey)) {

    return {

      ok: false,

      status: 402,

      pool,

      error: 'Subscribe to Start ($5/mo) to use Soumtok models — or add your own API key in Dashboard → Keys.',

    }

  }



  if (pool === 'premium' && cheapModelsOnlyPlan(planKey)) {

    return {

      ok: false,

      status: 402,

      pool,

      error: `${modelById(input.modelId).name} is an Additional model. Upgrade to Pro ($20) for Opus, GPT-6, and Sonnet — or add your own API key.`,

    }

  }



  const budget = poolBudgetUsd(planKey, pool)

  const used = pool === 'cheap' ? input.usedCheapUsd : input.usedPremiumUsd

  if (budget <= 0 && pool === 'premium') {

    return {

      ok: false,

      status: 402,

      pool,

      error: 'Additional models are not on your plan. Upgrade to Pro or add your own API key.',

    }

  }

  if (used + est > budget + 1e-9) {

    const label =

      pool === 'cheap'

        ? 'Everyday models (DeepSeek Flash, DeepSeek Pro, GPT-4.1 Mini)'

        : 'Additional models (Opus, GPT-6, Sonnet, Grok)'

    const display = poolDisplayUsd(planKey, pool)

    const otherPoolHasBudget =

      pool === 'cheap' &&

      planAllowsPremiumModels(planKey) &&

      input.usedPremiumUsd + est <= poolBudgetUsd(planKey, 'premium') + 1e-9

    const hint = otherPoolHasBudget

      ? ' Your Everyday pool is empty — switch to an Additional model to keep coding, or upgrade.'

      : ' Upgrade, wait for renewal, add your key, or enable pay-as-you-go.'

    return {

      ok: false,

      status: 402,

      pool,

      error: `${label} pool used ($${display.toFixed(2)}/mo included).${hint}`,

    }

  }



  return { ok: true, pool }

}



export function overageChargeUsd(vendorUsd: number) {

  return Number((vendorUsd * OVERAGE_VENDOR_MARKUP).toFixed(6))

}



export function planPoolSummary(planId: string) {

  const key = planId === 'teams' ? 'team' : planId

  const display = PLAN_POOL_DISPLAY_USD[key] || PLAN_POOL_DISPLAY_USD.hobby

  return {

    cheapDisplayUsd: display.cheap,

    premiumDisplayUsd: display.premium,

    cheapBudgetUsd: poolBudgetUsd(key, 'cheap'),

    premiumBudgetUsd: poolBudgetUsd(key, 'premium'),

    cheapOnly: cheapModelsOnlyPlan(key),

  }

}



export function modelInCheapCatalog(model: Pick<CodingModel, 'id' | 'cost'>) {

  return isEverydayModel(model.id)

}



/** Model picker + Auto — only rows the user's plan includes. */
export function modelsForPlan<T extends { id: string }>(catalog: T[], planId: string) {
  if (cheapModelsOnlyPlan(planId)) return catalog.filter((model) => isEverydayModel(model.id))
  return catalog
}

