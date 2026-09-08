import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileLookup } from '../shared/preview.ts'
import { isSecretPath } from '../shared/secretsGuard.ts'

const BLOCK =
  /[;&|<>`]|\$\(|&&|\|\||\brm\b|\bdel\b|\bformat\b|\bcurl\b|\bwget\b|\bssh\b|\bpowershell\b|\bcmd\b|\breg\b|\bnet\b|\binvoke-|\bstart\s+/i

const ALLOW_HEAD =
  /^(node|nodejs|python|python3|py|npm|npx|git|echo|ls|dir|type|cat|pwd|whoami|mkdir|md|touch)\b/i

const VIRTUAL = new Set(['ls', 'dir', 'pwd', 'whoami', 'echo', 'cat', 'type', 'mkdir', 'md', 'touch'])

export function isGitPushCommand(raw: string) {
  const command = raw.trim()
  if (!/^git\s+push\b/i.test(command)) return false
  if (/[;&|<>`]|\$\(|&&|\|\|/.test(command)) return false
  return true
}

export function parseSandboxCommand(raw: string) {
  const command = raw.trim().slice(0, 400)
  if (!command) return null
  if (isGitPushCommand(command)) return null
  if (BLOCK.test(command) && !/^echo\s/.test(command)) return null
  if (!ALLOW_HEAD.test(command)) return null
  const parts = command.split(/\s+/).filter(Boolean)
  const head = parts[0].toLowerCase()
  const sub = (parts[1] || '').toLowerCase()
  if (head === 'npm') {
    if (!['test', 'run', 'install', 'i', 'ci'].includes(sub)) return null
    if (sub === 'run' && !/^test$/i.test(parts[2] || '')) return null
    if (parts.includes('-g') || parts.includes('--global') || parts.includes('publish')) return null
  }
  if (head === 'npx' && !/^tsc$/i.test(parts[1] || '')) return null
  if (head === 'git' && !/^(status|log|diff|show|add|commit|clone)$/i.test(parts[1] || '')) return null
  if (head === 'git' && /^commit$/i.test(parts[1] || '') && !parts.some((part) => part === '-m' || part.startsWith('-m'))) {
    return null
  }
  if (head === 'git' && /^clone$/i.test(parts[1] || '')) return null
  return { command, parts, head, sub }
}

function binFor(head: string) {
  if (head === 'python3' || head === 'py') return process.platform === 'win32' ? 'py' : 'python3'
  if (head === 'nodejs') return 'node'
  return head
}

function sandboxEnv(root: string) {
  const env: Record<string, string> = {
    PATH: process.env.PATH || '',
    LANG: 'C',
    HOME: root,
    USERPROFILE: root,
    TEMP: root,
    TMP: root,
    TMPDIR: root,
    CI: '1',
    NO_UPDATE_NOTIFIER: '1',
    npm_config_cache: path.join(root, '.npm'),
    npm_config_ignore_scripts: 'true',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
  }
  if (process.platform === 'win32') {
    env.SYSTEMROOT = process.env.SYSTEMROOT || 'C:\\Windows'
    env.WINDIR = process.env.WINDIR || 'C:\\Windows'
    env.COMSPEC = process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe'
    env.PATHEXT = process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD'
  }
  return env
}

export function spawnOnce(
  bin: string,
  args: string[],
  cwd: string,
  opts?: { env?: Record<string, string>; timeoutMs?: number },
) {
  return new Promise<{ ok: boolean; text: string }>((resolve) => {
    const child = spawn(bin, args, {
      cwd,
      env: opts?.env || sandboxEnv(cwd),
      windowsHide: true,
    })
    let out = ''
    const take = (chunk: Buffer) => {
      out += chunk.toString('utf8')
      if (out.length > 24_000) out = out.slice(0, 24_000)
    }
    child.stdout?.on('data', take)
    child.stderr?.on('data', take)
    const timer = setTimeout(() => {
      child.kill()
      resolve({ ok: false, text: `${out}\n[sandbox timed out]` })
    }, opts?.timeoutMs || 20_000)
    child.on('error', (error: Error) => {
      clearTimeout(timer)
      resolve({ ok: false, text: error.message })
    })
    child.on('close', (code: number | null) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, text: out.trim() || `(exit ${code ?? 'null'})` })
    })
  })
}

export async function writeWorkspace(root: string, files: Record<string, string>) {
  for (const [filePath, content] of Object.entries(files)) {
    if (isSecretPath(filePath)) continue
    const full = path.join(root, filePath)
    await mkdir(path.dirname(full), { recursive: true })
    await writeFile(full, content, 'utf8')
  }
}

export async function createSandboxDir() {
  return mkdtemp(path.join(tmpdir(), 'soumtok-run-'))
}

export async function removeSandboxDir(root?: string) {
  if (!root) return
  await rm(root, { recursive: true, force: true }).catch(() => undefined)
}

export type SandboxCtx = {
  persistDir?: string
}

export async function runSandboxed(command: string, files: Record<string, string>, ctx: SandboxCtx = {}) {
  const parsed = parseSandboxCommand(command)
  if (!parsed) {
    if (isGitPushCommand(command)) {
      return { ok: false, text: 'git push is handled by the GitHub API. Attach a repo and try again.', persistDir: ctx.persistDir }
    }
    return {
      ok: false,
      text: 'That command is not allowed in the sandbox. Use node, python, npm install/ci/test, npx tsc, git status/log/diff/add/commit, ls, cat, mkdir, or echo.',
      persistDir: ctx.persistDir,
    }
  }
  if (VIRTUAL.has(parsed.head)) {
    return { ok: true, text: inMemory(parsed, files), persistDir: ctx.persistDir }
  }
  const root = ctx.persistDir || (await createSandboxDir())
  const owned = !ctx.persistDir
  try {
    await writeWorkspace(root, files)
    if (parsed.head === 'git') {
      await spawnOnce('git', ['init'], root)
      await spawnOnce('git', ['config', 'user.email', 'studio@soumtok.local'], root)
      await spawnOnce('git', ['config', 'user.name', 'Soumtok'], root)
      await spawnOnce('git', ['add', '-A'], root)
    }
    const npm = parsed.head === 'npm' && ['install', 'i', 'ci'].includes(parsed.sub)
    const output = await spawnOnce(binFor(parsed.head), parsed.parts.slice(1), root, {
      timeoutMs: npm ? 120_000 : 20_000,
    })
    return { ...output, persistDir: root }
  } finally {
    if (owned) await removeSandboxDir(root)
  }
}

function inMemory(parsed: { head: string; parts: string[]; command: string }, files: Record<string, string>) {
  if (parsed.head === 'pwd') return '/workspace'
  if (parsed.head === 'whoami') return 'sandbox'
  if (parsed.head === 'echo') return parsed.parts.slice(1).join(' ')
  if (parsed.head === 'mkdir' || parsed.head === 'md') {
    const name = parsed.parts.filter((part) => !part.startsWith('-'))[1] || 'folder'
    return `created ${name.replace(/\/+$/, '')}`
  }
  if (parsed.head === 'touch') {
    const name = parsed.parts.filter((part) => !part.startsWith('-'))[1] || ''
    return name ? `touched ${name}` : ''
  }
  if (parsed.head === 'ls' || parsed.head === 'dir') {
    return Object.keys(files).sort().join('\n') || '(empty)'
  }
  const file = parsed.parts.filter((part) => !part.startsWith('-'))[1]?.replace(/^\/+/, '') || ''
  if (!file) return 'cat: missing file'
  return fileLookup(files, file) || files[file] || `cat: ${file}: No such file`
}
