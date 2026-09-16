import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldShrinkImage, takeChatFiles, filesFromClipboard, pasteBelongsToField } from '../src/lib/chatFiles.ts'

test('large screenshots should shrink before upload', () => {
  assert.equal(shouldShrinkImage({ type: 'image/png', size: 2_000_000 }), true)
  assert.equal(shouldShrinkImage({ type: 'image/jpeg', size: 80_000 }), false)
  assert.equal(shouldShrinkImage({ type: 'image/gif', size: 2_000_000 }), false)
  assert.equal(shouldShrinkImage({ type: 'application/pdf', size: 2_000_000 }), false)
})

test('takeChatFiles lets an oversized screenshot through so it can shrink', () => {
  const huge = new File([new Uint8Array(7 * 1024 * 1024)], 'shot.png', { type: 'image/png' })
  const picked = takeChatFiles([huge])
  assert.equal(picked.files.length, 1)
  assert.equal(picked.error, undefined)
})

test('clipboard paste picks screenshot files', () => {
  const shot = new File([new Uint8Array(12)], 'pasted-image.png', { type: 'image/png' })
  const files = filesFromClipboard({
    files: [],
    items: [{ kind: 'file', type: 'image/png', getAsFile: () => shot }],
  })
  assert.equal(files.length, 1)
  assert.equal(files[0]?.name, 'pasted-image.png')
  assert.equal(pasteBelongsToField(null), false)
})
