/**
 * Soumtok harness — turn a vague "build X" request into a concrete file plan for the model.
 */
const fs = require('fs')
const path = require('path')

function parseBuildIntent(userText) {
  const raw = String(userText || '').trim()
  const t = raw.toLowerCase()
  let kind = 'node-cli'
  const wantsBrowser3d =
    /\b(3d|three\.?js|webgl|canvas|simulator|simulation|rubik|rubik'?s|cube)\b/.test(t) &&
    !/\b(cli|console app|terminal game)\b/.test(t)
  if (
    wantsBrowser3d ||
    /\b(next\.?js|react|website|web app|landing|dashboard|tailwind|vite|homepage|portfolio|saas|browser)\b/.test(t)
  ) {
    kind = 'web-vite'
  } else if (/\b(express|fastify|api|rest|backend|graphql)\b/.test(t)) kind = 'node-api'
  else if (/\b(electron|desktop app)\b/.test(t)) kind = 'electron'
  else if (/\b(python|pygame|flask|django|typer|click)\b/.test(t)) kind = 'python-cli'
  else if (/\b(puzzle|snake|tetris|game)\b/.test(t) && !/\b(web|browser|3d)\b/.test(t)) kind = 'console-game'
  else if (/\b(cli|console|terminal|command line|stdin)\b/.test(t)) kind = 'node-cli'

  const title = raw.split(/[.!?\n]/)[0].slice(0, 120) || 'New project'
  const features = []
  const acceptance = []

  if (kind === 'web-vite') {
    features.push('Vite + TypeScript. App code only under src/. Root stays: package.json, tsconfig, vite.config, index.html, README.')
    if (wantsBrowser3d) {
      features.push('3D in the browser with three.js — orbit, the simulation the USER asked for (not a 2D CSS fake).')
    } else {
      features.push('UI the USER asked for (landing, dashboard, etc. — not a canned template).')
    }
    features.push('npm run dev on port 5173 (easiest localhost).')
    acceptance.push('terminal("npm install") then terminal("npm run dev") → read_terminal shows http://localhost:5173')
  } else if (kind === 'console-game') {
    features.push('Clear game loop in terminal', 'Keyboard or line-based input', 'Win/lose or score output')
    acceptance.push('`node` (or npm start) runs playable session in terminal')
  } else if (kind === 'node-cli') {
    features.push('Shebang or npm bin entry', 'Parse argv or stdin', 'Help text (--help)', 'Sensible exit codes')
    acceptance.push('Document usage in README', 'Runs via `node <entry>` or npm script')
  } else if (kind === 'node-api') {
    features.push('Express (or similar) server', 'JSON routes + health check', 'PORT from env default 3000')
    acceptance.push('GET /health returns 200', 'README with curl examples')
  } else if (kind === 'python-cli') {
    features.push('pyproject.toml or requirements.txt', 'Entry module with main()', 'README')
    acceptance.push('python entry runs without import errors')
  }

  if (/\binteractive|repl|play|playable\b/.test(t)) {
    features.push('Interactive session (not one-shot print-only unless user asked)')
  }

  return { raw, title, kind, features, acceptance, wantsBrowser3d }
}

function isPreviewableBuildKind(kind) {
  return ['web-vite', 'web-next', 'node-api', 'electron'].includes(kind)
}

function isRunnableInTerminalKind(kind) {
  return ['node-cli', 'console-game', 'python-cli', 'node-api'].includes(kind)
}

function filesPlanForIntent(intent, greenfield) {
  const { kind } = intent
  /** @type {{ path: string, purpose: string, notes?: string }[]} */
  const files = []

  if (kind === 'web-vite') {
    files.push(
      { path: 'package.json', purpose: 'vite + typescript' + (intent.wantsBrowser3d ? ' + three' : '') + ', scripts.dev' },
      { path: 'tsconfig.json', purpose: 'strict TS for src/' },
      { path: 'vite.config.ts', purpose: 'Vite root config' },
      { path: 'index.html', purpose: 'mounts src/main.ts' },
      { path: 'src/style.css', purpose: 'app styles' },
      { path: 'src/main.ts', purpose: 'entry — imports domain modules, no logic dump in one file' },
    )
    if (intent.wantsBrowser3d) {
      const cubeish = /\b(rubik|cube)\b/i.test(intent.raw)
      files.push(
        cubeish
          ? { path: 'src/cube.ts', purpose: 'cube state, faces, moves — imported by cube3d' }
          : { path: 'src/sim.ts', purpose: 'simulation state for what the user asked' },
        cubeish
          ? { path: 'src/cube3d.ts', purpose: 'three.js mesh, orbit controls, render loop' }
          : { path: 'src/scene.ts', purpose: 'three.js scene + camera + lights' },
      )
    }
    files.push({ path: 'README.md', purpose: 'npm install then npm run dev → localhost:5173' })
  } else if (kind === 'console-game' || kind === 'node-cli') {
    files.push(
      { path: 'package.json', purpose: 'name, type module if ESM, scripts.start + bin if CLI', notes: '"start": "node index.js"' },
      { path: 'README.md', purpose: 'what it is, install, run, controls/examples' },
      { path: 'index.js', purpose: 'main entry' },
    )
    if (intent.features.some((f) => /test/i.test(f))) {
      files.push({ path: 'test/smoke.test.js', purpose: 'minimal node:test or node assert smoke' })
    }
  } else if (kind === 'node-api') {
    files.push(
      { path: 'package.json', purpose: 'express dependency, start script' },
      { path: 'src/index.js', purpose: 'create app, listen, /health' },
      { path: 'README.md', purpose: 'env PORT, curl examples' },
      { path: '.env.example', purpose: 'PORT=3000 optional' },
    )
  } else if (kind === 'python-cli') {
    files.push(
      { path: 'requirements.txt', purpose: 'minimal deps' },
      { path: 'main.py', purpose: 'CLI entry' },
      { path: 'README.md', purpose: 'python main.py usage' },
    )
  } else {
    files.push(
      { path: 'package.json', purpose: 'project metadata + start script' },
      { path: 'README.md', purpose: 'how to run' },
      { path: 'index.js', purpose: 'implementation' },
    )
  }

  if (!greenfield) {
    return files.filter((f) => f.path !== 'package.json' || greenfield)
  }
  return files
}

function listScratchDiagnosticFiles(folder) {
  if (!folder) return []
  try {
    return fs.readdirSync(folder).filter((n) => /^_.*\.(js|cjs|mjs)$/i.test(n))
  } catch {
    return []
  }
}

function workspaceLooksMessy(folder, workspaceScan) {
  if (!folder) return false
  const scratch = listScratchDiagnosticFiles(folder)
  if (scratch.length >= 2) return true
  let names = []
  try {
    names = fs.readdirSync(folder)
  } catch {
    return scratch.length > 0
  }
  const testLike = names.filter((n) => /test|verify|check|diag|ping|_/.test(n) && /\.(js|cjs|mjs)$/i.test(n))
  if (testLike.length > 4) return true
  if (scratch.length >= 1 && names.includes('server.js') && names.includes('cube.js')) return true
  if (String(workspaceScan || '').includes('_') && scratch.length >= 1) return true
  return false
}

function readPackageJson(folder) {
  if (!folder) return null
  try {
    return JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}

/** Enrich kind from package.json — never override the user's stated app (e.g. Rubik) unless text is vague. */
function inferIntentForFolder(folder, userText) {
  const intent = parseBuildIntent(userText)
  if (!folder) return intent
  const t = String(userText || '').toLowerCase()
  const userNamedApp =
    /\b(rubik|rubik'?s|cube|todo|chat|blog|shop|dashboard|landing|snake|tetris)\b/.test(t) ||
    intent.kind !== 'node-cli'
  if (userNamedApp) return intent
  const pkg = readPackageJson(folder)
  if (!pkg) return intent
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
  const scripts = String(JSON.stringify(pkg.scripts || {})).toLowerCase()
  if (deps.next || deps['@next/']) return { ...intent, kind: 'web-vite', title: intent.title }
  if (deps.vite || /vite/.test(scripts)) return { ...intent, kind: 'web-vite', title: intent.title }
  if (deps.express || deps.fastify || deps['@nestjs/core']) {
    return { ...intent, kind: 'node-api', title: intent.title }
  }
  if (fs.existsSync(path.join(folder, 'web', 'index.html')) && fs.existsSync(path.join(folder, 'server.js'))) {
    return { ...intent, kind: 'node-api', title: intent.title || 'Web app in this folder' }
  }
  return intent
}

function pickRunCommandFromFolder(folder) {
  const pkg = readPackageJson(folder)
  if (pkg?.scripts && typeof pkg.scripts === 'object') {
    for (const name of ['dev', 'start', 'serve', 'preview', 'web']) {
      if (pkg.scripts[name]) return `npm run ${name}`
    }
  }
  try {
    if (fs.existsSync(path.join(folder, 'main.py'))) return 'python main.py'
    if (fs.existsSync(path.join(folder, 'server.js'))) return 'node server.js'
    if (fs.existsSync(path.join(folder, 'index.js'))) return 'node index.js'
    if (fs.existsSync(path.join(folder, 'src/index.js'))) return 'node src/index.js'
  } catch {
    /* ignore */
  }
  return 'npm start'
}

function projectDeliversInBrowser(intent, folder) {
  if (isPreviewableBuildKind(intent?.kind)) return true
  const pkg = readPackageJson(folder)
  if (!pkg?.scripts) return false
  const s = pkg.scripts
  return Boolean(s.dev || s.preview || s.serve || (s.start && /vite|next|webpack|nuxt|astro/i.test(String(s.start))))
}

function composeMessyRecoveryBrief(userText, folder, workspaceScan, intent) {
  const scratch = listScratchDiagnosticFiles(folder)
  const scratchLine = scratch.length ? scratch.join(', ') : '(any _*.js one-off scripts)'
  return `SOUMTOK MESSY WORKSPACE RECOVERY (harness — work IN THIS FOLDER, do not tell user to start a new folder):

USER REQUEST:
"${String(userText || 'make this project work').replace(/"/g, "'")}"

CONTEXT:
- Folder: ${folder}
- Messy/cluttered repo (extra diagnostics, partial fixes). Your job is to CLEAN UP IN PLACE and ship a working app.

RECOVERY PLAN (tools only — no menus, no new folder):
1. ANALYZE: list_dir + read package.json, README, main entry (index.js/server.js/src/), and test script — grep only as needed. Restate what the USER asked for (from their message), not a template app.
2. Consolidate: delete or stop using scratch files (${scratchLine}). Put real checks in one test file — do not add _ping.js / _verify.js / _diag.js.
3. write/diff until install/test/start work for THIS project shape.
4. terminal("npm install") if needed → terminal("npm test" or node test.js) when tests exist → terminal("${pickRunCommandFromFolder(folder)}").
5. read_terminal({ wait_ms: 20000 }) → if web app, give http://localhost:PORT; if CLI, show demo output.

ACCEPTANCE:
- Server listening (read_terminal shows port).
- Tests pass OR you removed/repaired the one broken test honestly.
- User can open browser to localhost without you asking "which option".

ANTI-PATTERNS:
- "Create a new folder" / "start fresh elsewhere" — forbidden.
- "Tell me which you want" — pick defaults and execute all steps.
- More than one new scratch _*.js file.
- Assuming Rubik/cube (or any app) when the user asked for something else — ground truth is USER REQUEST above.

Workspace scan snapshot:
${String(workspaceScan || '').slice(0, 4000)}`
}

function composeBuildDirectorBrief(userText, folder, workspaceScan) {
  const intent = inferIntentForFolder(folder, userText)
  const greenfield = !workspaceScan || /GREENFIELD|\(empty\)/i.test(String(workspaceScan))
  const messy = workspaceLooksMessy(folder, workspaceScan)
  if (messy) {
    return composeMessyRecoveryBrief(userText, folder, workspaceScan, intent)
  }
  const files = filesPlanForIntent(intent, greenfield)
  const fileLines = files.map((f, i) => `${i + 1}. write("${f.path}") — ${f.purpose}${f.notes ? ` (${f.notes})` : ''}`).join('\n')

  const featureLines = intent.features.length
    ? intent.features.map((f) => `- ${f}`).join('\n')
    : '- Match the user request literally; do not substitute a different app.'

  const acceptLines = intent.acceptance.length
    ? intent.acceptance.map((a) => `- ${a}`).join('\n')
    : '- User can run the project from README steps in integrated terminal.'

  const runCmd = pickRunCommandFromFolder(folder)
  const browser = projectDeliversInBrowser(intent, folder) || isPreviewableBuildKind(intent.kind)
  const tightWeb = intent.kind === 'web-vite'
  const layoutBlock = tightWeb
    ? `LAYOUT (tight tree — do not scatter files):
- Root only: package.json, tsconfig.json, vite.config.ts, index.html, README.md
- All implementation under src/ (main.ts + 1–4 domain files named for the feature). Extra src/*.ts is OK; extra roots are not.
- Never cube.js, server.js, web/, or test.js at repo root for a browser app.`
    : `LAYOUT:
- Conventional tree for ${intent.kind}. Put implementation in src/ when it is an app. Do not dump unrelated files at repo root.`

  return `SOUMTOK BUILD DIRECTOR (harness — follow exactly; do not ignore):

USER REQUEST (ground truth — build THIS, not a generic substitute):
"${intent.raw.replace(/"/g, "'")}"

PHASE 0 — INSPECT ONCE THEN WRITE:
- One list_dir of the workspace root. If package.json / README exist, read them. Then stop searching.
- Greenfield / empty folder: write() the layout now. Do not list_dir twice. Do not stop at a plan.
- If the repo already has files: extend them; skip duplicate package.json.

INTERPRETED GOAL (harness hint — override if user text says otherwise):
- Title: ${intent.title}
- Shape: ${intent.kind}${greenfield ? ' · GREENFIELD (empty workspace — create all files with write())' : ' · extend existing repo minimally'}

REQUIRED BEHAVIOR / FEATURES:
${featureLines}

${layoutBlock}

FILES TO CREATE ON DISK (write() each — chat fences do NOT count). Add domain files under src/ as needed:
${fileLines}

PHASE 1 — EXECUTE (tools only):
1. write() every needed file with complete, runnable content (no placeholders).
2. terminal("npm install") when package.json exists and deps may be missing — no permission ask.

PHASE 2 — VERIFY & AUTO-RUN (harness — do not ask "want me to run?"):
1. ${tightWeb ? 'terminal("npx tsc --noEmit") or read_lints — if TypeScript errors, diff() the same src/ files until clean.' : 'If tests exist: terminal("npm test") — fix with write/diff until green or honestly drop the broken test.'}
2. ${browser ? `terminal("${runCmd}") → read_terminal({ wait_ms: 20000 }) → reply with localhost URL and what they will see.` : `terminal("${runCmd}") or run the CLI entry → read_terminal if long-running → show demo output.`}
3. Never end with option menus — pick defaults and finish.

ACCEPTANCE (must pass before you stop):
${acceptLines}
- ${browser ? 'Dev server or static server was started (read_terminal shows Ready/URL).' : 'App ran in terminal with real output.'}

ANTI-PATTERNS (forbidden):
- Stopping after describing the plan or pasting code in chat without write().
- Building a generic todo app when user asked for something specific (${intent.title.slice(0, 60)}).
- Skipping README or package.json on greenfield Node projects.
- Creating many _diag.js / _ping.js / _verify.js scratch files.
- Creating cube.js, server.js, web/, or test.js at repo root for a browser/Vite app — put code in src/.
- Asking the user to choose between fix options — just fix and run.

Workspace folder: ${folder || '(unknown)'}`
}

function workspaceIsGreenfield(folder) {
  if (!folder) return false
  try {
    const names = fs.readdirSync(folder).filter((n) => n !== '.git' && n !== '.soumtok' && !n.startsWith('.'))
    if (!names.length) return true
    if (names.includes('package.json') || names.includes('src') || names.includes('index.html')) return false
    return names.every((n) => /\.(txt|md)$/i.test(n) || n === 'LICENSE')
  } catch {
    return false
  }
}

function contentsForPlan(intent) {
  const kind = intent?.kind || 'web-vite'
  const cubeish = Boolean(intent?.wantsBrowser3d && /\b(rubik|cube)\b/i.test(intent.raw || ''))
  const three = Boolean(intent?.wantsBrowser3d)
  const title = String(intent?.title || 'App').replace(/["<>]/g, '').slice(0, 60)
  if (kind === 'web-vite') {
    const deps = three
      ? `    "three": "^0.170.0"`
      : ''
    const files = [
      {
        path: 'package.json',
        content: `{
  "name": "app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 5173 --host",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --port 5173"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "vite": "^6.0.7"${three ? ',\n    "@types/three": "^0.170.0"' : ''}
  }${three ? `,\n  "dependencies": {\n${deps}\n  }` : ''}
}
`,
      },
      {
        path: 'tsconfig.json',
        content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src"]
}
`,
      },
      {
        path: 'vite.config.ts',
        content: `import { defineConfig } from 'vite'
export default defineConfig({ server: { port: 5173, host: true } })
`,
      },
      {
        path: 'index.html',
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
      },
      {
        path: 'src/style.css',
        content: `html, body, #app { margin: 0; height: 100%; background: #111; color: #eee; font-family: system-ui, sans-serif; }
canvas { display: block; width: 100%; height: 100%; }
`,
      },
    ]
    if (cubeish) {
      files.push(
        {
          path: 'src/cube.ts',
          content: `export type Face = 'U' | 'D' | 'F' | 'B' | 'L' | 'R'
export const FACES: Face[] = ['U', 'D', 'F', 'B', 'L', 'R']
export const FACE_COLOR: Record<Face, number> = {
  U: 0xffffff, D: 0xffd500, F: 0xc41e3a, B: 0xff5800, L: 0x0051ba, R: 0x009e60,
}
`,
        },
        {
          path: 'src/cube3d.ts',
          content: `import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { FACE_COLOR, type Face } from './cube'

export function mountCube(host: HTMLElement) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x141414)
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
  camera.position.set(3.2, 2.4, 3.6)
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  host.appendChild(renderer.domElement)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const key = new THREE.DirectionalLight(0xffffff, 1.15)
  key.position.set(4, 6, 3)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0x88aaff, 0.45)
  fill.position.set(-3, 1, -2)
  scene.add(fill)
  const geo = new THREE.BoxGeometry(1, 1, 1)
  const mats = (['R', 'L', 'U', 'D', 'F', 'B'] as Face[]).map(
    (f) => new THREE.MeshStandardMaterial({ color: FACE_COLOR[f], roughness: 0.35, metalness: 0.05 }),
  )
  const mesh = new THREE.Mesh(geo, mats)
  scene.add(mesh)
  const fit = () => {
    const w = host.clientWidth || window.innerWidth
    const h = host.clientHeight || window.innerHeight
    camera.aspect = w / Math.max(1, h)
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
  }
  window.addEventListener('resize', fit)
  fit()
  const tick = () => {
    mesh.rotation.y += 0.008
    controls.update()
    renderer.render(scene, camera)
    requestAnimationFrame(tick)
  }
  tick()
}
`,
        },
        {
          path: 'src/main.ts',
          content: `import './style.css'
import { mountCube } from './cube3d'
const app = document.querySelector<HTMLDivElement>('#app')
if (app) mountCube(app)
`,
        },
      )
    } else if (three) {
      files.push({
        path: 'src/main.ts',
        content: `import './style.css'
import * as THREE from 'three'
const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('#app missing')
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x111111)
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
camera.position.z = 3
const renderer = new THREE.WebGLRenderer({ antialias: true })
app.appendChild(renderer.domElement)
scene.add(new THREE.AmbientLight(0xffffff, 0.8))
const light = new THREE.DirectionalLight(0xffffff, 1)
light.position.set(2, 3, 4)
scene.add(light)
const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0x4ea1ff }))
scene.add(mesh)
const fit = () => {
  const w = app.clientWidth || window.innerWidth
  const h = app.clientHeight || window.innerHeight
  camera.aspect = w / Math.max(1, h)
  camera.updateProjectionMatrix()
  renderer.setSize(w, h, false)
}
window.addEventListener('resize', fit)
fit()
const tick = () => {
  mesh.rotation.y += 0.01
  renderer.render(scene, camera)
  requestAnimationFrame(tick)
}
tick()
`,
      })
    } else {
      files.push({
        path: 'src/main.ts',
        content: `import './style.css'
const app = document.querySelector<HTMLDivElement>('#app')
if (app) app.innerHTML = '<main style="padding:48px"><h1>${title}</h1><p>Ready on localhost:5173</p></main>'
`,
      })
    }
    files.push({
      path: 'README.md',
      content: `# ${title}\n\n\`\`\`\nnpm install\nnpm run dev\n\`\`\`\n\nOpen http://localhost:5173\n`,
    })
    return files
  }
  if (kind === 'node-api') {
    return [
      {
        path: 'package.json',
        content: `{
  "name": "app",
  "private": true,
  "type": "module",
  "scripts": { "start": "node src/index.js" },
  "dependencies": { "express": "^4.21.2" }
}
`,
      },
      {
        path: 'src/index.js',
        content: `import express from 'express'
const app = express()
const port = Number(process.env.PORT) || 3000
app.get('/health', (_req, res) => res.json({ ok: true }))
app.get('/', (_req, res) => res.json({ name: ${JSON.stringify(title)} }))
app.listen(port, () => console.log('http://localhost:' + port))
`,
      },
      { path: '.env.example', content: 'PORT=3000\n' },
      { path: 'README.md', content: `# ${title}\n\n\`\`\`\nnpm install\nnpm start\n\`\`\`\n\nGET /health\n` },
    ]
  }
  if (kind === 'python-cli') {
    return [
      { path: 'requirements.txt', content: '\n' },
      {
        path: 'main.py',
        content: `#!/usr/bin/env python3
import argparse
import sys

def main(argv=None):
    p = argparse.ArgumentParser(description=${JSON.stringify(title)})
    p.add_argument("text", nargs="*", help="optional words")
    args = p.parse_args(argv)
    line = " ".join(args.text) or sys.stdin.read().strip() or "hello"
    print(line)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
`,
      },
      { path: 'README.md', content: `# ${title}\n\npython main.py hello\n` },
    ]
  }
  if (kind === 'console-game') {
    return [
      {
        path: 'package.json',
        content: `{\n  "name": "app",\n  "private": true,\n  "type": "module",\n  "scripts": { "start": "node index.js" }\n}\n`,
      },
      {
        path: 'index.js',
        content: `import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
const rl = readline.createInterface({ input, output })
console.log(${JSON.stringify(title)})
const guess = await rl.question('type start: ')
console.log(guess.trim().toLowerCase() === 'start' ? 'playing' : 'bye')
rl.close()
`,
      },
      { path: 'README.md', content: `# ${title}\n\nnode index.js\n` },
    ]
  }
  return [
    {
      path: 'package.json',
      content: `{\n  "name": "app",\n  "private": true,\n  "type": "module",\n  "scripts": { "start": "node index.js" }\n}\n`,
    },
    { path: 'index.js', content: `console.log(${JSON.stringify(title)})\n` },
    { path: 'README.md', content: `# ${title}\n\nnode index.js\n` },
  ]
}

function applyGreenfieldScaffold(folder, userText) {
  const intent = inferIntentForFolder(folder, userText)
  if (!workspaceIsGreenfield(folder)) return { wrote: [], skipped: true, intent }
  const files = contentsForPlan(intent)
  const wrote = []
  for (const file of files) {
    const full = path.join(folder, file.path)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    if (fs.existsSync(full)) continue
    fs.writeFileSync(full, file.content, 'utf8')
    wrote.push(file.path)
  }
  return { wrote, skipped: false, intent }
}

module.exports = {
  parseBuildIntent,
  composeBuildDirectorBrief,
  filesPlanForIntent,
  contentsForPlan,
  applyGreenfieldScaffold,
  workspaceIsGreenfield,
  isPreviewableBuildKind,
  isRunnableInTerminalKind,
  workspaceLooksMessy,
  inferIntentForFolder,
  pickRunCommandFromFolder,
  projectDeliversInBrowser,
  readPackageJson,
}
