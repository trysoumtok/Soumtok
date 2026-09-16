#!/usr/bin/env node
/** Start embedded code-server host and verify HTTP + extension dir (no Electron). */
import { createRequire } from 'node:module'
import fs from 'node:fs'

const require = createRequire(import.meta.url)
const {
  startSoumtokCodeHost,
  stopSoumtokCodeHost,
  platformExtensionWorkspace,
} = require('../src/main/extensionHostRuntime.js')
const { extensionsRoot, listInstalledExtensions } = require('../src/main/extensionsMarket.js')
const { listExtensionActivityContributions } = require('../src/main/extensionActivity.js')

const extDir = extensionsRoot()
console.log('extensionsRoot:', extDir)
const installed = listInstalledExtensions()
console.log('installed:', installed.map((x) => `${x.publisher}.${x.name}@${x.version}`))
const activity = listExtensionActivityContributions(installed)
console.log('activity:', activity.map((a) => ({ id: a.extensionId, openCommand: a.openCommand })))

const ws = platformExtensionWorkspace()
console.log('platform workspace:', ws, 'exists:', fs.existsSync(ws))

const out = await startSoumtokCodeHost({ extensionsDir: extDir, usePlatformWorkspace: true })
if (!out.ok) {
  console.error('start failed:', out.error)
  process.exit(1)
}
console.log('host url:', out.url, 'workspace:', out.workspace)

try {
  const res = await fetch(out.url, { redirect: 'follow' })
  const text = await res.text()
  console.log('HTTP', res.status, 'bytes', text.length, 'has workbench:', /workbench\.html|vscode/i.test(text.slice(0, 8000)))
} catch (err) {
  console.error('fetch failed:', err.message)
  stopSoumtokCodeHost()
  process.exit(1)
}

stopSoumtokCodeHost()
console.log('smoke ok')
