#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// Mirror main-process workspace cache writer
const crypto = require('crypto')

function workspaceKey(dir) {
  return crypto.createHash('sha256').update(path.resolve(dir)).digest('hex').slice(0, 20)
}

function workspaceCachePath(home, dir) {
  return path.join(home, 'workspaces', workspaceKey(dir), 'cache.json')
}

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-ws-'))
const project = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-proj-'))
const cacheFile = workspaceCachePath(tmpHome, project)
fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
const threads = [
  {
    id: 't1',
    title: 'Coffee shop',
    items: [{ role: 'user', text: 'make coffee landing page' }],
    modelMessages: [],
  },
]
fs.writeFileSync(
  cacheFile,
  JSON.stringify({
    path: project,
    updatedAt: new Date().toISOString(),
    threads,
    activeThreadId: 't1',
    tabs: [],
  }),
)

const loaded = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
assert.equal(loaded.threads[0].title, 'Coffee shop')
assert.ok(loaded.updatedAt)

fs.rmSync(tmpHome, { recursive: true, force: true })
fs.rmSync(project, { recursive: true, force: true })

console.log('OK agent thread persistence shape')
