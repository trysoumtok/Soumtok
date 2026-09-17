import { spawn } from 'node:child_process'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { createApiClient } from './api.mjs'
import { brand, c } from './ansi.mjs'
import { resolveApiBase, saveConfig, saveCredentials } from './config.mjs'

function openBrowser(url) {
  const platform = process.platform
  if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
    return
  }
  if (platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
    return
  }
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
}

async function pollLogin(base, id, maxMs = 900_000) {
  const started = Date.now()
  while (Date.now() - started < maxMs) {
    const res = await fetch(`${base}/api/desktop/poll/${id}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'SoumtokCLI/0.1' },
    })
    const data = await res.json().catch(() => ({}))
    if (data.status === 'ready' && data.token) return data.token
    if (data.status === 'expired') throw new Error('Sign-in expired. Run soumtok login again.')
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error('Timed out waiting for sign-in. Finish in the browser, then run soumtok login again.')
}

export async function loginCommand({ api: apiOverride, signup = false } = {}) {
  const base = resolveApiBase(apiOverride)
  saveConfig({ api: base })
  const client = createApiClient(base)
  const start = await client.api('POST', '/api/desktop/start', signup ? { mode: 'up' } : {})
  if (start.status !== 200 || !start.data?.id || !start.data?.url) {
    throw new Error(start.data?.error || 'Could not start sign-in')
  }
  console.log('')
  console.log(brand('Soumtok') + c.dim(' · sign in'))
  console.log(c.dim('Opening your browser… finish sign-in there, then return here.'))
  console.log('')
  console.log(c.cyan(start.data.url))
  console.log('')
  openBrowser(start.data.url)
  const token = await pollLogin(base, start.data.id)
  saveCredentials({ token, api: base })
  let user = null
  for (let attempt = 0; attempt < 5; attempt++) {
    user = await createApiClient(base).session()
    if (user) break
    await new Promise((r) => setTimeout(r, 400))
  }
  if (!user) {
    throw new Error(
      'Browser sign-in finished but the CLI session did not stick. Try: soumtok login --api-key <key from Dashboard → Keys>',
    )
  }
  const label = user.name || user.email || 'Signed in'
  console.log(c.green(`✓ ${label}`))
  console.log(c.dim(`Session saved to ~/.soumtok/credentials.json`))
  return { token, user }
}

export async function loginWithApiKeyCommand(key) {
  const trimmed = String(key || '').trim()
  if (!trimmed.startsWith('sk-soumtok-')) {
    throw new Error('API key must start with sk-soumtok- (create one in Dashboard → Keys)')
  }
  saveCredentials({ apiKey: trimmed })
  process.env.SOUMTOK_API_KEY = trimmed
  const user = await createApiClient().session()
  if (!user) throw new Error('Invalid API key or account not ready')
  console.log(c.green(`✓ ${user.name || user.email}`))
  console.log(c.dim('API key saved to ~/.soumtok/credentials.json'))
  return user
}

export async function ensureAuth({ apiKeyFlag } = {}) {
  if (apiKeyFlag) return loginWithApiKeyCommand(apiKeyFlag)
  const client = createApiClient()
  const user = await client.session()
  if (user) return user
  const rl = readline.createInterface({ input, output })
  console.log('')
  console.log(c.yellow('Not signed in.'))
  const pick = await rl.question('Sign in now? [Y/n] ')
  rl.close()
  if (pick.trim().toLowerCase() === 'n') {
    throw new Error('Run soumtok login or set SOUMTOK_API_KEY')
  }
  await loginCommand()
  return createApiClient().session()
}
