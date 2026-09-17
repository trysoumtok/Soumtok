/**
 * Soumtok Build Template Library — single source of truth for code-building patterns.
 * Used by: Desktop harness, Studio planner (via knowledgeBase.ts), completeness verifier.
 *
 * Blueprint specs live here. Proven starter *files* live in /templates (see starterPath).
 */
const { templateProvenance, starterExists } = require('./templateLoader.cjs')
const {
  composeDesignDoctrineBrief,
  composeUniversalBuildStandards,
  resolveDoctrineKey,
  GLOBAL_FORBIDDEN,
} = require('./buildDesignDoctrine.cjs')

const UNIVERSAL_MUST_HAVE = [
  'Terminal verification before claiming done (dev server URL, curl, or command output)',
  'README with exact install + run commands',
  'Split implementation across files — no monolithic single file',
]

function finishLineForTemplate(tpl) {
  const cat = tpl?.category || ''
  const kind = tpl?.scaffoldKind || ''
  if (cat === 'backend' || kind === 'node-api') {
    return 'Finish: npm install → npm start → curl /health + resource routes documented in README.'
  }
  if (cat === 'cli' || kind === 'node-cli' || kind === 'python-cli') {
    return 'Finish: run with --help → demo the happy path in terminal → summarize usage.'
  }
  if (cat === 'data') {
    return 'Finish: run analysis script → paste computed stats into analysis.md.'
  }
  if (cat === 'game' && kind === 'console-game') {
    return 'Finish: npm start → playable demo in terminal → README controls.'
  }
  return 'Finish: npm install → npm run dev → localhost URL or terminal demo + summary.'
}

function mergedAntiPatterns(tpl) {
  const own = tpl?.antiPatterns || []
  const base = [
    'Generic buzzword marketing copy',
    'Plan without write/terminal execution',
    'Stub TODO-only files',
  ]
  return [...new Set([...own, ...base, ...GLOBAL_FORBIDDEN.slice(0, 4)])]
}

/** @typedef {'website'|'web-app'|'backend'|'cli'|'game'|'data'|'fullstack'} TemplateCategory */

/**
 * @typedef {Object} BuildTemplate
 * @property {string} id
 * @property {TemplateCategory} category
 * @property {string} title
 * @property {RegExp} match
 * @property {number} [priority] higher wins when multiple match
 * @property {string} [scaffoldKind] buildDirector kind: web-vite | node-api | python-cli | node-cli | console-game
 * @property {{ framework: string, styling: string, language: string, extras?: string }} stack
 * @property {string[]} fileTree
 * @property {string[]} deliverables
 * @property {string[]} mustHave
 * @property {string[]} steps
 * @property {string[]} guidelines
 * @property {string[]} [components] UI modules to create
 * @property {string[]} [antiPatterns]
 * @property {string} [starterPath] vendored folder under /templates
 */

/** Proven starter folder per template id (MIT — see each templates folder SOURCE.md). */
const STARTER_BY_ID = {
  'landing-page': 'landing-marketing',
  'cafe-restaurant-site': 'cafe-restaurant',
  'multi-page-static-site': 'multi-page-site',
  'portfolio-site': 'landing-marketing',
  'docs-site': 'landing-marketing',
  'ecommerce-storefront': 'landing-marketing',
  'react-vite-app': 'vite-react-ts',
  'saas-dashboard': 'saas-dashboard',
  'todo-app': 'todo-app',
  'calculator': 'calculator',
  'browser-game': 'vite-vanilla-ts',
  '3d-browser-sim': 'vite-vanilla-ts',
  'node-rest-api': 'node-express-api',
  'hono-api': 'hono-api',
  'node-cli': 'node-cli',
  'python-cli': 'python-cli',
  'console-game': 'console-game',
  'fullstack-vite-api': 'vite-vanilla-ts',
  'data-analysis': 'node-cli',
  'generic-code-project': 'vite-vanilla-ts',
}

/** Default proven starter when a template has scaffoldKind but no explicit override. */
const SCAFFOLD_DEFAULT_STARTERS = {
  'web-vite': 'vite-vanilla-ts',
  'node-api': 'node-express-api',
  'python-cli': 'python-cli',
  'node-cli': 'node-cli',
  'console-game': 'console-game',
}

/** @type {BuildTemplate[]} */
const BUILD_TEMPLATES = [
  // ─── WEBSITES ─────────────────────────────────────────────────────────────
  {
    id: 'landing-page',
    category: 'website',
    title: 'Single-page marketing landing',
    match: /\b(landing\s*page|one[\s-]?page\s*(site|website)|marketing\s*page|hero\s*section)\b/i,
    priority: 70,
    scaffoldKind: 'web-vite',
    stack: { framework: 'Vite', styling: 'CSS custom properties in src/style.css', language: 'TypeScript' },
    fileTree: ['package.json', 'index.html', 'src/main.ts', 'src/style.css', 'public/favicon.svg', 'README.md'],
    deliverables: [
      'package.json — vite, typescript, scripts.dev on port 5173',
      'index.html — viewport meta, favicon, semantic structure',
      'src/style.css — :root tokens, 820px + 480px breakpoints, 8px spacing scale',
      'src/main.ts — mount Header, Hero, Features (3+), CTA, Footer',
      'public/favicon.svg',
      'README.md — install, dev, localhost URL',
    ],
    mustHave: [
      'Section order: Header → Hero → Features → CTA → Footer',
      'Sticky header: logo/wordmark, nav links, primary CTA button',
      'Hero: h1, one support line, 2 buttons, 16:9 image (not square)',
      'Features: 3+ cards with specific copy (not buzzwords)',
      'src/sections/*.ts modules + src/motion.ts scroll reveal',
      'Google Fonts (max 2 families), :root tokens',
      'Responsive — no horizontal scroll at 375px',
    ],
    steps: [
      'Scaffold Vite + TS (or use SCAFFOLD ON DISK)',
      'Design system in src/style.css',
      'Implement sections in src/main.ts or src/sections/*.ts',
      'npm install → npm run dev → report localhost URL',
    ],
    guidelines: [
      'Max content width ~1200px centered',
      'Buttons min-height 44px, visible :focus states',
      'One h1 only; section headings h2/h3',
      'Images: loading="lazy", object-fit cover',
    ],
    components: ['Header', 'Hero', 'Features', 'CTA', 'Footer'],
    antiPatterns: [
      'Single index.html with inline <style> only',
      'Placeholder gray boxes instead of photos',
      '1:1 square hero image or aspect-ratio 1/1 on hero photo',
    ],
  },
  {
    id: 'cafe-restaurant-site',
    category: 'website',
    title: 'Cafe / restaurant / food business site',
    match: /\b(cafe|coffee|restaurant|bakery|bistro|menu|bar\b|food\s*truck|pizza)\b/i,
    priority: 85,
    scaffoldKind: 'web-vite',
    stack: { framework: 'Vite', styling: 'Warm editorial CSS', language: 'TypeScript', extras: 'Unsplash food photography' },
    fileTree: ['package.json', 'index.html', 'src/main.ts', 'src/style.css', 'src/sections/menu.ts', 'README.md'],
    deliverables: [
      'All landing-page files plus menu/hours section',
      'Menu section: 6+ items with name, price, short description',
      'Visit/location block with hours + address (fictional OK if not provided)',
      'Brand-appropriate color palette in :root (warm browns, cream, accent)',
    ],
    mustHave: [
      'Section order: Header → Hero → Menu (order) → Story → Visit → Footer',
      'Hero image: generate_image({ prompt, path: "assets/generated/hero-coffee.png", aspect: "16:9" })',
      'Menu: 6+ items in categories (drinks/food/beans) with Add to order buttons + bag count',
      'Scroll reveal via data-reveal + prefers-reduced-motion guard',
      'Primary CTA: Order for pickup / Visit — not vague "Get started"',
      'Mobile nav hamburger under 820px',
      'npm run dev works on localhost:5173',
    ],
    steps: [
      'Scaffold src/sections/* + src/motion.ts + src/cart.ts',
      'Brand CSS tokens + subtle motion',
      'Hero → menu (conversion first) → story → visit',
      'Dev server + URL',
    ],
    guidelines: [
      'Real menu names and prices — no lorem, no buzzwords',
      'Trust row: 3 stats max under hero — no infinite marquee',
      'Prefer src/sections/*.ts — never 300-line index.html monolith',
    ],
    components: ['Header', 'Hero', 'MenuGrid', 'OrderBag', 'Story', 'Visit', 'Footer'],
    antiPatterns: [
      'Floating emoji chips on hero',
      'Marquee repeating same four phrases',
      'Reviews section before menu on a cafe site',
      '1:1 hero image',
      'Generic copy: elevate, seamless, cutting-edge',
    ],
  },
  {
    id: 'multi-page-static-site',
    category: 'website',
    title: 'Multi-page marketing site (MPA)',
    match: /\b(multi[\s-]?page|several\s*pages|multiple\s*pages|static\s*site|html\s*site|about\s*page|contact\s*page|services\s*page|pages:\s*|about\.html)\b/i,
    priority: 78,
    scaffoldKind: 'web-vite',
    stack: {
      framework: 'Vite MPA (multi HTML entries)',
      styling: 'src/style.css + :root tokens',
      language: 'TypeScript',
      extras: 'src/shared/layout.ts · src/motion.ts',
    },
    fileTree: [
      'index.html',
      'about.html',
      'menu.html',
      'contact.html',
      'vite.config.ts',
      'src/style.css',
      'src/motion.ts',
      'src/shared/layout.ts',
      'src/pages/home.ts',
      'src/pages/about.ts',
      'src/pages/menu.ts',
      'src/pages/contact.ts',
      'README.md',
    ],
    deliverables: [
      '4+ HTML pages (home, about, menu/services, contact) with vite.config.ts rollup input for each',
      'Shared header/footer via src/shared/layout.ts with active nav state per page',
      'src/motion.ts scroll reveal + page-enter animation + prefers-reduced-motion',
      'Each page has real content — not a one-line stub',
      '16:9 hero on home (generate_image → public/assets/hero.jpg optional)',
    ],
    mustHave: [
      'vite.config.ts lists every .html in build.rollupOptions.input',
      'Header nav links all pages; active page highlighted (.is-active)',
      'data-reveal scroll animation on sections',
      'Design tokens in :root — editorial typography (not Inter-only SaaS skin)',
      'Contact page: form + hours + location/map link',
    ],
    steps: [
      'Scaffold from templates/multi-page-site — keep MPA structure',
      'Customize copy per page from user brief',
      'Wire shared layout + motion on every page entry',
      'Add hero image 16:9 if visual brand requested',
      'npm run dev → click through all nav links',
    ],
    guidelines: [
      'One concern per page — do not cram entire site into index.html',
      'Reuse layout.ts — never duplicate header/footer strings across 4 files by hand',
      'Subtle motion only; guard prefers-reduced-motion',
    ],
    components: ['SharedHeader', 'SharedFooter', 'PageHero', 'MenuGrid', 'ContactForm', 'Motion'],
    antiPatterns: [
      'Single scroll-spy landing pretending to be multi-page',
      'Duplicate header HTML pasted into every file instead of layout.ts',
      'Missing vite.config multi-input — breaks production build',
      'Stub pages with only "Coming soon"',
    ],
  },
  {
    id: 'portfolio-site',
    category: 'website',
    title: 'Portfolio / agency / creative site',
    match: /\b(portfolio|agency|designer|photographer|creative|showcase|my\s*work)\b/i,
    priority: 72,
    scaffoldKind: 'web-vite',
    stack: { framework: 'Vite', styling: 'Editorial CSS grid', language: 'TypeScript' },
    fileTree: ['src/main.ts', 'src/style.css', 'src/sections/work-grid.ts', 'README.md'],
    deliverables: ['Work/project grid (6+ tiles)', 'About section', 'Contact section or mailto CTA'],
    mustHave: [
      'Order: Header → Hero (role line) → Work grid → About → Contact',
      'Project cards with image + title + tag (6+ items)',
      'Responsive grid (1 col mobile, 2–3 desktop)',
      'Editorial typography — not default system-ui only',
    ],
    steps: ['Scaffold', 'Work grid', 'About + contact', 'Polish + dev server'],
    guidelines: ['Case study links can be # anchors if no real URLs'],
    components: ['Header', 'WorkGrid', 'About', 'Contact', 'Footer'],
    antiPatterns: ['Placeholder gray boxes', 'Lorem project titles'],
  },
  {
    id: 'docs-site',
    category: 'website',
    title: 'Documentation / help site',
    match: /\b(docs?\s*site|documentation|help\s*center|knowledge\s*base|wiki)\b/i,
    priority: 68,
    scaffoldKind: 'web-vite',
    stack: { framework: 'Vite', styling: 'Readable prose CSS', language: 'TypeScript' },
    fileTree: ['src/main.ts', 'src/style.css', 'src/docs/content.ts', 'README.md'],
    deliverables: ['Sidebar nav', 'Main prose area', '3+ doc sections with headings', 'Code block styling'],
    mustHave: [
      'Sidebar lists all sections (TOC matches content)',
      'Prose hierarchy h2/h3, readable line length',
      'Monospace code blocks with padding + contrast',
      'Mobile collapsible sidebar',
    ],
    steps: ['Layout shell', 'Write doc content from user topic', 'Style prose', 'Dev server'],
    guidelines: ['Short paragraphs, h2/h3 structure', 'Table of contents in sidebar'],
    components: ['Sidebar', 'DocContent', 'CodeBlock'],
    antiPatterns: ['Wall of text without headings', 'Empty doc sections'],
  },

  // ─── WEB APPS ─────────────────────────────────────────────────────────────
  {
    id: 'react-vite-app',
    category: 'web-app',
    title: 'React + Vite + TypeScript app',
    match: /\b(react|jsx|tsx|component|spa|single[\s-]?page\s*app)\b/i,
    priority: 65,
    scaffoldKind: 'web-vite',
    stack: { framework: 'Vite + React 18', styling: 'CSS modules or Tailwind if user asked', language: 'TypeScript' },
    fileTree: ['package.json', 'src/main.tsx', 'src/App.tsx', 'src/components/', 'src/lib/types.ts', 'README.md'],
    deliverables: [
      'package.json with react, react-dom, @vitejs/plugin-react',
      'src/App.tsx — app shell',
      'src/components/ — one file per component (<250 lines)',
      'src/lib/ — shared types and helpers',
    ],
    mustHave: [
      'src/components/* — one component per file (<250 lines)',
      'Typed props — no any',
      'Loading + empty + error states if fetching data',
      'Keyboard accessible controls, :focus-visible',
      ':root tokens or cohesive CSS — not unstyled defaults',
    ],
    steps: ['Add React to Vite scaffold', 'App shell', 'Feature components', 'npm run dev'],
    guidelines: ['Import order: react, lib, components, styles', 'Use useState/useEffect appropriately'],
    components: ['App', 'Layout', 'FeatureViews'],
    antiPatterns: ['Everything in App.tsx', 'Untyped props as any'],
  },
  {
    id: 'saas-dashboard',
    category: 'web-app',
    title: 'SaaS dashboard / admin UI',
    match: /\b(dashboard|admin\s*panel|saas|analytics|metrics|back[\s-]?office)\b/i,
    priority: 78,
    scaffoldKind: 'web-vite',
    stack: { framework: 'Vite + TS', styling: 'Dark sidebar + light content or full dark', language: 'TypeScript' },
    fileTree: ['src/layout/DashboardShell.ts', 'src/components/Sidebar.ts', 'src/components/StatCards.ts', 'src/style.css'],
    deliverables: ['Sidebar navigation (4+ items)', 'Top bar with title', 'Main area with stat cards or chart placeholder', 'Responsive collapse sidebar on mobile'],
    mustHave: [
      'Sidebar + main layout with active nav state',
      '3+ KPI cards with label, value, and delta (+12% style)',
      'Data table with 5+ realistic rows (names, dates, status badges)',
      'Typography: not default system-ui only — pick one clean sans',
      'Subtle hover on rows/cards; no purple gradient chrome',
    ],
    steps: ['Layout shell', 'Sidebar + KPI row', 'Table/chart area', 'Dev server'],
    guidelines: ['Fake but realistic metric numbers', 'Empty state if table filter returns zero'],
    components: ['Sidebar', 'TopBar', 'StatCards', 'DataTable'],
    antiPatterns: ['All-gray dashboard with no hierarchy', 'Placeholder "Chart goes here" without table fallback'],
  },
  {
    id: 'todo-app',
    category: 'web-app',
    title: 'Todo / task list app',
    match: /\b(todo|to[\s-]?do|task\s*list|checklist|tasks?\s*app)\b/i,
    priority: 82,
    scaffoldKind: 'web-vite',
    stack: { framework: 'Vite + TS', styling: 'Clean minimal CSS', language: 'TypeScript' },
    fileTree: ['src/main.ts', 'src/todo.ts', 'src/style.css'],
    deliverables: ['Add task input', 'Task list with check/complete', 'Filter: all / active / done', 'Persist to localStorage optional'],
    mustHave: [
      'Add / complete / delete / filter all work',
      'Empty state when list is zero',
      'State logic in src/todo.ts separate from DOM',
      'Polished CSS tokens — not raw browser defaults',
    ],
    steps: ['Scaffold', 'Todo state logic', 'UI list + input', 'Polish'],
    guidelines: ['Separate state logic from DOM updates'],
    components: ['TodoInput', 'TodoList', 'TodoFilter'],
    antiPatterns: ['Alert() for errors', 'Single 300-line main.ts'],
  },

  // ─── INTERACTIVE / GAMES ──────────────────────────────────────────────────
  {
    id: 'calculator',
    category: 'web-app',
    title: 'Calculator app',
    match: /\b(calculator|calc\b|math\s*app|arithmetic)\b/i,
    priority: 90,
    scaffoldKind: 'web-vite',
    stack: { framework: 'Vite + TS', styling: 'Dark theme CSS variables', language: 'TypeScript' },
    fileTree: ['src/utils/calc.ts', 'src/main.ts', 'src/style.css'],
    deliverables: ['src/utils/calc.ts — +, −, ×, ÷, clear', 'Display + button grid UI', 'Keyboard support'],
    mustHave: [
      'Logic in src/utils/calc.ts — UI in main.ts',
      'All digits + operators + equals + clear work',
      'Divide by zero shows Error',
      'Keyboard support + 44px+ buttons',
      'Distinct dark theme (not default white page)',
    ],
    steps: ['Calc logic module', 'UI grid', 'Keyboard listeners', 'npm run dev'],
    guidelines: ['Monospace display font', 'Dark bg #0b0b0a accent #f54e00'],
    components: ['Display', 'Keypad'],
    antiPatterns: ['All logic inline in main.ts', 'Unstyled HTML buttons'],
  },
  {
    id: 'browser-game',
    category: 'game',
    title: 'Browser canvas game',
    match: /\b(game|arcade|snake|tetris|pong|puzzle|platformer)\b/i,
    priority: 60,
    scaffoldKind: 'web-vite',
    stack: { framework: 'Vite + Canvas or DOM', styling: 'Game CSS', language: 'TypeScript' },
    fileTree: ['src/game/loop.ts', 'src/game/state.ts', 'src/game/input.ts', 'src/main.ts'],
    deliverables: ['Game loop (requestAnimationFrame)', 'Update + draw separated', 'Score on screen', 'Start / game over states'],
    mustHave: [
      'src/game/* — loop, state, input separated',
      'requestAnimationFrame loop — playable, not static',
      'Score/progress on screen',
      'Start / game over / restart flow',
    ],
    steps: ['Scaffold', 'Game state', 'Loop + render', 'Input + HUD'],
    guidelines: ['Keep update() pure where possible'],
    components: ['GameLoop', 'Renderer', 'Input', 'HUD'],
    antiPatterns: ['Screenshot-only fake game', 'Entire game in one file'],
  },
  {
    id: '3d-browser-sim',
    category: 'game',
    title: '3D WebGL / Three.js simulation',
    match: /\b(3d|three\.?js|webgl|rubik|cube\s*sim|simulation)\b/i,
    priority: 88,
    scaffoldKind: 'web-vite',
    stack: { framework: 'Vite + Three.js', styling: 'Minimal', language: 'TypeScript', extras: 'three npm package' },
    fileTree: ['src/scene.ts', 'src/main.ts', 'package.json with three'],
    deliverables: ['Three.js scene + camera + lights', 'Orbit controls or auto-rotate', 'Simulation logic in separate module'],
    mustHave: [
      'three.js from npm — WebGL canvas renders',
      'Scene + camera + lights in dedicated module',
      'Interactive (orbit/drag) or animated loop',
      'Simulation logic separate from render setup',
    ],
    steps: ['Scaffold + three dep', 'Scene setup', 'Simulation logic', 'Dev server'],
    guidelines: ['Import three from npm — no CDN in production code'],
    components: ['Scene', 'Controls', 'Simulation'],
    antiPatterns: ['2D CSS div pretending to be 3D', 'Empty canvas with no lights'],
  },

  // ─── BACKENDS ─────────────────────────────────────────────────────────────
  {
    id: 'node-rest-api',
    category: 'backend',
    title: 'Node.js REST API',
    match: /\b(api|rest\s*api|express|fastify|backend|endpoint|json\s*server)\b/i,
    priority: 75,
    scaffoldKind: 'node-api',
    stack: { framework: 'Express or Fastify', styling: 'n/a', language: 'JavaScript or TypeScript' },
    fileTree: ['package.json', 'src/index.js', 'src/routes/', 'README.md', '.env.example'],
    deliverables: ['GET /health → 200 JSON', 'At least 1 resource route (GET + POST)', 'PORT from process.env', 'README curl examples'],
    mustHave: [
      'GET /health returns JSON { ok: true }',
      'At least one resource route (GET + POST)',
      'express.json(), error middleware, 404 handler',
      'README curl example for every route',
    ],
    steps: ['package.json + express', 'Health route', 'Resource routes', 'Test with curl in terminal'],
    guidelines: ['Use express.json() for POST bodies', 'Never hardcode secrets'],
    antiPatterns: ['Hello World only server', 'No error handler'],
  },
  {
    id: 'hono-api',
    category: 'backend',
    title: 'Hono / lightweight TypeScript API',
    match: /\b(hono|edge\s*api|cloudflare\s*worker|serverless\s*api)\b/i,
    priority: 80,
    scaffoldKind: 'node-api',
    stack: { framework: 'Hono', styling: 'n/a', language: 'TypeScript' },
    fileTree: ['src/index.ts', 'package.json', 'README.md'],
    deliverables: ['Hono app with /health', 'Typed routes', 'Export fetch handler or node serve'],
    mustHave: ['GET /health', 'Typed routes', 'TypeScript strict', 'README curl examples'],
    steps: ['Scaffold hono', 'Routes', 'Test locally'],
    guidelines: ['Use zod-validator if validation needed'],
    antiPatterns: ['Untyped any routes', 'Missing /health'],
  },

  // ─── CLI / TERMINAL ───────────────────────────────────────────────────────
  {
    id: 'node-cli',
    category: 'cli',
    title: 'Node.js CLI tool',
    match: /\b(cli|command[\s-]?line|terminal\s*app|stdin|argv|script\s*tool)\b/i,
    priority: 45,
    scaffoldKind: 'node-cli',
    stack: { framework: 'Node ESM', styling: 'n/a', language: 'JavaScript' },
    fileTree: ['package.json', 'index.js', 'README.md'],
    deliverables: ['Parse argv or read stdin', '--help output', 'Sensible exit codes', 'README usage examples'],
    mustHave: ['--help documents all flags', 'Exit codes documented', 'Handles missing args gracefully'],
    steps: ['Entry + arg parse', 'Core logic', 'Help + README', 'Test in terminal'],
    guidelines: ['Use process.argv or util.parseArgs'],
    antiPatterns: ['No help text', 'Silent failure on bad input'],
  },
  {
    id: 'python-cli',
    category: 'cli',
    title: 'Python CLI application',
    match: /\b(python|pygame|flask|django|typer|click)\b/i,
    priority: 86,
    scaffoldKind: 'python-cli',
    stack: { framework: 'Python 3', styling: 'n/a', language: 'Python' },
    fileTree: ['main.py', 'requirements.txt', 'README.md'],
    deliverables: ['main.py with if __name__ guard', 'requirements.txt', 'README with python main.py'],
    mustHave: ['Runs without ImportError', 'argparse or click if args needed'],
    steps: ['requirements.txt', 'main.py', 'Test python main.py'],
    guidelines: ['Keep deps minimal'],
  },
  {
    id: 'console-game',
    category: 'game',
    title: 'Terminal / console game',
    match: /\b(console\s*game|terminal\s*game|text\s*adventure|ascii\s*game)\b/i,
    priority: 76,
    scaffoldKind: 'console-game',
    stack: { framework: 'Node readline', styling: 'ANSI optional', language: 'JavaScript' },
    fileTree: ['index.js', 'package.json', 'README.md'],
    deliverables: ['Interactive loop in terminal', 'Win/lose conditions', 'README controls'],
    mustHave: ['User input each turn', 'Clear output', 'Exit command'],
    steps: ['Game loop', 'Input handling', 'README'],
    guidelines: ['Use readline or prompt-sync sparingly'],
  },

  // ─── FULLSTACK / DATA ─────────────────────────────────────────────────────
  {
    id: 'fullstack-vite-api',
    category: 'fullstack',
    title: 'Full-stack Vite frontend + Node API',
    match: /\b(full[\s-]?stack|frontend\s*and\s*backend|vite\s*\+\s*api|monorepo)\b/i,
    priority: 77,
    scaffoldKind: 'web-vite',
    stack: { framework: 'Vite + Express', styling: 'CSS + REST', language: 'TypeScript', extras: 'Concurrent dev scripts' },
    fileTree: ['package.json', 'src/', 'server/index.ts', 'README.md'],
    deliverables: ['Vite frontend in src/', 'API in server/ with /health', 'package.json scripts for dev:web + dev:api or concurrent', 'Frontend fetches API on localhost'],
    mustHave: [
      'server/ API with /health',
      'Frontend fetch to API with loading/error UI',
      'CORS if split ports',
      'README documents both npm scripts + ports',
    ],
    steps: ['Scaffold frontend', 'Add server/', 'Wire fetch from UI', 'Document ports'],
    guidelines: ['API default port 3001, Vite 5173'],
    antiPatterns: ['Frontend hardcoded fake data only', 'Undocumented ports'],
  },
  {
    id: 'ecommerce-storefront',
    category: 'website',
    title: 'E-commerce / shop storefront',
    match: /\b(e[\s-]?commerce|ecommerce|shop|store|product\s*grid|cart|checkout)\b/i,
    priority: 74,
    scaffoldKind: 'web-vite',
    stack: { framework: 'Vite + TS', styling: 'Product grid CSS', language: 'TypeScript' },
    fileTree: ['src/sections/products.ts', 'src/cart.ts', 'src/style.css'],
    deliverables: ['Product grid (6+ products with image, price, name)', 'Add to cart UI (local state OK)', 'Cart summary drawer or page'],
    mustHave: [
      'Order: Header+cart → Products grid → Cart summary',
      '6+ products with image, price, Add to cart',
      'Cart badge updates live',
      'Checkout CTA (mock OK)',
    ],
    steps: ['Product data', 'Grid UI', 'Cart state', 'Dev server'],
    components: ['ProductGrid', 'ProductCard', 'CartDrawer'],
    antiPatterns: ['Products without prices', 'Cart that never updates'],
  },
  {
    id: 'data-analysis',
    category: 'data',
    title: 'Data / CSV analysis project',
    match: /\b(csv|dataset|data\s*analysis|spreadsheet|sql|analytics\s*report)\b/i,
    priority: 65,
    scaffoldKind: 'node-cli',
    stack: { framework: 'Node or Python', styling: 'n/a', language: 'JS or Python' },
    fileTree: ['data/sample.csv', 'analysis.md', 'index.js or analyze.py'],
    deliverables: ['data.csv or sample data file', 'analysis.md with findings', 'Script that reads and summarizes data'],
    mustHave: ['Consistent column names', 'Method documented', 'Summary statistics or charts described'],
    steps: ['Create/load data', 'Analysis script', 'Write analysis.md'],
    guidelines: ['No invented statistics — compute from data'],
  },

  // ─── DEFAULT FALLBACK ─────────────────────────────────────────────────────
  {
    id: 'generic-code-project',
    category: 'web-app',
    title: 'General code project',
    match: /\b(build|make|create|implement|scaffold|project|app)\b/i,
    priority: 1,
    scaffoldKind: 'web-vite',
    stack: { framework: 'Vite + TypeScript', styling: 'CSS', language: 'TypeScript' },
    fileTree: ['package.json', 'src/main.ts', 'README.md'],
    deliverables: ['Working files matching user request', 'README with run instructions'],
    mustHave: [
      'Matches user request literally — not a random substitute app',
      'Code runs without syntax errors',
      'README explains how to run',
      'Follows SOUMTOK DESIGN DOCTRINE for detected build kind',
    ],
    steps: ['Detect build kind', 'Use proven starter if available', 'Verify in terminal', 'Summarize'],
    guidelines: ['Split code across files', 'No placeholders where real logic expected'],
    antiPatterns: ['Generic todo/calc when user asked for something else'],
  },
]

/** Always available — even when no template regex matches. */
function composeFallbackBuildBrief(userText) {
  const tpl = detectBuildTemplate(userText)
  const key = resolveDoctrineKey({
    templateId: tpl?.id,
    category: tpl?.category,
    userText,
  })
  return [composeDesignDoctrineBrief(key, { templateId: tpl?.id, category: tpl?.category, userText }), composeUniversalBuildStandards()].join(
    '\n\n',
  )
}

/**
 * @param {string} userText
 * @returns {BuildTemplate | null}
 */
function detectBuildTemplate(userText) {
  const t = String(userText || '')
  if (!t.trim()) return null
  /** @type {BuildTemplate | null} */
  let best = null
  let bestScore = -1
  const pool = BUILD_TEMPLATES.filter((tpl) => tpl.id !== 'generic-code-project')
  for (const tpl of pool) {
    if (!tpl.match.test(t)) continue
    const specificity = tpl.match.source.replace(/\\b/g, '').length
    const score = (tpl.priority || 1) * 10 + specificity
    if (score > bestScore) {
      best = tpl
      bestScore = score
    }
  }
  if (best) return best
  const fallback = BUILD_TEMPLATES.find((tpl) => tpl.id === 'generic-code-project')
  if (fallback?.match.test(t)) return fallback
  return null
}

/** @param {string} userText */
function patternDeliverables(userText) {
  const tpl = detectBuildTemplate(userText)
  if (!tpl) return []
  return [...(tpl.fileTree || []), ...(tpl.deliverables || [])]
}

/** @param {BuildTemplate | null | undefined} tpl */
function resolveStarterPath(tpl) {
  if (!tpl) return null
  const byId = STARTER_BY_ID[tpl.id]
  if (byId && starterExists(byId)) return byId
  const byKind = tpl.scaffoldKind ? SCAFFOLD_DEFAULT_STARTERS[tpl.scaffoldKind] : null
  if (byKind && starterExists(byKind)) return byKind
  return byId || byKind || null
}

/** @param {string} id */
function getTemplateById(id) {
  return BUILD_TEMPLATES.find((t) => t.id === id) || null
}

/** @param {string} userText */
function composeTemplateBrief(userText) {
  const tpl = detectBuildTemplate(userText)
  if (!tpl) return composeFallbackBuildBrief(userText)
  const starterPath = resolveStarterPath(tpl)
  const provenance = starterPath ? templateProvenance(starterPath) : null
  const lines = [
    '═══════════════════════════════════════════════════════════',
    'SOUMTOK BUILD TEMPLATE LIBRARY — follow this blueprint exactly',
    '═══════════════════════════════════════════════════════════',
    `Template: ${tpl.id} — ${tpl.title}`,
    `Category: ${tpl.category}`,
    `Stack: ${tpl.stack.framework} · ${tpl.stack.styling} · ${tpl.stack.language}${tpl.stack.extras ? ` · ${tpl.stack.extras}` : ''}`,
    tpl.scaffoldKind ? `Scaffold kind: ${tpl.scaffoldKind} (use SCAFFOLD ON DISK if present)` : '',
    starterPath
      ? `Proven starter: templates/${starterPath}/ (MIT — extend and customize for the user, do not replace with empty placeholders)`
      : '',
    provenance?.sourceUrl ? `Starter source: ${provenance.sourceUrl} (${provenance.license})` : '',
    '',
    'File tree (every path must exist with real content):',
    ...(tpl.fileTree || []).map((f) => `  • ${f}`),
    '',
    'Deliverables:',
    ...(tpl.deliverables || []).map((d) => `  • ${d}`),
    '',
    'Must have (verify before done):',
    ...UNIVERSAL_MUST_HAVE.map((m) => `  • ${m}`),
    ...(tpl.mustHave || []).map((m) => `  • ${m}`),
    '',
    'Build steps:',
    ...(tpl.steps || []).map((s, i) => `  ${i + 1}. ${s}`),
    '',
    'Guidelines:',
    ...(tpl.guidelines || []).map((g) => `  • ${g}`),
  ]
  if (tpl.components?.length) {
    lines.push('', 'UI components to implement:', ...tpl.components.map((c) => `  • ${c}`))
  }
  const anti = mergedAntiPatterns(tpl)
  if (anti.length) {
    lines.push('', 'Forbidden:', ...anti.map((a) => `  ✗ ${a}`))
  }
  lines.push('', finishLineForTemplate(tpl))
  const doctrine = composeDesignDoctrineBrief(
    resolveDoctrineKey({ templateId: tpl.id, category: tpl.category, userText }),
    { templateId: tpl.id, category: tpl.category, userText },
  )
  return [doctrine, '', lines.filter(Boolean).join('\n')].join('\n')
}

/** Short blueprint when proven starter is already on disk (fast path). */
function composeTemplateBriefCompact(userText) {
  const tpl = detectBuildTemplate(userText)
  if (!tpl) return ''
  const starterPath = resolveStarterPath(tpl)
  const must = (tpl.mustHave || []).slice(0, 5).map((m) => `• ${m}`).join('\n')
  const key = resolveDoctrineKey({ templateId: tpl.id, category: tpl.category, userText })
  const doctrineOne = composeDesignDoctrineBrief(key, { templateId: tpl.id, category: tpl.category, userText })
    .split('\n')
    .slice(0, 12)
    .join('\n')
  return [
    composeUniversalBuildStandards(),
    doctrineOne,
    `FAST BUILD · ${tpl.id} — ${tpl.title}`,
    starterPath ? `Starter: templates/${starterPath}/ (on disk — customize, do not rebuild tree)` : '',
    must ? `Must-have:\n${must}` : '',
    finishLineForTemplate(tpl),
    `Structure: follow ${key} order in design doctrine.`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** @param {string} [category] */
function listTemplates(category) {
  if (!category) return BUILD_TEMPLATES.map((t) => ({ id: t.id, title: t.title, category: t.category }))
  return BUILD_TEMPLATES.filter((t) => t.category === category).map((t) => ({ id: t.id, title: t.title }))
}

module.exports = {
  BUILD_TEMPLATES,
  BUILD_PATTERNS: BUILD_TEMPLATES,
  STARTER_BY_ID,
  SCAFFOLD_DEFAULT_STARTERS,
  detectBuildTemplate,
  detectBuildPattern: detectBuildTemplate,
  getTemplateById,
  resolveStarterPath,
  patternDeliverables,
  composeTemplateBrief,
  composeTemplateBriefCompact,
  composeKnowledgeBrief: composeTemplateBrief,
  composeFallbackBuildBrief,
  composeUniversalBuildStandards,
  resolveDoctrineKey,
  listTemplates,
}
