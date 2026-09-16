import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareDesktopAgentTurn } from './desktopAgent.ts'

test('desktop turn analyzes typos and injects control packet', () => {
  const turn = prepareDesktopAgentTurn({
    userMessage: 'fix teh footer them toggle',
    workspaceRoot: '/tmp/proj',
    mode: 'agent',
  })
  assert.match(turn.systemPrompt, /Soumtok Agent/)
  assert.match(turn.systemPrompt, /CONTROL/)
  assert.match(turn.systemPrompt, /Intent: theme|Intent: edit/)
  assert.match(turn.userText, /the footer/)
  assert.equal(turn.toolsEnabled, true)
})

test('ide driver does not inject bot automation block', () => {
  const turn = prepareDesktopAgentTurn({
    userMessage: 'fix teh footer them toggle',
    workspaceRoot: '/tmp/proj',
    mode: 'agent',
    driver: 'ide',
  })
  assert.doesNotMatch(turn.systemPrompt, /SOUMTOK BOT \(active driver/)
})

test('agent mode keeps a small tool set on hello so follow-ups still work', () => {
  const turn = prepareDesktopAgentTurn({
    userMessage: 'hello',
    workspaceRoot: '/tmp/proj',
    mode: 'agent',
  })
  assert.equal(turn.toolsEnabled, true)
  assert.ok(turn.toolNames.includes('fetch'))
  assert.ok(!turn.toolNames.includes('wipe_workspace'))
})

test('plan mode disables tools on chat-classified hello', () => {
  const turn = prepareDesktopAgentTurn({
    userMessage: 'hello',
    workspaceRoot: '/tmp/proj',
    mode: 'plan',
  })
  assert.equal(turn.plan.mode, 'chat')
  assert.equal(turn.toolsEnabled, false)
})

test('follow-up harness messages keep the original build intent', () => {
  const turn = prepareDesktopAgentTurn({
    messages: [
      { role: 'user', content: 'hi make me a 3d rubis cube simulation app' },
      { role: 'assistant', content: 'looking' },
      {
        role: 'user',
        content: '[Soumtok harness] Follow SOUMTOK BUILD DIRECTOR Phase 0: list_dir',
      },
    ],
    workspaceRoot: '/tmp/proj',
    mode: 'agent',
  })
  assert.equal(turn.analysis.kind, 'build')
  assert.match(turn.userText, /cube/i)
  assert.equal(turn.toolsEnabled, true)
})

test('harness pins live user request last', () => {
  const turn = prepareDesktopAgentTurn({
    userMessage: 'go',
    workspaceRoot: '/tmp/proj',
    mode: 'agent',
    model: 'deepseek-v4-flash',
  })
  assert.equal(turn.analysis.kind, 'execute')
  assert.match(turn.systemPrompt, /CONTROL/)
  assert.match(turn.systemPrompt, /JSON function tools only/)
  assert.match(turn.systemPrompt, /LIVE USER REQUEST/)
  const pinAt = turn.systemPrompt.lastIndexOf('LIVE USER REQUEST')
  const controlAt = turn.systemPrompt.indexOf('CONTROL')
  assert.ok(pinAt > controlAt)
  assert.match(turn.systemPrompt.slice(pinAt), /\bgo\b/i)
})

test('max intelligence keeps search, browser, and skills tools', () => {
  const turn = prepareDesktopAgentTurn({
    userMessage: 'fix the footer',
    workspaceRoot: '/tmp/proj',
    mode: 'agent',
    agentPrefs: { intelligence: 'max' },
  })
  assert.ok(turn.toolNames.includes('browser'))
  assert.ok(turn.toolNames.includes('read_skill'))
  assert.ok(turn.toolNames.includes('codebase_search'))
  assert.equal(turn.agentPrefs.intelligence, 'max')
  assert.equal(turn.agentPrefs.thinkFirst, true)
})

test('fast intelligence drops browser and skills unless overridden', () => {
  const turn = prepareDesktopAgentTurn({
    userMessage: 'fix the footer',
    workspaceRoot: '/tmp/proj',
    mode: 'agent',
    agentPrefs: { intelligence: 'fast' },
  })
  assert.equal(turn.agentPrefs.intelligence, 'fast')
  assert.equal(turn.agentPrefs.thinkFirst, false)
  assert.ok(!turn.toolNames.includes('browser'))
  assert.ok(!turn.toolNames.includes('read_skill'))
  assert.ok(turn.toolNames.includes('codebase_search'))
  assert.ok(turn.toolNames.includes('write'))
})

test('wipe and hello get different tools', () => {
  const wipe = prepareDesktopAgentTurn({
    userMessage: 'delete everything in this folder',
    workspaceRoot: '/tmp/proj',
    mode: 'agent',
  })
  assert.equal(wipe.analysis.kind, 'wipe')
  assert.ok(wipe.toolNames.includes('wipe_workspace'))
  const hi = prepareDesktopAgentTurn({
    userMessage: 'hello',
    workspaceRoot: '/tmp/proj',
    mode: 'agent',
  })
  assert.equal(hi.analysis.kind, 'chat')
  assert.ok(!hi.toolNames.includes('wipe_workspace'))
  assert.ok(!hi.toolNames.includes('list_dir'))
  assert.ok(!hi.toolNames.includes('read'))
  assert.ok(!hi.toolNames.includes('grep'))
})

test('generate eagle image does not get repo explore tools', () => {
  const turn = prepareDesktopAgentTurn({
    userMessage: 'geneeare me an egale bird iamge',
    workspaceRoot: '/tmp/proj',
    mode: 'agent',
  })
  assert.equal(turn.analysis.kind, 'image')
  assert.ok(turn.toolNames.includes('generate_image'))
  assert.ok(!turn.toolNames.includes('list_dir'))
  assert.ok(!turn.toolNames.includes('read'))
  assert.ok(!turn.toolNames.includes('grep'))
  assert.match(turn.systemPrompt, /generate_image NOW|Intent: image/)
  assert.doesNotMatch(turn.systemPrompt, /you still have read\/edit\/search tools/)
  const genera = prepareDesktopAgentTurn({
    userMessage: 'genera an eagle image for me',
    workspaceRoot: '/tmp/proj',
    mode: 'agent',
  })
  assert.equal(genera.analysis.kind, 'image')
  assert.ok(genera.toolNames.includes('generate_image'))
  assert.ok(!genera.toolNames.includes('list_dir'))
  const dancing = prepareDesktopAgentTurn({
    userMessage: 'geneearte a new one with a man dancing',
    workspaceRoot: '/tmp/proj',
    mode: 'agent',
    messages: [
      { role: 'user', content: 'generate a supercar image' },
      { role: 'tool', name: 'generate_image', content: 'Saved assets/generated/flux2-max-watch.jpg' },
    ],
  })
  assert.equal(dancing.analysis.kind, 'image')
  assert.ok(dancing.toolNames.includes('generate_image'))
  assert.ok(!dancing.toolNames.includes('list_dir'))
  assert.ok(!dancing.toolNames.includes('read'))
  assert.match(dancing.systemPrompt, /UNDERSTAND FIRST|generate_image NOW|Intent: image/)
})
