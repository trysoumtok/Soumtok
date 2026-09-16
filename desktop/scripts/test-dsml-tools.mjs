import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { sanitizeAssistantText, stripDsmlFromText } = require('../src/main/dsmlTools.js')

const sample = `< | | DSML | | calls>
< | | DSML | | invoke name="shell">
< | | DSML | | parameter name="command" >cd /d "D:\\recovery\\77th junction" && dir /b /a</ | | DSML | | parameter>
< | | DSML | | parameter name="description" >List top-level files in workspace</ | | DSML | | parameter>
</ | | DSML | | invoke>
</ | | DSML | | calls>`

const { cleaned, calls } = sanitizeAssistantText(sample)
if (cleaned) {
  console.error('FAIL: cleaned should be empty, got', cleaned)
  process.exit(1)
}
if (!calls.length || calls[0].name !== 'list_dir') {
  console.error('FAIL: expected list_dir call', calls)
  process.exit(1)
}
if (stripDsmlFromText(sample).length > 0) {
  console.error('FAIL: strip left text', stripDsmlFromText(sample))
  process.exit(1)
}

const xml = `<write path="hello.js">export const n = 1\n</write>`
const xmlParsed = sanitizeAssistantText(xml)
if (!xmlParsed.calls.some((c) => c.name === 'write' && JSON.parse(c.arguments).path === 'hello.js')) {
  console.error('FAIL: expected write from XML', xmlParsed)
  process.exit(1)
}

const fakeChat = `Progress — leftover typos.
<read>
src/main.ts
</read>
<terminal command="cd /d D:\\rubiscube && powershell -Command Get-Content src/main.ts" />
Now I can see the lines.
<diff path="src/main.ts">
@@
- btnSolve.disabled = busy|history.length === 0;
+ btnSolve.disabled = busy || history.length === 0;
@@
- if (k === "z" && (e.ctrlKey|e.metaKey)) {
+ if (k === "z" && (e.ctrlKey || e.metaKey)) {
*** End Patch
</diff>`
const parsed = sanitizeAssistantText(fakeChat)
const names = parsed.calls.map((c) => c.name)
if (!names.includes('read') || !names.includes('diff')) {
  console.error('FAIL: expected read+diff from fake XML chat', parsed.calls)
  process.exit(1)
}
const diffs = parsed.calls.filter((c) => c.name === 'diff').map((c) => JSON.parse(c.arguments))
if (!diffs.some((d) => d.path === 'src/main.ts' && /busy \|\| history/.test(d.new_string))) {
  console.error('FAIL: expected || fix hunk', diffs)
  process.exit(1)
}
if (/<read>|<diff |<terminal /i.test(parsed.cleaned)) {
  console.error('FAIL: cleaned still has XML', parsed.cleaned)
  process.exit(1)
}

const {
  parseFileReadViaShell,
  normalizeTerminalCommand,
  commandBlockedPermissive,
  locateWorkspaceFile,
} = require('../src/main/desktopTools.js')
const fs = require('fs')
const path = require('path')
const { fileURLToPath } = require('url')
const desktopRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const viaPs = parseFileReadViaShell(
  'cd /d D:\\proj && powershell -Command "$i=1; Get-Content src/app.ts | ForEach-Object { if ($i -in 135,152,169) { $i++ } }"',
)
if (viaPs?.path !== 'src/app.ts' || viaPs.startLine !== 135 || viaPs.endLine !== 169) {
  console.error('FAIL: expected ranged Get-Content rewrite', viaPs)
  process.exit(1)
}

const unwrapped = normalizeTerminalCommand('cd /d D:\\proj && npx tsc --noEmit')
if (!unwrapped.ok || unwrapped.cmd !== 'npx tsc --noEmit') {
  console.error('FAIL: expected cd /d unwrap', unwrapped)
  process.exit(1)
}
if (commandBlockedPermissive('npx tsc --noEmit')) {
  console.error('FAIL: tsc should be allowed in permissive mode')
  process.exit(1)
}
if (commandBlockedPermissive('node test.mjs 2>&1')) {
  console.error('FAIL: 2>&1 should be allowed in permissive mode')
  process.exit(1)
}
if (commandBlockedPermissive('npx tsc --noEmit *> test-out.txt')) {
  console.error('FAIL: *> file.txt should be allowed in permissive mode')
  process.exit(1)
}
const missingRel = locateWorkspaceFile(desktopRoot, 'test-out.txt', { workspaceBoundary: true })
if (missingRel.rel !== 'test-out.txt' || /src[/\\]test-out/.test(missingRel.rel)) {
  console.error('FAIL: non-source files must not remap to src/', missingRel)
  process.exit(1)
}

const termSrc = fs.readFileSync(path.join(desktopRoot, 'src/renderer/terminalPanel.js'), 'utf8')
if (/return `cmd \/d \/s \/c/.test(termSrc)) {
  console.error('FAIL: PowerShell PTY still wraps commands in cmd /d /s /c')
  process.exit(1)
}
if (!/function toPowerShellLine/.test(termSrc) || !/function appendDisplay/.test(termSrc)) {
  console.error('FAIL: expected PowerShell-native input + display-only capture')
  process.exit(1)
}
const wb = fs.readFileSync(path.join(desktopRoot, 'src/renderer/workbench.js'), 'utf8')
if (!/appendDisplay/.test(wb.slice(wb.indexOf('async function mirrorAgentTerminalOutput'), wb.indexOf('async function runAgentTerminalCommand')))) {
  console.error('FAIL: mirrorAgentTerminalOutput must paint via appendDisplay, not PTY stdin')
  process.exit(1)
}

console.log('OK dsml parse:', calls[0].name, calls[0].arguments)
console.log('OK xml write parse')
console.log('OK xml read/diff/terminal parse', names.join(','))
console.log('OK Get-Content via cd /d')
console.log('OK terminal wrap/policy')
