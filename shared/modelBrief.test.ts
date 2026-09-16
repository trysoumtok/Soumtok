import test from 'node:test'
import assert from 'node:assert/strict'
import { buildModelBriefById } from './modelBrief.ts'

test('DeepSeek V4.1 Flash study uses V4.1 generation', () => {
  const brief = buildModelBriefById('deepseek-v4-flash')
  assert.ok(brief)
  assert.match(brief!.name, /V4\.1/)
  assert.equal(brief!.generation, 'V4.1')
  assert.equal(brief!.documentKind, 'Model Study')
})

test('DeepSeek V4 Chat is separate from V4.1 line', () => {
  const chat = buildModelBriefById('deepseek-chat')
  const flash = buildModelBriefById('deepseek-v4-flash')
  assert.ok(chat?.name.includes('V4'))
  assert.ok(flash?.name.includes('V4.1'))
  assert.notEqual(chat!.name, flash!.name)
})

test('buildModelBrief includes benchmark sections', () => {
  const model = buildModelBriefById('gpt-6-astra')
  assert.ok(model)
  assert.ok(model!.benchmarks.length >= 2)
  assert.ok(model!.whenToPick.length >= 1)
})

test('every major family has a sourced dossier with images', () => {
  for (const id of ['deepseek-v4-flash', 'deepseek-chat', 'gpt-6-astra', 'gpt-5.6-sol', 'claude-opus-5', 'grok-4.6']) {
    const study = buildModelBriefById(id)
    assert.ok(study, id)
    assert.ok(study!.gallery.length >= 2, id)
    assert.ok(study!.sources.length >= 1, id)
    assert.ok(study!.benchmarkRows.length >= 2, id)
    assert.ok(study!.official.length >= 3, id)
    assert.ok(study!.chapters.length >= 12, id)
  }
})

test('gallery uses public vendor images not generated plates', () => {
  const study = buildModelBriefById('o3-mini')
  assert.ok(study)
  assert.ok(study!.gallery.some((g) => g.file.includes('openai-o3')))
  assert.ok(!study!.gallery.some((g) => /Soumtok study plate|study-flash-ui|study-openai-work/.test(`${g.file} ${g.credit}`)))
})

test('model study includes vendor list price not platform billing', () => {
  const flash = buildModelBriefById('deepseek-v4-flash')
  const astra = buildModelBriefById('gpt-6-astra')
  assert.ok(flash?.pricing.vendor)
  assert.match(flash!.pricing.headline, /\$/)
  assert.ok(astra?.pricing.vendor)
  assert.match(astra!.pricing.vendorLine, /10/)
  assert.ok(flash!.stats.some((s) => s.label === 'List price'))
  assert.ok(flash!.chapters.some((ch) => ch.title === 'API pricing'))
  assert.ok(!flash!.chapters.some((ch) => ch.title.includes('Soumtok')))
})

test('model study body is model-focused not platform marketing', () => {
  const study = buildModelBriefById('gpt-6-astra')
  assert.ok(study)
  const blob = JSON.stringify({
    chapters: study!.chapters,
    timeline: study!.timeline,
    classroom: study!.classroom,
    faq: study!.faq,
    glossary: study!.glossary,
    official: study!.official,
    did: study!.did,
  })
  assert.ok(!/Test Hub|Studio Agent|BYOK|included pool/i.test(blob))
  assert.ok(!/Soumtok/i.test(blob))
  assert.ok(study!.classroom.some((lab) => lab.title.includes('Baseline')))
})
