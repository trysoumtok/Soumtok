import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appendLiveUserRequest,
  modelFamilyFromId,
  modelHarnessAddon,
  shouldForceToolChoice,
} from './modelHarness.ts'

test('model family from id', () => {
  assert.equal(modelFamilyFromId('deepseek-v4-flash'), 'deepseek')
  assert.equal(modelFamilyFromId('claude-sonnet-4'), 'anthropic')
  assert.equal(modelFamilyFromId('gpt-4.1'), 'openai')
})

test('every model gets the same write/terminal contract', () => {
  for (const id of ['deepseek-chat', 'gpt-4.1', 'claude-sonnet-4', 'grok-4', 'gemini-2.5-pro', 'auto']) {
    const text = modelHarnessAddon(id)
    assert.match(text, /MODEL CONTRACT/)
    assert.match(text, /Function tools are the only way/)
    assert.match(text, /go/)
    assert.match(text, /Vite \+ TypeScript under src/)
    assert.match(text, /Do not scatter cube\.js/)
  }
  assert.match(modelHarnessAddon('deepseek-chat'), /never emit <write>/i)
  assert.match(modelHarnessAddon('gpt-4.1'), /OpenAI/)
})

test('live user request is last in system', () => {
  const out = appendLiveUserRequest('SYSTEM RULES\nLIVE USER REQUEST (highest priority — do this now):\nold', 'go')
  assert.ok(out.endsWith('go'))
  assert.equal(out.match(/LIVE USER REQUEST/g)?.length, 1)
})

test('force tools on first build round for any model', () => {
  assert.equal(
    shouldForceToolChoice({
      toolsEnabled: true,
      intent: 'build',
      model: 'deepseek-v4-flash',
      hasToolMessages: false,
    }),
    true,
  )
  assert.equal(
    shouldForceToolChoice({
      toolsEnabled: true,
      intent: 'build',
      model: 'gpt-4.1',
      hasToolMessages: false,
    }),
    true,
  )
  assert.equal(
    shouldForceToolChoice({
      toolsEnabled: true,
      intent: 'fix',
      model: 'claude-sonnet-4',
    }),
    true,
  )
  assert.equal(
    shouldForceToolChoice({
      toolsEnabled: true,
      intent: 'build',
      model: 'deepseek-v4-flash',
      hasToolMessages: true,
    }),
    true,
  )
  assert.equal(
    shouldForceToolChoice({
      toolsEnabled: true,
      intent: 'build',
      model: 'gpt-4.1',
      hasWrites: true,
    }),
    false,
  )
  assert.equal(
    shouldForceToolChoice({
      toolsEnabled: true,
      intent: 'chat',
      model: 'gpt-4.1',
    }),
    false,
  )
})
