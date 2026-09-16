import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AUTO_MODEL_ID,
  anthropicOmitsSamplingParams,
  openaiOmitsTemperature,
  autoBudget,
  isAutoModel,
  pickAutoModel,
  sortModelsByPower,
  soumtokCodingModels,
  upstreamModelId,
  usesMaxCompletionTokens,
  IMAGE_MODEL,
  isImageModel,
} from './models.ts'

const catalog = [
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', cost: 'Cheapest', ready: true },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', cost: 'Cheap', ready: true },
  { id: 'claude-opus-5', name: 'Claude Opus 5', cost: 'High', ready: true },
  { id: 'gpt-6-astra', name: 'GPT-6 Astra', cost: 'Highest', ready: true },
  { id: 'claude-fable-5-1', name: 'Claude Fable 5.1', cost: 'Highest', ready: true },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', cost: 'Low', ready: true },
  { id: 'deepseek-v4-flash-vision-exp', name: 'DeepSeek V4 Flash Vision', cost: 'Low', ready: true },
]

test('the picker lists premium and powerful models first', () => {
  const ids = sortModelsByPower(catalog).map((item) => item.id)
  assert.equal(ids[0] === 'gpt-6-astra' || ids[0] === 'claude-fable-5-1', true)
  assert.ok(ids.indexOf('claude-opus-5') < ids.indexOf('deepseek-v4-flash'))
  assert.ok(ids.indexOf('deepseek-v4-pro') < ids.indexOf('gpt-4.1-mini'))
})

test('auto picks a cheap-strong model even on ultra — Fable is opt-in', () => {
  assert.equal(autoBudget('hobby'), 'tight')
  assert.equal(autoBudget('ultra'), 'plenty')
  const hello = pickAutoModel({ models: catalog, task: 'hello', plan: 'hobby', analysisKind: 'chat' })
  assert.equal(['deepseek-v4-flash', 'gpt-4.1-mini'].includes(hello), true)
  const hard = pickAutoModel({
    models: catalog,
    task: 'add a working light dark theme switch in the footer',
    plan: 'ultra',
    hasFiles: true,
    runMode: 'agent',
    analysisKind: 'theme',
  })
  assert.equal(hard, 'deepseek-v4-pro')
  assert.equal(['gpt-6-astra', 'claude-fable-5-1', 'claude-opus-5'].includes(hard), false)
  const maxIntel = pickAutoModel({
    models: catalog,
    task: 'tighten the landing copy',
    plan: 'pro',
    hasFiles: true,
    runMode: 'agent',
    analysisKind: 'edit',
    intelligence: 'max',
  })
  assert.equal(maxIntel, 'deepseek-v4-pro')
  const fastIntel = pickAutoModel({
    models: catalog,
    task: 'add a working light dark theme switch',
    plan: 'pro',
    hasFiles: true,
    runMode: 'agent',
    analysisKind: 'theme',
    intelligence: 'fast',
  })
  assert.equal(fastIntel, 'deepseek-v4-flash')
  const trialHard = pickAutoModel({
    models: catalog,
    task: 'add a working light dark theme switch',
    plan: 'hobby',
    hasFiles: true,
    runMode: 'agent',
    analysisKind: 'theme',
  })
  assert.equal(costOk(trialHard), true)
  const shot = pickAutoModel({
    models: catalog,
    task: 'match this screenshot',
    plan: 'pro',
    hasImage: true,
    runMode: 'agent',
  })
  assert.equal(shot, 'deepseek-v4-flash-vision-exp')
})

test('Flash and Flash Vision call the multimodal DeepSeek API', () => {
  assert.equal(upstreamModelId('deepseek-v4-flash'), 'deepseek-flash')
  assert.equal(upstreamModelId('deepseek-v4-flash-vision-exp'), 'deepseek-flash')
  assert.equal(upstreamModelId('deepseek-v4-pro'), 'deepseek-v4-pro')
})

test('OpenAI chat completions use max_completion_tokens', () => {
  assert.equal(usesMaxCompletionTokens('openai', 'gpt-5.6-sol'), true)
  assert.equal(usesMaxCompletionTokens('openai', 'gpt-4'), true)
  assert.equal(usesMaxCompletionTokens('openai', 'gpt-4.1-mini'), true)
  assert.equal(usesMaxCompletionTokens('openrouter', 'openai/gpt-4.1-mini'), true)
  assert.equal(usesMaxCompletionTokens('anthropic', 'claude-sonnet-4-6'), false)
  assert.equal(usesMaxCompletionTokens('openai', 'gpt-5'), false)
})

test('auto is a picker choice, not a provider model id', () => {
  assert.equal(isAutoModel(AUTO_MODEL_ID), true)
  assert.equal(isAutoModel('claude-opus-5'), false)
})

test('auto never returns a model above the plan budget', () => {
  const tight = pickAutoModel({
    models: catalog,
    task: 'refactor the whole auth stack',
    plan: 'hobby',
    hasFiles: true,
    runMode: 'agent',
    analysisKind: 'edit',
  })
  assert.equal(costOk(tight), true)
})

function costOk(id: string) {
  return id === 'deepseek-v4-flash' || id === 'deepseek-v4-pro' || id === 'gpt-4.1-mini' || id === 'deepseek-v4-flash-vision-exp'
}

test('catalog excludes Google AI Studio models', () => {
  assert.equal(
    soumtokCodingModels().some((m) => m.provider === 'google'),
    false,
  )
})

test('Claude Opus 5 omits deprecated temperature param', () => {
  assert.equal(anthropicOmitsSamplingParams('claude-opus-5'), true)
  assert.equal(anthropicOmitsSamplingParams('claude-opus-4-6'), false)
  assert.equal(anthropicOmitsSamplingParams('claude-haiku-4-5-20251001'), false)
})

test('GPT-5.6 Sol omits temperature', () => {
  assert.equal(openaiOmitsTemperature('gpt-5.6-sol'), true)
  assert.equal(openaiOmitsTemperature('gpt-5.5-pro'), false)
  assert.equal(openaiOmitsTemperature('gpt-5.6-sol-medium'), true)
})

test('still images default to Flux 2 Max on Replicate', () => {
  assert.equal(IMAGE_MODEL.provider, 'replicate')
  assert.equal(IMAGE_MODEL.id, 'black-forest-labs/flux-2-max')
  assert.ok(isImageModel('black-forest-labs/flux-2-max'))
  assert.ok(isImageModel('black-forest-labs/flux-2-pro'))
  assert.ok(isImageModel('google/imagen-4-ultra'))
  assert.ok(isImageModel('black-forest-labs/flux-1.1-pro'))
  assert.ok(isImageModel('fal-ai/flux/schnell'))
  assert.equal(isImageModel('gpt-5.6-sol'), false)
})
