import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzeAttachment,
  isTextAttachment,
  mediaGap,
  messageHasBody,
  normalizeChatMessagesForAgent,
  repairToolConversation,
  flattenToolTurnsForProvider,
  storageSafeModelMessages,
  isProviderToolChainValid,
  messagesForProvider,
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
  assert.match(row.content, /Screenshot\/image attached/)
  assert.doesNotMatch(row.content, /iVBOR/)
})

test('text-only models cannot read screenshots; Flash and vision models can', () => {
  const files = [{ name: 'ui.png', mime: 'image/png', size: 10 }]
  assert.equal(mediaGap(files, modelMedia('deepseek-chat')), 'image')
  assert.equal(mediaGap(files, modelMedia('deepseek-v4-pro')), 'image')
  assert.equal(modelCanReadFiles('deepseek-v4-flash', files), true)
  assert.equal(modelCanReadFiles('deepseek-flash', files), true)
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

test('DeepSeek V4 Flash packing includes image_url pixels', async () => {
  const { toChatCompletionsMessages, collectAttachedImages } = await import('./chatMedia.ts')
  const packed = toChatCompletionsMessages(
    [
      {
        role: 'user',
        content: 'what is wrong in this screenshot',
        files: [
          {
            name: 'ui.png',
            mime: 'image/png',
            size: 12,
            dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
          },
        ],
      },
    ],
    'deepseek-v4-flash',
    'deepseek',
  )
  const parts = packed[0]?.content as { type: string; image_url?: { url: string } }[]
  assert.equal(parts.some((part) => part.type === 'image_url'), true)
  const follow = collectAttachedImages(
    [],
    [
      {
        role: 'user',
        content: 'see the image i shared',
        files: [{ name: 'ui.png', mime: 'image/png', size: 12, dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }],
      },
    ],
  )
  assert.equal(follow.length, 0)
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

test('normalizeChatMessagesForAgent drops orphan tool rows', () => {
  const out = normalizeChatMessagesForAgent([
    { role: 'user', content: 'hi' },
    { role: 'tool', tool_call_id: 'missing', content: 'orphan' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'terminal', arguments: '{}' } }],
    },
    { role: 'tool', tool_call_id: 'call_1', content: 'v24' },
  ])
  assert.equal(out.filter((m) => m.role === 'tool').length, 1)
  assert.equal(out.find((m) => m.role === 'tool')?.content, 'v24')
})

test('flattenToolTurnsForProvider converts orphan tool rows to user text', () => {
  const out = flattenToolTurnsForProvider([
    { role: 'user', content: 'bugs?' },
    { role: 'tool', tool_call_id: 'x', content: 'file data', name: 'read' },
  ])
  assert.equal(out.filter((m) => m.role === 'tool').length, 0)
  assert.equal(
    out.some((m) => m.role === 'user' && /file data/.test(String(m.content))),
    true,
  )
})

test('storageSafeModelMessages never keeps tool roles', () => {
  const out = storageSafeModelMessages([
    { role: 'user', content: 'hi' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read', arguments: '{}' } }],
    },
    { role: 'tool', tool_call_id: 'c1', content: 'ok', name: 'read' },
    { role: 'assistant', content: 'done' },
  ])
  assert.equal(out.some((m) => m.role === 'tool'), false)
  assert.equal(out.some((m) => m.tool_calls?.length), false)
  assert.match(String(out.find((m) => m.role === 'user' && /ok/.test(m.content))?.content), /ok/)
  assert.equal(out.filter((m) => m.role === 'assistant').pop()?.content, 'done')
})

test('flattenToolTurnsForProvider reorders out-of-order parallel tool results', () => {
  const out = flattenToolTurnsForProvider([
    { role: 'user', content: 'see this' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        { id: 'a', type: 'function', function: { name: 'read', arguments: '{"path":"main.ts"}' } },
        { id: 'b', type: 'function', function: { name: 'read', arguments: '{"path":"cube3d.ts"}' } },
      ],
    },
    { role: 'tool', tool_call_id: 'b', content: 'cube', name: 'read' },
    { role: 'tool', tool_call_id: 'a', content: 'main', name: 'read' },
  ])
  const tools = out.filter((m) => m.role === 'tool')
  assert.equal(tools.length, 2)
  assert.equal(tools[0].tool_call_id, 'a')
  assert.equal(tools[1].tool_call_id, 'b')
  const asst = out.find((m) => m.role === 'assistant')
  assert.equal(out[out.indexOf(asst!) + 1].role, 'tool')
})

test('flattenToolTurnsForProvider does not slice long tool results', () => {
  const body = `src/cube3d.ts (400 lines)\n${'x'.repeat(8000)}TAIL`
  const out = flattenToolTurnsForProvider([
    { role: 'user', content: 'fix' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read', arguments: '{}' } }],
    },
    { role: 'tool', tool_call_id: 'c1', content: body, name: 'read' },
  ])
  const tool = out.find((m) => m.role === 'tool')
  assert.equal(String(tool?.content), body)
})

test('repairToolConversation drops tool turn broken by user message in the middle', () => {
  const out = repairToolConversation([
    { role: 'user', content: 'what is in my code' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read', arguments: '{}' } }],
    },
    { role: 'tool', tool_call_id: 'c1', content: 'ok' },
    { role: 'user', content: '[harness nudge]' },
    { role: 'tool', tool_call_id: 'c1', content: 'duplicate orphan' },
  ])
  assert.equal(out.filter((m) => m.role === 'tool').length, 1)
  assert.equal(out[out.length - 1].role, 'user')
})

test('messageHasBody keeps assistant tool_calls and tool results for agent rounds', () => {
  assert.equal(
    messageHasBody({
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'terminal', arguments: '{}' } }],
    }),
    true,
  )
  assert.equal(messageHasBody({ role: 'tool', tool_call_id: 'call_1', content: 'v24.16.0' }), true)
  assert.equal(messageHasBody({ role: 'assistant', content: '   ' }), false)
})

test('flattenToolTurnsForProvider moves a user/image row out of the tool chain', () => {
  const out = flattenToolTurnsForProvider([
    { role: 'user', content: 'go on apply' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        { id: 'a', type: 'function', function: { name: 'read', arguments: '{}' } },
        { id: 'b', type: 'function', function: { name: 'read', arguments: '{}' } },
      ],
    },
    {
      role: 'user',
      content: 'go on apply',
      files: [{ name: 'shot.png', mime: 'image/png', size: 10, dataUrl: 'data:image/png;base64,xx' }],
    },
    { role: 'tool', tool_call_id: 'a', content: 'main', name: 'read' },
    { role: 'tool', tool_call_id: 'b', content: 'cube', name: 'read' },
  ])
  assert.equal(isProviderToolChainValid(out), true)
  const asst = out.find((m) => m.role === 'assistant' && m.tool_calls?.length)
  const idx = out.indexOf(asst!)
  assert.equal(out[idx + 1]?.role, 'tool')
  assert.equal(out[idx + 1]?.tool_call_id, 'a')
  assert.equal(out[idx + 2]?.role, 'tool')
  assert.equal(out[idx + 2]?.tool_call_id, 'b')
  assert.equal(out[idx + 3]?.role, 'user')
})

test('messagesForProvider keeps a valid chain when flatten repairs orphans', () => {
  const out = messagesForProvider([
    { role: 'user', content: 'fix it' },
    { role: 'tool', tool_call_id: '', content: 'orphan' },
  ])
  assert.equal(out.some((m) => m.role === 'tool'), false)
  assert.equal(isProviderToolChainValid(out), true)
})

test('messagesForProvider keeps full tool results after a harness nudge', () => {
  const body = `src/cube3d.ts (400 lines)\n${'x'.repeat(20_000)}TAIL`
  const out = messagesForProvider([
    { role: 'user', content: 'fix the cubes' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read', arguments: '{}' } }],
    },
    { role: 'tool', tool_call_id: 'c1', content: body, name: 'read' },
    { role: 'user', content: '[Soumtok harness] Guide: finish with diff()' },
  ])
  assert.equal(isProviderToolChainValid(out), true)
  const tool = out.find((m) => m.role === 'tool')
  assert.equal(String(tool?.content), body)
  assert.ok(String(tool?.content).length > 12_000)
  assert.equal(
    out.some((m) => m.role === 'user' && /Tool results on the user's machine/.test(String(m.content))),
    false,
  )
})

test('storageSafeModelMessages does not slice a long tool digest to 12k', () => {
  const body = `src/cube3d.ts\n${'x'.repeat(20_000)}TAIL`
  const out = storageSafeModelMessages([
    { role: 'user', content: 'fix' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read', arguments: '{}' } }],
    },
    { role: 'tool', tool_call_id: 'c1', content: body, name: 'read' },
  ])
  const folded = out.find((m) => m.role === 'user' && /TAIL/.test(String(m.content || '')))
  assert.ok(String(folded?.content || '').length > 12_000)
})
