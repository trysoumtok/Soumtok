#!/usr/bin/env node
/**
 * Ensures @homebridge/node-pty-prebuilt-multiarch has a Windows/macOS/Linux binary
 * for the current Node (dev) and attempts Electron runtime prebuild when available.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const desktop = path.resolve(here, '..')
const pkgRoot = path.join(desktop, 'node_modules', '@homebridge', 'node-pty-prebuilt-multiarch')
const ptyNode = path.join(pkgRoot, 'build', 'Release', 'pty.node')

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: pkgRoot, stdio: 'inherit', shell: process.platform === 'win32', ...opts })
  return r.status === 0
}

if (!fs.existsSync(path.join(pkgRoot, 'package.json'))) {
  console.log('[soumtok] node-pty package missing — run npm install in desktop/')
  process.exit(0)
}

if (fs.existsSync(ptyNode)) {
  console.log('[soumtok] Terminal PTY binary already present.')
} else {
  console.log('[soumtok] Installing node-pty prebuild for this PC…')
  if (!run('npm', ['run', 'install'], { cwd: pkgRoot })) {
    console.warn('[soumtok] node-pty prebuild install failed — terminal will use compatible pipe mode.')
  }
}

let electronVer = '37.2.5'
try {
  const pj = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'))
  electronVer = String(pj.dependencies?.electron || pj.devDependencies?.electron || electronVer).replace(/^[^\d]*/, '')
} catch {
  /* ignore */
}

console.log(`[soumtok] Checking Electron PTY prebuild (electron ${electronVer})…`)
run('npx', ['prebuild-install', '--runtime', 'electron', '--target', electronVer, '--verbose'], {
  cwd: pkgRoot,
})

if (fs.existsSync(ptyNode)) {
  console.log('[soumtok] Integrated terminal PTY ready.')
} else {
  console.warn('[soumtok] PTY binary missing — use npm run install inside node-pty package or install Visual Studio Build Tools.')
}
