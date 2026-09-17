import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveMcpConnector } from './connectors.ts'

const sample = [
  { id: 'abc-123', name: 'Figma', plugin_id: 'figma', connected: true, tools: [{ name: 'get_file' }] },
  { id: 'def-456', name: 'Notion', plugin_id: 'notion', connected: true },
]

test('resolveMcpConnector matches plugin_id slug', () => {
  const hit = resolveMcpConnector(sample, 'figma')
  assert.equal(hit?.name, 'Figma')
})

test('resolveMcpConnector matches display name case-insensitively', () => {
  const hit = resolveMcpConnector(sample, 'FIGMA')
  assert.equal(hit?.plugin_id, 'figma')
})

test('resolveMcpConnector returns null for unknown server', () => {
  assert.equal(resolveMcpConnector(sample, 'stripe'), null)
})
