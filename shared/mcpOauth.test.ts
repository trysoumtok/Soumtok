import assert from 'node:assert/strict'
import test from 'node:test'
import {
  authorizationServerMetadataUrls,
  discoverMcpOauth,
  parseWwwAuthenticate,
  protectedResourceMetadataUrls,
} from '../server/mcpOauth.ts'
import { CONNECTOR_CATALOG } from './connectors.ts'
import { PLUGIN_CATALOG } from './plugins.ts'

test('WWW-Authenticate resource_metadata is parsed', () => {
  const header =
    'Bearer error="invalid_token", resource_metadata="https://mcp.linear.app/.well-known/oauth-protected-resource"'
  assert.equal(parseWwwAuthenticate(header).resourceMetadata, 'https://mcp.linear.app/.well-known/oauth-protected-resource')
})

test('protected resource metadata includes RFC 9728 path insertion', () => {
  const urls = protectedResourceMetadataUrls(new URL('https://mcp.linear.app/mcp'))
  assert.ok(urls.includes('https://mcp.linear.app/.well-known/oauth-protected-resource/mcp'))
  assert.ok(urls.includes('https://mcp.linear.app/.well-known/oauth-protected-resource'))
})

test('authorization-server metadata covers issuer paths and OIDC', () => {
  const urls = authorizationServerMetadataUrls('https://auth.linear.app/oauth')
  assert.ok(urls.includes('https://auth.linear.app/.well-known/oauth-authorization-server/oauth'))
  assert.ok(urls.includes('https://auth.linear.app/.well-known/openid-configuration'))
})

test('catalog MCP URLs are HTTPS and match plugin entries', () => {
  for (const row of CONNECTOR_CATALOG) {
    assert.match(row.mcpUrl, /^https:\/\//)
    const plugin = PLUGIN_CATALOG.find((item) => item.id === row.pluginId)
    assert.ok(plugin, row.pluginId)
    assert.equal(row.mcpUrl, plugin?.mcps[0]?.url)
  }
})

test('discover returns noAuth when initialize succeeds', async () => {
  const fetchFn = async () =>
    new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18', serverInfo: { name: 'ctx7' } } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  const found = await discoverMcpOauth('https://mcp.context7.com/mcp', fetchFn as typeof fetch)
  assert.equal(found.noAuth, true)
})

test('200 initialize with resource_metadata still yields OAuth action endpoints', async () => {
  const fetchFn = async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/mcp') && !url.includes('well-known')) {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'Context7' } } }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer resource_metadata="https://mcp.context7.com/.well-known/oauth-protected-resource"',
        },
      })
    }
    if (url.includes('oauth-protected-resource')) {
      return new Response(JSON.stringify({ authorization_servers: ['https://clerk.context7.com'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.includes('oauth-authorization-server')) {
      return new Response(
        JSON.stringify({
          authorization_endpoint: 'https://clerk.context7.com/oauth/authorize',
          token_endpoint: 'https://clerk.context7.com/oauth/token',
          registration_endpoint: 'https://clerk.context7.com/oauth/register',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return new Response('', { status: 404 })
  }
  const found = await discoverMcpOauth('https://mcp.context7.com/mcp', fetchFn as typeof fetch)
  assert.equal(found.noAuth, undefined)
  assert.equal(found.authorization_endpoint, 'https://clerk.context7.com/oauth/authorize')
})

test('discover follows resource_metadata then builds action endpoints', async () => {
  const fetchFn = async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/mcp') && !url.includes('well-known')) {
      return new Response('', {
        status: 401,
        headers: {
          'WWW-Authenticate':
            'Bearer resource_metadata="https://mcp.linear.app/.well-known/oauth-protected-resource"',
        },
      })
    }
    if (url.includes('oauth-protected-resource')) {
      return new Response(JSON.stringify({ authorization_servers: ['https://auth.linear.app'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.includes('oauth-authorization-server')) {
      return new Response(
        JSON.stringify({
          authorization_endpoint: 'https://auth.linear.app/authorize',
          token_endpoint: 'https://auth.linear.app/token',
          registration_endpoint: 'https://auth.linear.app/register',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return new Response('', { status: 404 })
  }
  const found = await discoverMcpOauth('https://mcp.linear.app/mcp', fetchFn as typeof fetch)
  assert.equal(found.authorization_endpoint, 'https://auth.linear.app/authorize')
  assert.equal(found.token_endpoint, 'https://auth.linear.app/token')
  assert.equal(found.registration_endpoint, 'https://auth.linear.app/register')
  assert.equal(found.resource, 'https://mcp.linear.app/mcp')
})
