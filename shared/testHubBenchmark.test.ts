import test from 'node:test'
import assert from 'node:assert/strict'
import {
  benchmarkPayloadFromCompare,
  looksLikeViteProject,
  rankCompareRuns,
  scoreCompareRun,
} from './testHubBenchmark.ts'

test('looksLikeViteProject detects vite in package.json', () => {
  assert.equal(
    looksLikeViteProject({
      'package.json': JSON.stringify({ scripts: { dev: 'vite' }, devDependencies: { vite: '^6.0.0' } }),
    }),
    true,
  )
  assert.equal(looksLikeViteProject({ 'index.html': '<html></html>' }), false)
})

test('scoreCompareRun rewards files and preview, penalizes errors', () => {
  const good = scoreCompareRun({
    model: 'deepseek-v4-flash',
    status: 'done',
    ms: 8000,
    text: '```html file="index.html"\n<!DOCTYPE html><html><body>Hi</body></html>\n```',
    previewErrors: 0,
  })
  const bad = scoreCompareRun({
    model: 'deepseek-v4-flash',
    status: 'done',
    text: 'Sorry, I cannot help.',
    previewErrors: 2,
  })
  assert.ok(good > bad)
  assert.equal(scoreCompareRun({ model: 'x', status: 'error' }), 0)
})

test('rankCompareRuns orders by auto score', () => {
  const ranked = rankCompareRuns([
    { model: 'a', status: 'done', text: 'no files' },
    {
      model: 'b',
      status: 'done',
      text: '```html file="index.html"\n<!DOCTYPE html><html><body>App</body></html>\n```',
    },
  ])
  assert.equal(ranked[0].run.model, 'b')
})

test('benchmarkPayloadFromCompare picks winner', () => {
  const payload = benchmarkPayloadFromCompare({
    prompt: 'build a counter',
    compareMode: true,
    runs: [
      { model: 'deepseek-v4-flash', modelName: 'Flash', status: 'done', ms: 5000, text: 'plain text' },
      {
        model: 'claude-sonnet-4-6',
        modelName: 'Sonnet',
        status: 'done',
        ms: 9000,
        text: '```html file="index.html"\n<!DOCTYPE html><html><body><button>+</button></body></html>\n```',
      },
    ],
  })
  assert.equal(payload.kind, 'compare')
  assert.equal(payload.winnerModel, 'claude-sonnet-4-6')
  assert.ok((payload.winnerScore ?? 0) > 0)
  assert.equal(payload.models.length, 2)
})
