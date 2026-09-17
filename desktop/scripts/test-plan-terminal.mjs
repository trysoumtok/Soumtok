#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const plan = require('../src/main/planDocument.js')
const { getWorkspaceTerminalState } = require('../src/main/terminalState.js')
const { setSoumtokHomeForTests, appendWorkspaceLog } = require('../src/main/terminalLog.js')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-plan-'))
setSoumtokHomeForTests(path.join(tmp, 'home'))

assert.ok(plan.userWantsPlanFirst('let us plan first before building'))
assert.ok(plan.userWantsBuildPlan('BUILD'))
assert.ok(!plan.userWantsPlanFirst('build the app now'))

const doc = plan.writePlanDocument(tmp, {
  goal: 'Coffee site',
  steps: [{ content: 'Scaffold pages' }, { content: 'Add motion' }],
})
assert.ok(fs.existsSync(path.join(tmp, 'PLAN.md')))
assert.match(fs.readFileSync(path.join(tmp, 'PLAN.md'), 'utf8'), /Coffee site/)

appendWorkspaceLog(tmp, 'VITE v6 ready\n  ➜  Local:   http://localhost:5173/\n')
const term = getWorkspaceTerminalState(tmp)
assert.equal(term.devServerUp, true)
assert.ok(term.urls.some((u) => u.includes('5173')))

console.log('OK plan + terminal state')
