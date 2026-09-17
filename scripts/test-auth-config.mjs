#!/usr/bin/env node
/** Smoke-test auth wiring (health, Better Auth routes, DB tables). */
const base = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '')

const failures = []

function ok(label) {
  console.log(`OK  ${label}`)
}

function fail(label, detail) {
  failures.push(`${label}: ${detail}`)
  console.error(`FAIL ${label}: ${detail}`)
}

async function getJson(path) {
  const res = await fetch(`${base}${path}`, { redirect: 'follow' })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* ignore */
  }
  return { res, json, text: text.slice(0, 200) }
}

console.log(`Auth config smoke test → ${base}\n`)

const health = await getJson('/api/health')
if (!health.res.ok || !health.json?.ok) {
  fail('health', health.text || health.res.status)
} else {
  ok('health')
  if (!health.json.database) fail('database', 'not connected')
  else ok('database')
  if (!health.json.google) fail('google oauth', 'not configured')
  else ok('google oauth')
  if (!health.json.github) fail('github oauth', 'not configured')
  else ok('github oauth')
  if (!health.json.mail) fail('mail', 'not configured')
  else ok('mail delivery')
  if (health.json.neonMail) ok('neon mail relay')
  else if (health.json.mail) ok('smtp mail fallback')
}

const session = await getJson('/api/auth/get-session')
if (session.res.status >= 500) fail('get-session', session.text)
else ok('better-auth get-session')

const oauthGoogle = await fetch(`${base}/api/auth/sign-in/social`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ provider: 'google', callbackURL: '/dashboard' }),
  redirect: 'manual',
})
if (oauthGoogle.status >= 500) fail('google social endpoint', String(oauthGoogle.status))
else ok('google social endpoint')

const oauthGithub = await fetch(`${base}/api/auth/sign-in/social`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ provider: 'github', callbackURL: '/dashboard' }),
  redirect: 'manual',
})
const oauthGithubBody = await oauthGithub.json().catch(() => ({}))
if (oauthGithub.status >= 500) fail('github social endpoint', String(oauthGithub.status))
else if (!oauthGithubBody?.url?.includes('github.com/login/oauth/authorize')) {
  fail('github social endpoint', oauthGithubBody?.message || 'missing oauth url')
} else ok('github social endpoint')

const magic = await fetch(`${base}/api/auth/sign-in/magic-link`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'auth-smoke-test@example.com', callbackURL: '/dashboard' }),
})
const magicBody = await magic.text()
if (magic.status >= 500) fail('magic link endpoint', magicBody.slice(0, 120))
else ok('magic link endpoint')

const passkey = await fetch(`${base}/api/auth/passkey/generate-authenticate-options`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({}),
})
if (passkey.status >= 500) fail('passkey endpoint', String(passkey.status))
else ok('passkey endpoint')

console.log('')
if (failures.length) {
  console.error(`${failures.length} failure(s)`)
  process.exit(1)
}
console.log('All auth smoke checks passed.')
