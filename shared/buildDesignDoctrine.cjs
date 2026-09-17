/**
 * Soumtok design & build doctrine — applies to EVERY scaffold:
 * websites, web apps, dashboards, APIs, CLI, games, data, fullstack.
 */

/** Copy markers that scream "AI template". */
const GENERIC_COPY_PATTERNS = [
  /\blorem ipsum\b/i,
  /\belevate your\b/i,
  /\bunlock the power\b/i,
  /\bseamless(ly)?\b/i,
  /\bcutting[\s-]?edge\b/i,
  /\bgame[\s-]?changer\b/i,
  /\brevolutionary\b/i,
  /\bworld[\s-]?class\b/i,
  /\bnext[\s-]?gen(eration)?\b/i,
  /\btransform your\b/i,
  /\bleverage\b/i,
  /\brobust solution\b/i,
  /\bempower\b/i,
  /\bstreamline your workflow\b/i,
  /\bplaceholder\b/i,
  /\bclick here\b/i,
  /\bwidget\b/i,
  /\bfeature[\s-]?rich\b/i,
  /\bget started today\b/i,
  /\byour journey\b/i,
  /\bwe help you\b/i,
]

/** Visual clichés (websites / dashboards). */
const GENERIC_VISUAL_PATTERNS = [
  /linear-gradient\([^)]*#(?:6366f1|8b5cf6|a855f7)/i,
  /font-family:\s*['"]?Inter['"]?\s*,\s*system-ui/i,
  /\bhero__chip\b.*\bhero__chip\b.*\bhero__chip\b/i,
]

/** Canonical structure by build kind — agent must follow order. */
const PAGE_ORDER = {
  website: [
    '1. Header — wordmark, 3–5 nav links, one primary CTA',
    '2. Hero — one h1, one line of support, 2 buttons, 16:9 image',
    '3. Trust — max 3 stats (no infinite marquee)',
    '4. Primary offer — features / products / menu (the main job)',
    '5. Proof — brief story OR process (specific nouns)',
    '6. Social proof — max 3 quotes with name + role',
    '7. Final CTA band + footer',
  ],
  multipage: [
    '1. Shared header/footer on every page (layout module — not copy-paste)',
    '2. Home — hero + preview cards linking to inner pages',
    '3. About — story + values (prose, specific nouns)',
    '4. Menu/Services — filterable grid or list with prices/details',
    '5. Contact — form + hours + map/address link',
    '6. vite.config.ts multi-input for all .html entries',
    '7. motion.ts — page-enter + data-reveal + prefers-reduced-motion',
  ],
  ecommerce: [
    '1. Header + cart badge',
    '2. Hero or category headline',
    '3. Product grid (6+ items, price, Add to cart)',
    '4. Cart drawer/summary with checkout CTA (mock OK)',
    '5. Footer',
  ],
  portfolio: [
    '1. Header + contact link',
    '2. Hero — name/role in one line',
    '3. Work grid (6+ projects, image + tag + title)',
    '4. About (short, specific)',
    '5. Contact CTA',
  ],
  docs: [
    '1. Sidebar TOC (all sections listed)',
    '2. Prose main column (h2/h3 hierarchy)',
    '3. Code blocks monospace + copy-friendly',
    '4. Mobile: collapsible sidebar',
  ],
  'web-app': [
    '1. App shell — nav/sidebar with active state',
    '2. Primary task UI first (input + list + actions)',
    '3. Empty state when no data',
    '4. Loading/error states if async',
    '5. Settings only if user asked',
  ],
  dashboard: [
    '1. Sidebar (4–6 items) + page title',
    '2. KPI row (3–4 metrics, label + value + delta)',
    '3. Primary table or chart area with 5+ realistic rows',
    '4. Mobile: collapsible nav, stacked KPIs',
  ],
  backend: [
    '1. GET /health → { ok: true, version? }',
    '2. Resource routes with validation',
    '3. JSON errors { error, code? } + 404 handler',
    '4. README curl example per route',
    '5. .env.example for PORT/secrets',
  ],
  fullstack: [
    '1. API /health on documented port (e.g. 3001)',
    '2. Vite UI on 5173 fetching API (CORS if split)',
    '3. UI shows real data from API — not hardcoded fake only',
    '4. README documents both servers + npm scripts',
  ],
  cli: [
    '1. --help documents every flag',
    '2. Sensible defaults when args missing',
    '3. Exit 0 success / 1 usage error / 2 runtime',
    '4. README with copy-paste examples',
  ],
  data: [
    '1. data/ file with consistent schema',
    '2. Script computes stats (never invent numbers)',
    '3. analysis.md cites computed output',
  ],
  game: [
    '1. Start screen or immediate playable state',
    '2. Input loop (keyboard/touch/readline)',
    '3. Score/progress visible',
    '4. Win/lose/restart flow',
    '5. README controls',
  ],
}

/** Rules that apply to every build type. */
const UNIVERSAL_BUILD_STANDARDS = [
  'GROUND TRUTH: user message defines the product — never substitute a generic todo/calc/landing.',
  'CODE SHAPE: split across files (src/sections/*, src/components/*, src/routes/*) — no 400-line monoliths.',
  'VERIFY: run in terminal (npm run dev, node index.js, curl /health) before claiming done.',
  'README: exact install + run commands + ports + what was built.',
  'COPY: specific nouns and numbers — zero lorem, zero buzzwords (see Forbidden).',
  'UI (when visual): :root design tokens, 44px touch targets, :focus-visible, 820px + 480px breakpoints.',
  'MOTION (when visual): subtle reveal/hover only + prefers-reduced-motion guard.',
  'API (when backend): never Hello-World-only — health + at least one real resource.',
  'CLI (when terminal): --help + meaningful exit codes.',
]

const GLOBAL_FORBIDDEN = [
  'Purple/indigo gradient + Inter-only (default AI SaaS skin)',
  'Infinite marquee or 5+ floating pill chips',
  'Three identical testimonial cards',
  'Emoji as UI icons in professional builds',
  'Monolithic 300-line index.html instead of src/ modules',
  'Plan or chat code without write/terminal in the same session',
  'Placeholder TODO stubs where real logic was requested',
  'Claiming done without terminal proof (URL, curl, or command output)',
]

/**
 * @param {{ templateId?: string, category?: string, userText?: string }} [ctx]
 * @returns {keyof typeof PAGE_ORDER}
 */
function resolveDoctrineKey(ctx = {}) {
  const id = String(ctx.templateId || '')
  const cat = String(ctx.category || '')
  const t = String(ctx.userText || '').toLowerCase()

  if (id === 'saas-dashboard' || /\b(dashboard|admin\s*panel|analytics|metrics|back[\s-]?office)\b/.test(t)) {
    return 'dashboard'
  }
  if (cat === 'backend' || /-(api)|rest-api|hono-api|node-api/.test(id) || /\b(express|fastify|rest\s*api|graphql)\b/.test(t)) {
    return 'backend'
  }
  if (
    cat === 'cli' ||
    id === 'node-cli' ||
    id === 'python-cli' ||
    /\b(cli|command[\s-]?line|terminal\s*tool|argv|stdin|typer|click)\b/.test(t)
  ) {
    return 'cli'
  }
  if (cat === 'data' || id === 'data-analysis' || /\b(csv|dataset|sql|analytics\s*report)\b/.test(t)) return 'data'
  if (
    cat === 'game' ||
    id === 'browser-game' ||
    id === '3d-browser-sim' ||
    id === 'console-game' ||
    /\b(game|arcade|snake|tetris|pong|puzzle|platformer|console\s*game|text\s*adventure)\b/.test(t)
  ) {
    return 'game'
  }
  if (cat === 'fullstack' || id === 'fullstack-vite-api') return 'fullstack'
  if (id === 'ecommerce-storefront' || /\b(ecommerce|shop|storefront|checkout)\b/.test(t)) return 'ecommerce'
  if (
    id === 'multi-page-static-site' ||
    /\b(multi[\s-]?page|several\s*pages|multiple\s*pages|about\s*page|contact\s*page)\b/.test(t)
  ) {
    return 'multipage'
  }
  if (id === 'portfolio-site' || /\b(portfolio|agency|showcase)\b/.test(t)) return 'portfolio'
  if (id === 'docs-site' || /\b(docs?\s*site|documentation|help\s*center|wiki)\b/.test(t)) return 'docs'
  if (
    cat === 'web-app' ||
    id === 'react-vite-app' ||
    id === 'todo-app' ||
    id === 'calculator' ||
    /\b(react|spa|todo|calculator|web\s*app)\b/.test(t)
  ) {
    return 'web-app'
  }
  return 'website'
}

/** Short block — injected on every greenfield build turn. */
function composeUniversalBuildStandards() {
  return [
    'SOUMTOK BUILD STANDARDS (every build — website, app, API, dashboard, CLI, game, data):',
    ...UNIVERSAL_BUILD_STANDARDS.map((r) => `• ${r}`),
    'Forbidden: plan-only responses, monolithic files, generic buzzword copy, unverified "done".',
  ].join('\n')
}

/**
 * @param {string} [categoryOrKey]
 * @param {{ templateId?: string, category?: string, userText?: string }} [ctx]
 */
function composeDesignDoctrineBrief(categoryOrKey, ctx = {}) {
  const key = ctx.templateId || ctx.category || ctx.userText
    ? resolveDoctrineKey({ ...ctx, category: ctx.category || categoryOrKey, templateId: ctx.templateId })
    : resolveDoctrineKey({ category: categoryOrKey, userText: ctx.userText })
  const order = PAGE_ORDER[key] || PAGE_ORDER.website

  const uiRules =
    key === 'backend' || key === 'cli' || key === 'data'
      ? []
      : [
          'DESIGN SYSTEM: :root tokens (bg, surface, text, muted, accent, border, radius). Max 2 font families.',
          'MOTION: data-reveal or subtle hover; always guard prefers-reduced-motion.',
          'IMAGES: hero/banner 16:9; products 4:3 or 1:1; always alt text.',
        ]

  return [
    '═══════════════════════════════════════════════════════════',
    'SOUMTOK DESIGN DOCTRINE (mandatory for this build kind)',
    '═══════════════════════════════════════════════════════════',
    '',
    'Universal:',
    ...UNIVERSAL_BUILD_STANDARDS.map((r) => `• ${r}`),
    ...(uiRules.length ? ['', 'Visual UI:', ...uiRules.map((r) => `• ${r}`)] : []),
    '',
    `Structure order (${key}):`,
    ...order.map((line) => `  ${line}`),
    '',
    'Forbidden:',
    ...GLOBAL_FORBIDDEN.map((f) => `  ✗ ${f}`),
  ].join('\n')
}

/**
 * @param {string} combinedSource
 * @returns {string[]}
 */
function detectGenericMarkers(combinedSource) {
  const failures = []
  const body = String(combinedSource || '')
  for (const re of GENERIC_COPY_PATTERNS) {
    if (re.test(body)) failures.push(`Generic copy: ${re.source.slice(0, 36)}`)
  }
  for (const re of GENERIC_VISUAL_PATTERNS) {
    if (re.test(body)) failures.push(`Generic visual: ${re.source.slice(0, 36)}`)
  }
  if ((body.match(/reveal|fade-in|animate|@keyframes/gi) || []).length > 0 && !/prefers-reduced-motion/i.test(body)) {
    failures.push('Motion without prefers-reduced-motion guard')
  }
  return failures.slice(0, 8)
}

/**
 * @param {string} source
 * @param {'backend'|'cli'|'web-app'|'game'} kind
 * @returns {string[]}
 */
function detectBuildKindGaps(source, kind) {
  const body = String(source || '')
  const failures = []
  if (kind === 'backend') {
    if (!/\/health|healthcheck|health_check/i.test(body)) failures.push('API missing /health route')
    if (/hello world|Hello World/i.test(body) && !/routes|router|\.get\(|\.post\(/i.test(body)) {
      failures.push('API is Hello-World-only — add resource routes')
    }
  }
  if (kind === 'cli') {
    if (!/--help|usage:|printHelp|showHelp|argparse|parseArgs/i.test(body)) {
      failures.push('CLI missing --help / usage documentation')
    }
  }
  if (kind === 'web-app') {
    if (/fetch\(|axios|api\./i.test(body) && !/loading|empty|error/i.test(body)) {
      failures.push('Async UI missing loading/empty/error state')
    }
  }
  if (kind === 'game') {
    if (!/requestAnimationFrame|readline|game loop|while \(.*running/i.test(body)) {
      failures.push('Game missing clear loop (rAF/readline/game loop)')
    }
  }
  return failures
}

module.exports = {
  GENERIC_COPY_PATTERNS,
  GENERIC_VISUAL_PATTERNS,
  PAGE_ORDER,
  UNIVERSAL_BUILD_STANDARDS,
  GLOBAL_FORBIDDEN,
  resolveDoctrineKey,
  composeUniversalBuildStandards,
  composeDesignDoctrineBrief,
  detectGenericMarkers,
  detectBuildKindGaps,
}
