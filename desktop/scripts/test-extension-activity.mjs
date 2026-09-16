#!/usr/bin/env node
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mod = await import(pathToFileURL(path.join(__dirname, '../src/main/extensionActivity.js')).href)
const { listExtensionActivityContributions } = mod

const claudeDir = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.soumtok',
  'ide',
  'extensions',
)
const fs = await import('node:fs')
let sample = null
try {
  const dirs = fs.readdirSync(claudeDir).filter((d) => d.toLowerCase().includes('claude-code'))
  if (dirs[0]) {
    sample = {
      id: 'Anthropic.claude-code',
      publisher: 'Anthropic',
      name: 'claude-code',
      path: path.join(claudeDir, dirs[0]),
    }
  }
} catch {
  /* no local install */
}

if (sample) {
  const items = listExtensionActivityContributions([sample])
  assert.ok(items.length >= 1, 'Claude Code should contribute an activity bar entry')
  assert.ok(items[0].iconPath, 'icon path should resolve')
  assert.ok(items[0].openCommand, 'open command should be detected')
  console.log('Claude activity:', items[0].title, items[0].openCommand)
} else {
  console.log('Skip Claude install check (no local VSIX folder)')
}

console.log('extensionActivity OK')
