#!/usr/bin/env node
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.join(__dirname, '..')

execSync('node scripts/generate-installer-assets.mjs', { cwd: desktopDir, stdio: 'inherit' })

console.log('\n→ Building macOS arm64 + x64 (.dmg)')
execSync('npx electron-builder --mac dmg --arm64 --x64', {
  cwd: desktopDir,
  stdio: 'inherit',
  env: process.env,
})

execSync('node scripts/sync-release-manifest.mjs', { cwd: desktopDir, stdio: 'inherit' })
console.log('\nOK macOS builds complete')
