import assert from 'node:assert/strict'
import test from 'node:test'
import { streamDelta } from './studio.ts'

test('streamDelta includes reasoning_content before content', () => {
  const reasoning = streamDelta({
    choices: [{ delta: { reasoning_content: 'think step 1' } }],
  })
  assert.equal(reasoning, 'think step 1')
})

test('streamDelta prefers content over reasoning when both present', () => {
  const out = streamDelta({
    choices: [{ delta: { content: 'hello', reasoning_content: 'think' } }],
  })
  assert.equal(out, 'hello')
})

test('streamDelta reads Anthropic thinking_delta', () => {
  const out = streamDelta({
    type: 'content_block_delta',
    delta: { type: 'thinking_delta', thinking: 'planning…' },
  })
  assert.equal(out, 'planning…')
})
