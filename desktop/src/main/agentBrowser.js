/**
 * Eyes on the running app: hidden Electron window → DOM snapshot + screenshot
 * plus console + failed network so the agent can see runtime errors.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { readLogsForCwd } = require('./terminalLog')

let hidden = null
const pageLogs = { console: [], network: [] }

function localhostFromLogs(root) {
  const log = readLogsForCwd(root, 8000)
  const urls = log.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+[^\s"'<>]*/gi) || []
  return urls[urls.length - 1] || ''
}

function allowedUrl(url) {
  try {
    const u = new URL(url)
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1') return true
      if (u.protocol === 'https:') return true
    }
  } catch {
    return false
  }
  return false
}

function resetPageLogs() {
  pageLogs.console = []
  pageLogs.network = []
}

function attachPageDebug(win) {
  if (!win || win.__soumtokDebug) return
  win.__soumtokDebug = true
  win.webContents.on('console-message', (_event, level, message) => {
    const text = String(message || '').trim()
    if (!text) return
    pageLogs.console.push({
      level: level === 3 ? 'error' : level === 2 ? 'warn' : 'log',
      message: text.slice(0, 500),
    })
    if (pageLogs.console.length > 80) pageLogs.console.shift()
  })
  win.webContents.on('did-fail-load', (_event, code, desc, url, isMain) => {
    if (!isMain && code === -3) return
    pageLogs.network.push({ status: code, url: `${url || ''} ${desc || ''}`.trim().slice(0, 220) })
    if (pageLogs.network.length > 40) pageLogs.network.shift()
  })
  try {
    win.webContents.session.webRequest.onCompleted({ urls: ['*://*/*'] }, (details) => {
      if (details.statusCode >= 400) {
        pageLogs.network.push({ status: details.statusCode, url: String(details.url || '').slice(0, 220) })
        if (pageLogs.network.length > 40) pageLogs.network.shift()
      }
    })
  } catch {
    /* session hooks optional */
  }
}

async function ensureWindow() {
  const { BrowserWindow } = require('electron')
  if (hidden && !hidden.isDestroyed()) return hidden
  resetPageLogs()
  hidden = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      images: true,
    },
  })
  hidden.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  attachPageDebug(hidden)
  return hidden
}

async function waitReady(win, ms = 12_000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    try {
      const ready = await win.webContents.executeJavaScript('document.readyState', true)
      if (ready === 'complete' || ready === 'interactive') return
    } catch {
      /* loading */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
}

const SNAP_JS = `(() => {
  const text = (document.body && document.body.innerText) || ''
  const overlay = document.querySelector('.vite-error-overlay, vite-error-overlay, #webpack-dev-server-client-overlay')
  return {
    title: document.title || '',
    url: location.href,
    headings: [...document.querySelectorAll('h1,h2,h3')].map((e) => (e.innerText || '').trim()).filter(Boolean).slice(0, 16),
    buttons: [...document.querySelectorAll('button, a, [role="button"]')].map((e) => (e.innerText || e.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 24),
    errors: overlay ? [overlay.innerText.slice(0, 2000)] : [...document.querySelectorAll('[class*="error" i], [data-error]')].map((e) => e.innerText.trim()).filter(Boolean).slice(0, 6),
    text: text.replace(/\\s+/g, ' ').trim().slice(0, 6000),
  }
})()`

function savePng(png) {
  const dir = path.join(os.homedir(), '.soumtok', 'browser-shots')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `shot-${Date.now()}.png`)
  fs.writeFileSync(file, png)
  return file
}

function formatPageLogs() {
  const cons = pageLogs.console.slice(-16)
  const net = pageLogs.network.slice(-12)
  const consLine = cons.length
    ? `console:\n${cons.map((row) => `  [${row.level}] ${row.message}`).join('\n')}`
    : 'console: (none)'
  const netLine = net.length
    ? `network failures:\n${net.map((row) => `  ${row.status} ${row.url}`).join('\n')}`
    : 'network failures: none'
  return `${consLine}\n${netLine}`
}

async function snapshotPage(win) {
  await waitReady(win)
  await new Promise((r) => setTimeout(r, 400))
  let snap = { title: '', url: '', headings: [], buttons: [], errors: [], text: '' }
  try {
    snap = await win.webContents.executeJavaScript(SNAP_JS, true)
  } catch (e) {
    snap.text = String(e.message || e)
  }
  let image = null
  try {
    const native = await win.webContents.capturePage()
    const png = native.toPNG()
    const file = savePng(png)
    image = {
      name: path.basename(file),
      mime: 'image/png',
      size: png.length,
      dataUrl: `data:image/png;base64,${png.toString('base64')}`,
      path: file,
    }
  } catch {
    /* capture optional */
  }
  const lines = [
    `BROWSER SNAPSHOT ${snap.url || win.webContents.getURL()}`,
    `title: ${snap.title || '(none)'}`,
    snap.headings?.length ? `headings: ${snap.headings.join(' | ')}` : '',
    snap.buttons?.length ? `controls: ${snap.buttons.join(' · ')}` : '',
    snap.errors?.length ? `PAGE ERRORS:\n${snap.errors.join('\n')}` : 'page errors: none visible',
    formatPageLogs(),
    'visible text:',
    snap.text || '(empty body)',
    image ? `screenshot: ${image.path}` : '',
  ].filter(Boolean)
  return { ok: true, text: lines.join('\n'), image }
}

async function runBrowserTool(root, args) {
  const action = String(args.action || 'snapshot').toLowerCase()
  let url = String(args.url || args.href || '').trim()
  if (!url && (action === 'snapshot' || action === 'navigate' || action === 'open')) {
    url = localhostFromLogs(root)
  }
  try {
    const win = await ensureWindow()
    if (action === 'navigate' || action === 'open' || (action === 'snapshot' && url)) {
      if (!url) return { ok: false, text: 'browser needs url (or start the app so localhost appears in the terminal).' }
      if (!allowedUrl(url)) return { ok: false, text: 'browser only opens http(s) localhost or https URLs.' }
      resetPageLogs()
      await win.loadURL(url)
    }
    if (action === 'click') {
      const sel = String(args.selector || args.css || '').trim()
      if (!sel) return { ok: false, text: 'browser click needs selector' }
      await win.webContents.executeJavaScript(
        `document.querySelector(${JSON.stringify(sel)})?.click()`,
        true,
      )
      await new Promise((r) => setTimeout(r, 300))
    }
    if (action === 'type') {
      const sel = String(args.selector || args.css || '').trim()
      const value = String(args.text || args.value || '')
      if (!sel) return { ok: false, text: 'browser type needs selector' }
      await win.webContents.executeJavaScript(
        `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.focus(); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`,
        true,
      )
    }
    return snapshotPage(win)
  } catch (e) {
    return { ok: false, text: String(e.message || e) }
  }
}

function closeAgentBrowser() {
  try {
    if (hidden && !hidden.isDestroyed()) hidden.destroy()
  } catch {
    /* ignore */
  }
  hidden = null
  resetPageLogs()
}

module.exports = { runBrowserTool, closeAgentBrowser, localhostFromLogs, formatPageLogs }
