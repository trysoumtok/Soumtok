/** Detects secrets in chat, files, and model output so they never ride along with a prompt. */

export type SecretKind =
  | 'api-key'
  | 'github'
  | 'aws'
  | 'google'
  | 'slack'
  | 'stripe'
  | 'jwt'
  | 'private-key'
  | 'password'
  | 'token'

export type SecretHit = { kind: SecretKind; start: number; end: number }

const PATTERNS: { kind: SecretKind; re: RegExp }[] = [
  { kind: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g },
  { kind: 'github', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g },
  { kind: 'github', re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { kind: 'aws', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'google', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'slack', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: 'slack', re: /\bhttps:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+\b/g },
  { kind: 'stripe', re: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { kind: 'jwt', re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { kind: 'token', re: /\bxai-[A-Za-z0-9]{20,}\b/g },
  { kind: 'token', re: /\bhf_[A-Za-z0-9]{20,}\b/g },
  { kind: 'token', re: /\br8_[A-Za-z0-9]{20,}\b/g },
  { kind: 'api-key', re: /\bsk-(?:ant-|proj-|soumtok-)?[A-Za-z0-9_-]{16,}\b/g },
  { kind: 'token', re: /\bBearer\s+[A-Za-z0-9._\-+=/]{16,}\b/gi },
  {
    kind: 'password',
    re: /(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key|client[_-]?secret|password)\s*[:=]\s*['"]?[^\s'"]{12,}/gi,
  },
]

const OFFERING =
  /\b(this is my api(?:\s+keys?)?|here(?:'s| is|’s) my (?:api |openai |anthropic |google |stripe )?(?:key|secret|token|password)|this is my (?:openai |anthropic |google |stripe )?(?:api )?key|use this (?:api |secret )?key|my (?:api |openai |anthropic )?key is|paste this key|don't paste (?:this |the )?(?:key|secret)|do not paste (?:this |the )?(?:key|secret))\b/i

const ASKING =
  /\b(where (do|should|can) i (put|add|save|store)[\s\S]{0,48}\b(?:api[- ]?keys?|secrets?|tokens?|passwords?)|how (do i|to) (add|put|save|store) (?:my |the |an )?(?:api |provider |openai |anthropic )?keys?|do not take them from chat)\b/i

const SECRET_PATH =
  /(^|\/)\.env($|\.)|(^|\/)\.envrc$|(^|\/)credentials(\.json)?$|(^|\/)id_rsa$|(^|\/)id_ed25519$|\.pem$|\.p12$|serviceAccount|secrets?\.(json|ya?ml)$/i

export const ENV_TEMPLATE = `# Secrets for this project. Paste values here — never in chat.
# This file is not sent to the model and is not saved to the server.

# OPENAI_API_KEY=
# ANTHROPIC_API_KEY=
# GOOGLE_AI_API_KEY=
# REPLICATE_API_TOKEN=
# STRIPE_SECRET_KEY=
`

export const ENV_EXAMPLE = `# Copy to .env and fill in locally. Do not commit real values.

# OPENAI_API_KEY=
# ANTHROPIC_API_KEY=
# GOOGLE_AI_API_KEY=
# REPLICATE_API_TOKEN=
# STRIPE_SECRET_KEY=
`

export function isSecretPath(path: string) {
  return SECRET_PATH.test(path.replace(/\\/g, '/'))
}

export function findSecrets(text: string): SecretHit[] {
  if (!text) return []
  const hits: SecretHit[] = []
  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0
    let match = re.exec(text)
    while (match) {
      const start = match.index
      const end = start + match[0].length
      if (end - start >= 12 && !hits.some((item) => item.start <= start && item.end >= end)) {
        hits.push({ kind, start, end })
      }
      if (match[0].length === 0) re.lastIndex += 1
      match = re.exec(text)
    }
  }
  return hits.sort((a, b) => a.start - b.start)
}

export function redactSecrets(text: string) {
  const hits = findSecrets(text)
  if (hits.length === 0) return text
  let out = ''
  let cursor = 0
  for (const hit of hits) {
    if (hit.start < cursor) continue
    out += text.slice(cursor, hit.start)
    out += `[redacted ${hit.kind}]`
    cursor = hit.end
  }
  return out + text.slice(cursor)
}

export function offeringSecret(text: string) {
  return OFFERING.test(text)
}

export function askingWhereToPutKey(text: string) {
  return ASKING.test(text)
}

export type SecretScan = {
  blocked: boolean
  offering: boolean
  asking: boolean
  hits: SecretHit[]
  kinds: SecretKind[]
}

export function scanSecrets(text: string, extra: string[] = []): SecretScan {
  const blob = [text, ...extra].filter(Boolean).join('\n')
  const hits = findSecrets(blob)
  const offering = offeringSecret(text)
  const asking = askingWhereToPutKey(text)
  const kinds = [...new Set(hits.map((item) => item.kind))]
  return {
    blocked: hits.length > 0 || offering || asking,
    offering,
    asking,
    hits,
    kinds,
  }
}

export function stripEnvValues(content: string) {
  return content
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return line
      const eq = line.indexOf('=')
      if (eq < 0) return line
      return `${line.slice(0, eq + 1)}`
    })
    .join('\n')
}

export function ensureEnvFiles(files: Record<string, string>) {
  const next = { ...files }
  if (!next['.env']) next['.env'] = ENV_TEMPLATE
  if (!next['.env.example']) next['.env.example'] = ENV_EXAMPLE
  const ignore = next['.gitignore'] || ''
  if (!/(^|\n)\.env(\n|$)/.test(ignore)) {
    next['.gitignore'] = `${ignore}${ignore && !ignore.endsWith('\n') ? '\n' : ''}.env\n.env.*\n!.env.example\n`
  }
  return next
}

/** Model-facing copy of workspace files: secret paths listed, values never included. */
export function filesForModel(files: Record<string, string>) {
  const out: Record<string, string> = {}
  for (const [path, content] of Object.entries(files)) {
    if (isSecretPath(path)) {
      out[path] = '# [redacted — values live in this file on your machine, not in the model context]'
      continue
    }
    out[path] = redactSecrets(content)
  }
  return out
}

/** If the model tried to write a real secret, keep the structure and drop the value. */
export function sanitizeAgentFiles(files: Record<string, string>) {
  const out: Record<string, string> = {}
  for (const [path, content] of Object.entries(files)) {
    if (isSecretPath(path) && !path.endsWith('.example')) {
      out[path] = stripEnvValues(redactSecrets(content))
      continue
    }
    out[path] = redactSecrets(content)
  }
  return out
}

export function redactChatFiles<T extends { text?: string; analysis?: string; name?: string }>(files: T[] | undefined) {
  if (!files?.length) return files
  return files.map((file) => {
    const secretFile = file.name ? isSecretPath(file.name) : false
    return {
      ...file,
      text: secretFile ? undefined : file.text ? redactSecrets(file.text) : file.text,
      analysis: file.analysis ? redactSecrets(file.analysis) : file.analysis,
    }
  })
}

export function securityReply(scan: SecretScan) {
  if (scan.hits.length || scan.offering) {
    return 'No. Do not paste API keys, tokens, or passwords in chat. I opened `.env` — add them there. Model provider keys also go in Dashboard → Keys. I did not store what you pasted.'
  }
  return 'Do not put API keys in chat. I opened `.env` so you can add them there. Provider keys for Studio models go in Dashboard → Keys.'
}

export function securityEvent(scan: SecretScan): {
  kind: 'security'
  title: string
  text: string
  path: string
  keys: boolean
} {
  return {
    kind: 'security',
    title: scan.hits.length || scan.offering ? 'Keys stay out of chat' : 'Add keys in .env',
    text: securityReply(scan),
    path: '.env',
    keys: true,
  }
}
