import { imageModelById, isImageModel } from './models.ts'
import { SOUMTOK_ON_DEMAND_USD_PER_M } from './modelPricing.ts'

/** Soumtok markup on platform image generation (30%). */
export const IMAGE_PLATFORM_MARKUP = 1.3

const IMAGE_VENDOR_USD: Record<string, number> = {
  'black-forest-labs/flux-2-max': 0.06,
  'black-forest-labs/flux-2-pro': 0.04,
  'google/imagen-4-ultra': 0.08,
  'black-forest-labs/flux-1.1-pro': 0.04,
  'fal-ai/flux/schnell': 0.003,
}

function parseCostUsd(cost: string | undefined, modelId: string) {
  if (IMAGE_VENDOR_USD[modelId] != null) return IMAGE_VENDOR_USD[modelId]
  const match = String(cost || '').match(/\$([0-9]+(?:\.[0-9]+)?)/)
  return match ? Number(match[1]) : 0.06
}

export function imageVendorUsd(modelId: string) {
  const model = imageModelById(modelId)
  return parseCostUsd(model.cost, model.id)
}

export function imageChargeUsd(modelId: string) {
  return Number((imageVendorUsd(modelId) * IMAGE_PLATFORM_MARKUP).toFixed(4))
}

/** Bill images as platform tokens at the on-demand rate ($2 / 1M tokens). */
export function imageChargeTokens(modelId: string) {
  const usd = imageChargeUsd(modelId)
  return Math.max(800, Math.round((usd / SOUMTOK_ON_DEMAND_USD_PER_M) * 1_000_000))
}

export function isImageUsageModel(modelId: string) {
  return isImageModel(modelId) || modelId.startsWith('image:')
}

export function usageRowKind(modelId: string, promptTokens: number, completionTokens: number) {
  if (isImageUsageModel(modelId) || (promptTokens === 0 && completionTokens >= 800)) return 'image'
  if (modelId === 'whisper-1') return 'voice'
  return 'coding'
}

export function usageRowCostUsd(
  modelId: string,
  tokens: number,
  billedTo: string,
  promptTokens = 0,
  completionTokens = 0,
) {
  if (billedTo === 'user') return 0
  const kind = usageRowKind(modelId, promptTokens, completionTokens)
  if (kind === 'image') return imageChargeUsd(modelId)
  return (tokens / 1_000_000) * SOUMTOK_ON_DEMAND_USD_PER_M
}
