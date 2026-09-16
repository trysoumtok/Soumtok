import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TEST_HUB_SYSTEM,
  buildPreviewHtml,
  buildTestHubApiMessages,
  extractBuildArtifacts,
  filesFromFences,
} from './testHub.ts'

test('test hub system prompt forbids phantom repo access', () => {
  assert.match(TEST_HUB_SYSTEM, /no agent harness/i)
  assert.match(TEST_HUB_SYSTEM, /explicitly attach/i)
  assert.match(TEST_HUB_SYSTEM, /memory/i)
})

test('filesFromFences reads file paths from code blocks', () => {
  const text = 'Here:\n```html file="index.html"\n<!DOCTYPE html><html></html>\n```'
  const files = filesFromFences(text)
  assert.equal(files['index.html']?.includes('<!DOCTYPE html>'), true)
})

test('extractBuildArtifacts merges fences and raw html', () => {
  const files = extractBuildArtifacts('```css file="styles/main.css"\nbody{color:red}\n```')
  assert.equal(files['styles/main.css'], 'body{color:red}')
  const preview = buildPreviewHtml(files)
  assert.match(preview, /color:red/)
})

test('extractBuildArtifacts promotes html body fragments to index.html', () => {
  const files = extractBuildArtifacts('```html\n<body><main>Calc</main></body>\n```')
  assert.ok(files['index.html']?.includes('<main>Calc</main>'))
  assert.match(buildPreviewHtml(files), /Calc/)
})

test('extractBuildArtifacts accepts filename as fence info', () => {
  const files = extractBuildArtifacts('```index.html\n<!DOCTYPE html><html><body>Hi</body></html>\n```')
  assert.match(files['index.html'] || '', /Hi/)
})

test('extractBuildArtifacts peels css/js fences glued onto html so preview stays clean', () => {
  const text = `\`\`\`html file="index.html"
<!DOCTYPE html><html><body><div class="calculator">0</div></body></html>
\`\`\`css file="style.css"
body{background:#111}.calculator{color:#fff}
\`\`\`javascript file="script.js"
console.log(1)
\`\`\``
  const files = extractBuildArtifacts(text)
  assert.equal(files['index.html']?.includes('```'), false)
  assert.match(files['index.html'] || '', /calculator/)
  assert.match(files['style.css'] || '', /background:#111/)
  assert.match(files['script.js'] || '', /console\.log/)
  const preview = buildPreviewHtml(files)
  assert.match(preview, /calculator/)
  assert.equal(preview.includes('```'), false)
  assert.equal(/background:#111[\s\S]*background:#111/.test(preview), false)
})

test('buildPreviewHtml strips trailing fence junk after </html>', () => {
  const preview = buildPreviewHtml({
    'index.html': `<!DOCTYPE html><html><body><h1>Hi</h1></body></html>
\`\`\`css file="style.css"
body{color:red}
`,
    'style.css': 'body{color:red}',
  })
  assert.match(preview, /<h1>Hi<\/h1>/)
  assert.equal(preview.includes('```'), false)
  assert.match(preview, /color:red/)
})

test('buildTestHubApiMessages prepends system and keeps attachments', () => {
  const msgs = buildTestHubApiMessages([
    { role: 'user', content: 'Fix this', files: [{ name: 'a.ts', mime: 'text/plain', text: 'code' }] },
    { role: 'assistant', content: 'Here is a fix' },
  ])
  assert.equal(msgs[0].role, 'system')
  assert.equal(msgs[0].content, TEST_HUB_SYSTEM)
  assert.equal(msgs[1].files?.[0]?.name, 'a.ts')
})

test('buildTestHubApiMessages includes project file memory', () => {
  const msgs = buildTestHubApiMessages([{ role: 'user', content: 'Make the button blue' }], {
    files: { 'index.html': '<button>Go</button>' },
  })
  assert.match(msgs[0].content, /Current project files/)
  assert.match(msgs[0].content, /index\.html/)
  assert.match(msgs[0].content, /<button>Go<\/button>/)
})

test('highlightCode does not leak class= into javascript source', async () => {
  const { highlightCode } = await import('./testHub.ts')
  const out = highlightCode(`const display = document.getElementById('display');\n// hello`, 'javascript')
  assert.match(out, /<span class="hl-str">'display'<\/span>/)
  assert.match(out, /<span class="hl-cmt">\/\/ hello<\/span>/)
  assert.match(out, /<span class="hl-kw">const<\/span>/)
  assert.equal(/getElementById\(class=/.test(out), false)
  assert.equal(out.includes('class=class='), false)
})

test('formatProseHtml turns markdown into spaced cards', async () => {
  const { formatProseHtml } = await import('./testHub.ts')
  const out = formatProseHtml('### Features\n\nIntro line.\n\n- **Basic:** add and subtract\n- **Keys:** `Enter`')
  assert.match(out, /<h3>Features<\/h3>/)
  assert.match(out, /<p>Intro line\.<\/p>/)
  assert.match(out, /<strong>Basic:<\/strong>/)
  assert.match(out, /<code>Enter<\/code>/)
  assert.match(out, /<ul>/)
})
