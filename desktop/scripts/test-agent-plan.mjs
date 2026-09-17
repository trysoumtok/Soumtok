import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'
const require = createRequire(import.meta.url)
const {
  extractPlanSteps,
  agentShouldAutoContinue,
  buildStillNeedsDevServer,
  composeLocalConclusion,
} = require('../src/main/agentHarness.js')
const { runDesktopTool } = require('../src/main/desktopTools.js')

const steps = extractPlanSteps(`I'll build your bike site:
1. Scaffold Vite + TypeScript
2. Create hero + product sections
3. npm install and npm run dev
`)
if (steps.length < 3) {
  console.error('FAIL: expected plan steps', steps)
  process.exit(1)
}

const cont = agentShouldAutoContinue({
  mode: 'agent',
  folder: '/tmp/x',
  round: 0,
  maxRounds: 42,
  taskKind: 'build',
  work: [],
  runState: { progress: 'working' },
})
if (!cont) {
  console.error('FAIL: build task should auto-continue')
  process.exit(1)
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-write-'))
fs.mkdirSync(path.join(dir, 'src'))
await runDesktopTool(dir, 'write', { path: 'App.tsx', content: 'export {}' }, {})
const body = fs.readFileSync(path.join(dir, 'src', 'App.tsx'), 'utf8')
if (body !== 'export {}') {
  console.error('FAIL: App.tsx should land in src/', dir)
  process.exit(1)
}

const pkgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-build-'))
fs.writeFileSync(
  path.join(pkgDir, 'package.json'),
  JSON.stringify({ scripts: { dev: 'vite --port 5173 --host' } }),
  'utf8',
)
const work = [
  { role: 'user', content: 'build a coffee landing page' },
  { role: 'tool', name: 'write', ok: true, content: 'wrote package.json' },
  { role: 'tool', name: 'write', ok: true, content: 'wrote index.html' },
]
if (!buildStillNeedsDevServer(pkgDir, work)) {
  console.error('FAIL: vite project with writes should need dev server')
  process.exit(1)
}
const conclusion = composeLocalConclusion(work, { folder: pkgDir })
if (!/npm install|npm run dev|localhost:5173/i.test(conclusion)) {
  console.error('FAIL: conclusion should include start steps', conclusion)
  process.exit(1)
}
if (/reload the running page/i.test(conclusion)) {
  console.error('FAIL: should not say reload when no server running')
  process.exit(1)
}
fs.rmSync(pkgDir, { recursive: true, force: true })

console.log('OK agent plan + write path + build conclusion')
