/**
 * Exercises the real marketplace paths: browse, source resolution per platform, install, and the
 * post-install validation. Hits the network on purpose — a mocked run proves nothing here.
 *
 * Run: node scripts/test-marketplace-install.mjs
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const market = require('../src/main/extensionsMarket')
const { hostVsCodeVersion } = require('../src/main/extensionHostRuntime')

const CASES = [
  // Platform-specific native binaries, published to both galleries.
  { publisher: 'Anthropic', name: 'claude-code', install: true },
  // Plain JS extension on both galleries.
  { publisher: 'esbenp', name: 'prettier-vscode', install: true },
  // Popular extension whose Open VSX presence is unreliable.
  { publisher: 'ms-python', name: 'python', install: false },
  // VS Marketplace only.
  { publisher: 'GitHub', name: 'copilot', install: false },
  { publisher: 'nonexistent-publisher-xyz', name: 'nope', install: false, expectMissing: true },
]

let failures = 0

function check(label, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

console.log('host VS Code version:', hostVsCodeVersion() || '(host not installed)')
console.log('extensions root:', market.extensionsRoot())

for (const c of CASES) {
  const id = `${c.publisher}.${c.name}`
  let source = null
  try {
    source = await market.resolveVsixSource(c.publisher, c.name, { fresh: true })
  } catch (err) {
    check(`resolve ${id}`, false, err.message)
    continue
  }
  if (c.expectMissing) {
    check(`resolve ${id} reports missing`, source === null)
    continue
  }
  check(`resolve ${id}`, Boolean(source?.download && source.version), source ? `${source.version} via ${source.source}` : 'no source')
  if (source && process.platform === 'win32' && /claude-code/i.test(c.name)) {
    check(`${id} is a win32 build`, /win32/i.test(source.download), source.download.slice(-40))
  }
}

for (const c of CASES.filter((x) => x.install)) {
  const id = `${c.publisher}.${c.name}`
  try {
    const out = await market.installFromOpenVsx(c.publisher, c.name)
    const dir = out.extension?.path || ''
    const manifestAtRoot = dir ? fs.existsSync(path.join(dir, 'package.json')) : false
    check(`install ${id}`, Boolean(out.ok && manifestAtRoot), `${out.version} via ${out.source}`)
    check(`${id} manifest readable by VS Code`, manifestAtRoot, dir)
    const latest = await market.latestInstallableVersion(c.publisher, c.name)
    check(`${id} reports no phantom update`, latest === out.version, `installed ${out.version}, latest ${latest}`)
  } catch (err) {
    check(`install ${id}`, false, err.message)
  }
}

const installed = market.listInstalledExtensions()
console.log('\ninstalled:', installed.map((e) => `${e.id}@${e.version}`).join(', ') || '(none)')
const stray = installed.filter((e) => !fs.existsSync(path.join(e.path, 'package.json')))
check('every install has a root manifest', stray.length === 0, stray.map((e) => e.id).join(', '))
const registry = path.join(market.extensionsRoot(), 'extensions.json')
check('VS Code extensions.json not shadowed by Soumtok', !fs.existsSync(registry) || !String(fs.readFileSync(registry, 'utf8')).includes('"scope": "device"'))

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
