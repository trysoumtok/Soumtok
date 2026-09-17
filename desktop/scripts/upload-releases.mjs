#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(__dirname, '../../.env') })

const zone = process.env.BUNNY_STORAGE_ZONE?.trim()
const key = process.env.BUNNY_ACCESS_KEY?.trim()
const host = process.env.BUNNY_STORAGE_HOST?.trim() || 'storage.bunnycdn.com'
const releaseDir = path.join(__dirname, '../release')

if (!zone || !key) {
  console.error('Set BUNNY_STORAGE_ZONE and BUNNY_ACCESS_KEY in .env')
  process.exit(1)
}

const files = fs.existsSync(releaseDir)
  ? fs.readdirSync(releaseDir).filter((n) =>
      /\.(exe|zip|dmg|deb|AppImage|yml|yaml|json)$/i.test(n) && n !== 'builder-debug.yml',
    )
  : []

if (!files.length) {
  console.error('No installers in desktop/release')
  process.exit(1)
}

for (const name of files) {
  const body = fs.readFileSync(path.join(releaseDir, name))
  const url = `https://${host}/${zone}/desktop/releases/${name}`
  process.stdout.write(`Uploading ${name}… `)
  const res = await fetch(url, {
    method: 'PUT',
    headers: { AccessKey: key, 'Content-Type': 'application/octet-stream' },
    body,
  })
  if (!res.ok) {
    console.error(`failed (${res.status})`)
    process.exit(1)
  }
  console.log('OK')
}

console.log(`Uploaded ${files.length} file(s)`)
