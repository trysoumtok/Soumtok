import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const SOUMTOK_HOME = path.join(os.homedir(), '.soumtok')
export const CLI_DIR = path.join(SOUMTOK_HOME, 'cli')
export const CONFIG_PATH = path.join(CLI_DIR, 'config.json')
export const CREDENTIALS_PATH = path.join(SOUMTOK_HOME, 'credentials.json')
export const THREADS_DIR = path.join(CLI_DIR, 'threads')

const DEFAULTS = {
  api: 'https://soumtok.com',
  model: 'auto',
  subagentModel: 'auto',
  mode: 'agent',
  driver: 'ide',
  intelligence: 'balanced',
  runMode: 'run-everything',
  usageSummary: 'auto',
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

export function loadConfig() {
  ensureDir(CLI_DIR)
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveConfig(patch) {
  ensureDir(CLI_DIR)
  const next = { ...loadConfig(), ...patch }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n')
  return next
}

export function loadCredentials() {
  try {
    const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function saveCredentials(patch) {
  ensureDir(SOUMTOK_HOME)
  const next = { ...loadCredentials(), ...patch }
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(next, null, 2) + '\n')
  return next
}

export function resolveApiBase(override) {
  return (
    override ||
    process.env.SOUMTOK_API ||
    loadCredentials().api ||
    loadConfig().api ||
    DEFAULTS.api
  ).replace(/\/$/, '')
}

export function resolveAuth() {
  const envKey = process.env.SOUMTOK_API_KEY?.trim()
  if (envKey) return { kind: 'apiKey', value: envKey }
  const creds = loadCredentials()
  if (creds.apiKey?.trim()) return { kind: 'apiKey', value: creds.apiKey.trim() }
  if (creds.token?.trim()) return { kind: 'session', value: creds.token.trim() }
  return null
}

export function resolveCwd(flag) {
  const raw = flag || process.env.SOUMTOK_CWD || process.cwd()
  return path.resolve(raw)
}

export function threadPath(id) {
  ensureDir(THREADS_DIR)
  return path.join(THREADS_DIR, `${id}.json`)
}

export function loadThread(id) {
  try {
    return JSON.parse(fs.readFileSync(threadPath(id), 'utf8'))
  } catch {
    return { id, title: 'New chat', messages: [], updatedAt: Date.now() }
  }
}

export function saveThread(thread) {
  ensureDir(THREADS_DIR)
  const row = { ...thread, updatedAt: Date.now() }
  fs.writeFileSync(threadPath(thread.id), JSON.stringify(row, null, 2) + '\n')
  return row
}
