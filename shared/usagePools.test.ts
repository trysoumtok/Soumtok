import assert from 'node:assert/strict'

import { test } from 'node:test'

import {

  checkPoolAccess,

  isEverydayModel,

  modelUsagePool,

  overageChargeUsd,

  poolBudgetUsd,

  planAllowsPremiumModels,

  modelsForPlan,

  sumPoolUsageUsd,

} from './usagePools.ts'



test('modelsForPlan hides premium on Start', () => {
  const catalog = [
    { id: 'deepseek-v4-flash' },
    { id: 'claude-opus-5' },
    { id: 'gpt-4.1-mini' },
  ]
  const start = modelsForPlan(catalog, 'start')
  assert.equal(start.length, 2)
  assert.ok(start.every((item) => isEverydayModel(item.id)))
  const pro = modelsForPlan(catalog, 'pro')
  assert.equal(pro.length, 3)
})

test('only three everyday models', () => {

  assert.equal(isEverydayModel('deepseek-v4-flash'), true)

  assert.equal(isEverydayModel('deepseek-v4-pro'), true)

  assert.equal(isEverydayModel('gpt-4.1-mini'), true)

  assert.equal(isEverydayModel('soumtok-agent'), false)

  assert.equal(modelUsagePool('claude-opus-5'), 'premium')

})



test('pro has dual pools with safety margin', () => {

  assert.equal(poolBudgetUsd('pro', 'cheap'), 8)

  assert.equal(poolBudgetUsd('pro', 'premium'), 8)

  assert.equal(planAllowsPremiumModels('pro'), true)

  assert.equal(planAllowsPremiumModels('start'), false)

  assert.equal(poolBudgetUsd('start', 'cheap'), 4)

})



test('unpaid plan blocks platform usage', () => {

  const blocked = checkPoolAccess({

    planId: 'hobby',

    modelId: 'deepseek-v4-flash',

    usedCheapUsd: 0,

    usedPremiumUsd: 0,

  })

  assert.equal(blocked.ok, false)

  if (!blocked.ok) assert.match(blocked.error, /Start \(\$5/)

})



test('start blocks additional models', () => {

  const blocked = checkPoolAccess({

    planId: 'start',

    modelId: 'claude-opus-5',

    usedCheapUsd: 0,

    usedPremiumUsd: 0,

  })

  assert.equal(blocked.ok, false)

  if (!blocked.ok) assert.match(blocked.error, /Additional/i)

})



test('everyday pool exhaustion blocks further everyday turns', () => {

  const blocked = checkPoolAccess({

    planId: 'start',

    modelId: 'deepseek-v4-flash',

    usedCheapUsd: poolBudgetUsd('start', 'cheap'),

    usedPremiumUsd: 0,

    estTurnUsd: 0.01,

  })

  assert.equal(blocked.ok, false)

})



test('overage markup is always above vendor', () => {

  assert.equal(overageChargeUsd(1), 1.25)

})



test('sumPoolUsageUsd splits by model tier', () => {

  const totals = sumPoolUsageUsd([

    { model: 'deepseek-v4-flash', prompt_tokens: 1000, completion_tokens: 500, billed_to: 'platform' },

    { model: 'claude-opus-5', prompt_tokens: 1000, completion_tokens: 500, billed_to: 'platform' },

    { model: 'deepseek-v4-flash', prompt_tokens: 500, completion_tokens: 200, billed_to: 'user' },

  ])

  assert.ok(totals.cheap > 0)

  assert.ok(totals.premium > totals.cheap)

})

