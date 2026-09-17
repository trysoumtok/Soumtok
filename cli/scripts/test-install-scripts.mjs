#!/usr/bin/env node
/** Smoke-test install script files exist and Windows shim logic. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
let failed = 0
const ok = (m) => console.log('OK ', m)
const fail = (m, d) => {
  console.error('FAIL', m, d || '')
  failed++
}

for (const rel of [
  'public/install/cli.ps1',
  'public/install/cli.sh',
  'public/install/cli-macos.sh',
  'public/install/cli-linux.sh',
  'scripts/install-cli.ps1',
  'scripts/install-cli.sh',
  'scripts/install-cli-macos.sh',
  'scripts/install-cli-linux.sh',
  'cli/bin/soumtok.mjs',
]) {
  if (!fs.existsSync(path.join(root, rel))) fail('missing', rel)
  else ok(rel)
}

const ps1 = fs.readFileSync(path.join(root, 'scripts/install-cli.ps1'), 'utf8')
if (ps1.includes('@"')) fail('install-cli.ps1', 'here-string can break on Windows')
else ok('install-cli.ps1 syntax')

if (process.platform === 'win32') {
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `$env:SOUMTOK_CLI_ROOT='${root.replace(/'/g, "''")}'; & '${path.join(root, 'scripts/install-cli.ps1').replace(/'/g, "''")}'`],
    { encoding: 'utf8', timeout: 30000 },
  )
  if (r.status !== 0) fail('windows install', r.stderr || r.stdout)
  else ok('windows install script runs')
  const shim = path.join(process.env.USERPROFILE || '', '.local/bin/soumtok.cmd')
  if (!fs.existsSync(shim)) fail('shim missing', shim)
  else {
    const v = spawnSync('cmd.exe', ['/c', shim, 'version'], { encoding: 'utf8', timeout: 15000 })
    const out = `${v.stdout || ''}${v.stderr || ''}`
    if (v.status !== 0 || !/Soumtok CLI/.test(out)) fail('shim version', out || `exit ${v.status}`)
    else ok('soumtok.cmd responds')
  }
}

process.exit(failed ? 1 : 0)
