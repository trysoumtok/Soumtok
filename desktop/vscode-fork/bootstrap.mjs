#!/usr/bin/env node
/**
 * Clone microsoft/vscode for Soumtok Code (extension host + Agent Host).
 * Pin includes Agent Host (1.130+). Does not compile — see vscode wiki How to Contribute.
 *
 * Usage: node desktop/vscode-fork/bootstrap.mjs [--tag=1.130.0]
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tagArg = process.argv.find((a) => a.startsWith('--tag='))
const PIN_TAG = tagArg ? tagArg.split('=')[1] : '1.130.0'
const TARGET = path.resolve(__dirname, '../../../soumtok-vscode')
const TEMPLATE = path.join(__dirname, 'product.json.template')

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

function gitOut(args) {
  const r = spawnSync('git', args, { cwd: TARGET, encoding: 'utf8', windowsHide: true })
  return (r.stdout || '').trim()
}

if (fs.existsSync(path.join(TARGET, '.git'))) {
  console.log(`Repo present: ${TARGET}`)
  const described = gitOut(['describe', '--tags', '--always'])
  if (!described.startsWith(PIN_TAG)) {
    console.log(`Updating ${described} → ${PIN_TAG} (Agent Host lives here)`)
    run('git', ['fetch', '--depth', '1', 'origin', `refs/tags/${PIN_TAG}:refs/tags/${PIN_TAG}`], { cwd: TARGET })
    run('git', ['checkout', '--force', PIN_TAG], { cwd: TARGET })
  }
} else {
  console.log(`Cloning microsoft/vscode@${PIN_TAG} → ${TARGET}`)
  run('git', ['clone', '--depth', '1', '--branch', PIN_TAG, 'https://github.com/microsoft/vscode.git', TARGET])
}

const overlayDir = path.join(TARGET, 'soumtok-product')
fs.mkdirSync(overlayDir, { recursive: true })
const destProduct = path.join(overlayDir, 'product.json')
if (fs.existsSync(TEMPLATE)) {
  fs.copyFileSync(TEMPLATE, destProduct)
}

const productPath = path.join(TARGET, 'product.json')
if (fs.existsSync(TEMPLATE) && fs.existsSync(productPath)) {
  const overlay = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'))
  const product = JSON.parse(fs.readFileSync(productPath, 'utf8'))
  const merged = { ...product, ...overlay }
  fs.writeFileSync(productPath, `${JSON.stringify(merged, null, '\t')}\n`)
  console.log(`Merged Soumtok branding + Open VSX into ${productPath}`)
}

const readme = path.join(TARGET, 'SOUMTOK-README.md')
fs.writeFileSync(
  readme,
  `# Soumtok Code (${PIN_TAG})

MIT fork of microsoft/vscode. Agent Host: src/vs/platform/agentHost/
AHP spec: https://github.com/microsoft/agent-host-protocol

1. yarn
2. yarn gulp vscode-win32-x64
3. Point Soumtok Desktop at the built Soumtok Code.exe

Product overlay already merged into product.json (Open VSX, Soumtok names).
`,
  'utf8',
)

console.log(`
Pinned: ${PIN_TAG}
Next:
  cd ${TARGET}
  yarn
  yarn gulp vscode-win32-x64
`)
