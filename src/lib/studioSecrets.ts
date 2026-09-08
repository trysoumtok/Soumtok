import { isSecretPath, stripEnvValues } from '../../shared/secretsGuard'

const PREFIX = 'soumtok.studio.secrets:'

function keyFor(projectId: string) {
  return `${PREFIX}${projectId || 'draft'}`
}

export function loadLocalSecrets(projectId: string): Record<string, string> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(keyFor(projectId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    )
  } catch {
    return {}
  }
}

export function saveLocalSecrets(projectId: string, files: Record<string, string>) {
  if (typeof localStorage === 'undefined') return
  const next = { ...loadLocalSecrets(projectId), ...files }
  localStorage.setItem(keyFor(projectId), JSON.stringify(next))
  if (projectId && projectId !== 'draft') {
    const draft = loadLocalSecrets('draft')
    if (Object.keys(draft).length) {
      localStorage.setItem(keyFor(projectId), JSON.stringify({ ...draft, ...next }))
      localStorage.removeItem(keyFor('draft'))
    }
  }
}

export function hydrateSecretFiles(projectId: string, files: Record<string, string>) {
  return { ...files, ...loadLocalSecrets(projectId) }
}

/** Split workspace files so secret values stay on this machine. */
export function splitSecretFiles(files: Record<string, string>) {
  const safe: Record<string, string> = {}
  const secret: Record<string, string> = {}
  for (const [path, content] of Object.entries(files)) {
    if (isSecretPath(path) && !path.endsWith('.example')) {
      secret[path] = content
      safe[path] = stripEnvValues(content)
    } else {
      safe[path] = content
    }
  }
  return { safe, secret }
}
