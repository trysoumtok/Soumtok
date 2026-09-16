import assert from 'node:assert/strict'
import test from 'node:test'
import { needsVisionWrap, stampAttachmentMeta } from './modelWrap.ts'
import type { ChatFile } from './chatMedia.ts'

test('text-only deepseek needs vision wrap for images', () => {
  const files: ChatFile[] = [{ name: 'shot.png', mime: 'image/png', size: 1000, dataUrl: 'data:image/png;base64,aa' }]
  assert.equal(needsVisionWrap('deepseek-chat', files), true)
  assert.equal(needsVisionWrap('deepseek-v4-pro', files), true)
  assert.equal(needsVisionWrap('deepseek-v4-flash', files), false)
  assert.equal(needsVisionWrap('gpt-4o', files), false)
})

test('stampAttachmentMeta adds analysis stub', () => {
  const out = stampAttachmentMeta([{ name: 'x.png', mime: 'image/png', size: 500 }])
  assert.match(out[0].analysis || '', /Kind: image/)
})
