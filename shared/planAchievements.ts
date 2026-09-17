import { imageChargeUsd } from './imageBilling.ts'
import { IMAGE_MODELS, modelById, modelGuide, type ModelProvider } from './models.ts'
import { vendorForModel, vendorTotal } from './modelPricing.ts'
import { poolDisplayUsd } from './usagePools.ts'
import type { PaidPlanId } from './plans.ts'

/** Harness compresses old tool reads to ~1.5K chars; collapses history after 10 Agent rounds. */
export const SOUMTOK_AGENT = {
  id: 'soumtok-agent',
  name: 'Soumtok Agent',
  logo: '/images/soumtok-mark.png',
  tagline: 'The Agent / Ask / Plan harness — included free on every plan. Not a billed model row.',
  /** Typical short job: pruned tools, deduped reads, compact CONTROL packet. */
  shortSessionTokenSavePct: 25,
  /** Long session (10+ rounds): round collapse keeps last 4 rounds full, summarizes the rest. */
  longSessionTokenSavePct: 55,
  features: [
    'Agent, Ask, and Plan modes in Studio and Desktop',
    'Auto-picks Everyday models unless you choose Additional',
    'Context compression on long threads — same results, smaller prompts',
    'No extra subscription — you only pay for model pools',
  ],
} as const

export type ProviderLogo = { src: string; mono: boolean }

export const PROVIDER_LOGO: Record<ModelProvider, ProviderLogo> = {
  openai: { src: '/logos/openai.svg', mono: true },
  anthropic: { src: '/logos/anthropic.svg', mono: true },
  google: { src: '/logos/google-g.svg', mono: false },
  xai: { src: '/logos/xai.svg', mono: true },
  deepseek: { src: '/logos/deepseek.svg', mono: true },
  openrouter: { src: '/logos/openai.svg', mono: true },
}

/** Typical Soumtok Agent turn — one user message + tools + reply. */
export const TYPICAL_AGENT_TURN = { promptTokens: 4_000, completionTokens: 2_500 }
export const BUILD_PAGE_TURN = { promptTokens: 3_500, completionTokens: 5_000 }
export const QUICK_FIX_TURN = { promptTokens: 2_000, completionTokens: 1_200 }

export type EverydayModelId = 'deepseek-v4-flash' | 'deepseek-v4-pro' | 'gpt-4.1-mini'

export const EVERYDAY_MODEL_ROWS: { id: EverydayModelId; tagline: string }[] = [
  { id: 'deepseek-v4-flash', tagline: 'Default for speed — most turns land here.' },
  { id: 'deepseek-v4-pro', tagline: 'Bigger refactors and harder bugs.' },
  { id: 'gpt-4.1-mini', tagline: 'OpenAI mini tier for everyday edits.' },
]

export const ADDITIONAL_MODEL_ROWS = [
  { id: 'claude-opus-5', tagline: 'Hardest problems and architecture.' },
  { id: 'gpt-6-astra', tagline: 'Flagship GPT reasoning and codegen.' },
  { id: 'claude-sonnet-5', tagline: 'Daily frontier work without Opus cost.' },
  { id: 'grok-4.6', tagline: 'Fast frontier model with huge threads.' },
] as const

export type ModelCapacity = {
  id: string
  name: string
  provider: ModelProvider
  tagline: string
  contextLabel: string
  outputLabel: string
  rateLabel: string
  agentTurnUsd: number
  buildPageUsd: number
  quickFixUsd: number
}

export type ImageCapacity = {
  id: string
  name: string
  provider: 'replicate' | 'fal' | 'google'
  tagline: string
  chargeUsd: number
  logo: string
  logoMono: boolean
}

export type PoolCapacity = {
  poolUsd: number
  label: string
  /** Estimates on DeepSeek Flash — cheapest Everyday model. */
  flashAgentTurns: number
  flashBuildPages: number
  flashQuickFixes: number
  flashOutputTokens: string
  /** Still images bill from the same Everyday pool (default Flux 2 Max). */
  fluxMaxImages: number
  fluxSchnellImages: number
}

export type PlanCapacity = {
  planId: PaidPlanId
  planName: string
  everyday: PoolCapacity
  additional?: PoolCapacity
}

function fmtRate(v: { inputPerM: number; outputPerM: number }) {
  return `$${v.inputPerM} in · $${v.outputPerM} out / 1M tokens`
}

function turnUsd(modelId: string, turn: { promptTokens: number; completionTokens: number }) {
  const model = modelById(modelId)
  const vendor = vendorForModel(model)
  if (!vendor) return 0.001
  return vendorTotal(turn.promptTokens, turn.completionTokens, vendor)
}

export function modelCapacity(modelId: string, tagline: string): ModelCapacity {
  const model = modelById(modelId)
  const guide = modelGuide(model)
  const vendor = vendorForModel(model)
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    tagline,
    contextLabel: guide.context,
    outputLabel: guide.output,
    rateLabel: vendor ? fmtRate(vendor) : 'Included routing',
    agentTurnUsd: turnUsd(modelId, TYPICAL_AGENT_TURN),
    buildPageUsd: turnUsd(modelId, BUILD_PAGE_TURN),
    quickFixUsd: turnUsd(modelId, QUICK_FIX_TURN),
  }
}

export function everydayModelCapacities() {
  return EVERYDAY_MODEL_ROWS.map((row) => modelCapacity(row.id, row.tagline))
}

export function additionalModelCapacities() {
  return ADDITIONAL_MODEL_ROWS.map((row) => modelCapacity(row.id, row.tagline))
}

const IMAGE_LOGO: Record<ImageCapacity['provider'], { src: string; mono: boolean }> = {
  replicate: { src: '/logos/nvidia.svg', mono: true },
  fal: { src: '/logos/meta.svg', mono: true },
  google: { src: '/logos/google-g.svg', mono: false },
}

export function imageModelCapacities(): ImageCapacity[] {
  return IMAGE_MODELS.map((model) => {
    const provider = model.provider as ImageCapacity['provider']
    const logo = IMAGE_LOGO[provider] || IMAGE_LOGO.replicate
    return {
      id: model.id,
      name: model.name,
      provider,
      tagline: model.strength,
      chargeUsd: imageChargeUsd(model.id),
      logo: logo.src,
      logoMono: logo.mono,
    }
  })
}

export function imagesInPool(poolUsd: number, modelId: string) {
  const charge = imageChargeUsd(modelId)
  if (charge <= 0) return 0
  return Math.max(0, Math.floor(poolUsd / charge))
}

function poolCapacity(poolUsd: number, label: string): PoolCapacity {
  const flash = modelCapacity('deepseek-v4-flash', '')
  const agentTurns = Math.max(1, Math.floor(poolUsd / flash.agentTurnUsd))
  const buildPages = Math.max(1, Math.floor(poolUsd / flash.buildPageUsd))
  const quickFixes = Math.max(1, Math.floor(poolUsd / flash.quickFixUsd))
  const outputTok = agentTurns * TYPICAL_AGENT_TURN.completionTokens
  return {
    poolUsd,
    label,
    flashAgentTurns: agentTurns,
    flashBuildPages: buildPages,
    flashQuickFixes: quickFixes,
    flashOutputTokens: formatTokenMillions(outputTok),
    fluxMaxImages: imagesInPool(poolUsd, 'black-forest-labs/flux-2-max'),
    fluxSchnellImages: imagesInPool(poolUsd, 'fal-ai/flux/schnell'),
  }
}

export function formatTokenMillions(n: number) {
  if (n >= 1_000_000) return `~${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M output tokens`
  if (n >= 1_000) return `~${Math.round(n / 1000)}K output tokens`
  return `~${n} output tokens`
}

export function poolOutputTokenCount(pool: PoolCapacity) {
  return pool.flashAgentTurns * TYPICAL_AGENT_TURN.completionTokens
}

export function formatTotalTokens(pools: PoolCapacity[]) {
  const total = pools.reduce((sum, pool) => sum + poolOutputTokenCount(pool), 0)
  if (total >= 1_000_000) return `~${(total / 1_000_000).toFixed(1).replace(/\.0$/, '')}M tokens`
  if (total >= 1_000) return `~${Math.round(total / 1000)}K tokens`
  return `~${total} tokens`
}

export function formatCount(n: number) {
  if (n >= 10_000) return `~${Math.round(n / 1000)}K`
  if (n >= 1000) return `~${Math.round(n / 100) * 100}`
  return `~${n}`
}

export function turnsInPool(poolUsd: number, agentTurnUsd: number) {
  return Math.max(1, Math.floor(poolUsd / agentTurnUsd))
}

export const PLAN_CAPACITIES: PlanCapacity[] = [
  {
    planId: 'start',
    planName: 'Start',
    everyday: poolCapacity(poolDisplayUsd('start', 'cheap'), 'Everyday pool'),
  },
  {
    planId: 'pro',
    planName: 'Pro',
    everyday: poolCapacity(poolDisplayUsd('pro', 'cheap'), 'Everyday pool'),
    additional: poolCapacity(poolDisplayUsd('pro', 'premium'), 'Additional pool'),
  },
  {
    planId: 'pro_plus',
    planName: 'Pro Plus',
    everyday: poolCapacity(poolDisplayUsd('pro_plus', 'cheap'), 'Everyday pool'),
    additional: poolCapacity(poolDisplayUsd('pro_plus', 'premium'), 'Additional pool'),
  },
]
