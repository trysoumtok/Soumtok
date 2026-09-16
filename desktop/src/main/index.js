const { app, BrowserWindow, ipcMain, dialog, session, shell, Menu, net, clipboard, nativeImage } = require('electron')
const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const https = require('https')
const os = require('os')
const path = require('path')
const zlib = require('zlib')
const { pathToFileURL, URL } = require('url')
const { spawn, spawnSync } = require('child_process')
const { runAgentHarness, pushAgentSteer, resolveAskReply } = require('./agentHarness')
const { restoreCheckpoint } = require('./checkpoints')
const { runEditorAiAssist } = require('./inlineEditorAi')
const { watchIndex, unwatchIndex, getIndex } = require('./semanticIndex')
const { detectInstallations, launchExternalCode, forkBuildHint } = require('./codeBridge')
const { registerExtensionsIpc } = require('./extensionsIpc')
const { registerSetupIpc } = require('./setupIpc')
const { stopSoumtokCodeHost, isSoumtokCodeInstalled } = require('./extensionHostRuntime')
const { destroyExtensionHostView } = require('./extensionHostView')
const { registerSpeechTranscribe } = require('./speechPlugin')
const { readOpenAiKeyFromEnvFile, transcribeWithOpenAiDirect } = require('./speechTranscribeCore')
const { createTerminalSession, hasPty } = require('./terminalHost')
const { bindShellSessions, appendSessionLog } = require('./terminalLog')
const { loadMcpMarketplace } = require('./mcpMarketplace')
const { workspaceGrep, workspaceReplaceAll } = require('./desktopTools')
const { startCrashReporter, registerCrashIpc, bindProcessHandlers } = require('./crashReporter')
const { initAutoUpdater } = require('./autoUpdater')
startCrashReporter()
bindProcessHandlers()
registerCrashIpc()

const INLINE_DESKTOP_MODELS = [
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4.1 Flash', provider: 'deepseek', strength: 'Everyday coding', cost: 'Cheapest', tags: ['New'] },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4.1 Pro', provider: 'deepseek', strength: 'Harder refactors', cost: 'Low', tags: ['New'] },
  { id: 'deepseek-chat', name: 'DeepSeek V4 Chat', provider: 'deepseek', strength: 'General coding (V4)', cost: 'Cheapest' },
  { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', provider: 'deepseek', strength: 'Long thinking', cost: 'Low' },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', provider: 'openai', strength: 'Cheap everyday coding', cost: 'Cheap' },
  { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai', strength: 'Reliable general coding', cost: 'Mid' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic', strength: 'Fast reviews', cost: 'Low' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic', strength: 'Day-to-day coding', cost: 'Mid' },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic', strength: 'Hard bugs', cost: 'High' },
  { id: 'grok-4.6', name: 'Grok 4.6', provider: 'xai', strength: 'Latest Grok coding', cost: 'Higher', tags: ['New'] },
  { id: 'grok-4.20-0309-non-reasoning', name: 'Grok 4.20 Fast', provider: 'xai', strength: 'Fast Grok', cost: 'Mid' },
]

function staticDesktopModels(ready = false) {
  try {
    const mod = require('./desktopModelsCatalog')
    if (typeof mod.staticDesktopModels === 'function') return mod.staticDesktopModels(ready)
  } catch {
    /* use inline catalog */
  }
  return INLINE_DESKTOP_MODELS.map((m) => ({ ...m, ready }))
}

/** Local-only data (Cursor-style): ~/.soumtok/ide = app state, ~/.soumtok/workspaces = per-project cache */
const SOUMTOK_HOME = path.join(os.homedir(), '.soumtok')
try {
  fs.mkdirSync(path.join(SOUMTOK_HOME, 'ide'), { recursive: true })
  fs.mkdirSync(path.join(SOUMTOK_HOME, 'workspaces'), { recursive: true })
} catch {
  /* ignore */
}
app.setPath('userData', path.join(SOUMTOK_HOME, 'ide'))

const ENV_FILE_CANDIDATES = [
  path.resolve(__dirname, '../../../.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
]

function readEnvVarFromFiles(name) {
  const re = new RegExp(`^${name}=(.*)$`)
  for (const file of ENV_FILE_CANDIDATES) {
    try {
      if (!fs.existsSync(file)) continue
      const raw = fs.readFileSync(file, 'utf8')
      for (const line of raw.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const m = trimmed.match(re)
        if (m) {
          const val = m[1].trim().replace(/^["']|["']$/g, '')
          if (val) return val
        }
      }
    } catch {
      /* ignore */
    }
  }
  return null
}

function readSoumtokApiFromEnvFile() {
  const val = readEnvVarFromFiles('SOUMTOK_API')
  return val ? val.replace(/\/$/, '') : null
}

const PRODUCTION_API = 'https://soumtok.com'
let API = (process.env.SOUMTOK_API || readSoumtokApiFromEnvFile() || PRODUCTION_API).replace(/\/$/, '')
let appVersion = '0.1.0'
let appProductName = 'Soumtok'
try {
  const pkg = require('../../package.json')
  appVersion = pkg.version || appVersion
  appProductName = pkg.productName || pkg.name || appProductName
} catch {
  /* ignore */
}
const AUTH_PARTITION = 'persist:soumtok-auth'
const SKIP = new Set([
  'node_modules',
  'dist',
  'release',
  'out',
  'deploy-history',
  'project-settings',
  'releases',
  '.turbo',
  '.cache',
  '.vercel',
])
/** Hidden dot-folders (match Cursor defaults: still show .netlify / .next at repo root) */
const SKIP_DOT_DIRS = new Set(['.git', '.husky', '.cursor', '.soumtok'])
const UUID_DIR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isDev = !app.isPackaged
let devPrimary = true

if (isDev) {
  devPrimary = app.requestSingleInstanceLock()
  if (!devPrimary) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        reloadWindow(win)
      } else {
        createWindow()
      }
    })
  }
}

let mainWindow = null
/** @type {Map<string, import('child_process').ChildProcess>} */
const shellSessions = new Map()
bindShellSessions(shellSessions)
const folders = new Map()

function iconPath() {
  return path.join(__dirname, '../../resources/icon.png')
}

function statePath() {
  return path.join(app.getPath('userData'), 'state.json')
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'))
  } catch {
    return {}
  }
}

function saveState(next) {
  const current = { ...loadState(), ...next }
  fs.mkdirSync(path.dirname(statePath()), { recursive: true })
  fs.writeFileSync(statePath(), JSON.stringify(current))
}

function authSession() {
  return session.fromPartition(AUTH_PARTITION)
}

function createWindow() {
  const saved = loadState().bounds || {}
  const win = new BrowserWindow({
    width: saved.width || 1440,
    height: saved.height || 900,
    x: Number.isFinite(saved.x) ? saved.x : undefined,
    y: Number.isFinite(saved.y) ? saved.y : undefined,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? { color: '#181818', symbolColor: '#cccccc', height: 36 } : undefined,
    frame: process.platform === 'darwin',
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  win.loadFile(path.join(__dirname, '../renderer/index.html'))
  const persistBounds = () => {
    if (!win.isDestroyed()) saveState({ bounds: win.getBounds() })
  }
  win.on('moved', persistBounds)
  win.on('resized', persistBounds)
  const webContentsId = win.webContents.id
  win.on('close', () => {
    persistBounds()
    destroyExtensionHostView(win)
  })
  win.on('closed', () => {
    folders.delete(webContentsId)
    if (mainWindow === win) {
      mainWindow = null
      killAllShellSessions()
    }
  })
  if (!mainWindow) mainWindow = win
  return win
}

function reloadWindow(win) {
  if (!win || win.isDestroyed()) return
  win.webContents.send('dev:reload')
  setTimeout(() => {
    if (!win.isDestroyed()) win.webContents.reloadIgnoringCache()
  }, 40)
}

function reloadWindows() {
  const wins = BrowserWindow.getAllWindows()
  if (!wins.length) {
    createWindow()
    return
  }
  for (const win of wins) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    reloadWindow(win)
  }
}

function watchRenderer() {
  if (!isDev) return
  let timer = null
  const kick = () => {
    clearTimeout(timer)
    timer = setTimeout(() => reloadWindows(), 350)
  }
  for (const dir of [path.join(__dirname, '../renderer'), path.join(__dirname, '../preload')]) {
    try {
      fs.watch(dir, { recursive: true }, kick)
    } catch {
      /* ignore */
    }
  }
}

function watchMainProcess() {
  if (!isDev) return
  let restartTimer = null
  const scheduleRestart = () => {
    clearTimeout(restartTimer)
    restartTimer = setTimeout(() => {
      app.relaunch()
      app.exit(0)
    }, 400)
  }
  try {
    fs.watch(path.join(__dirname), { recursive: false }, (_event, name) => {
      if (!name || !/\.js$/i.test(String(name))) return
      if (/extensions(Ipc|Market)?\.js$|setupIpc\.js$/i.test(String(name))) {
        try {
          delete require.cache[require.resolve('./extensionsIpc')]
          delete require.cache[require.resolve('./extensionsMarket')]
          delete require.cache[require.resolve('./setupIpc')]
          refreshAuxIpc()
        } catch {
          /* fall through to restart */
        }
      }
      scheduleRestart()
    })
  } catch {
    /* ignore */
  }
}

function folderOf(event) {
  return folders.get(event.sender.id) || null
}

function setFolderOf(event, dir) {
  if (dir) folders.set(event.sender.id, dir)
  else folders.delete(event.sender.id)
}

function refreshAuxIpc() {
  registerExtensionsIpc({ ipcMain, folderOf })
  registerSetupIpc({
    ipcMain,
    folderOf,
    sessionUser,
    api,
    API,
    isHtmlSpaBody,
    detectInstallations,
    forkBuildHint,
    isSoumtokCodeEmbedded: isSoumtokCodeInstalled,
  })
}

/** Re-attach workspace folder to this window when renderer still knows the path (e.g. after reload). */
function resolveWorkspaceFolder(event, hint) {
  let folder = folderOf(event)
  if (folder) return folder
  const raw = typeof hint === 'string' ? hint.trim() : ''
  if (!raw) return null
  const resolved = path.resolve(raw)
  if (!fs.existsSync(resolved)) return null
  remember(event, resolved)
  return folderOf(event)
}

function sameCwd(a, b) {
  if (!a || !b) return false
  try {
    const left = path.resolve(a)
    const right = path.resolve(b)
    return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
  } catch {
    return false
  }
}

function liveShellMeta(id, session, extra = {}) {
  return {
    id,
    cwd: session.cwd,
    shell: session.shell,
    pty: session.kind === 'pty',
    pipe: session.kind === 'pipe',
    nativePty: session.kind === 'pty',
    connected: !session.exited && (session.kind === 'pty' || Boolean(session.child)),
    reused: Boolean(extra.reused),
    previousLog: String(extra.previousLog || session.log || '').slice(-180_000),
  }
}

function findLiveShellForCwd(cwd) {
  for (const [id, session] of shellSessions) {
    if (session.exited) continue
    if (!cwd || !session.cwd || sameCwd(session.cwd, cwd)) return { id, session }
  }
  return null
}

function killAllShellSessions() {
  const { archiveSessionLog, flushAllWorkspaceLogs } = require('./terminalLog')
  for (const session of shellSessions.values()) {
    try {
      archiveSessionLog(session)
      session?.kill?.()
    } catch {
      /* ignore */
    }
  }
  try {
    flushAllWorkspaceLogs()
  } catch {
    /* ignore */
  }
  shellSessions.clear()
}

function skipDir(name, relPosix) {
  if (SKIP.has(name) || UUID_DIR.test(name)) return true
  if (name === 'data' && /(^|\/)api\/data$/.test(relPosix)) return true
  return false
}

function skipEntry(entry) {
  if (SKIP.has(entry.name)) return true
  if (entry.isDirectory() && entry.name.startsWith('.')) {
    return SKIP_DOT_DIRS.has(entry.name)
  }
  return false
}

function walk(dir, depth = 0, rel = '') {
  if (depth > 8) return []
  let names = []
  try {
    names = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out = []
  for (const entry of names) {
    if (skipEntry(entry)) continue
    const relChild = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory() && skipDir(entry.name, relChild.replace(/\\/g, '/'))) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push({ name: entry.name, path: full, type: 'dir', children: walk(full, depth + 1, relChild) })
    } else {
      out.push({ name: entry.name, path: full, type: 'file' })
    }
  }
  out.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return out
}

async function cookieHeader(forUrl = API) {
  const urls = []
  const add = (base) => {
    const u = String(base || '').replace(/\/$/, '')
    if (u && !urls.includes(u)) urls.push(u)
  }
  add(forUrl)
  add(PRODUCTION_API)
  if (!app.isPackaged) {
    add('http://127.0.0.1:5173')
    add('http://127.0.0.1:3000')
    add('http://localhost:5173')
    add('http://localhost:3000')
  }
  const seen = new Set()
  const parts = []
  for (const url of urls) {
    try {
      const cookies = await authSession().cookies.get({ url })
      for (const c of cookies) {
        if (seen.has(c.name)) continue
        seen.add(c.name)
        parts.push(`${c.name}=${c.value}`)
      }
    } catch {
      /* ignore */
    }
  }
  return parts.join('; ')
}

function parseJsonBody(text) {
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

function reachError(err, base = API) {
  const detail = String(err?.message || err || '').replace(/^Error:\s*/i, '').trim()
  const host = String(base || PRODUCTION_API).replace(/\/$/, '')
  if (/timed?\s*out/i.test(detail)) return `Soumtok at ${host} timed out.`
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED/i.test(detail)) {
    return `Could not reach Soumtok at ${host}. Start the API (npm start or npm run dev) or check SOUMTOK_API.`
  }
  if (/ENOTFOUND|ERR_NAME_NOT_RESOLVED/i.test(detail)) return `Could not resolve ${host}. Check your network.`
  if (/CERT|UNABLE_TO_VERIFY|ERR_CERT|SSL/i.test(detail)) return `TLS error reaching ${host}.`
  return detail ? `Could not reach Soumtok at ${host} (${detail}).` : `Could not reach Soumtok at ${host}.`
}

function nodeRequestJson(method, urlString, { cookie, body, timeoutMs = 15000, family } = {}) {
  return new Promise((resolve, reject) => {
    let u
    try {
      u = new URL(urlString)
    } catch (err) {
      reject(err)
      return
    }
    const lib = u.protocol === 'https:' ? https : http
    const payload = body === undefined || body === null ? null : Buffer.from(JSON.stringify(body))
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method,
        family: family || undefined,
        headers: {
          Accept: 'application/json',
          'User-Agent': `SoumtokDesktop/${appVersion}`,
          ...(cookie ? { Cookie: cookie } : {}),
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': String(payload.length) }
            : {}),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          let buf = Buffer.concat(chunks)
          const enc = String(res.headers['content-encoding'] || '')
          try {
            if (/\bgzip\b/i.test(enc)) buf = zlib.gunzipSync(buf)
            else if (/\bdeflate\b/i.test(enc)) buf = zlib.inflateSync(buf)
            else if (/\bbr\b/i.test(enc)) buf = zlib.brotliDecompressSync(buf)
          } catch {
            /* keep raw bytes */
          }
          resolve({ status: res.statusCode || 0, data: parseJsonBody(buf.toString('utf8')) })
        })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timed out'))
    })
    if (payload) req.write(payload)
    req.end()
  })
}

async function nodeRequestJsonRetry(method, urlString, opts) {
  try {
    return await nodeRequestJson(method, urlString, opts)
  } catch (err) {
    if (opts?.family === 4) throw err
    return nodeRequestJson(method, urlString, { ...opts, family: 4 })
  }
}

async function probeApiHealth(base) {
  const url = `${String(base || '').replace(/\/$/, '')}/api/health`
  try {
    const res = await nodeRequestJsonRetry('GET', url, { timeoutMs: 3500 })
    return res.status === 200 && res.data && res.data.ok === true
  } catch {
    return false
  }
}

async function resolveSoumtokApi() {
  const explicit = (process.env.SOUMTOK_API || readSoumtokApiFromEnvFile() || '').replace(/\/$/, '')
  if (explicit) return explicit
  if (!app.isPackaged) {
    for (const base of ['http://127.0.0.1:5173', 'http://127.0.0.1:3000']) {
      if (await probeApiHealth(base)) return base
    }
  }
  return PRODUCTION_API
}

function electronNetJson(method, url, { cookie, body, timeoutMs }) {
  const payload = body === undefined || body === null ? null : Buffer.from(JSON.stringify(body))
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const request = net.request({
      method,
      url,
      useSessionCookies: false,
    })
    const timer = setTimeout(() => {
      try {
        request.abort()
      } catch {
        /* ignore */
      }
      finish({ status: 0, data: { error: 'Request timed out' } })
    }, timeoutMs)
    if (cookie) request.setHeader('Cookie', cookie)
    request.setHeader('Accept', 'application/json')
    request.setHeader('User-Agent', `SoumtokDesktop/${appVersion}`)
    if (payload) {
      request.setHeader('Content-Type', 'application/json')
      request.setHeader('Content-Length', String(payload.length))
    }
    const chunks = []
    request.on('response', (response) => {
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        finish({ status: response.statusCode, data: parseJsonBody(Buffer.concat(chunks).toString('utf8')) })
      })
    })
    request.on('error', (e) => reject(e || new Error('net.request failed')))
    if (payload) request.write(payload)
    request.end()
  })
}

async function api(method, pathname, body, timeoutMs = 15000) {
  const url = `${API}${pathname}`
  let cookie = ''
  try {
    cookie = await cookieHeader()
  } catch {
    cookie = ''
  }
  try {
    return await nodeRequestJsonRetry(method, url, { cookie, body, timeoutMs })
  } catch (err) {
    try {
      return await electronNetJson(method, url, { cookie, body, timeoutMs })
    } catch (netErr) {
      return { status: 0, data: { error: reachError(netErr?.message ? netErr : err) } }
    }
  }
}

registerSpeechTranscribe(async (payload) => {
  const audio = String(payload?.audio || '').trim()
  if (!audio) return { error: 'Missing audio' }

  const localKey = (process.env.OPENAI_API_KEY || readOpenAiKeyFromEnvFile() || '').trim()
  if (localKey) {
    const direct = await transcribeWithOpenAiDirect(localKey, payload)
    if (!direct.error || direct.text) return direct
  }

  const body = {
    audio,
    mime: payload?.mime || 'audio/webm',
    language: payload?.language,
    prompt: payload?.prompt,
  }
  const res = await api('POST', '/api/desktop/speech/transcribe', body, 60_000).catch(() => ({
    status: 0,
    data: { error: 'Could not reach Soumtok server' },
  }))
  if (res.status === 200) return { text: res.data?.text ?? '' }
  if (res.status === 401) return { error: 'Sign in to use voice transcription' }
  if (res.status === 402) return { error: res.data?.error || 'Voice not available on your plan' }

  if (res.status === 404 || res.status === 405) {
    return {
      error:
        'Voice API is not on the live server yet. Deploy the latest Soumtok backend, or add OPENAI_API_KEY to your project .env and restart Desktop.',
    }
  }

  const msg =
    res.data?.error ||
    (typeof res.data?.raw === 'string' ? res.data.raw.trim() : '') ||
    (localKey
      ? 'Transcription failed'
      : 'Add OPENAI_API_KEY to your Soumtok .env file, or deploy the voice API on your server.')
  return { error: msg }
})

const DESKTOP_MODEL_PROVIDERS = new Set(['deepseek', 'openai', 'anthropic', 'xai'])

const PLAN_LABELS = {
  hobby: 'Trial',
  trial: 'Trial',
  pro: 'Pro',
  pro_plus: 'Pro Plus',
  ultra: 'Ultra',
  team: 'Team',
  teams: 'Team',
  team_plus: 'Team Premium',
}

const PLAN_PRICE = {
  pro: '$13.99 / mo.',
  pro_plus: '$48 / mo.',
  ultra: '$149 / mo.',
  team: '$32 / user / mo.',
  team_plus: '$96 / user / mo.',
}

/** Tokens included per plan (matches shared/plans PLAN_CREDIT × 8000; trial = 12000). */
function planQuotaTokens(planId) {
  const id = planId === 'teams' ? 'team' : planId
  if (id === 'hobby' || id === 'trial') return 12000
  const credits = { pro: 40, pro_plus: 120, ultra: 400, team: 200, team_plus: 1000 }
  const credit = credits[id]
  return credit ? credit * 8000 : 12000
}

function apiErrorMessage(res, fallback) {
  if (res.status === 401) return 'Sign in required'
  if (res.status === 403) return res.data?.error || 'Finish account setup on soumtok.com'
  if (res.status === 404) return null
  if (res.status === 0) return res.data?.error || fallback
  return res.data?.error || fallback
}

function filterDesktopModels(models) {
  return (models || []).filter((m) => DESKTOP_MODEL_PROVIDERS.has(m.provider))
}

/** Keys are per provider — if any model for a provider is ready, the whole provider is usable. */
function readyProvidersFromModels(models) {
  const out = new Set()
  for (const m of models || []) {
    if (m?.provider && m.ready !== false) out.add(m.provider)
  }
  return out
}

function applyProviderReadiness(models) {
  const readyProviders = readyProvidersFromModels(models)
  const openRouter = (models || []).some((m) => m.provider === 'openrouter' && m.ready !== false)
  return (models || []).map((m) => {
    if (m.ready === true || !m.provider) return m
    if (m.ready !== false) return m
    if (readyProviders.has(m.provider) || openRouter) return { ...m, ready: true }
    return m
  })
}

async function connectedDesktopProviderIds() {
  const summary = await api('GET', '/api/desktop/summary')
  if (summary.status === 200 && Array.isArray(summary.data?.providers)) {
    return summary.data.providers.filter((p) => p.connected).map((p) => p.id)
  }
  const keys = await api('GET', '/api/keys')
  if (keys.status === 200 && Array.isArray(keys.data?.keys)) {
    return keys.data.keys.map((k) => k.provider)
  }
  return []
}

function markProvidersConnected(models, providerIds) {
  const connected = new Set(providerIds || [])
  const hasOpenRouter = connected.has('openrouter')
  if (!connected.size) return models
  return (models || []).map((m) => {
    if (m.ready === true || !m.provider) return m
    if (connected.has(m.provider) || hasOpenRouter) return { ...m, ready: true }
    return m
  })
}

async function platformCodingProvidersFromHealth() {
  try {
    const res = await api('GET', '/api/health')
    if (res.status !== 200 || !res.data?.coding) return []
    return Object.entries(res.data.coding)
      .filter(([, ok]) => Boolean(ok))
      .map(([id]) => id)
  } catch {
    return []
  }
}

/** Account keys, BYOK, and platform env keys (/api/health) — then propagate per provider. */
async function finalizeDesktopModels(models) {
  let out = applyProviderReadiness(models || [])
  const providerIds = [
    ...new Set([...(await connectedDesktopProviderIds()), ...(await platformCodingProvidersFromHealth())]),
  ]
  if (providerIds.length) out = markProvidersConnected(out, providerIds)
  out = applyProviderReadiness(out)
  return { models: out, platformProviders: providerIds }
}

function isHtmlSpaBody(data) {
  const raw = data?.raw
  if (typeof raw !== 'string') return false
  const head = raw.trimStart().slice(0, 64).toLowerCase()
  return head.startsWith('<!doctype') || head.startsWith('<html')
}

function modelsFromApiResponse(res) {
  if (!res || res.status !== 200) return null
  if (isHtmlSpaBody(res.data)) return null
  if (!Array.isArray(res.data?.models) || !res.data.models.length) return null
  return res.data.models
}

async function fetchDesktopModelsPayload() {
  const desktopRes = await api('GET', '/api/desktop/models')
  if (desktopRes.status === 401) {
    return {
      error: 'Sign in required',
      models: staticDesktopModels(false),
      setupHint: 'Sign in, then tap Refresh to load readiness from your account.',
      offlineCatalog: true,
    }
  }
  if (desktopRes.status === 403) {
    const fin = await finalizeDesktopModels(staticDesktopModels(false))
    return {
      error: apiErrorMessage(desktopRes, 'Finish account setup on soumtok.com'),
      models: fin.models,
      setupHint: 'Complete username and email verification on soumtok.com, then Refresh.',
      offlineCatalog: true,
      platformProviders: fin.platformProviders,
    }
  }

  const desktopModels = modelsFromApiResponse(desktopRes)
  if (desktopModels?.length) {
    const fin = await finalizeDesktopModels(desktopModels)
    return {
      models: fin.models,
      platformProviders: fin.platformProviders,
      accountReady: desktopRes.data?.accountReady !== false,
      setupHint:
        desktopRes.data?.accountReady === false ?
          'Finish account setup on soumtok.com (username + verified email) to run the agent.'
        : '',
    }
  }

  const res = await api('GET', '/api/models')
  if (res.status === 401) {
    return {
      error: 'Sign in required',
      models: staticDesktopModels(false),
      setupHint: 'Sign in, then tap Refresh to sync model readiness.',
      offlineCatalog: true,
    }
  }
  if (res.status === 403) {
    const fin = await finalizeDesktopModels(staticDesktopModels(false))
    return {
      error: apiErrorMessage(res, 'Finish account setup on soumtok.com'),
      models: fin.models,
      setupHint: 'Finish account setup on soumtok.com, then Refresh.',
      offlineCatalog: true,
      platformProviders: fin.platformProviders,
    }
  }

  const apiModels = modelsFromApiResponse(res)
  if (apiModels?.length) {
    const fin = await finalizeDesktopModels(filterDesktopModels(apiModels))
    if (fin.models.length) {
      return {
        models: fin.models,
        platformProviders: fin.platformProviders,
        fallback: true,
        accountReady: true,
      }
    }
  }

  const networkMsg = apiErrorMessage(res, '') || apiErrorMessage(desktopRes, '')
  const fin = await finalizeDesktopModels(staticDesktopModels(false))
  return {
    models: fin.models,
    platformProviders: fin.platformProviders,
    offlineCatalog: true,
    setupHint:
      networkMsg ||
      'Showing built-in catalog. Production may not have /api/desktop/models yet — tap Refresh after deploy or use /api/models when signed in.',
    error: res.status && res.status !== 200 && !isHtmlSpaBody(res.data) ? apiErrorMessage(res, 'Could not sync models') : '',
  }
}

async function fetchAccountSummaryPayload() {
  let res = await api('GET', '/api/desktop/summary')
  if (res.status === 200 && res.data && !res.data.error && res.data.plan != null) {
    return res.data
  }

  const billing = await api('GET', '/api/billing/me')
  if (billing.status !== 200) {
    return { error: apiErrorMessage(billing, 'Could not load plan and usage') }
  }

  const analytics = await api('GET', '/api/analytics/summary')
  const usageRows = analytics.status === 200 && Array.isArray(analytics.data?.usage) ? analytics.data.usage : []

  let includedTokens = 0
  let byokTokens = 0
  const topModels = []
  for (const row of usageRows) {
    const tokens = Number(row.prompt_tokens || 0) + Number(row.completion_tokens || 0) || Number(row.tokens) || 0
    if (row.billed_to === 'user') byokTokens += tokens
    else includedTokens += tokens
    if (row.model) {
      topModels.push({
        model: row.model,
        provider: row.provider || '',
        tokens,
      })
    }
  }
  topModels.sort((a, b) => b.tokens - a.tokens)

  const b = billing.data || {}
  const planRaw = String(b.plan || 'hobby')
  const quota = planQuotaTokens(planRaw)
  const renewsAt = b.planRenewsAt ? new Date(b.planRenewsAt) : null
  let renewsInDays = null
  if (renewsAt && !Number.isNaN(renewsAt.getTime())) {
    renewsInDays = Math.max(0, Math.ceil((renewsAt.getTime() - Date.now()) / 86400000))
  }

  const keysRes = await api('GET', '/api/keys')
  const haveKeys = new Set(
    (keysRes.status === 200 && Array.isArray(keysRes.data?.keys) ? keysRes.data.keys : []).map(
      (k) => k.provider,
    ),
  )
  const providerNames = { deepseek: 'DeepSeek', openai: 'OpenAI', anthropic: 'Claude', xai: 'Grok' }
  const providers = ['deepseek', 'openai', 'anthropic', 'xai'].map((id) => ({
    id,
    name: providerNames[id] || id,
    connected: haveKeys.has(id) || haveKeys.has('openrouter'),
  }))

  return {
    plan: planRaw,
    planStatus: b.planStatus || 'active',
    planCycle: b.planCycle === 'annual' ? 'annual' : 'monthly',
    planRenewsAt: b.planRenewsAt || null,
    planLabel: PLAN_LABELS[planRaw] || PLAN_LABELS.hobby,
    planPrice: PLAN_PRICE[planRaw] || 'Free',
    quota,
    includedTokens,
    byokTokens,
    includedPct: Math.min(100, Math.round((includedTokens / Math.max(quota, 1)) * 100)),
    byokPct: byokTokens > 0 ? Math.min(100, Math.round((byokTokens / Math.max(quota, 1)) * 100)) : 0,
    topModels: topModels.slice(0, 10),
    providers,
    renewsInDays,
    fallback: true,
  }
}

if (devPrimary) {
  app.whenReady().then(async () => {
    try {
      API = await resolveSoumtokApi()
    } catch {
      API = PRODUCTION_API
    }
    stopSoumtokCodeHost()
    refreshAuxIpc()
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      if (permission === 'media' || permission === 'audioCapture') {
        callback(true)
        return
      }
      callback(false)
    })
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
      return permission === 'media' || permission === 'audioCapture'
    })
    Menu.setApplicationMenu(null)
    createWindow()
    initAutoUpdater(() => mainWindow)
    watchRenderer()
    watchMainProcess()
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  try {
    require('./terminalLog').flushAllWorkspaceLogs()
  } catch {
    /* ignore */
  }
  stopSoumtokCodeHost()
})

ipcMain.handle('app:info', (event) => ({
  platform: process.platform,
  api: API,
  version: appVersion,
  productName: appProductName,
  folder: folderOf(event),
  lastFolder: loadState().lastFolder || null,
  soumtokHome: SOUMTOK_HOME,
  localData: app.getPath('userData'),
  monaco: path.join(__dirname, '../../node_modules/monaco-editor/min/vs').replace(/\\/g, '/'),
}))

ipcMain.handle('workspace:load', (event) => {
  const folder = folderOf(event)
  if (!folder) return { messages: [], tabs: [], active: null }
  return loadWorkspaceCache(folder)
})

ipcMain.handle('workspace:save', (event, payload) => {
  const raw = payload?.path || payload?.folder
  let folder = folderOf(event)
  if (raw && typeof raw === 'string' && fs.existsSync(raw)) {
    folder = path.resolve(raw)
  }
  if (!folder) return false
  const body = { ...(payload && typeof payload === 'object' ? payload : {}) }
  delete body.path
  delete body.folder
  saveWorkspaceCache(folder, body)
  return true
})

ipcMain.handle('window:control', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  if (action === 'min') win.minimize()
  if (action === 'max') {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  }
  if (action === 'close') win.close()
})

ipcMain.handle('window:new', () => createWindow())

function rememberRecent(dir) {
  const resolved = path.resolve(dir)
  const recents = (loadState().recents || []).filter((item) => item.path !== resolved)
  recents.unshift({ name: path.basename(resolved), path: resolved, openedAt: Date.now() })
  saveState({ recents: recents.slice(0, 24) })
}

function workspaceKey(dir) {
  return crypto.createHash('sha256').update(path.resolve(dir)).digest('hex').slice(0, 20)
}

function workspaceCachePath(dir) {
  const dirPath = path.join(SOUMTOK_HOME, 'workspaces', workspaceKey(dir))
  fs.mkdirSync(dirPath, { recursive: true })
  return path.join(dirPath, 'cache.json')
}

function loadWorkspaceCache(dir) {
  try {
    return JSON.parse(fs.readFileSync(workspaceCachePath(dir), 'utf8'))
  } catch {
    return { messages: [], tabs: [], active: null }
  }
}

function saveWorkspaceCache(dir, payload) {
  const resolved = path.resolve(dir)
  const body = {
    path: resolved,
    name: path.basename(resolved),
    updatedAt: new Date().toISOString(),
    messages: payload.messages || [],
    tabs: payload.tabs || [],
    active: payload.active || null,
    threads: payload.threads || [],
    activeThreadId: payload.activeThreadId || null,
    workspaceExtraFolders: payload.workspaceExtraFolders || [],
    workspaceFilePath: payload.workspaceFilePath || null,
    side: payload.side || null,
    terminals: Array.isArray(payload.terminals) ? payload.terminals : [],
    extMarketFilter: payload.extMarketFilter || null,
  }
  fs.writeFileSync(workspaceCachePath(resolved), JSON.stringify(body, null, 2))
}

function remember(event, dir) {
  setFolderOf(event, dir)
  rememberRecent(dir)
  saveState({ lastFolder: dir })
  try {
    if (remember._watched) unwatchIndex(remember._watched)
    remember._watched = dir
    watchIndex(dir)
    getIndex(dir)
    require('./projectMemory').refreshProjectMemory(dir)
  } catch {
    /* index optional */
  }
}

ipcMain.handle('folder:open', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const picked = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
  if (picked.canceled || !picked.filePaths[0]) return folderOf(event)
  remember(event, picked.filePaths[0])
  if (win === mainWindow) killAllShellSessions()
  return folderOf(event)
})

ipcMain.handle('folder:openPath', (event, dir) => {
  if (!dir || !fs.existsSync(dir)) return folderOf(event)
  const resolved = path.resolve(dir)
  const current = folderOf(event)
  if (current && path.resolve(current) === resolved) {
    return current
  }
  remember(event, resolved)
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win === mainWindow) killAllShellSessions()
  return folderOf(event)
})

ipcMain.handle('folder:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win === mainWindow) killAllShellSessions()
  try {
    if (remember._watched) unwatchIndex(remember._watched)
    remember._watched = null
  } catch {
    /* ignore */
  }
  setFolderOf(event, null)
  return true
})

ipcMain.handle('folder:pick', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const picked = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
  if (picked.canceled || !picked.filePaths[0]) return null
  return picked.filePaths[0]
})

function resolveWorkspaceFolderEntry(entry, workspaceFileDir) {
  if (!entry || typeof entry.path !== 'string') return null
  let p = entry.path.replace(/\//g, path.sep)
  if (!path.isAbsolute(p) && workspaceFileDir) p = path.join(workspaceFileDir, p)
  p = path.normalize(p)
  return fs.existsSync(p) ? p : null
}

ipcMain.handle('workspace:openFile', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const picked = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Code Workspace', extensions: ['code-workspace'] }],
  })
  if (picked.canceled || !picked.filePaths[0]) return null
  const workspacePath = picked.filePaths[0]
  let data
  try {
    data = JSON.parse(fs.readFileSync(workspacePath, 'utf8'))
  } catch {
    return { error: 'Could not read workspace file.' }
  }
  const workspaceFileDir = path.dirname(workspacePath)
  const resolved = (data.folders || [])
    .map((f) => resolveWorkspaceFolderEntry(f, workspaceFileDir))
    .filter(Boolean)
  if (!resolved.length) return { error: 'Workspace file has no valid folders.' }
  remember(event, resolved[0])
  if (win === mainWindow) killAllShellSessions()
  return {
    workspacePath,
    folder: resolved[0],
    extraFolders: resolved.slice(1),
  }
})

ipcMain.handle('workspace:saveAs', async (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const folders = Array.isArray(payload?.folders) ? payload.folders.filter(Boolean) : []
  if (!folders.length) return { error: 'No folders in workspace.' }
  const picked = await dialog.showSaveDialog(win, {
    title: 'Save Workspace As',
    filters: [{ name: 'Code Workspace', extensions: ['code-workspace'] }],
    defaultPath: payload?.defaultName || 'workspace.code-workspace',
  })
  if (picked.canceled || !picked.filePath) return null
  const body = {
    folders: folders.map((abs) => {
      const p = path.resolve(abs)
      return { path: p }
    }),
  }
  fs.writeFileSync(picked.filePath, `${JSON.stringify(body, null, 2)}\n`, 'utf8')
  return { path: picked.filePath }
})

ipcMain.handle('workspace:duplicate', async (event, sourcePath) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const src = String(sourcePath || '').trim()
  if (!src || !fs.existsSync(src)) return { error: 'No workspace file to duplicate.' }
  const picked = await dialog.showSaveDialog(win, {
    title: 'Duplicate Workspace',
    filters: [{ name: 'Code Workspace', extensions: ['code-workspace'] }],
    defaultPath: path.join(path.dirname(src), `${path.basename(src, '.code-workspace')}-copy.code-workspace`),
  })
  if (picked.canceled || !picked.filePath) return null
  fs.copyFileSync(src, picked.filePath)
  return { path: picked.filePath }
})

ipcMain.handle('file:open', async (event) => {
  const folder = folderOf(event)
  const win = BrowserWindow.fromWebContents(event.sender)
  const picked = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    defaultPath: folder || undefined,
  })
  if (picked.canceled || !picked.filePaths[0]) return null
  const filePath = picked.filePaths[0]
  const dir = path.dirname(filePath)
  if (!folder || path.relative(folder, filePath).startsWith('..')) remember(event, dir)
  return { path: filePath, name: path.basename(filePath) }
})

ipcMain.handle('file:saveAs', async (event, payload) => {
  const folder = folderOf(event)
  const win = BrowserWindow.fromWebContents(event.sender)
  const suggested = payload?.defaultPath || payload?.path
  const picked = await dialog.showSaveDialog(win, {
    title: 'Save As',
    defaultPath: suggested || folder || undefined,
  })
  if (picked.canceled || !picked.filePath) return null
  const contents = String(payload?.contents ?? '')
  fs.mkdirSync(path.dirname(picked.filePath), { recursive: true })
  fs.writeFileSync(picked.filePath, contents, 'utf8')
  const dir = path.dirname(picked.filePath)
  if (!folder || path.relative(folder, picked.filePath).startsWith('..')) remember(event, dir)
  return { path: picked.filePath, name: path.basename(picked.filePath) }
})

ipcMain.handle('app:quit', () => {
  app.quit()
  return true
})

ipcMain.handle('recents:list', () => loadState().recents || [])

ipcMain.handle('workspace:grep', (event, payload) => {
  const folder = folderOf(event)
  if (!folder) return { ok: false, matches: [], error: 'Open a folder first.' }
  const pattern = String(payload?.pattern || '').trim()
  if (!pattern) return { ok: false, matches: [], error: 'Enter a search term.' }
  return workspaceGrep(folder, pattern, { limit: payload?.limit, glob: payload?.glob })
})

ipcMain.handle('workspace:replaceAll', (event, payload) => {
  const folder = folderOf(event)
  if (!folder) return { ok: false, error: 'Open a folder first.' }
  const pattern = String(payload?.pattern || '').trim()
  if (!pattern) return { ok: false, error: 'Enter a search term.' }
  const replacement = String(payload?.replacement ?? '')
  return workspaceReplaceAll(folder, pattern, replacement, {
    limit: payload?.limit,
    caseSensitive: Boolean(payload?.caseSensitive),
  })
})

ipcMain.handle('folder:tree', (event, extraFolders) => {
  const folder = folderOf(event)
  if (!folder) return { folder: null, tree: [], extraRoots: [] }
  const extras = (Array.isArray(extraFolders) ? extraFolders : [])
    .map((p) => path.resolve(String(p || '')))
    .filter((p) => p && p !== path.resolve(folder) && fs.existsSync(p))
  const extraRoots = extras.map((p) => ({
    path: p,
    name: path.basename(p),
    tree: walk(p),
  }))
  return { folder, name: path.basename(folder), tree: walk(folder), extraRoots }
})

ipcMain.handle('file:read', (event, filePath) => {
  try {
    assertInside(event, filePath)
    return fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Blocked'
    if (msg === 'Blocked' || msg === 'No folder') return ''
    throw err
  }
})

function mimeForImagePath(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.bmp') return 'image/bmp'
  if (ext === '.ico') return 'image/x-icon'
  if (ext === '.avif') return 'image/avif'
  if (ext === '.svg') return 'image/svg+xml'
  return ''
}

ipcMain.handle('file:readMedia', (event, filePath) => {
  try {
    assertInside(event, filePath)
    const mime = mimeForImagePath(filePath)
    if (!mime) return { error: 'Not an image' }
    const buf = fs.readFileSync(filePath)
    if (!buf.length) return { error: 'Empty image' }
    if (buf.length > 12 * 1024 * 1024) return { error: 'Image is larger than 12 MB' }
    return {
      dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
      mime,
      size: buf.length,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Blocked'
    if (msg === 'Blocked' || msg === 'No folder') return { error: msg }
    throw err
  }
})

const ATTACH_TEXT_MAX = 120_000
const ATTACH_SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage'])
const ATTACH_TEXT_EXT =
  /\.(txt|md|json|js|ts|tsx|jsx|css|html|xml|yaml|yml|toml|env|svg|py|go|rs|java|kt|sql|sh|ps1|vue|svelte|csv|ini|cfg|conf|log|c|cpp|h|hpp|rb|php|swift|dart)$/i

function readAttachFile(filePath) {
  const stat = fs.statSync(filePath)
  if (!stat.isFile() || stat.size > 2_000_000) return null
  const name = path.basename(filePath)
  const ext = path.extname(name)
  let text = ''
  if (ATTACH_TEXT_EXT.test(ext) || stat.size < 512_000) {
    text = fs.readFileSync(filePath, 'utf8').slice(0, ATTACH_TEXT_MAX)
  } else {
    text = `[binary file ${name}, ${stat.size} bytes — contents not included]`
  }
  return { name, text, mime: 'text/plain' }
}

function collectAttachPaths(dir, depth = 0, out = []) {
  if (depth > 4 || out.length >= 20) return out
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const ent of entries) {
    if (ent.name.startsWith('.') || ATTACH_SKIP_DIRS.has(ent.name)) continue
    const p = path.join(dir, ent.name)
    if (ent.isFile()) out.push(p)
    else if (ent.isDirectory()) collectAttachPaths(p, depth + 1, out)
    if (out.length >= 20) break
  }
  return out
}

ipcMain.handle('files:pickAttach', async (event) => {
  const folder = folderOf(event)
  const win = BrowserWindow.fromWebContents(event.sender)
  const picked = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    defaultPath: folder || undefined,
  })
  if (picked.canceled || !picked.filePaths.length) return []
  const out = []
  for (const filePath of picked.filePaths) {
    if (out.length >= 6) break
    try {
      const row = readAttachFile(filePath)
      if (row) out.push(row)
    } catch {
      /* skip */
    }
  }
  return out
})

ipcMain.handle('folder:pickAttach', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const picked = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
  if (picked.canceled || !picked.filePaths[0]) return []
  const paths = collectAttachPaths(picked.filePaths[0])
  const out = []
  for (const filePath of paths) {
    if (out.length >= 6) break
    try {
      const row = readAttachFile(filePath)
      if (row) out.push(row)
    } catch {
      /* skip */
    }
  }
  return out
})

ipcMain.handle('testhub:chat', async (_e, payload) => {
  const res = await api('POST', '/api/studio/complete', {
    model: String(payload?.model || 'auto').trim() || 'auto',
    messages: Array.isArray(payload?.messages) ? payload.messages : [],
    agent: false,
  }).catch(() => ({ status: 0, data: { error: 'Could not reach Soumtok.' } }))
  if (res.status === 401) return { error: 'Sign in to use Test Hub.' }
  if (res.status !== 200) return { error: res.data?.error || `Request failed (${res.status || 'offline'})` }
  return { text: String(res.data?.text || '') }
})

function parseSseFrames(buffer) {
  const events = []
  let rest = buffer
  let cut = rest.indexOf('\n\n')
  while (cut >= 0) {
    const frame = rest.slice(0, cut).trim()
    rest = rest.slice(cut + 2)
    cut = rest.indexOf('\n\n')
    if (!frame.startsWith('data:')) continue
    try {
      events.push(JSON.parse(frame.slice(5).trim()))
    } catch {
      /* ignore bad frame */
    }
  }
  return { events, buffer: rest }
}

function pushTestHubStreamChunk(win, streamId, text) {
  try {
    if (!win.isDestroyed()) win.webContents.send('testhub:chunk', { streamId, text })
  } catch {
    /* ignore */
  }
}

function processSseEvents(frames, text, win, streamId) {
  let nextText = text
  for (const frame of frames) {
    if (frame.error) return { error: String(frame.error), text: nextText, done: true }
    if (frame.reset) nextText = ''
    if (frame.delta) nextText += String(frame.delta)
    if (frame.text) nextText = String(frame.text)
    if (frame.delta || frame.text || frame.reset) pushTestHubStreamChunk(win, streamId, nextText)
    if (frame.done) {
      if (frame.text) nextText = String(frame.text)
      return { text: nextText, done: true }
    }
  }
  return { text: nextText, done: false }
}

function streamStudioCompleteViaNode(win, cookie, streamId, body, timeoutMs = 180_000) {
  return new Promise((resolve, reject) => {
    let u
    try {
      u = new URL(`${API}/api/studio/complete/stream`)
    } catch (err) {
      reject(err)
      return
    }
    const lib = u.protocol === 'https:' ? https : http
    const payload = Buffer.from(JSON.stringify(body))
    let buffer = ''
    let text = ''
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          'Content-Length': String(payload.length),
          'User-Agent': `SoumtokDesktop/${appVersion}`,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode === 401) {
          resolve({ error: 'Sign in to use Test Hub.', text: '' })
          return
        }
        if (res.statusCode >= 400) {
          const chunks = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => {
            let msg = `Request failed (${res.statusCode})`
            try {
              const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
              if (data?.error) msg = data.error
            } catch {
              /* ignore */
            }
            resolve({ error: msg, text: '' })
          })
          return
        }
        res.on('data', (chunk) => {
          buffer += chunk.toString('utf8')
          const parsed = parseSseFrames(buffer)
          buffer = parsed.buffer
          const out = processSseEvents(parsed.events, text, win, streamId)
          text = out.text
          if (out.error) {
            resolve({ error: out.error, text })
            req.destroy()
            return
          }
          if (out.done) resolve({ text })
        })
        res.on('end', () => resolve({ text }))
      },
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timed out'))
    })
    req.write(payload)
    req.end()
  })
}

function streamStudioCompleteViaNet(win, cookie, streamId, body, timeoutMs = 180_000) {
  return new Promise((resolve, reject) => {
    let settled = false
    let buffer = ''
    let text = ''
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const request = net.request({
      method: 'POST',
      url: `${API}/api/studio/complete/stream`,
      useSessionCookies: false,
    })
    const timer = setTimeout(() => {
      try {
        request.abort()
      } catch {
        /* ignore */
      }
      finish({ error: 'Request timed out', text })
    }, timeoutMs)
    request.setHeader('Cookie', cookie)
    request.setHeader('Content-Type', 'application/json')
    request.setHeader('Accept', 'text/event-stream')
    request.setHeader('User-Agent', `SoumtokDesktop/${appVersion}`)
    const streamBody = Buffer.from(JSON.stringify(body))
    request.setHeader('Content-Length', String(streamBody.length))
    request.on('response', (response) => {
      if (response.statusCode === 401) {
        finish({ error: 'Sign in to use Test Hub.' })
        return
      }
      if (response.statusCode >= 400) {
        const chunks = []
        response.on('data', (c) => chunks.push(c))
        response.on('end', () => {
          let msg = `Request failed (${response.statusCode})`
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            if (data?.error) msg = data.error
          } catch {
            /* ignore */
          }
          finish({ error: msg })
        })
        return
      }
      response.on('data', (chunk) => {
        buffer += chunk.toString('utf8')
        const parsed = parseSseFrames(buffer)
        buffer = parsed.buffer
        const out = processSseEvents(parsed.events, text, win, streamId)
        text = out.text
        if (out.error) {
          finish({ error: out.error, text })
          return
        }
        if (out.done) finish({ text })
      })
      response.on('end', () => finish({ text }))
    })
    request.on('error', (err) => reject(err || new Error('net.request failed')))
    request.write(streamBody)
    request.end()
  })
}

function isReachFailure(errOrMsg) {
  const s = String(errOrMsg?.message || errOrMsg || '')
  return /timed?\s*out|ECONNREFUSED|ENOTFOUND|ERR_CONNECTION|net\.request|Could not reach/i.test(s)
}

async function streamStudioCompleteNonStream(body, win, streamId) {
  const res = await api('POST', '/api/studio/complete', body, 180_000)
  if (res.status === 401) return { error: 'Sign in to use Test Hub.' }
  if (res.status !== 200) {
    return { error: res.data?.error || reachError(`Request failed (${res.status || 'offline'}`) }
  }
  const text = String(res.data?.text || '')
  pushTestHubStreamChunk(win, streamId, text)
  return { text }
}

async function streamStudioComplete(event, payload) {
  const win = BrowserWindow.fromWebContents(event.sender)
  const streamId = String(payload?.streamId || 'default')
  const body = {
    model: String(payload?.model || 'auto').trim() || 'auto',
    messages: Array.isArray(payload?.messages) ? payload.messages : [],
    agent: false,
  }

  const attempt = async () => {
    const cookie = await cookieHeader()
    try {
      return await streamStudioCompleteViaNode(win, cookie, streamId, body)
    } catch (nodeErr) {
      try {
        return await streamStudioCompleteViaNet(win, cookie, streamId, body)
      } catch (netErr) {
        return { error: reachError(netErr?.message ? netErr : nodeErr), text: '' }
      }
    }
  }

  let result = await attempt()
  if (result?.error && isReachFailure(result.error) && !app.isPackaged) {
    try {
      const next = await resolveSoumtokApi()
      if (next && next !== API) {
        API = next
        result = await attempt()
      }
    } catch {
      /* ignore */
    }
  }

  if (result?.error && isReachFailure(result.error)) {
    const fallback = await streamStudioCompleteNonStream(body, win, streamId)
    if (!fallback.error) return fallback
    return {
      error: `${reachError(result.error)} Start the API with npm run dev (repo root), then sign in again.`,
      text: '',
    }
  }

  return result
}

ipcMain.handle('testhub:stream', (event, payload) => streamStudioComplete(event, payload))

const TEST_HUB_DIR = path.join(SOUMTOK_HOME, 'ide', 'test-hub')
const TEST_HUB_SESSION = path.join(TEST_HUB_DIR, 'session.json')
const TEST_HUB_ARCHIVES = path.join(TEST_HUB_DIR, 'archives')

function ensureTestHubDir() {
  fs.mkdirSync(TEST_HUB_ARCHIVES, { recursive: true })
}

function readTestHubSession() {
  try {
    ensureTestHubDir()
    if (!fs.existsSync(TEST_HUB_SESSION)) return null
    return JSON.parse(fs.readFileSync(TEST_HUB_SESSION, 'utf8'))
  } catch {
    return null
  }
}

function writeTestHubSession(data) {
  ensureTestHubDir()
  fs.writeFileSync(
    TEST_HUB_SESSION,
    `${JSON.stringify({ version: 1, ...data, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  )
}

function safeTestHubRelPath(rel) {
  return String(rel || '')
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^[\\/]+/, '')
}

function writeTestHubFilesToDir(root, files) {
  let written = 0
  for (const rel of Object.keys(files || {})) {
    const safe = safeTestHubRelPath(rel)
    if (!safe) continue
    const full = path.join(root, safe)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, String(files[rel] ?? ''), 'utf8')
    written += 1
  }
  return written
}

ipcMain.handle('testhub:session:load', () => readTestHubSession())

ipcMain.handle('testhub:session:save', (_e, payload) => {
  writeTestHubSession(payload || {})
  return { ok: true }
})

ipcMain.handle('testhub:archives:list', () => {
  ensureTestHubDir()
  if (!fs.existsSync(TEST_HUB_ARCHIVES)) return []
  return fs
    .readdirSync(TEST_HUB_ARCHIVES)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
    .map((f) => {
      const full = path.join(TEST_HUB_ARCHIVES, f)
      const stat = fs.statSync(full)
      let title = f.replace(/\.json$/, '')
      let fileCount = 0
      try {
        const body = JSON.parse(fs.readFileSync(full, 'utf8'))
        title = body.title || title
        fileCount = Object.keys(body.files || {}).length
      } catch {
        /* ignore */
      }
      return {
        id: f.replace(/\.json$/, ''),
        title,
        updatedAt: stat.mtime.toISOString(),
        fileCount,
      }
    })
})

ipcMain.handle('testhub:archives:save', (_e, payload) => {
  ensureTestHubDir()
  const id = String(Date.now())
  const title = String(payload?.title || 'Build').slice(0, 80)
  const file = path.join(TEST_HUB_ARCHIVES, `${id}.json`)
  fs.writeFileSync(
    file,
    `${JSON.stringify(
      {
        version: 1,
        id,
        title,
        updatedAt: new Date().toISOString(),
        model: payload?.model || 'auto',
        messages: payload?.messages || [],
        files: payload?.files || {},
        activeFile: payload?.activeFile || '',
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  return { id, title }
})

ipcMain.handle('testhub:archives:load', (_e, id) => {
  const safe = String(id || '').replace(/[^\d]/g, '')
  if (!safe) return { error: 'Invalid archive' }
  const file = path.join(TEST_HUB_ARCHIVES, `${safe}.json`)
  if (!fs.existsSync(file)) return { error: 'Archive not found' }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return { error: 'Could not read archive' }
  }
})

ipcMain.handle('testhub:export:zip', async (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const files = payload?.files || {}
  const names = Object.keys(files)
  if (!names.length) return { error: 'No files to export' }
  const picked = await dialog.showSaveDialog(win, {
    title: 'Download project as zip',
    defaultPath: `${payload?.defaultName || 'test-hub-project'}.zip`,
    filters: [{ name: 'Zip archive', extensions: ['zip'] }],
  })
  if (picked.canceled || !picked.filePath) return null
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-testhub-'))
  try {
    const count = writeTestHubFilesToDir(tempDir, files)
    if (!count) return { error: 'No files to export' }
    if (process.platform === 'win32') {
      const ps = `$ErrorActionPreference='Stop'; Compress-Archive -LiteralPath '${tempDir.replace(/'/g, "''")}\\*' -DestinationPath '${picked.filePath.replace(/'/g, "''")}' -Force`
      const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' })
      if (r.status !== 0) return { error: (r.stderr || 'Could not create zip').slice(0, 400) }
    } else {
      const r = spawnSync('zip', ['-r', picked.filePath, '.'], { cwd: tempDir, encoding: 'utf8' })
      if (r.status !== 0) return { error: (r.stderr || 'Could not create zip').slice(0, 400) }
    }
    return { path: picked.filePath, count }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

function rewriteStudyAssetUrls(html) {
  const resourcesRoot = path.join(__dirname, '../../resources')
  const base = `${pathToFileURL(resourcesRoot).href}/`
  return String(html || '').replace(/\.\.\/\.\.\/resources\//g, base)
}

ipcMain.handle('study:savePdf', async (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { error: 'No window' }
  const html = rewriteStudyAssetUrls(String(payload?.html || '').trim())
  if (!html) return { error: 'No study content to print' }
  const suggested = `${String(payload?.title || 'Soumtok Study').replace(/[<>:"/\\|?*]+/g, ' ').trim() || 'Soumtok Study'}.pdf`
  const picked = await dialog.showSaveDialog(win, {
    title: 'Download model study PDF',
    defaultPath: suggested,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (picked.canceled || !picked.filePath) return { ok: false }

  const cssPath = path.join(__dirname, '../renderer/study-print.css')
  const css = fs.readFileSync(cssPath, 'utf8')
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-study-'))
  const tmpHtml = path.join(tmpDir, 'study.html')
  const title = String(payload?.title || 'Soumtok Study').replace(/[<>]/g, '')
  fs.writeFileSync(
    tmpHtml,
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${css}</style></head><body>${html}</body></html>`,
    'utf8',
  )

  const printWin = new BrowserWindow({
    show: false,
    width: 794,
    height: 1123,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  try {
    await printWin.loadFile(tmpHtml)
    await printWin.webContents.executeJavaScript(`
      Promise.all([
        document.fonts?.ready ?? Promise.resolve(),
        ...Array.from(document.images).map((img) =>
          img.complete ? Promise.resolve() : new Promise((resolve) => { img.onload = img.onerror = resolve })
        ),
      ])
    `)
    const pdf = await printWin.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: 'A4',
    })
    fs.writeFileSync(picked.filePath, pdf)
    return { ok: true, path: picked.filePath }
  } catch (err) {
    return { error: String(err?.message || err).slice(0, 400) }
  } finally {
    printWin.destroy()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

const testHubSandbox = (() => {
  try {
    return require('./testHubSandbox.js')
  } catch {
    return null
  }
})()

ipcMain.handle('testhub:sandbox:vite', async (_e, payload) => {
  if (!testHubSandbox?.runTestHubViteSandbox) return { error: 'Sandbox unavailable' }
  const files = payload?.files || {}
  const result = await testHubSandbox.runTestHubViteSandbox(files)
  if (result.root) {
    const root = result.root
    setTimeout(() => testHubSandbox.cleanupSandboxDir?.(root), 60_000)
  }
  return result
})

ipcMain.handle('testhub:benchmark:save', async (_e, payload) => {
  const res = await api('POST', '/api/test-hub/benchmarks', payload || {}, 20_000)
  if (res.status === 401) return { error: 'Sign in to save benchmarks' }
  if (res.status === 403) return { error: res.data?.error || 'Finish account setup first' }
  if (res.status >= 400) return { error: res.data?.error || `Save failed (${res.status})` }
  return res.data || { ok: true }
})

ipcMain.handle('testhub:benchmarks:list', async (_e, payload) => {
  const limit = Number(payload?.limit) || 20
  const model = payload?.model ? `&model=${encodeURIComponent(payload.model)}` : ''
  const res = await api('GET', `/api/test-hub/benchmarks?limit=${limit}${model}`, null, 20_000)
  if (res.status >= 400) return { error: res.data?.error || 'Could not load benchmarks', rows: [] }
  return res.data || { rows: [] }
})

ipcMain.handle('testhub:benchmarks:summary', async () => {
  const res = await api('GET', '/api/test-hub/benchmarks/summary', null, 20_000)
  if (res.status >= 400) return { error: res.data?.error || 'Could not load summary', rows: [] }
  return res.data || { rows: [] }
})

ipcMain.handle('testhub:export:folder', async (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const files = payload?.files || {}
  const names = Object.keys(files)
  if (!names.length) return { error: 'No files to save' }
  const picked = await dialog.showOpenDialog(win, {
    title: 'Save project to folder',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (picked.canceled || !picked.filePaths[0]) return null
  try {
    const count = writeTestHubFilesToDir(picked.filePaths[0], files)
    if (!count) return { error: 'No files were written' }
    return { path: picked.filePaths[0], count }
  } catch (err) {
    return { error: String(err?.message || err).slice(0, 400) }
  }
})

async function apiBuffer(method, pathname, timeoutMs = 20000) {
  try {
    const cookie = await cookieHeader()
    return await new Promise((resolve) => {
      let settled = false
      const finish = (result) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(result)
      }
      const request = net.request({
        method,
        url: `${API}${pathname}`,
        session: authSession(),
      })
      const timer = setTimeout(() => {
        try {
          request.abort()
        } catch {
          /* ignore */
        }
        finish({ status: 0, contentType: '', buffer: Buffer.alloc(0) })
      }, timeoutMs)
      request.setHeader('Cookie', cookie)
      const chunks = []
      let contentType = 'application/octet-stream'
      request.on('response', (response) => {
        contentType = String(response.headers['content-type'] || contentType).split(';')[0]
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          finish({ status: response.statusCode, contentType, buffer: Buffer.concat(chunks) })
        })
      })
      request.on('error', () => finish({ status: 0, contentType: '', buffer: Buffer.alloc(0) }))
      request.end()
    })
  } catch {
    return { status: 0, contentType: '', buffer: Buffer.alloc(0) }
  }
}

async function uploadAvatarMultipart(filePath) {
  const buf = fs.readFileSync(filePath)
  if (buf.length > 6 * 1024 * 1024) return { error: 'Image must be under 6 MB' }
  const name = path.basename(filePath)
  const ext = path.extname(name).toLowerCase()
  const mime =
    ext === '.png' ? 'image/png'
    : ext === '.webp' ? 'image/webp'
    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : ''
  if (!mime) return { error: 'Use PNG, JPEG, or WebP' }

  const boundary = `----Soumtok${crypto.randomBytes(8).toString('hex')}`
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`
  const tail = `\r\n--${boundary}--\r\n`
  const body = Buffer.concat([Buffer.from(head, 'utf8'), buf, Buffer.from(tail, 'utf8')])

  try {
    const cookie = await cookieHeader()
    return await new Promise((resolve) => {
      let settled = false
      const finish = (result) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(result)
      }
      const request = net.request({
        method: 'PUT',
        url: `${API}/api/me/photo/avatar`,
        session: authSession(),
      })
      const timer = setTimeout(() => {
        try {
          request.abort()
        } catch {
          /* ignore */
        }
        finish({ ok: false, error: 'Upload timed out' })
      }, 60000)
      request.setHeader('Cookie', cookie)
      request.setHeader('Accept', 'application/json')
      request.setHeader('Content-Type', `multipart/form-data; boundary=${boundary}`)
      request.setHeader('Content-Length', String(body.length))
      const chunks = []
      request.on('response', (response) => {
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let data = {}
          try {
            data = JSON.parse(text)
          } catch {
            data = { error: text || 'Upload failed' }
          }
          if (response.statusCode === 401) finish({ ok: false, error: 'Sign in required' })
          else if (response.statusCode !== 200) finish({ ok: false, error: data.error || 'Could not upload photo' })
          else finish({ ok: true })
        })
      })
      request.on('error', () => finish({ ok: false, error: 'Could not reach Soumtok' }))
      request.write(body)
      request.end()
    })
  } catch {
    return { ok: false, error: 'Could not upload photo' }
  }
}

ipcMain.handle('profile:load', async () => {
  const res = await api('GET', '/api/me/profile')
  if (res.status === 401) return { error: 'Sign in required' }
  if (res.status !== 200) return { error: res.data?.error || 'Could not load profile' }
  return res.data || {}
})

ipcMain.handle('profile:avatar', async () => {
  const bust = Date.now()
  const res = await apiBuffer('GET', `/api/me/photo/avatar?v=${bust}`)
  if (res.status === 404) return { error: 'No photo' }
  if (res.status !== 200 || !res.buffer?.length) return { error: 'Could not load photo' }
  const dataUrl = `data:${res.contentType || 'image/jpeg'};base64,${res.buffer.toString('base64')}`
  return { dataUrl }
})

ipcMain.handle('profile:uploadAvatar', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const picked = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  })
  if (picked.canceled || !picked.filePaths[0]) return { cancelled: true }
  return uploadAvatarMultipart(picked.filePaths[0])
})

ipcMain.handle('file:write', (event, filePath, contents) => {
  assertInside(event, filePath)
  fs.writeFileSync(filePath, contents, 'utf8')
  return true
})

function assertInside(event, filePath) {
  const folder = folderOf(event)
  if (!folder) throw new Error('No folder')
  const rel = path.relative(folder, filePath)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Blocked')
}

ipcMain.handle('auth:login', async (_e, mode) => {
  const started = await api('POST', '/api/desktop/start', { mode: mode === 'up' ? 'up' : 'in' }).catch(() => ({
    status: 0,
    data: null,
  }))
  const id = started.data?.id
  const path = mode === 'up' ? '/signup' : '/login'
  if (!id) {
    const error =
      started.data?.error ||
      (started.status === 503
        ? 'Sign-in is temporarily unavailable. Try again in a moment.'
        : started.status
          ? 'Could not start desktop sign-in.'
          : reachError('Could not reach Soumtok server'))
    return { pendingId: null, user: null, error, api: API }
  }
  const url = `${API}${path}?desktop=${encodeURIComponent(id)}`
  await shell.openExternal(url)
  return { pendingId: id, user: null, api: API }
})

ipcMain.handle('auth:poll', async (_e, id) => {
  const loginId = String(id || '').trim()
  if (!loginId) return sessionUser()
  const poll = await api('GET', `/api/desktop/poll/${encodeURIComponent(loginId)}`).catch(() => ({ data: null }))
  if (poll.data?.status === 'expired') return { expired: true, user: null, api: API }
  if (poll.data?.token) {
    await applySessionToken(poll.data.token)
    let user = await sessionUser()
    if (!user.user) {
      await new Promise((r) => setTimeout(r, 400))
      user = await sessionUser()
    }
    return { expired: false, user: user.user, api: API }
  }
  return { expired: false, user: null, api: API }
})

async function applySessionToken(token) {
  const secure = API.startsWith('https')
  const base = {
    url: API,
    value: token,
    path: '/',
    secure,
    httpOnly: true,
    sameSite: 'lax',
    expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 48,
  }
  const names = secure
    ? ['__Secure-better-auth.session_token', 'better-auth.session_token']
    : ['better-auth.session_token']
  for (const name of names) {
    await authSession().cookies.set({ ...base, name })
  }
}

ipcMain.handle('auth:logout', async () => {
  await authSession().clearStorageData()
  applyUserScope(null)
  return { user: null }
})

ipcMain.handle('auth:session', () => sessionUser())

function applyUserScope(user) {
  const { setActiveUser } = require('./userScope')
  const changed = setActiveUser(user)
  if (changed) {
    try {
      stopSoumtokCodeHost()
    } catch {
      /* ignore */
    }
    try {
      require('./extensionHostView').destroyAllExtensionHostViews()
    } catch {
      /* ignore */
    }
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.webContents.send('extensions:scope-changed', {
          accountKey: require('./userScope').activeUserKey(),
        })
      } catch {
        /* ignore */
      }
    }
  }
  return changed
}

async function sessionUser() {
  const res = await api('GET', '/api/auth/get-session').catch((err) => ({
    status: 0,
    data: { error: reachError(err) },
  }))
  const user = res.data?.user || res.data?.session?.user || null
  applyUserScope(user)
  return {
    user,
    api: API,
    error: user ? undefined : res.status === 0 ? res.data?.error || reachError('offline') : undefined,
  }
}

let agentAbort = null
const agentJobs = new Map()

ipcMain.handle('agent:run', async (event, payload) => {
  const folder = folderOf(event)
  const win = BrowserWindow.fromWebContents(event.sender)
  const jobId = String(payload?.jobId || crypto.randomUUID())
  agentAbort = new AbortController()
  const job = { id: jobId, abort: agentAbort, events: [], seq: 0, status: 'running', startedAt: Date.now() }
  agentJobs.set(jobId, job)
  let branch = ''
  if (folder) {
    try {
      const git = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: folder,
        encoding: 'utf8',
        windowsHide: true,
      })
      if (git.status === 0) branch = (git.stdout || '').trim()
    } catch {
      /* ignore */
    }
  }
  try {
    const result = await runAgentHarness({
      api,
      getBuffer: apiBuffer,
      apiHost: API,
      folder,
      model: payload?.model,
      mode: payload?.mode,
      driver: payload?.driver,
      messages: payload?.messages || [],
      userMessage: payload?.userMessage,
      threadTitle: payload?.threadTitle,
      openFiles: payload?.openFiles || [],
      files: payload?.files || [],
      agentPrefs: payload?.agentPrefs || {},
      subagentModel: payload?.subagentModel,
      branch,
      signal: agentAbort.signal,
      onEvent: (ev) => {
        const row = agentJobs.get(jobId)
        const packed = { ...ev, jobId, seq: row ? ++row.seq : 0 }
        if (row) {
          row.events.push(packed)
          if (row.events.length > 400) row.events.splice(0, row.events.length - 400)
        }
        try {
          if (win.isDestroyed()) return
          win.webContents.send('agent:event', packed)
          if (ev.type === 'file' && ev.path) win.webContents.send('agent:file-changed', { path: ev.path })
          if (ev.type === 'workspace_refresh') win.webContents.send('agent:workspace-refresh')
        } catch {
          /* window gone — job keeps running */
        }
      },
      onIntegratedTerminalRun: ({ cwd, command, newSession }) => {
        if (win.isDestroyed()) return
        win.webContents.send('term:run-request', {
          cwd: cwd || folder || null,
          command: String(command || ''),
          newSession: newSession === true,
        })
      },
      onTerminalMirror: ({ cwd, command, output }) => {
        if (win.isDestroyed()) return
        win.webContents.send('term:mirror', {
          cwd: cwd || folder || null,
          command: String(command || ''),
          output: String(output || '').slice(0, 24_000),
        })
      },
    })
    return result
  } finally {
    const row = agentJobs.get(jobId)
    if (row) row.status = 'done'
    if (agentAbort === job.abort) agentAbort = null
  }
})

ipcMain.handle('agent:cancel', () => {
  if (agentAbort) agentAbort.abort()
  return true
})

ipcMain.handle('agent:jobs', () =>
  [...agentJobs.values()].map((j) => ({ id: j.id, status: j.status, startedAt: j.startedAt, events: j.events.length })),
)

ipcMain.handle('agent:job-events', (_e, id) => agentJobs.get(String(id || ''))?.events || [])

ipcMain.handle('agent:askReply', (_event, payload) => {
  const id = String(payload?.id || '')
  const answers = payload?.answers && typeof payload.answers === 'object' ? payload.answers : {}
  resolveAskReply(id, answers)
  return { ok: true }
})

ipcMain.handle('agent:steer', (_event, payload) => {
  pushAgentSteer(payload?.text || payload?.message || '')
  return true
})

ipcMain.handle('checkpoint:restore', (event, checkpointId) => {
  const folder = folderOf(event)
  if (!folder || !checkpointId) return { ok: false, error: 'No folder or checkpoint' }
  return restoreCheckpoint(folder, String(checkpointId))
})

ipcMain.handle('editor:ai', async (_e, payload) => runEditorAiAssist(api, payload))

ipcMain.handle('agent:isRunning', () =>
  Boolean(agentAbort) || [...agentJobs.values()].some((j) => j.status === 'running'),
)

ipcMain.handle('agent:platform-providers', async () => {
  try {
    return { providers: await platformCodingProvidersFromHealth() }
  } catch {
    return { providers: [] }
  }
})

ipcMain.handle('agent:models', async () => {
  try {
    const payload = await fetchDesktopModelsPayload()
    if (!payload?.models?.length) {
      const fin = await finalizeDesktopModels(staticDesktopModels(false))
      return {
        models: fin.models,
        platformProviders: fin.platformProviders,
        offlineCatalog: true,
        setupHint: '',
      }
    }
    return payload
  } catch (err) {
    const fin = await finalizeDesktopModels(staticDesktopModels(false))
    return {
      models: fin.models,
      platformProviders: fin.platformProviders,
      offlineCatalog: true,
      setupHint: '',
      detail: err?.message || undefined,
    }
  }
})

ipcMain.handle('account:summary', async () => fetchAccountSummaryPayload())

ipcMain.handle('keys:list', async () => {
  const res = await api('GET', '/api/keys').catch(() => ({ status: 0, data: { keys: [] } }))
  if (res.status === 401) return { error: 'Sign in required', keys: [] }
  return res.data || { keys: [] }
})

ipcMain.handle('keys:save', async (_e, payload) => {
  const provider = payload?.provider
  const key = String(payload?.key || '').trim()
  if (!provider || !key) return { error: 'Provider and key required' }
  const res = await api('PUT', '/api/keys', { provider, key }).catch(() => ({ status: 0, data: null }))
  if (res.status === 401) return { error: 'Sign in required' }
  if (res.status !== 200) return { error: res.data?.error || 'Could not save key' }
  return res.data || { ok: true }
})

ipcMain.handle('keys:delete', async (_e, provider) => {
  const id = String(provider || '').trim()
  if (!id) return { error: 'Missing provider' }
  const res = await api('DELETE', `/api/keys/${encodeURIComponent(id)}`).catch(() => ({ status: 0, data: null }))
  if (res.status === 401) return { error: 'Sign in required' }
  if (res.status !== 200) return { error: res.data?.error || 'Could not remove key' }
  return res.data || { ok: true }
})

function connectorsCachePath() {
  return path.join(SOUMTOK_HOME, 'ide', 'connectors.json')
}

function saveConnectorsCache(payload) {
  try {
    fs.mkdirSync(path.dirname(connectorsCachePath()), { recursive: true })
    fs.writeFileSync(
      connectorsCachePath(),
      JSON.stringify(
        {
          savedAt: Date.now(),
          catalog: payload?.catalog || [],
          connectors: payload?.connectors || [],
        },
        null,
        2,
      ),
    )
  } catch {
    /* ignore */
  }
}

function readConnectorsCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(connectorsCachePath(), 'utf8'))
    return {
      catalog: Array.isArray(raw?.catalog) ? raw.catalog : [],
      connectors: Array.isArray(raw?.connectors) ? raw.connectors : [],
    }
  } catch {
    return { catalog: [], connectors: [] }
  }
}

function openSystemBrowser(url) {
  const href = String(url || '').trim()
  if (!/^https:\/\//i.test(href)) return false
  shell.openExternal(href)
  return true
}

ipcMain.handle('connectors:list', async () => {
  const cached = readConnectorsCache()
  const res = await api('GET', '/api/connectors')
  if (res.status === 401) return { error: 'Sign in required', catalog: cached.catalog, connectors: cached.connectors }
  if (res.status !== 200) {
    return {
      error: res.data?.error || 'Could not load connectors',
      catalog: cached.catalog,
      connectors: cached.connectors,
    }
  }
  const data = res.data || { catalog: [], connectors: [] }
  saveConnectorsCache(data)
  return data
})

ipcMain.handle('connectors:marketplace', async (_e, query) => {
  const cached = readConnectorsCache()
  const listed = await api('GET', '/api/connectors')
  const catalog =
    listed.status === 200 && Array.isArray(listed.data?.catalog) ? listed.data.catalog : cached.catalog
  const connectors =
    listed.status === 200 && Array.isArray(listed.data?.connectors) ? listed.data.connectors : cached.connectors
  if (listed.status === 200) saveConnectorsCache(listed.data)
  const market = await loadMcpMarketplace(query, catalog)
  return {
    ...market,
    catalog: market.catalog,
    connectors,
    error: listed.status === 401 ? 'Sign in required' : listed.status && listed.status !== 200 ? listed.data?.error : undefined,
  }
})

ipcMain.handle('connectors:add', async (_e, payload) => {
  const bodyIn = typeof payload === 'string' || typeof payload === 'number' ? { catalogId: payload } : payload || {}
  const catalogId = String(bodyIn.catalogId || '').trim()
  const name = String(bodyIn.name || '').trim()
  const mcpUrl = String(bodyIn.mcpUrl || bodyIn.url || '').trim()
  if (!catalogId && (!name || !mcpUrl)) return { error: 'Pick a connector or paste an HTTPS MCP URL' }
  const body = catalogId && !mcpUrl
    ? { catalogId, authMode: 'always', oauthClient: 'dcr' }
    : { catalogId: catalogId || undefined, name, mcpUrl, authMode: 'always', oauthClient: 'dcr' }
  const res = await api('POST', '/api/connectors', body)
  if (res.status === 401) return { error: 'Sign in required' }
  if (res.status === 402) return { error: res.data?.error || 'Upgrade to add more connectors' }
  if (res.status !== 200) return { error: res.data?.error || 'Could not add connector' }
  const listed = await api('GET', '/api/connectors')
  if (listed.status === 200) saveConnectorsCache(listed.data)
  return res.data || { ok: true }
})

ipcMain.handle('connectors:connect', async (_e, connectorId) => {
  const id = String(connectorId || '').trim()
  if (!id) return { error: 'Missing connector' }
  const res = await api('POST', `/api/connectors/${encodeURIComponent(id)}/connect`, null, 45_000)
  if (res.status === 401) return { error: 'Sign in required' }
  if (res.status !== 200) return { error: res.data?.error || 'Could not connect' }
  const listed = await api('GET', '/api/connectors')
  if (listed.status === 200) saveConnectorsCache(listed.data)
  return res.data || { ok: true }
})

ipcMain.handle('connectors:oauth', async (_e, payload) => {
  const id = typeof payload === 'string' ? payload : String(payload?.id || payload?.connectorId || '').trim()
  const loginUrl = typeof payload === 'object' ? String(payload?.loginUrl || '') : ''
  if (!id) return { error: 'Missing connector' }
  const res = await api('GET', `/api/connectors/${encodeURIComponent(id)}/oauth/start?json=1`, null, 45_000)
  if (res.status === 401) return { error: 'Sign in required' }
  if (res.data?.noAuth) return { ok: true, noAuth: true, actionUrl: null, url: null }
  const oauthUrl = res.data?.actionUrl || res.data?.url || res.data?.authorizationUrl
  if (res.status === 200 && oauthUrl && openSystemBrowser(oauthUrl)) {
    return { ok: true, openedOauth: true, needsPoll: true, url: String(oauthUrl), actionUrl: String(oauthUrl) }
  }
  if (loginUrl && openSystemBrowser(loginUrl)) {
    return {
      ok: true,
      openedLogin: true,
      needsPoll: false,
      error: res.data?.error || undefined,
    }
  }
  return { error: res.data?.error || 'This service needs a token in the web dashboard, or is already connected.' }
})

ipcMain.handle('billing:open', () => {
  shell.openExternal(`${API}/dashboard/billing`)
})

ipcMain.handle('dashboard:open', () => {
  shell.openExternal(`${API}/dashboard`)
})

ipcMain.handle('github:open', () => {
  shell.openExternal(`${API}/dashboard/studio`)
})

ipcMain.handle('app:openUrl', (_e, url) => {
  const u = String(url || '').trim()
  if (!/^https?:\/\//i.test(u)) return { ok: false, error: 'Invalid URL' }
  shell.openExternal(u)
  return { ok: true }
})

ipcMain.handle('clipboard:writeText', (_e, text) => {
  clipboard.writeText(String(text || ''))
  return true
})

ipcMain.handle('clipboard:readText', () => clipboard.readText() || '')

ipcMain.handle('clipboard:writeImage', (_e, dataUrl) => {
  try {
    const img = nativeImage.createFromDataURL(String(dataUrl || ''))
    if (img.isEmpty()) return false
    clipboard.writeImage(img)
    return true
  } catch {
    return false
  }
})

ipcMain.handle('clipboard:readImage', () => {
  try {
    const img = clipboard.readImage()
    if (!img || img.isEmpty()) return null
    return img.toDataURL()
  } catch {
    return null
  }
})

ipcMain.handle('file:saveDataUrl', async (event, payload) => {
  const dataUrl = String(payload?.dataUrl || '')
  const win = BrowserWindow.fromWebContents(event.sender)
  const suggested = String(payload?.name || 'image.png').replace(/[^\w.-]+/g, '_')
  const picked = await dialog.showSaveDialog(win, {
    title: 'Save Image',
    defaultPath: suggested,
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (picked.canceled || !picked.filePath) return { ok: false }
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!m) return { ok: false, error: 'Not an image' }
  fs.writeFileSync(picked.filePath, Buffer.from(m[2], 'base64'))
  return { ok: true, path: picked.filePath }
})

ipcMain.handle('code:detect', () => ({ ok: true, installs: detectInstallations() }))

ipcMain.handle('code:launch', (event, payload) => {
  const folder = folderOf(event)
  const preferredId = payload?.preferredId
  let launch = launchExternalCode(folder, preferredId || 'soumtok-code')
  if (!launch.ok && !preferredId) launch = launchExternalCode(folder)
  return launch
})

function resolveWorkspacePath(event, relOrAbs) {
  const folder = folderOf(event)
  if (!folder) throw new Error('No folder open')
  const raw = String(relOrAbs || '').replace(/\//g, path.sep).trim()
  if (!raw) throw new Error('Path required')
  const full = path.isAbsolute(raw) ? path.normalize(raw) : path.normalize(path.join(folder, raw))
  assertInside(event, full)
  return full
}

ipcMain.handle('file:create', async (event) => {
  const folder = folderOf(event)
  const win = BrowserWindow.fromWebContents(event.sender)
  const picked = await dialog.showSaveDialog(win, {
    title: 'New File',
    defaultPath: folder || undefined,
  })
  if (picked.canceled || !picked.filePath) return null
  fs.writeFileSync(picked.filePath, '')
  const dir = path.dirname(picked.filePath)
  const rel = folder ? path.relative(folder, picked.filePath) : '..'
  if (!folder || rel.startsWith('..') || path.isAbsolute(rel)) remember(event, dir)
  return { path: picked.filePath, name: path.basename(picked.filePath) }
})

ipcMain.handle('file:createPath', (event, relPath, contents = '') => {
  const full = resolveWorkspacePath(event, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  if (fs.existsSync(full)) throw new Error('File already exists')
  fs.writeFileSync(full, String(contents ?? ''), 'utf8')
  return { path: full, name: path.basename(full) }
})

ipcMain.handle('folder:mkdir', (event, relPath) => {
  const full = resolveWorkspacePath(event, relPath)
  fs.mkdirSync(full, { recursive: true })
  return { path: full, name: path.basename(full), type: 'dir' }
})

ipcMain.handle('file:delete', (event, targetPath) => {
  const full = resolveWorkspacePath(event, targetPath)
  fs.rmSync(full, { recursive: true, force: true })
  return { ok: true }
})

ipcMain.handle('file:rename', (event, fromPath, toRelOrAbs) => {
  const from = resolveWorkspacePath(event, fromPath)
  const to = resolveWorkspacePath(event, toRelOrAbs)
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.renameSync(from, to)
  return { path: to, name: path.basename(to) }
})

ipcMain.handle('shell:showItem', (event, targetPath) => {
  const full = resolveWorkspacePath(event, targetPath)
  shell.showItemInFolder(full)
  return { ok: true }
})

function gitPorcelainLine(line) {
  const raw = String(line || '')
  if (raw.length < 4) return null
  const xy = raw.slice(0, 2)
  const file = raw.slice(3).trim()
  if (!file) return null
  let code = 'M'
  if (xy.includes('?')) code = 'U'
  else if (xy.includes('A')) code = 'A'
  else if (xy.includes('D')) code = 'D'
  else if (xy.includes('R')) code = 'R'
  return { code, path: file.replace(/\\/g, '/') }
}

function gitStatusPayload(folder) {
  if (!folder) {
    return { hasFolder: false, isRepo: false, branch: '', dirty: 0, changes: [] }
  }
  try {
    const root = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: folder,
      encoding: 'utf8',
      windowsHide: true,
    })
    if (root.status !== 0) {
      return { hasFolder: true, isRepo: false, branch: '', dirty: 0, changes: [], folderName: path.basename(folder) }
    }
    const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: folder,
      encoding: 'utf8',
      windowsHide: true,
    })
    const dirty = spawnSync('git', ['status', '--porcelain'], {
      cwd: folder,
      encoding: 'utf8',
      windowsHide: true,
    })
    const top = (root.stdout || '').trim() || folder
    const changes = (dirty.stdout || '')
      .split('\n')
      .map(gitPorcelainLine)
      .filter(Boolean)
      .map((row) => ({
        ...row,
        path: path.isAbsolute(row.path) ? row.path : path.join(top, row.path),
      }))
    return {
      hasFolder: true,
      isRepo: true,
      root: top,
      branch: (branch.stdout || '').trim() || 'HEAD',
      dirty: changes.length,
      changes,
      folderName: path.basename(folder),
    }
  } catch {
    return { hasFolder: true, isRepo: false, branch: '', dirty: 0, changes: [], folderName: path.basename(folder) }
  }
}

ipcMain.handle('git:status', (event, workspaceHint) =>
  gitStatusPayload(resolveWorkspaceFolder(event, workspaceHint)),
)

ipcMain.handle('git:init', (event, workspaceHint) => {
  const folder = resolveWorkspaceFolder(event, workspaceHint)
  if (!folder) return { error: 'Open a folder first.' }
  const ran = spawnSync('git', ['init'], { cwd: folder, encoding: 'utf8', windowsHide: true })
  if (ran.status !== 0) return { error: (ran.stderr || ran.stdout || 'git init failed').trim() }
  return gitStatusPayload(folder)
})

ipcMain.handle('git:commit', (event, message, workspaceHint) => {
  const folder = resolveWorkspaceFolder(event, workspaceHint)
  const msg = String(message || '').trim()
  if (!folder) return { error: 'Open a folder first.' }
  if (!msg) return { error: 'Write a commit message.' }
  const add = spawnSync('git', ['add', '-A'], { cwd: folder, encoding: 'utf8', windowsHide: true })
  if (add.status !== 0) return { error: (add.stderr || 'git add failed').trim() }
  const commit = spawnSync('git', ['commit', '-m', msg], { cwd: folder, encoding: 'utf8', windowsHide: true })
  if (commit.status !== 0) return { error: (commit.stderr || commit.stdout || 'Nothing to commit').trim() }
  return gitStatusPayload(folder)
})

ipcMain.handle('git:publish', async (event, workspaceHint) => {
  const folder = resolveWorkspaceFolder(event, workspaceHint)
  if (!folder) return { error: 'Open a folder first.' }
  const status = gitStatusPayload(folder)
  if (!status.isRepo) {
    const init = spawnSync('git', ['init'], { cwd: folder, encoding: 'utf8', windowsHide: true })
    if (init.status !== 0) return { error: (init.stderr || 'Could not initialize Git.').trim() }
  }
  const name = path.basename(folder)
  const ghAuth = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8', windowsHide: true })
  if (ghAuth.status === 0) {
    const create = spawnSync('gh', ['repo', 'create', name, '--source=.', '--private', '--push'], {
      cwd: folder,
      encoding: 'utf8',
      windowsHide: true,
    })
    if (create.status === 0) {
      return { ok: true, ...gitStatusPayload(folder), via: 'gh' }
    }
    const hint = (create.stderr || create.stdout || '').trim()
    if (/already exists/i.test(hint)) {
      await shell.openExternal(`https://github.com/new?name=${encodeURIComponent(name)}`)
      return { ok: false, opened: true, hint: 'That repo name may already exist. Finish on GitHub, then add the remote and push.' }
    }
  }
  await shell.openExternal(`https://github.com/new?name=${encodeURIComponent(name)}`)
  return {
    ok: false,
    opened: true,
    hint: 'Create the repository on GitHub, then run: git remote add origin … && git push -u origin main',
  }
})

ipcMain.handle('help:open', () => {
  shell.openExternal(`${API}/docs`)
})

function sendTermData(id, chunk, session) {
  const data = typeof chunk === 'string' ? chunk : chunk.toString()
  appendSessionLog(id, data, session)
  mainWindow?.webContents.send('term:data', { id, data })
}

function attachTerminalSession(id, session) {
  shellSessions.set(id, session)
  const onShellExit = (code) => {
    const { archiveSessionLog } = require('./terminalLog')
    archiveSessionLog(session)
    session.exited = true
    session.exitCode = code
    mainWindow?.webContents.send('term:exit', { id, code })
  }
  if (session.kind === 'pipe' && session.child) {
    session.child.on('close', onShellExit)
  } else if (session.pty) {
    session.pty.onExit(({ exitCode }) => onShellExit(exitCode))
  }
}

ipcMain.handle('term:create', (event, opts) => {
  const { archiveSessionLog, loadPersistedWorkspaceLog } = require('./terminalLog')
  const cwd =
    resolveWorkspaceFolder(event, opts?.cwd) ||
    (typeof opts?.cwd === 'string' && fs.existsSync(path.resolve(opts.cwd)) ? path.resolve(opts.cwd) : null) ||
    app.getPath('home')
  const fresh = Boolean(opts?.fresh)
  const requestedId =
    typeof opts?.id === 'string' && /^[a-f0-9]{8,24}$/i.test(opts.id) ? opts.id : null

  if (!fresh) {
    const live =
      requestedId && shellSessions.has(requestedId) && !shellSessions.get(requestedId)?.exited
        ? { id: requestedId, session: shellSessions.get(requestedId) }
        : findLiveShellForCwd(cwd)
    if (live?.session) {
      return liveShellMeta(live.id, live.session, {
        reused: true,
        previousLog: live.session.log || loadPersistedWorkspaceLog(live.session.cwd || cwd),
      })
    }
  }

  const id = requestedId || crypto.randomBytes(6).toString('hex')
  if (shellSessions.has(id)) {
    const old = shellSessions.get(id)
    try {
      archiveSessionLog(old)
      old?.kill?.()
    } catch {
      /* ignore */
    }
    shellSessions.delete(id)
  }
  const previousLog = loadPersistedWorkspaceLog(cwd)
  const holder = { session: null }
  const session = createTerminalSession(
    cwd,
    {
      cols: opts?.cols,
      rows: opts?.rows,
      profile: opts?.profile,
    },
    (buf) => sendTermData(id, buf, holder.session),
  )
  holder.session = session
  session.log = previousLog || ''
  session.sessionId = id
  attachTerminalSession(id, session)
  return {
    ...liveShellMeta(id, session, { reused: false, previousLog }),
    previousLog,
  }
})

ipcMain.handle('term:list-live', (event, opts) => {
  const { loadPersistedWorkspaceLog } = require('./terminalLog')
  const cwd =
    resolveWorkspaceFolder(event, opts?.cwd) ||
    (typeof opts?.cwd === 'string' && fs.existsSync(path.resolve(opts.cwd)) ? path.resolve(opts.cwd) : null)
  const rows = []
  for (const [id, session] of shellSessions) {
    if (session.exited) continue
    if (cwd && session.cwd && !sameCwd(session.cwd, cwd)) continue
    rows.push(
      liveShellMeta(id, session, {
        reused: true,
        previousLog: session.log || loadPersistedWorkspaceLog(session.cwd || cwd),
      }),
    )
  }
  return rows
})

ipcMain.handle('term:read-log', (event, opts) => {
  const { readLogsForCwd } = require('./terminalLog')
  const cwd =
    resolveWorkspaceFolder(event, opts?.cwd) ||
    (typeof opts?.cwd === 'string' ? opts.cwd : null)
  const tail = Number(opts?.tail) || 16_000
  return { log: readLogsForCwd(cwd, tail), cwd: cwd || null }
})

ipcMain.handle('term:write', (_e, payload) => {
  const id = typeof payload === 'string' ? null : payload?.id
  const data = typeof payload === 'string' ? payload : payload?.data
  if (!data) return
  const session = id ? shellSessions.get(id) : [...shellSessions.values()].at(-1)
  if (session && data) {
    let logId = id || session.sessionId
    if (!logId) {
      for (const [k, v] of shellSessions) {
        if (v === session) {
          logId = k
          break
        }
      }
    }
    const plain = String(data).replace(/\r/g, '')
    if (logId && plain.trim() && !/[\x00-\x08\x0b-\x1a]/.test(plain)) {
      appendSessionLog(logId, `\r\n[shell input] ${plain}`, session)
    }
  }
  session?.write?.(data)
})

ipcMain.handle('term:bind-cwd', (_e, payload) => {
  const id = payload?.id
  const cwdRaw = typeof payload?.cwd === 'string' ? payload.cwd.trim() : ''
  if (!cwdRaw) return
  let resolved
  try {
    resolved = path.resolve(cwdRaw)
  } catch {
    return
  }
  if (!fs.existsSync(resolved)) return
  const session = id ? shellSessions.get(String(id)) : [...shellSessions.values()].at(-1)
  if (session) session.cwd = resolved
})

ipcMain.handle('term:resize', (_e, payload) => {
  const id = payload?.id
  const cols = Number(payload?.cols)
  const rows = Number(payload?.rows)
  if (!id || !Number.isFinite(cols) || !Number.isFinite(rows)) return
  const session = shellSessions.get(id)
  session?.resize?.(cols, rows)
})

ipcMain.handle('term:kill', (_e, id) => {
  const sid = String(id || '')
  const session = shellSessions.get(sid)
  if (session) {
    const { archiveSessionLog } = require('./terminalLog')
    archiveSessionLog(session)
    session?.kill?.()
  }
  shellSessions.delete(sid)
})

ipcMain.handle('term:meta', () => ({ nativePty: hasPty() }))

/** @deprecated use term:create */
ipcMain.handle('term:start', (event, cwd) => {
  killAllShellSessions()
  const id = crypto.randomBytes(6).toString('hex')
  const dir = resolveWorkspaceFolder(event, cwd) || folderOf(event) || app.getPath('home')
  const holder = { session: null }
  const session = createTerminalSession(dir, {}, (buf) => sendTermData(id, buf, holder.session))
  holder.session = session
  session.log = ''
  session.sessionId = id
  attachTerminalSession(id, session)
  return { id, cwd: session.cwd || dir, shell: session.shell, pty: session.kind === 'pty' }
})

ipcMain.handle('git:clone', async (event, url) => {
  const repo = String(url || '').trim()
  if (!/^https?:\/\/|^git@/.test(repo)) return { error: 'Enter a git URL.' }
  const win = BrowserWindow.fromWebContents(event.sender)
  const picked = await dialog.showOpenDialog(win, {
    title: 'Clone into folder',
    properties: ['openDirectory'],
  })
  if (picked.canceled || !picked.filePaths[0]) return { error: 'Pick a folder to clone into.' }
  const parent = picked.filePaths[0]
  const name = repo.replace(/\.git$/, '').split('/').filter(Boolean).pop() || 'repo'
  const dest = path.join(parent, name)
  const result = await new Promise((resolve) => {
    const child = spawn('git', ['clone', repo, dest], { windowsHide: true })
    let err = ''
    child.stderr.on('data', (chunk) => {
      err += chunk.toString()
    })
    child.on('close', (code) => resolve({ code, err }))
  })
  if (result.code !== 0) return { error: result.err || 'git clone failed.' }
  remember(event, dest)
  if (win === mainWindow) killAllShellSessions()
  return { folder: dest }
})

ipcMain.handle('ssh:connect', async (_e, target) => {
  const host = String(target || '').trim()
  if (!host) return { error: 'Enter user@host.' }
  const shellName = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash'
  const args =
    process.platform === 'win32' ? ['-NoLogo', '-Command', `ssh ${host}`] : ['-l', '-c', `ssh ${host}`]
  spawn(shellName, args, { detached: true, stdio: 'ignore' }).unref()
  return { ok: true }
})

refreshAuxIpc()
