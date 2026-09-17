import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { app, BrowserWindow } = require('electron')
const { startSoumtokCodeHost, stopSoumtokCodeHost } = require('../src/main/extensionHostRuntime')
const { scheduleExtensionHostCommand } = require('../src/main/extensionHostCommand')
const { applyHostSessionFixes } = require('../src/main/extensionHostSession')

await app.whenReady()
const started = await startSoumtokCodeHost({ usePlatformWorkspace: true, embedSurface: 'sidebar' })
console.log('host', started.ok, started.url)
if (!started.url) {
  app.quit()
  process.exit(1)
}

const win = new BrowserWindow({
  show: false,
  width: 1200,
  height: 800,
  webPreferences: { contextIsolation: false, sandbox: false },
})
applyHostSessionFixes(win.webContents.session)
await win.loadURL(started.url)
await new Promise((r) => setTimeout(r, 3000))

void scheduleExtensionHostCommand(win.webContents, {
  extensionId: 'saoudrizwan.claude-dev',
  title: 'Cline',
  embedSurface: 'sidebar',
  containerId: 'claude-dev-ActivityBar',
})

await new Promise((r) => setTimeout(r, 22000))

const state = await win.webContents.executeJavaScript(
  `(function(){
    const s = document.querySelector('.part.sidebar')
    const w = s && s.querySelector('.webview, iframe')
    return JSON.stringify({
      sidebar: !!s,
      sidebarDisplay: s ? getComputedStyle(s).display : '',
      webview: !!w,
      webviewSize: w ? [Math.round(w.getBoundingClientRect().width), Math.round(w.getBoundingClientRect().height)] : [],
      text: (document.body.innerText||'').replace(/\\s+/g,' ').trim().slice(0,160)
    })
  })()`,
  true,
)
console.log('state', state)
stopSoumtokCodeHost()
app.quit()
