#!/usr/bin/env node
/**
 * Scores the harness loop that keeps the model off search and on known files.
 * 10 = atlas bodies + greenfield scaffold + CONTROL merge + no cube.js scatter.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { compactControlSystem, extractDesktopHarnessBlocks } from '../../shared/agentControlLayer.ts'
import { inferPlan } from '../../shared/agent.ts'
import { analyzeUserRequest } from '../../shared/requestAnalyze.ts'

const require = createRequire(import.meta.url)
const { buildWorkspaceAtlas } = require('../src/main/workspaceAtlas.js')
const { applyGreenfieldScaffold, workspaceIsGreenfield, contentsForPlan } = require('../src/main/buildDirector.js')
const harnessSrc = fs.readFileSync(path.join(import.meta.dirname, '../src/main/agentHarness.js'), 'utf8')
const studioSrc = fs.readFileSync(path.join(import.meta.dirname, '../../server/studio.ts'), 'utf8')

const checks = []
function score(name, ok) {
  checks.push({ name, ok: Boolean(ok) })
  if (!ok) console.error('FAIL', name)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-eval-'))
try {
  fs.writeFileSync(path.join(tmp, 'auth.ts'), 'export function loginUser(email) { return sessionFrom(email) }\n')
  fs.writeFileSync(path.join(tmp, 'session.ts'), 'export function sessionFrom(email) { return email }\n')
  const atlas = buildWorkspaceAtlas(tmp, 'auth login session')
  score('atlas has KNOWN FILES', /KNOWN FILES/.test(atlas.text))
  score('atlas preloads FILE BODIES', /FILE BODIES/.test(atlas.text) && /sessionFrom/.test(atlas.text))
  score('atlas forbids list_dir', /do NOT list_dir/.test(atlas.text))

  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-eval-empty-'))
  score('empty folder is greenfield', workspaceIsGreenfield(empty) === true)
  const sc = applyGreenfieldScaffold(empty, 'make me a 3d cube simulation')
  score('scaffold writes vite src tree', sc.wrote.includes('src/cube3d.ts') && sc.wrote.includes('src/main.ts'))
  score('scaffold never writes cube.js', !fs.existsSync(path.join(empty, 'cube.js')))
  const pkg = JSON.parse(fs.readFileSync(path.join(empty, 'package.json'), 'utf8'))
  score('scaffold package.json is valid + three', Boolean(pkg.dependencies?.three))
  const atlas2 = buildWorkspaceAtlas(empty, 'cube 3d lighting')
  score('atlas after scaffold loads cube3d body', /cube3d/.test(atlas2.text) && /FILE BODIES/.test(atlas2.text))
  fs.rmSync(empty, { recursive: true, force: true })

  score('harness calls applyGreenfieldScaffold', /applyGreenfieldScaffold\(folder/.test(harnessSrc))
  score('harness stores project brief', /refreshProjectMemory/.test(harnessSrc) && /PROJECT BRIEF/.test(harnessSrc))
  score('run skip stale atlas', /taskKind === 'run'/.test(harnessSrc) && /queryChanged/.test(harnessSrc))
  score(
    'harness lets the model continue after tools instead of fake-user inspect nudges',
    /modelStalledInsteadOfWorking/.test(harnessSrc) &&
      !/Prefer diff\(\) or write\(\) next/.test(harnessSrc) &&
      /_steerCount/.test(harnessSrc),
  )
  score('harness treats SCAFFOLD as writes', /SCAFFOLD ON DISK/.test(harnessSrc) && /workHasFileWrites/.test(harnessSrc))

  const prev = `old CONTROL\n\nSCAFFOLD ON DISK\nsrc/main.ts\n\nKNOWN FILES (harness already searched this git repo on disk — do NOT list_dir):\nFILE src/cube3d.ts\nmountCube\n`
  const kept = extractDesktopHarnessBlocks(prev)
  score('API merge keeps scaffold+atlas', /SCAFFOLD ON DISK/.test(kept) && /KNOWN FILES/.test(kept) && /mountCube/.test(kept))
  score('studio uses mergeDesktopSystem', /mergeDesktopSystem/.test(studioSrc))

  const analysis = analyzeUserRequest('make me a cube app', { hasFiles: true })
  const plan = inferPlan('make me a cube app', true, { runMode: 'agent', analysis })
  const control = compactControlSystem({
    workspaceRoot: '/tmp/proj',
    mode: 'agent',
    plan,
    analysis,
    enabledTools: ['write', 'terminal'],
    model: 'deepseek-v4-flash',
    userText: 'make me a cube app',
  })
  score('CONTROL stays short', control.length < 4500)
  score('CONTROL job is the user sentence', /Job: make me a cube app/.test(control))
  score('messy localhost is run', analyzeUserRequest('isit okay now runmy localhost', { hasFiles: true }).kind === 'run')
  score('is it okay run localhost is run', analyzeUserRequest('is it okay now run my localhost', { hasFiles: true }).kind === 'run')

  const landing = contentsForPlan({ kind: 'web-vite', title: 'Hi', raw: 'landing' })
  score('landing scaffold has src/main.ts not cube.js', landing.some((f) => f.path === 'src/main.ts') && !landing.some((f) => f.path === 'cube.js'))
  const py = contentsForPlan({ kind: 'python-cli', title: 'Greet', raw: 'python cli' })
  score('python prompt scaffolds main.py', py.some((f) => f.path === 'main.py') && !py.some((f) => f.path === 'src/cube3d.ts'))
  score('wipe prompt is wipe not build', analyzeUserRequest('delete everything in this folder', { hasFiles: true }).kind === 'wipe')
  score('hello stays chat', analyzeUserRequest('hello').kind === 'chat')
  score(
    'dancing follow-up is image',
    analyzeUserRequest('geneearte a new one with a man dancing', { hasFiles: true, priorImage: true }).kind === 'image',
  )
  score(
    'dashboard fix is not chat',
    analyzeUserRequest('how do I fix the branch selector in my dashboard', { hasFiles: true }).kind !== 'chat',
  )
  score('cli prompt is build', analyzeUserRequest('make a node cli that greets stdin', { hasFiles: true }).kind === 'build')
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

const passed = checks.filter((c) => c.ok).length
const total = checks.length
const grade = Math.round((passed / total) * 10)
assert.equal(passed, total, `eval ${passed}/${total} (grade ${grade}/10)`)
console.log(`test-agent-eval: ${passed}/${total}  grade ${grade}/10`)
