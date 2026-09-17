import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeUserRequest, analysisPipelineEvents, formatAnalyzedRequest, repairUserText } from './requestAnalyze.ts'

test('follow-up with sign in page stays an edit, not Soumtok product chat', async () => {
  const raw = 'add more pages mak eit so cleaand powerful ada sign in page'
  const files = {
    'index.html': '<html><head><title>Clinic</title></head><body><nav><a href="index.html">Home</a></nav></body></html>',
    'style.css': 'body { margin: 0; }',
  }
  const analysis = analyzeUserRequest(raw, { hasFiles: true, files })
  assert.equal(analysis.kind, 'edit')
  assert.match(analysis.meaning, /sign in page/i)
  const { classifyFollowUp, inferPlan } = await import('./agent.ts')
  assert.equal(classifyFollowUp(raw, true), 'task')
  const plan = inferPlan(raw, true, { hasPreview: true, analysis })
  assert.notEqual(plan.mode, 'chat')
})

test('a request to add a real logo and more pages is an edit, not an inventory', async () => {
  const raw = 'can you ad tehreal svg real logo of kfc and ad any page inmy webioste'
  const repaired = repairUserText(raw)
  assert.match(repaired, /can you add the real svg/i)
  assert.match(repaired, /add any page in my website/i)
  const files = {
    'index.html': '<div class="logo">KFC</div>',
    'about.html': '<h1>About</h1>',
    'services.html': '<h1>Menu</h1>',
    'contact.html': '<h1>Contact</h1>',
  }
  const analysis = analyzeUserRequest(raw, { hasFiles: true, files })
  assert.equal(analysis.kind, 'edit')
  assert.match(analysis.meaning, /svg logo/i)
  assert.match(analysis.meaning, /more pages/i)
  assert.equal(
    analysis.dont.some((item) => /describe the current logo|list pages/i.test(item)),
    true,
  )
  assert.match(analysis.thought, /svg logo|more pages/i)
  const { inferPlan, classifyFollowUp, looksLikeQuestion } = await import('./agent.ts')
  assert.equal(looksLikeQuestion(raw), false)
  assert.equal(classifyFollowUp(raw, true), 'task')
  const plan = inferPlan(raw, true, { hasPreview: true, analysis })
  assert.equal(plan.mode, 'fix')
  assert.match(plan.instructions.join('\n'), /svg|logo|page/i)
})

test('repairs theme-toggle typos into real English', () => {
  const repaired = repairUserText('add like a them change to switch form dark tolight theme aperance')
  assert.match(repaired, /theme change/i)
  assert.match(repaired, /from dark to light/i)
  assert.match(repaired, /appearance/i)
})

test('a messy theme request becomes a theme job, not a rename or GitHub connect', () => {
  const files = {
    'index.html':
      '<title>dark go on - everyday math</title><span class="pill">SULU CALCS</span><h1>Calculator</h1>',
  }
  const analysis = analyzeUserRequest('add like a them change to switch form dark tolight theme aperance', {
    hasFiles: true,
    files,
  })
  assert.equal(analysis.kind, 'theme')
  assert.match(analysis.meaning, /dark and light|light\/dark|theme/i)
  assert.equal(
    analysis.dont.some((item) => /title/i.test(item)),
    true,
  )
  assert.equal(
    analysis.dont.some((item) => /rename|github/i.test(item)),
    true,
  )
  assert.match(analysis.thought, /theme|switch/i)
  assert.doesNotMatch(analysis.thought, /change the names/i)
  const block = formatAnalyzedRequest(analysis)
  assert.match(block, /ANALYZED REQUEST/)
  assert.match(block, /Intent: theme/)
  assert.match(block, /SULU CALCS/)
  assert.doesNotMatch(block, /Intent: rename/)
  assert.doesNotMatch(block, /Intent: connect/)
})

test('footer theme wording is placed in the footer', () => {
  const analysis = analyzeUserRequest(
    'i mean add a scetio natthe footer for them changer cahnegto light to dark go on',
    { hasFiles: true, files: { 'index.html': '<span class="pill">SULU CALCS</span>' } },
  )
  assert.equal(analysis.kind, 'theme')
  assert.equal(analysis.where, 'footer')
  assert.match(analysis.meaning, /footer/i)
})

test('a real rename is still a rename', () => {
  const analysis = analyzeUserRequest('yeah change thename all names to sulu calcs', {
    hasFiles: true,
    files: { 'index.html': '<span class="pill">EMBER TOOLS</span>' },
  })
  assert.equal(analysis.kind, 'rename')
  assert.match(analysis.renameTo || '', /sulu calcs/i)
})

test('connect GitHub only when they actually asked to connect', () => {
  const theme = analyzeUserRequest('add a light theme toggle', { hasFiles: true })
  assert.notEqual(theme.kind, 'connect')
  const connect = analyzeUserRequest('connect github please')
  assert.equal(connect.kind, 'connect')
  assert.equal(connect.connectProvider, 'github')
})

test('a screenshot of the current preview is an in-place edit', () => {
  const analysis = analyzeUserRequest(
    'Fix the issues shown in this screenshot of the current preview. This image is the live page of this project.',
    {
      hasFiles: true,
      hasImage: true,
      attachments: true,
      files: { 'index.html': '<header>KFC</header>', 'styles/main.css': 'nav{display:flex}' },
    },
  )
  assert.equal(analysis.kind, 'edit')
  assert.match(analysis.meaning, /screenshot|preview/i)
  assert.equal(
    analysis.dont.some((item) => /describ/i.test(item)),
    true,
  )
})

test('analyzed meaning is what the planner gives the model as the goal', async () => {
  const { inferPlan } = await import('./agent.ts')
  const raw = 'add like a them change to switch form dark tolight theme aperance'
  const analysis = analyzeUserRequest(raw, {
    hasFiles: true,
    files: { 'index.html': '<span class="pill">SULU CALCS</span>' },
  })
  const plan = inferPlan(raw, true, { hasPreview: true, analysis })
  assert.match(plan.goal, /dark and light|appearance|theme/i)
  assert.doesNotMatch(plan.goal, /tolight|aperance/)
  assert.equal(
    plan.instructions.some((item) => /ANALYZED REQUEST/i.test(item)),
    true,
  )
})

test('the feed always shows analyzing, then passed to the model', () => {
  const analysis = analyzeUserRequest('add a light dark theme switch', { hasFiles: true })
  assert.equal(analysis.kind, 'theme')
  assert.deepEqual(analysisPipelineEvents(analysis), [])
})

test('go is a confirmation to execute, not a canned build', () => {
  const analysis = analyzeUserRequest('go', { hasFiles: true })
  assert.equal(analysis.kind, 'execute')
  assert.equal(analysis.meaning, 'go')
})

test('make me an app in an open folder is a build, not an in-place edit', () => {
  const analysis = analyzeUserRequest('hi make me a 3d rubis cube simulation app', { hasFiles: true })
  assert.equal(analysis.kind, 'build')
})

test('a hello does not run the coding analyze pipeline', () => {
  const analysis = analyzeUserRequest('hello')
  assert.equal(analysis.kind, 'chat')
  assert.deepEqual(analysisPipelineEvents(analysis), [])
})

test('any prompt kind: wipe, CLI build, and run existing', () => {
  const wipe = analyzeUserRequest('delete everything in this folder', { hasFiles: true })
  assert.equal(wipe.kind, 'wipe')
  const cli = analyzeUserRequest('make a node cli that greets stdin', { hasFiles: true })
  assert.equal(cli.kind, 'build')
  const run = analyzeUserRequest('start the dev server', { hasFiles: true })
  assert.equal(run.kind, 'run')
  assert.match(run.meaning, /start the dev server/i)
  const messyRun = analyzeUserRequest('isit okay now runmy localhost', { hasFiles: true })
  assert.equal(messyRun.kind, 'run')
  assert.match(messyRun.meaning, /localhost/i)
  const isItRun = analyzeUserRequest('is it okay now run my localhost', { hasFiles: true })
  assert.equal(isItRun.kind, 'run')
})

test('how do I fix something in my dashboard is coding work, not product chat', () => {
  const analysis = analyzeUserRequest('how do I fix the branch selector in my dashboard', { hasFiles: true })
  assert.notEqual(analysis.kind, 'chat')
})

test('generate an image is image kind even with typos and an open project', () => {
  const analysis = analyzeUserRequest('geneeare me an egale bird iamge', { hasFiles: true })
  assert.equal(analysis.kind, 'image')
  assert.match(analysis.repaired, /generate me an eagle bird image/i)
  assert.equal(
    analysis.dont.some((item) => /list_dir|read, grep/i.test(item)),
    true,
  )
  const messy = analyzeUserRequest('genearte an egale image on sea flyingabovetehsea', { hasFiles: true })
  assert.equal(messy.kind, 'image')
  const genera = analyzeUserRequest('genera an eagle image for me', { hasFiles: true })
  assert.equal(genera.kind, 'image')
  const garbledTools = analyzeUserRequest('addtols that agent can rea ad undetand misplell', { hasFiles: true })
  assert.match(garbledTools.repaired, /add tools/i)
  assert.match(garbledTools.repaired, /\bread\b/i)
  const intoHero = analyzeUserRequest('add an eagle image to the hero', { hasFiles: true })
  assert.notEqual(intoHero.kind, 'image')
  const gallery = analyzeUserRequest('make me an image gallery', { hasFiles: true })
  assert.notEqual(gallery.kind, 'image')
  const explain = analyzeUserRequest('explain this image for me', { hasFiles: true })
  assert.notEqual(explain.kind, 'image')
  const dancing = analyzeUserRequest('geneearte a new one with a man dancing', {
    hasFiles: true,
    priorImage: true,
    lastKind: 'image',
  })
  assert.equal(dancing.kind, 'image')
  const dancingFresh = analyzeUserRequest('geneearte a new one with a man dancing', { hasFiles: true })
  assert.equal(dancingFresh.kind, 'image')
})
