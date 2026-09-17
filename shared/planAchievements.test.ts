import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  PLAN_CAPACITIES,
  SOUMTOK_AGENT,
  everydayModelCapacities,
  formatCount,
  imageModelCapacities,
  imagesInPool,
  turnsInPool,
} from './planAchievements.ts'

test('start plan estimates thousands of flash agent turns on $5', () => {
  const start = PLAN_CAPACITIES.find((p) => p.planId === 'start')!
  assert.equal(start.everyday.poolUsd, 5)
  assert.ok(start.everyday.flashAgentTurns >= 3000)
  assert.ok(start.everyday.flashBuildPages >= 50)
})

test('pro doubles everyday pool vs start', () => {
  const start = PLAN_CAPACITIES.find((p) => p.planId === 'start')!
  const pro = PLAN_CAPACITIES.find((p) => p.planId === 'pro')!
  assert.equal(pro.everyday.flashAgentTurns, start.everyday.flashAgentTurns * 2)
  assert.ok(pro.additional)
  assert.equal(pro.additional!.poolUsd, 10)
})

test('everyday models include three catalog rows', () => {
  assert.equal(everydayModelCapacities().length, 3)
})

test('formatCount rounds large numbers', () => {
  assert.match(formatCount(4464), /~4/)
})

test('turnsInPool respects model cost', () => {
  const flash = everydayModelCapacities()[0]
  const turns = turnsInPool(5, flash.agentTurnUsd)
  assert.ok(turns >= 3000)
})

test('soumtok agent documents token savings range', () => {
  assert.ok(SOUMTOK_AGENT.shortSessionTokenSavePct >= 20)
  assert.ok(SOUMTOK_AGENT.longSessionTokenSavePct >= 50)
})

test('start pool fits dozens of flux max images', () => {
  const start = PLAN_CAPACITIES.find((p) => p.planId === 'start')!
  assert.ok(start.everyday.fluxMaxImages >= 60)
  assert.ok(imagesInPool(5, 'black-forest-labs/flux-2-max') >= 60)
})

test('image catalog lists flux and imagen', () => {
  const ids = imageModelCapacities().map((m) => m.id)
  assert.ok(ids.includes('black-forest-labs/flux-2-max'))
  assert.ok(ids.includes('google/imagen-4-ultra'))
})
