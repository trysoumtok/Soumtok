#!/usr/bin/env node
/**
 * Scan desktop/release/ and write releases.json + sync data/desktop-control.json availability.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.join(__dirname, '..')
const repoRoot = path.join(desktopDir, '..')
const releaseDir = path.join(desktopDir, 'release')
const controlPath = path.join(repoRoot, 'data/desktop-control.json')
const pkg = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8'))
const version = pkg.version
const baseUrl = 'https://releases.soumtok.com/desktop/'

const catalog = {
  windows: [
    { id: 'win-x64-user', label: 'Windows (x64) (User)', filename: `Soumtok-Setup-${version}-win-x64-user.exe` },
    { id: 'win-x64-system', label: 'Windows (x64) (System)', filename: `Soumtok-Setup-${version}-win-x64-system.exe` },
    { id: 'win-arm64-user', label: 'Windows (ARM64) (User)', filename: `Soumtok-Setup-${version}-win-arm64-user.exe` },
    { id: 'win-arm64-system', label: 'Windows (ARM64) (System)', filename: `Soumtok-Setup-${version}-win-arm64-system.exe` },
    { id: 'win-x64-zip', label: 'Windows (x64) — Portable (.zip)', filename: `Soumtok-Setup-${version}-win-x64.zip` },
    { id: 'win-x64-legacy', label: 'Windows (x64) — Installer (legacy)', filename: `Soumtok-Setup-${version}-win-x64.exe` },
  ],
  macos: [
    { id: 'mac-arm64', label: 'Mac (ARM64)', filename: `Soumtok-Setup-${version}-mac-arm64.dmg` },
    { id: 'mac-x64', label: 'Mac (x64)', filename: `Soumtok-Setup-${version}-mac-x64.dmg` },
    { id: 'mac-universal', label: 'Mac Universal', filename: `Soumtok-${version}-mac-universal.dmg` },
  ],
  linux: [
    { id: 'linux-deb-x64', label: 'Linux .deb (x64)', filename: `Soumtok-Setup-${version}-linux-amd64.deb` },
    { id: 'linux-deb-arm64', label: 'Linux .deb (ARM64)', filename: `Soumtok-Setup-${version}-linux-arm64.deb` },
    { id: 'linux-appimage-x64', label: 'Linux AppImage (x64)', filename: `Soumtok-Setup-${version}-linux-x86_64.AppImage` },
    { id: 'linux-appimage-arm64', label: 'Linux AppImage (ARM64)', filename: `Soumtok-Setup-${version}-linux-arm64.AppImage` },
  ],
}

if (!fs.existsSync(releaseDir)) {
  console.error('No release/ folder')
  process.exit(1)
}

const onDisk = new Set(fs.readdirSync(releaseDir))

function mapPlatform(items) {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    filename: item.filename,
    url: `${baseUrl}${item.filename}`,
    available: onDisk.has(item.filename),
  }))
}

const releaseSpec = {
  version,
  latest: true,
  releaseNotesUrl: '/docs/changelog',
  windows: mapPlatform(catalog.windows).filter((item) => item.id !== 'win-x64-legacy' || item.available),
  macos: mapPlatform(catalog.macos),
  linux: mapPlatform(catalog.linux),
}

const releasesJson = {
  version,
  baseUrl,
  releases: [releaseSpec],
}

fs.writeFileSync(path.join(releaseDir, 'releases.json'), `${JSON.stringify(releasesJson, null, 2)}\n`)

const controlSpec = {
  windows: catalog.windows
    .filter((item) => item.id !== 'win-x64-legacy')
    .map((item) => ({
      id: item.id,
      label: item.label,
      filename: item.filename,
      available: onDisk.has(item.filename),
    })),
  macos: catalog.macos.map((item) => ({
    id: item.id,
    label: item.label,
    filename: item.filename,
    available: onDisk.has(item.filename),
  })),
  linux: catalog.linux.map((item) => ({
    id: item.id,
    label: item.label,
    filename: item.filename,
    available: onDisk.has(item.filename),
  })),
}

let control = {}
try {
  control = JSON.parse(fs.readFileSync(controlPath, 'utf8'))
} catch {
  control = {}
}

control.latestVersion = version
control.releases = [{ version, latest: true, releaseNotesUrl: '/docs/changelog', ...controlSpec }]
control.updatedAt = new Date().toISOString()
fs.mkdirSync(path.dirname(controlPath), { recursive: true })
fs.writeFileSync(controlPath, `${JSON.stringify(control, null, 2)}\n`)

const available = [...releaseSpec.windows, ...releaseSpec.macos, ...releaseSpec.linux].filter((i) => i.available)
console.log(`Synced manifest — ${available.length} builds available:`)
for (const item of available) console.log('  ✔', item.filename)
