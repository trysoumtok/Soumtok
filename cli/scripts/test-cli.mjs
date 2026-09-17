#!/usr/bin/env node
/** Soumtok CLI smoke + harness parity tests (no live API required for core checks). */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.chdir(root)

const failures = []
function ok(label) {
  console.log(`OK  ${label}`)
}
function fail(label, detail) {
  failures.push(`${label}: ${detail}`)
  console.error(`FAIL ${label}: ${detail}`)
}

// 1) Module graph loads
try {
  await import('../lib/desktop-parity.mjs')
  await import('../lib/events.mjs')
  await import('../lib/harness.mjs')
  await import('../lib/api.mjs')
  await import('../lib/config.mjs')
  ok('cli modules import')
} catch (err) {
  fail('cli modules import', err.message)
}

// 2) Desktop parity prefs match harness expectations
try {
  const { effectiveAgentPrefs, DEFAULT_AGENT_PREFS, expandAtFiles } = await import('../lib/desktop-parity.mjs')
  const prefs = effectiveAgentPrefs({ intelligence: 'max' })
  if (prefs.runMode !== 'run-everything') fail('prefs runMode', prefs.runMode)
  else ok('prefs runMode run-everything')
  if (!prefs.localToolsEnabled) fail('prefs localToolsEnabled', 'false')
  else ok('prefs localToolsEnabled')
  if (prefs.intelligence !== 'max') fail('prefs intelligence', prefs.intelligence)
  else ok('prefs intelligence max')
  if (!DEFAULT_AGENT_PREFS.mcpConnectors) fail('default mcpConnectors', 'missing')
  else ok('default agent prefs schema')

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-cli-'))
  const f = path.join(tmpDir, 'hello.txt')
  fs.writeFileSync(f, 'hi')
  const ex = expandAtFiles(`read @hello.txt please`, tmpDir)
  if (!ex.openFiles.includes(f)) fail('@file expansion', JSON.stringify(ex.openFiles))
  else ok('@file expansion')
} catch (err) {
  fail('desktop parity', err.message)
}

// 3) Event printer handles desktop event types
try {
  const { createEventPrinter } = await import('../lib/events.mjs')
  const logs = []
  const orig = console.log
  console.log = (...a) => logs.push(a.join(' '))
  const p = createEventPrinter({ onAsk: () => {} })
  p.handle({ type: 'status', text: 'Thinking…' })
  p.handle({ type: 'tool', name: 'read', args: { path: 'src/a.ts' } })
  p.handle({ type: 'result', name: 'read', ok: true, text: 'file contents' })
  p.handle({ type: 'plan_file', path: 'PLAN.md' })
  p.handle({ type: 'mode_switch', target: 'plan', explanation: 'Planning first' })
  p.handle({ type: 'workspace_refresh' })
  p.footer({ model: 'deepseek-v4-flash', toolRound: 1 })
  console.log = orig
  const joined = logs.join('\n')
  if (!/PLAN\.md/.test(joined)) fail('event printer plan_file', 'missing')
  else ok('event printer plan_file')
  if (!/read src/.test(joined)) fail('event printer tool', 'missing')
  else ok('event printer tool/result')
} catch (err) {
  fail('event printer', err.message)
}

// 4) Harness mock run (same test as desktop/scripts/test-agent-harness.mjs)
try {
  const { runAgentHarness } = require('../../desktop/src/main/agentHarness.js')
  const events = []
  const mockApi = async (method, p, body) => {
    if (method === 'POST' && p.includes('agent/round')) {
      return { status: 404, data: { error: 'Not Found' } }
    }
    if (method === 'POST' && p === '/api/studio/complete') {
      const lastUser = [...(body?.messages || [])].reverse().find((m) => m.role === 'user')
      const text = typeof lastUser?.content === 'string' ? lastUser.content : ''
      return {
        status: 200,
        data: { text: 'CLI harness OK', model: 'deepseek-chat', promptTokens: 1, completionTokens: 2 },
      }
    }
    return { status: 500, data: { error: 'unexpected ' + p } }
  }
  const { effectiveAgentPrefs } = await import('../lib/desktop-parity.mjs')
  const result = await runAgentHarness({
    api: mockApi,
    folder: process.cwd(),
    model: 'deepseek-v4-flash',
    mode: 'agent',
    driver: 'ide',
    messages: [],
    userMessage: 'ping',
    openFiles: [],
    branch: 'main',
    files: [],
    agentPrefs: effectiveAgentPrefs(),
    signal: null,
    onEvent: (ev) => events.push(ev),
    onIntegratedTerminalRun: () => {},
    onTerminalMirror: () => {},
  })
  if (result.error) fail('harness mock', result.error)
  else if (!/CLI harness OK/.test(result.text || '')) fail('harness mock text', result.text)
  else ok('harness mock round + fallback complete')
  if (!events.some((e) => e.type === 'assistant' || e.type === 'status')) {
    fail('harness events', events.map((e) => e.type).join(','))
  } else ok('harness streams status/assistant events')
} catch (err) {
  fail('harness mock', err.message)
}

// 5) Attachments
try {
  const { resolveAttachments } = await import('../lib/attachments.mjs')
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-cli-a-'))
  fs.writeFileSync(path.join(dir, 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  const sub = path.join(dir, 'sub')
  fs.mkdirSync(sub)
  fs.writeFileSync(path.join(sub, 'a.txt'), 'hi')
  const att = resolveAttachments('check @pic.png and @sub/', dir)
  if (att.files.length !== 1) fail('image attach', String(att.files.length))
  else ok('image attachment')
  if (!att.openFiles.some((f) => f.endsWith('a.txt'))) fail('folder attach', 'missing')
  else ok('@folder attachment')
} catch (err) {
  fail('attachments', err.message)
}

// 6) Usage formatting
try {
  const { formatTurnUsage, formatTokens } = await import('../lib/usage.mjs')
  const line = formatTurnUsage({
    model: 'deepseek-v4-flash',
    promptTokens: 1200,
    completionTokens: 340,
    billedTo: 'platform',
  })
  if (!line || !/1\.2k|1200/.test(line) || !/deepseek/.test(line)) fail('formatTurnUsage', line)
  else ok('formatTurnUsage')
  if (formatTokens(1500) !== '1.5k') fail('formatTokens', formatTokens(1500))
  else ok('formatTokens')
} catch (err) {
  fail('usage format', err.message)
}

// 7) CLI --help exits 0
try {
  const { spawnSync } = await import('node:child_process')
  const bin = path.join(root, 'cli/bin/soumtok.mjs')
  const run = spawnSync(process.execPath, [bin, '--help'], { encoding: 'utf8' })
  if (run.status !== 0) fail('cli --help', run.stderr || String(run.status))
  else if (!/Soumtok[\s\S]*Agent/.test(run.stdout)) fail('cli --help output', 'missing banner')
  else ok('cli --help')
} catch (err) {
  fail('cli --help', err.message)
}

// 8) Optional live API
const liveKey = process.env.SOUMTOK_API_KEY?.trim()
const liveApi = (process.env.SOUMTOK_API || 'https://soumtok.com').replace(/\/$/, '')
if (liveKey) {
  try {
    const res = await fetch(`${liveApi}/api/auth/get-session`, {
      headers: { Authorization: `Bearer ${liveKey}`, Accept: 'application/json' },
    })
    const data = await res.json().catch(() => ({}))
    if (!data?.user) fail('live session', 'no user')
    else ok(`live session (${data.user.email || data.user.name})`)

    const models = await fetch(`${liveApi}/api/desktop/models`, {
      headers: { Authorization: `Bearer ${liveKey}`, Accept: 'application/json' },
    })
    const md = await models.json().catch(() => ({}))
    if (!Array.isArray(md.models) || !md.models.length) fail('live models', 'empty')
    else ok(`live models (${md.models.length})`)
  } catch (err) {
    fail('live api', err.message)
  }
} else {
  console.log('SKIP live API (set SOUMTOK_API_KEY to test sign-in + models)')
}

console.log('')
if (failures.length) {
  console.error(`${failures.length} failure(s)`)
  process.exit(1)
}
console.log('All Soumtok CLI tests passed.')
