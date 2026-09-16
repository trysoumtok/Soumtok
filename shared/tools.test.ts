import assert from 'node:assert/strict'
import test from 'node:test'
import { formatToolResults, grepWorkspace, liveProgressStep, liveToolProgress, peekToolArgs, pendingTools, pendingToolsForRun, runExpectsFileEdits, runLocalTool, skipDisplayDiffs, skipKnownReads, shouldNudgeWrite, toolResultLine, toolsNeedAnotherRound, toolsNeedFollowUp } from './tools.ts'
import { liveStepLabel, normalizeLiveStep, toolFeedLabel, toolFeedLine } from './toolFeed.ts'
import { isGitPushCommand, parseSandboxCommand } from './sandboxAllow.ts'
import { livePlanEstimate } from './agent.ts'
import { argsFromToolJson, studioToolsFromNative, STUDIO_FUNCTIONS } from './nativeTools.ts'

test('grep finds a line in workspace files', () => {
  const hit = grepWorkspace({ 'src/a.ts': 'const foo = 1\nconst bar = 2' }, 'bar')
  assert.match(hit, /src\/a\.ts:2/)
})

test('read tool returns the file and missing paths fail', () => {
  const ok = runLocalTool({ kind: 'tool', name: 'read', args: { path: 'a.ts' } }, { 'a.ts': 'export const n = 1' })
  assert.equal(ok.ok, true)
  assert.match(ok.text, /export const n/)
  const miss = runLocalTool({ kind: 'tool', name: 'read', args: { path: 'nope.ts' } }, { 'a.ts': 'x' })
  assert.equal(miss.ok, false)
})

test('inspect tools ask for another model round', () => {
  const events = [{ kind: 'tool' as const, name: 'grep', args: { pattern: 'TODO' } }]
  assert.deepEqual(pendingTools(events).map((item) => item.name), ['grep'])
  assert.equal(toolsNeedFollowUp(events), true)
  assert.equal(toolsNeedFollowUp([...events, { kind: 'summary', text: 'done' }]), false)
  assert.equal(toolsNeedFollowUp([{ kind: 'tool', name: 'mcp', args: { server: 'github', tool: 'list' } }]), true)
  assert.equal(toolsNeedFollowUp([{ kind: 'tool', name: 'examine_media', args: { path: 'shot.png' } }]), true)
  assert.equal(toolsNeedAnotherRound([{ kind: 'tool', name: 'write', args: { path: 'app.js' } }]), false)
  assert.equal(toolsNeedAnotherRound([{ kind: 'tool', name: 'generate_image', args: { prompt: 'blue icon' } }]), false)
  assert.equal(toolsNeedAnotherRound([{ kind: 'tool', name: 'diff', args: { path: 'index.html' } }]), false)
  assert.equal(toolsNeedAnotherRound([{ kind: 'tool', name: 'terminal', args: { command: 'ls -la' } }]), false)
  assert.equal(toolsNeedAnotherRound([{ kind: 'tool', name: 'read', args: { path: 'missing.ts' } }]), true)
  assert.equal(
    skipKnownReads([{ kind: 'tool', name: 'read', args: { path: 'app.js' } }], { 'app.js': 'ok' }).length,
    1,
  )
  assert.equal(
    skipKnownReads(
      [
        { kind: 'tool', name: 'read', args: { path: 'app.js' } },
        { kind: 'tool', name: 'read', args: { path: 'app.js' } },
      ],
      { 'app.js': 'ok' },
    ).length,
    1,
  )
})

test('a Done reply with no file changes is sent back to write', () => {
  const sys = 'MODE: fix\nFOLLOW-UP KIND: task\nANALYZED REQUEST — authoritative.'
  assert.equal(
    shouldNudgeWrite({
      agent: true,
      round: 1,
      maxRounds: 8,
      stillIdle: true,
      toolCount: 0,
      systemPrompt: sys,
      modelText: 'Done.',
    }),
    true,
  )
  assert.equal(
    shouldNudgeWrite({
      agent: true,
      round: 1,
      stillIdle: true,
      toolCount: 0,
      systemPrompt: 'MODE: chat\nFOLLOW-UP KIND: question',
      modelText: 'The name is SULU CALCS',
    }),
    false,
  )
  assert.equal(
    shouldNudgeWrite({
      agent: true,
      round: 1,
      stillIdle: false,
      toolCount: 0,
      systemPrompt: sys,
    }),
    false,
  )
  assert.equal(
    shouldNudgeWrite({
      agent: true,
      round: 1,
      stillIdle: false,
      toolCount: 0,
      systemPrompt: 'MODE: build\nFILES YOU MUST WRITE',
      missing: ['styles/main.css', 'scripts/main.js'],
    }),
    true,
  )
  assert.equal(
    shouldNudgeWrite({
      agent: true,
      round: 0,
      stillIdle: true,
      toolCount: 0,
      systemPrompt:
        'You are Soumtok Studio. MODE is chat. Do not write or rewrite files.\nANALYZED REQUEST — authoritative.\nIntent: chat',
      modelText: 'Hello! How can I help you today?',
    }),
    false,
  )
  assert.equal(
    runExpectsFileEdits('You are Soumtok Studio. MODE is chat.\nANALYZED REQUEST — authoritative.'),
    false,
  )
})

test('streaming write arguments show Writing path, not a silent Working', () => {
  const partial = '{"path":"styles.css","content":"body { background: #fff'
  const args = peekToolArgs(partial)
  assert.equal(args.path, 'styles.css')
  assert.match(args.content || '', /background/)
  const calls = liveToolProgress([{ name: 'write', arguments: partial }])
  assert.equal(calls[0]?.path, 'styles.css')
  assert.equal(liveProgressStep(calls), 'Writing styles.css')
  assert.equal(toolResultLine('read', 'index.html (78 lines)\n<!doctype html>...'), 'index.html · 78 lines')
  assert.doesNotMatch(toolResultLine('read', 'index.html (78 lines)\n<!doctype html><html>'), /doctype/)
})

test('diff tool edits a heading without a write', () => {
  const files = { 'index.html': '<span class="pill">EMBER TOOLS</span>\n<h1>Calculator</h1>' }
  const out = runLocalTool(
    {
      kind: 'tool',
      name: 'diff',
      args: { path: 'index.html', old_string: 'EMBER TOOLS', new_string: 'lipjumba' },
    },
    files,
  )
  assert.equal(out.ok, true)
  assert.match(out.files?.['index.html'] || '', /lipjumba/)
  assert.doesNotMatch(out.files?.['index.html'] || '', /EMBER TOOLS/)
  const lines = runLocalTool(
    {
      kind: 'tool',
      name: 'diff',
      args: {
        path: 'index.html',
        lines: JSON.stringify([
          { kind: 'del', text: 'Ember tools' },
          { kind: 'add', text: 'lipjumba' },
        ]),
      },
    },
    { 'index.html': 'Ember tools' },
  )
  assert.equal(lines.ok, true)
  assert.equal(lines.files?.['index.html'], 'lipjumba')
})

test('count-only diffs are skipped and do not wipe files', () => {
  const files = { 'styles/main.css': ':root { --bg: #0b0b0a; }' }
  const display = { kind: 'tool' as const, name: 'diff', args: { path: 'styles/main.css', added: '12', removed: '0' } }
  assert.equal(skipDisplayDiffs([display]).length, 0)
  const kept = runLocalTool(display, files)
  assert.equal(kept.ok, true)
  assert.equal(kept.files?.['styles/main.css'], files['styles/main.css'])
  const real = runLocalTool(
    { kind: 'tool', name: 'diff', args: { path: 'index.html', old_string: 'A', new_string: 'B' } },
    { 'index.html': 'A' },
  )
  assert.equal(real.ok, true)
  assert.equal(real.files?.['index.html'], 'B')
  assert.equal(
    skipDisplayDiffs([{ kind: 'tool', name: 'write', args: { path: 'a.css', content: 'x' } }]).length,
    1,
  )
})

test('a failed unknown tool keeps the agent going', async () => {
  const { toolsShouldContinue } = await import('./tools.ts')
  const tools = [{ kind: 'tool' as const, name: 'diff', args: { path: 'index.html', added: '2', removed: '2' } }]
  assert.equal(toolsShouldContinue(tools, [{ name: 'diff', ok: true, text: 'Edited index.html' }]), false)
  assert.equal(
    toolsShouldContinue(tools, [{ name: 'diff', ok: true, text: 'Wrote index.html' }], {
      missing: ['styles/main.css'],
    }),
    true,
  )
  assert.equal(toolsShouldContinue(tools, [{ name: 'diff', ok: false, text: 'Unknown tool diff' }]), true)
  assert.equal(toolFeedLine('diff', { path: 'index.html', added: '2', removed: '2' }), 'index.html')
  assert.equal(toolFeedLabel('diff'), 'Edited')
})

test('sandbox allowlist blocks shells and network', () => {
  assert.ok(parseSandboxCommand('npx tsc --noEmit'))
  assert.ok(parseSandboxCommand('npm test'))
  assert.ok(parseSandboxCommand('git add README.md'))
  assert.ok(parseSandboxCommand('git commit -m update'))
  assert.ok(parseSandboxCommand('npm install'))
  assert.ok(parseSandboxCommand('npm ci'))
  assert.equal(parseSandboxCommand('npm install -g evil'), null)
  assert.equal(parseSandboxCommand('git push origin main'), null)
  assert.equal(parseSandboxCommand('curl https://example.com'), null)
  assert.equal(parseSandboxCommand('rm -rf /'), null)
})

test('live plan estimate grows with workspace context', () => {
  const small = livePlanEstimate({
    files: { 'index.html': '<h1>Hi</h1>' },
    messages: [{ content: 'make a site' }],
    plan: { files: ['index.html'], steps: ['design', 'build'], summary: 'A page' },
  })
  const large = livePlanEstimate({
    files: { 'index.html': 'x'.repeat(20_000), 'app.ts': 'y'.repeat(20_000) },
    messages: [{ content: 'make a site with a lot of copy' }],
    plan: { files: ['index.html', 'app.ts'], steps: ['a', 'b', 'c'], summary: 'Big app' },
  })
  assert.ok(large.total > small.total)
  assert.match(small.label, /tokens/)
})

test('runnable command events become terminal tools', () => {
  const tools = pendingToolsForRun([{ kind: 'command', command: 'npm test' }])
  assert.equal(tools[0]?.name, 'terminal')
  assert.equal(tools[0]?.args.command, 'npm test')
  assert.equal(pendingToolsForRun([{ kind: 'command', command: 'Scaffold the project' }]).length, 0)
})

test('tool feed lines never dump file bodies', () => {
  const line = toolFeedLine('write', {
    path: 'app.js',
    content: '/* Ember Calculator */\nfunction add(a, b) { return a + b }\n'.repeat(40),
  })
  assert.equal(line, 'app.js')
  assert.doesNotMatch(line, /Ember|function add/)
  assert.equal(toolFeedLabel('write'), 'Wrote')
  assert.match(toolFeedLine('terminal', { command: 'ls -la' }), /ls -la/)
})

test('live step stays in present tense while tools run', () => {
  assert.equal(liveStepLabel({ kind: 'tool', name: 'read', args: { path: 'index.html' } }), 'Reading index.html')
  assert.equal(liveStepLabel({ kind: 'tool', name: 'write', args: { path: 'styles.css' } }), 'Writing styles.css')
  assert.equal(liveStepLabel({ kind: 'result', name: 'read', ok: true }), '')
  assert.equal(normalizeLiveStep('read ok'), 'Working')
  assert.equal(normalizeLiveStep('Reading styles.css'), 'Reading styles.css')
})

test('native tool calls parse into studio tools', () => {
  const tools = studioToolsFromNative([{ id: 'call_1', name: 'read', arguments: '{"path":"src/a.ts"}' }])
  assert.equal(tools[0]?.name, 'read')
  assert.equal(tools[0]?.args.path, 'src/a.ts')
  assert.equal(argsFromToolJson('{"n":1}').n, '1')
})

test('git push is recognized but not spawned', () => {
  assert.equal(isGitPushCommand('git push origin main'), true)
  assert.equal(parseSandboxCommand('git push origin main'), null)
})

test('ls cat and mkdir stay in memory even with a persist dir', async () => {
  const { runSandboxed } = await import('../server/sandbox.ts')
  const files = { 'index.html': '<h1>Hi</h1>', 'styles.css': 'body{color:#f54e00}' }
  const listed = await runSandboxed('ls -la', files, { persistDir: 'C:\\not-a-real-sandbox' })
  assert.equal(listed.ok, true)
  assert.match(listed.text, /index\.html/)
  assert.match(listed.text, /styles\.css/)
  assert.doesNotMatch(listed.text, /ENOENT/)
  const cat = await runSandboxed('cat styles.css', files, { persistDir: 'C:\\not-a-real-sandbox' })
  assert.equal(cat.ok, true)
  assert.match(cat.text, /#f54e00/)
  const made = await runSandboxed('mkdir -p styles', files, { persistDir: 'C:\\not-a-real-sandbox' })
  assert.equal(made.ok, true)
  assert.match(made.text, /styles/)
})

test('preview resolves stylesheet by basename so colors load', async () => {
  const { resolveSiteFile, inlineAssets, previewStamp, acceptSiteSeq } = await import('./preview.ts')
  const files = {
    'index.html': '<link rel="stylesheet" href="styles.css"><h1>Hi</h1>',
    'styles/main.css': ':root{--accent:#f54e00}body{color:var(--accent)}',
  }
  assert.match(resolveSiteFile(files, '<h1>stale</h1>', 'index.html'), /stylesheet/)
  assert.doesNotMatch(resolveSiteFile(files, '<h1>stale</h1>', 'index.html'), /stale/)
  assert.match(resolveSiteFile(files, '', 'styles.css'), /#f54e00/)
  assert.match(inlineAssets(files['index.html'], files), /#f54e00/)
  assert.match(
    inlineAssets('<img src="images/kfc.svg" alt="KFC">', {
      'images/kfc.svg': '<svg xmlns="http://www.w3.org/2000/svg"><path d="M1"/></svg>',
    }),
    /data:image\/svg\+xml/,
  )
  const before = previewStamp('', { 'index.html': '<h1>Calculator</h1>' })
  const after = previewStamp('', { 'index.html': '<h1>Dashboard!</h1>' })
  assert.notEqual(before, after)
  assert.equal(previewStamp('', { 'index.html': '<h1>Calculator</h1>' }), before)
  assert.equal(acceptSiteSeq(undefined, 1), true)
  assert.equal(acceptSiteSeq(4, 5), true)
  assert.equal(acceptSiteSeq(5, 5), true)
  assert.equal(acceptSiteSeq(6, 5), false)
})

test('git tree skips secrets and empty paths', async () => {
  const { gitTreeFromFiles } = await import('../server/github.ts')
  const tree = gitTreeFromFiles({
    'src/app.ts': 'export const n = 1',
    '.env': 'SECRET=1',
    '../escape.ts': 'nope',
  })
  assert.deepEqual(tree.map((item) => item.path), ['src/app.ts'])
})

test('image and media tools are in the native schema', () => {
  const names = STUDIO_FUNCTIONS.map((item) => item.name)
  assert.ok(names.includes('generate_image'))
  assert.ok(names.includes('examine_media'))
  assert.ok(names.includes('mcp'))
})

test('pkce challenge is url-safe', async () => {
  const { pkceChallenge, authorizeUrl, oauthRedirect } = await import('../server/oauth.ts')
  const pkce = pkceChallenge()
  assert.match(pkce.verifier, /^[A-Za-z0-9_-]+$/)
  assert.match(pkce.challenge, /^[A-Za-z0-9_-]+$/)
  assert.ok(pkce.challenge.length > 20)
  assert.ok(pkce.state.length > 8)
  assert.match(authorizeUrl('https://auth.example/authorize', { client_id: 'x', state: pkce.state }), /state=/)
  assert.equal(oauthRedirect('https://soumtok.com/'), 'https://soumtok.com/api/connectors/oauth/callback')
})
