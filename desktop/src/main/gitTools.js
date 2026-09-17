/**
 * Structured git for the agent — same facts as Cursor's SCM, without hoping the model types git flags.
 */
const { spawnSync } = require('child_process')

function runGit(root, args, timeout = 20_000) {
  return spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout,
    maxBuffer: 4 * 1024 * 1024,
  })
}

function gitOk(ran) {
  const out = `${ran.stdout || ''}${ran.stderr || ''}`.trim()
  if (ran.error) return { ok: false, text: ran.error.message || String(ran.error) }
  if (ran.status !== 0) return { ok: false, text: out || `git exited ${ran.status}` }
  return { ok: true, text: out || '(clean)' }
}

function gitSnapshot(root) {
  const top = runGit(root, ['rev-parse', '--show-toplevel'])
  if (top.status !== 0) {
    return { ok: true, text: 'Not a git repository. Use terminal("git init") only if the user asked to create one.' }
  }
  const branch = runGit(root, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const status = runGit(root, ['status', '--porcelain=v1', '-b'])
  const log = runGit(root, ['log', '-5', '--oneline'])
  const lines = [
    `repo: ${(top.stdout || '').trim()}`,
    `branch: ${(branch.stdout || '').trim() || 'HEAD'}`,
    'status:',
    (status.stdout || '').trim() || '(clean working tree)',
    'recent:',
    (log.stdout || '').trim() || '(no commits)',
  ]
  return { ok: true, text: lines.join('\n') }
}

function runGitTool(root, args) {
  const action = String(args.action || args.command || 'status').toLowerCase().replace(/^git\s+/, '')
  if (action === 'status' || action === 'st') return gitSnapshot(root)
  if (action === 'diff') {
    const pathHint = String(args.path || args.file || '').trim()
    const staged = args.staged === true || args.staged === 'true'
    const gitArgs = ['diff', '--stat', '-U3']
    if (staged) gitArgs.splice(1, 0, '--cached')
    if (pathHint) gitArgs.push('--', pathHint)
    const ran = runGit(root, gitArgs)
    return gitOk(ran)
  }
  if (action === 'log') {
    const max = Math.min(Number(args.max) || 12, 40)
    return gitOk(runGit(root, ['log', `-${max}`, '--oneline', '--decorate']))
  }
  if (action === 'branch') {
    return gitOk(runGit(root, ['branch', '-vv']))
  }
  if (action === 'show') {
    const rev = String(args.rev || args.commit || 'HEAD').trim()
    return gitOk(runGit(root, ['show', '--stat', '-U2', rev]))
  }
  if (action === 'commit') {
    const message = String(args.message || args.m || '').trim()
    if (!message) return { ok: false, text: 'git commit needs message. Only commit when the user asked.' }
    const add = runGit(root, ['add', '-A'])
    if (add.status !== 0) return gitOk(add)
    return gitOk(runGit(root, ['commit', '-m', message]))
  }
  if (action === 'push' || action === 'publish') {
    return {
      ok: false,
      text: 'Use git({ action: "push" }) or github({ action: "publish" }) — push is handled by Soumtok GitHub OAuth.',
    }
  }
  return {
    ok: false,
    text: `Unknown git action "${action}". Use status, diff, log, branch, show, commit, or push.`,
  }
}

module.exports = { runGitTool, gitSnapshot }
