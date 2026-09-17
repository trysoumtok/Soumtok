#!/usr/bin/env node
/** Smoke-test PayPal credentials, mode, and webhook config (no secrets printed). */
import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env') })

const failures = []
const warnings = []

function ok(label) {
  console.log(`OK  ${label}`)
}

function warn(label) {
  warnings.push(label)
  console.log(`WARN ${label}`)
}

function fail(label, detail) {
  failures.push(`${label}: ${detail}`)
  console.error(`FAIL ${label}: ${detail}`)
}

const clientId = process.env.PAYPAL_CLIENT_ID?.trim() || ''
const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim() || ''
const mode = process.env.PAYPAL_MODE?.trim() || 'sandbox'
const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim() || ''
const authUrl = (process.env.BETTER_AUTH_URL || 'http://localhost:5173').replace(/\/$/, '')

console.log('PayPal config smoke test\n')

if (!clientId) fail('PAYPAL_CLIENT_ID', 'missing')
else ok(`PAYPAL_CLIENT_ID set (${clientId.length} chars)`)

if (!clientSecret) fail('PAYPAL_CLIENT_SECRET', 'missing')
else ok(`PAYPAL_CLIENT_SECRET set (${clientSecret.length} chars)`)

if (mode === 'live') ok('PAYPAL_MODE=live (production charges)')
else if (mode === 'sandbox') warn('PAYPAL_MODE=sandbox — use live for real card billing')
else fail('PAYPAL_MODE', `unexpected value "${mode}"`)

if (webhookId) ok(`PAYPAL_WEBHOOK_ID set (${webhookId.length} chars)`)
else warn('PAYPAL_WEBHOOK_ID missing — renewals/cancellations may not sync automatically')

const host =
  mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'

if (clientId && clientSecret) {
  try {
    const res = await fetch(`${host}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.access_token) {
      fail('PayPal OAuth', data.error_description || data.error || `HTTP ${res.status}`)
    } else {
      ok(`PayPal OAuth token (${mode})`)
    }
  } catch (error) {
    fail('PayPal OAuth', error instanceof Error ? error.message : 'network error')
  }
}

try {
  const webhookGet = await fetch(`${authUrl}/api/paypal/webhook`)
  if (webhookGet.ok) {
    const data = await webhookGet.json()
    if (data.endpoint === 'paypal-webhook') ok('GET /api/paypal/webhook reachable')
    else warn('GET /api/paypal/webhook returned unexpected payload')
  } else {
    fail('GET /api/paypal/webhook', `HTTP ${webhookGet.status} — deploy latest server or check routing`)
  }
} catch (error) {
  warn(`Could not reach ${authUrl}/api/paypal/webhook — ${error instanceof Error ? error.message : 'network error'}`)
}

try {
  const res = await fetch(`${authUrl}/api/billing/status`)
  if (!res.ok) {
    warn(`Server billing/status HTTP ${res.status} — start dev server to verify API wiring`)
  } else {
    const data = await res.json()
    if (data.paypal) ok('Server reports PayPal connected')
    else fail('Server PayPal flag', 'paypal=false — check env on running server')
    if (data.webhook) ok('Server sees PAYPAL_WEBHOOK_ID')
    else warn('Server webhook flag false — set PAYPAL_WEBHOOK_ID for auto-renewals')
    console.log(`    mode=${data.mode || '?'} payhero=${data.payhero !== false}`)
  }
} catch {
  warn(`Could not reach ${authUrl}/api/billing/status — run npm run dev to test server wiring`)
}

console.log('')
console.log(`Webhook URL (PayPal Developer): ${authUrl}/api/paypal/webhook`)
console.log('')

if (failures.length) {
  console.error(`${failures.length} failure(s), ${warnings.length} warning(s)`)
  process.exit(1)
}
console.log(`All PayPal checks passed${warnings.length ? ` (${warnings.length} warning(s))` : ''}.`)
