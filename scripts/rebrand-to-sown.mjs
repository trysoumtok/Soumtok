import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))

const SKIP_DIR = new Set(['node_modules', 'dist', 'release', '.git', 'assets'])
const EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.html',
  '.css',
  '.json',
  '.md',
  '.txt',
  '.xml',
  '.webmanifest',
  '.example',
])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (SKIP_DIR.has(name)) continue
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (EXT.has(name.slice(name.lastIndexOf('.'))) || name === '.env.example') out.push(full)
    else if (name === 'package-lock.json') continue
  }
  return out
}

function transform(text) {
  let s = text
  const rules = [
    [/https:\/\/www\.soumtok\.com/gi, 'https://sown.me'],
    [/https:\/\/soumtok\.com/gi, 'https://sown.me'],
    [/http:\/\/soumtok\.com/gi, 'https://sown.me'],
    [/\bsoumtok\.com\b/gi, 'sown.me'],
    [/support@soumtok\.com/gi, 'support@sown.me'],
    [/info@soumtok\.com/gi, 'info@sown.me'],
    [/SOUMTOK_API/g, 'SOWN_API'],
    [/persist:soumtok-auth/g, 'persist:sown-auth'],
    [/soumtok-desktop/g, 'sown-desktop'],
    [/soumtok-next/g, 'sown-next'],
    [/soumtok-need-2fa/g, 'sown-need-2fa'],
    [/soumtok-ide/g, 'sown-ide'],
    [/\bSoumtok\b/g, 'Sown'],
    [/\bSOUMTOK\b/g, 'SOWN'],
    [/host\.includes\('soumtok'\)/g, "host.includes('sown')"],
    [/soumtok\.com/gi, 'sown.me'],
  ]
  for (const [re, rep] of rules) s = s.replace(re, rep)
  return s
}

let changed = 0
for (const file of walk(root)) {
  if (file.includes('rebrand-to-sown.mjs')) continue
  const before = readFileSync(file, 'utf8')
  const after = transform(before)
  if (after !== before) {
    writeFileSync(file, after, 'utf8')
    changed += 1
  }
}
console.log(`Updated ${changed} files`)
