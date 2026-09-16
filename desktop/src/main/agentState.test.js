const assert = require('node:assert/strict')
const test = require('node:test')
const os = require('os')
const fs = require('fs')
const path = require('path')
const {
  createAgentState,
  recordToolAttempt,
  isToolDisabled,
  recordFileChange,
  filesChanged,
  noteRoundProgress,
  setVerification,
  composeRunStateBlock,
  summarizeToolResult,
  loadTodos,
  saveTodos,
  stripDynamicSystem,
  hashText,
} = require('./agentState.js')
const { taskCompletionMet, classifyFromEvidence, workHasSuccessfulWrites } = require('./agentTaskGate.js')

test('failed tool is disabled on the third identical call', () => {
  const state = createAgentState({ goal: 'fix cubes', taskKind: 'fix' })
  const args = { path: 'src/cube3d.ts', old_string: 'aaa' }
  recordToolAttempt(state, { name: 'diff', args, ok: false, content: 'old_string not found' })
  recordToolAttempt(state, { name: 'diff', args, ok: false, content: 'old_string not found' })
  assert.equal(isToolDisabled(state, 'diff', args), false)
  recordToolAttempt(state, { name: 'diff', args, ok: false, content: 'old_string not found' })
  assert.equal(isToolDisabled(state, 'diff', args), true)
})

test('file hash change is the progress signal', () => {
  const state = createAgentState({ goal: 'fix cubes', taskKind: 'fix' })
  recordFileChange(state, 'src/cube3d.ts', 'old', 'old')
  assert.deepEqual(filesChanged(state), [])
  recordFileChange(state, 'src/cube3d.ts', 'old', 'new lighting')
  assert.deepEqual(filesChanged(state), ['src/cube3d.ts'])
  const a = noteRoundProgress(state, [])
  assert.equal(a.progressed, true)
  const b = noteRoundProgress(state, [])
  assert.equal(b.progressed, false)
  const c = noteRoundProgress(state, [])
  assert.equal(c.stuck, true)
  assert.equal(state.progress, 'stuck')
})

test('summarizeToolResult keeps a hash instead of the whole file', () => {
  const body = `src/cube3d.ts (400 lines)\n${'x'.repeat(20_000)}mountCube`
  const sum = summarizeToolResult('read', body)
  assert.ok(sum.length < 800)
  assert.match(sum, /hash /)
  assert.match(sum, /start_line/)
  assert.equal(hashText(body).length, 12)
})

test('verify failure blocks fix completion even after a write', () => {
  const work = [
    { role: 'user', content: 'fix the cubes' },
    { role: 'tool', name: 'write', content: 'Updated src/cube3d.ts (+2 -1)', ok: true },
  ]
  assert.equal(workHasSuccessfulWrites(work), true)
  assert.equal(taskCompletionMet('fix', work), true)
  const state = createAgentState({ goal: 'fix cubes', taskKind: 'fix' })
  recordFileChange(state, 'src/cube3d.ts', 'a', 'b')
  setVerification(state, { passed: false, output: 'error TS2322', command: 'tsc' })
  assert.equal(taskCompletionMet('fix', work, state), false)
})

test('chat misclassification upgrades when writes appear', () => {
  const work = [
    { role: 'user', content: 'how do i fix my dashboard' },
    { role: 'tool', name: 'write', content: 'Updated src/dash.ts (+1 -0)', ok: true },
  ]
  assert.equal(
    classifyFromEvidence('how do i fix my dashboard', { lastKind: 'chat' }, work, 'chat'),
    'fix',
  )
})

test('todos persist outside the repo', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-todos-'))
  saveTodos(root, [{ id: '1', content: 'write files', status: 'pending' }])
  const loaded = loadTodos(root)
  assert.equal(loaded[0].content, 'write files')
  fs.rmSync(root, { recursive: true, force: true })
})

test('stripDynamicSystem keeps atlas and drops steer', () => {
  const src = `CONTROL\n\nKNOWN FILES (harness already searched)\ncube3d\n\nSOUMTOK STEER (one live instruction — do this next):\napply the edit\n\nLIVE USER REQUEST (highest priority — do this now):\nfix cubes`
  const out = stripDynamicSystem(src)
  assert.match(out, /KNOWN FILES/)
  assert.doesNotMatch(out, /SOUMTOK STEER/)
  assert.doesNotMatch(out, /LIVE USER REQUEST/)
})

test('new tsc errors fail verify; the same baseline errors do not', () => {
  const { verifyIntroducedNewErrors } = require('./agentTaskGate.js')
  const base = 'src/a.ts(1,1): error TS2322: Type x'
  assert.equal(verifyIntroducedNewErrors(base, base), false)
  assert.equal(verifyIntroducedNewErrors(base, `${base}\nsrc/b.ts(2,1): error TS2304: Cannot find`), true)
})

test('run completion requires localhost in tool output', () => {
  const { taskCompletionMet } = require('./agentTaskGate.js')
  const noUrl = [
    { role: 'user', content: 'run it' },
    { role: 'tool', name: 'terminal', content: 'npm run dev started', ok: true },
  ]
  assert.equal(taskCompletionMet('run', noUrl), false)
  const withUrl = [
    { role: 'user', content: 'run it' },
    { role: 'tool', name: 'read_terminal', content: 'Local: http://localhost:5173/', ok: true },
  ]
  assert.equal(taskCompletionMet('run', withUrl), true)
})

test('run state block names the goal', () => {
  const state = createAgentState({ goal: 'fix the black cubes', taskKind: 'fix' })
  state.lastCheckpointId = 'cp-123'
  const block = composeRunStateBlock(state)
  assert.match(block, /Checkpoint: available/)
  assert.match(block, /SOUMTOK RUN STATE/)
  assert.match(block, /fix the black cubes/)
})
