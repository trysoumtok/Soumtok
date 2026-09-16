#!/usr/bin/env node
/**
 * Verify a desktop release folder and print upload steps for auto-update.
 * Run after: npm run pack:win (or pack:mac / pack:linux)
 */
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

const files = fs.readdirSync(releaseDir)
const yml = files.find((f) => /^latest.*\.yml$/i.test(f))
const installers = files.filter((f) => /\.(exe|dmg|AppImage|zip)$/i.test(f))

ok(installers.length > 0, `installers found (${installers.length})`)
ok(Boolean(yml), 'latest*.yml manifest present for electron-updater')

console.log('\nRelease', version)
console.log('Folder:', releaseDir)
if (yml) console.log('Manifest:', yml)
for (const f of installers) console.log('  -', f)

console.log(`
Upload to your update CDN (SOUMTOK_UPDATE_URL):
  1. Upload ALL files from release/ to the feed root (same URL as package.json build.publish.url)
  2. Set SOUMTOK_UPDATE_URL=https://your-cdn/desktop/ in server .env and rebuild installers
  3. Users get updates via Help → Check for updates (or auto after 12s when packaged)

Code signing (recommended for public release):
  Windows: set CSC_LINK=path/to/cert.pfx && set CSC_KEY_PASSWORD=secret
  macOS:   set CSC_LINK=... CSC_KEY_PASSWORD=... APPLE_ID=... APPLE_APP_SPECIFIC_PASSWORD=... APPLE_TEAM_ID=...
  Linux:   AppImage needs no signing; use checksums in release notes

Without signing, builds still install locally for beta testers.
`)

if (failed) process.exit(1)
console.log('OK release folder ready to upload')
