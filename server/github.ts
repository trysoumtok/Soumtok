import type { Hono } from 'hono'
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import nodePath from 'node:path'
import {
  githubAppInstallUrl,
  githubOAuthConnectionsUrl,
  resolveGithubGrantReposUrl,
  type GithubGrantReposKind,
} from '../shared/githubApp.ts'
import { isBinaryWorkspaceFile, isImageDataUrl, isImageFilePath } from '../shared/preview.ts'
import { isSecretPath } from '../shared/secretsGuard.ts'
import { pool } from './db.ts'
import { env } from './env.ts'
import { decryptSecret } from './secrets.ts'
import { spawnOnce } from './sandbox.ts'

type ReadyFn = (c: { req: { raw: Request } }) => Promise<{
  session: { user: { id: string } } | null
  ready: boolean
}>

let githubAppInstallAvailable: boolean | null = null
let githubAppInstallCheckedAt = 0
const GITHUB_APP_CHECK_TTL_MS = 10 * 60_000

async function probeGithubAppInstall(slug: string) {
  const key = String(slug || '').trim()
  if (!key) return false
  const now = Date.now()
  if (githubAppInstallAvailable !== null && now - githubAppInstallCheckedAt < GITHUB_APP_CHECK_TTL_MS) {
    return githubAppInstallAvailable
  }
  try {
    const res = await fetch(githubAppInstallUrl(key), { method: 'GET', redirect: 'manual' })
    githubAppInstallAvailable = res.status !== 404
  } catch {
    githubAppInstallAvailable = false
  }
  githubAppInstallCheckedAt = now
  return githubAppInstallAvailable
}

async function grantReposLink() {
  const appOk = await probeGithubAppInstall(env.githubAppSlug)
  const resolved = resolveGithubGrantReposUrl({
    appSlug: env.githubAppSlug,
    clientId: env.githubClientId,
    appInstallAvailable: appOk,
  })
  return resolved
}

function githubReposPayload(extra: Record<string, unknown> = {}) {
  return grantReposLink().then(({ url, kind }) => ({
    installUrl: url,
    grantReposUrl: url,
    grantReposKind: kind as GithubGrantReposKind,
    reconnectUrl: githubOAuthConnectionsUrl(env.githubClientId),
    ...extra,
  }))
}

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
    .filter(([path, content]) => {
      if (typeof content !== 'string' || !path || isSecretPath(path) || SKIP_DIR.test(path)) return false
      const body = String(content)
      if (isImageDataUrl(body) || /^\/api\/studio\/images\//.test(body.trim())) return true
      return !SKIP_FILE.test(path)
    })
    .slice(0, 200)
    .flatMap(([path, content]) => {
      const normPath = path.replace(/\\/g, '/').replace(/^\/+/, '')
      if (!normPath || normPath.split('/').includes('..')) return []
      const body = String(content)
      if (/^\/api\/studio\/images\//.test(body.trim())) {
        return [
          {
            path: normPath,
            mode: '100644' as const,
            type: 'blob' as const,
            content: `# Soumtok-hosted image\n\nThis asset lives on Soumtok (${body.trim()}). Open Preview in Studio to export it, or regenerate the image in your repo.\n`,
          },
        ]
      }
      if (isImageDataUrl(body) && isImageFilePath(normPath)) {
        const match = /^data:[^;]+;base64,(.+)$/i.exec(body.trim())
        if (match?.[1]) {
          return [
            {
              path: normPath,
              mode: '100644' as const,
              type: 'blob' as const,
              content: match[1].replace(/\s+/g, ''),
              encoding: 'base64' as const,
            },
          ]
        }
      }
      if (isBinaryWorkspaceFile(normPath, body)) return []
      return [
        {
          path: normPath,
          mode: '100644' as const,
          type: 'blob' as const,
          content: body.slice(0, 120_000),
        },
      ]
    })
}

async function commitEmptyRepoFiles(
  token: string,
  repo: string,
  branch: string,
  message: string,
  tree: ReturnType<typeof gitTreeFromFiles>,
) {
  const made = await githubJson<{ sha?: string; message?: string }>(`https://api.github.com/repos/${repo}/git/trees`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tree }),
  })
  if (!made.ok || !made.data.sha) throw new Error(made.data.message || 'Could not write the tree')
  const commit = await githubJson<{ sha?: string; html_url?: string; message?: string }>(
    `https://api.github.com/repos/${repo}/git/commits`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message.trim().slice(0, 200) || 'Initial commit',
        tree: made.data.sha,
        parents: [],
      }),
    },
  )
  if (!commit.ok || !commit.data.sha) throw new Error(commit.data.message || 'Could not create the commit')
  const created = await githubJson<{ message?: string }>(`https://api.github.com/repos/${repo}/git/refs`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.data.sha }),
  })
  if (!created.ok) throw new Error(created.data.message || 'Could not create the branch')
  return {
    fullName: repo,
    branch,
    sha: commit.data.sha,
    url: commit.data.html_url || `https://github.com/${repo}/commit/${commit.data.sha}`,
    count: tree.length,
  }
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
  if (!ref.ok || !ref.data.object?.sha) {
    if (opts?.newBranch) throw new Error(ref.data.message || `Could not read ${base}`)
    return commitEmptyRepoFiles(token, repo, base, message, tree)
  }
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
  app.get('/api/github/grant', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    const origin = env.betterAuthUrl.replace(/\/$/, '')
    if (!session) {
      return c.redirect(`${origin}/dashboard/integrations`, 302)
    }
    if (!ready) {
      return c.redirect(`${origin}/dashboard/integrations?github=setup`, 302)
    }
    const { url } = await grantReposLink()
    return c.redirect(url, 302)
  })

  app.get('/api/github/repos', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const synced = await syncGithubProfile(session.user.id)
    if (!synced.token) {
      return c.json(
        await githubReposPayload({
          connected: false,
          login: null,
          repos: [],
        }),
      )
    }

    if (synced.expired) {
      return c.json(
        await githubReposPayload({
          connected: true,
          expired: true,
          login: synced.login,
          repos: [],
        }),
      )
    }

    const fromUser = await listUserRepos(synced.token)
    if (fromUser.expired) {
      return c.json(
        await githubReposPayload({
          connected: true,
          expired: true,
          login: synced.login,
          repos: [],
        }),
      )
    }
    const [fromInstall, fromOrgs] = await Promise.all([
      listInstallationRepos(synced.token),
      listOrgRepos(synced.token),
    ])
    const repos = uniqueRepos([...fromUser.repos, ...fromInstall, ...fromOrgs]).sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at),
    )

    return c.json(
      await githubReposPayload({
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
      }),
    )
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

  /** Create (or reuse) a GitHub repo for Desktop “Publish to GitHub”. Returns a one-time push URL. */
  app.post('/api/github/publish-repo', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    const body = await c.req.json<{
      name?: string
      private?: boolean
      description?: string
      message?: string
      files?: Record<string, string>
    }>()
    const name = String(body.name || '')
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
    if (!name || name.length < 1) return c.json({ error: 'Pick a repository name.' }, 400)

    const synced = await syncGithubProfile(session.user.id)
    if (!synced.token) {
      const { url } = await grantReposLink()
      return c.json({ error: 'Connect GitHub first.', grantUrl: url, needsGithub: true }, 403)
    }
    if (synced.expired) {
      return c.json({ error: 'GitHub sign-in expired. Reconnect in Integrations.', needsGithub: true }, 403)
    }

    const login = synced.login || ''
    if (!login) return c.json({ error: 'Could not read your GitHub username.' }, 400)

    let fullName = `${login}/${name}`
    let htmlUrl = `https://github.com/${fullName}`
    let created = false

    const existing = await githubJson<GithubRepo | { message?: string }>(
      `https://api.github.com/repos/${encodeURIComponent(login)}/${encodeURIComponent(name)}`,
      synced.token,
    )
    if (existing.ok && existing.data && 'full_name' in existing.data) {
      fullName = existing.data.full_name
      htmlUrl = existing.data.html_url
    } else {
      const made = await githubJson<GithubRepo | { message?: string }>('https://api.github.com/user/repos', synced.token, {
        method: 'POST',
        body: JSON.stringify({
          name,
          private: body.private !== false,
          description: body.description?.trim() || undefined,
          auto_init: false,
        }),
      })
      if (!made.ok || !made.data || !('full_name' in made.data)) {
        const message = (made.data as { message?: string })?.message || 'Could not create repository'
        return c.json({ error: message }, made.status >= 400 ? made.status : 400)
      }
      fullName = made.data.full_name
      htmlUrl = made.data.html_url
      created = true
    }

    const pushUrl = `https://x-access-token:${encodeURIComponent(synced.token)}@github.com/${fullName}.git`
    const fileBag = body.files && typeof body.files === 'object' ? body.files : null
    if (fileBag && Object.keys(fileBag).length > 0) {
      try {
        const committed = await commitRepoFiles(
          session.user.id,
          fullName,
          body.message || (created ? 'Initial commit from Soumtok' : 'Update from Soumtok'),
          fileBag,
        )
        return c.json({ fullName, htmlUrl, pushUrl, created, login, ...committed, pushed: true })
      } catch (error) {
        return c.json(
          {
            error: error instanceof Error ? error.message : 'Could not push files',
            fullName,
            htmlUrl,
            pushUrl,
            created,
            login,
          },
          400,
        )
      }
    }
    return c.json({ fullName, htmlUrl, pushUrl, created, login })
  })
}
