#!/usr/bin/env node
/**
 * Build all Windows installers — pack once, then NSIS variants (User/System × x64/ARM64).
 */
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.join(__dirname, '..')
const releaseDir = path.join(desktopDir, 'release')
const pkg = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8'))
const version = pkg.version

execSync('node scripts/generate-installer-assets.mjs', { cwd: desktopDir, stdio: 'inherit' })

if (process.platform === 'win32') {
  try {
    execSync('taskkill /IM Soumtok.exe /F', { stdio: 'ignore' })
  } catch {
    /* not running */
  }
}

function run(cmd) {
  execSync(cmd, { cwd: desktopDir, stdio: 'inherit', env: process.env })
}

const stageDir = path.join(releaseDir, 'stage')

console.log('\n→ Packing Windows x64 app (once) → release/stage/')
run(`npx electron-builder --win --x64 --dir -c.directories.output="${stageDir.replace(/\\/g, '/')}"`)

const prepackaged = path.join(stageDir, 'win-unpacked')
if (!fs.existsSync(prepackaged)) {
  console.error('Missing release/win-unpacked — pack step failed')
  process.exit(1)
}

const nsisBuilds = [
  { arch: 'x64', perMachine: false, suffix: 'user' },
  { arch: 'x64', perMachine: true, suffix: 'system' },
  { arch: 'arm64', perMachine: false, suffix: 'user' },
  { arch: 'arm64', perMachine: true, suffix: 'system' },
]

for (const build of nsisBuilds) {
  const artifactName = `Soumtok-Setup-${version}-win-${build.arch}-${build.suffix}.exe`
  console.log(`\n→ NSIS ${artifactName}`)
  if (build.arch === 'arm64') {
    console.log('  (packing arm64 app dir first)')
    run('npx electron-builder --win --arm64 --dir')
  }
  const pre = build.arch === 'arm64' ? path.join(releaseDir, 'win-arm64-unpacked') : prepackaged
  if (!fs.existsSync(pre)) {
    console.warn(`  ⊘ Skipped — ${pre} missing (build on ${build.arch} host or CI)`)
    continue
  }
  run(
    [
      'npx electron-builder',
      `--prepackaged "${pre}"`,
      '--win nsis',
      `-c.nsis.perMachine=${build.perMachine}`,
      `-c.nsis.artifactName=${artifactName}`,
    ].join(' '),
  )
}

console.log('\n→ Portable zip (x64)')
run(`npx electron-builder --prepackaged "${prepackaged}" --win zip --x64 -c.win.artifactName=Soumtok-Setup-${version}-win-x64.zip`)

console.log('\n→ Syncing release manifest')
run('node scripts/sync-release-manifest.mjs')

console.log('\nOK Windows builds complete')
