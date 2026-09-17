import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const {
  parseToolArgs,
  toolCallArgs,
  mergeToolCalls,
  normalizeWorkspaceEditArgs,
} = require('../src/shared/toolArgsRuntime.js')
const { sanitizeAssistantText } = require('../src/main/dsmlTools.js')

const obj = { filepath: 'src/main.ts', body: 'export {}' }
const norm = normalizeWorkspaceEditArgs(obj)
if (norm.path !== 'src/main.ts' || norm.content !== 'export {}') {
  console.error('FAIL: alias normalize', norm)
  process.exit(1)
}

const partial = '{"path":"package.json","content":"{\\"name\\": \\"demo\\"'
const peeked = parseToolArgs(partial)
if (peeked.path !== 'package.json') {
  console.error('FAIL: partial JSON path', peeked)
  process.exit(1)
}

const fromObj = parseToolArgs({ path: 'index.html', content: '<html></html>' })
if (fromObj.path !== 'index.html') {
  console.error('FAIL: object args', fromObj)
  process.exit(1)
}

const nested = toolCallArgs({ name: 'write', function: { name: 'write', arguments: { file_path: 'a.js', content: '1' } } })
if (nested.path !== 'a.js') {
  console.error('FAIL: nested openai shape', nested)
  process.exit(1)
}

const brokenNative = [{ id: '1', name: 'write', arguments: '{}' }]
const text = '<write path="vite.config.ts">export default {}\n</write>'
const merged = mergeToolCalls(brokenNative, text, sanitizeAssistantText)
const mArgs = JSON.parse(merged[0].arguments)
if (mArgs.path !== 'vite.config.ts') {
  console.error('FAIL: merge broken native with XML', merged)
  process.exit(1)
}

console.log('OK tool args runtime')
