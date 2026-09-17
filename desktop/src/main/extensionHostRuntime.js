/**
 * Soumtok Code — embedded VS Code-compatible extension host (code-server runtime).
 * Runs installed marketplace extensions in-app (Claude, Cline, etc.) without opening external VS Code.
 */
const fs = require('fs')
const net = require('net')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')
const { spawn, spawnSync } = require('child_process')
const tar = require('tar')

const CODE_SERVER_VERSION = '4.137.0'
const DEFAULT_PORT = 38472

let hostChild = null
let hostUrl = null
let hostPort = null
let hostWorkspace = null
let hostSessionPipe = null

/** Shared across accounts: the downloaded host runtime holds no user data. */
function soumtokCodeRoot() {
  const root = path.join(os.homedir(), '.soumtok', 'soumtok-code-host')
  fs.mkdirSync(root, { recursive: true })
  return root
}

/**
 * Per-account host profile: settings, keybindings and extension sign-ins live here, so another
 * account signing in on this machine gets its own — it cannot reach the first user's sessions.
 */
function hostUserDataDir() {
  const dir = path.join(require('./userScope').userScopeRoot(), 'code-host', 'user-data')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function platformRelease() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
  if (process.platform === 'win32') {
    return {
      file: `code-server-${CODE_SERVER_VERSION}-windows-${arch}.tar.gz`,
      dir: `code-server-${CODE_SERVER_VERSION}-windows-${arch}`,
    }
  }
  if (process.platform === 'darwin') {
    return {
      file: `code-server-${CODE_SERVER_VERSION}-macos-${arch}.tar.gz`,
      dir: `code-server-${CODE_SERVER_VERSION}-macos-${arch}`,
    }
  }
  return {
    file: `code-server-${CODE_SERVER_VERSION}-linux-${arch}.tar.gz`,
    dir: `code-server-${CODE_SERVER_VERSION}-linux-${arch}`,
  }
}

function installDir() {
  return path.join(soumtokCodeRoot(), 'runtime', platformRelease().dir)
}

/** VS Code version the embedded host implements, used to check an extension's `engines.vscode`. */
function hostVsCodeVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(installDir(), 'lib', 'vscode', 'package.json'), 'utf8'))
    return String(pkg.version || '')
  } catch {
    return ''
  }
}

function codeServerBin() {
  const root = installDir()
  const win = path.join(root, 'bin', 'code-server.cmd')
  if (fs.existsSync(win)) return win
  const exe = path.join(root, 'bin', 'code-server.exe')
  if (fs.existsSync(exe)) return exe
  const sh = path.join(root, 'bin', 'code-server')
  return sh
}

function isSoumtokCodeInstalled() {
  const bin = codeServerBin()
  return fs.existsSync(bin)
}

async function downloadToFile(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(dest, buf)
}

async function extractCodeServerArchive(cache, extractRoot) {
  fs.mkdirSync(extractRoot, { recursive: true })
  let lastErr = null
  try {
    await tar.x({ file: cache, cwd: extractRoot, strict: true })
    if (isSoumtokCodeInstalled()) return { ok: true, method: 'node-tar' }
    lastErr = new Error('node-tar finished but code-server binary was not found')
  } catch (err) {
    lastErr = err instanceof Error ? err : new Error(String(err))
  }
  const tarBin = process.platform === 'win32' ? 'tar.exe' : 'tar'
  const sys = spawnSync(tarBin, ['-xzf', cache, '-C', extractRoot], {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  })
  if (sys.status === 0 && isSoumtokCodeInstalled()) {
    return { ok: true, method: tarBin }
  }
  const sysMsg = (sys.stderr || sys.stdout || '').trim().slice(0, 320)
  throw new Error(
    lastErr?.message
      ? `${lastErr.message}${sysMsg ? ` (${sysMsg})` : ''}`
      : sysMsg || 'Could not extract Soumtok Code host archive',
  )
}

async function ensureSoumtokCodeInstalled(onProgress) {
  if (isSoumtokCodeInstalled()) {
    return { ok: true, path: codeServerBin(), already: true }
  }
  const rel = platformRelease()
  const url = `https://github.com/coder/code-server/releases/download/v${CODE_SERVER_VERSION}/${rel.file}`
  const cache = path.join(soumtokCodeRoot(), 'downloads', rel.file)
  const extractRoot = path.join(soumtokCodeRoot(), 'runtime')
  const expectedBin = codeServerBin()
  try {
    onProgress?.('Downloading Soumtok Code host (~150MB, one-time)…')
    if (!fs.existsSync(cache)) await downloadToFile(url, cache)
    onProgress?.('Extracting Soumtok Code host…')
    try {
      fs.rmSync(extractRoot, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
    const extracted = await extractCodeServerArchive(cache, extractRoot)
    if (!isSoumtokCodeInstalled()) {
      throw new Error(`Extracted with ${extracted.method} but binary missing at ${expectedBin}`)
    }
    onProgress?.('Soumtok Code host installed.')
    return { ok: true, path: expectedBin, already: false }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Soumtok Code install failed'
    return {
      ok: false,
      error: `Soumtok Code host failed to install: ${detail}. Check disk space, network, and ~/.soumtok permissions.`,
      detail,
      binary: expectedBin,
      requiresRestart: true,
    }
  }
}

function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

function portInUseHint(port) {
  if (process.platform === 'win32') {
    return `Port ${port} is already in use. Close other apps or run: netstat -ano | findstr :${port}`
  }
  return `Port ${port} is already in use. Close other apps or run: lsof -i :${port}`
}

function normalizeWorkspacePath(dir) {
  if (!dir || typeof dir !== 'string') return ''
  try {
    const resolved = fs.realpathSync.native ? fs.realpathSync.native(dir) : fs.realpathSync(dir)
    return path.normalize(resolved).toLowerCase()
  } catch {
    return path.normalize(dir).toLowerCase()
  }
}

/** Stable folder for marketplace extensions — per account, not the user’s project tree. */
function platformExtensionWorkspace() {
  const ws = path.join(require('./userScope').userScopeRoot(), 'extension-host-workspace')
  fs.mkdirSync(ws, { recursive: true })
  const readme = path.join(ws, 'README.md')
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(
      readme,
      '# Soumtok extension host\n\nVS Code–compatible extensions run in this workspace inside Soumtok Desktop.\n',
      'utf8',
    )
  }
  return ws
}

function workspacePathOrDefault(workspaceFolder) {
  const raw = typeof workspaceFolder === 'string' ? workspaceFolder.trim() : ''
  if (raw && fs.existsSync(raw)) {
    try {
      return fs.realpathSync.native ? fs.realpathSync.native(raw) : fs.realpathSync(raw)
    } catch {
      return path.normalize(raw)
    }
  }
  return platformExtensionWorkspace()
}

/** Drop stale code-server user-data (wrong restored workspace) once when switching to platform workspace. */
function migrateHostUserDataForPlatformWorkspace() {
  const marker = path.join(hostUserDataDir(), '.platform-workspace-v1')
  if (fs.existsSync(marker)) return
  const userData = hostUserDataDir()
  try {
    // Only wipe legacy shared user-data once; per-account dirs start empty.
    const legacy = path.join(soumtokCodeRoot(), 'user-data')
    if (fs.existsSync(legacy) && path.resolve(legacy) !== path.resolve(userData)) {
      fs.rmSync(legacy, { recursive: true, force: true })
    }
  } catch {
    /* ignore */
  }
  fs.mkdirSync(path.dirname(marker), { recursive: true })
  fs.writeFileSync(marker, 'ok', 'utf8')
}

/**
 * code-server on Windows cannot resolve a bare drive path (it becomes a relative URI and every
 * filesystem read fails), so the folder is handed over as `/C:/...` with forward slashes.
 */
function hostFolderParam(workspace) {
  const p = String(workspace || '').replace(/\\/g, '/')
  return p ? `/${p.replace(/^\/+/, '')}` : ''
}

function hostBaseUrl(port, workspace) {
  const base = `http://127.0.0.1:${port}/`
  const folder = hostFolderParam(workspace)
  return folder ? `${base}?folder=${encodeURIComponent(folder)}` : base
}

function killProcessesOnPort(port) {
  if (process.platform !== 'win32') return
  try {
    const r = spawnSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true })
    const pids = new Set()
    for (const line of (r.stdout || '').split(/\r?\n/)) {
      if (!line.includes(`127.0.0.1:${port}`) && !line.includes(`0.0.0.0:${port}`)) continue
      const m = line.trim().match(/\s(\d+)\s*$/)
      if (m) pids.add(m[1])
    }
    const self = String(process.pid)
    for (const pid of pids) {
      if (pid === self) continue
      spawnSync('taskkill', ['/F', '/PID', pid, '/T'], { windowsHide: true, stdio: 'ignore' })
    }
  } catch {
    /* ignore */
  }
}

function stopSoumtokCodeHost() {
  const pid = hostChild?.pid
  if (hostChild) {
    try {
      hostChild.kill('SIGTERM')
    } catch {
      /* ignore */
    }
    hostChild = null
  }
  if (process.platform === 'win32' && pid) {
    try {
      spawnSync('taskkill', ['/F', '/PID', String(pid), '/T'], { windowsHide: true, stdio: 'ignore' })
    } catch {
      /* ignore */
    }
  }
  killProcessesOnPort(hostPort || DEFAULT_PORT)
  hostUrl = null
  hostPort = null
  hostWorkspace = null
  hostSessionPipe = null
}

function formatHostStartFailure(reason, logBuf, port, extra = '') {
  const tail = String(logBuf || '')
    .trim()
    .split(/\r?\n/)
    .slice(-8)
    .join('\n')
    .slice(0, 900)
  const parts = [
    `Soumtok Code host ${reason} on port ${port}.`,
    extra,
    tail ? `Host log:\n${tail}` : '',
    'Extensions only run inside Soumtok — external VS Code is not used.',
  ].filter(Boolean)
  return parts.join('\n\n')
}

async function probeHostHttp(port, timeoutMs = 2500) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',
    })
    return res.status > 0 && res.status < 500
  } catch {
    return false
  }
}

function waitForServerReady(child, port, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    let settled = false
    let logBuf = ''
    let sawListen = false
    let httpPoll = null

    const done = (fn) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (httpPoll) clearInterval(httpPoll)
      fn()
    }

    const finishReady = () => done(() => resolve({ log: logBuf }))

    const confirmReady = async () => {
      if (settled) return
      if (await probeHostHttp(port)) finishReady()
    }

    const timer = setTimeout(
      () => done(() => reject(new Error(formatHostStartFailure('timed out', logBuf, port)))),
      timeoutMs,
    )

    const onData = (chunk) => {
      const text = String(chunk)
      logBuf = (logBuf + text).slice(-8000)
      const pipe = text.match(/Session server listening on (.+)/i)
      if (pipe?.[1]) hostSessionPipe = pipe[1].trim()
      if (/Listening on/i.test(text) || /127\.0\.0\.1:\d+/.test(text) || /http:\/\/127\.0\.0\.1/i.test(text)) {
        sawListen = true
        void confirmReady()
      }
    }

    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.on('error', (err) =>
      done(() =>
        reject(new Error(formatHostStartFailure('failed to spawn', logBuf, port, err?.message || String(err)))),
      ),
    )
    child.on('exit', (code) => {
      if (!settled) {
        done(() =>
          reject(new Error(formatHostStartFailure(`exited (${code})`, logBuf, port))),
        )
      }
    })

    httpPoll = setInterval(() => {
      if (sawListen) void confirmReady()
    }, 1500)
  })
}

function claudeConfigDir() {
  return require('./userScope').claudeConfigDir()
}

/** Env for code-server / Claude — per Soumtok account, no machine-wide ~/.claude or dev API keys. */
function extensionHostChildEnv() {
  const claudeDir = claudeConfigDir()
  const env = { ...process.env, VSCODE_IPC_HOOK_CLI: '', CLAUDE_CONFIG_DIR: claudeDir }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  return env
}

function seedClaudeConfigIsolation(settings) {
  const dir = claudeConfigDir()
  const existing = Array.isArray(settings['claudeCode.environmentVariables'])
    ? settings['claudeCode.environmentVariables'].filter((row) => row?.name !== 'CLAUDE_CONFIG_DIR')
    : []
  existing.push({ name: 'CLAUDE_CONFIG_DIR', value: dir })
  settings['claudeCode.environmentVariables'] = existing
}

/** VS Code user settings for embedded host — hide code-server welcome, prefer extension panel UI. */
function seedHostUserSettings(opts = {}) {
  const userData = hostUserDataDir()
  const settingsPath = path.join(userData, 'User', 'settings.json')
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  let settings = {}
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  } catch {
    settings = {}
  }
  const sidebarExtension = opts.embedSurface === 'sidebar'
  Object.assign(settings, {
    'workbench.startupEditor': 'none',
    'workbench.welcome.enabled': false,
    'workbench.tips.enabled': false,
    'update.mode': 'none',
    'extensions.autoCheckUpdates': true,
    'claudeCode.useTerminal': false,
    'window.title': '${dirty}${activeEditorShort}${separator}Soumtok',
    'window.restoreWindows': 'none',
    'security.workspace.trust.enabled': true,
    'security.workspace.trust.startupPrompt': 'never',
    'security.workspace.trust.banner': 'never',
    'security.workspace.trust.untrustedFiles': 'open',
    'workbench.chat.openChatOnStartup': false,
    'chat.agent.enabled': false,
    'chat.commandCenter.enabled': false,
    'chat.editor.enabled': false,
    'chat.experimental.detectParticipant.enabled': false,
    'github.copilot.enable': false,
    'github.copilot.chat.enabled': false,
    // Strip every piece of editor chrome: the pane must show the extension's own UI only.
    'workbench.colorTheme': 'Default Dark Modern',
    'window.customTitleBarVisibility': 'never',
    'window.commandCenter': false,
    'workbench.activityBar.location': sidebarExtension ? 'default' : 'hidden',
    'workbench.editor.restoreViewState': false,
    'explorer.autoReveal': false,
    'workbench.statusBar.visible': false,
    'workbench.editor.showTabs': 'none',
    'workbench.editor.editorActionsLocation': 'hidden',
    'workbench.layoutControl.enabled': false,
    'breadcrumbs.enabled': false,
    'workbench.sideBar.location': 'left',
    'workbench.secondarySideBar.defaultVisibility': 'hidden',
    'workbench.panel.defaultLocation': 'bottom',
    'claudeCode.preferredLocation': 'editor',
  })
  seedClaudeConfigIsolation(settings)
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
}

/**
 * Dedicated chords Soumtok sends into the host, since the remote CLI cannot run commands on
 * Windows. F10 is rebound to whichever extension is being opened; the host reloads this file live.
 */
function seedHostKeybindings(openCommand = '') {
  const file = path.join(hostUserDataDir(), 'User', 'keybindings.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const bindings = [
    { key: 'ctrl+alt+shift+f8', command: 'workbench.action.closeSidebar' },
    { key: 'ctrl+alt+shift+f7', command: 'workbench.action.closeOtherEditors' },
    { key: 'ctrl+alt+shift+f6', command: 'workbench.action.closePanel' },
    { key: 'ctrl+alt+shift+f5', command: 'workbench.action.toggleAuxiliaryBar' },
    { key: 'ctrl+alt+shift+f4', command: 'workbench.action.closeSidebar' },
  ]
  const cmd = String(openCommand || '').trim()
  if (cmd) {
    bindings.unshift({ key: 'ctrl+alt+shift+f10', command: cmd })
  }
  if (/claude-vscode|claude-code|anthropic/i.test(cmd)) {
    bindings.splice(1, 0, { key: 'ctrl+alt+shift+f9', command: 'claude-vscode.sidebar.open' })
  }
  fs.writeFileSync(file, `${JSON.stringify(bindings, null, 2)}\n`, 'utf8')
}

/** Claude Code refuses untrusted workspaces — mark platform folder trusted in host user-data. */
function seedPlatformWorkspaceTrust(workspaceFolder) {
  const ws = workspaceFolder || platformExtensionWorkspace()
  const userData = hostUserDataDir()
  const trustRoot = path.join(userData, 'User', 'globalStorage')
  fs.mkdirSync(trustRoot, { recursive: true })
  const trustFile = path.join(trustRoot, 'soumtok-workspace-trust.json')
  let trusted = []
  try {
    trusted = JSON.parse(fs.readFileSync(trustFile, 'utf8'))
  } catch {
    trusted = []
  }
  const key = normalizeWorkspacePath(ws)
  if (!trusted.includes(key)) trusted.push(key)
  fs.writeFileSync(trustFile, `${JSON.stringify(trusted, null, 2)}\n`, 'utf8')
  const vscodeDir = path.join(ws, '.vscode')
  fs.mkdirSync(vscodeDir, { recursive: true })
  const wsSettings = path.join(vscodeDir, 'settings.json')
  let wsSet = {}
  try {
    wsSet = JSON.parse(fs.readFileSync(wsSettings, 'utf8'))
  } catch {
    wsSet = {}
  }
  Object.assign(wsSet, {
    'claudeCode.preferredLocation': 'panel',
    'claudeCode.useTerminal': false,
  })
  fs.writeFileSync(wsSettings, `${JSON.stringify(wsSet, null, 2)}\n`, 'utf8')
}

function repairClaudeSettingsJsonIfNeeded() {
  const claudeSettings = path.join(claudeConfigDir(), 'settings.json')
  try {
    if (!fs.existsSync(claudeSettings)) return
    const raw = fs.readFileSync(claudeSettings, 'utf8').trim()
    if (!raw) {
      fs.writeFileSync(claudeSettings, '{}\n', 'utf8')
      return
    }
    JSON.parse(raw)
  } catch {
    try {
      fs.mkdirSync(path.dirname(claudeSettings), { recursive: true })
      fs.writeFileSync(claudeSettings, '{}\n', 'utf8')
    } catch {
      /* ignore */
    }
  }
}

async function startSoumtokCodeHost(
  { workspaceFolder, extensionsDir, usePlatformWorkspace = true, openCommand = '', embedSurface = '' },
  onProgress,
) {
  const install = await ensureSoumtokCodeInstalled((msg) => onProgress?.(msg))
  if (!install.ok) return install

  migrateHostUserDataForPlatformWorkspace()
  repairClaudeSettingsJsonIfNeeded()
  const ws = usePlatformWorkspace ? platformExtensionWorkspace() : workspacePathOrDefault(workspaceFolder)
  const cmd = String(openCommand || '').trim()
  seedHostUserSettings({ embedSurface })
  seedHostKeybindings(cmd)
  seedPlatformWorkspaceTrust(ws)
  if (hostChild && hostUrl && hostPort) {
    const sameFolder = String(hostWorkspace || '') === String(ws || '')
    if (sameFolder && (await probeHostHttp(hostPort))) {
      return {
        ok: true,
        url: hostUrl,
        port: hostPort,
        workspace: hostWorkspace,
        reused: true,
        embedded: true,
        openCommand: cmd,
        embedSurface,
      }
    }
  }

  const market = require('./extensionsMarket')
  market.migrateExtensionsLayout()
  const extDir = extensionsDir && fs.existsSync(extensionsDir) ? extensionsDir : market.extensionsRoot()

  // Stop first, then clear `.obsolete` after the process is dead so shutdown cannot
  // rewrite marketplace extensions as removed (Cline, Roo, etc. then never load).
  stopSoumtokCodeHost()
  killProcessesOnPort(DEFAULT_PORT)
  await new Promise((r) => setTimeout(r, 1200))
  market.reviveInstalledExtensions()

  const port = DEFAULT_PORT
  if (!(await checkPortAvailable(port))) {
    return { ok: false, error: portInUseHint(port) }
  }

  const userData = hostUserDataDir()
  fs.mkdirSync(userData, { recursive: true })
  fs.mkdirSync(extDir, { recursive: true })
  const bin = codeServerBin()
  if (!fs.existsSync(bin)) {
    return {
      ok: false,
      error: `Soumtok Code binary missing at ${bin}. Delete ~/.soumtok/soumtok-code-host/runtime and retry.`,
      binary: bin,
    }
  }
  market.reviveInstalledExtensions()
  const args = [
    '--bind-addr',
    `127.0.0.1:${port}`,
    '--auth',
    'none',
    '--disable-update-check',
    '--disable-telemetry',
    '--disable-workspace-trust',
    '--ignore-last-opened',
    '--extensions-dir',
    extDir,
    '--user-data-dir',
    userData,
    '--enable-proposed-api',
    'anthropic.claude-code',
    '--enable-proposed-api',
    'saoudrizwan.claude-dev',
    ws,
  ]

  const useShell = process.platform === 'win32' && /\.cmd$/i.test(bin)
  hostChild = spawn(bin, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: useShell,
    env: extensionHostChildEnv(),
  })

  try {
    await waitForServerReady(hostChild, port)
    if (!(await probeHostHttp(port))) {
      throw new Error(formatHostStartFailure('never answered HTTP', '', port))
    }
  } catch (err) {
    stopSoumtokCodeHost()
    const detail = err instanceof Error ? err.message : 'Host failed'
    return {
      ok: false,
      error: detail,
      port,
      binary: bin,
    }
  }

  hostPort = port
  hostWorkspace = ws
  hostUrl = hostBaseUrl(port, ws)
  return {
    ok: true,
    url: hostUrl,
    port,
    workspace: ws,
    reused: false,
    embedded: true,
    openCommand: cmd,
    embedSurface,
  }
}

function codeRemoteCliPath() {
  return path.join(installDir(), 'lib', 'vscode', 'bin', 'remote-cli', process.platform === 'win32' ? 'code.cmd' : 'code')
}

function runHostWorkbenchCommand(commandId) {
  const cmd = String(commandId || '').trim()
  if (!cmd || !hostChild || !hostPort) return { ok: false, error: 'Host not running' }
  if (process.platform === 'win32') {
    return {
      ok: false,
      error: 'Workbench commands run inside the embedded host (not external VS Code). Reload the extension panel.',
    }
  }
  const codeCli = codeRemoteCliPath()
  if (!fs.existsSync(codeCli)) return { ok: false, error: 'Remote CLI not found' }
  try {
    const args = ['--command', cmd]
    if (hostWorkspace) args.unshift('--folder-uri', pathToFileURL(hostWorkspace).href)
    const r = spawnSync(codeCli, args, {
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
      env: {
        ...extensionHostChildEnv(),
        CODE_SERVER_PORT: String(hostPort),
        CODE_SERVER_SESSION_SOCKET: hostSessionPipe || '',
        VSCODE_IPC_HOOK_CLI: hostSessionPipe || '',
      },
      timeout: 15_000,
    })
    const out = `${r.stderr || ''}${r.stdout || ''}`
    if (r.status === 0 && !/only available in WSL/i.test(out)) return { ok: true }
    return { ok: false, error: out.slice(0, 240) || 'command failed' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'command failed' }
  }
}

function soumtokCodeStatus() {
  return {
    installed: isSoumtokCodeInstalled(),
    running: Boolean(hostChild && hostUrl),
    url: hostUrl,
    port: hostPort,
    workspace: hostWorkspace,
    version: CODE_SERVER_VERSION,
  }
}

module.exports = {
  ensureSoumtokCodeInstalled,
  startSoumtokCodeHost,
  stopSoumtokCodeHost,
  soumtokCodeStatus,
  isSoumtokCodeInstalled,
  soumtokCodeRoot,
  platformExtensionWorkspace,
  runHostWorkbenchCommand,
  seedHostKeybindings,
  hostVsCodeVersion,
  checkPortAvailable,
}
