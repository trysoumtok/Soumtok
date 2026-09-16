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
  }
  return out
}

function transform(text) {
  let s = text
  const rules = [
    [/https:\/\/sown\.me/gi, 'https://soumtok.com'],
    [/\bsown\.me\b/gi, 'soumtok.com'],
    [/support@sown\.me/gi, 'support@soumtok.com'],
    [/info@sown\.me/gi, 'info@soumtok.com'],
    [/SOWN_API/g, 'SOUMTOK_API'],
    [/persist:sown-auth/g, 'persist:soumtok-auth'],
    [/sown-desktop/g, 'soumtok-desktop'],
    [/sown-next/g, 'soumtok-next'],
    [/sown-need-2fa/g, 'soumtok-need-2fa'],
    [/sown-ide/g, 'soumtok-ide'],
    [/sown-theme/g, 'soumtok-theme'],
    [/sown-avatar/g, 'soumtok-avatar'],
    [/sown-spend-/g, 'soumtok-spend-'],
    [/sown-pay-/g, 'soumtok-pay-'],
    [/sown-project/g, 'soumtok-project'],
    [/sown-started/g, 'soumtok-started'],
    [/sown-team-setup/g, 'soumtok-team-setup'],
    [/sown\.studio\.secrets:/g, 'soumtok.studio.secrets:'],
    [/sown_2fa/g, 'soumtok_2fa'],
    [/sk-sown-/g, 'sk-soumtok-'],
    [/host\.includes\('sown'\)/g, "host.includes('soumtok')"],
    [/sown\.me\|localhost/gi, 'soumtok.com|localhost'],
    [/provider: 'sown'/g, "provider: 'soumtok'"],
    [/SownStudio/g, 'SoumtokStudio'],
    [/exposeInMainWorld\('sown'/g, "exposeInMainWorld('soumtok'"),
    [/window\.sown/g, 'window.soumtok'],
    [/function sownApi/g, 'function soumtokApi'],
    [/name: 'sown-api'/g, "name: 'soumtok-api'"],
    [/\bsownApi\b/g, 'soumtokApi'],
    [/"name": "sown"/g, '"name": "soumtok"'],
    [/\bSown\b/g, 'Soumtok'],
    [/\bSOWN\b/g, 'SOUMTOK'],
  ]
  for (const [re, rep] of rules) s = s.replace(re, rep)
  return s
}

let changed = 0
for (const file of walk(root)) {
  if (file.includes('rebrand-to-soumtok.mjs') || file.includes('rebrand-to-sown.mjs')) continue
  const before = readFileSync(file, 'utf8')
  const after = transform(before)
  if (after !== before) {
    writeFileSync(file, after, 'utf8')
    changed += 1
  }
}
console.log(`Updated ${changed} files`)
