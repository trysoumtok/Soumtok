/** Desktop model catalog — loaded in renderer (global) and main (require). */
;(function (root, factory) {
  const catalog = factory()
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = catalog
  } else {
    root.SOUMTOK_MODEL_CATALOG = catalog
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function modelCatalogFactory() {
  /** Flagship picks pinned at the top of Test Hub model picker. */
  const TOP_HUB_MODEL_IDS = [
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
  ]

  /** Best value-first picks (DeepSeek / cheap OpenAI) for new users. */
  const RECOMMENDED_MODEL_IDS = [
    'deepseek-v4-flash',
    'deepseek-chat',
    'deepseek-coder',
    'gpt-4.1-mini',
    'gpt-4o-mini',
    'deepseek-v4-pro',
    'deepseek-reasoner',
    'claude-haiku-4-5-20251001',
    'gpt-4.1',
    'claude-sonnet-4-6',
    'gpt-5.3-codex',
    'claude-sonnet-5',
    'grok-4.6',
    'gpt-6-astra',
  ]

  const COST_RANK = {
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

  const PROVIDER_RANK = { deepseek: 0, openai: 1, anthropic: 2, xai: 3, openrouter: 4, google: 5 }

  const MODELS = [
    { id: 'gpt-6-astra', name: 'GPT-6 Astra', provider: 'openai', strength: 'Strongest GPT', cost: 'Highest', tags: ['New'] },
    { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', provider: 'openai', strength: 'Fast strong GPT', cost: 'Mid', tags: ['New'] },
    { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', provider: 'openai', strength: 'GPT-5.6 coding', cost: 'Mid', tags: ['New'] },
    { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', provider: 'openai', strength: 'GPT-5.6 coding', cost: 'Mid', tags: ['New'] },
    { id: 'gpt-5.5', name: 'GPT-5.5', provider: 'openai', strength: 'Newer GPT coding', cost: 'Mid', tags: ['New'] },
    { id: 'gpt-5.5-pro', name: 'GPT-5.5 Pro', provider: 'openai', strength: 'Harder GPT-5.5', cost: 'High', tags: ['New'] },
    { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', provider: 'openai', strength: 'Multi-file agent', cost: 'High', tags: ['New'] },
    { id: 'claude-opus-5', name: 'Claude Opus 5', provider: 'anthropic', strength: 'Hardest Claude work', cost: 'High', tags: ['New'] },
    { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'anthropic', strength: 'Strong coding', cost: 'Mid', tags: ['New'] },
    { id: 'claude-fable-5-1', name: 'Claude Fable 5.1', provider: 'anthropic', strength: 'Long careful work', cost: 'Highest', tags: ['New'] },
    { id: 'claude-fable-5', name: 'Claude Fable 5', provider: 'anthropic', strength: 'Long careful work', cost: 'Highest', tags: ['New'] },
    { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', provider: 'anthropic', strength: 'Hard bugs', cost: 'High', tags: ['New'] },
    { id: 'grok-4.6', name: 'Grok 4.6', provider: 'xai', strength: 'Latest Grok coding', cost: 'Higher', tags: ['New'] },
    { id: 'grok-4.20-multi-agent-0309', name: 'Grok 4.20 Multi-agent', provider: 'xai', strength: 'Multi-agent', cost: 'Mid', tags: ['New'] },
    { id: 'grok-4.5', name: 'Grok 4.5', provider: 'xai', strength: 'Newer Grok', cost: 'Higher', tags: ['New'] },
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4.1 Flash', provider: 'deepseek', strength: 'Everyday coding', cost: 'Cheapest', tags: ['New'] },
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4.1 Pro', provider: 'deepseek', strength: 'Harder refactors', cost: 'Low', tags: ['New'] },
    { id: 'deepseek-v4-flash-vision-exp', name: 'DeepSeek V4.1 Flash Vision', provider: 'deepseek', strength: 'Screenshots & UI', cost: 'Low', tags: ['New'] },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic', strength: 'Day-to-day coding', cost: 'Mid' },
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', provider: 'anthropic', strength: 'Solid coding', cost: 'Mid' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic', strength: 'Fast reviews', cost: 'Low' },
    { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', provider: 'anthropic', strength: 'Hard bugs', cost: 'High' },
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic', strength: 'Hard bugs', cost: 'High' },
    { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', provider: 'anthropic', strength: 'Architecture', cost: 'High' },
    { id: 'grok-4.20-0309-non-reasoning', name: 'Grok 4.20 Fast', provider: 'xai', strength: 'Fast Grok', cost: 'Mid' },
    { id: 'grok-4.20-0309-reasoning', name: 'Grok 4.20 Reasoning', provider: 'xai', strength: 'Hard bugs', cost: 'Mid' },
    { id: 'grok-4.3', name: 'Grok 4.3', provider: 'xai', strength: 'General Grok', cost: 'Mid' },
    { id: 'grok-build-0.1', name: 'Grok Build 0.1', provider: 'xai', strength: 'Repo & PRs', cost: 'Mid' },
    { id: 'deepseek-chat', name: 'DeepSeek V4 Chat', provider: 'deepseek', strength: 'General coding (V4)', cost: 'Cheapest' },
    { id: 'deepseek-reasoner', name: 'DeepSeek V4 Reasoner', provider: 'deepseek', strength: 'Long thinking', cost: 'Low' },
    { id: 'deepseek-coder', name: 'DeepSeek V4 Coder', provider: 'deepseek', strength: 'Code-focused V4', cost: 'Cheap' },
    { id: 'gpt-5.4', name: 'GPT-5.4', provider: 'openai', strength: 'GPT-5.4 coding', cost: 'Mid' },
    { id: 'gpt-5.4-pro', name: 'GPT-5.4 Pro', provider: 'openai', strength: 'Harder GPT-5.4', cost: 'High' },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', provider: 'openai', strength: 'Cheap GPT-5.4', cost: 'Low' },
    { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano', provider: 'openai', strength: 'Tiny snippets', cost: 'Cheap' },
    { id: 'gpt-5.2', name: 'GPT-5.2', provider: 'openai', strength: 'GPT-5.2 coding', cost: 'Mid' },
    { id: 'gpt-5.2-pro', name: 'GPT-5.2 Pro', provider: 'openai', strength: 'Harder GPT-5.2', cost: 'High' },
    { id: 'gpt-5', name: 'GPT-5', provider: 'openai', strength: 'General GPT-5', cost: 'Mid' },
    { id: 'gpt-5-pro', name: 'GPT-5 Pro', provider: 'openai', strength: 'Harder GPT-5', cost: 'High' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'openai', strength: 'Cheap GPT-5', cost: 'Low' },
    { id: 'gpt-5-nano', name: 'GPT-5 Nano', provider: 'openai', strength: 'Cheapest GPT-5', cost: 'Cheap' },
    { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai', strength: 'Reliable coding', cost: 'Mid' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', provider: 'openai', strength: 'Cheap everyday', cost: 'Cheap' },
    { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', provider: 'openai', strength: 'Tiny snippets', cost: 'Cheap' },
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', strength: 'Chat & code', cost: 'Mid' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', strength: 'Light code', cost: 'Cheap' },
    { id: 'o4-mini', name: 'o4 Mini', provider: 'openai', strength: 'Cheap reasoning', cost: 'Mid' },
    { id: 'o3-mini', name: 'o3 Mini', provider: 'openai', strength: 'Reasoning', cost: 'Mid' },
    { id: 'o3', name: 'o3', provider: 'openai', strength: 'Deep reasoning', cost: 'High' },
    { id: 'o1', name: 'o1', provider: 'openai', strength: 'Deep reasoning', cost: 'High' },
    { id: 'o1-pro', name: 'o1 Pro', provider: 'openai', strength: 'Strongest reasoning', cost: 'Highest' },
  ]

  const byId = new Map()
  for (const m of MODELS) {
    if (!byId.has(m.id)) byId.set(m.id, m)
  }
  const deduped = [...byId.values()]

  const recIndex = new Map(RECOMMENDED_MODEL_IDS.map((id, i) => [id, i]))

  function costRank(cost) {
    const key = String(cost || '').trim()
    return COST_RANK[key] ?? 9
  }

  function sortForDisplay(list) {
    return [...list].sort((a, b) => {
      const cr = costRank(a.cost) - costRank(b.cost)
      if (cr !== 0) return cr
      const pr =
        (PROVIDER_RANK[a.provider] ?? 9) - (PROVIDER_RANK[b.provider] ?? 9)
      if (pr !== 0) return pr
      const ar = recIndex.has(a.id) ? recIndex.get(a.id) : 500
      const br = recIndex.has(b.id) ? recIndex.get(b.id) : 500
      if (ar !== br) return ar - br
      const aNew = a.tags?.includes('New') ? 0 : 1
      const bNew = b.tags?.includes('New') ? 0 : 1
      if (aNew !== bNew) return aNew - bNew
      return String(a.name).localeCompare(String(b.name))
    })
  }

  function staticDesktopModels(ready = false) {
    return sortForDisplay(deduped).map((m) => ({ ...m, ready }))
  }

  function partitionHubPickerModels(list) {
    const byId = new Map(list.map((m) => [m.id, m]))
    const topSet = new Set(TOP_HUB_MODEL_IDS)
    const top = []
    for (const id of TOP_HUB_MODEL_IDS) {
      const hit = byId.get(id)
      if (hit) top.push(hit)
    }
    const rest = sortForDisplay(list.filter((m) => !topSet.has(m.id)))
    return { top, rest }
  }

  return {
    TOP_HUB_MODEL_IDS,
    RECOMMENDED_MODEL_IDS,
    MODELS: sortForDisplay(deduped),
    sortForDisplay,
    staticDesktopModels,
    partitionHubPickerModels,
  }
})
