import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyAskAnswers,
  applyDiffDecision,
  applyNameChange,
  applyNameChangeFromThread,
  attachChangeDiffs,
  chatReplyFromRun,
  classifyFollowUp,
  codeForRequest,
  executeSystemPrompt,
  followUpFindThought,
  formatAskReply,
  formatSkipAsk,
  finishChatReply,
  inferPlan,
  isAskReply,
  isQuestionIntent,
  kickoffEvents,
  looksLikeAskHandoff,
  looksLikeSeeOnlyAsk,
  looksLikeThemeAsk,
  promptWithAttachments,
  PREVIEW_SCREENSHOT_PROMPT,
  missingManifestFiles,
  nameChangeIsOnlyAsk,
  parseAgentRun,
  parseStreamingEvents,
  planUsesCodingAgent,
  promptManifestSpec,
  requestNeedsAsk,
  requestedNewName,
  restoreAskEvent,
  spokenRecap,
  startingStep,
  visibleWorkEvents,
  workspaceDelivered,
  withChangeDiffs,
} from './agent.ts'

test('vague new builds ask before writing files', () => {
  assert.equal(requestNeedsAsk('make a coffee shop site', false), true)
  assert.equal(inferPlan('make a coffee shop site', false).mode, 'ask')
  assert.equal(requestNeedsAsk('hi', false), false)
  assert.equal(requestNeedsAsk('what is a landing page?', false), false)
  assert.equal(requestNeedsAsk('fix the header', true), false)
  assert.equal(
    requestNeedsAsk('Build Ember & Oak, a dark rustic coffee shop in Nairobi with menu and visit pages', false),
    false,
  )
})

test('simple questions about an attached image do not open a build form', () => {
  const msg = 'hy do youse this iamge?'
  assert.equal(isQuestionIntent(msg, { attachments: true }), true)
  assert.equal(requestNeedsAsk(msg, false, 'ask', true), false)
  const plan = inferPlan(msg, false, { runMode: 'ask', attachments: true })
  assert.equal(plan.mode, 'chat')
  assert.match(plan.goal, /attached|see/i)
  assert.equal(requestNeedsAsk('make a coffee shop site', false, 'ask'), true)
  assert.equal(inferPlan('make a coffee shop site', false, { runMode: 'ask' }).mode, 'ask')
  assert.equal(inferPlan('what is a landing page?', false).mode, 'chat')
})

test('hello is one chat reply, not a coding agent loop', () => {
  const plan = inferPlan('hello', false)
  assert.equal(plan.mode, 'chat')
  assert.equal(planUsesCodingAgent(plan), false)
  const parsed = parseAgentRun(
    JSON.stringify({
      events: [
        { kind: 'thought', seconds: 1, text: 'Hello! How can I help you today?' },
        { kind: 'thought', seconds: 1, text: 'Hello! How can I help you today?' },
        { kind: 'thought', seconds: 1, text: 'Hello! How can I help you today?' },
        { kind: 'summary', text: "Hello! I'm Soumtok Studio. What would you like to build?" },
      ],
    }),
    plan,
  )
  assert.equal(
    parsed.events.filter((item) => item.kind === 'thought').length,
    0,
  )
  const summary = parsed.events.find((item) => item.kind === 'summary')
  assert.equal(summary?.kind, 'summary')
  if (summary?.kind === 'summary') assert.match(summary.text, /Soumtok Studio/)
})

test('hello does not collapse to Done', () => {
  const json = JSON.stringify({
    events: [{ kind: 'summary', text: 'Hello! What do you want to work on?' }],
    files: {},
  })
  assert.match(chatReplyFromRun(json), /Hello/)
  assert.doesNotMatch(finishChatReply('{"events":[{"kind":"summary","text":"Done."}]}'), /^Done\.?$/i)
  const recap = spokenRecap({
    files: {},
    events: [{ kind: 'summary', text: 'Hi — I can help you build that.' }],
    mode: 'chat',
  })
  assert.match(recap, /Hi/)
  assert.doesNotMatch(recap, /^Done\.?$/i)
})

test('a follow-up question answers from files instead of rewriting the preview', () => {
  assert.equal(classifyFollowUp('whats my calcutor name?', true), 'question')
  assert.equal(classifyFollowUp('whats my calcutor name', true), 'question')
  assert.equal(isQuestionIntent('whats my calcutor name'), true)
  const plan = inferPlan('whats my calcutor name?', true, { hasPreview: true })
  assert.equal(plan.mode, 'chat')
  assert.deepEqual(plan.steps, [])
  assert.match(plan.instructions.join(' '), /Answer from the files/)
  assert.equal(classifyFollowUp('change the header to lipjumba', true), 'task')
  assert.equal(inferPlan('change the header to lipjumba', true, { hasPreview: true }).mode, 'fix')
  assert.equal(classifyFollowUp('can you ad tehreal svg real logo of kfc and ad any page inmy webioste', true), 'task')
  assert.equal(
    inferPlan('can you ad tehreal svg real logo of kfc and ad any page inmy webioste', true, { hasPreview: true }).mode,
    'fix',
  )
  const recap = spokenRecap({
    files: { 'index.html': '<span>EMBER TOOLS</span>', 'styles.css': 'body{}', 'app.js': '' },
    events: [{ kind: 'summary', text: '' }],
    previewHtml: '<html></html>',
    previewTitle: 'Preview',
  })
  assert.doesNotMatch(recap, /Preview is ready/)
  assert.doesNotMatch(recap, /Wrote index\.html/)
  const source = codeForRequest(
    'whats my calcutor name',
    { 'index.html': '<span class="pill">EMBER TOOLS</span><h1>Calculator</h1>' },
    14_000,
    { answerOnly: true },
  )
  assert.match(source, /CURRENT SOURCE/)
  assert.match(source, /EMBER TOOLS/)
  assert.doesNotMatch(source, /REQUEST CODE/)
})

test('a rename follow-up actually edits the brand and shows a thought', () => {
  const files = {
    'index.html': '<span class="pill">EMBER TOOLS</span><h1>Calculator</h1><title>Ember Calculator - everyday math</title>',
    'app.js': '/* Ember Calculator */',
  }
  const applied = applyNameChange(files, 'yeah change thename all names to sulu calcs')
  assert.ok(applied)
  assert.match(applied?.files['index.html'] || '', /SULU CALCS|sulu calcs|Sulu Calcs/i)
  assert.doesNotMatch(applied?.files['index.html'] || '', /EMBER TOOLS/)
  const again = applyNameChangeFromThread(
    ['yeah change thename all names to sulu calcs', 'the poreview stil reads ember'],
    files,
  )
  assert.ok(again)
  assert.doesNotMatch(again?.files['index.html'] || '', /EMBER TOOLS/)
  const plan = inferPlan('yeah change thename all names to sulu calcs', true, { hasPreview: true })
  assert.equal(plan.mode, 'fix')
  assert.deepEqual(plan.steps, [])
  const seed = kickoffEvents(plan, { userText: 'yeah change thename all names to sulu calcs', files })
  assert.equal(seed[0]?.kind, 'thought')
  if (seed[0]?.kind === 'thought') {
    assert.match(seed[0].text, /EMBER TOOLS|found/i)
    assert.match(seed[0].text, /sulu calcs/i)
  }
})

test('a theme-toggle follow-up is not treated as a rename of the title', () => {
  const files = {
    'index.html':
      '<title>dark go on - everyday math, kept warm</title><span class="pill">SULU CALCS</span><h1>Calculator</h1>',
    'styles.css': 'body { background: #111; color: #eee }',
    'app.js': 'document.body.classList.add("dark")',
  }
  const prompt = 'add like a them change to switch form dark tolight theme aperance'
  assert.equal(looksLikeThemeAsk(prompt), true)
  assert.equal(requestedNewName(prompt), '')
  assert.equal(applyNameChange(files, prompt), null)
  assert.equal(nameChangeIsOnlyAsk(prompt), false)
  assert.equal(
    applyNameChangeFromThread(['yeah change thename all names to sulu calcs', prompt], files),
    null,
  )
  assert.match(followUpFindThought(prompt, files), /light\/dark|theme|switch/i)
  assert.doesNotMatch(followUpFindThought(prompt, files), /change the names/i)
  const plan = inferPlan(prompt, true, { hasPreview: true })
  assert.equal(plan.mode, 'fix')
  assert.match(plan.instructions.join('\n'), /theme|toggle|title/i)
  const source = codeForRequest(prompt, files)
  assert.match(source, /styles\.css/)
  assert.match(source, /theme|toggle|appearance/i)
  assert.match(source, /<title>/i)
})

test('a follow-up change with a screenshot still edits the project', () => {
  const plan = inferPlan('changethis heading it snot loking good', true, {
    attachments: true,
    hasPreview: true,
    answered: true,
  })
  assert.equal(plan.mode, 'fix')
  assert.equal(
    plan.instructions.some((item) => item.includes('FOLLOW-UP KIND: task')),
    true,
  )
})

test('a pasted screenshot of the current preview is a fix, not a describe-the-image chat', async () => {
  const { repairUserText } = await import('./requestAnalyze.ts')
  assert.equal(
    promptWithAttachments(repairUserText('go on'), { hasProject: true, hasImage: true, hasAttach: true }),
    PREVIEW_SCREENSHOT_PROMPT,
  )
  assert.equal(isQuestionIntent(PREVIEW_SCREENSHOT_PROMPT, { attachments: true, hasFiles: true }), false)
  assert.equal(classifyFollowUp(PREVIEW_SCREENSHOT_PROMPT, true, { attachments: true }), 'task')
  assert.equal(classifyFollowUp('broken image', true, { attachments: true }), 'task')
  const plan = inferPlan(PREVIEW_SCREENSHOT_PROMPT, true, { attachments: true, hasPreview: true })
  assert.equal(plan.mode, 'fix')
  assert.match(plan.instructions.join('\n'), /SCREENSHOT/)
})

test('asking whether we see an image is still chat even when a project exists', () => {
  assert.equal(looksLikeSeeOnlyAsk('hy do youse this iamge?'), true)
  assert.equal(isQuestionIntent('hy do youse this iamge?', { attachments: true, hasFiles: true }), true)
  assert.equal(classifyFollowUp('hy do youse this iamge?', true, { attachments: true }), 'question')
})

test('chat mode drops leftover ask cards', () => {
  const parsed = parseAgentRun(
    JSON.stringify({
      events: [
        {
          kind: 'ask',
          title: 'Before I build',
          intro: 'How should we use this image?',
          questions: [
            {
              id: 'kind',
              prompt: 'What is this for?',
              options: [{ id: 'dash', label: 'Dashboard' }],
            },
          ],
        },
        { kind: 'summary', text: 'Yes, I see the chart. It shows three series over time.' },
      ],
      files: {},
    }),
    inferPlan('hy do youse this iamge?', false, { attachments: true }),
  )
  assert.equal(parsed.events.some((item) => item.kind === 'ask'), false)
  const summary = parsed.events.find((item) => item.kind === 'summary')
  assert.equal(summary?.kind, 'summary')
  if (summary?.kind === 'summary') assert.match(summary.text, /see the chart/i)
})

test('ask replies skip a second question card', () => {
  assert.equal(isAskReply(formatSkipAsk()), true)
  const answered = inferPlan('make a coffee shop site', false, { answered: true })
  assert.equal(answered.mode, 'build')
  const fromCard = inferPlan('make a coffee shop site', false, { runMode: 'ask', answered: true })
  assert.equal(fromCard.mode, 'build')
})

test('build runs keep files even if the model also emits an ask card', () => {
  const parsed = parseAgentRun(
    JSON.stringify({
      mode: 'build',
      events: [
        {
          kind: 'ask',
          title: 'Before I build',
          intro: 'nope',
          questions: [{ id: 'kind', prompt: 'Kind', options: [{ id: 'a', label: 'A' }] }],
        },
        { kind: 'summary', text: 'Done.' },
      ],
      files: [{ path: 'index.html', content: '<html><body>calc</body></html>' }],
      previewHtml: '<html><body>calc</body></html>',
    }),
    inferPlan('build a calculator', false, { answered: true }),
  )
  assert.match(parsed.files['index.html'] || '', /calc/)
  assert.equal(parsed.events.some((item) => item.kind === 'ask'), false)
  assert.ok(parsed.previewHtml)
})

test('a calculator request is a live page, not a silent done', () => {
  const plan = inferPlan('build a calculator', false, { answered: true })
  assert.equal(plan.mode, 'build')
  assert.equal(plan.needsPreview, true)
  const app = inferPlan('build a calculator app', false, { answered: true })
  assert.equal(app.mode, 'app')
  assert.equal(app.needsPreview, true)
})

test('ask JSON does not keep leftover files', () => {
  const parsed = parseAgentRun(
    JSON.stringify({
      mode: 'ask',
      events: [
        {
          kind: 'ask',
          title: 'Before I build',
          intro: 'These change the site.',
          questions: [
            {
              id: 'kind',
              prompt: 'What is this for?',
              options: [{ id: 'cafe', label: 'Cafe' }],
            },
          ],
        },
        { kind: 'summary', text: 'Answer these and I will build.' },
      ],
      files: [{ path: 'index.html', content: '<h1>nope</h1>' }],
    }),
    inferPlan('make a website', false),
  )
  assert.equal(Object.keys(parsed.files).length, 0)
  assert.equal(parsed.events.some((item) => item.kind === 'ask'), true)
})

test('ask questions stay even when options are plain strings', () => {
  const parsed = parseAgentRun(
    JSON.stringify({
      events: [
        {
          kind: 'ask',
          title: 'Before I build',
          intro: 'Answer these and I will build.',
          questions: [
            { id: 'kind', prompt: 'What is this for?', options: ['Landing page', 'Game site', 'Shop'] },
          ],
        },
      ],
    }),
    inferPlan('build me a gta 6 landingpage platfrom', false),
  )
  const card = parsed.events.find((item) => item.kind === 'ask')
  assert.equal(card?.kind, 'ask')
  if (card?.kind === 'ask') {
    assert.equal(card.questions.length, 1)
    assert.equal(card.questions[0]?.options.length, 3)
    assert.equal(card.questions[0]?.options[0]?.label, 'Landing page')
  }
})

test('formatAskReply is something the planner recognizes', () => {
  const text = formatAskReply(
    [{ id: 'kind', prompt: 'What is this for?', options: [{ id: 'cafe', label: 'Cafe' }] }],
    { kind: ['Cafe'] },
  )
  assert.match(text, /^ANSWERS/m)
  assert.match(text, /Cafe/)
  assert.equal(isAskReply(text), true)
})

test('a missing ask card can be restored from the handoff line', () => {
  assert.equal(looksLikeAskHandoff('Answer these and I will build. You can skip and I will choose.'), true)
  const restored = restoreAskEvent({ files: {}, events: [] }, 'build me a gta 6 landingpage platfrom')
  const card = restored.events.find((item) => item.kind === 'ask')
  assert.equal(card?.kind, 'ask')
  if (card?.kind === 'ask') {
    assert.ok(card.questions.length >= 2)
    assert.ok(card.questions.every((question) => question.options.length >= 2))
  }
  const again = restoreAskEvent(restored, 'build me a gta 6 landingpage platfrom')
  assert.equal(again.events.filter((item) => item.kind === 'ask').length, 1)
})

test('applyAskAnswers locks the open card', () => {
  const next = applyAskAnswers(
    {
      files: {},
      events: [
        {
          kind: 'ask',
          title: 'Before I build',
          intro: '',
          questions: [{ id: 'kind', prompt: 'Kind', options: [{ id: 'a', label: 'A' }] }],
        },
      ],
    },
    { kind: ['A'] },
  )
  const card = next.events[0]
  assert.equal(card.kind, 'ask')
  if (card.kind === 'ask') assert.deepEqual(card.answers, { kind: ['A'] })
})

test('discarding a diff restores the previous file', () => {
  const next = applyDiffDecision(
    {
      files: { 'index.html': '<h1>new</h1>' },
      events: [
        {
          kind: 'diff',
          path: 'index.html',
          added: 1,
          removed: 1,
          lines: [],
          previous: '<h1>old</h1>',
        },
      ],
      previewHtml: '<h1>new</h1>',
    },
    'index.html',
    false,
  )
  assert.equal(next.files['index.html'], '<h1>old</h1>')
  const diff = next.events[0]
  assert.equal(diff.kind, 'diff')
  if (diff.kind === 'diff') assert.equal(diff.accepted, false)
})

test('kickoff does not dump a fake checklist before files exist', () => {
  const plan = inferPlan('make a coffee shop site', false, { answered: true })
  assert.equal(startingStep(plan), 'Building with strong defaults')
  const seed = kickoffEvents(plan)
  assert.deepEqual(seed, [])
  const starting = parseStreamingEvents('{"mode":"build"')
  assert.equal(starting.length, 0)
  const thought = parseStreamingEvents(
    '{"mode":"build","events":[{"kind":"thought","seconds":1,"text":"I will build a calculator',
  )
  assert.equal(thought[0]?.kind, 'thought')
  if (thought[0]?.kind === 'thought') assert.match(thought[0].text, /calculator/)
})

test('streaming file bodies show up as live diffs, not a silent card', async () => {
  const { liveWorkspaceFromStream } = await import('./agent.ts')
  const live = liveWorkspaceFromStream(
    { files: {}, events: [] },
    '{"mode":"build","files":[{"path":"index.html","content":"<!doctype html><html><body><h1>Vice City',
    [],
  )
  assert.match(live.files['index.html'] || '', /Vice City/)
  assert.equal(live.paths.includes('index.html'), true)
  const diff = live.events.find((item) => item.kind === 'diff' && item.path === 'index.html')
  assert.equal(diff?.kind, 'diff')
})

test('the live feed hides process theater and keeps file writes', () => {
  const shown = visibleWorkEvents([
    { kind: 'thought', seconds: 1, text: 'Analyzing your request' },
    { kind: 'note', title: 'Passed to the model', text: 'build a landing page' },
    { kind: 'todo', items: [{ text: 'Understand the request', done: false }] },
    { kind: 'folder', path: 'styles' },
    { kind: 'diff', path: 'index.html', added: 12, removed: 0, lines: [] },
    { kind: 'tool', name: 'write', args: { path: 'styles/main.css' } },
    { kind: 'tool', name: 'read', args: { path: 'styles/main.css' } },
    { kind: 'tool', name: 'read', args: { path: 'styles/main.css' } },
    { kind: 'result', name: 'read', ok: true, text: 'styles/main.css · 69 lines' },
  ])
  assert.deepEqual(
    shown.map((item) => (item.kind === 'tool' ? `${item.kind}:${item.name}` : item.kind)),
    ['diff', 'tool:write', 'tool:read'],
  )
})

test('answered pages become the file manifest', () => {
  const text = [
    'build me a gta 6 landingpage platform',
    'ANSWERS',
    '- What is this for?: Fan hub',
    '- Visual direction: Cinematic dark',
    '- Pages to include: Home, Trailer, Characters, News',
  ].join('\n')
  const plan = inferPlan(text, false, { answered: true })
  const joined = plan.deliverables.join(' ')
  assert.match(joined, /trailer\.html/i)
  assert.match(joined, /characters\.html/i)
  assert.match(joined, /news\.html/i)
  assert.doesNotMatch(joined, /about\.html/)
  assert.doesNotMatch(joined, /services\.html/)
  assert.match(joined, /styles\/main\.css/)
  assert.match(joined, /scripts\/main\.js/)
  assert.match(joined, /README\.md/)
  assert.equal(
    workspaceDelivered(plan, {
      files: { 'index.html': '<html></html>' },
      events: [],
      previewHtml: '<html></html>',
    }),
    false,
  )
  const full = {
    'index.html': '<link rel="stylesheet" href="styles/main.css"><script src="scripts/main.js"></script>',
    'trailer.html': '<h1>Trailer</h1>',
    'characters.html': '<h1>Characters</h1>',
    'news.html': '<h1>News</h1>',
    'styles/main.css': ':root { --bg: #0b0b0a; }',
    'scripts/main.js': 'document.querySelector(".nav-toggle")',
    'README.md': '# Fan hub\nOpen index.html',
  }
  assert.equal(missingManifestFiles(full, { files: plan.deliverables.map((item) => item.split('—')[0].trim()).filter((path) => /\.\w+$/.test(path)), folders: [] }).length, 0)
  assert.equal(workspaceDelivered(plan, { files: full, events: [], previewHtml: full['index.html'] }), true)
  const prompt = executeSystemPrompt(plan)
  const spec = promptManifestSpec(prompt)
  assert.ok(spec.files.includes('index.html'))
  assert.ok(spec.files.includes('styles/main.css'))
  assert.ok(spec.files.includes('scripts/main.js'))
  assert.ok(spec.files.includes('README.md'))
})

test('follow-up edits do not invent a read-everything checklist', async () => {
  const { kickoffEvents, startingStep, executeSystemPrompt } = await import('./agent.ts')
  const plan = inferPlan('change the calculator theme to look pro', true, { answered: true, hasPreview: true })
  assert.equal(plan.mode, 'fix')
  assert.equal(startingStep(plan), 'Updating the look')
  const seed = kickoffEvents(plan)
  assert.equal(seed.some((item) => item.kind === 'todo'), false)
  assert.doesNotMatch(seed.map((item) => (item.kind === 'thought' ? item.text : '')).join(' '), /Reading the current files/)
  const prompt = executeSystemPrompt(plan)
  assert.match(prompt, /call read/)
  assert.match(prompt, /kind "del"/)
  assert.match(prompt, /kind "add"/)
  assert.match(prompt, /what you see/)
  assert.match(prompt, /Past tense/)
})

test('follow-up kickoff is silent when the analysis pipeline already ran', () => {
  const plan = inferPlan('add a light dark theme switch', true, { hasPreview: true })
  const seed = kickoffEvents(plan, { pipeline: true })
  assert.deepEqual(seed, [])
})

test('streaming recovers each file into the workspace as it arrives', async () => {
  const { liveWorkspaceFromStream, progressTodos, recoverStreamingFiles } = await import('./agent.ts')
  const partial =
    '{"mode":"build","events":[{"kind":"todo","items":[{"text":"Write index.html","done":false},{"text":"Write styles/main.css","done":false}]}],"files":[{"path":"index.html","content":"<!doctype html><html></html>"},{"path":"styles/main.css","content":"body { color: tan'
  const recovered = recoverStreamingFiles(partial)
  assert.equal(recovered['index.html']?.includes('<!doctype html>'), true)
  assert.equal(recovered['styles/main.css']?.includes('body { color: tan'), true)
  const live = liveWorkspaceFromStream({ files: {}, events: [] }, partial, [])
  assert.equal(live.files['index.html']?.includes('<!doctype html>'), true)
  assert.equal(live.files['styles/main.css']?.includes('body { color: tan'), true)
  assert.equal(live.files['styles/.keep'], undefined)
  assert.equal(live.paths.includes('index.html'), true)
  assert.equal(
    live.events.some((item) => item.kind === 'todo'),
    false,
  )
  assert.equal(
    live.events.some((item) => item.kind === 'diff' && item.path === 'index.html') || Boolean(live.files['index.html']),
    true,
  )
  const objectForm = recoverStreamingFiles('{"files":{"index.html":"<!doctype html><title>Hi"}')
  assert.equal(objectForm['index.html']?.includes('<!doctype html>'), true)
  const fromDiff = recoverStreamingFiles(
    '',
    [
      {
        kind: 'diff',
        path: 'scripts/main.js',
        added: 1,
        removed: 0,
        hidden: 0,
        lines: [{ kind: 'add', text: 'console.log("ok")' }],
      },
    ],
  )
  assert.equal(fromDiff['scripts/main.js'], 'console.log("ok")')
  const advanced = progressTodos(
    [{ kind: 'todo', items: [{ text: 'Write README.md', done: false }, { text: 'Verify', done: false }] }],
    { 'README.md': '# Site' },
  )
  assert.equal(advanced[0]?.kind, 'todo')
  if (advanced[0]?.kind === 'todo') {
    assert.equal(advanced[0].items[0]?.done, true)
    assert.equal(advanced[0].items[1]?.done, false)
  }
})

test('streaming does not replace a finished file with a truncated body', async () => {
  const { liveWorkspaceFromStream, absorbFiles, previewFromFiles, mergeWorkspace } = await import('./agent.ts')
  const complete = '(function () { const n = 1; console.log(n); })();'
  const live = liveWorkspaceFromStream(
    { files: { 'app.js': complete }, events: [] },
    '{"mode":"build","files":[{"path":"app.js","content":"(function () { const n = 1',
    [],
  )
  assert.equal(live.files['app.js'], complete)
  const kept = absorbFiles(
    { files: { 'app.js': complete }, events: [] },
    { 'app.js': '(function () { const n = 1' },
  )
  assert.equal(kept.files['app.js'], complete)
  const preview = previewFromFiles(
    {
      'index.html': '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body><h1>Hi</h1></body></html>',
      'styles.css': ':root{--accent:#f54e00}body{background:#0b0b0a;color:var(--accent)}',
    },
    '<h1>stale</h1>',
  )
  assert.match(preview, /#f54e00/)
  assert.doesNotMatch(preview, /stale/)
})

test('a shorter heading edit still refreshes the live preview', async () => {
  const { liveWorkspaceFromStream, mergeWorkspace, previewFromFiles } = await import('./agent.ts')
  const old = '<!doctype html><html><body><h1>Calculator</h1></body></html>'
  const next = '<!doctype html><html><body><h1>Calc</h1></body></html>'
  const live = liveWorkspaceFromStream(
    { files: { 'index.html': old }, events: [], previewHtml: old },
    `{"mode":"fix","files":[{"path":"index.html","content":${JSON.stringify(next)}}],"previewHtml":""}`,
    [],
  )
  assert.match(live.files['index.html'], /<h1>Calc<\/h1>/)
  assert.match(live.previewHtml || '', /<h1>Calc<\/h1>/)
  const merged = mergeWorkspace(
    { files: { 'index.html': old }, events: [], previewHtml: old },
    { files: { 'index.html': next }, events: [], previewHtml: '' },
  )
  assert.match(merged.previewHtml || '', /<h1>Calc<\/h1>/)
  assert.match(previewFromFiles({ 'index.html': next }, old), /<h1>Calc<\/h1>/)
  assert.doesNotMatch(previewFromFiles({ 'index.html': next }, old), /Calculator/)
})

test('follow-up file edits show minus and plus against the previous file', () => {
  const previous = { 'index.html': '<h1>Calculator</h1>\n<p>hi</p>', 'app.js': 'console.log(1)' }
  const next = { 'index.html': '<h1>Calc</h1>\n<p>hi</p>', 'app.js': 'console.log(1)' }
  const events = withChangeDiffs(
    [{ kind: 'diff', path: 'index.html', added: 2, removed: 0, lines: [{ kind: 'add', text: '<h1>Calc</h1>' }] }],
    next,
    previous,
  )
  const diff = events.find((item) => item.kind === 'diff')
  assert.equal(diff?.kind, 'diff')
  if (diff?.kind === 'diff') {
    assert.ok(diff.removed > 0)
    assert.ok(diff.added > 0)
    assert.equal(
      diff.lines.some((line) => line.kind === 'del' && line.text.includes('Calculator')),
      true,
    )
    assert.equal(
      diff.lines.some((line) => line.kind === 'add' && line.text.includes('Calc')),
      true,
    )
  }
  const attached = attachChangeDiffs(previous, {
    files: next,
    events: [
      { kind: 'diff', path: 'index.html', added: 40, removed: 0, lines: [{ kind: 'add', text: '<h1>Calculator</h1>' }] },
      { kind: 'diff', path: 'index.html', added: 2, removed: 0, lines: [{ kind: 'add', text: '<h1>Calc</h1>' }] },
    ],
  }, 1)
  const turn = attached.events[1]
  assert.equal(turn?.kind, 'diff')
  if (turn?.kind === 'diff') {
    assert.ok(turn.removed > 0)
    assert.equal(turn.lines.some((line) => line.kind === 'del'), true)
  }
  const recap = spokenRecap({
    files: next,
    events: diff ? [diff] : [],
    previewHtml: '<html></html>',
    previewTitle: 'Preview',
  })
  assert.match(recap, /index\.html/)
  assert.doesNotMatch(recap, /Wrote index\.html, app\.js/)
  assert.doesNotMatch(recap, /Preview is ready/)
  assert.match(recap, /Calc|Changed|Updated/)
})

test('codeForRequest sends the heading source the user asked to change', () => {
  const text = codeForRequest('change this heading', {
    'index.html': '<header><h1>Calculator</h1></header>',
    'styles.css': 'body { color: red }',
  })
  assert.match(text, /REQUEST CODE/)
  assert.match(text, /Calculator/)
  assert.match(text, /index\.html/)
})

test('header name edits target the visible brand, not only the document title', () => {
  const pad = '<!-- spacer -->\n'.repeat(400)
  const text = codeForRequest('change the name on the header to lipjumba', {
    'index.html': `<!doctype html><html><head><title>Ember Calculator - everyday math, kept warm</title></head><body>${pad}<span class="pill">EMBER TOOLS</span>\n<h1>Calculator</h1></body></html>`,
  })
  assert.match(text, /EMBER TOOLS/)
  assert.match(text, /<h1>Calculator/)
  assert.match(text, /visible brand|pill|h1/)
})

test('seeing-and-fixing talk stays above the diff; the recap is the conclusion', () => {
  const parsed = parseAgentRun(
    JSON.stringify({
      events: [
        {
          kind: 'summary',
          text: "I can see the image. Your heading reads Calculato. I'll clean up the heading so it reads as a professional tool.\n\nLet me update the heading copy in index.html.",
        },
        {
          kind: 'diff',
          path: 'index.html',
          added: 1,
          removed: 1,
          lines: [
            { kind: 'del', text: '<h1>Calculato</h1>' },
            { kind: 'add', text: '<h1>Calculator</h1>' },
          ],
        },
      ],
      files: { 'index.html': '<h1>Calculator</h1>' },
    }),
  )
  const thought = parsed.events.find((item) => item.kind === 'thought')
  assert.equal(thought?.kind, 'thought')
  if (thought?.kind === 'thought') assert.match(thought.text, /Calculato|see the image/i)
  const recap = spokenRecap(parsed)
  assert.doesNotMatch(recap, /Let me update/)
  assert.doesNotMatch(recap, /I'll clean/)
  assert.match(recap, /index\.html|Calculator/)
})

test('a let-me-read thought is not the closing reply', () => {
  const recap = spokenRecap({
    files: { 'index.html': '<h1>Calc</h1>' },
    events: [
      {
        kind: 'summary',
        text: "I'll add a theme toggle so you can switch the whole calculator between dark and light. Let me read the current files first to change them precisely.",
      },
    ],
    previewHtml: '<html></html>',
    previewTitle: 'Preview',
  })
  assert.doesNotMatch(recap, /Let me read/)
  assert.doesNotMatch(recap, /I'll add a theme/)
})

test('Done after reads is not treated as a finished edit', () => {
  const files = { 'index.html': '<h1>Calc</h1>', 'styles.css': 'body{}', 'app.js': '' }
  const recap = spokenRecap({
    files,
    events: [
      { kind: 'tool', name: 'read', args: { path: 'index.html' } },
      { kind: 'tool', name: 'read', args: { path: 'styles.css' } },
      { kind: 'summary', text: 'Done.' },
    ],
    previewHtml: '<html></html>',
  })
  assert.doesNotMatch(recap, /^Done\.?$/i)
  assert.match(recap, /did not change|Retry/i)
  const plan = inferPlan('add a light dark theme switch', true, { hasPreview: true })
  assert.equal(workspaceDelivered(plan, { files, events: [], previewHtml: '<html></html>' }, files), false)
  assert.equal(
    workspaceDelivered(
      plan,
      { files: { ...files, 'index.html': '<h1>Calc</h1><button>Theme</button>' }, events: [], previewHtml: '<html></html>' },
      files,
    ),
    true,
  )
})
