#!/usr/bin/env node
/** Branded installer assets — run: npm run installer:assets */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BUILD = path.join(__dirname, '../build')
const ICON = path.join(__dirname, '../resources/icon.png')
const PKG = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'))
const VERSION = PKG.version || '0.0.0'
const BRAND = { bg: '#141414', bg2: '#1e1e1e', accent: '#f54e00', text: '#f3f3f3', mute: '#858585' }

function licenseRtf() {
  const lines = fs.readFileSync(path.join(BUILD, 'license.txt'), 'utf8').split(/\r?\n/)
  const body = lines
    .map((line) => {
      const safe = line.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}')
      if (!safe.trim()) return '\\par'
      return `${safe}\\par`
    })
    .join('\n')
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat
{\\fonttbl{\\f0\\Segoe UI;}}
{\\colortbl;\\red243\\green243\\blue243;\\red245\\green78\\blue0;\\red133\\green133\\blue133;}
\\viewkind4\\uc1
\\pard\\sa160\\sl276\\slmult1\\cf1\\b\\fs28 Soumtok Desktop\\b0\\fs22\\par
\\pard\\sa120\\cf2 End User License Agreement\\cf1\\par
\\pard\\sa80\\cf3 Version ${VERSION}\\cf1\\par
\\pard\\sa160\\fs20
${body}
}`
}

async function brandedIcon(sharp, size) {
  const pad = Math.max(2, Math.round(size * 0.14))
  const inner = size - pad * 2
  const radius = Math.round(size * 0.2)
  const bgSvg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${BRAND.bg}"/>
    <rect x="0" y="${size - Math.max(2, Math.round(size * 0.06))}" width="${size}" height="${Math.max(2, Math.round(size * 0.06))}" rx="0" fill="${BRAND.accent}"/>
  </svg>`
  const logo = await sharp(ICON)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  return sharp(Buffer.from(bgSvg)).composite([{ input: logo, gravity: 'center' }]).png()
}

async function main() {
  const sharp = (await import('sharp')).default
  const pngToIco = (await import('png-to-ico')).default
  fs.mkdirSync(BUILD, { recursive: true })
  if (!fs.existsSync(ICON)) throw new Error('Missing resources/icon.png')

  const sidebarSvg = `<svg width="164" height="314" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${BRAND.bg2}"/><stop offset="100%" stop-color="${BRAND.bg}"/></linearGradient></defs>
    <rect width="164" height="314" fill="url(#g)"/>
    <rect x="0" y="0" width="4" height="314" fill="${BRAND.accent}"/>
    <text x="82" y="228" text-anchor="middle" fill="${BRAND.text}" font-family="Segoe UI,sans-serif" font-size="17" font-weight="600">Soumtok</text>
    <text x="82" y="248" text-anchor="middle" fill="${BRAND.mute}" font-family="Segoe UI,sans-serif" font-size="10">AI-native IDE</text>
    <text x="82" y="286" text-anchor="middle" fill="${BRAND.mute}" font-family="Segoe UI,sans-serif" font-size="9">v${VERSION}</text></svg>`
  const headerSvg = `<svg width="150" height="57" xmlns="http://www.w3.org/2000/svg">
    <rect width="150" height="57" fill="${BRAND.bg2}"/>
    <rect x="0" y="54" width="150" height="3" fill="${BRAND.accent}"/>
    <text x="46" y="34" fill="${BRAND.text}" font-family="Segoe UI,sans-serif" font-size="15" font-weight="600">Soumtok Setup</text></svg>`
  const dmgSvg = `<svg width="540" height="380" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1a1a1a"/><stop offset="100%" stop-color="#0f0f0f"/></linearGradient></defs>
    <rect width="540" height="380" fill="url(#bg)"/>
    <rect x="0" y="0" width="540" height="3" fill="${BRAND.accent}"/>
    <text x="270" y="52" text-anchor="middle" fill="${BRAND.text}" font-family="system-ui,sans-serif" font-size="22" font-weight="600">Soumtok</text>
    <text x="270" y="78" text-anchor="middle" fill="${BRAND.mute}" font-family="system-ui,sans-serif" font-size="13">The AI-native IDE for your projects</text>
    <text x="130" y="320" text-anchor="middle" fill="${BRAND.mute}" font-size="12">Drag Soumtok here</text>
    <text x="410" y="320" text-anchor="middle" fill="${BRAND.mute}" font-size="12">Applications</text></svg>`

  async function withLogo(svg, lw, lh, cx, cy) {
    const logo = await sharp(ICON)
      .resize(lw, lh, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    return sharp(Buffer.from(svg)).composite([
      { input: logo, left: Math.round(cx - lw / 2), top: Math.round(cy - lh / 2) },
    ])
  }

  const pngs = []
  for (const s of [16, 24, 32, 48, 64, 128, 256]) {
    const p = path.join(BUILD, `icon-${s}.png`)
    await (await brandedIcon(sharp, s)).toFile(p)
    pngs.push(p)
  }
  await (await brandedIcon(sharp, 512)).toFile(path.join(BUILD, 'icon.png'))
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), await pngToIco(pngs))
  await (await withLogo(sidebarSvg, 96, 96, 82, 132)).toFile(path.join(BUILD, 'installerSidebar.bmp'))
  await (await withLogo(headerSvg, 32, 32, 24, 28)).toFile(path.join(BUILD, 'installerHeader.bmp'))
  await (await withLogo(dmgSvg, 96, 96, 270, 168)).png().toFile(path.join(BUILD, 'dmg-background.png'))
  fs.copyFileSync(ICON, path.join(BUILD, 'linux-icon.png'))
  fs.writeFileSync(path.join(BUILD, 'license.rtf'), licenseRtf(), 'utf8')
  console.log('OK installer assets -> desktop/build/')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
