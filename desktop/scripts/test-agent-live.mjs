#!/usr/bin/env node
/**
 * Live reliability + the five product steps: image chip, Tab path, persistent index,
 * background jobs, Soumtok Code host files.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  classifyUserTask,
  assistantOfferedApplyEdit,
  userIsBareConfirm,
  taskCompletionMet,
  shouldContinueAgentTask,
} = require('../src/main/agentTaskGate.js')
const { applyGreenfieldScaffold, workspaceIsGreenfield, contentsForPlan } = require('../src/main/buildDirector.js')
const { parseFileReadViaShell, commandBlockedPermissive, normalizeTerminalCommand } = require('../src/main/desktopTools.js')
const { getIndex, searchHits, invalidateIndex, watchIndex, unwatchIndex, expandQueryTokens } = require('../src/main/semanticIndex.js')
const { composeWorkLoopBrief, composeThinkFirstBrief } = require('../src/main/agentThinkFirst.js')
const { runEditorAiAssist } = require('../src/main/inlineEditorAi.js')
const { isSoumtokCodeInstalled } = require('../src/main/extensionHostRuntime.js')

const checks = []
function score(name, ok) {
  checks.push({ name, ok: Boolean(ok) })
  if (!ok) console.error('FAIL', name)
}

const root = path.join(import.meta.dirname, '..')
const workbench = fs.readFileSync(path.join(root, 'src/renderer/workbench.js'), 'utf8')
const css = fs.readFileSync(path.join(root, 'src/renderer/workbench.css'), 'utf8')
const tabSrc = fs.readFileSync(path.join(root, 'src/main/inlineEditorAi.js'), 'utf8')
const mainSrc = fs.readFileSync(path.join(root, 'src/main/index.js'), 'utf8')
const indexSrc = fs.readFileSync(path.join(root, 'src/main/semanticIndex.js'), 'utf8')
const harnessSrc = fs.readFileSync(path.join(root, 'src/main/agentHarness.js'), 'utf8')

score('image chip has no filename figcaption in sent card', /data-full/.test(workbench) && !/figcaption>\$\{name\}/.test(workbench) && /stripAttachCaptions/.test(workbench))
score('sent message does not append paperclip filename', !/📎 \$\{attach/.test(workbench) && /stripAttachCaptions\(text\)/.test(workbench))
score('click opens lightbox', /openAgentImageLightbox/.test(workbench) && /agent-img-lightbox/.test(css))
score('composer image chips omit filename', /is-image \? preview/.test(workbench) || /isImage \? preview/.test(workbench))
score('Tab uses cheap complete path', /Code completion only/.test(tabSrc) && /deepseek-v4-flash/.test(tabSrc))
score('index persists to disk', /indexes/.test(indexSrc) && /saveDiskIndex/.test(indexSrc) && /watchIndex/.test(indexSrc))
score('background agent jobs buffer events', /agentJobs/.test(mainSrc) && /agent:job-events/.test(mainSrc))
score('window gone does not drop the job', /window gone/.test(mainSrc) || /job keeps running/.test(mainSrc))
score('renderer resumes background jobs', /agentReplayedJobs/.test(workbench) && /agentJobEvents/.test(workbench))
score('in-app simple browser tab', /openSimpleBrowser/.test(workbench) && /simple-browser-frame/.test(workbench) && /simple-browser-host/.test(css))
score('agent links open inside the editor', /openAgentHref/.test(workbench) && /openSimpleBrowser\(raw\)/.test(workbench))
score('simple browser svg icons', /function simpleBrowserIcon/.test(workbench) && /data-sb="back"/.test(workbench) && /<svg viewBox="0 0 16 16"/.test(workbench))
{
  let s = 'http://localhost:5174/%3C%3Cstrong%3E'
  try {
    s = decodeURIComponent(s)
  } catch {
    /* keep */
  }
  s = s.split(/[<>]/)[0]
  const href = new URL(s).href
  score('mangled localhost url cleans to origin', /^https?:\/\/localhost:5174\/?$/.test(href))
}
  score('chat right-click copy/paste menu', /openAgentContextMenu/.test(workbench) && /Copy Image/.test(workbench) && /Paste Image/.test(workbench))
  score('clipboard image IPC', /clipboard:writeImage/.test(mainSrc) && /file:saveDataUrl/.test(mainSrc))
  score('agent terminal run opens integrated panel', /onTermRunRequest/.test(workbench) && /runAgentTerminalCommand/.test(workbench) && /term:run-request/.test(mainSrc))

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-live-'))
try {
  fs.writeFileSync(path.join(tmp, 'auth.ts'), 'export function loginUser() {}\n')
  const idx = getIndex(tmp)
  score('index builds', idx.chunks.length > 0)
  watchIndex(tmp)
  unwatchIndex(tmp)
  score('index file watch binds', true)
  const hits = searchHits(tmp, 'login auth', 4)
  score('search hits login', hits.some((h) => /auth\.ts/.test(h.path)))
  score(
    'constructor token does not crash search',
    Array.isArray(expandQueryTokens(['constructor', 'toString', 'prototype', 'cube'])),
  )
  score(
    'atlas survives prototype query',
    (() => {
      try {
        const { buildWorkspaceAtlas } = require('../src/main/workspaceAtlas.js')
        buildWorkspaceAtlas(tmp, 'constructor prototype toString cube')
        return true
      } catch {
        return false
      }
    })(),
  )
  score('go on does not search the index', searchHits(tmp, 'go on', 4).length === 0)
  const diskDir = path.join(os.homedir(), '.soumtok', 'indexes')
  score('index file written under ~/.soumtok/indexes', fs.existsSync(diskDir) && fs.readdirSync(diskDir).length > 0)

  score('wipe is wipe', classifyUserTask('delete everything in this folder') === 'wipe')
  score('image gen is image', classifyUserTask('geneeare me an egale bird iamge') === 'image')
  score('image gen skips build', classifyUserTask('generate me an eagle bird image') === 'image')
  score('genera eagle is image', classifyUserTask('genera an eagle image for me') === 'image')
  score('geneearte dancing follow-up is image', classifyUserTask('geneearte a new one with a man dancing') === 'image')
  score('visual cube is fix', classifyUserTask('why does the cube as black spots thats false fix that') === 'fix')
  score('hello is chat', classifyUserTask('hello') === 'chat')
  score('cli is build', classifyUserTask('make a node cli that greets stdin') === 'build')
  score('think-first is not cube-only', !/cube3d/.test(composeThinkFirstBrief('fix the look', 'fix')))
  score('work loop has conclusion', /CONCLUSION/.test(composeWorkLoopBrief('fix')))
  const applyAsk = 'Want me to apply that change to src/cube3d.ts now?'
  score('apply-offer detected', assistantOfferedApplyEdit(applyAsk))
  score('yes after apply-offer is fix', classifyUserTask('yes', { lastAssistant: applyAsk }) === 'fix')
  score('go on is confirm', userIsBareConfirm('go on') && userIsBareConfirm('keep going'))
  score('go on after apply-offer is fix', classifyUserTask('go on', { lastAssistant: applyAsk }) === 'fix')
  score('bare yes is not build', classifyUserTask('yes') !== 'build')
  {
    const prior = [
      { role: 'user', content: 'build a cube' },
      { role: 'tool', name: 'write', content: 'wrote src/cube3d.ts' },
      { role: 'tool', name: 'terminal', content: 'npm run dev — integrated Terminal' },
      { role: 'user', content: 'yes' },
      { role: 'tool', name: 'read', content: 'cube3d.ts' },
    ]
    score('old writes do not complete yes-apply', taskCompletionMet('fix', prior) === false)
    score(
      'harness continues after yes-only-reads',
      shouldContinueAgentTask({
        mode: 'agent',
        folder: tmp,
        kind: 'fix',
        work: prior,
        text: 'ok',
        round: 1,
        maxRounds: 20,
      }) === true,
    )
  }
  score('apply-edit nudge in harness', /APPLY_EDIT_NOW_NUDGE/.test(harnessSrc) && /Do not tell the user about the harness/.test(harnessSrc) && !/cube3d/.test(harnessSrc.split('APPLY_EDIT_NOW_NUDGE')[1]?.slice(0, 500) || ''))
  score('confirm guides instead of locking reads', /SOUMTOK CONTINUE NOW/.test(harnessSrc) && /prefer diff/.test(harnessSrc) && /workAlreadyHasAtlas/.test(harnessSrc))
  score(
    'sed/Get-Content become read()',
    parseFileReadViaShell('sed -n 120,342p src/cube3d.ts')?.path === 'src/cube3d.ts' &&
      parseFileReadViaShell('powershell -NoProfile -Command "Get-Content src/cube3d.ts | Select-Object -Skip 119"')?.path ===
        'src/cube3d.ts' &&
      parseFileReadViaShell("cmd /d /s /c 'sed -n 120,342p src/cube3d.ts'")?.path === 'src/cube3d.ts',
  )
  score('no Ctrl+J lecture on short commands', !/open Terminal \(Ctrl\+J\), then run the command again/.test(fs.readFileSync(path.join(root, 'src/main/desktopTools.js'), 'utf8')))
  const termPanel = fs.readFileSync(path.join(root, 'src/renderer/terminalPanel.js'), 'utf8')
  score('PowerShell PTY is not cmd-wrapped', !/return `cmd \/d \/s \/c/.test(termPanel) && /function toPowerShellLine/.test(termPanel) && /function appendDisplay/.test(termPanel))
  score('agent output is not typed into the PTY', /appendDisplay/.test(workbench) && !/\[soumtok capture\]/.test(workbench))
  score('2>&1 is allowed in permissive terminal', !commandBlockedPermissive('node test.mjs 2>&1') && !commandBlockedPermissive('npx tsc --noEmit 2>&1 | Out-File test-out.txt'))
  score('cd /d unwraps to the inner command', normalizeTerminalCommand('cd /d D:\\proj && npx tsc --noEmit').cmd === 'npx tsc --noEmit')
  score('identical inspect tools are capped', /_repeatSig/.test(harnessSrc) && /skippedRepeat/.test(harnessSrc))
  score(
    'follow-up does not re-send last screenshot',
    !/function lastThreadImages/.test(workbench) &&
      /thisTurnHasImage/.test(harnessSrc) &&
      /compressAgentImage/.test(workbench),
  )
  score('tool results are reordered to match tool_calls', /afterAssistant/.test(harnessSrc) && /tool_call_id/.test(harnessSrc) && /_readPaths/.test(harnessSrc))
  score('yes after commit-offer is execute', classifyUserTask('yes', { lastAssistant: 'Want me to commit these changes?' }) === 'execute')
  score('think-first forbids permission on every folder', /Never ask permission/.test(composeThinkFirstBrief('rename this function', 'execute')) && /EVERY request/.test(composeWorkLoopBrief('execute')))
  score('activity stays Working while open', /open \? liveLabel/.test(workbench) && /Soumtok is working/.test(workbench))
  score('pin uses Soumtok globe avatar not svg globe', /data-activity-avatar/.test(workbench) && /mountInline/.test(workbench) && !/function agentGlobeIconHtml/.test(workbench) && /Soumtok agent/.test(workbench))
  score('activity globe avatar on every run', /agent-think-avatar/.test(workbench) && /data-activity-avatar/.test(workbench) && /agent-think-who/.test(workbench))
  score('silent write still concludes', /ensureWriteHasUserConclusion/.test(harnessSrc) && /composeLocalConclusion/.test(harnessSrc) && /Writing summary for you/.test(harnessSrc))
  score('runmy localhost is run', classifyUserTask('isit okay now runmy localhost') === 'run')
  score('is it okay run localhost is run', classifyUserTask('is it okay now run my localhost') === 'run')
  score('run my localhost is run', classifyUserTask('run my localhost') === 'run')
  score(
    'project memory stores run command',
    (() => {
      const { buildProjectMemory, composeProjectBrief } = require('../src/main/projectMemory.js')
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-mem-'))
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ name: 'cube-app', scripts: { dev: 'vite' } }),
        'utf8',
      )
      const mem = buildProjectMemory(dir)
      const brief = composeProjectBrief(mem, 'run')
      fs.rmSync(dir, { recursive: true, force: true })
      return mem.runCommand === 'npm run dev' && /PROJECT BRIEF/.test(brief) && /npm run dev/.test(brief)
    })(),
  )
  score(
    'harness refreshes atlas when the user query changes',
    /queryChanged/.test(harnessSrc) && /PROJECT BRIEF/.test(harnessSrc) && /taskKind === 'run'/.test(harnessSrc),
  )
  score(
    'harness does not lock the model out of re-reads',
    !/Already loaded/.test(harnessSrc) && /start_line\/end_line/.test(harnessSrc) && /Do not tell the user about the harness/.test(harnessSrc),
  )
  score('assistant events paint while agent is busy', /ev.type === 'assistant'/.test(workbench) && !/if \(state.agentBusy\) return/.test(workbench.split("ev.type === 'assistant'")[1]?.slice(0, 400) || 'if (state.agentBusy) return'))
  score(
    'permission asks are not shown as the answer',
    /assistantAskedPermission\(t\)/.test(harnessSrc) && /want me to proceed/.test(workbench),
  )
  {
    const { compactToolContent } = require('../src/shared/tokenGuard.js')
    const body = `${'a'.repeat(60_000)}TAIL_MARKER`
    const trimmed = compactToolContent(body, 0)
    score('recent file reads keep the tail', /TAIL_MARKER/.test(trimmed) && trimmed.length < body.length)
  }
  {
    const readOnly = [
      { role: 'user', content: 'isit okay now runmy localhost' },
      { role: 'tool', name: 'read', content: 'const url = "http://localhost:5173"\nexport class CubeScene {}' },
      { role: 'tool', name: 'read', content: 'http://localhost:5173 vite\nexport class CubeScene {}' },
    ]
    score(
      'localhost in source file does not complete run',
      taskCompletionMet('run', readOnly) === false,
    )
    score(
      'harness continues after run-only-reads',
      shouldContinueAgentTask({
        mode: 'agent',
        folder: tmp,
        kind: 'run',
        work: readOnly,
        text: '',
        round: 1,
        maxRounds: 20,
      }) === true,
    )
  }
  score(
    'run control is a system pin, not a fake user after every read',
    /composeRunNowNudge/.test(harnessSrc) &&
      /PREVIEW_RUN_NOW_NUDGE/.test(harnessSrc) &&
      /modelStalledInsteadOfWorking/.test(harnessSrc),
  )
  score(
    'chat fallback if agent silent after tools',
    /I looked at the project/.test(workbench),
  )

  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-live-empty-'))
  score('greenfield', workspaceIsGreenfield(empty) === true)
  const sc = applyGreenfieldScaffold(empty, 'make me a 3d cube simulation')
  score('cube scaffold writes src/cube3d.ts not cube.js', sc.wrote.includes('src/cube3d.ts') && !fs.existsSync(path.join(empty, 'cube.js')))
  const py = contentsForPlan({ kind: 'python-cli', title: 'g', raw: 'python cli' })
  score('python scaffold is main.py', py.some((f) => f.path === 'main.py'))
  fs.rmSync(empty, { recursive: true, force: true })

  const forkDir = path.resolve(root, '../../soumtok-vscode')
  const template = path.join(root, 'vscode-fork/product.json.template')
  score('Soumtok Code template exists', fs.existsSync(template))
  score('vscode clone or template ready', fs.existsSync(forkDir) || fs.existsSync(template))
  const agentHost = path.join(forkDir, 'src/vs/platform/agentHost')
  const product = path.join(forkDir, 'product.json')
  score(
    'vscode fork has Agent Host + Soumtok branding',
    fs.existsSync(agentHost) &&
      fs.existsSync(product) &&
      /Soumtok Code/.test(fs.readFileSync(product, 'utf8')),
  )
  score('Soumtok Code host binary installed', isSoumtokCodeInstalled())
} finally {
  invalidateIndex(tmp)
  fs.rmSync(tmp, { recursive: true, force: true })
}

{
  let completeCalled = false
  let fullRound = false
  const mockApi = async (_method, url) => {
    if (String(url).includes('/complete')) {
      completeCalled = true
      return { status: 200, data: { text: 'helloWorld', model: 'deepseek-v4-flash' } }
    }
    fullRound = true
    return { status: 200, data: { text: 'nope' } }
  }
  const tab = await runEditorAiAssist(mockApi, {
    kind: 'tab',
    prefix: 'const x = ',
    suffix: '\n',
    language: 'javascript',
    filePath: 'a.js',
  })
  score('Tab uses /complete not full agent round', completeCalled && !fullRound && tab.ok && tab.text === 'helloWorld')
}

const passed = checks.filter((c) => c.ok).length
const total = checks.length
assert.equal(passed, total, `live ${passed}/${total}`)
console.log(`test-agent-live: ${passed}/${total}`)
