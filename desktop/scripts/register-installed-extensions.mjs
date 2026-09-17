import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

const root = path.join(os.homedir(), '.soumtok', 'ide', 'users', 'f73d3ef549a2c590', 'extensions')
try {
  fs.unlinkSync(path.join(root, '.obsolete'))
} catch {
  /* absent */
}

const scanner = []
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const dir = path.join(root, entry.name)
  let pkg
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  } catch {
    continue
  }
  if (!pkg.name || !pkg.publisher) continue
  const href = pathToFileURL(dir).href
  scanner.push({
    identifier: { id: `${pkg.publisher}.${pkg.name}`.toLowerCase() },
    version: pkg.version,
    location: {
      $mid: 1,
      fsPath: dir,
      _sep: 1,
      external: href,
      path: `/${dir.replace(/\\/g, '/')}`,
      scheme: 'file',
    },
    relativeLocation: entry.name,
    metadata: {
      isApplicationScoped: false,
      isMachineScoped: false,
      isBuiltin: false,
      installedTimestamp: Date.now(),
      pinned: false,
      source: 'vsix',
    },
  })
}
fs.writeFileSync(path.join(root, 'extensions.json'), `${JSON.stringify(scanner)}\n`)
console.log(scanner.map((s) => `${s.identifier.id}@${s.version}`).join('\n'))
console.log('obsolete exists', fs.existsSync(path.join(root, '.obsolete')))
