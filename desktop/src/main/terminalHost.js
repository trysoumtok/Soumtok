const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

/** @type {typeof import('node-pty') | null} */
let ptyModule = null
function loadPtyModule() {
  if (ptyModule) return ptyModule
  for (const name of ['node-pty-prebuilt-multiarch', '@homebridge/node-pty-prebuilt-multiarch', 'node-pty']) {
    try {
      // eslint-disable-next-line import/no-extraneous-dependencies, global-require
      ptyModule = require(name)
      return ptyModule
    } catch {
      /* try next */
    }
  }
  return null
}

function defaultShell() {
  const isWin = process.platform === 'win32'
  if (isWin) return powershellShell()
  const file = process.env.SHELL || '/bin/bash'
  return { file, args: ['-l'], label: path.basename(file) }
}

function powershellShell() {
  return {
    file: 'powershell.exe',
    args: ['-NoLogo', '-NoExit', '-ExecutionPolicy', 'Bypass'],
    label: 'powershell',
  }
}

function resolveShell(profile) {
  if (profile === 'cmd' && process.platform === 'win32') {
    return { file: process.env.ComSpec || 'cmd.exe', args: ['/Q', '/K'], label: 'cmd' }
  }
  if (process.platform === 'win32' && profile !== 'powershell') {
    return { file: process.env.ComSpec || 'cmd.exe', args: ['/Q', '/K'], label: 'cmd' }
  }
  if (profile === 'powershell' && process.platform === 'win32') return powershellShell()
  return defaultShell()
}

/**
 * @param {string} cwd
 * @param {{ cols?: number, rows?: number, profile?: string }} opts
 * @param {(chunk: string) => void} onData
 */
function createTerminalSession(cwd, opts = {}, onData) {
  const raw = typeof cwd === 'string' ? cwd.trim() : ''
  const resolved = raw ? path.resolve(raw) : ''
  const dir = resolved && fs.existsSync(resolved) ? resolved : undefined
  const cols = Math.max(20, Math.min(500, opts.cols || 80))
  const rows = Math.max(5, Math.min(200, opts.rows || 24))
  let shell = resolveShell(opts.profile)
  if (process.platform === 'win32' && !hasPty() && shell.label === 'powershell') {
    shell = resolveShell('cmd')
  }

  const ptyLib = loadPtyModule()
  if (ptyLib) {
    const spawnOpts = {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: dir,
      env: { ...process.env, TERM: 'xterm-256color' },
    }
    const trySpawn = (useConpty) => {
      if (process.platform === 'win32') spawnOpts.useConpty = useConpty
      return ptyLib.spawn(shell.file, shell.args, spawnOpts)
    }
    let pty = null
    try {
      // WinPTY (useConpty: false) is more reliable when ConPTY AttachConsole fails on some PCs.
      pty = process.platform === 'win32' ? trySpawn(false) : trySpawn(undefined)
    } catch {
      try {
        pty = process.platform === 'win32' ? trySpawn(true) : null
      } catch {
        pty = null
      }
    }
    if (pty) {
      if (typeof onData === 'function') pty.onData(onData)
      return {
        kind: 'pty',
        id: null,
        shell: shell.label,
        cwd: dir,
        pty,
        write: (data) => pty.write(data),
        resize: (c, r) => {
          try {
            pty.resize(c, r)
          } catch {
            /* ignore */
          }
        },
        kill: () => {
          try {
            pty.kill()
          } catch {
            /* ignore */
          }
        },
      }
    }
  }

  const child = spawn(shell.file, shell.args, {
    cwd: dir || process.cwd(),
    env: { ...process.env, TERM: 'xterm-256color', PYTHONIOENCODING: 'utf-8' },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  if (typeof onData === 'function') {
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
  }

  // cwd is already set via spawn({ cwd: dir }). Extra cd/prompt commands only duplicate cmd prompts.
  if (process.platform === 'win32' && shell.label === 'powershell') {
    const boot =
      '$ProgressPreference = "SilentlyContinue"\r\n' +
      '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)\r\n' +
      '$OutputEncoding = [Console]::OutputEncoding\r\n'
    child.stdin?.write(boot)
    if (dir) {
      child.stdin?.write(`Set-Location -LiteralPath '${dir.replace(/'/g, "''")}'\r\n`)
    }
  }

  return {
    kind: 'pipe',
    id: null,
    shell: shell.label,
    cwd: dir,
    child,
    write: (data) => {
      if (!child.stdin?.writable) return
      try {
        child.stdin.write(data)
      } catch {
        /* ignore */
      }
    },
    resize: () => {},
    kill: () => {
      if (child && !child.killed) child.kill()
    },
  }
}

function ptyBinaryPresent() {
  for (const pkg of ['node-pty-prebuilt-multiarch', '@homebridge/node-pty-prebuilt-multiarch']) {
    try {
      const root = path.dirname(require.resolve(`${pkg}/package.json`))
      const built = path.join(root, 'build', 'Release', 'pty.node')
      if (fs.existsSync(built)) return true
      const arch = process.arch === 'ia32' ? 'ia32' : process.arch === 'arm64' ? 'arm64' : 'x64'
      const prebuildDir = path.join(root, 'prebuilds', `win32-${arch}`)
      if (process.platform === 'win32' && fs.existsSync(prebuildDir) && fs.readdirSync(prebuildDir).some((f) => f.endsWith('.node'))) {
        return true
      }
      if (process.platform !== 'win32') {
        const dir = path.join(root, 'prebuilds', `${process.platform}-${arch}`)
        if (fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('.node'))) return true
      }
    } catch {
      /* try next */
    }
  }
  return false
}

/** @type {boolean | null} */
let ptySpawnOk = null

function probePtySpawn() {
  if (ptySpawnOk != null) return ptySpawnOk
  const lib = loadPtyModule()
  if (!lib || !ptyBinaryPresent()) {
    ptySpawnOk = false
    return false
  }
  try {
    const t =
      process.platform === 'win32'
        ? lib.spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/q', '/c', 'exit /b 0'], {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd: process.cwd(),
            useConpty: false,
          })
        : lib.spawn(process.env.SHELL || 'bash', ['-c', 'exit 0'], {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd: process.cwd(),
          })
    try {
      t.kill()
    } catch {
      /* ignore */
    }
    ptySpawnOk = true
  } catch {
    ptySpawnOk = false
  }
  return ptySpawnOk
}

function hasPty() {
  return probePtySpawn()
}

module.exports = { createTerminalSession, hasPty, defaultShell, resolveShell }
