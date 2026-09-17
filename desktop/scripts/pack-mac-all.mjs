#!/usr/bin/env node
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.join(__dirname, '..')

execSync('node scripts/generate-installer-assets.mjs', { cwd: desktopDir, stdio: 'inherit' })

console.log('\n→ Building macOS arm64 + x64 (.dmg)')
const env = { ...process.env }
// Unsigned builds on CI — invalid CSC_LINK breaks electron-builder ("desktop not a file").
if (!env.CSC_LINK?.trim() || env.CSC_LINK.includes('desktop')) {
  delete env.CSC_LINK
  delete env.WIN_CSC_LINK
  env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
}
execSync(
  'npx electron-builder --mac dmg --arm64 --x64 -c.mac.identity=null -c.mac.gatekeeperAssess=false',
  {
    cwd: desktopDir,
    stdio: 'inherit',
    env,
  },
)

execSync('node scripts/sync-release-manifest.mjs', { cwd: desktopDir, stdio: 'inherit' })
console.log('\nOK macOS builds complete')
