import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TEST_HUB_SYSTEM,
  buildPreviewHtml,
  buildTestHubApiMessages,
  extractBuildArtifacts,
  filesFromFences,
  listArtifactPaths,
  mergeArtifactFiles,
  mergeFileBodies,
  workspaceDisplayFiles,
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

test('extractBuildArtifacts ignores reasoning prose before first build fence', () => {
  const text = `Let me think about the cube geometry for a while…
\`\`\`html file="index.html"
<!DOCTYPE html><html><body><div id="app">cube</div></body></html>
\`\`\``
  const files = extractBuildArtifacts(text)
  assert.match(files['index.html'] || '', /cube/)
})

test('buildPreviewHtml runs JS instead of showing raw source when index.html is mislabeled script', () => {
  const preview = buildPreviewHtml({
    'index.html': `const state = { current: '0', previous: null, operator: null, overwrite: true };`,
    'style.css': 'body{margin:0;font-family:system-ui}',
  })
  assert.equal(preview.includes('const state'), true)
  assert.match(preview, /<script[\s>]/)
  assert.doesNotMatch(preview, /<body>\s*const state/)
})

test('buildPreviewHtml wraps raw JS inside html body in script tags', () => {
  const preview = buildPreviewHtml({
    'index.html': `<!DOCTYPE html><html><head></head><body>
const state = { current: '0' };
document.body.innerHTML = '<button>1</button>';
</body></html>`,
  })
  assert.match(preview, /<script[\s\S]*const state/)
  assert.match(preview, /innerHTML = '<button>1<\/button>'/)
})

test('mergeFileBodies keeps full file when a later fence is a tiny snippet', () => {
  const full = 'let current = "0";\nfunction render(){}\n'.repeat(20)
  const snippet = 'function inputDecimal() {}'
  const out = mergeFileBodies(full, snippet)
  assert.ok(out.length > 500)
  assert.ok(!out.includes('inputDecimal'))
})

test('mergeFileBodies concatenates separate script blocks for the same file', () => {
  const a = 'let x = 1;'
  const b = 'function render() { return x; }'
  assert.match(mergeFileBodies(a, b), /let x = 1/)
  assert.match(mergeFileBodies(a, b), /function render/)
})

test('filesFromParseSegments stitches many script.js blocks like the chat UI', () => {
  const text = `\`\`\`javascript file="script.js"
function init() { return 1; }
\`\`\`
Some prose here.
\`\`\`javascript file="script.js"
const groups = [];
\`\`\`
\`\`\`javascript file="script.js"
function isSolved() { return true; }
\`\`\``
  const files = extractBuildArtifacts(text)
  const js = files['script.js'] || ''
  assert.match(js, /function init/)
  assert.match(js, /const groups/)
  assert.match(js, /function isSolved/)
})

test('filesFromFences merges multiple javascript fences into one script.js', () => {
  const text = `\`\`\`javascript file="script.js"
let a = 1;
\`\`\`
\`\`\`javascript file="script.js"
function render() { return a; }
\`\`\``
  const files = extractBuildArtifacts(text)
  assert.match(files['script.js'] || '', /let a = 1/)
  assert.match(files['script.js'] || '', /function render/)
})

test('workspaceDisplayFiles adds index.html and base css for js-only builds', () => {
  const files = workspaceDisplayFiles({ 'script.js': 'document.body.innerHTML="hi"' })
  assert.match(files['index.html'] || '', /<body>/i)
  assert.match(files['style.css'] || '', /margin:0/)
})

test('mergeArtifactFiles lets the latest chunk override the same path', () => {
  const turn1 =
    '```javascript file="script.js"\nconst V = { add: 1 };\n```\n```css file="style.css"\nbody{margin:0}\n```'
  const turn2 = '```javascript file="script.js"\nfunction resize() { canvas.width = 1; }\n```'
  const files = mergeArtifactFiles([turn1, turn2])
  assert.match(files['script.js'] || '', /function resize/)
  assert.match(files['style.css'] || '', /margin:0/)
})

test('listArtifactPaths sorts html css js for the Code panel', () => {
  const paths = listArtifactPaths({
    'script.js': 'x',
    'style.css': 'y',
    'index.html': '<html></html>',
  })
  assert.deepEqual(paths, ['index.html', 'style.css', 'script.js'])
})

test('extractBuildArtifacts keeps package.json when path is set', () => {
  const files = extractBuildArtifacts('```json file="package.json"\n{"name":"demo"}\n```')
  assert.match(files['package.json'] || '', /"name":"demo"/)
})

test('buildPreviewHtml inlines script.js when index already has a CDN script tag', () => {
  const preview = buildPreviewHtml({
    'index.html':
      '<!DOCTYPE html><html><head></head><body><canvas id="c"></canvas><script src="https://cdn.example/three.min.js"></script></body></html>',
    'script.js': 'document.getElementById("c").style.background = "rgb(0,128,0)";',
  })
  assert.match(preview, /getElementById\("c"\)/)
  assert.match(preview, /data-soumtok-preview-bridge/)
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
