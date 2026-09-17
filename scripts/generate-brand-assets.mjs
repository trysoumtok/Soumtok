#!/usr/bin/env node
/** Light-background mark + lockup (dark ink, orange accent preserved). */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const images = path.join(root, 'public/images')
const sharpPath = path.join(root, 'desktop/node_modules/sharp/lib/index.js')

async function darkVariant(sharp, inputPath, outputPath) {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a === 0) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (r > 180 && g < 120 && b < 80) {
      data[i] = 245
      data[i + 1] = 78
      data[i + 2] = 0
    } else {
      data[i] = 20
      data[i + 1] = 20
      data[i + 2] = 20
    }
    data[i + 3] = a
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(outputPath)
}

async function main() {
  const sharp = (await import(pathToFileURL(sharpPath).href)).default
  fs.mkdirSync(images, { recursive: true })
  const pairs = [
    ['soumtok-mark.png', 'soumtok-mark-dark.png'],
    ['soumtok-lockup.png', 'soumtok-lockup-dark.png'],
  ]
  for (const [src, out] of pairs) {
    const input = path.join(images, src)
    if (!fs.existsSync(input)) {
      console.warn(`skip ${out}: missing ${src}`)
      continue
    }
    await darkVariant(sharp, input, path.join(images, out))
    console.log(`wrote public/images/${out}`)
  }
  const oauth = path.join(images, 'soumtok-oauth.png')
  fs.copyFileSync(path.join(images, 'soumtok-mark-dark.png'), oauth)
  console.log('wrote public/images/soumtok-oauth.png (Google OAuth / light UI)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
