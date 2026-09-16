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
for (const dir of [stageRelease, releaseDir]) {
  if (!fs.existsSync(dir)) continue
  for (const name of fs.readdirSync(dir)) {
    if (/\.(deb|AppImage)$/i.test(name)) {
      const from = path.join(dir, name)
      const to = path.join(releaseDir, name)
      if (from !== to) fs.copyFileSync(from, to)
    }
  }
}

execSync('node scripts/sync-release-manifest.mjs', { cwd: desktopDir, stdio: 'inherit' })
console.log('\nOK Linux builds complete')
