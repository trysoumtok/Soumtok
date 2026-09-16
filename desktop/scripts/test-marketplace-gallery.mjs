#!/usr/bin/env node
/** VS Code Marketplace + icon URLs (same data source as VS Code Extensions view). */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const vsPath = path.join(__dirname, '../src/main/vscodeGallery.js')
const marketPath = path.join(__dirname, '../src/main/extensionsMarket.js')

const vs = await import(pathToFileURL(vsPath).href)
const market = await import(pathToFileURL(marketPath).href)

console.log('=== VS Code Marketplace (Soumtok Extensions UI) ===\n')

const p1 = await vs.galleryPopular(50, 1)
assert.ok(p1.extensions.length >= 20, `popular page1: ${p1.extensions.length}`)
const ids1 = p1.extensions.map((e) => e.id)
console.log(`Popular page 1: ${p1.extensions.length} (catalog total ~${p1.total || '?'})`)
console.log(
  '  Top 5:',
  p1.extensions.slice(0, 5).map((e) => `${e.displayName} ${formatN(e.downloadCount)}`).join(' | '),
)

assert.ok(
  p1.extensions.some((e) => e.id === 'ms-python.python' && e.downloadCount > 100_000_000),
  'ms-python.python should show VS Marketplace install count (100M+)',
)

for (const ext of p1.extensions.slice(0, 8)) {
  assert.ok(ext.iconUrl?.includes('gallerycdn.vsassets.io'), `VS CDN icon for ${ext.id}`)
  const head = await fetch(ext.iconUrl, { method: 'HEAD', referrerPolicy: 'no-referrer' })
  assert.ok(head.ok, `icon reachable ${ext.id} (${head.status})`)
}
console.log('Icon HEAD: 8/8 OK (gallerycdn.vsassets.io)')

const py = await vs.galleryExtensionById('ms-python.python')
assert.ok(py.downloadCount > 200_000_000, `python installs ~236M, got ${py.downloadCount}`)
assert.ok(py.verified, 'ms-python publisher must be VS Marketplace verified')
console.log(
  `ms-python.python: ${py.downloadCount.toLocaleString()} installs, ★ ${py.averageRating?.toFixed(1)}, verified=${py.verified}`,
)

const gitlens = await vs.galleryExtensionById('eamodio.gitlens')
assert.ok(gitlens.verified, 'eamodio.gitlens publisher verified on VS Marketplace')

const detail = await market.fetchExtensionDetail('ms-python', 'python')
assert.ok(detail.iconUrl?.includes('vsassets.io'), 'detail icon from VS CDN')
assert.ok(detail.readme?.length > 200 || detail.description?.length > 20, 'detail text')
console.log(`Detail: readme ${detail.readme?.length || 0} chars, marketplace ${detail.marketplaceUrl}`)

const claude = await vs.gallerySearch('claude', 20, 1)
assert.ok(claude.total > 100, `claude search total ${claude.total}`)
assert.equal(
  claude.extensions[0]?.id,
  'anthropic.claude-code',
  'claude search should rank Claude Code for VS Code first (relevance sort)',
)
console.log(`Search "claude": ${claude.extensions.length} shown, ~${claude.total} total, top=${claude.extensions[0]?.id}`)

const cline = await vs.gallerySearch('cline', 10, 1)
assert.ok(
  cline.extensions.some((e) => e.id === 'saoudrizwan.claude-dev'),
  'cline search must include official Cline (saoudrizwan.claude-dev)',
)
console.log(`Search "cline": top=${cline.extensions[0]?.id}, total ~${cline.total}`)

console.log('\n=== Result ===')
console.log('Browse/stats/icons: Visual Studio Marketplace (same as VS Code).')
console.log('Install VSIX: Open VSX (compatible packages).\n')

function formatN(n) {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1000) return `${Math.round(v / 1000)}K`
  return String(v)
}
