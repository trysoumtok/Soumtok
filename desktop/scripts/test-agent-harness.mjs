import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { runAgentHarness } = require('../src/main/agentHarness.js')

const events = []
const mockApi = async (method, path, body) => {
  if (method === 'POST' && path.includes('agent/round')) {
    return { status: 404, data: { error: 'Not Found' } }
  }
  if (method === 'POST' && path === '/api/studio/complete') {
    const lastUser = [...(body?.messages || [])].reverse().find((m) => m.role === 'user')
    const text = typeof lastUser?.content === 'string' ? lastUser.content : ''
    return {
      status: 200,
      data: {
        text: text.toLowerCase().includes('hy') ? 'Hey! What should we work on in this project?' : 'OK',
        model: 'deepseek-chat',
        promptTokens: 10,
        completionTokens: 12,
      },
    }
  }
  return { status: 500, data: { error: 'unexpected ' + path } }
}

const result = await runAgentHarness({
  api: mockApi,
  folder: 'C:\\test\\proj',
  model: 'deepseek-v4-flash',
  mode: 'agent',
  driver: 'ide',
  messages: [],
  userMessage: 'hy',
  openFiles: [],
  branch: 'main',
  files: [],
  agentPrefs: {},
  signal: null,
  onEvent: (ev) => events.push(ev),
})

if (result.error) {
  console.error('FAIL:', result.error)
  process.exit(1)
}
if (!result.text || !result.text.includes('Hey')) {
  console.error('FAIL: bad text', result.text)
  process.exit(1)
}
const hasStatus = events.some((e) => e.type === 'status')
const hasAssistant = events.some((e) => e.type === 'assistant')
if (!hasStatus || !hasAssistant) {
  console.error('FAIL: events', events)
  process.exit(1)
}
console.log('OK harness fallback:', result.text)
console.log('OK events:', events.map((e) => e.type + (e.text ? ':' + e.text.slice(0, 40) : '')).join(' | '))
