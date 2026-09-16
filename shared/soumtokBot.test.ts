import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AGENT_DRIVER_LABELS,
  botMaxToolRounds,
  parseAgentDriver,
  soumtokBotDesktopExtra,
  soumtokBotStudioContext,
} from './soumtokBot.ts'
import { prepareDesktopAgentTurn } from './desktopAgent.ts'

test('parse agent driver', () => {
  assert.equal(parseAgentDriver('bot'), 'bot')
  assert.equal(parseAgentDriver('ide'), 'ide')
  assert.equal(parseAgentDriver('other'), 'ide')
})

test('bot driver injects automation rules', () => {
  assert.match(soumtokBotStudioContext('bot'), /SOUMTOK BOT/)
  assert.equal(soumtokBotStudioContext('ide'), '')
  assert.match(soumtokBotDesktopExtra('bot'), /Automate their work/)
})

test('bot mode allows more tool rounds', () => {
  assert.equal(botMaxToolRounds('bot', 14), 48)
  assert.equal(botMaxToolRounds('ide', 14), 14)
  assert.equal(botMaxToolRounds('ide', 36), 36)
})

test('desktop turn includes bot rules when driver is bot', () => {
  const turn = prepareDesktopAgentTurn({
    userMessage: 'fix the login form validation',
    workspaceRoot: '/tmp/app',
    mode: 'agent',
    driver: 'bot',
  })
  assert.match(turn.systemPrompt, /SOUMTOK BOT/)
  assert.equal(turn.toolsEnabled, true)
})

test('driver labels are human', () => {
  assert.equal(AGENT_DRIVER_LABELS.ide, 'IDE Agent')
  assert.equal(AGENT_DRIVER_LABELS.bot, 'Soumtok Bot')
})
