/**
 * Test Hub — local npm/Vite sandbox (writes temp project, install, build).
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

function safeRel(rel) {
  return String(rel || '')
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^[\\/]+/, '')
}

function writeProject(root, files) {
  let written = 0
  for (const rel of Object.keys(files || {})) {
    const safe = safeRel(rel)
    if (!safe) continue
    const full = path.join(root, safe)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, String(files[rel] ?? ''), 'utf8')
    written += 1
  }
  return written
}

function looksLikeViteProject(files) {
  const pkgRaw = files?.['package.json']
  if (!pkgRaw) return false
  try {
    const pkg = JSON.parse(pkgRaw)
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
    const scripts = Object.values(pkg.scripts || {}).join(' ')
    return Boolean(deps.vite || /vite/i.test(scripts))
  } catch {
    return false
  }
}

function npmCmd() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function runCmd(cwd, command, timeoutMs = 120_000) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      CI: '1',
      NO_UPDATE_NOTIFIER: '1',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
    },
  })
  const out = `${result.stdout || ''}${result.stderr || ''}`.slice(0, 32_000)
  return { ok: result.status === 0, text: out.trim() || `(exit ${result.status ?? 'null'})` }
}

function readDistIndex(root) {
  for (const rel of ['dist/index.html', 'build/index.html']) {
    const full = path.join(root, rel)
    if (fs.existsSync(full)) return { rel, html: fs.readFileSync(full, 'utf8') }
  }
  return null
}

/**
 * @param {Record<string, string>} files
 * @param {{ persistDir?: string }} opts
 */
async function runTestHubViteSandbox(files, opts = {}) {
  const names = Object.keys(files || {})
  if (!names.length) return { ok: false, error: 'No project files' }
  if (!looksLikeViteProject(files)) {
    return { ok: false, error: 'Not a Vite project — need package.json with vite script or dependency' }
  }

  const owned = !opts.persistDir
  const root = opts.persistDir || fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-testhub-vite-'))
  const logs = []
  try {
    const written = writeProject(root, files)
    if (!written) return { ok: false, error: 'No files written', root }

    logs.push('[npm install]')
    const install = runCmd(root, `${npmCmd()} install --no-audit --no-fund`, 180_000)
    logs.push(install.text)
    if (!install.ok) {
      return { ok: false, error: 'npm install failed', log: logs.join('\n\n'), root: owned ? root : undefined }
    }

    logs.push('[npm run build]')
    const build = runCmd(root, `${npmCmd()} run build`, 120_000)
    logs.push(build.text)
    if (!build.ok) {
      return { ok: false, error: 'npm run build failed', log: logs.join('\n\n'), root: owned ? root : undefined }
    }

    const dist = readDistIndex(root)
    return {
      ok: true,
      log: logs.join('\n\n'),
      previewHtml: dist?.html || '',
      distPath: dist?.rel || null,
      root: owned ? root : undefined,
    }
  } catch (err) {
    return { ok: false, error: String(err?.message || err), log: logs.join('\n\n'), root: owned ? root : undefined }
  }
}

function cleanupSandboxDir(root) {
  if (!root) return
  try {
    fs.rmSync(root, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

module.exports = {
  looksLikeViteProject,
  runTestHubViteSandbox,
  cleanupSandboxDir,
  writeProject,
}
