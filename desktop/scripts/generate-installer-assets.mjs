#!/usr/bin/env node
/** Branded installer assets — run: npm run installer:assets */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BUILD = path.join(__dirname, '../build')
const ICON = path.join(__dirname, '../resources/icon.png')
const BRAND = { bg: '#141414', bg2: '#1e1e1e', accent: '#f54e00', text: '#f3f3f3', mute: '#858585' }

async function main() {
  const sharp = (await import('sharp')).default
  const pngToIco = (await import('png-to-ico')).default
  fs.mkdirSync(BUILD, { recursive: true })
  if (!fs.existsSync(ICON)) throw new Error('Missing resources/icon.png')

  const sidebarSvg = `<svg width="164" height="314" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${BRAND.bg2}"/><stop offset="100%" stop-color="${BRAND.bg}"/></linearGradient></defs>
    <rect width="164" height="314" fill="url(#g)"/><rect x="0" y="0" width="4" height="314" fill="${BRAND.accent}"/>
    <text x="82" y="200" text-anchor="middle" fill="${BRAND.text}" font-family="Segoe UI,sans-serif" font-size="15" font-weight="600">Soumtok</text>
    <text x="82" y="222" text-anchor="middle" fill="${BRAND.mute}" font-family="Segoe UI,sans-serif" font-size="10">AI-native IDE</text>
    <text x="82" y="268" text-anchor="middle" fill="${BRAND.mute}" font-family="Segoe UI,sans-serif" font-size="9">Agent · Tab · Terminal</text></svg>`
  const headerSvg = `<svg width="150" height="57" xmlns="http://www.w3.org/2000/svg">
    <rect width="150" height="57" fill="${BRAND.bg2}"/><rect x="0" y="54" width="150" height="3" fill="${BRAND.accent}"/>
    <text x="12" y="34" fill="${BRAND.text}" font-family="Segoe UI,sans-serif" font-size="16" font-weight="600">Soumtok Setup</text></svg>`
  const dmgSvg = `<svg width="540" height="380" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1a1a1a"/><stop offset="100%" stop-color="#0f0f0f"/></linearGradient></defs>
    <rect width="540" height="380" fill="url(#bg)"/><rect x="0" y="0" width="540" height="3" fill="${BRAND.accent}"/>
    <text x="270" y="52" text-anchor="middle" fill="${BRAND.text}" font-family="system-ui,sans-serif" font-size="22" font-weight="600">Soumtok</text>
    <text x="270" y="78" text-anchor="middle" fill="${BRAND.mute}" font-family="system-ui,sans-serif" font-size="13">The AI-native IDE for your projects</text>
    <text x="130" y="320" text-anchor="middle" fill="${BRAND.mute}" font-size="12">Drag Soumtok here</text>
    <text x="410" y="320" text-anchor="middle" fill="${BRAND.mute}" font-size="12">Applications</text></svg>`

  async function withLogo(svg, lw, lh, cx, cy) {
    const logo = await sharp(ICON).resize(lw, lh, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    return sharp(Buffer.from(svg)).composite([{ input: logo, left: Math.round(cx - lw / 2), top: Math.round(cy - lh / 2) }])
  }

  const pngs = []
  for (const s of [16, 24, 32, 48, 64, 128, 256]) {
    const p = path.join(BUILD, `icon-${s}.png`)
    await sharp(ICON).resize(s, s).png().toFile(p)
    pngs.push(p)
  }
  await sharp(ICON).resize(512, 512).png().toFile(path.join(BUILD, 'icon.png'))
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), await pngToIco(pngs))
  await (await withLogo(sidebarSvg, 72, 72, 82, 118)).toFile(path.join(BUILD, 'installerSidebar.bmp'))
  await (await withLogo(headerSvg, 28, 28, 130, 28)).toFile(path.join(BUILD, 'installerHeader.bmp'))
  await (await withLogo(dmgSvg, 96, 96, 270, 168)).png().toFile(path.join(BUILD, 'dmg-background.png'))
  fs.copyFileSync(ICON, path.join(BUILD, 'linux-icon.png'))
  console.log('OK installer assets → desktop/build/')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
