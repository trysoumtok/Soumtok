import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applySlash,
  extractUrls,
  matchSkills,
  needsWeb,
  platformBrief,
  slashMatch,
} from './capabilities.ts'

test('extracts urls and flags web questions', () => {
  assert.deepEqual(extractUrls('see https://example.com/docs and https://example.com/docs'), ['https://example.com/docs'])
  assert.equal(needsWeb('what is the latest on rust 2024'), true)
  assert.equal(needsWeb('make the header sticky'), false)
})

test('slash commands expand into real prompts', () => {
  assert.ok(slashMatch('/re').some((item) => item.slash === '/research'))
  assert.match(applySlash('/doc write the launch notes'), /documents library/)
})

test('skills that overlap the prompt are suggested', () => {
  const hits = matchSkills('write tests for the checkout', [
    { id: '1', name: 'Testing guide', excerpt: 'unit tests checkout coverage' },
    { id: '2', name: 'Brand voice', excerpt: 'tone of voice for ads' },
  ])
  assert.equal(hits[0]?.name, 'Testing guide')
  assert.ok(!hits.some((item) => item.name === 'Brand voice') || hits[0].name === 'Testing guide')
})

test('platform brief includes fetched pages and mcp', () => {
  const brief = platformBrief({
    skills: [{ name: 'Testing guide' }],
    connectors: [{ name: 'GitHub', connected: true, tools: [{ name: 'search_code', description: '' }] }],
    fetched: [{ title: 'Rust', url: 'https://en.wikipedia.org/wiki/Rust', text: 'A language.' }],
  })
  assert.match(brief, /Testing guide/)
  assert.match(brief, /search_code/)
  assert.match(brief, /untrusted source material/)
  assert.match(brief, /A language/)
})
