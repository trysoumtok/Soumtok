/**
 * Publish / push a local folder to GitHub via Soumtok OAuth or gh CLI.
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

function gitEnsureInitialCommit(folder, message) {
  const email = spawnSync('git', ['config', 'user.email'], { cwd: folder, encoding: 'utf8', windowsHide: true })
  if (!(email.stdout || '').trim()) {
    spawnSync('git', ['config', 'user.email', 'soumtok@users.noreply.github.com'], {
      cwd: folder,
      encoding: 'utf8',
      windowsHide: true,
    })
    spawnSync('git', ['config', 'user.name', 'Soumtok'], { cwd: folder, encoding: 'utf8', windowsHide: true })
  }
  const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: folder, encoding: 'utf8', windowsHide: true })
  if (dirty.status !== 0) return { error: (dirty.stderr || 'git status failed').trim() }
  if (!(dirty.stdout || '').trim()) {
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: folder, encoding: 'utf8', windowsHide: true })
    if (head.status === 0) return { ok: true }
  }
  const add = spawnSync('git', ['add', '-A'], { cwd: folder, encoding: 'utf8', windowsHide: true })
  if (add.status !== 0) return { error: (add.stderr || 'git add failed').trim() }
  const commitMsg = String(message || '').trim() || 'Initial commit'
  const commit = spawnSync('git', ['commit', '-m', commitMsg], { cwd: folder, encoding: 'utf8', windowsHide: true })
  if (commit.status !== 0) return { error: (commit.stderr || commit.stdout || 'Nothing to commit').trim() }
  return { ok: true }
}

function gitPushToRemote(folder, pushUrl, publicRemoteUrl) {
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: folder, encoding: 'utf8', windowsHide: true })
  let branchName = (branch.stdout || '').trim() || 'main'
  if (branchName === 'HEAD' || !branchName) {
    spawnSync('git', ['checkout', '-B', 'main'], { cwd: folder, encoding: 'utf8', windowsHide: true })
    branchName = 'main'
  }
  const remotes = spawnSync('git', ['remote'], { cwd: folder, encoding: 'utf8', windowsHide: true })
  const hasOrigin = (remotes.stdout || '').split('\n').some((line) => line.trim() === 'origin')
  const remoteCmd = hasOrigin
    ? spawnSync('git', ['remote', 'set-url', 'origin', pushUrl], { cwd: folder, encoding: 'utf8', windowsHide: true })
    : spawnSync('git', ['remote', 'add', 'origin', pushUrl], { cwd: folder, encoding: 'utf8', windowsHide: true })
  if (remoteCmd.status !== 0) {
    return { error: (remoteCmd.stderr || 'Could not set git remote').trim() }
  }
  const push = spawnSync('git', ['push', '-u', 'origin', branchName], {
    cwd: folder,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  if (push.status !== 0) {
    return { error: (push.stderr || push.stdout || 'git push failed').trim() }
  }
  if (publicRemoteUrl) {
    spawnSync('git', ['remote', 'set-url', 'origin', publicRemoteUrl], {
      cwd: folder,
      encoding: 'utf8',
      windowsHide: true,
    })
  }
  return { ok: true, branch: branchName }
}

function gitEnsureRepo(folder) {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: folder, encoding: 'utf8', windowsHide: true })
  if (top.status === 0) return { ok: true }
  const init = spawnSync('git', ['init'], { cwd: folder, encoding: 'utf8', windowsHide: true })
  if (init.status !== 0) return { error: (init.stderr || init.stdout || 'git init failed').trim() }
  return { ok: true }
}

function tryGhPublish(folder, name) {
  const ghAuth = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8', windowsHide: true })
  if (ghAuth.status !== 0) return null
  const create = spawnSync('gh', ['repo', 'create', name, '--source=.', '--private', '--push'], {
    cwd: folder,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (create.status !== 0) return null
  const remote = spawnSync('gh', ['repo', 'view', '--json', 'url,nameWithOwner'], { cwd: folder, encoding: 'utf8', windowsHide: true })
  let fullName = ''
  let htmlUrl = ''
  if (remote.status === 0 && remote.stdout) {
    try {
      const parsed = JSON.parse(remote.stdout)
      fullName = String(parsed.nameWithOwner || '')
      htmlUrl = String(parsed.url || '')
    } catch {
      /* ignore */
    }
  }
  return { ok: true, via: 'gh', fullName, htmlUrl }
}

/**
 * @param {{ folder: string, apiFetch: (method: string, path: string, body?: unknown, timeout?: number) => Promise<{ status: number, data?: Record<string, unknown> }>, name?: string, isPrivate?: boolean, message?: string, grantBaseUrl?: string, onOpenGrantUrl?: (url: string) => void }} opts
 */
async function publishFolderToGithub(opts) {
  const folder = path.resolve(String(opts.folder || ''))
  if (!folder || !fs.existsSync(folder)) return { ok: false, text: 'Open a folder first.' }

  const ensured = gitEnsureRepo(folder)
  if (ensured.error) return { ok: false, text: ensured.error }

  const name = String(opts.name || path.basename(folder))
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!name) return { ok: false, text: 'Pick a repository name.' }

  const gh = tryGhPublish(folder, name)
  if (gh?.ok) {
    return {
      ok: true,
      text: `Pushed to GitHub via gh CLI${gh.fullName ? `: ${gh.fullName}` : ''}${gh.htmlUrl ? `\n${gh.htmlUrl}` : ''}`,
      ...gh,
    }
  }

  if (typeof opts.apiFetch !== 'function') {
    return { ok: false, text: 'Sign in to Soumtok to publish to GitHub.' }
  }

  const repoRes = await opts.apiFetch(
    'POST',
    '/api/github/publish-repo',
    { name, private: opts.isPrivate !== false },
    45_000,
  )
  if (repoRes.status === 401) return { ok: false, text: 'Sign in to Soumtok first.' }
  if (repoRes.status === 403 && repoRes.data?.needsGithub) {
    const grant = String(repoRes.data.grantUrl || `${opts.grantBaseUrl || ''}/api/github/grant`)
    if (typeof opts.onOpenGrantUrl === 'function' && grant) opts.onOpenGrantUrl(grant)
    return {
      ok: false,
      needsGithub: true,
      grantUrl: grant,
      text: 'Connect GitHub in Soumtok (Settings → Connectors or Integrations), then retry publish.',
    }
  }
  if (repoRes.status !== 200 || !repoRes.data?.pushUrl) {
    return { ok: false, text: String(repoRes.data?.error || 'Could not create GitHub repository.') }
  }

  const commit = gitEnsureInitialCommit(folder, opts.message)
  if (commit.error) return { ok: false, text: commit.error }

  const fullName = String(repoRes.data.fullName || '')
  const pushed = gitPushToRemote(folder, String(repoRes.data.pushUrl), fullName ? `https://github.com/${fullName}.git` : '')
  if (pushed.error) return { ok: false, text: pushed.error }

  const htmlUrl = String(repoRes.data.htmlUrl || (fullName ? `https://github.com/${fullName}` : ''))
  return {
    ok: true,
    via: 'soumtok',
    fullName,
    htmlUrl,
    branch: pushed.branch,
    created: Boolean(repoRes.data.created),
    text: `Pushed to ${fullName || name} on branch ${pushed.branch}${htmlUrl ? `\n${htmlUrl}` : ''}`,
  }
}

module.exports = {
  gitEnsureInitialCommit,
  gitPushToRemote,
  gitEnsureRepo,
  publishFolderToGithub,
}
