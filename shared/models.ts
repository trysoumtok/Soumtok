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
  'google/gemini-2.5-flash': 'gemini-3.1-flash-lite',
  'google/gemini-2.5-pro': 'gemini-3.5-flash-lite',
  'deepseek/deepseek-chat': 'deepseek-v4-flash',
  'openai/gpt-4.1-mini': 'gpt-4.1-mini',
  'anthropic/claude-haiku-4.5': 'claude-haiku-4-5-20251001',
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
  coding('deepseek-v4-flash', 'DeepSeek V4 Flash', 'deepseek', 'Everyday coding. Fast and cheap.', 'Cheapest', ['New']),
  coding('deepseek-v4-pro', 'DeepSeek V4 Pro', 'deepseek', 'Harder refactors and bigger files.', 'Low', ['New']),
  coding('deepseek-v4-flash-vision-exp', 'DeepSeek V4 Flash Vision', 'deepseek', 'Code from screenshots and UI.', 'Low', ['New']),
  coding('gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite', 'google', 'Cheap Gemini for small edits.', 'Low'),
  coding('gemini-3.5-flash-lite', 'Gemini 3.5 Flash Lite', 'google', 'Cheap Gemini, a bit stronger.', 'Low'),
  coding('gemini-3.5-flash', 'Gemini 3.5 Flash', 'google', 'Balanced Gemini for repo edits.', 'Mid'),
  coding('gemini-3.6-flash', 'Gemini 3.6 Flash', 'google', 'Newer Gemini flash for coding.', 'Mid', ['New']),
  coding('gemini-3.7-flash', 'Gemini 3.7 Flash', 'google', 'Newer Gemini flash for coding.', 'Mid', ['New']),
  coding('gemini-3.8-flash', 'Gemini 3.8 Flash', 'google', 'Newest Gemini flash for coding.', 'Mid', ['New']),
  coding('gemini-3-flash-preview', 'Gemini 3 Flash Preview', 'google', 'Preview Gemini for coding.', 'Mid'),
  coding('gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview', 'google', 'Harder Gemini reasoning.', 'Higher'),
  coding('gemma-4-31b-it', 'Gemma 4 31B', 'google', 'Free open model for simple code.', 'Free', ['New']),
  coding('gemma-4-26b-a4b-it', 'Gemma 4 26B', 'google', 'Free open model for simple code.', 'Free', ['New']),
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
  coding('gpt-5-nano', 'GPT-5 Nano', 'openai', 'Cheap GPT-5 snippets.', 'Cheap'),
  coding('gpt-5-mini', 'GPT-5 Mini', 'openai', 'Cheap GPT-5 coding.', 'Low'),
  coding('gpt-5', 'GPT-5', 'openai', 'General GPT-5 coding.', 'Mid'),
  coding('gpt-5-pro', 'GPT-5 Pro', 'openai', 'Harder GPT-5 jobs.', 'High'),
  coding('gpt-5.1', 'GPT-5.1', 'openai', 'Newer GPT-5 coding.', 'Mid'),
  coding('gpt-5.2', 'GPT-5.2', 'openai', 'Newer GPT-5 coding.', 'Mid'),
  coding('gpt-5.2-pro', 'GPT-5.2 Pro', 'openai', 'Harder GPT-5.2 jobs.', 'High'),
  coding('gpt-5.3-codex', 'Codex', 'openai', 'Agent-style coding across many files.', 'High', ['New']),
  coding('gpt-5.4-nano', 'GPT-5.4 Nano', 'openai', 'Cheap GPT-5.4 snippets.', 'Cheap'),
  coding('gpt-5.4-mini', 'GPT-5.4 Mini', 'openai', 'Cheap GPT-5.4 coding.', 'Low'),
  coding('gpt-5.4', 'GPT-5.4', 'openai', 'Newer GPT-5.4 coding.', 'Mid'),
  coding('gpt-5.4-pro', 'GPT-5.4 Pro', 'openai', 'Harder GPT-5.4 jobs.', 'High'),
  coding('gpt-5.5', 'GPT-5.5', 'openai', 'Newer GPT-5.5 coding.', 'Mid', ['New']),
  coding('gpt-5.5-pro', 'GPT-5.5 Pro', 'openai', 'Harder GPT-5.5 jobs.', 'High', ['New']),
  coding('gpt-5.6-luna', 'GPT-5.6 Luna', 'openai', 'Latest GPT-5.6 variant.', 'Mid', ['New']),
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
    id: 'google',
    name: 'Google AI',
    hint: 'Gemini API key from AI Studio. Use 3.x models, not 2.5.',
    keys: 'https://aistudio.google.com/apikey',
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

export function modelById(id: string) {
  const resolved = resolveModelId(id)
  return CODING_MODELS.find((model) => model.id === resolved) || CODING_MODELS[0]
}

export const TRIAL_MODEL_IDS = ['deepseek-v4-flash', 'gemma-4-31b-it'] as const

export const TRIAL_MODEL_NAMES = 'DeepSeek V4 Flash and Gemma 4'

export function isTrialModel(id: string) {
  const resolved = resolveModelId(id)
  return TRIAL_MODEL_IDS.includes(resolved as (typeof TRIAL_MODEL_IDS)[number])
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
  const vision = /vision|4o(?!-)|image/.test(text)
  const reasoning = /reason|o1|o3|o4|opus|think/.test(text)
  const agent = /codex|multi-agent|composer|agent/.test(text)
  const fast = /flash|mini|nano|haiku|lite|schnell/.test(text)
  const longform = /fable/.test(text)

  let context = 128_000
  if (/gemini|gemma/.test(id) && /gemma/.test(id)) context = 128_000
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
  if (reasoning || agent || /pro|opus|fable|gpt-6/.test(id)) output = 64_000
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

export const IMAGE_MODELS = [
  {
    id: 'fal-ai/flux/schnell',
    name: 'Flux Schnell',
    provider: 'fal',
    strength: 'The cheap still-photo model. No video, no music.',
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
