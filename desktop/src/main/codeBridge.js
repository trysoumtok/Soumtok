const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const { app } = require('electron')
const { extensionsRoot } = require('./extensionsMarket')

function soumtokForkBuildCandidates() {
  const sibling = path.resolve(__dirname, '../../../../soumtok-vscode')
  return [
    path.join(sibling, '.build', 'electron', 'Code.exe'),
    path.join(sibling, '.build', 'electron', 'Soumtok Code.exe'),
    path.join(sibling, 'VSCode-win32-x64', 'Code.exe'),
    path.join(sibling, 'VSCode-win32-x64', 'Soumtok Code.exe'),
  ]
}

const LAUNCHERS = [
  {
    id: 'soumtok-code',
    label: 'Soumtok Code',
    win: [
      ...soumtokForkBuildCandidates(),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Soumtok Code', 'Soumtok Code.exe'),
      path.join(process.env.ProgramFiles || '', 'Soumtok Code', 'Soumtok Code.exe'),
    ],
    bin: 'soumtok-code',
  },
  { id: 'code', label: 'Visual Studio Code', bin: 'code' },
  { id: 'codium', label: 'VSCodium', bin: 'codium' },
]

function which(bin) {
  if (process.platform === 'win32') {
    const r = spawnSync('where', [bin], { encoding: 'utf8', windowsHide: true })
    if (r.status === 0) {
      const line = (r.stdout || '').split(/\r?\n/).find(Boolean)
      if (line && fs.existsSync(line.trim())) return line.trim()
    }
    return null
  }
  const r = spawnSync('sh', ['-lc', `command -v ${bin}`], { encoding: 'utf8' })
  if (r.status === 0) {
    const p = (r.stdout || '').trim()
    return p || null
  }
  return null
}

function detectInstallations() {
  const found = []
  for (const entry of LAUNCHERS) {
    if (entry.win) {
      for (const p of entry.win) {
        if (p && fs.existsSync(p)) {
          found.push({ id: entry.id, label: entry.label, path: p })
          break
        }
      }
    }
    if (!found.some((f) => f.id === entry.id) && entry.bin) {
      const p = which(entry.bin)
      if (p) found.push({ id: entry.id, label: entry.label, path: p })
    }
  }
  return found
}

function launchExternalCode(workspaceFolder, preferredId) {
  let installs = detectInstallations()
  if (preferredId) {
    installs = installs.filter((i) => i.id === preferredId)
  }
  if (!installs.length) {
    return {
      ok: false,
      error:
        preferredId === 'soumtok-code'
          ? 'Soumtok Code is not installed yet. Run npm run vscode:fork-bootstrap, then build Soumtok Code — it runs extensions inside the Soumtok product.'
          : 'No Soumtok extension host found. Build Soumtok Code from Settings → General → Setup & health.',
      installs: [],
    }
  }
  const pick = installs[0]
  const extDir = extensionsRoot()
  const args = []
  if (workspaceFolder && fs.existsSync(workspaceFolder)) {
    args.push('-n', workspaceFolder)
  }
  if (fs.existsSync(extDir)) {
    args.push('--extensions-dir', extDir)
  }
  try {
    const useShell = process.platform === 'win32' && !/\.exe$/i.test(pick.path)
    const child = spawn(pick.path, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: useShell,
    })
    child.unref()
    return {
      ok: true,
      label: pick.label,
      path: pick.path,
      workspace: workspaceFolder || null,
      extensionsDir: extDir,
      note: 'Extensions from Open VSX (Soumtok) are shared when the host supports --extensions-dir.',
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Launch failed',
      installs,
    }
  }
}

function forkBuildHint() {
  const home = app?.getPath?.('home') || process.env.USERPROFILE || ''
  const sibling = path.resolve(__dirname, '../../../../soumtok-vscode')
  const hasClone = fs.existsSync(path.join(sibling, 'package.json'))
  return {
    bootstrap: 'node desktop/vscode-fork/bootstrap.mjs',
    clonePath: sibling,
    clonePresent: hasClone,
    docs: 'docs/VSCODE-EXTENSION-API-GUIDE.md',
  }
}

module.exports = { detectInstallations, launchExternalCode, forkBuildHint }
