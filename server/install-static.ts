import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Hono } from 'hono'

const SCRIPTS = [
  'cli.ps1',
  'cli.sh',
  'cli-macos.sh',
  'cli-linux.sh',
] as const

async function readInstallScript(name: string) {
  const cwd = process.cwd()
  for (const base of ['dist/install', 'public/install']) {
    try {
      return await readFile(path.join(cwd, base, name), 'utf8')
    } catch {
      /* try next root */
    }
  }
  return null
}

export function registerInstallStatic(app: Hono) {
  for (const name of SCRIPTS) {
    app.get(`/install/${name}`, async (c) => {
      const body = await readInstallScript(name)
      if (!body) return c.text('Install script not found.', 404)
      return c.body(body, 200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      })
    })
  }
}
