import assert from 'node:assert/strict'
import test from 'node:test'
import { parseDnsRow, parseReplyBlocks } from './replyFormat.ts'

test('parseDnsRow reads CNAME and TXT lines', () => {
  const cname = parseDnsRow('CNAME @ xyz.up.railway.app')
  assert.equal(cname?.type, 'CNAME')
  assert.equal(cname?.name, '@')
  assert.equal(cname?.value, 'xyz.up.railway.app')
  const txt = parseDnsRow('- TXT `_railway-verify` `abc-123`')
  assert.equal(txt?.type, 'TXT')
  assert.equal(txt?.name, '_railway-verify')
  assert.equal(txt?.value, 'abc-123')
})

test('markdown DNS tables stay tables', () => {
  const blocks = parseReplyBlocks(`soumtok.com is on Railway. Add these DNS records:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | \`@\` | \`soumtok.up.railway.app\` |
| TXT | \`_railway-verify\` | \`railway-verify=abc\` |

If apex will not take a CNAME, use ALIAS.`)
  const table = blocks.find((item) => item.type === 'table')
  assert.equal(table?.type, 'table')
  if (table?.type === 'table') {
    assert.deepEqual(table.headers.slice(0, 3), ['Type', 'Name', 'Value'])
    assert.equal(table.rows.length, 2)
    assert.equal(table.rows[0]?.[0], 'CNAME')
    assert.match(table.rows[1]?.[1] || '', /_railway-verify/)
  }
  assert.equal(blocks.some((item) => item.type === 'p' && /ALIAS/.test(item.text)), true)
})

test('loose DNS bullets become a Type Name Value table', () => {
  const blocks = parseReplyBlocks(`Add these at your registrar:

- CNAME www soumtok.up.railway.app
- TXT _railway-verify railway-verify=hello`)
  const table = blocks.find((item) => item.type === 'table')
  assert.equal(table?.type, 'table')
  if (table?.type === 'table') {
    assert.equal(table.rows[0]?.[0], 'CNAME')
    assert.equal(table.rows[0]?.[1], 'www')
    assert.equal(table.rows[1]?.[0], 'TXT')
  }
})

test('a calculator description is not a DNS table', () => {
  const blocks = parseReplyBlocks(
    '## What it is\nA warm, dark-on-cream calculator built as plain HTML/CSS/JS — no build step, no dependencies. It is a static app that runs right in the browser.',
  )
  assert.equal(blocks.some((item) => item.type === 'table'), false)
  const prose = blocks.filter((item) => item.type === 'p').map((item) => item.type === 'p' ? item.text : '').join(' ')
  assert.match(prose, /calculator/)
  assert.equal(parseDnsRow('A warm, dark-on-cream calculator built as plain HTML'), null)

  const fake = parseReplyBlocks(`| Type | Name | Value |
| --- | --- | --- |
| A | warm, | dark-on-cream calculator built as plain HTML/CSS/JS |`)
  assert.equal(fake.some((item) => item.type === 'table'), false)
  assert.match(fake.map((item) => (item.type === 'p' ? item.text : '')).join(' '), /calculator/)
})
