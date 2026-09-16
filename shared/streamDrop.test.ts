import assert from 'node:assert/strict'
import test from 'node:test'
import { friendlyStreamError, isTransientStreamError } from './streamDrop.ts'

test('terminated streams are treated as a drop, not a dead job', () => {
  assert.equal(isTransientStreamError('terminated'), true)
  assert.equal(isTransientStreamError('The operation was aborted due to timeout'), true)
  assert.equal(isTransientStreamError('ECONNRESET'), true)
  assert.equal(isTransientStreamError('diff needs old_string'), false)
  assert.match(friendlyStreamError('terminated'), /Retry/i)
  assert.doesNotMatch(friendlyStreamError('terminated'), /^terminated$/i)
  assert.equal(friendlyStreamError('No file at index.html'), 'No file at index.html')
})
