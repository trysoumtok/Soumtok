import { catalogModelId, modelById, type CodingModel } from './models.ts'
import { modelUsagePool } from './usagePools.ts'

/** Soumtok on-demand rate when included pool is exhausted (USD per 1M total tokens). */
export const SOUMTOK_ON_DEMAND_USD_PER_M = 2

export type VendorPrice = {
  inputPerM: number
  outputPerM: number
  note?: string
}

export type BillingPath = {
  path: string
  whoPays: string
  rate: string
  detail: string
}

export type PriceExample = {
  label: string
  inputTokens: number
  outputTokens: number
  vendorUsd: string
  includedNote: string
  onDemandUsd: string
  byokNote: string
}

export type ModelPricing = {
  headline: string
  vendorLine: string
  vendor: VendorPrice | null
  soumtokTier: string
  billingPaths: BillingPath[]
  examples: PriceExample[]
  tips: string[]
}

function fmtUsd(n: number) {
  if (n < 0.01 && n > 0) return '<$0.01'
  if (n < 1) return `$${n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}`
  return `$${n.toFixed(2)}`
}

export function vendorTotal(inTok: number, outTok: number, v: VendorPrice) {
  return (inTok / 1_000_000) * v.inputPerM + (outTok / 1_000_000) * v.outputPerM
}

function onDemandTotal(totalTok: number) {
  return (totalTok / 1_000_000) * SOUMTOK_ON_DEMAND_USD_PER_M
}

function tierVendor(cost: string): VendorPrice | null {
  switch (cost) {
    case 'Included':
      return null
    case 'Cheapest':
      return { inputPerM: 0.14, outputPerM: 0.28, note: 'Flash-class list price (DeepSeek-style tier).' }
    case 'Cheap':
      return { inputPerM: 0.15, outputPerM: 0.6, note: 'Mini / nano class list price.' }
    case 'Low':
      return { inputPerM: 0.4, outputPerM: 1.6, note: 'Low tier — Haiku / mini class.' }
    case 'Mid':
      return { inputPerM: 2.5, outputPerM: 10, note: 'Mid tier — Sonnet / GPT-4o class.' }
    case 'Higher':
      return { inputPerM: 2, outputPerM: 6, note: 'Frontier-adjacent list price (Grok 4.6 short-prompt card).' }
    case 'High':
      return { inputPerM: 10, outputPerM: 30, note: 'High tier — Opus / Codex / o-series class.' }
    case 'Highest':
      return { inputPerM: 10, outputPerM: 50, note: 'Flagship tier — GPT-6 Astra / Fable class list price.' }
    case 'Varies':
      return { inputPerM: 2.5, outputPerM: 10, note: 'Alias row — live OpenAI routing sets the invoice.' }
    default:
      return { inputPerM: 2.5, outputPerM: 10, note: 'Estimated from Soumtok cost tier.' }
  }
}

export function vendorForModel(model: CodingModel): VendorPrice | null {
  const id = model.id.toLowerCase()
  if (model.cost === 'Included' || id === 'soumtok-agent') return null

  if (/deepseek/.test(id) || model.provider === 'deepseek') {
    return {
      inputPerM: 0.14,
      outputPerM: 0.28,
      note: 'DeepSeek API list price (input / output per 1M). Prompt cache hits can be cheaper on the vendor side.',
    }
  }

  if (/gpt-6-astra/.test(id)) {
    return { inputPerM: 10, outputPerM: 50, note: 'OpenAI list price. Input doubles above 272K prompt tokens on Astra Standard.' }
  }
  if (/gpt-5\.6-sol/.test(id)) return { inputPerM: 5, outputPerM: 20, note: 'GPT-5.6 Sol — flagship tier (estimate from OpenAI 5.6 family positioning).' }
  if (/gpt-5\.6-terra/.test(id)) return { inputPerM: 3, outputPerM: 12, note: 'GPT-5.6 Terra — balanced tier.' }
  if (/gpt-5\.6-luna/.test(id)) return { inputPerM: 1, outputPerM: 4, note: 'GPT-5.6 Luna — cost-efficient tier.' }
  if (/gpt-5\.3-codex/.test(id)) return { inputPerM: 10, outputPerM: 30, note: 'Codex agent tier — priced like a premium coding model.' }
  if (/gpt-4\.1-nano|gpt-5\.4-nano|gpt-5-nano/.test(id)) return { inputPerM: 0.1, outputPerM: 0.4, note: 'Nano list price band.' }
  if (/gpt-4\.1-mini|gpt-5-mini|gpt-5\.4-mini|gpt-4o-mini/.test(id)) return { inputPerM: 0.4, outputPerM: 1.6, note: 'Mini list price band.' }
  if (/gpt-4\.1(?!-)/.test(id)) return { inputPerM: 2, outputPerM: 8, note: 'GPT-4.1 list price.' }
  if (/gpt-4o(?!-)/.test(id)) return { inputPerM: 2.5, outputPerM: 10, note: 'GPT-4o list price.' }
  if (/o1-pro/.test(id)) return { inputPerM: 150, outputPerM: 600, note: 'o1 Pro — strongest reasoning list price.' }
  if (/o1|o3(?!-mini)/.test(id)) return { inputPerM: 15, outputPerM: 60, note: 'Deep reasoning list price.' }
  if (/o3-mini|o4-mini/.test(id)) return { inputPerM: 1.1, outputPerM: 4.4, note: 'Reasoning mini list price.' }
  if (/gpt-5\.5-pro|gpt-5\.4-pro|gpt-5\.2-pro|gpt-5-pro/.test(id)) return { inputPerM: 10, outputPerM: 30, note: 'Pro-tier GPT list price.' }

  if (/claude-haiku/.test(id)) return { inputPerM: 0.8, outputPerM: 4, note: 'Claude Haiku list price.' }
  if (/claude-sonnet/.test(id)) return { inputPerM: 3, outputPerM: 15, note: 'Claude Sonnet list price.' }
  if (/claude-fable/.test(id)) return { inputPerM: 18, outputPerM: 90, note: 'Fable longform tier — premium output pricing.' }
  if (/claude-opus/.test(id)) return { inputPerM: 15, outputPerM: 75, note: 'Claude Opus list price.' }

  if (/grok-4\.6|grok-4\.5/.test(id)) {
    return {
      inputPerM: 2,
      outputPerM: 6,
      note: 'xAI list price for prompts under 200K tokens. At ≥200K prompt, the whole request bills at $4 / $12 per 1M in/out.',
    }
  }
  if (/grok-4\.20/.test(id)) return { inputPerM: 2, outputPerM: 6, note: 'Grok 4.20 class list price (xAI coding tier).' }

  return tierVendor(model.cost)
}

function billingPaths(model: CodingModel): BillingPath[] {
  const poolNote = modelUsagePool(model.id) === 'cheap'
    ? 'Everyday models draw from your Everyday pool (Start $5, Pro $10/mo, Pro Plus $24/mo).'
    : 'Additional models draw from your Additional pool on Pro and Pro Plus — not from Everyday.'

  return [
    {
      path: 'Soumtok included',
      whoPays: 'Your plan pool',
      rate: 'Included while your pool has balance',
      detail: `${poolNote} Pools reset each billing cycle. See Dashboard → Spending for live meters.`,
    },
    {
      path: 'Your API key (BYOK)',
      whoPays: 'Your provider account',
      rate: 'Vendor list price (input + output tokens)',
      detail: `Add a key in Dashboard → Keys. Soumtok calls ${model.provider} with your credential. The invoice appears on OpenAI / Anthropic / DeepSeek / xAI — not on Soumtok subscription.`,
    },
    {
      path: 'On-demand (past included)',
      whoPays: 'Soumtok on-demand meter',
      rate: `$${SOUMTOK_ON_DEMAND_USD_PER_M.toFixed(2)} per 1M total tokens`,
      detail:
        'Flat Soumtok rate after included + BYOK pools are exhausted on platform routing. Same $/M whether you pick Flash or Opus — but expensive models burn more tokens per turn, so the effective cost still rises.',
    },
  ]
}

function examplesFor(model: CodingModel, vendor: VendorPrice | null): PriceExample[] {
  const scenarios = [
    { label: 'Small Test Hub turn (rename + snippet)', inputTokens: 1_500, outputTokens: 800 },
    { label: 'Build a calculator page (HTML/CSS/JS)', inputTokens: 2_500, outputTokens: 4_000 },
    { label: 'Hard bug with file attached', inputTokens: 12_000, outputTokens: 3_500 },
  ]
  return scenarios.map((s) => {
    const total = s.inputTokens + s.outputTokens
    const vendorUsd = vendor ? fmtUsd(vendorTotal(s.inputTokens, s.outputTokens, vendor)) : 'Included on platform'
    return {
      ...s,
      vendorUsd,
      includedNote: `Uses ${total.toLocaleString()} tokens from your included pool — $0 on-demand while quota remains.`,
      onDemandUsd: fmtUsd(onDemandTotal(total)),
      byokNote: vendor ? `~${vendorUsd} on your ${model.provider} bill at list price.` : 'Platform included — no BYOK vendor invoice.',
    }
  })
}

function tipsFor(model: CodingModel, vendor: VendorPrice | null): string[] {
  const tips = [
    'Included tokens are model-agnostic: 1 token counts as 1 token whether you pick Flash or Opus. Use expensive models only when the job needs them.',
    `On-demand is a flat $${SOUMTOK_ON_DEMAND_USD_PER_M}/M on Soumtok platform routing — not the vendor’s per-model list price.`,
    'BYOK always bills at the vendor rate for this model. Check Dashboard → Usage to see included vs on-demand vs your-key rows.',
    'Reasoning and agent turns cost more because output + hidden thinking tokens add up — watch completion tokens in Usage.',
  ]
  if (vendor && vendor.inputPerM >= 10) {
    tips.push('This is a premium list-price row. On BYOK, a verbose 8K-output turn can cost more than a dozen Flash turns.')
  }
  if (/grok-4\.6|grok-4\.5/.test(model.id)) {
    tips.push('Grok prices jump when the prompt crosses 200K tokens — long threads can bill the higher tier on the full request.')
  }
  if (/gpt-6-astra/.test(model.id)) {
    tips.push('Astra doubles input price above 272K prompt tokens on OpenAI’s Standard tier.')
  }
  if (model.id === 'deepseek-v4-flash' || model.id === 'deepseek-v4-pro' || model.id === 'gpt-4.1-mini') {
    tips.push('Everyday model — included on Start ($5) and counts toward your Everyday pool on Pro.')
  }
  return tips
}

/** Vendor API cost for a completed run (Soumtok's COGS on platform routing). */
export function vendorUsdForTokens(modelId: string, promptTokens: number, completionTokens: number) {
  const model = modelById(catalogModelId(modelId))
  const vendor =
    vendorForModel(model) ??
    ({ inputPerM: 0.14, outputPerM: 0.28, note: 'Soumtok Agent / included row → DeepSeek Flash pricing.' } satisfies VendorPrice)
  return vendorTotal(Math.max(0, promptTokens), Math.max(0, completionTokens), vendor)
}

export function resolveModelPricing(model: CodingModel): ModelPricing {
  const vendor = vendorForModel(model)
  const soumtokTier = model.cost

  if (!vendor) {
    return {
      headline: 'Included on Soumtok',
      vendorLine: 'Platform routing — no separate vendor list price for this catalog row.',
      vendor: null,
      soumtokTier,
      billingPaths: billingPaths(model),
      examples: examplesFor(model, null),
      tips: tipsFor(model, null),
    }
  }

  const headline = `${fmtUsd(vendor.inputPerM)} in · ${fmtUsd(vendor.outputPerM)} out`
  const vendorLine = `${fmtUsd(vendor.inputPerM)} / ${fmtUsd(vendor.outputPerM)} per 1M tokens (input / output)${vendor.note ? ` — ${vendor.note}` : ''}`

  return {
    headline,
    vendorLine,
    vendor,
    soumtokTier,
    billingPaths: billingPaths(model),
    examples: examplesFor(model, vendor),
    tips: tipsFor(model, vendor),
  }
}
