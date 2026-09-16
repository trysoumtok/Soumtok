/**
 * Start Vite on a fixed port and avoid stale servers + broken Chrome module cache.
 * Usage: node scripts/dev-server.mjs [--clean]
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.VITE_PORT || 5173)
const clean = process.argv.includes('--clean')

if (clean) {
  fs.rmSync(path.join(root, 'node_modules', '.vite'), { recursive: true, force: true })
  console.log('Cleared node_modules/.vite')
}

function freePortWin() {
  return new Promise((resolve) => {
    const ps = spawn(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$pids = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($p in $pids) { if ($p -and $p -ne $PID) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } }`,
      ],
      { stdio: 'ignore', cwd: root },
    )
    ps.on('exit', () => resolve())
    ps.on('error', () => resolve())
  })
}

async function main() {
  if (process.platform === 'win32') await freePortWin()
  const args = ['vite', '--port', String(port), '--strictPort']
  if (clean) args.push('--force')
  const child = spawn('npx', args, {
    stdio: 'inherit',
    cwd: root,
    shell: true,
    env: { ...process.env, VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true' },
  })
  child.on('exit', (code) => process.exit(code ?? 0))
}

main()
