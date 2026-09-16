import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compactConversation,
  compactControlSystem,
  compactToolContent,
  estimatePayloadChars,
  extractDesktopHarnessBlocks,
  mergeDesktopSystem,
  toolsForIntent,
  TOOL_RESULT_OLD_CHARS,
} from './agentControlLayer.ts'
import { inferPlan } from './agent.ts'
import { analyzeUserRequest } from './requestAnalyze.ts'

test('toolsForIntent skips repo tools for chat and question, keeps them for build', () => {
  const chat = toolsForIntent({ kind: 'chat', uiMode: 'agent' })
  assert.ok(chat.includes('fetch'))
  assert.ok(chat.includes('generate_image'))
  assert.ok(!chat.includes('write'))
  assert.ok(!chat.includes('diff'))
  assert.ok(!chat.includes('read'))
  assert.ok(!chat.includes('list_dir'))
  assert.ok(!chat.includes('wipe_workspace'))
  const build = toolsForIntent({ kind: 'build', uiMode: 'agent', prefs: { intelligence: 'balanced' } })
  assert.ok(build.includes('write'))
  assert.ok(build.includes('terminal'))
  assert.ok(build.includes('task'))
  const max = toolsForIntent({ kind: 'fix', uiMode: 'agent', prefs: { intelligence: 'max' } })
  assert.ok(max.includes('read_skill'))
  assert.ok(max.includes('git'))
  const wipe = toolsForIntent({ kind: 'wipe', uiMode: 'agent' })
  assert.ok(wipe.includes('wipe_workspace'))
  assert.ok(!wipe.includes('write'))
  const ask = toolsForIntent({ kind: 'question', uiMode: 'agent' })
  assert.ok(ask.includes('read'))
  assert.ok(ask.includes('grep'))
  assert.ok(!ask.includes('write'))
  assert.ok(!ask.includes('list_dir'))
  const askUi = toolsForIntent({ kind: 'question', uiMode: 'ask' })
  assert.ok(askUi.includes('read'))
  assert.ok(askUi.includes('examine_media'))
  assert.ok(!askUi.includes('write'))
  assert.ok(!askUi.includes('generate_image'))
  const run = toolsForIntent({ kind: 'run', uiMode: 'agent' })
  assert.ok(run.includes('terminal'))
  assert.ok(run.includes('generate_image'))
  assert.ok(run.includes('examine_media'))
  assert.ok(run.includes('mcp'))
  assert.ok(!run.includes('wipe_workspace'))
  const image = toolsForIntent({ kind: 'image', uiMode: 'agent' })
  assert.ok(image.includes('generate_image'))
  assert.ok(image.includes('examine_media'))
  assert.ok(!image.includes('list_dir'))
  assert.ok(!image.includes('read'))
  assert.ok(!image.includes('grep'))
  assert.ok(!image.includes('write'))
})

test('compactToolContent keeps a whole source file recent and shrinks old ones', () => {
  const file = 'x'.repeat(9000)
  assert.equal(compactToolContent(file, 0), file)
  const old = compactToolContent(file, 8, 'read')
  assert.ok(old.length <= TOOL_RESULT_OLD_CHARS + 260)
  assert.match(old, /start_line/)
  assert.match(old, /hash /)
})

test('compactToolContent keeps the tail so the agent stops re-reading for it', () => {
  const body = `${'a'.repeat(60_000)}TAIL_MARKER`
  const trimmed = compactToolContent(body, 0)
  assert.ok(trimmed.length < body.length)
  assert.match(trimmed, /TAIL_MARKER$/)
})

test('summarizeOldRoundsIfNeeded collapses rounds after ten user turns', () => {
  const rounds = []
  for (let r = 0; r < 12; r += 1) {
    rounds.push({ role: 'user', content: `task ${r}` })
    rounds.push({ role: 'assistant', content: `working ${r}` })
    rounds.push({ role: 'tool', content: `src/a.ts (10 lines)\nline ${r}`, name: 'read' })
  }
  const out = compactConversation(rounds)
  assert.match(String(out[0].content), /Earlier rounds \(8\) compressed/)
  assert.equal(out.filter((m) => m.role === 'user' && /^task /.test(String(m.content))).length, 4)
})

test('compactConversation drops duplicate harness nudges and truncates old tools', () => {
  const out = compactConversation([
    { role: 'user', content: '[Soumtok harness] A' },
    { role: 'user', content: '[Soumtok harness] A' },
    { role: 'tool', content: `y${'y'.repeat(8_000)}`, name: 'grep' },
    { role: 'tool', content: `z${'z'.repeat(8_000)}`, name: 'list_dir' },
    { role: 'tool', content: `q${'q'.repeat(60_000)}`, name: 'read' },
    { role: 'user', content: 'go' },
  ])
  assert.equal(out.filter((m) => String(m.content).startsWith('[Soumtok harness] A')).length, 1)
  const old = out.find((m) => m.role === 'tool' && m.name === 'grep')
  assert.match(String(old?.content), /hash /)
  const recent = out.find((m) => m.role === 'tool' && m.name === 'read')
  assert.match(String(recent?.content), /save credits/)
})

test('compactConversation collapses an identical repeat read instead of starving both', () => {
  const body = `src/cube3d.ts (281 lines)\n${'c'.repeat(9000)}`
  const out = compactConversation([
    { role: 'user', content: 'fix the black cubes' },
    { role: 'tool', content: body, name: 'read' },
    { role: 'tool', content: 'src/main.ts (40 lines)\nmount()', name: 'read' },
    { role: 'tool', content: body, name: 'read' },
  ])
  const reads = out.filter((m) => m.role === 'tool' && /cube3d/.test(String(m.content)))
  assert.equal(reads.length, 2)
  // Newest copy survives in full; the stale one collapses to a pointer.
  assert.equal(String(reads[1].content), body)
  assert.match(String(reads[0].content), /Do not read this path again/)
  assert.ok(String(reads[0].content).length < 300)
})

test('compactConversation keeps two different ranges of the same file', () => {
  const head = `src/cube3d.ts (281 lines) [lines 1-120]\n${'h'.repeat(500)}`
  const tail = `src/cube3d.ts (281 lines) [lines 120-281]\n${'t'.repeat(500)}`
  const out = compactConversation([
    { role: 'tool', content: head, name: 'read' },
    { role: 'tool', content: tail, name: 'read' },
  ])
  assert.equal(out.filter((m) => /Do not read this path again/.test(String(m.content))).length, 0)
  assert.match(String(out[0].content), /lines 1-120/)
  assert.match(String(out[1].content), /lines 120-281/)
})

test('control packet is short, pins the user last, and works for any model', () => {
  const analysis = analyzeUserRequest('make me a cube app', { hasFiles: true })
  const plan = inferPlan('make me a cube app', true, { runMode: 'agent', analysis })
  const flash = compactControlSystem({
    workspaceRoot: '/tmp/proj',
    mode: 'agent',
    plan,
    analysis,
    enabledTools: ['write', 'terminal'],
    model: 'deepseek-v4-flash',
    userText: 'make me a cube app',
    gitSnapshot: 'branch: main\nstatus:\n(clean working tree)',
  })
  const fable = compactControlSystem({
    workspaceRoot: '/tmp/proj',
    mode: 'agent',
    plan,
    analysis,
    enabledTools: ['write', 'terminal'],
    model: 'claude-fable-5',
    userText: 'make me a cube app',
    gitSnapshot: 'branch: main\nstatus:\n(clean working tree)',
  })
  assert.match(flash, /CONTROL/)
  assert.match(flash, /Job: make me a cube app/)
  assert.doesNotMatch(flash, /typos in the raw message are not the job/)
  assert.ok(flash.endsWith('make me a cube app') || flash.includes('LIVE USER REQUEST'))
  assert.ok(flash.length < 4500)
  assert.match(fable, /Claude/)
  assert.equal(estimatePayloadChars([{ content: flash }]) < 4500, true)
})

test('extractDesktopHarnessBlocks keeps atlas and scaffold when CONTROL is rebuilt', () => {
  const prev = `You are old system\n\nSCAFFOLD ON DISK\nsrc/main.ts\n\nKNOWN FILES (harness already searched this git repo on disk — do NOT list_dir):\nFILE BODIES\nFILE src/cube3d.ts\nexport function mountCube() {}\n`
  const kept = extractDesktopHarnessBlocks(prev)
  assert.match(kept, /SCAFFOLD ON DISK/)
  assert.match(kept, /KNOWN FILES/)
  assert.match(kept, /mountCube/)
  assert.doesNotMatch(kept, /You are old system/)
})

test('extractDesktopHarnessBlocks keeps project rules and platform context', () => {
  const prev = `CONTROL packet\n\nPROJECT RULES (from this repo — follow when relevant):\n- no cubes\n\nSOUMTOK PLATFORM CONTEXT (account-wide — any project):\nMCP: neon\n`
  const kept = extractDesktopHarnessBlocks(prev)
  assert.match(kept, /PROJECT RULES/)
  assert.match(kept, /no cubes/)
  assert.match(kept, /PLATFORM CONTEXT/)
  assert.match(kept, /MCP: neon/)
})

test('mergeDesktopSystem reuses CONTROL when it has not changed', () => {
  const control = compactControlSystem({
    workspaceRoot: '/tmp/proj',
    mode: 'agent',
    plan: inferPlan('fix cubes', true, { runMode: 'agent', analysis: analyzeUserRequest('fix cubes', { hasFiles: true }) }),
    analysis: analyzeUserRequest('fix cubes', { hasFiles: true }),
    enabledTools: ['read', 'write'],
    model: 'deepseek-v4-flash',
    userText: 'fix cubes',
  })
  const prev = `${control}\n\nKNOWN FILES (harness already searched this git repo on disk — do NOT list_dir):\nFILE src/cube3d.ts\nmountCube\n`
  const merged = mergeDesktopSystem(prev, control, 'fix cubes')
  assert.match(merged, /mountCube/)
  assert.match(merged, /LIVE USER REQUEST/)
  const again = mergeDesktopSystem(merged, control, 'fix cubes')
  assert.match(again, /mountCube/)
})
