/** Headless Electron: Monaco TS diagnostics appear for a type error. */
import electron from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.join(__dirname, '..')
const { app, BrowserWindow } = electron

app.whenReady().then(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-monaco-'))
  try {
    const vsRel = path
      .relative(tmpDir, path.join(desktopRoot, 'node_modules/monaco-editor/min/vs'))
      .replace(/\\/g, '/')
    const html = path.join(tmpDir, 'monaco.html')
    fs.writeFileSync(
      html,
      `<!DOCTYPE html><html><body>
<script src="${vsRel}/loader.js"></script>
<script>
require.config({ paths: { vs: '${vsRel}' } });
require(['vs/editor/editor.main'], function () {
  var ts = monaco.languages.typescript;
  ts.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    noEmit: true,
  });
  ts.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
  monaco.editor.createModel('const n: number = "wrong";', 'typescript', monaco.Uri.parse('file:///bad.ts'));
  setTimeout(function () {
    window.__markers = monaco.editor.getModelMarkers({});
    window.__ready = true;
  }, 3500);
});
</script></body></html>`,
      'utf8',
    )

    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    await win.loadFile(html)
    const markers = await win.webContents.executeJavaScript(
      `new Promise((resolve) => {
        const start = Date.now();
        (function tick() {
          if (window.__ready) return resolve(window.__markers || []);
          if (Date.now() - start > 8000) return resolve([]);
          setTimeout(tick, 100);
        })();
      })`,
    )
    win.destroy()

    if (!Array.isArray(markers) || !markers.length) {
      console.error('FAIL: no Monaco markers for TS type error')
      app.exit(1)
      return
    }
    if (!markers.some((m) => /number|string|assignable|Type/i.test(m.message || ''))) {
      console.error('FAIL: unexpected marker messages', markers.map((m) => m.message))
      app.exit(1)
      return
    }
    console.log('OK monaco diagnostics:', markers.length, 'marker(s)')
    app.exit(0)
  } catch (err) {
    console.error('FAIL:', err?.message || err)
    app.exit(1)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
