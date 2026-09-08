import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyLink,
  formatUserCode,
  matchUnconnectedCatalog,
  mintUserCode,
  splitTextWithLinks,
  wantsCatalogConnect,
} from './connectLinks.ts'

test('share and auth links are classified separately', () => {
  assert.equal(classifyLink('https://github.com/login/device').kind, 'auth')
  assert.equal(classifyLink('https://github.com/soumtok/app').kind, 'github')
  assert.equal(classifyLink('https://soumtok.com/s/abc').kind, 'share')
  assert.equal(classifyLink('https://mcp.neon.tech/mcp').kind, 'mcp')
})

test('chat text splits into chips around URLs', () => {
  const parts = splitTextWithLinks('Open https://github.com/login/device then continue.')
  assert.equal(parts[0]?.type, 'text')
  assert.equal(parts[1]?.type, 'link')
  if (parts[1]?.type === 'link') assert.equal(parts[1].link.kind, 'auth')
})

test('format and mint user codes look like GitHub device codes', () => {
  assert.equal(formatUserCode('abcd1234'), 'ABCD-1234')
  const minted = mintUserCode(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]))
  assert.match(minted, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/)
})

test('unconnected catalog matches firebase even without a hosted MCP URL', () => {
  const hits = matchUnconnectedCatalog('connect firebase and neon please', ['github'])
  assert.ok(hits.some((item) => item.id === 'firebase'))
  assert.ok(hits.some((item) => item.id === 'neon'))
  assert.equal(
    hits.some((item) => item.id === 'github'),
    false,
  )
  assert.equal(wantsCatalogConnect('build with firebase'), true)
  assert.equal(wantsCatalogConnect('what is firebase'), false)
})
