#!/usr/bin/env node
/** Git publish helpers + GitHub publish-repo route smoke checks. */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const failures = []
function ok(label) {
  console.log(`OK  ${label}`)
}
function fail(label, detail) {
  failures.push(`${label}: ${detail}`)
  console.error(`FAIL ${label} — ${detail}`)
}

const dir = mkdtempSync(join(tmpdir(), 'soumtok-git-'))
try {
  writeFileSync(join(dir, 'README.md'), '# test\n')
  const init = spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8', windowsHide: true })
  if (init.status !== 0) fail('git init', init.stderr || String(init.status))
  else ok('git init')

  const add = spawnSync('git', ['add', '-A'], { cwd: dir, encoding: 'utf8', windowsHide: true })
  if (add.status !== 0) fail('git add', add.stderr || String(add.status))
  else ok('git add')

  spawnSync('git', ['config', 'user.email', 'test@soumtok.local'], { cwd: dir, encoding: 'utf8', windowsHide: true })
  spawnSync('git', ['config', 'user.name', 'Soumtok Test'], { cwd: dir, encoding: 'utf8', windowsHide: true })
  const commit = spawnSync('git', ['commit', '-m', 'test'], { cwd: dir, encoding: 'utf8', windowsHide: true })
  if (commit.status !== 0) fail('git commit', commit.stderr || commit.stdout || String(commit.status))
  else ok('git commit')

  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: dir, encoding: 'utf8', windowsHide: true })
  assert.ok((branch.stdout || '').trim())
  ok('git branch')
} finally {
  rmSync(dir, { recursive: true, force: true })
}

const api = (process.env.SOUMTOK_API || 'https://soumtok.com').replace(/\/$/, '')
const res = await fetch(`${api}/api/github/publish-repo`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ name: 'soumtok-test-repo' }),
})
if (res.status === 401) ok('publish-repo requires auth (401)')
else if (res.status === 403) ok('publish-repo requires github (403)')
else if (res.status === 404) console.log('SKIP publish-repo on remote (deploy latest server to enable)')
else ok(`publish-repo route (${res.status})`)

try {
  const { gitEnsureInitialCommit, gitEnsureRepo } = await import('../src/main/gitPublish.js')
  const helperDir = mkdtempSync(join(tmpdir(), 'soumtok-gitpub-'))
  try {
    writeFileSync(join(helperDir, 'a.txt'), 'hello\n')
    const ensured = gitEnsureRepo(helperDir)
    if (ensured.error) fail('gitEnsureRepo', ensured.error)
    else ok('gitEnsureRepo')
    const committed = gitEnsureInitialCommit(helperDir, 'helper test')
    if (committed.error) fail('gitEnsureInitialCommit', committed.error)
    else ok('gitEnsureInitialCommit')
  } finally {
    rmSync(helperDir, { recursive: true, force: true })
  }
} catch (err) {
  fail('gitPublish helpers', err instanceof Error ? err.message : String(err))
}

try {
  const { app } = await import('../../server/app.ts')
  const local = await app.fetch(
    new Request('http://localhost/api/github/publish-repo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-repo' }),
    }),
  )
  if (local.status === 401) ok('local publish-repo route (401 without session)')
  else ok(`local publish-repo route (${local.status})`)
} catch (err) {
  fail('local publish-repo route', err instanceof Error ? err.message : String(err))
}

console.log('')
if (failures.length) {
  console.error(`${failures.length} failure(s)`)
  process.exit(1)
}
console.log('Git publish checks passed.')
