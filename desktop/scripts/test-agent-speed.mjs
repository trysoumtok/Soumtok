#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { applyIntelligenceToPrefs, maxToolRoundsForPrefs } = require('../src/shared/agentPrefsRuntime.js')
const { composeTemplateBriefCompact } = require('../../shared/buildTemplateLibrary.cjs')
const { composeScaffoldFastBrief, applyGreenfieldScaffold } = require('../src/main/buildDirector.js')
const { waitForLogGrowth } = require('../src/main/terminalLog.js')

const balanced = applyIntelligenceToPrefs({ intelligence: 'balanced' })
assert.equal(balanced.intelligence, 'balanced')
assert.equal(maxToolRoundsForPrefs('ide', balanced), 18)

const compact = composeTemplateBriefCompact('coffee landing page')
assert.match(compact, /FAST BUILD/)
assert.ok(compact.length < 800, 'compact brief should be short')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-speed-'))
const sc = applyGreenfieldScaffold(tmp, 'make me a coffee landing page')
assert.ok(sc.wrote.includes('src/sections/menu.ts'))
const fast = composeScaffoldFastBrief('coffee shop', tmp, sc.wrote)
assert.match(fast, /SOUMTOK FAST BUILD/)
assert.match(fast, /8000/)
fs.rmSync(tmp, { recursive: true, force: true })

assert.ok(typeof waitForLogGrowth === 'function')

console.log('OK agent speed defaults and fast-path briefs')
