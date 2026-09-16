/**
 * Top-to-bottom desktop agent stack smoke test (no Electron UI).
 * Run: node desktop/scripts/test-integration.mjs
 */
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname, '..')

const { normalizeChatMessagesForAgent } = require('../src/shared/chatMessagesRuntime.js')
const { createCheckpoint, restoreCheckpoint } = require('../src/main/checkpoints.js')
const { loadProjectRules } = require('../src/main/projectRules.js')
const { runDesktopTool } = require('../src/main/desktopTools.js')
const { runAgentHarness, pushAgentSteer } = require('../src/main/agentHarness.js')

let failed = 0
function ok(label) {
  console.log('✔', label)
}
function fail(label, err) {
  failed++
  console.error('✘', label, err || '')
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-test-'))
fs.writeFileSync(path.join(tmp, 'hello.txt'), 'hello world\nline2\n', 'utf8')
fs.writeFileSync(path.join(tmp, 'AGENTS.md'), '# Test project\nUse pnpm.\n', 'utf8')
fs.mkdirSync(path.join(tmp, '.vscode'), { recursive: true })
fs.writeFileSync(
  path.join(tmp, '.vscode', 'extensions.json'),
  JSON.stringify({ recommendations: ['dbaeumer.vscode-eslint'] }),
  'utf8',
)

// 1) Message chain
try {
  const msgs = normalizeChatMessagesForAgent([
    { role: 'user', content: 'hi' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'terminal', arguments: '{}' } }],
    },
    { role: 'tool', tool_call_id: 'call_1', content: 'v22' },
  ])
  if (msgs.filter((m) => m.role === 'assistant').length !== 1) throw new Error('assistant dropped')
  if (msgs.filter((m) => m.role === 'tool').length !== 1) throw new Error('tool dropped')
  ok('normalizeChatMessagesForAgent keeps tool chain')
} catch (e) {
  fail('normalizeChatMessagesForAgent', e.message)
}

// 2) Project rules
try {
  const rules = loadProjectRules(tmp)
  if (!rules.includes('AGENTS.md') || !rules.includes('pnpm')) throw new Error('missing AGENTS content')
  ok('loadProjectRules reads AGENTS.md')
} catch (e) {
  fail('loadProjectRules', e.message)
}

// 3) Local tools
try {
  const read = await runDesktopTool(tmp, 'read', { path: 'hello.txt' }, { localToolsEnabled: true, runMode: 'run-everything' })
  if (!read.ok || !read.text.includes('hello')) throw new Error(read.text)
  const typoRead = await runDesktopTool(tmp, 'rea', { path: 'helo.txt' }, { localToolsEnabled: true, runMode: 'run-everything' })
  if (!typoRead.ok || !typoRead.text.includes('hello')) throw new Error(typoRead.text || 'misspelled read/path failed')
  const glob = await runDesktopTool(tmp, 'glob', { pattern: '*.txt' }, { localToolsEnabled: true, runMode: 'run-everything' })
  if (!glob.ok || !glob.text.includes('hello.txt')) throw new Error(glob.text)
  const term = await runDesktopTool(
    tmp,
    'terminal',
    { command: 'node -v' },
    applyPrefs(),
  )
  if (!term.ok || !/v\d+/.test(term.text)) throw new Error(term.text || 'no output')
  if (/Ctrl\+J|Integrated Terminal is required/i.test(term.text)) throw new Error('short command still asked for Ctrl+J')
  fs.mkdirSync(path.join(tmp, 'src'), { recursive: true })
  fs.writeFileSync(path.join(tmp, 'src', 'cube3d.ts'), 'line1\nINNER_FACE\nline3\n', 'utf8')
  const sed = await runDesktopTool(
    tmp,
    'terminal',
    { command: 'sed -n 1,3p src/cube3d.ts' },
    applyPrefs(),
  )
  if (!sed.ok || !/INNER_FACE/.test(sed.text)) throw new Error(sed.text || 'sed did not map to read')
  if (/Integrated Terminal|Ctrl\+J/i.test(sed.text)) throw new Error('sed still hit terminal gate')
  const ps = await runDesktopTool(
    tmp,
    'terminal',
    { command: 'powershell -NoProfile -Command "Get-Content src/cube3d.ts | Select-Object -Skip 0"' },
    applyPrefs(),
  )
  if (!ps.ok || !/INNER_FACE/.test(ps.text)) throw new Error(ps.text || 'Get-Content did not map to read')
  ok('desktopTools read/glob/terminal + shell-read rewrite')
} catch (e) {
  fail('desktopTools', e.message)
}

function applyPrefs() {
  const { applyRunModeToPrefs } = require('../src/shared/agentPrefsRuntime.js')
  return applyRunModeToPrefs({ runMode: 'run-everything', localToolsEnabled: true })
}

// 4) Checkpoints
try {
  const editPath = 'hello.txt'
  const cp = createCheckpoint(tmp, [editPath])
  fs.writeFileSync(path.join(tmp, editPath), 'CHANGED\n', 'utf8')
  const restored = restoreCheckpoint(tmp, cp.id)
  if (!restored.ok) throw new Error(restored.text)
  const body = fs.readFileSync(path.join(tmp, editPath), 'utf8')
  if (!body.includes('hello world')) throw new Error('restore did not revert')
  ok('checkpoints create + restore')
} catch (e) {
  fail('checkpoints', e.message)
}

// 5) Agent harness — tool round then reply (mock API)
try {
  let apiRound = 0
  const events = []
  const api = async (method, p, body) => {
    if (method === 'GET' && p === '/api/studio/tools/context') {
      return { status: 200, data: { skills: [], plugins: [], connectors: [] } }
    }
    if (method === 'POST' && String(p).includes('agent/round')) {
      apiRound++
      if (apiRound === 1) {
        return {
          status: 200,
          data: {
            text: '',
            toolCalls: [{ id: 't1', name: 'read', arguments: JSON.stringify({ path: 'hello.txt' }) }],
            model: 'test-model',
            promptTokens: 1,
            completionTokens: 1,
          },
        }
      }
      return {
        status: 200,
        data: {
          text: 'File says hello.',
          toolCalls: [],
          model: 'test-model',
          promptTokens: 1,
          completionTokens: 2,
        },
      }
    }
    return { status: 404, data: {} }
  }

  const result = await runAgentHarness({
    api,
    folder: tmp,
    model: 'deepseek-v4-flash',
    mode: 'agent',
    driver: 'ide',
    messages: [],
    userMessage: 'read hello.txt and summarize',
    openFiles: [],
    agentPrefs: applyPrefs(),
    signal: null,
    onEvent: (ev) => events.push(ev),
  })
  if (result.error) throw new Error(result.error)
  if (apiRound < 2) throw new Error(`expected 2 api rounds got ${apiRound}`)
  if (!events.some((e) => e.type === 'tool' && e.name === 'read')) throw new Error('no read tool event')
  if (!result.text && !events.some((e) => e.type === 'assistant')) throw new Error('no final reply')
  ok(`agent harness multi-round (${apiRound} API rounds, read tool + reply)`)
} catch (e) {
  fail('agent harness tool round', e.message)
}

try {
  const events = []
  let sawContinue = false
  let round = 0
  const api = async (method, p, body) => {
    if (method === 'GET' && p === '/api/studio/tools/context') {
      return { status: 200, data: { skills: [], plugins: [], connectors: [] } }
    }
    if (method === 'POST' && String(p).includes('agent/round')) {
      round++
      const blob = JSON.stringify(body || {})
      if (/do NOT search or re-read|SOUMTOK CONTINUE NOW/i.test(blob)) sawContinue = true
      if (round === 1) {
        return {
          status: 200,
          data: {
            text: '',
            toolCalls: [{ id: 'w1', name: 'write', arguments: JSON.stringify({ path: 'src/cube3d.ts', contents: 'fixed\n' }) }],
            model: 'test-model',
            promptTokens: 1,
            completionTokens: 1,
          },
        }
      }
      return {
        status: 200,
        data: { text: 'Applied the cube fix.', toolCalls: [], model: 'test-model', promptTokens: 1, completionTokens: 1 },
      }
    }
    return { status: 404, data: {} }
  }
  const result = await runAgentHarness({
    api,
    folder: tmp,
    model: 'deepseek-v4-flash',
    mode: 'agent',
    driver: 'ide',
    messages: [
      { role: 'user', content: 'fix black faces on the cube' },
      { role: 'assistant', content: 'Want me to apply that change to src/cube3d.ts now?' },
    ],
    userMessage: 'go on',
    openFiles: [],
    agentPrefs: applyPrefs(),
    signal: null,
    onEvent: (ev) => events.push(ev),
  })
  if (result.error) throw new Error(result.error)
  if (events.some((e) => /Finding the right files/i.test(String(e.text || '')))) {
    throw new Error('go on still searched the tree')
  }
  if (!sawContinue) throw new Error('go on did not inject continue-now')
  if (!events.some((e) => /Working — applying/i.test(String(e.text || '')))) {
    throw new Error('go on did not show Working — applying')
  }
  if (!events.some((e) => e.type === 'assistant' && String(e.text || '').trim())) {
    throw new Error('wrote files but never told the user')
  }
  ok('go on skips file search and applies')
} catch (e) {
  fail('go on continue path', e.message)
}

try {
  const events = []
  let round = 0
  const api = async (method, p) => {
    if (method === 'GET' && p === '/api/studio/tools/context') {
      return { status: 200, data: { skills: [], plugins: [], connectors: [] } }
    }
    if (method === 'POST' && String(p).includes('agent/round')) {
      round++
      if (round === 1) {
        return {
          status: 200,
          data: {
            text: '',
            toolCalls: [
              { id: 'w1', name: 'write', arguments: JSON.stringify({ path: 'hello.txt', contents: 'patched\n' }) },
            ],
            model: 'test-model',
            promptTokens: 1,
            completionTokens: 1,
          },
        }
      }
      return { status: 200, data: { text: '', toolCalls: [], model: 'test-model', promptTokens: 1, completionTokens: 1 } }
    }
    return { status: 404, data: {} }
  }
  const result = await runAgentHarness({
    api,
    folder: tmp,
    model: 'deepseek-v4-flash',
    mode: 'agent',
    driver: 'ide',
    messages: [],
    userMessage: 'fix hello.txt',
    openFiles: [],
    agentPrefs: applyPrefs(),
    signal: null,
    onEvent: (ev) => events.push(ev),
  })
  if (result.error) throw new Error(result.error)
  if (!events.some((e) => e.type === 'assistant' && String(e.text || '').trim())) {
    throw new Error('silent after write — no conclusion')
  }
  ok('write without model text still concludes')
} catch (e) {
  fail('silent write conclusion', e.message)
}

try {
  const events = []
  let round = 0
  let sawRunNow = false
  fs.writeFileSync(path.join(tmp, 'hello.txt'), 'open http://localhost:5173 in the browser\n', 'utf8')
  const api = async (method, p, body) => {
    if (method === 'GET' && p === '/api/studio/tools/context') {
      return { status: 200, data: { skills: [], plugins: [], connectors: [] } }
    }
    if (method === 'POST' && String(p).includes('agent/round')) {
      round++
      const blob = JSON.stringify(body || {})
      if (/User asked to RUN the app \/ localhost NOW/i.test(blob)) {
        sawRunNow = true
      }
      if (round === 1) {
        return {
          status: 200,
          data: {
            text: '',
            toolCalls: [
              { id: 'r1', name: 'read', arguments: JSON.stringify({ path: 'hello.txt' }) },
              { id: 'r2', name: 'read', arguments: JSON.stringify({ path: 'hello.txt' }) },
            ],
            model: 'test-model',
            promptTokens: 1,
            completionTokens: 1,
          },
        }
      }
      if (round === 2) {
        return {
          status: 200,
          data: {
            text: 'App is running at http://localhost:5173',
            toolCalls: [
              {
                id: 't1',
                name: 'terminal',
                arguments: JSON.stringify({ command: 'echo npm run dev http://localhost:5173' }),
              },
            ],
            model: 'test-model',
            promptTokens: 1,
            completionTokens: 1,
          },
        }
      }
      return {
        status: 200,
        data: {
          text: 'App is running at http://localhost:5173',
          toolCalls: [],
          model: 'test-model',
          promptTokens: 1,
          completionTokens: 1,
        },
      }
    }
    return { status: 404, data: {} }
  }
  const result = await runAgentHarness({
    api,
    folder: tmp,
    model: 'deepseek-v4-flash',
    mode: 'agent',
    driver: 'ide',
    messages: [],
    userMessage: 'isit okay now runmy localhost',
    openFiles: [],
    agentPrefs: applyPrefs(),
    signal: null,
    onEvent: (ev) => events.push(ev),
  })
  if (result.error) throw new Error(result.error)
  if (round < 2) throw new Error(`stuck after reads — only ${round} model round(s)`)
  if (sawRunNow) throw new Error('harness injected a fake RUN NOW user after reads')
  if (!events.some((e) => e.type === 'assistant' && String(e.text || '').trim())) {
    throw new Error('silent after runmy localhost')
  }
  ok('runmy localhost continues after reads')
} catch (e) {
  fail('runmy localhost after reads', e.message)
}

// 6) Steer queue drains (smoke)
try {
  pushAgentSteer('focus on tests')
  ok('pushAgentSteer accepts message')
} catch (e) {
  fail('steer', e.message)
}

try {
  fs.rmSync(tmp, { recursive: true, force: true })
} catch {
  /* ignore */
}

try {
  const { registerExtensionsIpc } = require('../src/main/extensionsIpc.js')
  const handled = new Map()
  const fakeIpc = {
    removeHandler(ch) {
      handled.delete(ch)
    },
    handle(ch, fn) {
      handled.set(ch, fn)
    },
  }
  registerExtensionsIpc({ ipcMain: fakeIpc, folderOf: () => null })
  if (!handled.has('extensions:installed')) throw new Error('missing extensions:installed')
  const installed = handled.get('extensions:installed')()
  if (!installed.ok) throw new Error('installed handler failed')
  if (!handled.has('extensions:activate')) throw new Error('missing extensions:activate')
  if (!handled.has('extensions:installedMarket')) throw new Error('missing extensions:installedMarket')
  if (!handled.has('extensions:activityBar')) throw new Error('missing extensions:activityBar')
  if (!handled.has('extensionHost:start')) throw new Error('missing extensionHost:start')
  if (!handled.has('extensionHost:runCommand')) throw new Error('missing extensionHost:runCommand')
  ok('extensions IPC handlers register')
  const { registerSetupIpc } = require('../src/main/setupIpc.js')
  registerSetupIpc({
    ipcMain: fakeIpc,
    folderOf: () => '/tmp',
    sessionUser: async () => ({ user: null }),
    api: async () => ({ status: 0, data: null }),
    API: 'http://localhost:3000',
    isHtmlSpaBody: () => false,
    detectInstallations: () => [],
    forkBuildHint: () => ({ clonePresent: false }),
  })
  if (!handled.has('setup:status')) throw new Error('missing setup:status')
  ok('setup IPC handlers register')
} catch (e) {
  fail('extensions/setup IPC handlers register', e.message)
}

try {
  const termHome = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-term-'))
  const {
    setSoumtokHomeForTests,
    appendWorkspaceLog,
    persistWorkspaceLog,
    loadPersistedWorkspaceLog,
    bindShellSessions,
  } = require('../src/main/terminalLog.js')
  setSoumtokHomeForTests(termHome)
  bindShellSessions(new Map())
  const proj = path.join(termHome, 'proj')
  fs.mkdirSync(proj, { recursive: true })
  appendWorkspaceLog(proj, 'PS D:\\rubiscube> npm run dev\r\n  Local:   http://localhost:5173/\r\n')
  persistWorkspaceLog(proj)
  bindShellSessions(new Map())
  const loaded = loadPersistedWorkspaceLog(proj)
  if (!loaded.includes('localhost:5173')) throw new Error(`missing restored history: ${JSON.stringify(loaded)}`)
  if (!loaded.includes('npm run dev')) throw new Error('missing restored command')
  setSoumtokHomeForTests(null)
  ok('terminal history persists across restart')
} catch (e) {
  fail('terminal history persists across restart', e.message)
}

try {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-mcp-'))
  const { saveMcpArtifacts } = require('../src/main/desktopTools.js')
  const saved = saveMcpArtifacts(
    proj,
    'GitHub',
    'search_code',
    { content: [{ type: 'text', text: 'hello' }] },
    { workspaceBoundary: true },
  )
  if (!saved.length || !saved[0].includes('mcp-exports')) throw new Error(`expected mcp-exports path, got ${saved}`)
  const body = fs.readFileSync(path.join(proj, saved[0]), 'utf8')
  if (!body.includes('hello')) throw new Error('mcp export missing payload')
  ok('mcp results save into the project')
} catch (e) {
  fail('mcp results save into the project', e.message)
}

try {
  const { HIGGSFIELD_MCP, TRENDING_REMOTE, OFFICIAL_LOGOS, higgsfieldOfficial, loadMcpMarketplace } = require('../src/main/mcpMarketplace.js')
  if (HIGGSFIELD_MCP !== 'https://mcp.higgsfield.ai/mcp') throw new Error(HIGGSFIELD_MCP)
  const official = higgsfieldOfficial()
  if (official.mcpUrl !== HIGGSFIELD_MCP) throw new Error('official Higgsfield URL')
  if (official.description) throw new Error('Higgsfield card must not dump extra copy')
  if (!TRENDING_REMOTE.some((row) => row.id === 'canva' && row.mcpUrl.includes('mcp.canva.com'))) {
    throw new Error('trending Canva MCP missing')
  }
  if (!String(OFFICIAL_LOGOS.canva).includes('static.canva.com')) throw new Error('Canva must use Canva’s own icon')
  if (!String(OFFICIAL_LOGOS.huggingface).includes('huggingface.co')) throw new Error('Hugging Face must use HF’s own logo')
  if (!String(OFFICIAL_LOGOS.context7).includes('context7.com')) throw new Error('Context7 must use Context7’s own icon')
  if (!String(OFFICIAL_LOGOS.salesforce).includes('sfdcstatic.com')) throw new Error('Salesforce must use Salesforce’s own cloud')
  if (!String(OFFICIAL_LOGOS.neon).includes('neon.com')) throw new Error('Neon must use Neon’s own logomark')
  const mainSrc = fs.readFileSync(path.join(root, 'src/main/index.js'), 'utf8')
  if (!mainSrc.includes('actionUrl')) throw new Error('desktop oauth must return the action URL')
  const workbenchSrc = fs.readFileSync(path.join(root, 'src/renderer/workbench.js'), 'utf8')
  if (!workbenchSrc.includes('oauth?.noAuth')) throw new Error('desktop connect must handle MCPs that need no sign-in')
  const oauthSrc = fs.readFileSync(path.join(root, '..', 'server', 'mcpOauth.ts'), 'utf8')
  if (!oauthSrc.includes('resource_metadata') || !oauthSrc.includes('oauth-protected-resource')) {
    throw new Error('OAuth discovery must follow MCP resource_metadata')
  }
  for (const row of TRENDING_REMOTE) {
    if (!/^https:\/\//.test(row.mcpUrl)) throw new Error(`${row.id} missing HTTPS MCP URL`)
  }
  const market = await loadMcpMarketplace('', [
    { id: 'github', name: 'GitHub', mcpUrl: 'https://api.githubcopilot.com/mcp/', pluginId: 'github', popular: true },
    { id: 'higgsfield', name: 'Higgsfield', mcpUrl: HIGGSFIELD_MCP, pluginId: 'higgsfield' },
  ])
  if (!market.trending?.some((row) => row.id === 'github')) throw new Error('trending github missing')
  if (!market.trending?.some((row) => row.id === 'atlassian')) throw new Error('trending atlassian missing')
  const canvaCard = market.trending.find((row) => row.id === 'canva')
  if (!String(canvaCard?.logo || '').includes('static.canva.com')) throw new Error('Canva card logo is not Canva’s icon')
  const logoIds = ['context7', 'salesforce', 'atlassian', 'gitlab', 'hubspot', 'asana', 'neon', 'huggingface']
  const logoRoot = path.join(root, 'resources', 'plugin-logos')
  const publicRoot = path.join(root, '..', 'public', 'logos', 'plugins')
  for (const id of logoIds) {
    const desktopLogo = path.join(logoRoot, `${id}.svg`)
    const webLogo = path.join(publicRoot, `${id}.svg`)
    if (!fs.existsSync(desktopLogo)) throw new Error(`missing desktop logo ${id}`)
    if (!fs.existsSync(webLogo)) throw new Error(`missing web logo ${id}`)
    const svg = fs.readFileSync(desktopLogo, 'utf8')
    if (!svg.includes('<svg') || svg.length < 80) throw new Error(`empty logo ${id}`)
  }
  if (!fs.readFileSync(path.join(publicRoot, 'neon.svg'), 'utf8').includes('#34D59A')) {
    throw new Error('Neon logo is not the official logomark')
  }
  if (!fs.readFileSync(path.join(publicRoot, 'salesforce.svg'), 'utf8').includes('#0D9DDA')) {
    throw new Error('Salesforce logo is not the official cloud')
  }
  if (market.higgsfieldTop || market.higgsfieldAll) throw new Error('models must not be separate MCPs')
  const searched = await loadMcpMarketplace('github', [
    { id: 'github', name: 'GitHub', mcpUrl: 'https://api.githubcopilot.com/mcp/', pluginId: 'github', popular: true },
    { id: 'gmail', name: 'Gmail', mcpUrl: 'https://gmailmcp.googleapis.com/mcp/v1', pluginId: 'gmail' },
  ])
  if (!searched.trending.some((row) => row.id === 'github')) throw new Error('search missed github')
  if (searched.catalog.some((row) => row.id === 'gmail')) throw new Error('search leaked gmail into catalog')
  ok('mcp marketplace Higgsfield URL-only + trending remotes')
} catch (e) {
  fail('mcp marketplace', e.message)
}

console.log('')
if (failed) {
  console.error(`FAILED ${failed} check(s)`)
  process.exit(1)
}
console.log('All desktop integration checks passed.')
