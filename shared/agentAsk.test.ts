import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyAskAnswers,
  applyDiffDecision,
  attachChangeDiffs,
  codeForRequest,
  formatAskReply,
  formatSkipAsk,
  inferPlan,
  isAskReply,
  isQuestionIntent,
  parseAgentRun,
  requestNeedsAsk,
  spokenRecap,
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

test('formatAskReply is something the planner recognizes', () => {
  const text = formatAskReply(
    [{ id: 'kind', prompt: 'What is this for?', options: [{ id: 'cafe', label: 'Cafe' }] }],
    { kind: ['Cafe'] },
  )
  assert.match(text, /^ANSWERS/m)
  assert.match(text, /Cafe/)
  assert.equal(isAskReply(text), true)
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

test('kickoff events and streaming thoughts show before files exist', async () => {
  const { kickoffEvents, parseStreamingEvents, startingStep } = await import('./agent.ts')
  const plan = inferPlan('make a coffee shop site', false, { answered: true })
  assert.equal(startingStep(plan), 'Building with strong defaults')
  const seed = kickoffEvents(plan)
  assert.equal(seed[0]?.kind, 'thought')
  assert.equal(seed.some((item) => item.kind === 'todo'), true)
  assert.equal(seed.some((item) => item.kind === 'folder' && item.path === 'styles'), true)
  const todo = seed.find((item) => item.kind === 'todo')
  assert.equal(todo?.kind, 'todo')
  if (todo?.kind === 'todo') {
    assert.equal(todo.items.some((item) => item.text === 'Write index.html'), true)
    assert.equal(todo.items.some((item) => item.text === 'Write styles/main.css'), true)
  }
  const starting = parseStreamingEvents('{"mode":"build"')
  assert.equal(starting[0]?.kind, 'thought')
  const thought = parseStreamingEvents(
    '{"mode":"build","events":[{"kind":"thought","seconds":1,"text":"I will build a calculator',
  )
  assert.equal(thought[0]?.kind, 'thought')
  if (thought[0]?.kind === 'thought') assert.match(thought[0].text, /calculator/)
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
  assert.match(prompt, /Do not ls, read, grep, explore/)
  assert.match(prompt, /kind "del"/)
  assert.match(prompt, /kind "add"/)
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
  const todo = live.events.find((item) => item.kind === 'todo')
  assert.equal(todo?.kind, 'todo')
  if (todo?.kind === 'todo') {
    assert.equal(todo.items[0]?.done, true)
    assert.equal(todo.items[1]?.done, true)
  }
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
  const { liveWorkspaceFromStream, absorbFiles, previewFromFiles } = await import('./agent.ts')
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
