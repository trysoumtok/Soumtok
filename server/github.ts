import type { Hono } from 'hono'
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import nodePath from 'node:path'
import { githubAppInstallUrl } from '../shared/githubApp.ts'
import { isSecretPath } from '../shared/secretsGuard.ts'
import { pool } from './db.ts'
import { env } from './env.ts'
import { decryptSecret } from './secrets.ts'
import { spawnOnce } from './sandbox.ts'

type ReadyFn = (c: { req: { raw: Request } }) => Promise<{
  session: { user: { id: string } } | null
  ready: boolean
}>

type GithubRepo = {
  id: number
  name: string
  full_name: string
  private: boolean
  html_url: string
  description: string | null
  language: string | null
  updated_at: string
}

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Soumtok',
  }
}

async function githubToken(userId: string) {
  const result = await pool!.query(
    `SELECT "accessToken" AS token, "accountId" AS account_id
     FROM account
     WHERE "userId" = $1 AND "providerId" = 'github'
     LIMIT 1`,
    [userId],
  )
  const row = result.rows[0] as { token?: string; account_id?: string } | undefined
  return { token: row?.token || '', accountId: row?.account_id || '' }
}

async function githubJson<T>(url: string, token: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { ...ghHeaders(token), ...((init?.headers as Record<string, string>) || {}) },
  })
  const data = (await res.json()) as T
  return { ok: res.ok, status: res.status, data }
}

async function listUserRepos(token: string) {
  const repos: GithubRepo[] = []
  for (let page = 1; page <= 10; page++) {
    const { ok, status, data } = await githubJson<GithubRepo[] | { message?: string }>(
      `https://api.github.com/user/repos?per_page=100&page=${page}&affiliation=owner,collaborator,organization_member&sort=updated&visibility=all`,
      token,
    )
    if (status === 401 || status === 403) return { repos, expired: true as const }
    if (!ok || !Array.isArray(data)) break
    repos.push(...data)
    if (data.length < 100) break
  }
  return { repos, expired: false as const }
}

async function listPagedRepos(token: string, urlForPage: (page: number) => string) {
  const repos: GithubRepo[] = []
  for (let page = 1; page <= 10; page++) {
    const { ok, data } = await githubJson<GithubRepo[] | { repositories?: GithubRepo[] }>(urlForPage(page), token)
    if (!ok) break
    const batch = Array.isArray(data) ? data : data.repositories || []
    repos.push(...batch)
    if (batch.length < 100) break
  }
  return repos
}

async function listInstallationRepos(token: string) {
  const installs = await githubJson<{ installations?: { id: number }[] }>(
    'https://api.github.com/user/installations?per_page=100',
    token,
  )
  const list = installs.ok ? installs.data.installations || [] : []
  const repos: GithubRepo[] = []
  for (const install of list) {
    repos.push(
      ...(await listPagedRepos(
        token,
        (page) => `https://api.github.com/user/installations/${install.id}/repositories?per_page=100&page=${page}`,
      )),
    )
  }
  return repos
}

async function listOrgRepos(token: string) {
  const orgs = await githubJson<{ login?: string }[]>('https://api.github.com/user/orgs?per_page=100', token)
  const list = orgs.ok && Array.isArray(orgs.data) ? orgs.data : []
  const repos: GithubRepo[] = []
  for (const org of list) {
    if (!org.login) continue
    repos.push(
      ...(await listPagedRepos(
        token,
        (page) => `https://api.github.com/orgs/${encodeURIComponent(org.login!)}/repos?per_page=100&page=${page}&type=all&sort=updated`,
      )),
    )
  }
  return repos
}

function uniqueRepos(repos: GithubRepo[]) {
  const seen = new Set<number>()
  return repos.filter((repo) => {
    if (seen.has(repo.id)) return false
    seen.add(repo.id)
    return true
  })
}

export async function syncGithubProfile(userId: string) {
  const { token, accountId } = await githubToken(userId)
  if (!token) {
    return { connected: false, login: null as string | null, token: '' }
  }

  const me = await githubJson<{ login?: string; id?: number }>('https://api.github.com/user', token)
  if (me.status === 401 || me.status === 403) {
    return { connected: true, expired: true, login: null as string | null, token }
  }
  const login = me.ok ? me.data.login || null : null
  await pool!.query(
    `UPDATE profiles
     SET github_id = COALESCE($2, github_id),
         github_login = COALESCE($3, github_login),
         updated_at = NOW()
     WHERE user_id = $1`,
    [userId, accountId || (me.data.id ? String(me.data.id) : null), login],
  )
  return { connected: true, expired: false, login, token }
}

export async function githubAccessToken(userId: string) {
  const { token } = await githubToken(userId)
  if (token) return token
  if (!pool) return ''
  const stored = await pool.query(
    `SELECT token_ciphertext
     FROM user_connectors
     WHERE user_id = $1
       AND token_ciphertext IS NOT NULL
       AND (plugin_id = 'github' OR mcp_url ILIKE '%github%')
     ORDER BY updated_at DESC
     LIMIT 1`,
    [userId],
  )
  const cipher = stored.rows[0]?.token_ciphertext as string | undefined
  if (!cipher) return ''
  try {
    return decryptSecret(cipher)
  } catch {
    return ''
  }
}

const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|coverage|\.next|vendor)(\/|$)/
const SKIP_FILE = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|eot|pdf|zip|gz|exe|dll|bin|map|lock)$/i

export function normalizeRepoName(fullName: string) {
  const repo = fullName.trim().replace(/^https?:\/\/github.com\//i, '').replace(/\.git$/, '')
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('Use owner/name')
  return repo
}

export function gitTreeFromFiles(files: Record<string, string>) {
  return Object.entries(files)
    .filter(([path, content]) => typeof content === 'string' && path && !isSecretPath(path) && !SKIP_DIR.test(path) && !SKIP_FILE.test(path))
    .slice(0, 200)
    .map(([path, content]) => ({
      path: path.replace(/\\/g, '/').replace(/^\/+/, ''),
      mode: '100644' as const,
      type: 'blob' as const,
      content: content.slice(0, 120_000),
    }))
    .filter((item) => item.path && !item.path.split('/').includes('..'))
}

export async function commitRepoFiles(
  userId: string,
  fullName: string,
  message: string,
  files: Record<string, string>,
  opts?: { branch?: string; newBranch?: string },
) {
  const token = await githubAccessToken(userId)
  if (!token) throw new Error('Connect GitHub first')
  const repo = normalizeRepoName(fullName)
  const tree = gitTreeFromFiles(files)
  if (tree.length === 0) throw new Error('No files to commit')
  const meta = await githubJson<{ default_branch?: string; message?: string }>(`https://api.github.com/repos/${repo}`, token)
  if (!meta.ok) throw new Error(meta.data.message || 'Could not open that repository')
  const base = opts?.branch || meta.data.default_branch || 'main'
  const ref = await githubJson<{ object?: { sha?: string }; message?: string }>(
    `https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(base)}`,
    token,
  )
  if (!ref.ok || !ref.data.object?.sha) throw new Error(ref.data.message || `Could not read ${base}`)
  const parent = ref.data.object.sha
  const head = await githubJson<{ tree?: { sha?: string }; message?: string }>(
    `https://api.github.com/repos/${repo}/git/commits/${parent}`,
    token,
  )
  if (!head.ok || !head.data.tree?.sha) throw new Error(head.data.message || 'Could not read HEAD')
  const made = await githubJson<{ sha?: string; message?: string }>(`https://api.github.com/repos/${repo}/git/trees`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_tree: head.data.tree.sha, tree }),
  })
  if (!made.ok || !made.data.sha) throw new Error(made.data.message || 'Could not write the tree')
  const commit = await githubJson<{ sha?: string; html_url?: string; message?: string }>(
    `https://api.github.com/repos/${repo}/git/commits`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message.trim().slice(0, 200) || 'Update from Studio', tree: made.data.sha, parents: [parent] }),
    },
  )
  if (!commit.ok || !commit.data.sha) throw new Error(commit.data.message || 'Could not create the commit')
  const branch = opts?.newBranch || base
  if (opts?.newBranch) {
    const created = await githubJson<{ message?: string }>(`https://api.github.com/repos/${repo}/git/refs`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${opts.newBranch}`, sha: commit.data.sha }),
    })
    if (!created.ok) throw new Error(created.data.message || 'Could not create the branch')
  } else {
    const patched = await githubJson<{ message?: string }>(
      `https://api.github.com/repos/${repo}/git/refs/heads/${encodeURIComponent(base)}`,
      token,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha: commit.data.sha }),
      },
    )
    if (!patched.ok) throw new Error(patched.data.message || 'Could not update the branch')
  }
  return {
    fullName: repo,
    branch,
    sha: commit.data.sha,
    url: commit.data.html_url || `https://github.com/${repo}/commit/${commit.data.sha}`,
    count: tree.length,
  }
}

export async function openPullRequest(userId: string, fullName: string, title: string, files: Record<string, string>, body = '') {
  const repo = normalizeRepoName(fullName)
  const token = await githubAccessToken(userId)
  if (!token) throw new Error('Connect GitHub first')
  const meta = await githubJson<{ default_branch?: string; message?: string }>(`https://api.github.com/repos/${repo}`, token)
  if (!meta.ok) throw new Error(meta.data.message || 'Could not open that repository')
  const base = meta.data.default_branch || 'main'
  const branch = `soumtok/${Date.now().toString(36)}`
  const committed = await commitRepoFiles(userId, repo, title, files, { branch: base, newBranch: branch })
  const pull = await githubJson<{ html_url?: string; number?: number; message?: string }>(
    `https://api.github.com/repos/${repo}/pulls`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim().slice(0, 120) || 'Studio changes', head: branch, base, body: body.slice(0, 4000) }),
    },
  )
  if (!pull.ok) throw new Error(pull.data.message || 'Could not open the pull request')
  return {
    ...committed,
    number: pull.data.number,
    prUrl: pull.data.html_url || `https://github.com/${repo}/pull/${pull.data.number}`,
    base,
  }
}

export async function fetchRepoSnapshot(userId: string, fullName: string) {
  const token = await githubAccessToken(userId)
  if (!token) throw new Error('Connect GitHub first')
  const repo = normalizeRepoName(fullName)
  try {
    return await gitCloneSnapshot(token, repo)
  } catch {
    return contentsApiSnapshot(token, repo)
  }
}

async function gitCloneSnapshot(token: string, repo: string) {
  const root = await mkdtemp(nodePath.join(tmpdir(), 'soumtok-clone-'))
  const dest = nodePath.join(root, 'repo')
  const env: Record<string, string> = {
    PATH: process.env.PATH || '',
    LANG: 'C',
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.extraHeader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: bearer ${token}`,
  }
  if (process.platform === 'win32') {
    env.SYSTEMROOT = process.env.SYSTEMROOT || 'C:\\Windows'
    env.WINDIR = process.env.WINDIR || 'C:\\Windows'
  }
  try {
    const cloned = await spawnOnce(
      'git',
      ['clone', '--depth', '1', '--single-branch', `https://github.com/${repo}.git`, dest],
      root,
      { env, timeoutMs: 90_000 },
    )
    if (!cloned.ok) throw new Error('git clone failed')
    const branchOut = await spawnOnce('git', ['rev-parse', '--abbrev-ref', 'HEAD'], dest, { env, timeoutMs: 10_000 })
    const files = await collectTextFiles(dest)
    const count = Object.keys(files).length
    return {
      fullName: repo,
      branch: branchOut.text.trim() || 'HEAD',
      files,
      truncated: count >= 200,
      count,
    }
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function collectTextFiles(root: string, rel = '', bag: Record<string, string> = {}) {
  if (Object.keys(bag).length >= 200) return bag
  const entries = await readdir(nodePath.join(root, rel), { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (Object.keys(bag).length >= 200) break
    const relPath = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.name === '.git' || SKIP_DIR.test(relPath.replaceAll('\\', '/'))) continue
    if (entry.isDirectory()) {
      await collectTextFiles(root, relPath, bag)
      continue
    }
    const posix = relPath.replaceAll('\\', '/')
    if (SKIP_FILE.test(posix) || isSecretPath(posix)) continue
    const full = nodePath.join(root, relPath)
    const info = await stat(full).catch(() => null)
    if (!info || info.size > 120_000) continue
    const buf = await readFile(full)
    if (buf.includes(0)) continue
    bag[posix] = buf.toString('utf8').slice(0, 120_000)
  }
  return bag
}

async function contentsApiSnapshot(token: string, repo: string) {
  const meta = await githubJson<{ default_branch?: string; message?: string }>(`https://api.github.com/repos/${repo}`, token)
  if (!meta.ok) throw new Error(meta.data.message || 'Could not open that repository')
  const branch = meta.data.default_branch || 'main'
  const tree = await githubJson<{ tree?: { path?: string; type?: string; size?: number }[]; truncated?: boolean }>(
    `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    token,
  )
  if (!tree.ok) throw new Error('Could not read the repository tree')
  const blobs = (tree.data.tree || [])
    .filter((item) => item.type === 'blob' && item.path && !SKIP_DIR.test(item.path) && !SKIP_FILE.test(item.path))
    .filter((item) => (item.size || 0) < 120_000)
    .slice(0, 200)
  const files: Record<string, string> = {}
  const queue = [...blobs]
  async function pull() {
    while (queue.length) {
      const blob = queue.shift()
      if (!blob?.path) continue
      const filePath = blob.path
      const body = await githubJson<{ content?: string; encoding?: string; message?: string }>(
        `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(filePath).replaceAll('%2F', '/')}?ref=${encodeURIComponent(branch)}`,
        token,
      )
      if (!body.ok || !body.data.content) continue
      const raw = body.data.encoding === 'base64' ? Buffer.from(body.data.content, 'base64').toString('utf8') : body.data.content
      if (/[\u0000-\u0008]/.test(raw)) continue
      files[filePath] = raw.slice(0, 120_000)
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, blobs.length) }, () => pull()))
  return {
    fullName: repo,
    branch,
    files,
    truncated: Boolean(tree.data.truncated) || (tree.data.tree || []).length > blobs.length,
    count: Object.keys(files).length,
  }
}

export function registerGithub(app: Hono, requireReadyUser: ReadyFn) {
  app.get('/api/github/repos', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const synced = await syncGithubProfile(session.user.id)
    if (!synced.token) {
      return c.json({
        connected: false,
        login: null,
        repos: [],
        installUrl: githubAppInstallUrl(env.githubAppSlug),
        reconnectUrl: `https://github.com/settings/connections/applications/${env.githubClientId}`,
      })
    }

    if (synced.expired) {
      return c.json({
        connected: true,
        expired: true,
        login: synced.login,
        repos: [],
        installUrl: githubAppInstallUrl(env.githubAppSlug),
        reconnectUrl: `https://github.com/settings/connections/applications/${env.githubClientId}`,
      })
    }

    const fromUser = await listUserRepos(synced.token)
    if (fromUser.expired) {
      return c.json({
        connected: true,
        expired: true,
        login: synced.login,
        repos: [],
        installUrl: githubAppInstallUrl(env.githubAppSlug),
        reconnectUrl: `https://github.com/settings/connections/applications/${env.githubClientId}`,
      })
    }
    const [fromInstall, fromOrgs] = await Promise.all([
      listInstallationRepos(synced.token),
      listOrgRepos(synced.token),
    ])
    const repos = uniqueRepos([...fromUser.repos, ...fromInstall, ...fromOrgs]).sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at),
    )

    return c.json({
      connected: true,
      expired: false,
      login: synced.login,
      repos: repos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        url: repo.html_url,
        description: repo.description,
        language: repo.language,
        updatedAt: repo.updated_at,
      })),
      installUrl: githubAppInstallUrl(env.githubAppSlug),
    })
  })

  app.get('/api/github/tree', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const repo = c.req.query('repo') || ''
    try {
      const snapshot = await fetchRepoSnapshot(session.user.id, repo)
      return c.json(snapshot)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Could not clone' }, 400)
    }
  })

  app.post('/api/github/commit', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{ repo?: string; message?: string; files?: Record<string, string> }>()
    try {
      const committed = await commitRepoFiles(session.user.id, body.repo || '', body.message || '', body.files || {})
      return c.json(committed)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Could not commit' }, 400)
    }
  })

  app.post('/api/github/pull', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{ repo?: string; title?: string; body?: string; files?: Record<string, string> }>()
    try {
      const pull = await openPullRequest(session.user.id, body.repo || '', body.title || '', body.files || {}, body.body || '')
      return c.json(pull)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Could not open a pull request' }, 400)
    }
  })
}
