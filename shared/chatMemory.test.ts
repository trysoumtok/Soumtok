import assert from 'node:assert/strict'
import test from 'node:test'
import { executeSystemPrompt, historyForModel, inferPlan, outputBudget, packWorkspaceFiles, recapEvents, runLogs, spokenRecap, threadMemory, type AgentEvent } from './agent.ts'

test('packWorkspaceFiles lists every path, not just the first eight', () => {
  const files: Record<string, string> = {}
  for (let i = 0; i < 12; i++) files[`page-${i}.html`] = `<h1>page ${i}</h1>`
  files['index.html'] = '<h1>Home</h1>'
  const packed = packWorkspaceFiles(files, 20_000)
  assert.match(packed, /12 files|13 files/)
  assert.match(packed, /FILE index\.html/)
  assert.match(packed, /page-11\.html/)
})

test('historyForModel does not stub the last reply as continue from those files', () => {
  const events: AgentEvent[] = [
    { kind: 'diff', path: 'index.html', added: 40, removed: 0, lines: [] },
    { kind: 'preview', title: 'Ember & Oak Coffee', description: 'Open' },
    { kind: 'summary', text: 'Built the Ember & Oak Coffee landing page.' },
  ]
  const history = historyForModel(
    [
      { role: 'user', content: 'make a coffee shop site' },
      { role: 'assistant', content: '{"events":[],"files":{}}' },
      { role: 'user', content: 'hy' },
    ],
    { files: { 'index.html': '<h1>Ember</h1>' }, events, marks: [0, 3], previewTitle: 'Ember & Oak Coffee' },
  )
  assert.equal(history[0]?.content, 'make a coffee shop site')
  assert.match(history[1]?.content || '', /Ember & Oak Coffee/)
  assert.match(history[1]?.content || '', /index\.html/)
  assert.doesNotMatch(history[1]?.content || '', /Continue from those files/)
  assert.equal(history[2]?.content, 'hy')
})

test('threadMemory keeps the project name and source', () => {
  const memory = threadMemory({
    files: { 'index.html': '<h1>Ember & Oak</h1>' },
    events: [{ kind: 'summary', text: 'Shipped the cafe site.' }],
    previewTitle: 'Ember & Oak Coffee',
  })
  assert.match(memory, /Ember & Oak Coffee/)
  assert.match(memory, /Shipped the cafe site/)
  assert.match(memory, /<h1>Ember & Oak<\/h1>/)
})

test('recapEvents names written files', () => {
  const recap = recapEvents([
    { kind: 'diff', path: 'styles.css', added: 12, removed: 2, lines: [] },
    { kind: 'summary', text: 'Restyled the header.' },
  ])
  assert.match(recap, /styles\.css/)
  assert.match(recap, /Restyled the header/)
})

test('executeSystemPrompt does not mention Cursor', () => {
  const plan = inferPlan('make a coffee shop site', false, { answered: true })
  const prompt = executeSystemPrompt(plan)
  assert.doesNotMatch(prompt, /cursor/i)
  assert.match(prompt, /Soumtok Studio/)
  assert.match(prompt, /40 most interesting lines/)
  assert.match(prompt, /Never accept API keys/)
  assert.doesNotMatch(prompt, /Emit an updated todo/)
  assert.doesNotMatch(prompt, /After the first thought and todo/)
})

test('spokenRecap names the project when the summary is missing', () => {
  const text = spokenRecap({
    files: { 'index.html': '<h1>Hi</h1>', 'styles/main.css': 'body{}' },
    events: [{ kind: 'diff', path: 'index.html', added: 10, removed: 0, lines: [] }],
    previewTitle: 'Harbor Cafe',
    previewHtml: '<html></html>',
  })
  assert.match(text, /Harbor Cafe/)
  assert.match(text, /index\.html/)
  assert.doesNotMatch(text, /Wrote the project files/)
})

test('chat and site plans do not fake an install environment', () => {
  const chat = inferPlan('hi', false)
  assert.equal(chat.mode, 'chat')
  assert.deepEqual(runLogs(chat), [])
  const site = inferPlan('make a coffee shop site', false, { answered: true })
  assert.equal(site.mode, 'build')
  assert.equal(site.needsEnv, false)
  assert.ok(runLogs(site).length <= 1)
  assert.equal(outputBudget(site), 32768)
  assert.equal(outputBudget(chat), 2048)
})
