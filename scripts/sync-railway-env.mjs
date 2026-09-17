import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const envPath = new URL('../.env', import.meta.url)
const text = readFileSync(envPath, 'utf8')
const vars = {}

for (const line of text.split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i < 1) continue
  const k = t.slice(0, i).trim()
  let v = t.slice(i + 1).trim()
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1)
  }
  vars[k] = v
}

vars.BETTER_AUTH_URL = 'https://soumtok.com'
// Production billing: enforce trial caps and model limits.
vars.SOUMTOK_OPEN_ACCESS = '0'

const skip = new Set([
  'RAILWAY_TOKEN',
  'RAILWAY_API_TOKEN',
  'NODE_ENV',
  'PORT',
])

const needed = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_FROM',
  'NEON_AUTH_BASE_URL',
  'NEON_MAIL_URL',
  'NEON_MAIL_SECRET',
]

const mode = process.argv[1] && process.argv.includes('--set') ? 'set' : process.argv.includes('--set') ? 'set' : 'check'
const action = process.argv.includes('--set') ? 'set' : 'check'

for (const k of needed) {
  const v = vars[k] || ''
  console.log(`${k} present=${Boolean(v)} len=${v.length}`)
}

const entries = Object.entries(vars).filter(([k, v]) => v && !skip.has(k))
console.log(`SETTABLE ${entries.length}`)
if (action !== 'set') {
  for (const [k] of entries) console.log(k)
  process.exit(0)
}

let ok = 0
let failed = []
for (const [k, v] of entries) {
  const result = spawnSync(
    'railway',
    ['variable', 'set', k, '--stdin', '--service', 'soumtok', '--skip-deploys'],
    { input: v, encoding: 'utf8', shell: true },
  )
  if (result.status === 0) {
    ok += 1
    console.log(`SET ${k}`)
  } else {
    failed.push(k)
    const err = (result.stderr || result.stdout || '').split('\n')[0]
    console.log(`FAIL ${k} ${err}`)
  }
}
console.log(`DONE set=${ok} fail=${failed.length}`)
if (failed.length) process.exit(1)
