#!/usr/bin/env node
/** Live Open VSX + local extensions dir smoke test */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const marketPath = path.join(__dirname, '../src/main/extensionsMarket.js')

const mod = await import(pathToFileURL(marketPath).href)

const popular = await mod.popularOpenVsx(12)
assert.ok(Array.isArray(popular), 'popular returns array')
assert.ok(popular.length >= 3, `expected popular extensions, got ${popular.length}`)
assert.ok(popular[0].publisher && popular[0].name, 'popular row shape')
assert.ok(
  popular[0].iconUrl?.includes('vsassets.io') || popular[0].iconUrl?.includes('open-vsx.org'),
  'marketplace icon URL',
)
assert.ok(
  popular.some((e) => e.downloadCount > 10_000_000),
  'popular sorted by real VS Marketplace install counts',
)

const search = await mod.searchOpenVsx('eslint', 5)
assert.ok(search.length >= 1, 'eslint search')
assert.ok(search[0].iconUrl, 'search row includes icon')

const installed = mod.listInstalledExtensions()
assert.ok(Array.isArray(installed), 'installed list')

console.log(`OK extensions market: popular=${popular.length} search=${search.length} installed=${installed.length}`)
