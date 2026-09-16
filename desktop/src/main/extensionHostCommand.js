/**
 * Opens an extension's own UI inside the embedded workbench. The remote CLI cannot run commands
 * on Windows, so the extension's open command is bound to a private chord that is sent into the
 * page, and every piece of editor chrome around it is closed.
 */

const { seedHostKeybindings } = require('./extensionHostRuntime')
const { notifyExtensionHostUiReady } = require('./extensionHostView')

const runs = new WeakMap()
const retries = new WeakMap()

const OPEN_POLL_MS = 700
const OPEN_DEADLINE_MS = 28000
const MAX_OPEN_CHORDS = 5

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function sendChord(wc, keyCode) {
  if (!wc || wc.isDestroyed()) return
  for (const type of ['keyDown', 'keyUp']) {
    wc.sendInputEvent({ type, keyCode, modifiers: ['control', 'alt', 'shift'] })
  }
}

/**
 * The title bar cannot be turned off by setting in a web build, so the workbench is pulled up by
 * its own height: the bar lands outside the visible area and the editor starts at the very top.
 */
const TITLEBAR_HEIGHT = 35
const HIDE_EMBED_CHROME_CSS = `
  .monaco-workbench .part.titlebar,
  .monaco-workbench .part.activitybar,
  .monaco-workbench .part.sidebar,
  .monaco-workbench .part.auxiliarybar,
  .monaco-workbench .part.statusbar,
  .monaco-workbench .part.panel { display: none !important; }
  .monaco-workbench .part.sidebar,
  .monaco-workbench .part.auxiliarybar { width: 0 !important; min-width: 0 !important; max-width: 0 !important; }
  .monaco-workbench .part.editor .tabs-container,
  .monaco-workbench .part.editor .editor-group-container > .title,
  .monaco-workbench .part.editor .breadcrumbs-control,
  .monaco-workbench .part.editor .editor-actions,
  .monaco-workbench .part.editor .monaco-breadcrumbs { display: none !important; }
  .monaco-workbench {
    position: absolute !important;
    top: -${TITLEBAR_HEIGHT}px !important;
    left: 0 !important;
    right: 0 !important;
    height: calc(100% + ${TITLEBAR_HEIGHT}px) !important;
  }
  .monaco-workbench .part.editor {
    left: 0 !important;
    right: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
  }
`

const FORCE_EDITOR_LAYOUT_JS = `(function () {
  const hide = (sel) => document.querySelectorAll(sel).forEach((el) => { el.style.display = 'none'; el.style.width = '0'; el.style.minWidth = '0'; })
  hide('.part.sidebar')
  hide('.part.auxiliarybar')
  hide('.part.activitybar')
  hide('.part.titlebar')
  hide('.part.statusbar')
  hide('.part.panel')
  const ed = document.querySelector('.part.editor')
  if (ed) {
    ed.style.left = '0'
    ed.style.right = '0'
    ed.style.width = '100%'
    ed.style.maxWidth = '100%'
  }
  window.dispatchEvent(new Event('resize'))
})()`

/** Leaves only the extension webview: no explorer, no VS Code chat rail, no tabs, no title bar. */
async function stripWorkbenchChrome(wc) {
  for (const keyCode of ['F7', 'F8', 'F4', 'F6']) {
    if (!wc || wc.isDestroyed()) return
    sendChord(wc, keyCode)
    await sleep(180)
  }
  if (wc.isDestroyed()) return
  try {
    await wc.insertCSS(HIDE_EMBED_CHROME_CSS)
    await wc.executeJavaScript(FORCE_EDITOR_LAYOUT_JS, true)
  } catch {
    /* chrome stays visible; the extension still works */
  }
}

function viewKeyword(title, extensionId) {
  const fromTitle = String(title || '').trim()
  if (fromTitle) return fromTitle.split(/\s+/)[0]
  const id = String(extensionId || '')
  return id.includes('.') ? id.split('.')[1] : id
}

/** 'open' once the extension has a tab or webview, 'ready' once its view button exists. */
function inspectScript(keyword) {
  const key = JSON.stringify(keyword)
  return `(function () {
    const key = ${key}
    const has = (sel) => Boolean(document.querySelector(sel))
    if (document.querySelector('.tabs-container .tab[aria-label*="' + key + '" i]')) return 'open'
    if (has('.webview')) return 'open'
    const bars = '.part.activitybar [aria-label*="' + key + '" i], .part.auxiliarybar [aria-label*="' + key + '" i], .pane-composite-part [aria-label*="' + key + '" i]'
    return has(bars) ? 'ready' : 'absent'
  })()`
}

function clickScript(keyword) {
  const key = JSON.stringify(keyword)
  return `(function () {
    const key = ${key}
    const btn = document.querySelector('.part.activitybar [aria-label*="' + key + '" i], .part.auxiliarybar [aria-label*="' + key + '" i], .pane-composite-part [aria-label*="' + key + '" i]')
    if (!btn) return 'missing'
    btn.click()
    return 'clicked'
  })()`
}

/** True once extension UI (e.g. Claude chat) has real content, not just an empty webview shell. */
const EXTENSION_UI_CONTENT_READY = `(function () {
  const t = (document.body && document.body.innerText ? document.body.innerText : '').toLowerCase()
  if (t.includes('what should we work')) return true
  if (t.includes('ask claude')) return true
  if (t.includes('learn claude')) return true
  if (t.includes('claude code')) return true
  return false
})()`

async function evaluate(wc, script) {
  if (!wc || wc.isDestroyed()) return 'absent'
  try {
    return await wc.executeJavaScript(script, true)
  } catch {
    return 'absent'
  }
}

function focusWorkbenchSurface(wc) {
  if (!wc || wc.isDestroyed()) return
  wc.focus()
  wc.sendInputEvent({ type: 'mouseDown', x: 200, y: 300, button: 'left', clickCount: 1 })
  wc.sendInputEvent({ type: 'mouseUp', x: 200, y: 300, button: 'left', clickCount: 1 })
}

async function extensionUiContentReady(webContents) {
  return (await evaluate(webContents, EXTENSION_UI_CONTENT_READY)) === true
}

async function signalUiReady(webContents, { relaxed = false } = {}) {
  if (!webContents || webContents.isDestroyed()) return
  if (!relaxed && !(await extensionUiContentReady(webContents))) return
  await stripWorkbenchChrome(webContents)
  scheduleChromeStripPasses(webContents)
  notifyExtensionHostUiReady(webContents)
}

function clearExtensionHostCommandRun(webContents) {
  if (!webContents) return
  runs.delete(webContents)
  for (const timer of retries.get(webContents) || []) clearTimeout(timer)
  retries.delete(webContents)
}

/** Extensions can reveal their own side bar view after activation, so chrome is stripped again. */
function scheduleChromeStripPasses(wc) {
  const timers = [5000, 12000].map((ms) =>
    setTimeout(() => {
      if (!wc.isDestroyed()) void stripWorkbenchChrome(wc)
    }, ms),
  )
  retries.set(wc, timers)
}

/**
 * Waits for the extension to finish activating, then opens it once — firing twice would stack up
 * duplicate tabs.
 */
async function scheduleExtensionHostCommand(webContents, { openCommand = '', extensionId = '', title = '' } = {}) {
  if (!webContents || webContents.isDestroyed()) return
  if (!openCommand && !extensionId) return
  if (runs.get(webContents)) return
  runs.set(webContents, true)

  try {
    if (openCommand) {
      try {
        seedHostKeybindings(openCommand)
      } catch {
        /* keep the previous binding */
      }
    }
    const keyword = viewKeyword(title, extensionId)
    const inspect = inspectScript(keyword)

    await sleep(1200)
    await stripWorkbenchChrome(webContents)

    const deadline = Date.now() + OPEN_DEADLINE_MS
    let chords = 0
    while (Date.now() < deadline && !webContents.isDestroyed()) {
      const status = await evaluate(webContents, inspect)
      if (status === 'open' && (await extensionUiContentReady(webContents))) {
        await signalUiReady(webContents)
        return
      }
      if (status !== 'open' && chords < MAX_OPEN_CHORDS) {
        focusWorkbenchSurface(webContents)
        await sleep(120)
        sendChord(webContents, 'F10')
        chords += 1
        await sleep(1400)
        continue
      }
      await sleep(OPEN_POLL_MS)
    }

    if (!webContents.isDestroyed()) {
      await evaluate(webContents, clickScript(keyword))
      for (let i = 0; i < 8 && !webContents.isDestroyed(); i++) {
        if (await extensionUiContentReady(webContents)) {
          await signalUiReady(webContents)
          return
        }
        await sleep(OPEN_POLL_MS)
      }
      const open = (await evaluate(webContents, inspect)) === 'open'
      if (open) await signalUiReady(webContents, { relaxed: true })
    }
  } finally {
    clearExtensionHostCommandRun(webContents)
  }
}

module.exports = { scheduleExtensionHostCommand, clearExtensionHostCommandRun, focusWorkbenchSurface }
