import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzeAttachment,
  isTextAttachment,
  mediaGap,
  modelCanReadFiles,
  modelMedia,
  slimChatFiles,
} from './chatMedia.ts'

test('analyzeAttachment extracts text files for documents and the model', () => {
  const row = analyzeAttachment({
    name: 'app.ts',
    mime: 'text/typescript',
    size: 1200,
    text: 'export const n = 1\n',
  })
  assert.equal(row.kind, 'text')
  assert.equal(row.title, 'app.ts')
  assert.match(row.content, /Extracted text/)
  assert.match(row.content, /export const n = 1/)
})

test('analyzeAttachment labels images without dumping pixels into the document', () => {
  const row = analyzeAttachment({ name: 'shot.png', mime: 'image/png', size: 240_000 })
  assert.equal(row.kind, 'image')
  assert.match(row.content, /Image stored/)
  assert.doesNotMatch(row.content, /iVBOR/)
})

test('text-only models cannot read screenshots; vision models can', () => {
  const files = [{ name: 'ui.png', mime: 'image/png', size: 10 }]
  assert.equal(mediaGap(files, modelMedia('deepseek-v4-flash')), 'image')
  assert.equal(modelCanReadFiles('deepseek-v4-flash-vision-exp', files), true)
  assert.equal(modelCanReadFiles('claude-sonnet-5', files), true)
  assert.equal(modelCanReadFiles('gemini-3.8-flash', files), true)
})

test('only Gemini watches video', () => {
  const files = [{ name: 'clip.mp4', mime: 'video/mp4', size: 10 }]
  assert.equal(modelCanReadFiles('gemini-3.8-flash', files), true)
  assert.equal(modelCanReadFiles('claude-sonnet-5', files), false)
  assert.equal(isTextAttachment('app.ts', 'text/plain'), true)
  assert.equal(isTextAttachment('shot.png', 'image/png'), false)
})

test('slimChatFiles drops data URLs once the file is in documents', () => {
  const slim = slimChatFiles([
    {
      id: 'file-1',
      documentId: 'doc-1',
      name: 'shot.png',
      mime: 'image/png',
      size: 12,
      dataUrl: 'data:image/png;base64,AAAA',
    },
  ])
  assert.equal(slim?.[0].id, 'file-1')
  assert.equal(slim?.[0].documentId, 'doc-1')
  assert.equal(slim?.[0].dataUrl, undefined)
})

test('relative file previews are not sent as image_url', async () => {
  const { isProviderMediaUrl, toChatCompletionsMessages } = await import('./chatMedia.ts')
  assert.equal(isProviderMediaUrl('/api/files/abc/download?inline=1'), false)
  assert.equal(isProviderMediaUrl('data:image/png;base64,iVBORw0KGgo='), true)
  assert.equal(isProviderMediaUrl('https://cdn.example.com/shot.png'), true)
  const packed = toChatCompletionsMessages(
    [
      {
        role: 'user',
        content: 'do you see this image',
        files: [
          {
            name: 'chart.png',
            mime: 'image/png',
            size: 12,
            id: 'file-1',
            dataUrl: '/api/files/file-1/download?inline=1',
          },
        ],
      },
    ],
    'grok-4.6',
    'xai',
  )
  const parts = packed[0]?.content as { type: string; image_url?: { url: string } }[]
  assert.equal(parts.some((part) => part.type === 'image_url'), false)
  const withBytes = toChatCompletionsMessages(
    [
      {
        role: 'user',
        content: 'do you see this image',
        files: [
          {
            name: 'chart.png',
            mime: 'image/png',
            size: 12,
            dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
          },
        ],
      },
    ],
    'grok-4.6',
    'xai',
  )
  const vision = withBytes[0]?.content as { type: string; image_url?: { url: string } }[]
  assert.equal(vision.some((part) => part.type === 'image_url'), true)
  assert.match(vision.find((part) => part.type === 'image_url')?.image_url?.url || '', /^data:image\/png;base64,/)
})

test('saved text files are what the model receives', async () => {
  const { toChatCompletionsMessages } = await import('./chatMedia.ts')
  const packed = toChatCompletionsMessages(
    [
      {
        role: 'user',
        content: 'fix this',
        files: [{ name: 'app.ts', mime: 'text/plain', size: 20, text: 'export const n = 1' }],
      },
    ],
    'deepseek-v4-flash',
    'deepseek',
  )
  const parts = packed[0]?.content as { type: string; text?: string }[]
  assert.equal(parts[0]?.type, 'text')
  assert.match(String(parts[0]?.text), /export const n = 1/)
  assert.match(String(parts[0]?.text), /app\.ts/)
})
