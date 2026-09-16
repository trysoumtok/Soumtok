import { modelMedia } from './chatMedia.ts'
import { looksLikeStandaloneImageGen } from './requestAnalyze.ts'

export type ModelProvider = 'openrouter' | 'openai' | 'anthropic' | 'google' | 'deepseek' | 'xai'

export type CodingModel = {
  id: string
  name: string
  provider: ModelProvider
  strength: string
  cost: string
  keys: string
  tags?: string[]
}

export const MODEL_ALIASES: Record<string, string> = {
  'deepseek/deepseek-chat': 'deepseek-v4-flash',
  'deepseek/deepseek-reasoner': 'deepseek-reasoner',
  'openai/gpt-4.1-mini': 'gpt-4.1-mini',
  'anthropic/claude-haiku-4.5': 'claude-haiku-4-5-20251001',
  'composer-2-5': 'soumtok-agent',
  'soumtok-agent': 'deepseek-v4-flash',
}

/** Soumtok catalog id → provider API model id (DeepSeek, etc.). */
export const UPSTREAM_MODEL_IDS: Record<string, string> = {
  'deepseek-v4-flash': 'deepseek-flash',
  'deepseek-v4-pro': 'deepseek-v4-pro',
  'deepseek-v4-flash-vision-exp': 'deepseek-flash',
}

/** Soumtok coding: DeepSeek, OpenAI, Anthropic, Grok only (no Google AI Studio). */
export const DESKTOP_MODEL_PROVIDERS: ModelProvider[] = ['deepseek', 'openai', 'anthropic', 'xai']

export const SOUMTOK_CODING_PROVIDERS = DESKTOP_MODEL_PROVIDERS

/** Flagship picks pinned at the top of Test Hub model picker. */
export const TOP_HUB_MODEL_IDS = [
  'gpt-6-astra',
  'claude-opus-5',
  'gpt-5.3-codex',
  'claude-sonnet-5',
  'grok-4.6',
  'claude-sonnet-4-6',
  'deepseek-v4-flash',
  'gpt-4.1',
  'gpt-4.1-mini',
  'claude-haiku-4-5-20251001',
] as const

const HUB_COST_RANK: Record<string, number> = {
  Free: 0,
  Cheapest: 0,
  Cheap: 1,
  Low: 2,
  Mid: 4,
  Varies: 5,
  Higher: 6,
  High: 7,
  Highest: 8,
}

export function hubTierTagClass(cost?: string) {
  const c = String(cost || '').trim()
  if (/smart pick/i.test(c)) return 'tier-auto'
  if (/Highest|Higher/.test(c)) return 'tier-highest'
  if (/^High/.test(c)) return 'tier-high'
  if (/Mid|Varies/.test(c)) return 'tier-mid'
  if (/Free|Cheap|Cheapest|Low/.test(c)) return 'tier-value'
  return 'tier-neutral'
}

export function partitionHubPickerModels<T extends { id: string; cost?: string; name?: string }>(
  list: T[],
): { top: T[]; rest: T[] } {
  const byId = new Map(list.map((m) => [m.id, m]))
  const topSet = new Set<string>(TOP_HUB_MODEL_IDS)
  const top: T[] = []
  for (const id of TOP_HUB_MODEL_IDS) {
    const hit = byId.get(id)
    if (hit) top.push(hit)
  }
  const rest = [...list.filter((m) => !topSet.has(m.id))].sort((a, b) => {
    const cr = (HUB_COST_RANK[a.cost || ''] ?? 9) - (HUB_COST_RANK[b.cost || ''] ?? 9)
    if (cr !== 0) return cr
    return String(a.name || a.id).localeCompare(String(b.name || b.id))
  })
  return { top, rest }
}

export function soumtokCodingModels() {
  return CODING_MODELS.filter((model) => SOUMTOK_CODING_PROVIDERS.includes(model.provider))
}

const KEY_URL: Record<ModelProvider, string> = {
  openrouter: 'https://openrouter.ai/keys',
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  google: 'https://aistudio.google.com/apikey',
  deepseek: 'https://platform.deepseek.com/api_keys',
  xai: 'https://console.x.ai',
}

function coding(
  id: string,
  name: string,
  provider: ModelProvider,
  strength: string,
  cost: string,
  tags: string[] = [],
): CodingModel {
  return { id, name, provider, strength, cost, keys: KEY_URL[provider], tags }
}

export const PROVIDER_LABEL: Record<ModelProvider, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Claude',
  google: 'Google',
  deepseek: 'DeepSeek',
  xai: 'Grok',
}

export const CODING_MODELS: CodingModel[] = [
  coding('deepseek-chat', 'DeepSeek V4 Chat', 'deepseek', 'General chat and coding (V4 line).', 'Cheapest'),
  coding('deepseek-reasoner', 'DeepSeek V4 Reasoner', 'deepseek', 'Long thinking for hard problems.', 'Low'),
  coding('deepseek-coder', 'DeepSeek V4 Coder', 'deepseek', 'Code-focused V4 model.', 'Cheap'),
  coding('deepseek-v4-flash', 'DeepSeek V4.1 Flash', 'deepseek', 'Everyday coding. Fast and cheap.', 'Cheapest', ['New']),
  coding('deepseek-v4-pro', 'DeepSeek V4.1 Pro', 'deepseek', 'Harder refactors and bigger files.', 'Low', ['New']),
  coding('deepseek-v4-flash-vision-exp', 'DeepSeek V4.1 Flash Vision', 'deepseek', 'Code from screenshots and UI.', 'Low', ['New']),
  coding('claude-haiku-4-5-20251001', 'Claude Haiku 4.5', 'anthropic', 'Fast reviews and small edits.', 'Low'),
  coding('claude-sonnet-4-5-20250929', 'Claude Sonnet 4.5', 'anthropic', 'Solid day-to-day coding.', 'Mid'),
  coding('claude-sonnet-4-6', 'Claude Sonnet 4.6', 'anthropic', 'Solid day-to-day coding.', 'Mid'),
  coding('claude-sonnet-5', 'Claude Sonnet 5', 'anthropic', 'Strong general coding.', 'Mid', ['New']),
  coding('claude-opus-4-5-20251101', 'Claude Opus 4.5', 'anthropic', 'Hard bugs and architecture.', 'High'),
  coding('claude-opus-4-6', 'Claude Opus 4.6', 'anthropic', 'Hard bugs and architecture.', 'High'),
  coding('claude-opus-4-7', 'Claude Opus 4.7', 'anthropic', 'Hard bugs and architecture.', 'High'),
  coding('claude-opus-4-8', 'Claude Opus 4.8', 'anthropic', 'Hard bugs and architecture.', 'High'),
  coding('claude-opus-5', 'Claude Opus 5', 'anthropic', 'Hardest Claude coding work.', 'High', ['New']),
  coding('claude-fable-5', 'Claude Fable 5', 'anthropic', 'Long, careful writing and design.', 'Highest', ['New']),
  coding('claude-fable-5-1', 'Claude Fable 5.1', 'anthropic', 'Long, careful writing and design.', 'Highest', ['New']),
  coding('grok-build-0.1', 'Grok Build 0.1', 'xai', 'Repo work and pull requests.', 'Mid'),
  coding('grok-4.20-0309-non-reasoning', 'Grok 4.20 Fast', 'xai', 'Fast Grok with a huge context.', 'Mid'),
  coding('grok-4.20-0309-reasoning', 'Grok 4.20 Reasoning', 'xai', 'Hard bugs. Thinks longer.', 'Mid'),
  coding('grok-4.20-multi-agent-0309', 'Grok 4.20 Multi-agent', 'xai', 'Several agents debate the answer.', 'Mid', ['New']),
  coding('grok-4.3', 'Grok 4.3', 'xai', 'General Grok coding.', 'Mid'),
  coding('grok-4.5', 'Grok 4.5', 'xai', 'Newer Grok for coding.', 'Higher'),
  coding('grok-4.6', 'Grok 4.6', 'xai', 'Latest Grok for coding.', 'Higher', ['New']),
  coding('gpt-4.1-nano', 'GPT-4.1 Nano', 'openai', 'Tiny cheap snippets.', 'Cheap'),
  coding('gpt-4.1-mini', 'GPT-4.1 Mini', 'openai', 'Cheap everyday coding.', 'Cheap'),
  coding('gpt-4.1', 'GPT-4.1', 'openai', 'Reliable general coding.', 'Mid'),
  coding('gpt-4o-mini', 'GPT-4o Mini', 'openai', 'Cheap chat and light code.', 'Cheap'),
  coding('gpt-4o', 'GPT-4o', 'openai', 'Chat and code, including images in the prompt.', 'Mid'),
  coding('gpt-4-turbo', 'GPT-4 Turbo', 'openai', 'Older GPT coding.', 'Mid'),
  coding('gpt-4', 'GPT-4', 'openai', 'Older GPT coding.', 'Mid'),
  coding('gpt-3.5-turbo', 'GPT-3.5 Turbo', 'openai', 'Cheap simple snippets.', 'Cheap'),
  coding('chat-latest', 'Chat Latest', 'openai', 'OpenAI current chat alias.', 'Varies'),
  coding('gpt-5-mini', 'GPT-5 Mini', 'openai', 'Cheap GPT-5 coding.', 'Low'),
  coding('gpt-5', 'GPT-5', 'openai', 'General GPT-5 coding.', 'Mid'),
  coding('gpt-5-pro', 'GPT-5 Pro', 'openai', 'Harder GPT-5 jobs.', 'High'),
  coding('gpt-5.1', 'GPT-5.1', 'openai', 'Newer GPT-5 coding.', 'Mid'),
  coding('gpt-5.2', 'GPT-5.2', 'openai', 'Newer GPT-5 coding.', 'Mid'),
  coding('gpt-5.2-pro', 'GPT-5.2 Pro', 'openai', 'Harder GPT-5.2 jobs.', 'High'),
  coding('gpt-5.3-codex', 'GPT-5.3 Codex', 'openai', 'Agent-style coding across many files.', 'High', ['New']),
  coding('gpt-5.4-nano', 'GPT-5.4 Nano', 'openai', 'Cheap GPT-5.4 snippets.', 'Cheap'),
  coding('gpt-5.4-mini', 'GPT-5.4 Mini', 'openai', 'Cheap GPT-5.4 coding.', 'Low'),
  coding('gpt-5.4', 'GPT-5.4', 'openai', 'Newer GPT-5.4 coding.', 'Mid'),
  coding('gpt-5.4-pro', 'GPT-5.4 Pro', 'openai', 'Harder GPT-5.4 jobs.', 'High'),
  coding('gpt-5.5', 'GPT-5.5', 'openai', 'Newer GPT-5.5 coding.', 'Mid', ['New']),
  coding('gpt-5.5-pro', 'GPT-5.5 Pro', 'openai', 'Harder GPT-5.5 jobs.', 'High', ['New']),
  coding('gpt-5.6-luna', 'GPT-5.6 Luna', 'openai', 'Latest GPT-5.6 variant.', 'Mid', ['New']),
  coding('soumtok-agent', 'Soumtok Agent', 'deepseek', 'Default cheap-strong coding model (DeepSeek V4 Flash). Same harness as every other model.', 'Included', ['New']),
  coding('gpt-5.6-sol', 'GPT-5.6 Sol', 'openai', 'Latest GPT-5.6 variant.', 'Mid', ['New']),
  coding('gpt-5.6-terra', 'GPT-5.6 Terra', 'openai', 'Latest GPT-5.6 variant.', 'Mid', ['New']),
  coding('gpt-6-astra', 'GPT-6 Astra', 'openai', 'Strongest GPT. Long, hard jobs.', 'Highest', ['New']),
  coding('o4-mini', 'o4 Mini', 'openai', 'Cheap reasoning for tricky bugs.', 'Mid'),
  coding('o3-mini', 'o3 Mini', 'openai', 'Cheap reasoning for tricky bugs.', 'Mid'),
  coding('o3', 'o3', 'openai', 'Deep reasoning for hard bugs.', 'High'),
  coding('o1', 'o1', 'openai', 'Deep reasoning for hard bugs.', 'High'),
  coding('o1-pro', 'o1 Pro', 'openai', 'Slowest, strongest reasoning.', 'Highest'),
]

export const NATIVE_FALLBACK: Partial<Record<string, { provider: ModelProvider; model: string }>> = {
  'qwen/qwen3-coder': { provider: 'openrouter', model: 'qwen/qwen3-coder' },
}

export const KEY_PROVIDERS: {
  id: ModelProvider
  name: string
  hint: string
  keys: string
}[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    hint: 'One key for almost every model. Cheapest way to start.',
    keys: 'https://openrouter.ai/keys',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    hint: 'Direct DeepSeek billing. Very low code cost.',
    keys: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    hint: 'Official GPT keys. Add credit at platform.openai.com billing.',
    keys: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    hint: 'Official Claude keys.',
    keys: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'xai',
    name: 'xAI',
    hint: 'Official Grok keys.',
    keys: 'https://console.x.ai',
  },
]

export function resolveModelId(id: string) {
  return MODEL_ALIASES[id] || id
}

export function upstreamModelId(id: string) {
  const resolved = resolveModelId(id)
  return UPSTREAM_MODEL_IDS[resolved] || resolved
}

export function desktopCodingModels() {
  return soumtokCodingModels()
}

export function modelById(id: string) {
  const resolved = resolveModelId(id)
  return CODING_MODELS.find((model) => model.id === resolved) || CODING_MODELS[0]
}

export const TRIAL_MODEL_IDS = ['deepseek-v4-flash'] as const

export const TRIAL_MODEL_NAMES = 'DeepSeek V4.1 Flash'

export function isTrialModel(id: string) {
  const resolved = resolveModelId(id)
  return TRIAL_MODEL_IDS.includes(resolved as (typeof TRIAL_MODEL_IDS)[number])
}

export const AUTO_MODEL_ID = 'auto'

/** Everyday default: strongest cheap coding model Soumtok ships. */
export const SOUMTOK_DEFAULT_CODING_MODEL = 'deepseek-v4-flash'
/** Harder jobs still stay cheap — not Fable/Opus/Astra unless the user picks them. */
export const SOUMTOK_DEFAULT_HARD_CODING_MODEL = 'deepseek-v4-pro'

const COST_RANK: Record<string, number> = {
  Highest: 100,
  High: 80,
  Higher: 70,
  Mid: 50,
  Varies: 45,
  Low: 30,
  Cheap: 20,
  Cheapest: 12,
  Free: 5,
}

export function costRank(cost: string) {
  return COST_RANK[cost] ?? 40
}

/** Higher = more powerful / more premium. Used to sort the picker. */
export function modelPower(model: { id: string; name: string; cost: string }) {
  const hay = `${model.id} ${model.name}`.toLowerCase()
  let score = costRank(model.cost)
  if (/astra|fable|o1-pro/.test(hay)) score += 28
  if (/opus-5|gpt-6|codex/.test(hay)) score += 16
  if (/opus|gpt-5\.[4-9]-pro|o1\b|o3\b/.test(hay)) score += 10
  if (/sonnet-5|grok-4\.6|v4-pro|gpt-5\.[5-9]\b/.test(hay)) score += 5
  if (/flash-lite|nano|gemma|3\.5-turbo/.test(hay)) score -= 10
  return score
}

export function sortModelsByPower<T extends { id: string; name: string; cost: string }>(models: T[]) {
  return [...models].sort((a, b) => modelPower(b) - modelPower(a) || a.name.localeCompare(b.name))
}

export type AutoBudget = 'tight' | 'ok' | 'plenty'

export function autoBudget(plan?: string): AutoBudget {
  if (!plan || plan === 'hobby' || plan === 'trial') return 'tight'
  if (plan === 'pro') return 'ok'
  return 'plenty'
}

export function isAutoModel(id?: string | null) {
  return id === AUTO_MODEL_ID
}

function pickPreferred(
  pool: { id: string; name: string; cost: string }[],
  ids: string[],
) {
  for (const id of ids) {
    const hit = pool.find((item) => item.id === id)
    if (hit) return hit.id
  }
  const cheap = [...pool]
    .filter((item) => costRank(item.cost) <= 30)
    .sort((a, b) => costRank(a.cost) - costRank(b.cost) || a.id.localeCompare(b.id))
  return cheap[0]?.id || pool[pool.length - 1]?.id || SOUMTOK_DEFAULT_CODING_MODEL
}

export function pickAutoModel(input: {
  models: { id: string; name: string; cost: string; ready?: boolean }[]
  task?: string
  plan?: string
  hasFiles?: boolean
  hasImage?: boolean
  runMode?: 'agent' | 'ask' | 'plan'
  analysisKind?: string
  intelligence?: 'fast' | 'balanced' | 'max'
}) {
  const ranked = sortModelsByPower(
    input.models.filter((item) => item.ready !== false && item.id !== AUTO_MODEL_ID),
  )
  if (!ranked.length) return modelById(SOUMTOK_DEFAULT_CODING_MODEL).id
  const cheap = ranked.filter((item) => costRank(item.cost) <= 30)
  const use = cheap.length ? cheap : ranked
  const text = (input.task || '').toLowerCase()
  const kind = input.analysisKind || ''
  const projectOverview =
    Boolean(input.hasFiles) &&
    /\b(what('s| is)|tell me|explain|describe).{0,48}(project|repo|codebase|workspace|this folder|app)\b/.test(
      text,
    )
  const chatty =
    !projectOverview &&
    (kind === 'chat' ||
      kind === 'question' ||
      input.runMode === 'ask' ||
      input.runMode === 'plan' ||
      /^(hi+|hey+|hello|thanks|thank you)[\s!.]*$/i.test(text.trim()))
  const hard =
    !chatty &&
    (kind === 'build' ||
      kind === 'theme' ||
      kind === 'edit' ||
      /\b(architect|refactor|debug|multi-?file|complex|hard bug)\b/.test(text) ||
      (Boolean(input.hasFiles) && input.runMode === 'agent' && /\b(add|fix|change|build|implement)\b/.test(text)))
  const vision =
    Boolean(input.hasImage) ||
    (!looksLikeStandaloneImageGen(text) && /\b(screenshot|mock|ui shot)\b/.test(text))
  const intel = input.intelligence || 'balanced'

  if (vision) {
    return pickPreferred(use, [
      'deepseek-v4-flash-vision-exp',
      'gpt-4o-mini',
      'claude-haiku-4-5-20251001',
      SOUMTOK_DEFAULT_CODING_MODEL,
    ])
  }
  if (chatty) {
    return pickPreferred(use, [
      SOUMTOK_DEFAULT_CODING_MODEL,
      'deepseek-chat',
      'gpt-4.1-mini',
      'gpt-4o-mini',
    ])
  }
  if (intel === 'fast') {
    return pickPreferred(use, [SOUMTOK_DEFAULT_CODING_MODEL, 'deepseek-chat', 'gpt-4.1-mini'])
  }
  if (intel === 'max' || hard) {
    return pickPreferred(use, [
      SOUMTOK_DEFAULT_HARD_CODING_MODEL,
      SOUMTOK_DEFAULT_CODING_MODEL,
      'deepseek-coder',
      'gpt-4.1-mini',
    ])
  }
  return pickPreferred(use, [SOUMTOK_DEFAULT_CODING_MODEL, SOUMTOK_DEFAULT_HARD_CODING_MODEL, 'gpt-4.1-mini'])
}

export type ModelGuide = {
  summary: string
  context: string
  output: string
  good: string[]
  bestFor: string
}

function tokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M tokens`
  return `${Math.round(n / 1000)}K tokens`
}

export function modelGuide(model: CodingModel): ModelGuide {
  const id = model.id.toLowerCase()
  const name = model.name.toLowerCase()
  const text = `${id} ${name} ${model.strength.toLowerCase()}`
  const vision = /vision|4o(?!-)|image/.test(text) || /deepseek-v4-flash/.test(id)
  const reasoning = /reason|o1|o3|o4|opus|think/.test(text)
  const agent = /codex|multi-agent|composer|agent/.test(text)
  const fast = /flash|mini|nano|haiku|lite|schnell/.test(text)
  const longform = /fable/.test(text)

  let context = 128_000
  if (/deepseek-v4-flash|deepseek-v4-pro/.test(id)) context = 1_000_000
  else if (/gpt-6|gpt-5\.6/.test(id)) context = 1_050_000
  else if (/grok-4\.6/.test(id)) context = 500_000
  else if (/gemini|gemma/.test(id) && /gemma/.test(id)) context = 128_000
  else if (/gemini/.test(id)) context = 1_000_000
  else if (/grok-4\.20|huge context/.test(text)) context = 2_000_000
  else if (/grok/.test(id)) context = 256_000
  else if (/claude/.test(id)) context = 200_000
  else if (/gpt-4\.1/.test(id)) context = 1_000_000
  else if (/gpt-4o|gpt-4-turbo/.test(id)) context = 128_000
  else if (/^gpt-4$/.test(id)) context = 32_000
  else if (/gpt-3\.5/.test(id)) context = 16_000
  else if (/gpt-5|gpt-6|codex/.test(id)) context = 400_000
  else if (/^o[134]/.test(id)) context = 200_000
  else if (/deepseek/.test(id)) context = 128_000

  let output = 16_000
  if (/deepseek-v4-flash|deepseek-v4-pro/.test(id)) output = 384_000
  else if (/gpt-6/.test(id)) output = 128_000
  else if (reasoning || agent || /pro|opus|fable/.test(id)) output = 64_000
  else if (fast) output = 8_000

  const good: string[] = []
  if (agent) {
    good.push('Runs like an agent across many files and a whole repo')
    good.push('Strong at turning a task into edits, tests, and a pull request')
  } else if (reasoning) {
    good.push('Takes longer and thinks through hard bugs before it edits')
    good.push('Best when the answer is not obvious from one file')
  } else if (vision) {
    good.push('Reads screenshots, mocks, and UI and turns them into code')
    good.push('Good when you paste an image instead of describing the layout')
  } else if (longform) {
    good.push('Keeps a careful voice across long design and writing work')
    good.push('Better for specs, docs, and product copy than raw speed')
  } else if (fast) {
    good.push('Answers quickly so small edits do not feel heavy')
    good.push('Good for tab-style completions and short reviews')
  } else {
    good.push('Balanced coding for everyday files and refactors')
    good.push('Holds more of the repo in context than a tiny flash model')
  }

  if (context >= 1_000_000) good.push('Huge context window — can see a large repo at once')
  else if (context >= 200_000) good.push('Wide context — whole modules and long threads stay in view')

  if (model.provider === 'deepseek') good.push('Strong value for everyday code without feeling slow')
  if (model.provider === 'anthropic' && /sonnet/.test(id)) good.push('Reliable default for reviews, diffs, and day-to-day coding')
  if (model.provider === 'google' && /gemma/.test(id)) good.push('Open weights — fine for simple snippets and learning')

  const bestFor = agent
    ? 'Cloud agents, multi-file jobs, and agent-style coding'
    : reasoning
      ? 'Hard bugs, architecture, and tasks that need a longer think'
      : vision
        ? 'Building or matching UI from screenshots'
        : longform
          ? 'Long writing, design notes, and careful product copy'
          : fast
            ? 'Small edits, fast reviews, and everyday coding'
            : 'General repo work and balanced coding sessions'

  return {
    summary: model.strength,
    context: tokens(context),
    output: tokens(output),
    good: [...new Set(good)].slice(0, 4),
    bestFor,
  }
}

export function usesResponsesApi(provider: ModelProvider, modelId: string) {
  if (provider === 'xai' && /multi-agent/i.test(modelId)) return true
  if (provider === 'openai' && /gpt-6|codex|(^|-)pro$|^o[134]|^gpt-5(?:-mini|-nano)?$/i.test(modelId)) {
    return true
  }
  return false
}

/** Claude Opus 4.7+ / Sonnet 5 / Opus 5 reject non-default temperature (Anthropic API). */
export function anthropicOmitsSamplingParams(modelId: string) {
  const id = (modelId.split('/').pop() || modelId).toLowerCase()
  if (/claude-opus-4-[789]|claude-opus-4-8\b/.test(id)) return true
  if (/claude-opus-5|claude-sonnet-5|claude-fable-5/.test(id)) return true
  if (/claude-mythos/.test(id)) return true
  return false
}

/** OpenAI models that reject non-default temperature (omit the param). */
export function openaiOmitsTemperature(modelId: string) {
  const id = (modelId.split('/').pop() || modelId).toLowerCase()
  if (/^gpt-5\.(5|6)-pro(?:-|$)/.test(id)) return false
  if (/^o[0-9]/.test(id)) return true
  if (usesResponsesApi('openai', modelId)) return true
  if (/^chat-latest/.test(id)) return true
  if (/^gpt-5\.(5|6)(?:-|$)/.test(id) && !/-pro$/.test(id)) return true
  if (/^gpt-5-nano$/.test(id)) return true
  return false
}

/** Chat Completions: OpenAI models reject `max_tokens` (use `max_completion_tokens`). */
export function usesMaxCompletionTokens(provider: ModelProvider, modelId: string) {
  const id = (modelId.split('/').pop() || modelId).toLowerCase()
  const onOpenAiChat =
    provider === 'openai' ||
    (provider === 'openrouter' && /^(openai\/|gpt-|o[0-9]|chatgpt-)/.test(modelId.toLowerCase()))
  if (!onOpenAiChat) return false
  if (provider === 'openai' && usesResponsesApi(provider, modelId)) return false
  return true
}

export const IMAGE_MODELS = [
  {
    id: 'black-forest-labs/flux-2-max',
    name: 'Flux 2 Max',
    provider: 'replicate',
    strength: 'Highest-quality still photographs. No video, no music.',
    cost: '~$0.06 / image',
  },
  {
    id: 'black-forest-labs/flux-2-pro',
    name: 'Flux 2 Pro',
    provider: 'replicate',
    strength: 'Stable production stills. No video, no music.',
    cost: '~$0.04 / image',
  },
  {
    id: 'google/imagen-4-ultra',
    name: 'Imagen 4 Ultra',
    provider: 'replicate',
    strength: 'Google photoreal stills when the backend is up.',
    cost: '~$0.08 / image',
  },
  {
    id: 'black-forest-labs/flux-1.1-pro',
    name: 'Flux 1.1 Pro',
    provider: 'replicate',
    strength: 'Older Flux stills. Kept for compatibility.',
    cost: '~$0.04 / image',
  },
  {
    id: 'fal-ai/flux/schnell',
    name: 'Flux Schnell',
    provider: 'fal',
    strength: 'Fast stills when only FAL_KEY is set.',
    cost: '~$0.003 / image',
  },
] as const

export type ImageModelId = (typeof IMAGE_MODELS)[number]['id']

export const IMAGE_MODEL = IMAGE_MODELS[0]

export function imageModelById(id: string) {
  return IMAGE_MODELS.find((model) => model.id === id) || IMAGE_MODEL
}

export function isImageModel(id: string) {
  return IMAGE_MODELS.some((model) => model.id === id)
}
