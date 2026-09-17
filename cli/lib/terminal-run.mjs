import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { appendWorkspaceLog } = require('../../desktop/src/main/terminalLog.js')

/** Headless integrated terminal for CLI — feeds desktopTools terminal/read_terminal. */
export function createIntegratedTerminalRunner(root) {
  const jobs = new Map()

  function runCommand({ cwd, command }) {
    const dir = path.resolve(cwd || root || process.cwd())
    const cmd = String(command || '').trim()
    if (!cmd) return
    appendWorkspaceLog(dir, `\r\n\x1b[36m[soumtok cli]\x1b[0m $ ${cmd}\r\n`)

    const isLong =
      /^(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|serve|preview|watch)\b/i.test(cmd) ||
      /^(npm|pnpm|yarn|bun)\s+(install|i|ci)\b/i.test(cmd)

    if (isLong) {
      let child
      try {
        child =
          process.platform === 'win32'
            ? spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', cmd], {
                cwd: dir,
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
                env: { ...process.env, FORCE_COLOR: '0' },
              })
            : spawn(cmd, {
                shell: true,
                cwd: dir,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env, FORCE_COLOR: '0' },
              })
      } catch (err) {
        appendWorkspaceLog(dir, `\r\n${String(err.message || err)}\r\n`)
        return
      }
      const append = (buf) => appendWorkspaceLog(dir, buf.toString())
      child.stdout?.on('data', append)
      child.stderr?.on('data', append)
      jobs.set(dir, child)
      child.on('exit', (code) => {
        appendWorkspaceLog(dir, `\r\n[Process exited${code != null ? ` ${code}` : ''}]\r\n`)
        if (jobs.get(dir) === child) jobs.delete(dir)
      })
      return
    }

    try {
      const result =
        process.platform === 'win32'
          ? spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', cmd], {
              cwd: dir,
              encoding: 'utf8',
              windowsHide: true,
              timeout: 180_000,
              maxBuffer: 8 * 1024 * 1024,
            })
          : spawnSync(cmd, {
              shell: true,
              cwd: dir,
              encoding: 'utf8',
              windowsHide: true,
              timeout: 180_000,
              maxBuffer: 8 * 1024 * 1024,
            })
      const out = `${result.stdout || ''}${result.stderr || ''}`.slice(0, 32_000)
      if (out.trim()) appendWorkspaceLog(dir, out.endsWith('\n') ? out : `${out}\r\n`)
    } catch (err) {
      appendWorkspaceLog(dir, `\r\n${String(err.message || err)}\r\n`)
    }
  }

  return {
    onIntegratedTerminalRun: ({ cwd, command }) => runCommand({ cwd, command }),
    onTerminalMirror: ({ cwd, command, output }) => {
      const dir = path.resolve(cwd || root || process.cwd())
      appendWorkspaceLog(dir, `\r\n[mirror] $ ${command}\r\n${output || ''}\r\n`)
    },
    killAll() {
      for (const child of jobs.values()) {
        try {
          child.kill()
        } catch {
          /* ignore */
        }
      }
      jobs.clear()
    },
  }
}
