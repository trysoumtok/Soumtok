#!/usr/bin/env node
/**
 * Verify a desktop release folder and print upload steps for auto-update.
 */
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const releaseDir = path.join(__dirname, '../release')
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'))
const version = pkg.version

let failed = 0
function ok(cond, msg) {
  if (cond) console.log('✔', msg)
  else {
    failed += 1
    console.error('✘', msg)
  }
}

if (!fs.existsSync(releaseDir)) {
  console.error('No release/ folder — run npm run pack:win first (from desktop/)')
  process.exit(1)
}

execSync('node scripts/sync-release-manifest.mjs', { cwd: path.join(__dirname, '..'), stdio: 'inherit' })

const files = fs.readdirSync(releaseDir)
const yml = files.find((f) => /^latest.*\.yml$/i.test(f))
const installers = files.filter((f) => /\.(exe|dmg|AppImage|deb|zip)$/i.test(f))

ok(installers.length > 0, `installers found (${installers.length})`)
ok(fs.existsSync(path.join(releaseDir, 'releases.json')), 'releases.json manifest present')
ok(Boolean(yml) || installers.some((f) => f.endsWith('.exe')), 'update manifest or Windows installer present')

console.log('\nRelease', version)
console.log('Folder:', releaseDir)
if (yml) console.log('Manifest:', yml)
for (const f of installers) console.log('  -', f)

console.log(`
Upload to your update CDN (SOUMTOK_UPDATE_URL):
  1. Upload ALL files from release/ to the feed root
  2. Include latest*.yml, releases.json, and installers
  3. data/desktop-control.json is auto-synced with available builds

macOS builds require a Mac or GitHub Actions (pack:mac).
Linux ARM64 requires a Linux host or CI.
`)

if (failed) process.exit(1)
console.log('OK release folder ready to upload')
