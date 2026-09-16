/**
 * Verifies installs and host profile paths are isolated per signed-in account.
 * Run: node scripts/test-user-scope.mjs
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const require = createRequire(import.meta.url)
const scope = require('../src/main/userScope')
const market = require('../src/main/extensionsMarket')
const runtime = require('../src/main/extensionHostRuntime')

let failures = 0
function check(label, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

const alice = { id: 'user-alice-test', email: 'alice@example.com' }
const bob = { id: 'user-bob-test', email: 'bob@example.com' }

scope.setActiveUser(alice)
const aliceKey = scope.activeUserKey()
const aliceExt = market.extensionsRoot()
const aliceWs = runtime.platformExtensionWorkspace()
const aliceData = path.join(scope.userScopeRoot(), 'code-host', 'user-data')
check('alice key hashed', aliceKey.length === 16 && !aliceKey.includes('@'))
check('alice extensions under users/', aliceExt.includes(path.join('users', aliceKey, 'extensions')))
fs.mkdirSync(aliceExt, { recursive: true })
fs.writeFileSync(path.join(aliceExt, 'marker-alice.txt'), 'alice-only', 'utf8')

scope.setActiveUser(bob)
const bobKey = scope.activeUserKey()
const bobExt = market.extensionsRoot()
check('bob key different', bobKey !== aliceKey)
check('bob extensions under own folder', bobExt.includes(path.join('users', bobKey, 'extensions')))
check('bob cannot see alice marker', !fs.existsSync(path.join(bobExt, 'marker-alice.txt')))
fs.mkdirSync(bobExt, { recursive: true })
fs.writeFileSync(path.join(bobExt, 'marker-bob.txt'), 'bob-only', 'utf8')

scope.setActiveUser(alice)
check('back to alice sees own marker', fs.existsSync(path.join(market.extensionsRoot(), 'marker-alice.txt')))
check('back to alice cannot see bob marker', !fs.existsSync(path.join(market.extensionsRoot(), 'marker-bob.txt')))
check('workspace scoped', runtime.platformExtensionWorkspace().includes(path.join('users', aliceKey)))
check('storage scope is account', market.extensionsStorageInfo().scope === 'account')

// cleanup test markers only
try {
  fs.unlinkSync(path.join(aliceExt, 'marker-alice.txt'))
} catch {
  /* ignore */
}
scope.setActiveUser(bob)
try {
  fs.unlinkSync(path.join(market.extensionsRoot(), 'marker-bob.txt'))
} catch {
  /* ignore */
}
scope.setActiveUser(null)

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
console.log('paths example:', aliceExt)
process.exit(failures ? 1 : 0)
