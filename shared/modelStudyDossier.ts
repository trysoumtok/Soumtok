import type { CodingModel } from './models.ts'

export type StudyImage = { file: string; caption: string; credit: string }
export type StudyReview = { source: string; quote: string }
export type StudySource = { label: string; url: string }
export type StudyDossier = {
  official: { label: string; value: string }[]
  architecture: string[]
  did: string[]
  benchmarkTitle: string
  benchmarkNote: string
  benchmarkHeaders: string[]
  benchmarkRows: string[][]
  reviews: StudyReview[]
  sources: StudySource[]
  gallery: StudyImage[]
}

const WEB = '/images/studies/'

export function studyImageSrc(file: string, desktop = false) {
  return desktop ? `../../resources/studies/${file}` : `${WEB}${file}`
}

function img(file: string, caption: string, credit: string): StudyImage {
  return { file, caption, credit }
}

/** Real OpenAI blog / docs images (downloaded by scripts/fetch-study-images.mjs). */
function openaiGallery(model: CodingModel): StudyImage[] {
  const id = model.id.toLowerCase()
  if (/o3-mini|o4-mini|^o3$|o3-pro|o1|o4-mini/.test(id)) {
    return [
      img(
        'openai-o3-mini-hero.png',
        'OpenAI o3-mini — reasoning model for coding, math, and science (official announcement art).',
        'OpenAI · openai.com/index/openai-o3-mini/',
      ),
      img(
        'openai-o3-o4-hero.png',
        'OpenAI o3 and o4-mini — tool use, visual reasoning, and agentic ChatGPT capabilities.',
        'OpenAI · openai.com/index/introducing-o3-and-o4-mini/',
      ),
      img('openai-o3-mini-docs.png', 'OpenAI API documentation card for the o3-mini model.', 'OpenAI · developers.openai.com/api/docs/models/o3-mini'),
    ]
  }
  if (/gpt-5\.6|gpt-6|astra/.test(id)) {
    return [
      img(
        'openai-gpt56-hero.png',
        'OpenAI GPT-5.6 / ChatGPT work — frontier coding and long-context family (official blog art).',
        'OpenAI · openai.com/index/gpt-5-6/',
      ),
      img(
        'openai-o3-o4-hero.png',
        'OpenAI o-series reasoning lineage — tool-augmented thinking before GPT-5.6 / GPT-6 jobs.',
        'OpenAI · openai.com/index/introducing-o3-and-o4-mini/',
      ),
    ]
  }
  return [
    img(
      'openai-gpt56-hero.png',
      `OpenAI frontier coding models — ${model.name} sits in this catalog alongside GPT-5.6 and GPT-6 rows.`,
      'OpenAI · openai.com/index/gpt-5-6/',
    ),
    img('openai-o3-mini-docs.png', 'OpenAI API model documentation card (reasoning / coding tier reference).', 'OpenAI · developers.openai.com'),
  ]
}

function claudeGallery(model: CodingModel): StudyImage[] {
  const opus = /opus|fable/.test(model.id)
  return [
    img(
      'anthropic-opus45-hero.jpg',
      opus
        ? `${model.name} — Anthropic Claude Opus / Fable line (official announcement hero).`
        : 'Anthropic Claude family — official announcement hero art (Opus 4.5 launch).',
      'Anthropic · anthropic.com/news/claude-opus-4-5',
    ),
    img(
      'anthropic-opus45-chart.png',
      'Published evaluation charts from Anthropic’s Claude Opus 4.5 announcement.',
      'Anthropic · anthropic.com/news/claude-opus-4-5',
    ),
    ...(opus
      ? [img('anthropic-opus45-safety.png', 'Safety and alignment charts from the Claude Opus 4.5 system card.', 'Anthropic · anthropic.com/news/claude-opus-4-5')]
      : []),
  ]
}

function grokGallery(model: CodingModel): StudyImage[] {
  return [
    img(
      'xai-grok-hero.webp',
      `${model.name} — xAI Grok family (official x.ai news art).`,
      'xAI · x.ai/news/grok-4',
    ),
    img(
      'dsv41-agentic.png',
      'Public cross-vendor agentic benchmark plate — Grok 4.6 is often compared here against GPT-6 Astra and DeepSeek V4.1 Flash.',
      'DeepSeek Hugging Face card (comparison column context)',
    ),
  ]
}

function deepseekV41(model: CodingModel): StudyDossier {
  const flash = /flash/.test(model.id) && !/pro/.test(model.id)
  return {
    official: [
      { label: 'Announced', value: '10 Sep 2026 — deepseek.com/news/deepseek-v4-1-flash' },
      { label: 'API id', value: 'deepseek-flash (legacy deepseek-v4-flash routes here)' },
      { label: 'Backbone', value: '552B MoE · Causal Encoder–Decoder · 40 layers (20 + 20)' },
      { label: 'Active params', value: '8B prefill · 16B decode · 1 shared + 384 routed experts, 6 active' },
      { label: 'Context / output', value: '1M tokens in · 384K max out' },
      { label: 'Modalities', value: 'Native image + text in · text out' },
      { label: 'Weights', value: 'MIT license on Hugging Face deepseek-ai/DeepSeek-V4.1-Flash' },
      { label: 'KV cache', value: '890 bytes/token — ~1/4 of V4 Flash, ~1/437 of V1' },
      { label: 'Reasoning', value: 'Continuous reasoning_effort 1–100' },
      { label: 'Role in family', value: flash ? 'Flash daily driver' : /pro/.test(model.id) ? 'Pro row — API may route to V4.1 Flash until V4.1 Pro ships' : 'Vision-labelled Flash line' },
    ],
    architecture: [
      'DeepSeek’s 10 Sep 2026 post: V4.1 Flash is the smallest model in a new architecture family, built for a higher ceiling, faster inference, and higher throughput — with native multimodal vision.',
      'CED is asymmetric on purpose: the decoder’s global KV is projected from the encoder’s last hidden states, so input-heavy agent jobs stay cheap (8B active on prefill). CSA2 + FP4 KV caching + SWA Bounded Replay shrink persistent cache.',
      'Trained from scratch on ~45T multimodal tokens; sparse attention at 64K then extended to 1M at 34T tokens. Post-train is SFT → RL → on-policy distillation with large-scale synthetic agent tasks.',
      'From 14 Sep 2026 12:00 Beijing time, deepseek-v4-pro traffic routes to V4.1 Flash at Flash prices until V4.1 Pro launches. V4 Flash and V4 Flash Vision Exp are retired; old ids still resolve to Flash.',
    ],
    did: [
      'Vendor card (max reasoning): Terminal-Bench 2.1 90.6, DeepSWE v1.1 74.2 (mini-SWE), CyberGym 88.1, AutomationBench 54.8, Agent’s Last Exam 31.8, GPQA Diamond 90.9, Codeforces 3471.',
      'Same model, different harness: DeepSWE ranges 65.5 (OpenCode) to 74.2 (mini-SWE) — an 8.7-point scaffold spread. Reviews (Orca Router, OmniaKey) treat 74.2 as a harness result, not a universal IQ.',
      'Vision-agent card: Chartography 78.9, BabyVision 89.6, ZeroBench-main 49.0, DocVQA 95.6 (base). Maps to screenshot → HTML/CSS UI tasks.',
      'Independent write-ups call it “frontier agentic scores at Flash pricing,” with the caveat that SWE-bench Verified/Pro were not first-party published — DeepSWE was the lead coding exam.',
    ],
    benchmarkTitle: 'Official instruct card vs frontier (max effort)',
    benchmarkNote:
      'Source: Hugging Face model card + api-docs.deepseek.com/updates. Vendor-reported, temperature 1.0, top_p 0.95. Terminal-Bench 2.1 / DeepSWE use listed harnesses — not a single global SWE-bench Verified.',
    benchmarkHeaders: ['Exam', 'Opus 5.0', 'GPT-5.6 Sol', 'V4 Pro', 'V4 Flash', 'V4.1 Flash'],
    benchmarkRows: [
      ['GPQA Diamond', '93.4', '94.1', '92.4', '89.9', '90.9'],
      ['Terminal-Bench 2.1', '89.1', '88.8', '87.9', '82.7', '90.6'],
      ['DeepSWE v1.1', '74.0', '73.0', '62.7', '54.4', '74.2'],
      ['CyberGym', '—', '84.5', '83.3', '76.7', '88.1'],
      ['AutomationBench', '50.3', '45.8', '43.2', '37.7', '54.8'],
      ['HLE w/ tools', '63.6', '—', '60.0', '51.5', '63.9'],
      ['Codeforces rating', '—', '—', '3348', '3289', '3471'],
    ],
    reviews: [
      { source: 'DeepSeek (official, 10 Sep 2026)', quote: 'Smallest model in the new structure family. Native multimodal. Asymmetric 8B-in / 16B-out MoE, priced down because the architecture is cheaper to serve.' },
      { source: 'Hugging Face card', quote: '552B multimodal MoE, 1M context. KV cache ~4× smaller than V4 Flash. Agentic tables include scaffold spreads so you can see the harness, not only the headline.' },
      { source: 'OmniaKey review', quote: 'Release 2026-09-10. Canonical API id deepseek-flash. Gains on coding/agent exams vs V4 Flash; V4 Pro still higher on some knowledge exams (GPQA, text-only HLE).' },
      { source: 'Orca Router / Agent Guides', quote: '74.2 DeepSWE is real and also scaffold-sensitive. Do not treat missing SWE-bench Verified as a published cell.' },
    ],
    sources: [
      { label: 'DeepSeek launch post', url: 'https://www.deepseek.com/news/deepseek-v4-1-flash/' },
      { label: 'API changelog', url: 'https://api-docs.deepseek.com/updates' },
      { label: 'Hugging Face weights + card', url: 'https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash' },
      { label: 'OmniaKey review', url: 'https://omniakey.com/blog/deepseek-v4-1-flash-review' },
    ],
    gallery: [
      img('dsv41-agentic.png', 'Figure 1a — agentic benchmarks vs frontier counterparts (DeepSeek model card).', 'deepseek-ai / Hugging Face'),
      img('dsv41-kvcache.png', 'Figure 1b — global KV cache bytes/token across DeepSeek generations.', 'deepseek-ai / Hugging Face'),
    ],
  }
}

function deepseekV4(model: CodingModel): StudyDossier {
  const role = /reasoner/.test(model.id) ? 'Reasoner (long think)' : /coder/.test(model.id) ? 'Coder' : 'Chat'
  return {
    official: [
      { label: 'Generation', value: 'DeepSeek V4 — Chat / Coder / Reasoner (not V4.1)' },
      { label: 'This row', value: `${model.name} · ${role}` },
      { label: 'Context', value: '128K tokens typical for the V4 chat/coder/reasoner ids' },
      { label: 'Modalities', value: 'Text-first. Use V4.1 Flash for native images.' },
      { label: 'API note', value: 'V4 Flash ids now route to V4.1 Flash. V4 Chat/Coder/Reasoner remain the older generation line.' },
    ],
    architecture: [
      `${model.name} is the V4 generation — distinct from V4.1 Flash, Pro, and Vision.`,
      'V4 Flash (the old flash id) was a 284B-class MoE with 13B active on the base card. V4 Pro base was 1.6T / 49B active. V4.1 Flash replaced that flash line with 552B CED.',
      'If you want the 2026 daily driver — 1M context, vision, Flash pricing — pick DeepSeek V4.1 Flash, not this row.',
    ],
    did: [
      'V4 Flash instruct card (retired line): Terminal-Bench 2.1 82.7, DeepSWE 54.4, CyberGym 76.7 — the V4.1 Flash card is higher on those agent exams.',
      'V4 Pro instruct: GPQA 92.4, DeepSWE 62.7. That Pro id currently routes to V4.1 Flash on DeepSeek’s API until V4.1 Pro ships.',
      `${role}: ${model.strength}`,
    ],
    benchmarkTitle: 'V4 line vs V4.1 Flash (vendor instruct card)',
    benchmarkNote: 'Figures from the V4.1 Flash model card comparison columns. V4 Chat/Coder/Reasoner are the older named line.',
    benchmarkHeaders: ['Exam', 'V4 Flash', 'V4 Pro', 'V4.1 Flash'],
    benchmarkRows: [
      ['GPQA Diamond', '89.9', '92.4', '90.9'],
      ['Terminal-Bench 2.1', '82.7', '87.9', '90.6'],
      ['DeepSWE v1.1', '54.4', '62.7', '74.2'],
      ['CyberGym', '76.7', '83.3', '88.1'],
    ],
    reviews: [
      { source: 'DeepSeek API changelog', quote: 'V4 Flash and V4 Flash Vision Exp retired; names temporarily route to V4.1 Flash.' },
      { source: 'DeepSeek API', quote: 'V4 Chat, Coder, and Reasoner are the V4 generation — separate from V4.1 Flash.' },
    ],
    sources: [
      { label: 'DeepSeek V4.1 Flash post (lineage)', url: 'https://www.deepseek.com/news/deepseek-v4-1-flash/' },
      { label: 'API updates', url: 'https://api-docs.deepseek.com/updates' },
    ],
    gallery: [
      img('dsv41-kvcache.png', 'KV cache history — V4 Flash is the generation V4.1 compressed against.', 'deepseek-ai / Hugging Face'),
      img('dsv41-agentic.png', 'Agentic benchmark comparison — V4.1 Flash vs older V4 Flash / Pro columns.', 'deepseek-ai / Hugging Face'),
    ],
  }
}

function openaiFrontier(model: CodingModel): StudyDossier {
  const astra = /gpt-6|astra/.test(model.id)
  const g56 = /gpt-5\.6|luna|sol|terra/.test(model.id)
  return {
    official: [
      { label: 'Provider', value: 'OpenAI' },
      { label: 'This row', value: model.name },
      { label: 'GPT-6 Astra (family flagship)', value: '1,050,000 context · 128,000 max output · knowledge cutoff 30 Apr 2026 · effort low…max' },
      { label: 'GPT-5.6 family', value: 'Sol flagship, Terra everyday, Luna cheapest. Long-context MRCR published on openai.com/index/gpt-5-6' },
      { label: 'List price (Astra Standard)', value: '$10 / $50 per 1M in/out; 2× input surcharge above 272K input' },
      { label: 'Modalities', value: 'Text + image in, text out on frontier GPT-6 / 4o-class rows' },
    ],
    architecture: [
      astra
        ? 'OpenAI documents GPT-6 Astra as the most capable model for hard end-to-end work: reasoning, coding, computer use, research, documents. reasoning.effort: low, medium, high, xhigh, max.'
        : g56
          ? 'GPT-5.6 ships as Sol / Terra / Luna — generation number plus a durable tier name. Sol is the flagship; Luna is cost-efficient; Terra sits in between. ultra coordinates multiple agents on Sol.'
          : `${model.name} sits in OpenAI’s frontier coding lineup. Docs to read: GPT-5.6 family page and GPT-6 Astra API page.`,
      'Artificial Analysis (reported Sep 2026) put GPT-6 Astra (max) and Grok 4.6 (high) both at Intelligence 61 — same index, very different list price.',
      'Use this model when the job is worth OpenAI flagship spend — long context, hard reasoning, or production-critical code.',
    ],
    did: [
      'GPT-5.6 Sol long-context (OpenAI): MRCR v2 8-needle 256K–512K 91.5%; 512K–1M 73.8%; GraphWalks BFS 1M f1 77.1%.',
      'GPT-6 Astra: 1.05M window, 128K out. Independent write-ups flag verbosity (large output token counts on index evals) as a cost driver.',
      `${model.name}: ${model.strength} Cost tier ${model.cost}.`,
    ],
    benchmarkTitle: 'OpenAI published long-context (GPT-5.6 family)',
    benchmarkNote: 'From openai.com/index/gpt-5-6 — not every GPT row has a first-party cell. Astra context/output from developers.openai.com.',
    benchmarkHeaders: ['Eval', 'GPT-5.6 Sol', 'GPT-5.6 Terra', 'GPT-5.6 Luna', 'GPT-5.5'],
    benchmarkRows: [
      ['MRCR v2 256K–512K', '91.5%', '89.6%', '41.3%', '81.5%'],
      ['MRCR v2 512K–1M', '73.8%', '72.5%', '41.3%', '74%'],
      ['GraphWalks BFS 256k', '90.7%', '76.9%', '81.3%', '73.7%'],
      ['GraphWalks BFS 1M', '77.1%', '71.2%', '51.2%', '45.4%'],
    ],
    reviews: [
      { source: 'OpenAI GPT-5.6 page', quote: 'Sol is the new flagship; Terra balanced; Luna most cost-efficient. Stronger computer use and design judgment on Sol.' },
      { source: 'OpenAI GPT-6 Astra docs', quote: 'Most capable model, built for the hardest end-to-end work. 1.05M context.' },
      { source: 'Orca Router (Astra vs Grok 4.6)', quote: 'Same AA Intelligence 61 as Grok 4.6 (high), at roughly 5× input list price. Speed for Astra not yet published on that index.' },
    ],
    sources: [
      { label: 'GPT-5.6 family', url: 'https://openai.com/index/gpt-5-6/' },
      { label: 'GPT-6 Astra API', url: 'https://developers.openai.com/api/docs/models/gpt-6-astra' },
      { label: 'Astra vs Grok 4.6', url: 'https://www.orcarouter.ai/blog/gpt-6-astra-vs-grok-4-6' },
    ],
    gallery: openaiGallery(model),
  }
}

function claudePack(model: CodingModel): StudyDossier {
  const five = /claude-(opus|sonnet|fable)-5/.test(model.id)
  return {
    official: [
      { label: 'Provider', value: 'Anthropic · Claude' },
      { label: 'This row', value: model.name },
      { label: 'Generation', value: five ? 'Claude 5 (Sonnet 5 / Opus 5 / Fable 5.x)' : 'Claude 4.x (Haiku / Sonnet / Opus 4.5–4.8)' },
      { label: 'Typical context', value: '200K tokens for Claude ids unless the live API advertises more' },
      { label: 'Sampling note', value: 'Opus 4.7+ / Sonnet 5 / Opus 5 / Fable 5 omit non-default temperature on Anthropic’s API' },
    ],
    architecture: [
      five
        ? 'Claude 5 is the 2025–2026 quality line: Sonnet 5 for the day, Opus 5 for the hardest Claude coding, Fable 5 / 5.1 for long careful writing and design.'
        : 'Claude 4.x still covers Haiku (fast reviews), Sonnet 4.5/4.6 (day-to-day), Opus 4.5–4.8 (architecture). Newer 5-series models sit above them.',
      'On DeepSeek’s V4.1 Flash card, Claude Opus 5.0 is the comparison column for many agent exams (Terminal-Bench 2.1 89.1, DeepSWE 74.0, Chartography 84.0, BabyVision 94.1).',
      `${model.strength} Cost ${model.cost}. Skip this id for one-line renames.`,
    ],
    did: [
      'Opus 5.0 vendor-comparison cells (DeepSeek card, max effort): GPQA 93.4, HLE 56.3, Terminal-Bench 2.1 89.1, DeepSWE 74.0, ProgramBench 37.0, NL2Repo 75.3.',
      'Visual-agent column: Chartography 84.0, BabyVision 94.1, ZeroBench 52.0 — strongest vision-agent numbers in that table.',
      'Fable rows are the writing/design classroom, not the cheapest flash classroom.',
    ],
    benchmarkTitle: 'Claude Opus 5.0 as listed on the DeepSeek V4.1 Flash card',
    benchmarkNote: 'These are DeepSeek’s comparison column for Opus-5.0, not Anthropic’s own press table. Useful as a public cross-model snapshot from Sep 2026.',
    benchmarkHeaders: ['Exam', 'Opus 5.0', 'GPT-5.6 Sol', 'V4.1 Flash'],
    benchmarkRows: [
      ['GPQA Diamond', '93.4', '94.1', '90.9'],
      ['HLE', '56.3', '44.5', '36.8'],
      ['Terminal-Bench 2.1', '89.1', '88.8', '90.6'],
      ['DeepSWE v1.1', '74.0', '73.0', '74.2'],
      ['NL2Repo-Bench', '75.3', '56.8', '64.0'],
      ['Chartography w/ tools', '84.0', '79.9', '78.9'],
      ['BabyVision w/ tools', '94.1', '88.9', '89.6'],
    ],
    reviews: [
      { source: 'Anthropic', quote: `${model.name}: ${model.strength}` },
      { source: 'DeepSeek V4.1 Flash card (comparison)', quote: 'Opus 5.0 leads several reasoning and visual-agent columns; Flash leads some cheap-agent columns (AutomationBench, Agent’s Last Exam).' },
    ],
    sources: [
      { label: 'Claude Opus 4.5 announcement', url: 'https://www.anthropic.com/news/claude-opus-4-5' },
      { label: 'Anthropic console', url: 'https://console.anthropic.com/settings/keys' },
      { label: 'V4.1 Flash comparison table', url: 'https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash' },
    ],
    gallery: claudeGallery(model),
  }
}

function grokPack(model: CodingModel): StudyDossier {
  const g46 = /grok-4\.6/.test(model.id)
  return {
    official: [
      { label: 'Provider', value: 'xAI · Grok' },
      { label: 'This row', value: model.name },
      { label: 'Grok 4.6 (family flagship)', value: '500,000 context · no published text output cap · knowledge cutoff 1 Feb 2026' },
      { label: 'Modalities', value: 'Text + image in, text out' },
      { label: 'List price (4.6)', value: '$2 / $6 per 1M in/out under 200k prompt; $4 / $12 for the full request at ≥200k' },
      { label: 'Reasoning', value: 'low / medium / high (default) / xhigh' },
      { label: 'Grok 4.20 family', value: 'Fast / Reasoning / Multi-agent variants — huge-context option up to 2M tokens' },
    ],
    architecture: [
      g46
        ? 'xAI documents Grok 4.6 as the frontier model for coding, agentic tasks, and knowledge work. Recommend prompt_cache_key so cache hits stick to one server.'
        : `${model.name} is a Grok coding model. The 4.6 docs are the current flagship card; 4.20 rows advertise the huge-context / multi-agent split.`,
      'Independent AA snapshot (Sep 2026): Grok 4.6 (high) Intelligence 61 — level with GPT-6 Astra (max) at a much lower list price. Measured ~64.9 output tok/s on that harness.',
    ],
    did: [
      'Grok 4.6: 500K window, tools include function calling, web search, X search, code execution (xAI docs).',
      'Pricing cliff at 200k prompt tokens — do not compare a short Grok invoice to a 1M Astra run.',
      `${model.strength} Cost ${model.cost}.`,
    ],
    benchmarkTitle: 'Public flagship snapshot (Grok 4.6 vs GPT-6 Astra)',
    benchmarkNote: 'Docs + independent index commentary (Orca Router, MyClaw). Not every Grok variant has its own published table.',
    benchmarkHeaders: ['Field', 'Grok 4.6', 'GPT-6 Astra'],
    benchmarkRows: [
      ['Context', '500K', '~1.05M'],
      ['Max output', 'No published cap', '128K'],
      ['List in/out (short prompt)', '$2 / $6', '$10 / $50'],
      ['AA Intelligence (reported)', '61 (high)', '61 (max)'],
      ['Modalities', 'Text + image → text', 'Text + image → text'],
    ],
    reviews: [
      { source: 'xAI Grok 4.6 docs', quote: 'Frontier model for coding, agentic tasks, and knowledge work. 500K context. Cache key strongly recommended.' },
      { source: 'Orca Router', quote: 'Same AA score as Astra, ~5× cheaper on input list price. Astra speed unpublished on that index at time of writing.' },
    ],
    sources: [
      { label: 'Grok 4.6 docs', url: 'https://docs.x.ai/developers/grok-4-6' },
      { label: 'Grok vs Astra pricing', url: 'https://myclaw.ai/blog/grok-4-6-vs-gpt-6-astra' },
    ],
    gallery: grokGallery(model),
  }
}

function genericPack(model: CodingModel): StudyDossier {
  const gallery =
    model.provider === 'openai'
      ? openaiGallery(model)
      : model.provider === 'anthropic'
        ? claudeGallery(model)
        : model.provider === 'xai'
          ? grokGallery(model)
          : model.provider === 'deepseek'
            ? [
                img('dsv41-agentic.png', 'DeepSeek V4.1 Flash agentic benchmarks (official Hugging Face model card).', 'deepseek-ai / Hugging Face'),
                img('dsv41-kvcache.png', 'DeepSeek KV cache compression across generations.', 'deepseek-ai / Hugging Face'),
              ]
            : [img('openai-gpt56-hero.png', 'Reference frontier coding model art from OpenAI’s public blog.', 'OpenAI · openai.com')]
  return {
    official: [
      { label: 'Provider', value: model.provider },
      { label: 'Catalog id', value: model.id },
      { label: 'Cost tier', value: model.cost },
      { label: 'Strength', value: model.strength },
    ],
    architecture: [
      `${model.name} is a full API model row. Public vendor cards vary by id; this study grades speed, cost, vision, and multi-file fit so you can pick it on purpose.`,
      'Re-run prompts on your own stack. Vendor tables and working-grade bars are maps, not the territory.',
    ],
    did: [`${model.strength} Best first job: everyday coding with concrete file output (html/css/js).`],
    benchmarkTitle: 'Model profile — no separate vendor table for this id',
    benchmarkNote: 'Use the working-grade bars and the family comparison table on this page.',
    benchmarkHeaders: ['Field', 'Value'],
    benchmarkRows: [
      ['Name', model.name],
      ['Cost', model.cost],
      ['Strength', model.strength],
    ],
    reviews: [{ source: 'Provider docs', quote: model.strength }],
    sources: [{ label: model.provider, url: model.keys || 'https://soumtok.com' }],
    gallery,
  }
}

export function studyDossier(model: CodingModel): StudyDossier {
  const id = model.id.toLowerCase()
  if (/deepseek-v4-flash|deepseek-v4-pro/.test(id)) return deepseekV41(model)
  if (/deepseek-chat|deepseek-coder|deepseek-reasoner/.test(id)) return deepseekV4(model)
  if (model.provider === 'anthropic') return claudePack(model)
  if (model.provider === 'xai') return grokPack(model)
  if (model.provider === 'openai') return openaiFrontier(model)
  return genericPack(model)
}
