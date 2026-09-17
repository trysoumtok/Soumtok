import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { classifyFile, extractFileContent } = require('./fileExtract.cjs')

test('classifyFile detects common types', () => {
  assert.equal(classifyFile('report.pdf'), 'pdf')
  assert.equal(classifyFile('notes.docx'), 'docx')
  assert.equal(classifyFile('data.xlsx'), 'xlsx')
  assert.equal(classifyFile('deck.pptx'), 'pptx')
  assert.equal(classifyFile('readme.md'), 'text')
  assert.equal(classifyFile('photo.png'), 'image')
})

test('extractFileContent reads plain text', async () => {
  const out = await extractFileContent('hello.txt', 'text/plain', Buffer.from('Hello Soumtok'))
  assert.match(out.text, /Hello Soumtok/)
})
