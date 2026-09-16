/**
 * Smoke tests for desktop feature batch (grep, plan gate, ask_question, explorer filter).
 * Run: node desktop/scripts/test-desktop-features.mjs
 */
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
const { workspaceGrep, workspaceReplaceAll } = require('../src/main/desktopTools.js')
const {
  formatAskReply,
  resolveAskReply,
  isWriteBlockedInUiMode,
} = require('../src/main/agentHarness.js')

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  }
}

function nodeMatchesExplorerFilter(node, query, rootPath) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  const name = String(node.name || '').toLowerCase()
  const p = String(node.path || '').replace(/\\/g, '/').toLowerCase()
  const r = String(rootPath || '').replace(/\\/g, '/').toLowerCase()
  const rel = r && p.startsWith(r) ? p.slice(r.length).replace(/^\//, '') : p
  return name.includes(q) || rel.includes(q)
}

function filterExplorerTree(nodes, query, folder) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return nodes
  const walk = (list, rootPath) => {
    const out = []
    for (const node of list || []) {
      const branchRoot = node.workspaceRoot ? node.path : rootPath
      if (node.type === 'file') {
        if (nodeMatchesExplorerFilter(node, q, branchRoot)) out.push(node)
        continue
      }
      const children = walk(node.children || [], branchRoot)
      const nameHit = nodeMatchesExplorerFilter(node, q, branchRoot)
      if (nameHit || children.length) {
        out.push({ ...node, children: nameHit ? node.children || [] : children })
      }
    }
    return out
  }
  return walk(nodes, folder)
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-desk-'))
const root = tmpDir.replace(/\\/g, '/')
try {
  fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(tmpDir, 'src', 'app.js'), 'const TODO = 1\nexport function main() {}\n')
  fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# TODO fix docs\n')

  const grep = workspaceGrep(tmpDir, 'TODO')
  ok(grep.ok && grep.matches.length >= 2, `workspaceGrep found matches (${grep.matches?.length || 0})`)

  const rep = workspaceReplaceAll(tmpDir, 'TODO fix', 'DONE')
  ok(rep.ok && rep.replacements >= 1, 'workspaceReplaceAll replaces text')

  const after = fs.readFileSync(path.join(tmpDir, 'readme.md'), 'utf8')
  ok(after.includes('DONE') && !after.includes('TODO fix'), 'replace persisted to disk')

  ok(isWriteBlockedInUiMode('plan', 'write'), 'plan blocks write')
  ok(isWriteBlockedInUiMode('ask', 'diff'), 'ask blocks diff')
  ok(!isWriteBlockedInUiMode('agent', 'write'), 'agent allows write')
  ok(!isWriteBlockedInUiMode('debug', 'grep'), 'debug allows grep')

  const questions = [{ id: 'q1', prompt: 'Pick one', options: [{ id: 'a', label: 'Alpha' }] }]
  const formatted = formatAskReply(questions, { q1: ['Alpha'] })
  ok(formatted.includes('User answers:') && formatted.includes('Alpha'), 'formatAskReply')

  ok(!resolveAskReply('missing-id', { q1: ['x'] }), 'resolveAskReply ignores unknown id')

  const tree = [
    {
      name: 'src',
      type: 'dir',
      path: `${root}/src`,
      workspaceRoot: true,
      children: [
        { name: 'app.js', type: 'file', path: `${root}/src/app.js` },
        { name: 'util.ts', type: 'file', path: `${root}/src/util.ts` },
      ],
    },
    { name: 'readme.md', type: 'file', path: `${root}/readme.md` },
  ]
  const filtered = filterExplorerTree(tree, 'util', root)
  ok(filtered.length === 1 && filtered[0].name === 'src', 'explorer filter keeps parent dir')
  ok(
    (filtered[0].children || []).some((c) => c.name === 'util.ts'),
    'explorer filter matches nested file',
  )

  try {
    const { initAutoUpdater } = require('../src/main/autoUpdater.js')
    ok(typeof initAutoUpdater === 'function', 'autoUpdater module loads')
  } catch (err) {
    ok(false, `autoUpdater module loads (${err?.message || err})`)
  }
  try {
    const { startCrashReporter, CRASH_DIR } = require('../src/main/crashReporter.js')
    ok(typeof startCrashReporter === 'function' && CRASH_DIR, 'crashReporter module loads')
  } catch (err) {
    const msg = String(err?.message || err)
    ok(msg.includes('getPath') || msg.includes('electron'), `crashReporter needs Electron (${msg})`)
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}

if (failed) {
  console.error(`\n${failed} desktop feature test(s) failed`)
  process.exit(1)
}
console.log('OK desktop features: grep, replace, plan gate, ask, explorer filter, modules')
