#!/usr/bin/env node
/** One-time download of the Soumtok Code embedded extension host (~100MB). */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { ensureSoumtokCodeInstalled, soumtokCodeStatus } = require('../src/main/extensionHostRuntime.js')

console.log('Installing Soumtok Code extension host…')
const out = await ensureSoumtokCodeInstalled((msg) => console.log(msg))
if (!out.ok) {
  console.error(out.error || 'Install failed')
  process.exit(1)
}
console.log('Soumtok Code ready:', soumtokCodeStatus())
