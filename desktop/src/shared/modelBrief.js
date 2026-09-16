/** Full model study sheets for desktop renderer (mirrors shared/modelBrief.ts). */
;(function (root, factory) {
  const api = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.SoumtokModelBrief = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function modelBriefFactory() {
  const { resolveModelPricing, SOUMTOK_ON_DEMAND_USD_PER_M } =
    typeof SoumtokModelPricing !== 'undefined' ? SoumtokModelPricing : require('./modelPricing.js')
  const PROVIDER_LABEL = {
    deepseek: 'DeepSeek',
    openai: 'OpenAI',
    anthropic: 'Claude',
    google: 'Google',
    xai: 'Grok',
    openrouter: 'OpenRouter',
  }

  function tokens(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M tokens`
    return `${Math.round(n / 1000)}K tokens`
  }

  function parseTokenCount(label) {
    const m = String(label || '').match(/([\d.]+)\s*([MK])\s*tokens/i)
    if (!m) return 128000
    const n = Number(m[1])
    return m[2].toUpperCase() === 'M' ? n * 1_000_000 : n * 1000
  }

  function clamp(n, a = 8, b = 98) {
    return Math.max(a, Math.min(b, Math.round(n)))
  }

  function modelGuide(model) {
    const id = model.id.toLowerCase()
    const text = `${id} ${model.name} ${model.strength}`.toLowerCase()
    const vision = /vision|4o(?!-)|image/.test(text) || /deepseek-v4-flash/.test(id)
    const reasoning = /reason|o1|o3|o4|opus|think/.test(text)
    const agent = /codex|multi-agent|composer|agent/.test(text)
    const fast = /flash|mini|nano|haiku|lite|schnell/.test(text)
    const longform = /fable/.test(text)
    let context = 128000
    if (/deepseek-v4-flash|deepseek-v4-pro/.test(id)) context = 1_000_000
    else if (/gpt-6|gpt-5\.6/.test(id)) context = 1_050_000
    else if (/grok-4\.6/.test(id)) context = 500_000
    else if (/gemini/.test(id) && !/gemma/.test(id)) context = 1_000_000
    else if (/grok-4\.20|huge context/.test(text)) context = 2_000_000
    else if (/grok/.test(id)) context = 256000
    else if (/claude/.test(id)) context = 200000
    else if (/gpt-4\.1/.test(id)) context = 1_000_000
    else if (/gpt-5|gpt-6|codex/.test(id)) context = 400000
    else if (/deepseek/.test(id)) context = 128000
    let output = 16000
    if (/deepseek-v4-flash|deepseek-v4-pro/.test(id)) output = 384000
    else if (/gpt-6/.test(id)) output = 128000
    else if (reasoning || agent || /pro|opus|fable/.test(id)) output = 64000
    else if (fast) output = 8000
    const good = []
    if (agent) good.push('Runs like an agent across many files and a whole repo')
    else if (reasoning) good.push('Thinks through hard bugs before editing')
    else if (vision) good.push('Reads screenshots and UI mocks')
    else if (fast) good.push('Fast everyday coding and small edits')
    else good.push('Balanced coding for everyday files')
    if (model.provider === 'deepseek') good.push('Strong value for everyday code')
    const bestFor = agent
      ? 'Multi-file agent-style coding'
      : reasoning
        ? 'Hard bugs and architecture'
        : vision
          ? 'UI from screenshots'
          : fast
            ? 'Small edits and fast reviews'
            : 'General repo work'
    return { summary: model.strength, context: tokens(context), output: tokens(output), good: [...new Set(good)].slice(0, 4), bestFor }
  }

  function modelGeneration(model) {
    const hay = `${model.id} ${model.name}`.toLowerCase()
    if (/v4\.1|v4-flash|deepseek-flash|v4-pro/.test(hay)) return 'V4.1'
    if (/deepseek-chat|deepseek-coder|deepseek-reasoner/.test(hay)) return 'V4'
    if (/gpt-6/.test(hay)) return 'GPT-6'
    if (/gpt-5\.6/.test(hay)) return 'GPT-5.6'
    if (/gpt-4\.1/.test(hay)) return 'GPT-4.1'
    if (/claude-opus-5|claude-sonnet-5|claude-fable-5/.test(hay)) return 'Claude 5'
    if (/grok-4\.6/.test(hay)) return 'Grok 4.6'
    if (/grok-4\.20/.test(hay)) return 'Grok 4.20'
    return 'Current'
  }

  function modelLaunched(model) {
    if (/deepseek-v4-flash|deepseek-v4-pro/.test(model.id)) return 'DeepSeek V4.1 family · 2025'
    if (/deepseek-chat|deepseek-coder|deepseek-reasoner/.test(model.id)) return 'DeepSeek V4 line · 2024–2025'
    if (model.tags?.includes('New')) return `${modelGeneration(model)} · recently released`
    return `${modelGeneration(model)} · established release`
  }

  function traits(model) {
    const id = String(model.id || '').toLowerCase()
    const text = `${id} ${model.name} ${model.strength}`.toLowerCase()
    return {
      id,
    vision: /vision|4o(?!-)|image/.test(text) || /deepseek-v4-flash/.test(id),
      reasoning: /reason|o1|o3|o4|opus|think/.test(text),
      agent: /codex|multi-agent|composer|agent/.test(text),
      fast: /flash|mini|nano|haiku|lite|schnell/.test(text),
      longform: /fable/.test(text),
      pro: /pro|opus|gpt-6|astra/.test(text),
      v41: /v4\.1|v4-flash|v4-pro/.test(text),
      v4: /deepseek-chat|deepseek-coder|deepseek-reasoner/.test(id),
    }
  }

  function costScore(cost) {
    return { Included: 96, Cheapest: 94, Cheap: 86, Low: 78, Mid: 58, Varies: 52, Higher: 38, High: 28, Highest: 16 }[cost] ?? 50
  }

  function scoresFor(model, contextN, t) {
    const speed = t.fast ? 92 : t.reasoning || t.pro ? 48 : 72
    const quality = t.pro ? 94 : t.reasoning ? 88 : t.fast ? 70 : 80
    const reason = t.reasoning ? 93 : t.pro ? 86 : t.fast ? 52 : 68
    const ctx = clamp((Math.log10(Math.max(contextN, 8000)) - 4) * 45)
    return [
      { label: 'Speed / latency', value: speed, note: t.fast ? 'Built to answer in a short turn.' : 'Balanced or longer think.' },
      { label: 'Code quality', value: quality, note: t.pro ? 'Premium edits.' : 'Solid everyday code.' },
      { label: 'Reasoning depth', value: reason, note: t.reasoning ? 'Hard bugs.' : 'Enough for typical files.' },
      { label: 'Context reach', value: ctx, note: `${tokens(contextN)} in one window.` },
      { label: 'Cost efficiency', value: costScore(model.cost), note: 'Relative API cost vs siblings.' },
      { label: 'Vision / UI', value: t.vision ? 90 : 12, note: t.vision ? 'Reads screenshots.' : 'Text-first.' },
      { label: 'Multi-file / agent', value: t.agent ? 92 : t.pro ? 74 : t.fast ? 40 : 58, note: 'Repo-wide vs focused files.' },
      { label: 'Everyday fit', value: model.provider === 'deepseek' && t.v41 ? 88 : 82, note: 'How often this is the right default.' },
    ]
  }

  function catalogModels() {
    return (typeof window !== 'undefined' && window.SOUMTOK_MODEL_CATALOG && window.SOUMTOK_MODEL_CATALOG.MODELS) || []
  }

  function familyOf(model) {
    return catalogModels()
      .filter((m) => m.provider === model.provider && m.id !== 'soumtok-agent')
      .slice(0, 8)
      .map((m) => ({ name: m.name, role: m.strength || m.cost, cost: m.cost }))
  }

  function comparisonTable(model) {
    const pool = catalogModels().filter((m) => m.provider === model.provider && m.id !== 'soumtok-agent')
    const near = pool.sort((a, b) => (a.id === model.id ? -1 : b.id === model.id ? 1 : 0)).slice(0, 6)
    return {
      headers: ['Model', 'Generation', 'Cost', 'Best for', 'Vision'],
      rows: near.map((m) => {
        const t = traits(m)
        const g = modelGuide(m)
        return [m.name, modelGeneration(m), m.cost, g.bestFor, t.vision ? 'Yes' : 'Text']
      }),
    }
  }

  function workloads(model, t) {
    return [
      { task: 'Small edit / typo / rename', fit: t.fast ? 'Excellent' : 'Good', score: t.fast ? 90 : 55, note: 'Lowest-friction flash/mini job.' },
      { task: 'Single-file feature', fit: t.fast || !t.pro ? 'Excellent' : 'Good', score: t.fast ? 88 : 76, note: 'Ask for runnable HTML/CSS/JS files.' },
      { task: 'Multi-file refactor', fit: t.pro || t.agent ? 'Excellent' : 'Fair', score: t.agent || t.pro ? 86 : t.fast ? 42 : 70, note: t.fast ? 'Step up to Pro / Opus.' : 'Keep files in context.' },
      { task: 'Hard bug / architecture', fit: t.reasoning || t.pro ? 'Excellent' : 'Fair', score: t.pro || t.reasoning ? 90 : 45, note: 'Pay for thinking time.' },
      { task: 'Screenshot → UI', fit: t.vision ? 'Excellent' : 'Poor', score: t.vision ? 92 : 30, note: t.vision ? 'Attach the image.' : 'Switch to a vision variant.' },
      { task: 'Long thread / huge repo', fit: /grok|gpt-4\.1/.test(t.id) ? 'Excellent' : 'Good', score: /grok/.test(t.id) ? 94 : t.fast ? 50 : 72, note: 'Context is the limiter.' },
      { task: 'Docs and product copy', fit: t.longform ? 'Excellent' : 'Good', score: t.longform ? 94 : 64, note: t.longform ? 'Fable class.' : 'Fine for READMEs.' },
      { task: 'Lowest API spend', fit: model.cost === 'Cheapest' || model.cost === 'Included' ? 'Excellent' : 'Poor', score: costScore(model.cost), note: 'Cheapest per-token list price in its class.' },
    ]
  }

  function whenToPick(model, t) {
    if (t.v41 && /flash/.test(t.id) && !/vision/.test(t.id)) {
      return ['Default daily driver for cheap, fast coding', 'UI builds and quick fixes', 'Lowest DeepSeek API cost in V4.1', 'Screenshots on the Flash line']
    }
    if (/deepseek-v4-pro/.test(t.id)) return ['Multi-file refactors', 'Harder logic without Opus / GPT-6']
    if (t.v4) return ['You explicitly want DeepSeek V4 (not V4.1)']
    if (t.vision) return ['Screenshots, mocks, or UI images']
    if (t.fast) return ['Tiny edits', 'Fast reviews', 'Lowest spend']
    return ['Balanced coding session', 'When this provider fits your stack']
  }

  function whenToSkip(model, t) {
    if (t.v41 && /flash/.test(t.id) && !/pro/.test(t.id)) return ['Huge architecture rewrites — try V4.1 Pro or Opus', 'Repo-wide 1M+ context jobs — try Grok / GPT-4.1']
    if (t.v4) return ['You need V4.1 — pick DeepSeek V4.1 Flash']
    if (t.fast) return ['Complex multi-file agent work']
    if (/opus|gpt-6|fable/.test(t.id)) return ['Simple one-line fixes — use Flash / Mini / Haiku']
    return ['Task needs vision but this row is text-only']
  }

  function soumtokNotes() {
    return []
  }

  function chaptersFor(model, guide, t, contextN, outputN, pricing) {
    const name = model.name
    const gen = modelGeneration(model)
    const v41Explain = t.v41
      ? `${name} is the V4.1 generation — written in full so it never collides with DeepSeek V4 Chat, V4 Coder, or V4 Reasoner. API id: deepseek-flash.`
      : t.v4
        ? `${name} belongs to the DeepSeek V4 line. It is not V4.1. For the daily driver use DeepSeek V4.1 Flash.`
        : `${name} is filed under ${gen} in ${PROVIDER_LABEL[model.provider] || model.provider}'s lineup.`
    return [
      {
        n: '01',
        title: 'What this model is',
        kicker: 'Identity',
        paragraphs: [
          `${name} is a ${PROVIDER_LABEL[model.provider] || model.provider} model. ${model.strength} API id: ${model.id}.`,
          v41Explain,
          `${name} is a direct chat model — it only sees the prompt and files you attach. No hidden repo access unless your client adds tools.`,
          `Best fit: ${guide.bestFor}. Stretch jobs are graded later in this study.`,
        ],
      },
      {
        n: '02',
        title: 'Launch, generation, and naming',
        kicker: 'History',
        paragraphs: [
          `Released: ${modelLaunched(model)}. Generation: ${gen}. Tags: ${(model.tags || []).join(', ') || 'none'}.`,
          model.provider === 'deepseek'
            ? 'DeepSeek moved from V4 (chat/coder/reasoner) into V4.1 (flash/pro/vision). Both generations remain available.'
            : `Provider: ${PROVIDER_LABEL[model.provider] || model.provider}. API keys live at the vendor console.`,
          `API id \`${model.id}\` may map upstream (V4.1 Flash → deepseek-flash). Check provider docs for the exact string.`,
          model.tags?.includes('New') ? 'Tagged New — recent release. Treat grades as working guidance.' : 'Stable model id. Live checkpoints can still move.',
        ],
      },
      {
        n: '03',
        title: 'Architecture and operating envelope',
        kicker: 'Specs',
        paragraphs: [
          `Context window: ${guide.context}. Max output: ${guide.output}. Numeric envelope in this study: ${tokens(contextN)} in, ${tokens(outputN)} out.`,
          t.vision
            ? `${name} is multimodal. Attach a screenshot and it can read layout and UI chrome.`
            : `${name} is text-first. Use a vision sibling for screenshots.`,
          t.reasoning
            ? 'Reasoning models spend tokens thinking. Slower, more expensive, better on mystery bugs.'
            : t.fast
              ? 'This is a fast model. Assign small edits and UI slices — not a 40-file rewrite.'
              : 'Balanced operating point: not the cheapest flash, not the slowest reasoner.',
        ],
        bullets: guide.good,
      },
      {
        n: '04',
        title: 'Benchmarks — working profile',
        kicker: 'Evaluation',
        paragraphs: [
          'The bars are a builder grade: speed, quality, reasoning, context, cost, vision, multi-file, and how often we would pick this id. Not a pasted vendor leaderboard.',
          t.v41
            ? 'DeepSeek V4.1 Flash profiles as a daily driver: high speed, high cost efficiency, single-file quality, 128K context, vision on the Flash line.'
            : `Read the chart as a profile. High cost-efficiency plus low reasoning means use it a lot, but not for the mystery bug.`,
          'Snippet exams follow speed + quality. Repo exams follow context + multi-file + reasoning. Re-run the same prompt on two models to compare.',
        ],
        bullets: [`Relative cost: ${model.cost}`, `Context / output: ${guide.context} · ${guide.output}`, t.vision ? 'Vision capable.' : 'Text-only.'],
      },
      {
        n: '05',
        title: 'Family and how it compares',
        kicker: 'Lineup',
        paragraphs: [
          `Every ${PROVIDER_LABEL[model.provider] || model.provider} row is a different exam. Use the comparison table to step cheaper or stronger.`,
          t.v41
            ? 'DeepSeek map: V4 Chat/Coder/Reasoner = V4. V4.1 Flash = cheap-fast daily coding. V4.1 Pro = harder refactors. Flash Vision = UI images.'
            : 'Stay on this provider if you like the voice; change cost tier when the job changes.',
          'If the same prompt fails twice, change model class — not adjectives.',
        ],
      },
      {
        n: '06',
        title: 'Workload classroom',
        kicker: 'What to assign',
        paragraphs: [
          'Each workload row is an assignment type. Excellent is the intended homework. Poor means the wrong room.',
          t.fast
            ? 'Flash homework: calculators, CSS tweaks, explain-this-function. Not homework: redesign auth across twelve packages.'
            : 'Check the table. Do not spend High/Highest credits renaming a button.',
          'For UI tasks, ask for runnable html/css/js files. A markdown essay is a failed lab.',
        ],
      },
      {
        n: '07',
        title: 'When to pick · when to skip',
        kicker: 'Decision',
        paragraphs: [
          `Pick ${name} when the job matches ${String(guide.bestFor).toLowerCase()}. Skip when a sibling’s bar is obviously higher.`,
          'Switch models when the job changes — this study helps you choose the right one.',
        ],
        bullets: [...whenToPick(model, t).map((x) => `Pick: ${x}`), ...whenToSkip(model, t).map((x) => `Skip: ${x}`)],
      },
      {
        n: '08',
        title: 'API pricing',
        kicker: 'Vendor',
        paragraphs: [
          pricing.vendor
            ? `${name} bills at ${pricing.vendorLine} Input and output tokens are priced separately.`
            : `${name} has no separate public vendor list price in this catalog row.`,
          pricing.vendor ? 'Output-heavy coding turns usually dominate the bill.' : '',
        ].filter(Boolean),
        bullets: pricing.vendor
          ? ['List price is set by the provider', 'Compare siblings before paying flagship rates for a flash job']
          : undefined,
      },
      {
        n: '09',
        title: 'Model id and access',
        kicker: 'Routing',
        paragraphs: [
          `Catalog id: \`${model.id}\`. Upstream APIs may expose a different model string.`,
          'Direct chat sends only your prompt and attachments — no silent repo scan.',
          `Provider: ${PROVIDER_LABEL[model.provider] || model.provider}. API keys live at the vendor console.`,
        ],
      },
      {
        n: '10',
        title: 'Prompting this model well',
        kicker: 'Practice',
        paragraphs: [
          'Lead with the artifact: “Build a responsive calculator in index.html + CSS + JS.” Fast models follow concrete files better than vibes.',
          'Attach instead of describing — if this id has vision. Otherwise paste the HTML.',
          'Bound the blast radius: “Only change the CSS.” Ask for separate files with clear paths.',
          'One exam per turn. Then open this study on the next model if the exam was wrong.',
        ],
      },
      {
        n: '11',
        title: 'Limits, safety, and honest gaps',
        kicker: 'Constraints',
        paragraphs: [
          'Working grades here are not vendor benchmark cards. Checkpoints move.',
          'Context is not infinite memory. Paste what matters.',
          'Flash output caps cut off giant single dumps — prefer multiple files.',
          'Never send secrets in prompts. API calls hit the provider’s servers.',
          `${name} will still be wrong sometimes. This class puts you in the right room.`,
        ],
      },
    ]
  }

  function timelineFor(model, t) {
    if (t.v41) {
      return [
        { when: '2024', title: 'DeepSeek V4 line', body: 'Chat, Coder, and Reasoner ship as V4 — separate from the V4.1 line.' },
        { when: '2025', title: 'DeepSeek V4.1 family', body: 'Flash, Pro, and Flash Vision. Flash is the everyday default.' },
        { when: '2025', title: 'Pro and Vision', body: 'Pro handles harder refactors; Flash Vision adds image input.' },
        { when: 'Now', title: 'Where it sits', body: 'V4.1 Flash is the cheap, fast, multimodal daily driver. Pro is the step up.' },
      ]
    }
    if (t.v4) {
      return [
        { when: '2024', title: 'DeepSeek V4 ships', body: 'Chat, Coder, Reasoner — generation V4, not V4.1.' },
        { when: 'Now', title: 'When to use V4', body: 'Pick V4 on purpose. For daily coding, V4.1 Flash is the modern default.' },
      ]
    }
    if (model.provider === 'openai') {
      return [
        { when: '2024', title: 'GPT-4o / 4.1 era', body: '4o brings chat + images. 4.1 stretches context toward a million tokens.' },
        { when: '2025', title: 'GPT-5 family', body: 'Mini through Pro and Codex cover cheap snippets to multi-file work.' },
        { when: '2025–2026', title: 'GPT-5.6 / GPT-6', body: 'Luna, Sol, Terra, and Astra are OpenAI’s frontier models.' },
        { when: 'Now', title: 'Where it sits', body: `${model.name} — ${model.strength}` },
      ]
    }
    return [
      { when: modelLaunched(model), title: 'Release', body: `${model.name} — ${model.strength}` },
      { when: 'Now', title: 'Best for', body: modelGuide(model).bestFor },
    ]
  }

  function classroom(model, t) {
    return [
      { title: 'Lab 1 — Baseline output', body: `Prompt ${model.name} for a small UI (calculator or timer). Grade whether you get runnable HTML/CSS/JS.` },
      {
        title: 'Lab 2 — Same prompt, sibling',
        body: t.v41
          ? 'Re-run on DeepSeek V4 Chat, then V4.1 Pro. Feel Flash as the fast default.'
          : 'Re-run on a cheaper sibling and a stronger sibling. Freeze the prompt.',
      },
      {
        title: 'Lab 3 — Attachments',
        body: t.vision ? 'Attach a UI screenshot and ask for matching HTML/CSS.' : 'Attach a source file for review, then try a vision sibling with an image.',
      },
      { title: 'Lab 4 — Bound the blast radius', body: 'Give html/css/js and say “only change the CSS.” A well-behaved flash model touches one file.' },
    ]
  }

  function faq(model, t) {
    return [
      {
        q: `Is ${model.name} the same as DeepSeek V4 Flash?`,
        a: t.v41
          ? 'No. The full name is DeepSeek V4.1 Flash. V4 is Chat/Coder/Reasoner. Labels that dropped “.1” were wrong.'
          : t.v4
            ? 'This row is DeepSeek V4, not V4.1.'
            : `This row is ${model.name}.`,
      },
      { q: 'Does this model support images?', a: t.vision ? 'Yes — include screenshots in the prompt.' : 'No — text-only. Use a vision sibling.' },
      { q: 'Why did I get markdown instead of code?', a: 'Ask again for separate runnable files (html/css/js with paths).' },
      { q: 'Can I save this as a PDF?', a: 'Yes — use Download PDF in the toolbar.' },
      { q: 'Are the charts official vendor scores?', a: 'No. Working grades for picking the right model class.' },
    ]
  }

  function glossary() {
    return [
      { term: 'API id', def: 'The model string passed to the provider API. May differ from the marketing name.' },
      { term: 'Generation', def: 'Family version in full (V4 vs V4.1).' },
      { term: 'Context window', def: 'How much prompt + history + files the model can see.' },
      { term: 'Max output', def: 'How long a single completion can be.' },
      { term: 'List price', def: 'Vendor charge per million input/output tokens.' },
      { term: 'Vision', def: 'The model can read attached images.' },
    ]
  }

  function img(file, caption, credit) {
    return { file, caption, credit }
  }

  function openaiGallery(model) {
    const id = String(model.id || '').toLowerCase()
    if (/o3-mini|o4-mini|^o3$|o3-pro|o1|o4-mini/.test(id)) {
      return [
        img('openai-o3-mini-hero.png', 'OpenAI o3-mini — official announcement art.', 'OpenAI · openai.com/index/openai-o3-mini/'),
        img('openai-o3-o4-hero.png', 'OpenAI o3 and o4-mini — tool use and visual reasoning.', 'OpenAI · openai.com/index/introducing-o3-and-o4-mini/'),
        img('openai-o3-mini-docs.png', 'OpenAI API docs card for o3-mini.', 'OpenAI · developers.openai.com'),
      ]
    }
    if (/gpt-5\.6|gpt-6|astra/.test(id)) {
      return [
        img('openai-gpt56-hero.png', 'GPT-5.6 / ChatGPT work — official blog art.', 'OpenAI · openai.com/index/gpt-5-6/'),
        img('openai-o3-o4-hero.png', 'OpenAI o-series reasoning lineage.', 'OpenAI · openai.com/index/introducing-o3-and-o4-mini/'),
      ]
    }
    return [
      img('openai-gpt56-hero.png', `OpenAI frontier coding — ${model.name}.`, 'OpenAI · openai.com/index/gpt-5-6/'),
      img('openai-o3-mini-docs.png', 'OpenAI API model documentation card.', 'OpenAI · developers.openai.com'),
    ]
  }

  function claudeGallery(model) {
    const opus = /opus|fable/.test(model.id)
    return [
      img('anthropic-opus45-hero.jpg', opus ? `${model.name} — Anthropic announcement hero.` : 'Anthropic Claude family hero.', 'Anthropic · anthropic.com/news/claude-opus-4-5'),
      img('anthropic-opus45-chart.png', 'Evaluation charts from Claude Opus 4.5 announcement.', 'Anthropic · anthropic.com/news/claude-opus-4-5'),
      ...(opus ? [img('anthropic-opus45-safety.png', 'Safety charts from Claude Opus 4.5 announcement.', 'Anthropic · anthropic.com/news/claude-opus-4-5')] : []),
    ]
  }

  function grokGallery(model) {
    return [
      img('xai-grok-hero.webp', `${model.name} — xAI Grok official art.`, 'xAI · x.ai/news/grok-4'),
      img('dsv41-agentic.png', 'Public agentic benchmark plate for cross-vendor comparison.', 'DeepSeek Hugging Face card'),
    ]
  }

  function studyDossier(model) {
    const id = String(model.id || '').toLowerCase()
    const p = model.provider
    if (/deepseek-v4-flash|deepseek-v4-pro/.test(id)) {
      return {
        official: [
          { label: 'Announced', value: '10 Sep 2026 — deepseek.com' },
          { label: 'API id', value: 'deepseek-flash' },
          { label: 'Backbone', value: '552B MoE CED · 8B prefill / 16B decode' },
          { label: 'Context / output', value: '1M in · 384K out' },
          { label: 'Weights', value: 'MIT · Hugging Face DeepSeek-V4.1-Flash' },
        ],
        architecture: [
          'Official 10 Sep 2026: smallest model in the new architecture family, native multimodal, asymmetric 8B/16B MoE.',
          'KV cache 890 bytes/token — ~1/4 of V4 Flash. Legacy v4-flash ids route here; v4-pro routes here until V4.1 Pro ships.',
        ],
        did: [
          'Vendor card: Terminal-Bench 2.1 90.6, DeepSWE 74.2, CyberGym 88.1, GPQA 90.9, Codeforces 3471.',
          'Scaffold spread on DeepSWE: 65.5 OpenCode to 74.2 mini-SWE. Reviews treat 74.2 as harness-specific.',
        ],
        benchmarkTitle: 'Official instruct card vs frontier',
        benchmarkNote: 'Hugging Face card + api-docs.deepseek.com. Vendor-reported.',
        benchmarkHeaders: ['Exam', 'Opus 5.0', 'GPT-5.6 Sol', 'V4 Flash', 'V4.1 Flash'],
        benchmarkRows: [
          ['GPQA Diamond', '93.4', '94.1', '89.9', '90.9'],
          ['Terminal-Bench 2.1', '89.1', '88.8', '82.7', '90.6'],
          ['DeepSWE v1.1', '74.0', '73.0', '54.4', '74.2'],
          ['CyberGym', '—', '84.5', '76.7', '88.1'],
        ],
        reviews: [
          { source: 'DeepSeek official', quote: 'Native multimodal. Asymmetric MoE. Priced down because the architecture is cheaper to serve.' },
          { source: 'OmniaKey / Orca', quote: 'Frontier agentic scores at Flash pricing. 74.2 is scaffold-sensitive.' },
        ],
        sources: [
          { label: 'Launch post', url: 'https://www.deepseek.com/news/deepseek-v4-1-flash/' },
          { label: 'Hugging Face card', url: 'https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash' },
        ],
        gallery: [
          img('dsv41-agentic.png', 'Official agentic benchmark figure.', 'deepseek-ai / Hugging Face'),
          img('dsv41-kvcache.png', 'KV cache bytes/token across DeepSeek generations.', 'deepseek-ai / Hugging Face'),
        ],
      }
    }
    const gallery =
      p === 'openai'
        ? openaiGallery(model)
        : p === 'anthropic'
          ? claudeGallery(model)
          : p === 'xai'
            ? grokGallery(model)
            : p === 'deepseek'
              ? [
                  img('dsv41-agentic.png', 'DeepSeek V4.1 agentic benchmarks.', 'deepseek-ai / Hugging Face'),
                  img('dsv41-kvcache.png', 'DeepSeek KV cache chart.', 'deepseek-ai / Hugging Face'),
                ]
              : [img('openai-gpt56-hero.png', 'Reference OpenAI frontier blog art.', 'OpenAI · openai.com')]
    const openai = p === 'openai'
    const claude = p === 'anthropic'
    const grok = p === 'xai'
    return {
      official: [
        { label: 'Provider', value: p },
        { label: 'This row', value: model.name },
        { label: 'Cost', value: model.cost },
        ...(openai ? [{ label: 'GPT-6 Astra card', value: '1.05M context · 128K out · $10/$50 per 1M' }] : []),
        ...(grok ? [{ label: 'Grok 4.6 card', value: '500K context · $2/$6 per 1M under 200k prompt' }] : []),
        ...(claude ? [{ label: 'Envelope', value: '200K typical Claude context window' }] : []),
      ],
      architecture: [
        openai
          ? 'OpenAI GPT-5.6 (Sol/Terra/Luna) and GPT-6 Astra are the 2026 flagship cards. Astra: 1.05M context, effort low…max. AA reported Intelligence 61, level with Grok 4.6, at much higher list price.'
          : claude
            ? 'Claude 5 (Sonnet/Opus/Fable) vs 4.x (Haiku/Sonnet/Opus). Opus 5.0 is the comparison column on DeepSeek’s V4.1 card for many agent exams.'
            : grok
              ? 'Grok 4.6: 500K context, image+text in, $2/$6 list under 200k, cache key recommended. 4.20 variants cover huge-context / multi-agent work.'
              : `${model.name} is a full API model row. Re-run prompts on your own stack to compare.`,
      ],
      did: [
        openai ? 'GPT-5.6 Sol MRCR 256K–512K 91.5%; GraphWalks 1M 77.1% (OpenAI).' : `${model.strength}`,
        grok ? 'AA Intelligence 61 at ~5× lower input list than Astra. ~64.9 tok/s on that harness.' : claude ? 'Opus 5.0 column: GPQA 93.4, DeepSWE 74.0, BabyVision 94.1 (DeepSeek comparison table).' : 'Use the bars and family table on this page.',
      ],
      benchmarkTitle: openai ? 'GPT-5.6 long-context (OpenAI)' : grok ? 'Grok 4.6 vs GPT-6 Astra' : claude ? 'Opus 5.0 on the V4.1 Flash card' : 'Catalog snapshot',
      benchmarkNote: 'Public vendor or comparison figures, Sep 2026. Not every row has its own first-party table.',
      benchmarkHeaders: openai ? ['Eval', 'Sol', 'Terra', 'Luna'] : grok ? ['Field', 'Grok 4.6', 'GPT-6 Astra'] : claude ? ['Exam', 'Opus 5.0', 'V4.1 Flash'] : ['Field', 'Value'],
      benchmarkRows: openai
        ? [['MRCR 256K–512K', '91.5%', '89.6%', '41.3%'], ['GraphWalks 1M', '77.1%', '71.2%', '51.2%']]
        : grok
          ? [['Context', '500K', '~1.05M'], ['List in/out', '$2 / $6', '$10 / $50'], ['AA Intelligence', '61 high', '61 max']]
          : claude
            ? [['GPQA', '93.4', '90.9'], ['DeepSWE', '74.0', '74.2'], ['BabyVision', '94.1', '89.6']]
            : [['Name', model.name], ['Cost', model.cost]],
      reviews: [{ source: 'Public docs', quote: model.strength }],
      sources:
        openai
          ? [{ label: 'GPT-5.6', url: 'https://openai.com/index/gpt-5-6/' }, { label: 'GPT-6 Astra', url: 'https://developers.openai.com/api/docs/models/gpt-6-astra' }]
          : grok
            ? [{ label: 'Grok 4.6 docs', url: 'https://docs.x.ai/developers/grok-4-6' }]
            : claude
              ? [{ label: 'V4.1 comparison table', url: 'https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash' }]
              : [{ label: 'DeepSeek V4.1', url: 'https://www.deepseek.com/news/deepseek-v4-1-flash/' }],
      gallery,
    }
  }

  function buildModelBrief(model) {
    const guide = modelGuide(model)
    const t = traits(model)
    const contextN = parseTokenCount(guide.context)
    const outputN = parseTokenCount(guide.output)
    const cmp = comparisonTable(model)
    const pick = whenToPick(model, t)
    const skip = whenToSkip(model, t)
    const label = PROVIDER_LABEL[model.provider] || model.provider
    const dossier = studyDossier(model)
    const pricing = resolveModelPricing(model)
    const extraChapters = [
      { n: '12', title: 'Official record', kicker: 'Primary sources', paragraphs: dossier.architecture },
      { n: '13', title: 'What it did — exams and reviews', kicker: 'Public results', paragraphs: dossier.did },
    ]
    return {
      id: model.id,
      name: model.name,
      provider: model.provider,
      providerLabel: label,
      generation: modelGeneration(model),
      launched: modelLaunched(model),
      cost: model.cost,
      summary: model.strength,
      context: guide.context,
      output: guide.output,
      good: guide.good,
      bestFor: guide.bestFor,
      benchmarks: [`${model.name} · ${modelGeneration(model)}`, `Cost ${model.cost}. ${guide.bestFor}.`, t.v41 ? 'V4.1 ≠ DeepSeek V4.' : model.strength],
      whenToPick: pick,
      whenToSkip: skip,
      soumtokNotes: soumtokNotes(model),
      tags: model.tags || [],
      documentKind: 'Model Study',
      providerLogo: model.provider,
      coverLine: model.strength,
      hero: t.v41 && /flash/.test(t.id)
        ? `${model.name} is DeepSeek’s V4.1 daily coding model — a different generation from DeepSeek V4 Chat, Coder, and Reasoner. ${model.strength} ${guide.bestFor}.`
        : `${model.name} is a ${label} model. ${model.strength} ${guide.bestFor}. Context ${guide.context}, max output ${guide.output}.`,
      specs: [
        { label: 'Provider', value: label },
        { label: 'Generation', value: modelGeneration(model) },
        { label: 'Launched', value: modelLaunched(model) },
        { label: 'Context', value: guide.context },
        { label: 'Max output', value: guide.output },
        { label: 'Vendor list price', value: pricing.vendor ? `${pricing.headline} / 1M tokens` : 'No public list price' },
        { label: 'Catalog id', value: model.id },
        { label: 'Vision', value: t.vision ? 'Yes — images in attachments' : 'Text only' },
        { label: 'Reasoning bias', value: t.reasoning ? 'Thinks longer' : t.fast ? 'Low-latency' : 'Balanced' },
        { label: 'Provider docs', value: String(model.keys || '').replace('https://', '') },
      ],
      scores: scoresFor(model, contextN, t),
      chapters: chaptersFor(model, guide, t, contextN, outputN, pricing).concat(extraChapters),
      comparisonHeaders: cmp.headers,
      comparisonRows: cmp.rows,
      workloads: workloads(model, t),
      family: familyOf(model),
      timeline: timelineFor(model, t),
      classroom: classroom(model, t),
      faq: faq(model, t),
      glossary: glossary(),
      stats: [
        { label: 'Generation', value: modelGeneration(model), hint: 'Full version name' },
        { label: 'Context', value: String(guide.context).replace(' tokens', ''), hint: 'Window' },
        { label: 'Output', value: String(guide.output).replace(' tokens', ''), hint: 'Max completion' },
        { label: 'List price', value: pricing.vendor ? pricing.headline : 'Included', hint: 'Vendor API (in · out / 1M)' },
      ],
      pricing,
      pricingExamples: pricing.examples,
      billingPaths: pricing.billingPaths,
      official: dossier.official,
      architectureNotes: dossier.architecture,
      did: dossier.did,
      benchmarkTitle: dossier.benchmarkTitle,
      benchmarkNote: dossier.benchmarkNote,
      benchmarkHeaders: dossier.benchmarkHeaders,
      benchmarkRows: dossier.benchmarkRows,
      reviews: dossier.reviews,
      sources: dossier.sources,
      gallery: dossier.gallery,
    }
  }

  return { buildModelBrief, buildModelStudy: buildModelBrief, modelGuide }
})
