#!/usr/bin/env node
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.join(__dirname, '..')

execSync('node scripts/generate-installer-assets.mjs', { cwd: desktopDir, stdio: 'inherit' })

const stageDir = path.join(desktopDir, 'release/stage-linux').replace(/\\/g, '/')

console.log('\n→ Building Linux x64 (.deb)')
execSync(`npx electron-builder --linux deb --x64 -c.directories.output="${stageDir}"`, {
  cwd: desktopDir,
  stdio: 'inherit',
  env: process.env,
})

if (process.platform === 'linux') {
  console.log('\n→ Building Linux x64 (AppImage)')
  execSync(`npx electron-builder --linux AppImage --x64 -c.directories.output="${stageDir}"`, {
    cwd: desktopDir,
    stdio: 'inherit',
    env: process.env,
  })
  console.log('\n→ Building Linux ARM64 (.deb + AppImage)')
  execSync(`npx electron-builder --linux deb AppImage --arm64 -c.directories.output="${stageDir}"`, {
    cwd: desktopDir,
    stdio: 'inherit',
    env: process.env,
  })
} else {
  console.log('\n⊘ AppImage + ARM64 need Linux CI (symlink permissions on Windows)')
}

const releaseDir = path.join(desktopDir, 'release')
const stageRelease = path.join(desktopDir, 'release/stage-linux')
const version = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8')).version

function normalizeLinuxNames(dir) {
  if (!fs.existsSync(dir)) return
  const renames = [
    [`Soumtok-Setup-${version}-linux-x64.deb`, `Soumtok-Setup-${version}-linux-amd64.deb`],
    [`Soumtok-Setup-${version}-linux-x64.AppImage`, `Soumtok-Setup-${version}-linux-x86_64.AppImage`],
  ]
  for (const [fromName, toName] of renames) {
    const from = path.join(dir, fromName)
    const to = path.join(dir, toName)
    if (fs.existsSync(from) && !fs.existsSync(to)) fs.renameSync(from, to)
  }
}

for (const dir of [stageRelease, releaseDir]) {
  normalizeLinuxNames(dir)
  if (!fs.existsSync(dir)) continue
  for (const name of fs.readdirSync(dir)) {
    if (/\.(deb|AppImage)$/i.test(name)) {
      const from = path.join(dir, name)
      const to = path.join(releaseDir, name)
      if (from !== to) fs.copyFileSync(from, to)
    }
  }
}
normalizeLinuxNames(releaseDir)

execSync('node scripts/sync-release-manifest.mjs', { cwd: desktopDir, stdio: 'inherit' })
console.log('\nOK Linux builds complete')
