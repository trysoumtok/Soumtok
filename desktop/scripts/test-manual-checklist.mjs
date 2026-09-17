#!/usr/bin/env node
/**
 * Automated version of the manual QA checklist (plan gate, ask card, explorer,
 * TS diagnostics, Tab completions, inline diff bar, mode picker).
 * Run: node desktop/scripts/test-manual-checklist.mjs
 */
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const desktopRoot = path.join(__dirname, '..')

const {
  runOneToolCall,
  resolveAskReply,
  formatAskReply,
  isWriteBlockedInUiMode,
} = require('../src/main/agentHarness.js')
const { runEditorAiAssist } = require('../src/main/inlineEditorAi.js')

const workbench = fs.readFileSync(path.join(desktopRoot, 'src/renderer/workbench.js'), 'utf8')
const css = fs.readFileSync(path.join(desktopRoot, 'src/renderer/workbench.css'), 'utf8')
const indexHtml = fs.readFileSync(path.join(desktopRoot, 'src/renderer/index.html'), 'utf8')
const monacoLang = fs.readFileSync(path.join(desktopRoot, 'src/renderer/monacoLanguages.js'), 'utf8')

let failed = 0
function ok(cond, label) {
  if (cond) console.log('✔', label)
  else {
    failed += 1
    console.error('✘', label)
  }
}

function filterExplorerTree(nodes, query, folder) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return nodes
  const walk = (list, rootPath) => {
    const out = []
    for (const node of list || []) {
      const branchRoot = node.workspaceRoot ? node.path : rootPath
      if (node.type === 'file') {
        const name = String(node.name || '').toLowerCase()
        const p = String(node.path || '').replace(/\\/g, '/').toLowerCase()
        const r = String(branchRoot || '').replace(/\\/g, '/').toLowerCase()
        const rel = r && p.startsWith(r) ? p.slice(r.length).replace(/^\//, '') : p
        if (name.includes(q) || rel.includes(q)) out.push(node)
        continue
      }
      const children = walk(node.children || [], branchRoot)
      const name = String(node.name || '').toLowerCase()
      const p = String(node.path || '').replace(/\\/g, '/').toLowerCase()
      const r = String(branchRoot || '').replace(/\\/g, '/').toLowerCase()
      const rel = r && p.startsWith(r) ? p.slice(r.length).replace(/^\//, '') : p
      const nameHit = name.includes(q) || rel.includes(q)
      if (nameHit || children.length) {
        out.push({ ...node, children: nameHit ? node.children || [] : children })
      }
    }
    return out
  }
  return walk(nodes, folder)
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-qa-'))
const prefs = { localToolsEnabled: true, runMode: 'run-everything' }

try {
  fs.writeFileSync(path.join(tmpDir, 'sample.ts'), 'export const n: number = 1\n', 'utf8')

  // 1) Plan mode blocks write
  {
    const work = []
    const events = []
    const r = await runOneToolCall(
      { id: 'w1', name: 'write', arguments: JSON.stringify({ path: 'sample.ts', content: 'x' }) },
      tmpDir,
      prefs,
      work,
      (ev) => events.push(ev),
      null,
      { parentMode: 'plan' },
    )
    ok(r.blocked === true, 'plan mode blocks write tool')
    ok(
      events.some((e) => e.type === 'result' && /blocked in plan mode/i.test(e.text || '')),
      'plan block message is clear',
    )
    ok(isWriteBlockedInUiMode('plan', 'write'), 'plan write gate helper')
    ok(!isWriteBlockedInUiMode('plan', 'write', 'PLAN.md'), 'plan mode allows PLAN.md')
    ok(!isWriteBlockedInUiMode('plan', 'write', 'CANVAS.md'), 'plan mode allows CANVAS.md')
  }

  // 2) Ask question end-to-end
  {
    const work = []
    const events = []
    const questions = [{ id: 'pick', prompt: 'Continue?', options: [{ id: 'a', label: 'Yes' }] }]
    const askRun = runOneToolCall(
      {
        id: 'a1',
        name: 'ask_question',
        arguments: JSON.stringify({ title: 'Quick check', questions }),
      },
      tmpDir,
      prefs,
      work,
      (ev) => events.push(ev),
      null,
      { parentMode: 'agent' },
    )
    await new Promise((r) => setTimeout(r, 20))
    const askEv = events.find((e) => e.type === 'ask')
    ok(Boolean(askEv?.id), 'ask_question emits ask event')
    ok(resolveAskReply(askEv.id, { pick: ['Yes'] }), 'resolveAskReply accepts answers')
    const r = await askRun
    ok(r.ok === true, 'ask_question completes after submit')
    const toolMsg = work.find((m) => m.role === 'tool')
    ok(toolMsg?.content?.includes('Yes'), 'ask reply formatted for agent')
    ok(formatAskReply(questions, { pick: ['Yes'] }).includes('Yes'), 'formatAskReply text')
  }

  // 3) Ask card UI (done state + summary)
  ok(/function agentAskSummary/.test(workbench), 'ask card summary helper exists')
  ok(/is-done/.test(workbench) && /\.agent-ask-done/.test(css), 'ask card done state styled')
  ok(/agent-ask-opt:disabled/.test(css), 'ask options disable after submit')

  // 4) Explorer filter
  {
    const root = tmpDir.replace(/\\/g, '/')
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
    ]
    const hit = filterExplorerTree(tree, 'util', root)
    ok(hit.length === 1 && hit[0].children?.some((c) => c.name === 'util.ts'), 'explorer filter finds nested file')
    ok(/explorer-filter/.test(workbench) && /toggleExplorerFilter/.test(workbench), 'explorer filter wired in UI')
  }

  // 5) Inline diff bar placement
  ok(indexHtml.includes('id="editor-diff-bar"'), 'inline diff bar in editor column')
  ok(/editorDiff\.js/.test(indexHtml), 'editorDiff script loaded')

  // 6) Mode picker descriptions
  ok(/agent-mode-desc-pop/.test(workbench), 'mode picker has description popover')
  ok(/Read-only answers/.test(workbench) && /Evidence-first/.test(workbench), 'debug/ask/plan hints visible')

  // 7) Tab completions with related context
  {
    let capturedBody = null
    const mockApi = async (method, url, body) => {
      if (method === 'POST' && String(url).includes('/complete')) {
        capturedBody = body
        return { status: 200, data: { text: '42', model: 'deepseek-v4-flash' } }
      }
      return { status: 404, data: {} }
    }
    const tab = await runEditorAiAssist(mockApi, {
      kind: 'tab',
      model: 'deepseek-v4-flash',
      prefix: 'const answer = ',
      suffix: '\n',
      language: 'typescript',
      filePath: 'main.ts',
      folder: tmpDir,
      relatedSnippets: [{ path: 'util.ts', snippet: 'export function add(a,b){return a+b}' }],
      openFiles: ['main.ts', 'util.ts'],
    })
    ok(tab.ok && tab.text === '42', 'Tab completion returns model text')
    const userMsg = capturedBody?.messages?.find((m) => m.role === 'user')?.content || ''
    ok(/Other open files/.test(userMsg), 'Tab prompt includes related open files')
    ok(/util\.ts/.test(userMsg), 'Tab prompt names related file')
  }

  // 8) Monaco LSP bridge — source + headless Electron diagnostics
  ok(/setDiagnosticsOptions/.test(monacoLang), 'monacoLanguages enables diagnostics')
  ok(/applyWorkspaceTsconfig/.test(monacoLang), 'monacoLanguages reads tsconfig')
  const lspBridge = fs.readFileSync(path.join(desktopRoot, 'src/renderer/lspBridge.js'), 'utf8')
  ok(/SoumtokLspBridge/.test(lspBridge) && /preferExtensionLsp/.test(workbench), 'LSP bridge + pref wired')
  ok(/tabModel/.test(workbench) && /settings-tab-model|data-pref-select="tabModel"/.test(workbench), 'Tab model in settings')
  ok(/settings-check-updates/.test(workbench), 'Check for updates in settings')

  const electronCli = path.join(desktopRoot, 'node_modules/electron/cli.js')
  const monacoScript = path.join(__dirname, 'test-monaco-diagnostics.mjs')
  const monacoRun = spawnSync(process.execPath, [electronCli, monacoScript], {
    encoding: 'utf8',
    timeout: 45000,
    cwd: desktopRoot,
  })
  ok(monacoRun.status === 0, 'TS typo produces Monaco diagnostics (Electron)')
  if (monacoRun.status !== 0) {
    if (monacoRun.stdout) console.error(monacoRun.stdout.trim())
    if (monacoRun.stderr) console.error(monacoRun.stderr.trim())
  }
} catch (err) {
  failed += 1
  console.error('✘ checklist runner error', err?.message || err)
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}

if (failed) {
  console.error(`\n${failed} manual checklist test(s) failed`)
  process.exit(1)
}
console.log('OK manual checklist: plan gate, ask card, explorer, diff bar, modes, Tab, TS diagnostics')
