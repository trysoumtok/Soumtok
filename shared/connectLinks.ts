import { PLUGIN_CATALOG } from './plugins.ts'

export type LinkKind = 'auth' | 'github' | 'share' | 'mcp' | 'web'

export type ClassifiedLink = {
  url: string
  kind: LinkKind
  label: string
  provider?: string
}

const AUTH =
  /login|signin|sign-in|oauth|authorize|device|connect|auth|accountchooser|signup|register/i

export function classifyLink(raw: string): ClassifiedLink {
  const url = raw.replace(/[.,;]+$/, '')
  let host = ''
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return { url, kind: 'web', label: url }
  }
  const plugin = PLUGIN_CATALOG.find((item) => host.includes(item.id.replaceAll('-', '')) || host.includes(item.name.toLowerCase().replace(/\s+/g, '')))
  if (/github\.com$/i.test(host) || host.endsWith('.github.com')) {
    return {
      url,
      kind: AUTH.test(url) ? 'auth' : 'github',
      label: AUTH.test(url) ? 'Open GitHub' : host,
      provider: 'github',
    }
  }
  if (/\/connect\//i.test(url) || /login\/device/i.test(url) || AUTH.test(url)) {
    return {
      url,
      kind: 'auth',
      label: plugin ? `Connect ${plugin.name}` : host.includes('soumtok') ? 'Open Soumtok' : `Sign in at ${host}`,
      provider: plugin?.id,
    }
  }
  if (plugin || /mcp\./i.test(host)) {
    return { url, kind: 'mcp', label: plugin?.name || host, provider: plugin?.id }
  }
  if (/soumtok\.com|localhost/i.test(host)) {
    return { url, kind: 'share', label: host + new URL(url).pathname, provider: 'soumtok' }
  }
  return { url, kind: 'web', label: host + (new URL(url).pathname === '/' ? '' : new URL(url).pathname) }
}

export function splitTextWithLinks(text: string) {
  const parts: ({ type: 'text'; text: string } | { type: 'link'; link: ClassifiedLink })[] = []
  const re = /https?:\/\/[^\s<>"')\]]+/gi
  let last = 0
  let match = re.exec(text)
  while (match) {
    if (match.index > last) parts.push({ type: 'text', text: text.slice(last, match.index) })
    parts.push({ type: 'link', link: classifyLink(match[0]) })
    last = match.index + match[0].length
    match = re.exec(text)
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) })
  return parts
}

const ALIASES: Record<string, string[]> = {
  firebase: ['firebase', 'firestore'],
  github: ['github', 'gh'],
  neon: ['neon', 'lakebase'],
  supabase: ['supabase'],
  cloudflare: ['cloudflare', 'workers'],
  vercel: ['vercel'],
}

function escapeRe(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Whole-token match so "gh" does not fire inside "light" and "linear" does not fire inside "linear-gradient". */
export function mentionsCatalogName(text: string, name: string) {
  const token = name.toLowerCase().trim()
  if (!token) return false
  const body = escapeRe(token).replace(/\\ /g, '[\\s-]+')
  return new RegExp(`(^|[^a-z0-9-])${body}([^a-z0-9-]|$)`, 'i').test(text)
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function isConnectIntent(text: string) {
  return /\b(connect|sign in|signin|log in|login|authenticate|oauth|link my|authorize)\b/i.test(text)
}

export function wantsCatalogConnect(text: string) {
  return isConnectIntent(text) || /\b(use|with|add|enable)\b/i.test(text)
}

export function matchUnconnectedCatalog(prompt: string, connectedIds: string[]) {
  const have = new Set(connectedIds.map((id) => id.toLowerCase()))
  return PLUGIN_CATALOG.filter((item) => {
    if (have.has(item.id) || have.has(item.name.toLowerCase())) return false
    const names = [item.id, item.name, item.id.replaceAll('-', ' '), ...(ALIASES[item.id] || [])]
    return names.some((name) => mentionsCatalogName(prompt, name))
  }).slice(0, 4)
}

/** Start a connect card only when they asked to connect a catalog plugin — never on a normal edit like "add a light/dark toggle". */
export function catalogConnectTargets(
  text: string,
  connectedIds: string[],
  opts?: { codingFollowUp?: boolean },
) {
  if (opts?.codingFollowUp && !isConnectIntent(text)) return []
  if (!wantsCatalogConnect(text)) return []
  return matchUnconnectedCatalog(text, connectedIds)
}

export function normalizeUserCode(raw: string) {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

export function mintUserCode(bytes?: Uint8Array) {
  const src = bytes && bytes.length >= 8 ? bytes : crypto.getRandomValues(new Uint8Array(8))
  let raw = ''
  for (let i = 0; i < 8; i++) raw += CODE_ALPHABET[src[i]! % CODE_ALPHABET.length]
  return `${raw.slice(0, 4)}-${raw.slice(4)}`
}

export function formatUserCode(raw: string) {
  const clean = normalizeUserCode(raw).slice(0, 8)
  if (clean.length < 8) return raw.toUpperCase()
  return `${clean.slice(0, 4)}-${clean.slice(4)}`
}

export function linkChipClass(kind: LinkKind) {
  if (kind === 'auth') return 'border-[#f54e00]/50 bg-[#f54e00]/12 text-[#ffb089]'
  if (kind === 'github') return 'border-white/20 bg-white text-[#111110]'
  if (kind === 'share') return 'border-[#8cb4ff]/40 bg-[#8cb4ff]/12 text-[#b9d2ff]'
  if (kind === 'mcp') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
  return 'border-[#6ea8ff]/35 bg-[#6ea8ff]/10 text-[#9ec4ff]'
}
