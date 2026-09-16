/**
 * Diagnostic: load the embedded host, open Claude, and report webview + workspace state.
 * Run: npx electron scripts/probe-claude-webview.js [--folder=none|raw|slash|leading]
 */
const path = require('path')
const { app, BrowserWindow, session } = require('electron')
const {
  startSoumtokCodeHost,
  stopSoumtokCodeHost,
  platformExtensionWorkspace,
} = require('../src/main/extensionHostRuntime')
const { applyHostSessionFixes } = require('../src/main/extensionHostSession')

const folderMode = (process.argv.find((a) => a.startsWith('--folder=')) || '--folder=none').split('=')[1]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const INSPECT = `(function () {
  const frames = Array.from(document.querySelectorAll('iframe')).map((f) => (f.getAttribute('src') || '').slice(-60))
  const tabs = Array.from(document.querySelectorAll('.tabs-container .tab')).map((t) =>
    (t.getAttribute('aria-label') || t.textContent || '').trim().slice(0, 50)
  )
  const size = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return 'none'
    const r = el.getBoundingClientRect()
    return Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.top)
  }
  return JSON.stringify({
    tabs,
    webviewEls: document.querySelectorAll('.webview, webview').length,
    webviewFrames: frames.filter((s) => /webview|index\\.html/i.test(s)),
    chrome: {
      titlebar: size('.part.titlebar'),
      activitybar: size('.part.activitybar'),
      sidebar: size('.part.sidebar'),
      statusbar: size('.part.statusbar'),
      panel: size('.part.panel'),
      editor: size('.part.editor'),
    },
  })
})()`

function hostUrlFor(base, ws) {
  if (folderMode === 'none') return base
  const value =
    folderMode === 'raw' ? ws : folderMode === 'slash' ? ws.replace(/\\/g, '/') : `/${ws.replace(/\\/g, '/')}`
  return `${base}?folder=${encodeURIComponent(value)}`
}

async function main() {
  const started = await startSoumtokCodeHost({ usePlatformWorkspace: true })
  console.log('host:', started.url || started.error, '| folder mode:', folderMode)
  if (!started.url) return

  const url = folderMode === 'none' ? started.url : hostUrlFor(started.url.split('?')[0], platformExtensionWorkspace())
  const win = new BrowserWindow({
    show: true,
    width: 1500,
    height: 950,
    webPreferences: {
      contextIsolation: false,
      sandbox: false,
      preload: path.join(__dirname, 'probe-preload.js'),
      session: session.fromPartition('persist:soumtok-probe'),
    },
  })
  applyHostSessionFixes(win.webContents.session)

  let fsErrors = 0
  win.webContents.on('console-message', (_e, _level, message) => {
    if (/Unable to resolve filesystem provider/i.test(message)) fsErrors += 1
    else if (message.startsWith('SWPROBE')) console.log('[sw]', message.slice(0, 160))
  })

  win.webContents.on('did-navigate', (_e, to) => console.log('[navigate]', String(to).slice(0, 60)))
  win.webContents.on('did-start-loading', () => console.log('[loading]'))

  await win.loadURL(url)

  const FIND_CLAUDE = `(function () {
    const el = document.querySelector('[aria-label*="Claude" i], [title*="Claude" i]')
    return el ? (el.getAttribute('aria-label') || el.getAttribute('title')) : ''
  })()`
  let label = ''
  for (let i = 0; i < 25 && !label; i += 1) {
    await sleep(3000)
    label = await win.webContents.executeJavaScript(FIND_CLAUDE, true).catch(() => '')
  }
  console.log('claude ui appeared:', label || 'NEVER', '| fsErrors:', fsErrors)
  console.log('before open:', await win.webContents.executeJavaScript(INSPECT, true))

  const DUMP = `JSON.stringify({
    activity: Array.from(document.querySelectorAll('.part.activitybar .action-item')).map(
      (e) => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30)
    ),
    aux: Array.from(document.querySelectorAll('.part.auxiliarybar .action-item')).map(
      (e) => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30)
    ),
    claudeEls: Array.from(document.querySelectorAll('[aria-label*="Claude" i], [title*="Claude" i]')).map(
      (e) => e.className.toString().slice(0, 40) + ' | ' + (e.getAttribute('aria-label') || e.getAttribute('title'))
    ).slice(0, 8)
  })`
  console.log('dom:', await win.webContents.executeJavaScript(DUMP, true))

  win.focus()
  await require('../src/main/extensionHostCommand').scheduleExtensionHostCommand(win.webContents, {
    extensionId: 'anthropic.claude-code',
    openCommand: 'claude-vscode.editor.open',
  })
  const WEBVIEW_DUMP = `(function () {
    const rect = (el) => {
      const r = el.getBoundingClientRect()
      return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',')
    }
    const views = Array.from(document.querySelectorAll('.webview')).map((el) => ({
      cls: el.className.toString().slice(0, 60),
      rect: rect(el),
      display: getComputedStyle(el).display + '/' + getComputedStyle(el).visibility,
    }))
    const frames = Array.from(document.querySelectorAll('iframe')).map((f) => {
      let inner = 'blocked'
      try {
        const d = f.contentDocument
        inner = d ? 'body=' + (d.body ? d.body.innerHTML.length : 'null') + ' frames=' + d.querySelectorAll('iframe').length : 'nodoc'
      } catch (e) {
        inner = 'err ' + e.name
      }
      return { src: (f.getAttribute('src') || '(none)').slice(-70), rect: rect(f), inner }
    })
    const wb = document.querySelector('.monaco-workbench')
    return JSON.stringify({ views, frames, workbench: wb ? rect(wb) : 'none' }, null, 1)
  })()`

  for (let i = 0; i < 8; i += 1) {
    await sleep(3000)
    const state = JSON.parse(await win.webContents.executeJavaScript(INSPECT, true))
    if (state.webviewEls > 0 || state.tabs.length) {
      console.log('after open:', JSON.stringify(state), '| fsErrors:', fsErrors)
      await sleep(4000)
      console.log('webviews:', await win.webContents.executeJavaScript(WEBVIEW_DUMP, true))
      for (let t = 0; t < 10; t += 1) {
        await sleep(2500)
        const now = JSON.parse(await win.webContents.executeJavaScript(INSPECT, true))
        console.log(`t+${(t + 1) * 2.5}s chrome:`, JSON.stringify(now.chrome))
      }
      const frames = win.webContents.mainFrame.framesInSubtree
      for (const f of frames) {
        let info = ''
        try {
          info = await f.executeJavaScript(
            `JSON.stringify({ nodes: document.querySelectorAll('*').length, title: document.title, body: (document.body ? document.body.innerText : '').slice(0, 120) })`,
          )
        } catch (e) {
          info = `err ${e.message.slice(0, 60)}`
        }
        console.log('frame:', String(f.url).slice(0, 90), '=>', info)
      }
      const shot = path.join(__dirname, '..', 'probe-claude.png')
      require('fs').writeFileSync(shot, (await win.webContents.capturePage()).toPNG())
      console.log('shot:', shot)
      return
    }
  }
  console.log('after open:', await win.webContents.executeJavaScript(INSPECT, true), '| fsErrors:', fsErrors)
}

app.disableHardwareAcceleration()
app
  .whenReady()
  .then(main)
  .catch((e) => console.log('probe error', e))
  .finally(async () => {
    await sleep(500)
    stopSoumtokCodeHost()
    app.exit(0)
  })
