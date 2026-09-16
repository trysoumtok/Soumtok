import { CODING_MODELS, PROVIDER_LABEL, modelGuide, type CodingModel } from './models.ts'
import {
  SOUMTOK_ON_DEMAND_USD_PER_M,
  resolveModelPricing,
  type BillingPath,
  type ModelPricing,
  type PriceExample,
} from './modelPricing.ts'
import { studyDossier, type StudyImage, type StudyReview, type StudySource } from './modelStudyDossier.ts'

export type ScoreBar = { label: string; value: number; note: string }
export type StudyChapter = { n: string; title: string; kicker: string; paragraphs: string[]; bullets?: string[] }
export type WorkloadRow = { task: string; fit: string; score: number; note: string }
export type TimelineEvent = { when: string; title: string; body: string }
export type FaqItem = { q: string; a: string }

export type ModelBrief = {
  id: string
  name: string
  provider: string
  providerLabel: string
  generation: string
  launched: string
  cost: string
  summary: string
  context: string
  output: string
  good: string[]
  bestFor: string
  benchmarks: string[]
  whenToPick: string[]
  whenToSkip: string[]
  soumtokNotes: string[]
  tags: string[]
  documentKind: 'Model Study'
  providerLogo: string
  coverLine: string
  hero: string
  specs: { label: string; value: string }[]
  scores: ScoreBar[]
  chapters: StudyChapter[]
  comparisonHeaders: string[]
  comparisonRows: string[][]
  workloads: WorkloadRow[]
  family: { name: string; role: string; cost: string }[]
  timeline: TimelineEvent[]
  classroom: { title: string; body: string }[]
  faq: FaqItem[]
  glossary: { term: string; def: string }[]
  stats: { label: string; value: string; hint: string }[]
  pricing: ModelPricing
  pricingExamples: PriceExample[]
  billingPaths: BillingPath[]
  official: { label: string; value: string }[]
  architectureNotes: string[]
  did: string[]
  benchmarkTitle: string
  benchmarkNote: string
  benchmarkHeaders: string[]
  benchmarkRows: string[][]
  reviews: StudyReview[]
  sources: StudySource[]
  gallery: StudyImage[]
}

function tokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M tokens`
  return `${Math.round(n / 1000)}K tokens`
}

function parseTokenCount(label: string) {
  const m = label.match(/([\d.]+)\s*([MK])\s*tokens/i)
  if (!m) return 128_000
  const n = Number(m[1])
  return m[2].toUpperCase() === 'M' ? n * 1_000_000 : n * 1000
}

function clamp(n: number, a = 8, b = 98) {
  return Math.max(a, Math.min(b, Math.round(n)))
}

export function modelGeneration(model: CodingModel): string {
  const hay = `${model.id} ${model.name}`.toLowerCase()
  if (/v4\.1|v4-flash|deepseek-flash|v4-pro/.test(hay)) return 'V4.1'
  if (/deepseek-chat|deepseek-coder|deepseek-reasoner/.test(hay)) return 'V4'
  if (/gpt-6/.test(hay)) return 'GPT-6'
  if (/gpt-5\.6/.test(hay)) return 'GPT-5.6'
  if (/gpt-5\.5/.test(hay)) return 'GPT-5.5'
  if (/gpt-5\.4/.test(hay)) return 'GPT-5.4'
  if (/gpt-5\.3/.test(hay)) return 'GPT-5.3'
  if (/gpt-5/.test(hay)) return 'GPT-5'
  if (/gpt-4\.1/.test(hay)) return 'GPT-4.1'
  if (/gpt-4o/.test(hay)) return 'GPT-4o'
  if (/claude-opus-5|claude-sonnet-5|claude-fable-5/.test(hay)) return 'Claude 5'
  if (/claude-opus-4|claude-sonnet-4|claude-haiku-4/.test(hay)) return 'Claude 4.x'
  if (/grok-4\.6/.test(hay)) return 'Grok 4.6'
  if (/grok-4\.20/.test(hay)) return 'Grok 4.20'
  if (/grok-4/.test(hay)) return 'Grok 4.x'
  if (/gemini-3/.test(hay)) return 'Gemini 3'
  if (/gemini-2\.5/.test(hay)) return 'Gemini 2.5'
  return 'Current'
}

function modelLaunched(model: CodingModel): string {
  const gen = modelGeneration(model)
  if (/deepseek-v4-flash|deepseek-v4-pro/.test(model.id)) return 'DeepSeek V4.1 Flash · launched 10 Sep 2026'
  if (/deepseek-chat|deepseek-coder|deepseek-reasoner/.test(model.id)) return 'DeepSeek V4 line · 2024–2025'
  if (/claude-sonnet-5|claude-opus-5|claude-fable-5/.test(model.id)) return 'Anthropic Claude 5 · 2025–2026'
  if (/claude-/.test(model.id)) return 'Anthropic Claude 4.x · 2025'
  if (/gpt-6-astra|gpt-5\.6/.test(model.id)) return 'OpenAI frontier · 2025–2026'
  if (/gpt-5/.test(model.id)) return 'OpenAI GPT-5 family · 2025'
  if (/gpt-4\.1/.test(model.id)) return 'OpenAI GPT-4.1 · 2025'
  if (/gpt-4o/.test(model.id)) return 'OpenAI GPT-4o · 2024'
  if (/grok-4\.6/.test(model.id)) return 'xAI Grok 4.6 · 2025–2026'
  if (/grok-4\.20/.test(model.id)) return 'xAI Grok 4.20 · 2025'
  if (model.tags?.includes('New')) return `${gen} · recently released`
  return `${gen} · established release`
}

function traits(model: CodingModel) {
  const id = model.id.toLowerCase()
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

function costScore(cost: string) {
  const map: Record<string, number> = {
    Included: 96,
    Cheapest: 94,
    Cheap: 86,
    Low: 78,
    Mid: 58,
    Varies: 52,
    Higher: 38,
    High: 28,
    Highest: 16,
  }
  return map[cost] ?? 50
}

function scoresFor(model: CodingModel, contextN: number, t: ReturnType<typeof traits>): ScoreBar[] {
  const speed = t.fast ? 92 : t.reasoning || t.pro ? 48 : 72
  const quality = t.pro ? 94 : t.reasoning ? 88 : t.fast ? 70 : 80
  const reason = t.reasoning ? 93 : t.pro ? 86 : t.fast ? 52 : 68
  const ctx = clamp((Math.log10(Math.max(contextN, 8_000)) - 4) * 45)
  const cost = costScore(model.cost)
  const vision = t.vision ? 90 : /4o/.test(t.id) ? 82 : 12
  const agent = t.agent ? 92 : t.pro ? 74 : t.fast ? 40 : 58
  const reliability = model.provider === 'deepseek' && t.v41 ? 88 : t.fast ? 80 : 84
  return [
    { label: 'Speed / latency', value: speed, note: t.fast ? 'Built to answer in a short turn.' : t.reasoning ? 'Thinks longer before it edits.' : 'Balanced turn time.' },
    { label: 'Code quality', value: quality, note: t.pro ? 'Premium edits and architecture.' : 'Solid everyday code.' },
    { label: 'Reasoning depth', value: reason, note: t.reasoning ? 'Hard bugs and multi-step logic.' : 'Enough for typical files.' },
    { label: 'Context reach', value: ctx, note: `${tokens(contextN)} in one window.` },
    { label: 'Cost efficiency', value: cost, note: 'Relative API cost vs siblings in the same family.' },
    { label: 'Vision / UI', value: vision, note: t.vision ? 'Reads screenshots and mocks.' : 'Text-first. Use a vision sibling for images.' },
    { label: 'Multi-file / agent', value: agent, note: t.agent ? 'Designed for repo-wide jobs.' : 'Best on focused files and bounded edits.' },
    { label: 'Everyday fit', value: reliability, note: 'How often this model is the right default for its class.' },
  ]
}

function familyOf(model: CodingModel) {
  const siblings = CODING_MODELS.filter((m) => m.provider === model.provider && m.id !== 'soumtok-agent').slice(0, 8)
  return siblings.map((m) => ({
    name: m.name,
    role: m.strength,
    cost: m.cost,
  }))
}

function comparisonTable(model: CodingModel) {
  const pool = CODING_MODELS.filter((m) => m.provider === model.provider && m.id !== 'soumtok-agent')
  const near = pool
    .sort((a, b) => (a.id === model.id ? -1 : b.id === model.id ? 1 : 0))
    .slice(0, 6)
  const headers = ['Model', 'Generation', 'Cost', 'Best for', 'Vision']
  const rows = near.map((m) => {
    const t = traits(m)
    const g = modelGuide(m)
    return [m.name, modelGeneration(m), m.cost, g.bestFor, t.vision ? 'Yes' : 'Text']
  })
  return { headers, rows }
}

function workloads(model: CodingModel, t: ReturnType<typeof traits>): WorkloadRow[] {
  const flash = t.fast ? 90 : 55
  const hard = t.pro || t.reasoning ? 90 : 45
  const ui = t.vision ? 92 : 30
  const repo = t.agent || t.pro ? 86 : t.fast ? 42 : 70
  return [
    { task: 'Small edit / typo / rename', fit: t.fast ? 'Excellent' : 'Good', score: flash, note: 'Lowest-friction job for a flash/mini model.' },
    { task: 'Single-file feature (calculator, form, widget)', fit: t.fast || !t.pro ? 'Excellent' : 'Good', score: t.fast ? 88 : 76, note: 'Ask for runnable HTML/CSS/JS in separate files.' },
    { task: 'Multi-file refactor', fit: t.pro || t.agent ? 'Excellent' : t.fast ? 'Fair' : 'Good', score: repo, note: t.fast ? 'Step up to Pro / Opus / Codex for big moves.' : 'Keep the files in context.' },
    { task: 'Hard bug / architecture', fit: t.reasoning || t.pro ? 'Excellent' : 'Fair', score: hard, note: 'Pay for thinking time when the answer is not in one file.' },
    { task: 'Screenshot → UI', fit: t.vision ? 'Excellent' : 'Poor', score: ui, note: t.vision ? 'Include the image in the prompt.' : 'Switch to a vision variant.' },
    { task: 'Long thread / huge repo pass', fit: /grok|gpt-4\.1|gemini/.test(t.id) ? 'Excellent' : 'Good', score: /grok/.test(t.id) ? 94 : t.fast ? 50 : 72, note: 'Context window is the limiter.' },
    { task: 'Docs, specs, product copy', fit: t.longform ? 'Excellent' : 'Good', score: t.longform ? 94 : 64, note: t.longform ? 'Fable is built for careful long writing.' : 'Fine for READMEs; not a novelist.' },
    { task: 'Lowest API spend', fit: model.cost === 'Cheapest' || model.cost === 'Included' ? 'Excellent' : 'Poor', score: costScore(model.cost), note: 'Cheapest per-token list price in its class.' },
  ]
}

function timelineFor(model: CodingModel, t: ReturnType<typeof traits>): TimelineEvent[] {
  if (t.v41) {
    return [
      { when: '2024', title: 'DeepSeek V4 line', body: 'Chat, Coder, and Reasoner ship as the V4 family — cheap, text-first coding models, separate from the later V4.1 line.' },
      { when: '10 Sep 2026', title: 'DeepSeek V4.1 Flash launches', body: 'Official post: smallest model in the new CED family, native multimodal, 552B MoE, 8B/16B active, 1M context. API id deepseek-flash. MIT weights on Hugging Face.' },
      { when: '14 Sep 2026', title: 'V4 Pro traffic → Flash', body: 'Until V4.1 Pro ships, Pro-tier traffic routes to V4.1 Flash at Flash prices.' },
      { when: '2025', title: 'V4.1 Pro and Vision', body: 'Pro handles harder refactors; Flash Vision adds image input on the same flash line.' },
      { when: 'Now', title: 'Where it sits', body: 'V4.1 Flash is the everyday coding default in the family — fast, cheap, multimodal. Pro is the step up for harder edits.' },
    ]
  }
  if (t.v4) {
    return [
      { when: '2024', title: 'DeepSeek V4 ships', body: 'Chat, Coder, and Reasoner cover general talk, code-focused work, and long thinking — the V4 generation, not V4.1.' },
      { when: '2025', title: 'V4.1 arrives', body: 'Flash, Pro, and Flash Vision supersede V4 for most new work. V4 remains for teams pinned to the older line.' },
      { when: 'Now', title: 'When to use V4', body: 'Pick V4 Chat/Coder/Reasoner when you explicitly want the older generation. For daily coding, V4.1 Flash is the modern default.' },
    ]
  }
  if (model.provider === 'anthropic') {
    return [
      { when: '2025', title: 'Claude 4.x', body: 'Haiku, Sonnet, and Opus 4.x cover fast reviews through architecture work.' },
      { when: '2025–2026', title: 'Claude 5 generation', body: 'Sonnet 5, Opus 5, and Fable 5 expand quality, coding, and long writing.' },
      { when: 'Now', title: 'Pick by job', body: 'Haiku for tiny edits, Sonnet for the day, Opus/Fable when the task needs flagship quality.' },
    ]
  }
  if (model.provider === 'openai') {
    return [
      { when: '2024', title: 'GPT-4o / 4.1 era', body: '4o brings chat + images. 4.1 stretches context toward a million tokens.' },
      { when: '2025', title: 'GPT-5 family', body: 'Mini through Pro and Codex cover cheap snippets to agent-style multi-file work.' },
      { when: '2025–2026', title: 'GPT-5.6 / GPT-6', body: 'Luna, Sol, Terra, and Astra are OpenAI’s frontier coding and reasoning models.' },
      { when: 'Now', title: 'Where Astra sits', body: 'Flagship general coding and repo work — highest list price, longest context in the GPT-6 line.' },
    ]
  }
  if (model.provider === 'xai') {
    return [
      { when: '2025', title: 'Grok 4.x coding', body: 'Build, 4.20 Fast/Reasoning/Multi-agent, then 4.3–4.6 — huge context is the headline.' },
      { when: 'Now', title: 'When Grok wins', body: 'Repo-wide passes and long threads. Use Reasoning or Multi-agent when one fast pass is not enough.' },
    ]
  }
  return [
    { when: modelLaunched(model), title: 'Release', body: `${model.name} — ${model.strength}` },
    { when: 'Now', title: 'Best for', body: modelGuide(model).bestFor },
  ]
}

function chaptersFor(
  model: CodingModel,
  guide: ReturnType<typeof modelGuide>,
  t: ReturnType<typeof traits>,
  contextN: number,
  outputN: number,
  pricing: ModelPricing,
): StudyChapter[] {
  const name = model.name
  const gen = modelGeneration(model)
  const v41Explain = t.v41
    ? `${name} is the V4.1 generation — written in full so it never collides with DeepSeek V4 Chat, V4 Coder, or V4 Reasoner. Those three are an older line. The official API id for Flash is deepseek-flash.`
    : t.v4
      ? `${name} belongs to the DeepSeek V4 line (Chat / Coder / Reasoner). It is not V4.1. For the newer flash default, use DeepSeek V4.1 Flash.`
      : `${name} is filed under ${gen} in ${PROVIDER_LABEL[model.provider]}’s model lineup.`

  return [
    {
      n: '01',
      title: 'What this model is',
      kicker: 'Identity',
      paragraphs: [
        `${name} is a ${PROVIDER_LABEL[model.provider]} model. One-line job: ${model.strength} API id: ${model.id}.`,
        v41Explain,
        `${name} is a direct chat model — it only sees the prompt, attached files, and images you send. No hidden repo access unless your client adds tools on top.`,
        `Best fit: ${guide.bestFor}. That is the job you should give it first. Stretch jobs (huge refactors, architecture, vision) are graded later — they are not all equally good.`,
      ],
    },
    {
      n: '02',
      title: 'Launch, generation, and naming',
      kicker: 'History',
      paragraphs: [
        `Released: ${modelLaunched(model)}. Generation: ${gen}. Tags: ${(model.tags || []).join(', ') || 'none'}.`,
        model.provider === 'deepseek'
          ? 'DeepSeek’s public line moved from V4 (chat/coder/reasoner) into V4.1 (flash/pro/vision). Both generations remain available — the name tells you which line you are on.'
          : `Provider: ${PROVIDER_LABEL[model.provider]}. API keys and docs live at the vendor console.`,
        `API id \`${model.id}\` may map to a different upstream string (for example DeepSeek V4.1 Flash → \`deepseek-flash\`). Check the provider docs for the exact model string.`,
        `${model.tags?.includes('New') ? 'Tagged New — a recent release. Treat benchmark grades as working guidance, not a frozen leaderboard.' : 'Stable model id. Behavior still depends on the provider’s live checkpoint.'}`,
      ],
    },
    {
      n: '03',
      title: 'Architecture and operating envelope',
      kicker: 'Specs',
      paragraphs: [
        `Context window: ${guide.context}. Max output: ${guide.output}. Short turns stay well under the output cap; long diffs and multi-file dumps consume more of it.`,
        `Numeric envelope used in this study: about ${tokens(contextN)} in, ${tokens(outputN)} out. Flash/mini/haiku-style models sit on the short-output side for low latency. Pro/Opus/reasoner models get a longer out window.`,
        t.vision
          ? `${name} is multimodal. Include a screenshot in the prompt and the model can read layout, type, and UI chrome — not every sibling in the family can do this.`
          : `${name} is text-first. For screenshots and mocks, switch to a vision sibling (DeepSeek V4.1 Flash Vision, GPT-4o, etc.).`,
        t.reasoning
          ? 'Reasoning models spend tokens thinking. Expect slower turns and higher cost. Use them when the bug is not obvious from one file.'
          : t.fast
            ? 'This is a fast model. It should feel snappy on small edits, calculators, and “explain this file” prompts. Do not punish it with a 40-file rewrite and then call it weak — that is the wrong exam.'
            : 'Balanced operating point: not the cheapest flash, not the slowest reasoner. Good when you already know this provider’s stack.',
      ],
      bullets: guide.good,
    },
    {
      n: '04',
      title: 'Benchmarks — working profile',
      kicker: 'Evaluation',
      paragraphs: [
        'These bars are a working profile for builders — not a vendor’s private leaderboard. They grade speed, code quality, reasoning, context, cost, vision, multi-file work, and everyday fit.',
        t.v41
          ? 'DeepSeek V4.1 Flash profiles as a daily driver: high speed, high cost efficiency, enough quality for single-file work, moderate reasoning, 128K context, and vision on the Flash line. Pro sits above it for harder refactors.'
          : `For ${name}, read the chart as a profile, not a single IQ number. High cost-efficiency plus low reasoning means “use it often, but not for the mystery bug.”`,
        'Public coding exams (HumanEval-like snippets, SWE-bench-like repo jobs, UI-from-screenshot) map onto those bars. If a bar is low, that exam is the wrong class for this model.',
        'Re-run the same prompt on two models and compare output quality — that is the benchmark that matches your stack.',
      ],
      bullets: [
        `Relative cost: ${model.cost}`,
        `Context / output: ${guide.context} · ${guide.output}`,
        `Primary strength: ${model.strength}`,
        t.v41 ? 'V4.1 Flash is multimodal — accepts images.' : t.vision ? 'Vision capable.' : 'Text-only.',
      ],
    },
    {
      n: '05',
      title: 'Family and how it compares',
      kicker: 'Lineup',
      paragraphs: [
        `Every ${PROVIDER_LABEL[model.provider]} model in the family is a different exam. The comparison table lists siblings so you can step one tier cheaper or stronger.`,
        t.v41
          ? 'DeepSeek map: V4 Chat / Coder / Reasoner = generation V4. V4.1 Flash = cheap-fast daily coding. V4.1 Pro = harder refactors. V4.1 Flash Vision = same flash line with UI images.'
          : `Stay on ${PROVIDER_LABEL[model.provider]} if you like the voice; change tier when the job changes.`,
        'Rule of thumb: if you are about to send the same failing prompt a third time, change model class (flash → pro/reasoner, or text → vision), not adjectives in the prompt.',
      ],
    },
    {
      n: '06',
      title: 'Workload classroom',
      kicker: 'What to assign',
      paragraphs: [
        'Treat this page like a syllabus. Each workload row is an assignment type. Excellent means this is the intended homework. Fair means it might pass. Poor means you are in the wrong room.',
        t.fast
          ? 'Flash/mini homework: calculators, landing slices, CSS tweaks, explain-this-function, generate a small React widget, fix a TypeError in one file. Not homework: redesign the auth system across twelve packages.'
          : t.pro || t.reasoning
            ? 'Pro/reasoner homework: multi-file refactors, failing tests that need a hypothesis, architecture choices, gnarly type errors. Not homework: rename a button — that wastes High/Highest credits.'
            : 'General homework: everyday files, reviews, balanced sessions. Check the table for vision and huge-repo rows.',
        'For UI tasks, ask for runnable files (`index.html`, CSS, JS). If you only get a markdown essay, repeat with “output separate runnable files” — or pick a model that dumps code well.',
      ],
    },
    {
      n: '07',
      title: 'When to pick · when to skip',
      kicker: 'Decision',
      paragraphs: [
        `Pick ${name} when the job matches ${guide.bestFor.toLowerCase()}. Skip it when a sibling’s bar is obviously higher for that job — especially vision, huge context, or premium reasoning.`,
        'Pick is not loyalty. Switch models when the job changes — this study helps you choose the right one.',
      ],
      bullets: [
        ...whenToPick(model, t).map((x) => `Pick: ${x}`),
        ...whenToSkip(model, t).map((x) => `Skip: ${x}`),
      ],
    },
    {
      n: '08',
      title: 'API pricing',
      kicker: 'Vendor',
      paragraphs: [
        pricing.vendor
          ? `${name} bills at ${pricing.vendorLine} Input and output tokens are priced separately. Long prompts and large completions increase cost — output-heavy coding turns usually dominate the bill.`
          : `${name} has no separate public vendor list price in this catalog row.`,
        pricing.vendor
          ? 'Reasoning models may bill hidden thinking tokens in addition to visible output. Vision turns include image tokens in the prompt side of the meter.'
          : '',
        /gpt-6-astra/.test(model.id)
          ? 'OpenAI’s Standard tier doubles input price above 272K prompt tokens on Astra.'
          : /grok-4\.6|grok-4\.5/.test(model.id)
            ? 'xAI list prices jump when the prompt crosses 200K tokens — the higher tier applies to the full request.'
            : '',
      ].filter(Boolean),
      bullets: pricing.vendor
        ? [
            'List price is set by the provider and can change with checkpoint or tier',
            'Compare siblings in the family table before paying flagship rates for a flash job',
            'Watch completion length — a single 8K dump can cost more than many small turns',
          ]
        : undefined,
    },
    {
      n: '09',
      title: 'Model id and access',
      kicker: 'Routing',
      paragraphs: [
        `Catalog id: \`${model.id}\`. Upstream APIs may expose a different model string (for example DeepSeek V4.1 Flash → \`deepseek-flash\`).`,
        'Direct chat sends only your prompt and attachments — no silent repo scan. Agent-style tooling is a separate product surface with the same underlying model id.',
        `Provider: ${PROVIDER_LABEL[model.provider]}. API keys and rate limits live at the vendor console.`,
      ],
    },
    {
      n: '10',
      title: 'Prompting this model well',
      kicker: 'Practice',
      paragraphs: [
        'Lead with the artifact: “Build a responsive calculator in index.html + CSS + JS. Dark theme. Keyboard support.” Fast models follow concrete specs better than vibes.',
        'Attach instead of describing. A screenshot of the broken UI is worth a paragraph of CSS adjectives — if this model has vision. Otherwise paste the HTML.',
        'Bound the blast radius: “Only change src/Button.tsx. Do not rewrite the store.” Flash models stay cleaner when the fence is small. Pro/reasoner can take a wider fence.',
        'Ask for separate files with clear paths. If output is markdown instead of code, say so on the next turn.',
        'One task per turn. Switch models if the job was the wrong fit.',
      ],
    },
    {
      n: '11',
      title: 'Limits, safety, and honest gaps',
      kicker: 'Constraints',
      paragraphs: [
        'Working grades here are not a substitute for vendor benchmark cards. Checkpoints move. A New tag means the grade may be ahead of public data.',
        'Context is not infinite memory. 128K is a lot of files and still not “the whole monorepo plus node_modules.” Paste what matters.',
        'Output caps cut off long single dumps. Prefer multiple files over one 20K-line blob, especially on flash models (8K out).',
        'Never send secrets in prompts. API calls leave your machine and hit the provider’s servers.',
        `${name} will still be wrong sometimes. The study’s job is to put you in the right classroom — not to promise a perfect answer.`,
      ],
    },
  ]
}

function whenToPick(model: CodingModel, t: ReturnType<typeof traits>): string[] {
  if (t.v41 && /flash/.test(t.id) && !/vision/.test(t.id)) {
    return [
      'Default daily driver for cheap, fast coding',
      'Building UI, quick fixes, short explanations',
      'Lowest DeepSeek API cost in the V4.1 line',
      'Screenshots on the Flash line (multimodal)',
    ]
  }
  if (/deepseek-v4-pro/.test(t.id)) return ['Multi-file refactors', 'Harder logic without jumping to Opus / GPT-6', 'Still want DeepSeek pricing']
  if (t.v4) return ['You explicitly want DeepSeek V4 (pre-V4.1) text chat or coder/reasoner']
  if (t.vision) return ['Screenshots, mocks, or UI images in the prompt']
  if (t.agent || /opus|gpt-6|codex/.test(t.id)) return ['Production-critical bug', 'Architecture decision', 'Agent-style multi-file job']
  if (t.fast) return ['Tiny edits', 'Fast reviews', 'Lowest spend']
  if (t.longform) return ['Long specs, docs, careful product writing']
  return ['Balanced coding session', 'When you know this provider fits your stack']
}

function whenToSkip(model: CodingModel, t: ReturnType<typeof traits>): string[] {
  if (t.v41 && /flash/.test(t.id) && !/pro/.test(t.id)) return ['Huge architecture rewrites — try V4.1 Pro, Opus, or GPT-6', 'Repo-wide jobs that need 1M+ context — try Grok 4.20 / GPT-4.1']
  if (t.v4) return ['You need V4.1 speed/quality — pick DeepSeek V4.1 Flash instead']
  if (t.fast) return ['Complex multi-file agent work', 'Deep architecture debates']
  if (/opus|gpt-6|fable/.test(t.id)) return ['Simple one-line fixes — use Flash / Mini / Haiku']
  return ['Task needs vision but this model is text-only', 'Premium API cost for a trivial one-line fix']
}

function soumtokNotes(_model: CodingModel): string[] {
  return []
}

function classroom(model: CodingModel, t: ReturnType<typeof traits>) {
  return [
    {
      title: 'Lab 1 — Baseline output',
      body: `Prompt ${model.name} for a small self-contained UI (calculator, timer, or pricing cards). Grade whether you get runnable HTML/CSS/JS — not prose quality.`,
    },
    {
      title: 'Lab 2 — Same prompt, sibling model',
      body: t.v41
        ? 'Re-run the same calculator prompt on DeepSeek V4 Chat, then V4.1 Pro. You should feel V4.1 Flash as the fast default, V4 as the older line, Pro as the heavier editor.'
        : `Re-run the same prompt on a cheaper sibling and a stronger sibling in ${PROVIDER_LABEL[model.provider]}. Keep the prompt frozen so the model is the only variable.`,
    },
    {
      title: 'Lab 3 — Attachments',
      body: t.vision
        ? 'Attach a screenshot of a UI and ask for matching HTML/CSS. If the preview is close, vision is working. If the model ignores the image, check that you used the vision id.'
        : 'Attach a source file and ask for a review. Then try an image on a vision sibling and notice the difference.',
    },
    {
      title: 'Lab 4 — Bound the blast radius',
      body: 'Give a three-file mini repo (html/css/js) and say “only change the CSS.” A well-behaved flash model touches one file. A poorly prompted session rewrites everything — that is a prompt bug, not always a model bug.',
    },
  ]
}

function faq(model: CodingModel, t: ReturnType<typeof traits>): FaqItem[] {
  return [
    {
      q: `Is ${model.name} the same as DeepSeek V4 Flash?`,
      a: t.v41
        ? 'No. The full name is DeepSeek V4.1 Flash. V4 is a different generation (Chat, Coder, Reasoner). Labels that dropped the “.1” were wrong.'
        : t.v4
          ? 'This row is DeepSeek V4, not V4.1. Flash is the V4.1 daily driver.'
          : `This row is ${model.name}, not a DeepSeek Flash alias.`,
    },
    {
      q: 'Does this model support images?',
      a: t.vision
        ? 'Yes — include screenshots or mocks in the prompt.'
        : 'No — this is a text-only variant. Use a vision sibling in the same family.',
    },
    {
      q: 'Why did I get markdown instead of code?',
      a: 'The model answered in prose. Ask again for separate runnable files (html/css/js with paths). Some models need an explicit format instruction.',
    },
    {
      q: 'Can I save this as a PDF?',
      a: 'Yes — use Download PDF in the toolbar.',
    },
    {
      q: 'Are the charts official vendor scores?',
      a: 'No. They are working grades for picking the right model class. Re-test on your own prompts.',
    },
    {
      q: 'How much does the API cost?',
      a: resolveModelPricing(model).vendor
        ? `Vendor list price: ${resolveModelPricing(model).vendorLine.split(' — ')[0]}. Billed per million input and output tokens at ${PROVIDER_LABEL[model.provider]}.`
        : 'This catalog row has no separate public vendor list price.',
    },
  ]
}

function glossary(): { term: string; def: string }[] {
  return [
    { term: 'API id', def: 'The model string passed to the provider API (example: deepseek-v4-flash). May differ from the marketing name.' },
    { term: 'Generation', def: 'Family version written in full (V4 vs V4.1, GPT-4.1 vs GPT-4, Claude 4 vs 5).' },
    { term: 'Context window', def: 'How much prompt + history + files the model can see at once.' },
    { term: 'Max output', def: 'How long a single completion can be before it is cut off.' },
    { term: 'List price', def: 'What OpenAI / Anthropic / DeepSeek / xAI charge per million input/output tokens.' },
    { term: 'MoE', def: 'Mixture-of-experts — only a subset of parameters activate per token, keeping latency low.' },
    { term: 'Vision', def: 'The model can read attached images, not only text.' },
  ]
}

const PROVIDER_LOGO: Record<string, string> = {
  deepseek: '/logos/deepseek.svg',
  openai: '/logos/openai.svg',
  anthropic: '/logos/anthropic.svg',
  google: '/logos/google-g.svg',
  xai: '/logos/xai.svg',
  openrouter: '/logos/openai.svg',
}

function heroFor(model: CodingModel, t: ReturnType<typeof traits>, guide: ReturnType<typeof modelGuide>) {
  if (t.v41 && /flash/.test(t.id)) {
    return `${model.name} is DeepSeek’s V4.1 daily coding model — a different generation from DeepSeek V4 Chat, Coder, and Reasoner. ${model.strength} ${guide.bestFor}.`
  }
  return `${model.name} is a ${PROVIDER_LABEL[model.provider]} model. ${model.strength} ${guide.bestFor}. Context ${guide.context}, max output ${guide.output}.`
}

export function findCodingModel(id: string): CodingModel | undefined {
  return CODING_MODELS.find((m) => m.id === id)
}

export function buildModelBrief(model: CodingModel): ModelBrief {
  const guide = modelGuide(model)
  const t = traits(model)
  const contextN = parseTokenCount(guide.context)
  const outputN = parseTokenCount(guide.output)
  const cmp = comparisonTable(model)
  const pick = whenToPick(model, t)
  const skip = whenToSkip(model, t)
  const dossier = studyDossier(model)
  const pricing = resolveModelPricing(model)
  const extraChapters = [
    {
      n: '12',
      title: 'Official record',
      kicker: 'Primary sources',
      paragraphs: dossier.architecture,
    },
    {
      n: '13',
      title: 'What it did — exams and reviews',
      kicker: 'Public results',
      paragraphs: dossier.did,
    },
  ]
  const benches = [
    `${model.name} · ${modelGeneration(model)} · ${modelLaunched(model)}`,
    `Working grade — see charts. ${guide.bestFor}.`,
    t.v41 ? 'V4.1 is a different generation from DeepSeek V4 Chat/Coder/Reasoner.' : model.strength,
    t.vision ? 'Multimodal — accepts images in the prompt.' : 'Text-first model.',
  ]
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    providerLabel: PROVIDER_LABEL[model.provider],
    generation: modelGeneration(model),
    launched: modelLaunched(model),
    cost: model.cost,
    summary: model.strength,
    context: guide.context,
    output: guide.output,
    good: guide.good,
    bestFor: guide.bestFor,
    benchmarks: benches,
    whenToPick: pick,
    whenToSkip: skip,
    soumtokNotes: soumtokNotes(model),
    tags: model.tags ?? [],
    documentKind: 'Model Study',
    providerLogo: PROVIDER_LOGO[model.provider] || '/logos/deepseek.svg',
    coverLine: model.strength,
    hero: heroFor(model, t, guide),
    specs: [
      { label: 'Provider', value: PROVIDER_LABEL[model.provider] },
      { label: 'Generation', value: modelGeneration(model) },
      { label: 'Launched', value: modelLaunched(model) },
      { label: 'Context', value: guide.context },
      { label: 'Max output', value: guide.output },
      { label: 'Vendor list price', value: pricing.vendor ? pricing.headline + ' / 1M tokens' : 'No public list price' },
      { label: 'Catalog id', value: model.id },
      { label: 'Vision', value: t.vision ? 'Yes — image input' : 'Text only' },
      { label: 'Reasoning bias', value: t.reasoning ? 'Thinks longer' : t.fast ? 'Low-latency' : 'Balanced' },
      { label: 'Agent bias', value: t.agent ? 'Multi-file / agent' : 'Direct chat first' },
      { label: 'Provider docs', value: model.keys.replace('https://', '') },
    ],
    scores: scoresFor(model, contextN, t),
    chapters: [...chaptersFor(model, guide, t, contextN, outputN, pricing), ...extraChapters],
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
      { label: 'Context', value: guide.context.replace(' tokens', ''), hint: 'Window' },
      { label: 'Output', value: guide.output.replace(' tokens', ''), hint: 'Max completion' },
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

export function buildModelStudy(model: CodingModel): ModelBrief {
  return buildModelBrief(model)
}

export function buildModelBriefById(id: string): ModelBrief | null {
  const model = findCodingModel(id)
  if (!model) return null
  return buildModelBrief(model)
}
