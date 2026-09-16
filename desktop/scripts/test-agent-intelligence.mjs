#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { runGitTool, gitSnapshot } = require('../src/main/gitTools.js')
const { searchCodebase, tokenize, expandQueryTokens } = require('../src/main/semanticIndex.js')
const { buildWorkspaceAtlas } = require('../src/main/workspaceAtlas.js')
const { listAgentSkills, readSkillByName } = require('../src/main/agentSkills.js')
const { applyDiff } = require('../src/main/desktopTools.js')
const { loadProjectRules } = require('../src/main/projectRules.js')
const { classifyUserTask } = require('../src/main/agentTaskGate.js')
const { composeThinkFirstBrief, composeWorkLoopBrief } = require('../src/main/agentThinkFirst.js')
const { parseBuildIntent, filesPlanForIntent } = require('../src/main/buildDirector.js')
const { maxToolRounds } = require('../src/shared/harnessLimits.js')
const { intelligenceBundle, applyIntelligenceToPrefs } = require('../src/shared/agentPrefsRuntime.js')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-intel-'))
fs.writeFileSync(path.join(tmp, 'auth.ts'), 'export function loginUser(email) { return sessionFrom(email) }\n')
fs.writeFileSync(path.join(tmp, 'session.ts'), '/** session cookie for signed-in users */\nexport function sessionFrom(email) { return email }\n')

assert.ok(tokenize('loginUser').includes('login'))
assert.ok(expandQueryTokens(['login']).includes('auth'))
const hit = searchCodebase(tmp, 'auth login session')
assert.match(hit.text, /session\.ts|auth\.ts/)
const atlas = buildWorkspaceAtlas(tmp, 'auth login session')
assert.match(atlas.text, /KNOWN FILES/)
assert.ok(atlas.paths.some((p) => /session\.ts|auth\.ts/.test(p)))
assert.match(atlas.text, /do NOT list_dir/)
assert.match(atlas.text, /FILE BODIES/)
assert.match(atlas.text, /sessionFrom/)

assert.equal(maxToolRounds('ide'), 42)
assert.equal(maxToolRounds('ide', { intelligence: 'fast' }), 12)
assert.equal(maxToolRounds('bot', { intelligence: 'balanced' }), 36)
assert.equal(intelligenceBundle('fast').browserVerify, false)
assert.equal(applyIntelligenceToPrefs({ intelligence: 'max' }).thinkFirst, true)

fs.mkdirSync(path.join(tmp, 'packages', 'core'), { recursive: true })
fs.writeFileSync(path.join(tmp, 'AGENTS.md'), 'Root: use pnpm.\n')
fs.writeFileSync(path.join(tmp, 'packages', 'core', 'AGENTS.md'), 'Core package: keep public API stable.\n')
const rules = loadProjectRules(tmp)
assert.match(rules, /use pnpm/)
assert.match(rules, /public API stable/)

const skills = listAgentSkills(tmp)
assert.ok(skills.some((s) => s.name === 'git-workflow'))
assert.ok(skills.some((s) => s.name === 'verify-ui'))
assert.ok(skills.some((s) => s.name === 'codebase-search'))
assert.ok(skills.some((s) => s.name === 'plugins-mcp'))
const gitSkill = readSkillByName(tmp, 'git-workflow')
assert.equal(gitSkill.ok, true)
assert.match(gitSkill.text, /Prefer the `git` tool/)

const cube = parseBuildIntent('make me a 3d cube simulation')
assert.equal(cube.kind, 'web-vite')
const paths = filesPlanForIntent(cube, true).map((f) => f.path)
assert.ok(paths.includes('src/cube3d.ts'))
assert.ok(!paths.includes('cube.js'))

assert.equal(
  classifyUserTask('why does the cube as black spots thats false fix that and the cube design make it 3d'),
  'fix',
)
assert.equal(classifyUserTask('hi make me a 3d rubis cube simulation app'), 'build')
assert.equal(classifyUserTask('make a node cli that greets stdin'), 'build')
assert.equal(classifyUserTask('git commit these changes'), 'execute')
assert.equal(classifyUserTask('start the dev server'), 'run')
assert.equal(classifyUserTask('isit okay now runmy localhost'), 'run')
assert.equal(classifyUserTask('hello'), 'chat')
assert.equal(classifyUserTask('geneeare me an egale bird iamge'), 'image')
assert.equal(classifyUserTask('generate me an eagle bird image'), 'image')
assert.equal(classifyUserTask('geneearte a new one with a man dancing'), 'image')
assert.equal(classifyUserTask('genera an eagle image for me'), 'image')
assert.equal(classifyUserTask('yes', { lastAssistant: 'Want me to apply that change to src/cube3d.ts now?' }), 'fix')
assert.equal(classifyUserTask('go on', { lastAssistant: 'Want me to apply that change to src/cube3d.ts now?' }), 'fix')

const loop = composeWorkLoopBrief('build')
assert.match(loop, /THINK/)
assert.match(loop, /CONCLUSION/)
assert.doesNotMatch(composeThinkFirstBrief('fix the look', 'fix'), /cube3d/)
assert.equal(composeWorkLoopBrief('chat'), '')
assert.match(composeThinkFirstBrief('generate me an eagle image', 'image'), /generate_image/)
assert.match(composeWorkLoopBrief('image'), /generate_image/)
assert.match(composeWorkLoopBrief('image'), /No list_dir/)

const src = 'const GAP = 0.04;\nconst BODY = 1;\n'
assert.equal(
  applyDiff(src, { old_string: 'const GAP = 0.04;\r\n', new_string: 'const GAP = 0.02;\n' }),
  'const GAP = 0.02;\nconst BODY = 1;\n',
)
assert.equal(
  applyDiff(src, { old_string: 'const GAP = 0.04;  ', new_string: 'const GAP = 0.02;' }),
  'const GAP = 0.02;\nconst BODY = 1;\n',
)
assert.ok(!applyDiff(src, { old_string: 'not in file', new_string: 'x' }))
assert.ok(!applyDiff('const GAP = 0.04;\nconst GAP = 0.04;\n', { old_string: 'const GAP = 0.04;', new_string: 'x' }))

const git = spawnSync('git', ['--version'], { encoding: 'utf8', windowsHide: true })
if (git.status === 0) {
  spawnSync('git', ['init'], { cwd: tmp, encoding: 'utf8', windowsHide: true })
  spawnSync('git', ['config', 'user.email', 'test@soumtok.local'], { cwd: tmp, encoding: 'utf8', windowsHide: true })
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: tmp, encoding: 'utf8', windowsHide: true })
  spawnSync('git', ['add', '-A'], { cwd: tmp, encoding: 'utf8', windowsHide: true })
  spawnSync('git', ['commit', '-m', 'init'], { cwd: tmp, encoding: 'utf8', windowsHide: true })
  const st = gitSnapshot(tmp)
  assert.match(st.text, /branch:/)
  const diff = runGitTool(tmp, { action: 'log' })
  assert.equal(diff.ok, true)
}

fs.rmSync(tmp, { recursive: true, force: true })
console.log('test-agent-intelligence: ok')
