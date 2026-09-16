const assert = require('node:assert/strict')
const test = require('node:test')
const { userIsBareConfirm, classifyUserTask } = require('./agentTaskGate.js')

test('bare confirm matches short apply follow-ups', () => {
  for (const t of ['go', 'go on', 'apply it', 'go on apply', 'go on and apply', 'apply', 'yes apply', 'continue']) {
    assert.equal(userIsBareConfirm(t), true, t)
  }
  assert.equal(userIsBareConfirm('please fix the footer toggle'), false)
  assert.equal(userIsBareConfirm('go on apply the screenshot change in cube3d.ts'), false)
})

test('go on apply is execute/fix, not chat', () => {
  const kind = classifyUserTask('go on apply', {
    lastAssistant: 'Want me to apply the diff to cube3d.ts?',
    lastKind: 'fix',
  })
  assert.equal(kind, 'fix')
})

test('generate image is image kind, including typos', () => {
  const { userAskedToGenerateImage } = require('./agentTaskGate.js')
  assert.equal(classifyUserTask('geneeare me an egale bird iamge'), 'image')
  assert.equal(classifyUserTask('generate me an eagle bird image'), 'image')
  assert.equal(classifyUserTask('genearte an egale image on sea flyingabovetehsea'), 'image')
  assert.equal(classifyUserTask('genera an eagle image for me'), 'image')
  assert.equal(classifyUserTask('draw a picture of an eagle'), 'image')
  assert.equal(userAskedToGenerateImage('generate me an eagle bird image'), true)
  assert.equal(userAskedToGenerateImage('genearte an egale image on sea flyingabovetehsea'), true)
  assert.equal(userAskedToGenerateImage('genera an eagle image for me'), true)
  assert.equal(userAskedToGenerateImage('explain this image for me'), false)
  assert.equal(classifyUserTask('a general question about images'), 'chat')
  assert.equal(classifyUserTask('add an eagle image to the hero'), 'execute')
  assert.equal(classifyUserTask('make me a 3d rubis cube simulation app'), 'build')
  assert.equal(classifyUserTask('geneearte a new one with a man dancing'), 'image')
  assert.equal(
    userAskedToGenerateImage('geneearte a new one with a man dancing', { priorImage: true, lastKind: 'image' }),
    true,
  )
  assert.equal(userAskedToGenerateImage('geneearte a new one with a man dancing'), true)
})

test('image prompts default to 1:1 and strip a asked ratio', () => {
  const { stillRequestFromUser } = require('./agentTaskGate.js')
  const d = stillRequestFromUser('generate an eagle image')
  assert.equal(d.aspect, '1:1')
  assert.match(d.prompt, /eagle/i)
  const wide = stillRequestFromUser('generate a 16:9 supercar image')
  assert.equal(wide.aspect, '16:9')
  assert.match(wide.prompt, /supercar/i)
  assert.doesNotMatch(wide.prompt, /16:9/)
  const dance = stillRequestFromUser('geneearte a new one with a man dancing')
  assert.equal(dance.aspect, '1:1')
  assert.match(dance.prompt, /man dancing/i)
})

test('misspelled requests still classify and keep image vs chat apart', () => {
  assert.equal(classifyUserTask('addtols that agent can rea ad undetand misplell'), 'execute')
  assert.equal(classifyUserTask('rea the package json'), 'analyze')
})

test('vague in-project edits need clarification', () => {
  const { needsVagueEditClarification, buildEditClarificationAsk } = require('./agentTaskGate.js')
  assert.equal(needsVagueEditClarification('fix', true), true)
  assert.equal(needsVagueEditClarification('improve this', true), true)
  assert.equal(needsVagueEditClarification('fix the login form', true), false)
  assert.equal(needsVagueEditClarification('fix src/App.tsx', true), false)
  assert.equal(needsVagueEditClarification('go on', true), false)
  const ask = buildEditClarificationAsk('fix')
  assert.match(ask.title, /change/i)
  assert.equal(ask.questions.length, 1)
})

test('adaptive steering reacts to edit loops without tests', () => {
  const { adaptiveSteering } = require('./agentTaskGate.js')
  const work = [
    { role: 'user', content: 'fix the bug' },
    { role: 'tool', name: 'diff', content: 'fail', ok: false },
    { role: 'tool', name: 'diff', content: 'fail', ok: false },
    { role: 'tool', name: 'diff', content: 'fail', ok: false },
  ]
  const steer = adaptiveSteering('fix', work, { progress: 'stuck' })
  assert.match(steer, /tsc|test/i)
})

test('signalIntent names the task kind on round zero', () => {
  const { signalIntent } = require('./agentTaskGate.js')
  assert.match(signalIntent('fix', 'broken header'), /Fix task/)
  assert.match(signalIntent('build', 'make a site'), /Build task/)
})

test('failed diff does not complete a fix; successful write does', () => {
  const { taskCompletionMet, workHasSuccessfulWrites } = require('./agentTaskGate.js')
  const failed = [
    { role: 'user', content: 'fix the cubes' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'diff', arguments: '{}' } }],
    },
    {
      role: 'tool',
      tool_call_id: 'c1',
      name: 'diff',
      content: 'Could not apply edit to src/cube3d.ts: old_string not found in the file.',
      ok: false,
    },
  ]
  assert.equal(workHasSuccessfulWrites(failed), false)
  assert.equal(taskCompletionMet('fix', failed), false)

  const wrote = [
    { role: 'user', content: 'fix the cubes' },
    { role: 'tool', name: 'write', content: 'Updated src/cube3d.ts (+2 -1)', ok: true },
  ]
  assert.equal(workHasSuccessfulWrites(wrote), true)
  assert.equal(taskCompletionMet('fix', wrote), true)
})
