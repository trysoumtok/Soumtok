/**
 * Opens an extension's own UI inside the embedded workbench. The remote CLI cannot run commands
 * on Windows, so the extension's open command is bound to a private chord that is sent into the
 * page, and every piece of editor chrome around it is closed.
 */

const { seedHostKeybindings } = require('./extensionHostRuntime')

function notifyExtensionHostUiReady(webContents) {
  require('./extensionHostView').notifyExtensionHostUiReady(webContents)
}

const runs = new WeakMap()
const retries = new WeakMap()
const runGen = new WeakMap()

const OPEN_POLL_MS = 700
const OPEN_DEADLINE_MS = 28000
const SIDEBAR_OPEN_DEADLINE_MS = 45000
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

async function sendPageChord(wc, keyCode) {
  if (!wc || wc.isDestroyed()) return
  const key = String(keyCode || '').replace(/^F/i, 'F')
  try {
    await wc.executeJavaScript(
      `(function () {
        const target = document.activeElement || document.body
        for (const type of ['keydown', 'keyup']) {
          target.dispatchEvent(
            new KeyboardEvent(type, {
              key: ${JSON.stringify(key)},
              code: ${JSON.stringify(key)},
              ctrlKey: true,
              altKey: true,
              shiftKey: true,
              bubbles: true,
            }),
          )
        }
      })()`,
      true,
    )
  } catch {
    /* fall back to sendInputEvent only */
  }
}

async function fireOpenChord(wc) {
  sendChord(wc, 'F10')
  await sendPageChord(wc, 'F10')
}

/**
 * The title bar cannot be turned off by setting in a web build, so the workbench is pulled up by
 * its own height: the bar lands outside the visible area and the editor starts at the very top.
 */
const TITLEBAR_HEIGHT = 35
const HIDE_EDITOR_EMBED_CHROME_CSS = `
  .monaco-workbench .part.titlebar,
  .monaco-workbench .part.activitybar,
  .monaco-workbench .part.sidebar,
  .monaco-workbench .part.auxiliarybar,
  .monaco-workbench .part.statusbar,
  .monaco-workbench .statusbar,
  .monaco-workbench [id="workbench.parts.statusbar"],
  .monaco-workbench .part.panel,
  .monaco-workbench .monaco-sash { display: none !important; height: 0 !important; }
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
  .monaco-workbench .part.editor,
  .monaco-workbench .part.editor .content,
  .monaco-workbench .part.editor .editor-group-container,
  .monaco-workbench .part.editor .editor-instance,
  .monaco-workbench .part.editor .webview,
  .monaco-workbench .part.editor iframe {
    left: 0 !important;
    right: 0 !important;
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
  }
`

/** Hide VS Code chrome while loading — keep activity bar + sidebar so we can open the extension. */
const HIDE_WAITING_CHROME_CSS = `
  .monaco-workbench .part.titlebar,
  .monaco-workbench .part.statusbar,
  .monaco-workbench .statusbar,
  .monaco-workbench .part.panel,
  .monaco-workbench .part.editor,
  .monaco-workbench .part.auxiliarybar,
  .monaco-workbench .notifications-toasts,
  .monaco-workbench .notification-toast,
  .monaco-workbench .monaco-breadcrumbs,
  .monaco-workbench .monaco-sash { display: none !important; }
  .monaco-workbench {
    position: absolute !important;
    top: -${TITLEBAR_HEIGHT}px !important;
    left: 0 !important;
    right: 0 !important;
    height: calc(100% + ${TITLEBAR_HEIGHT}px) !important;
    background: #1e1e1e !important;
  }
`

/** Sidebar webviews — overlay the dock. Do not display:none the editor or Cline's webview dies. */
const HIDE_SIDEBAR_EMBED_CHROME_CSS = `
  .monaco-workbench .part.titlebar,
  .monaco-workbench .part.activitybar,
  .monaco-workbench .part.auxiliarybar,
  .monaco-workbench .part.statusbar,
  .monaco-workbench .statusbar,
  .monaco-workbench [id="workbench.parts.statusbar"],
  .monaco-workbench .part.panel,
  .monaco-workbench .part.editor,
  .monaco-workbench .monaco-sash,
  .monaco-workbench .notifications-toasts,
  .monaco-workbench .notification-toast,
  .monaco-workbench footer {
    visibility: hidden !important;
    pointer-events: none !important;
    opacity: 0 !important;
  }
  .monaco-workbench {
    position: absolute !important;
    top: -${TITLEBAR_HEIGHT}px !important;
    left: 0 !important;
    right: 0 !important;
    height: calc(100% + ${TITLEBAR_HEIGHT}px) !important;
  }
  .monaco-workbench .part.sidebar {
    position: fixed !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    height: 100% !important;
    visibility: visible !important;
    opacity: 1 !important;
    z-index: 100 !important;
    max-width: none !important;
  }
  .monaco-workbench .part.sidebar > .content {
    width: 100% !important;
    height: 100% !important;
  }
  .monaco-workbench .part.sidebar .webview-container,
  .monaco-workbench .part.sidebar .webview,
  .monaco-workbench .part.sidebar iframe {
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
  }
`

const FORCE_EDITOR_LAYOUT_JS = `(function () {
  const hide = (sel) => document.querySelectorAll(sel).forEach((el) => {
    el.style.setProperty('display', 'none', 'important')
    el.style.setProperty('width', '0', 'important')
    el.style.setProperty('height', '0', 'important')
  })
  hide('.part.sidebar')
  hide('.part.auxiliarybar')
  hide('.part.activitybar')
  hide('.part.titlebar')
  hide('.part.statusbar')
  hide('.statusbar')
  hide('.part.panel')
  hide('.monaco-sash')
  const fill = (el) => {
    if (!el) return
    el.style.setProperty('display', 'flex', 'important')
    el.style.setProperty('left', '0', 'important')
    el.style.setProperty('top', '0', 'important')
    el.style.setProperty('width', '100%', 'important')
    el.style.setProperty('height', '100%', 'important')
    el.style.setProperty('max-width', 'none', 'important')
  }
  const ed = document.querySelector('.part.editor')
  fill(ed)
  ed?.querySelectorAll('.content, .editor-group-container, .editor-instance, .webview, .webview-container, iframe').forEach(fill)
  window.dispatchEvent(new Event('resize'))
})()`

const FORCE_SIDEBAR_LAYOUT_JS = `(function () {
  const sidebar = document.querySelector('.part.sidebar')
  if (!sidebar) return
  sidebar.style.setProperty('position', 'fixed', 'important')
  sidebar.style.setProperty('left', '0', 'important')
  sidebar.style.setProperty('top', '0', 'important')
  sidebar.style.setProperty('width', '100%', 'important')
  sidebar.style.setProperty('height', '100%', 'important')
  sidebar.style.setProperty('visibility', 'visible', 'important')
  sidebar.style.setProperty('opacity', '1', 'important')
  sidebar.style.setProperty('z-index', '100', 'important')
  const content = sidebar.querySelector(':scope > .content')
  if (content) {
    content.style.setProperty('width', '100%', 'important')
    content.style.setProperty('height', '100%', 'important')
  }
})()`

function isSidebarExtensionId(extensionId = '') {
  const id = String(extensionId || '').toLowerCase()
  return id.includes('claude-dev') || id.includes('roo-cline') || id.includes('.cline')
}

function inferEmbedSurface(extensionId = '', openCommand = '', embedSurface = '') {
  if (embedSurface === 'sidebar' || embedSurface === 'editor') return embedSurface
  if (isClaudeExtension(extensionId)) return 'editor'
  if (/^workbench\.view\.extension\./i.test(openCommand)) return 'sidebar'
  if (isSidebarExtensionId(extensionId)) return 'sidebar'
  return 'editor'
}

function usesSidebarClick(openCommand = '', embedSurface = '', extensionId = '') {
  if (embedSurface === 'sidebar') return true
  if (/^workbench\.view\.extension\./i.test(openCommand)) return true
  return isSidebarExtensionId(extensionId)
}

async function applyEmbedLayout(wc, embedSurface = 'editor') {
  if (!wc || wc.isDestroyed()) return
  try {
    await wc.executeJavaScript(embedSurface === 'sidebar' ? FORCE_SIDEBAR_LAYOUT_JS : FORCE_EDITOR_LAYOUT_JS, true)
  } catch {
    /* ignore */
  }
}

async function prepareExtensionHostPage(wc) {
  if (!wc || wc.isDestroyed()) return
  try {
    await wc.insertCSS(HIDE_WAITING_CHROME_CSS)
  } catch {
    /* keep waiting; the renderer parks the view off-screen until uiReady */
  }
}

function bindableOpenCommand(openCommand = '') {
  return String(openCommand || '').trim()
}

async function openSidebarViewWhenReady(wc, { click }) {
  focusWorkbenchSurface(wc)
  await fireOpenChord(wc)
  await click()
}

/** Leaves only the extension UI — editor tab (Claude Code) or full-width sidebar (Cline). */
async function stripWorkbenchChrome(wc, { embedSurface = 'editor' } = {}) {
  const sidebar = embedSurface === 'sidebar'
  if (!sidebar) {
    for (const keyCode of ['F7', 'F8', 'F4', 'F6']) {
      if (!wc || wc.isDestroyed()) return
      sendChord(wc, keyCode)
      await sleep(180)
    }
  } else {
    /* keep the sidebar open — closing other parts via chords can blank Cline */
  }
  if (!wc || wc.isDestroyed()) return
  try {
    await wc.insertCSS(sidebar ? HIDE_SIDEBAR_EMBED_CHROME_CSS : HIDE_EDITOR_EMBED_CHROME_CSS)
    await wc.executeJavaScript(sidebar ? FORCE_SIDEBAR_LAYOUT_JS : FORCE_EDITOR_LAYOUT_JS, true)
  } catch {
    /* chrome stays visible; the extension still works */
  }
}

function viewKeyword(title, extensionId) {
  const fromTitle = String(title || '').trim()
  if (fromTitle) return fromTitle.split(/\s+/)[0]
  const id = String(extensionId || '').toLowerCase()
  if (id.includes('claude-dev')) return 'Cline'
  return id.includes('.') ? id.split('.')[1] : id
}

const GENERIC_VIEW_WORDS = new Set([
  'code',
  'view',
  'views',
  'extension',
  'studio',
  'visual',
  'editor',
  'chat',
  'dev',
  'the',
  'and',
  'for',
  'app',
  'ai',
])

function viewKeywords(title, extensionId) {
  const id = String(extensionId || '').toLowerCase()
  if (id.includes('claude-dev')) return ['cline']
  if (id.includes('roo-cline') || id.includes('rooveterinary')) return ['roo', 'roo-cline']
  const t = String(title || '').trim()
  const keys = new Set()
  if (t) {
    const full = t.toLowerCase()
    if (full.length > 2 && !GENERIC_VIEW_WORDS.has(full)) keys.add(full)
    t.split(/\s+/).forEach((part) => {
      const p = part.toLowerCase()
      if (p.length > 2 && !GENERIC_VIEW_WORDS.has(p)) keys.add(p)
    })
  }
  if (id.includes('.')) {
    const name = id.split('.')[1]
    if (name && !GENERIC_VIEW_WORDS.has(name)) keys.add(name)
  }
  return [...keys].filter(Boolean)
}

function isClineLabel(text) {
  const t = String(text || '').toLowerCase()
  if (!t.includes('cline')) return false
  if (t.includes('claude') && !/\bcline\b/.test(t)) return false
  return /\bcline\b/.test(t) || t === 'cline'
}

/** 'open' once Cline's own view is visible — never Claude Code or Explorer. */
function inspectScript(keywords, containerId = '') {
  const keys = JSON.stringify(keywords.map((k) => String(k || '').toLowerCase()).filter(Boolean))
  const cid = JSON.stringify(String(containerId || '').trim().toLowerCase())
  return `(function () {
    const keys = ${keys}
    const cid = ${cid}
    const labelOf = (el) => String(el?.getAttribute('aria-label') || el?.textContent || '').toLowerCase()
    const matches = (text) => {
      const t = String(text || '').toLowerCase()
      if (!t) return false
      if (/explorer|readme\.md|outline|timeline/.test(t) && !keys.some((k) => k === 'explorer')) return false
      if (t.includes('claude code') && !keys.some((k) => k.includes('claude'))) return false
      if (keys.includes('cline')) return /\\bcline\\b/.test(t) && !t.includes('claude code')
      return keys.some((key) => key.length > 2 && t.includes(key))
    }
    const sidebar = document.querySelector('.part.sidebar')
    if (sidebar) {
      const title = labelOf(sidebar.querySelector('.composite.title, .title') || sidebar)
      const body = (sidebar.innerText || '').toLowerCase()
      if (matches(title) || matches(body)) {
        const webviews = sidebar.querySelectorAll('.webview, .webview-container, iframe.webview, iframe')
        if (webviews.length) return 'open'
        if (body.length > 40 && !body.includes('session manager')) return 'open'
      }
      if (cid && sidebar.querySelector('[id*="' + cid + '" i]')) return 'open'
    }
    for (const btn of document.querySelectorAll('.part.activitybar [aria-label], .part.activitybar .action-item')) {
      if (matches(labelOf(btn))) return 'ready'
    }
    return 'absent'
  })()`
}

function clickScript(keywords, containerId = '') {
  const keys = JSON.stringify(keywords.map((k) => String(k || '').toLowerCase()).filter(Boolean))
  const cid = JSON.stringify(String(containerId || '').trim().toLowerCase())
  return `(function () {
    const keys = ${keys}
    const cid = ${cid}
    const labelOf = (el) =>
      String(el?.getAttribute('aria-label') || el?.getAttribute('title') || el?.textContent || '').toLowerCase()
    const matches = (text) => {
      const t = String(text || '').toLowerCase()
      if (t.includes('claude code') && !keys.some((k) => k.includes('claude'))) return false
      if (keys.includes('cline')) return /\\bcline\\b/.test(t)
      return keys.some((key) => key.length > 2 && t.includes(key))
    }
    const clickEl = (el) => {
      if (!el) return false
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      el.click()
      return true
    }
    const tryClick = (el) => {
      if (clickEl(el)) return 'clicked'
      const parent = el?.closest?.('.action-item') || el?.parentElement
      if (clickEl(parent)) return 'clicked'
      return ''
    }
    for (const btn of document.querySelectorAll('.part.activitybar [aria-label], .part.activitybar .action-item, .part.activitybar .action-label')) {
      const label = labelOf(btn)
      const idHint = String(btn.id || btn.getAttribute('data-view-id') || '').toLowerCase()
      if ((cid && idHint.includes(cid)) || matches(label)) {
        const hit = tryClick(btn)
        if (hit) return hit
      }
    }
    return 'missing'
  })()`
}

const DISMISS_OTHER_EXTENSIONS_JS = `(function () {
  const closeTab = (tab) => {
    const btn = tab.querySelector('.tab-close') || tab.querySelector('.codicon-close') || tab.querySelector('[aria-label*="Close" i]')
    if (btn) btn.click()
  }
  document.querySelectorAll('.tabs-container .tab').forEach((tab) => {
    const label = (tab.getAttribute('aria-label') || tab.textContent || '').toLowerCase()
    if (label.includes('claude') && !label.includes('cline')) closeTab(tab)
  })
})()`

async function dismissStaleExtensionPanels(webContents, extensionId = '') {
  if (isClaudeExtension(extensionId)) return
  sendChord(webContents, 'F7')
  await sleep(280)
  await evaluate(webContents, DISMISS_OTHER_EXTENSIONS_JS)
  await sleep(200)
}

/** Claude Code webview — keep the strict check (do not change Claude behaviour). */
const CLAUDE_UI_CONTENT_READY = `(function () {
  const t = (document.body && document.body.innerText ? document.body.innerText : '').toLowerCase()
  if (t.includes('what should we work')) return true
  if (t.includes('ask claude')) return true
  if (t.includes('learn claude')) return true
  if (t.includes('claude code')) return true
  return false
})()`

/** Cline sidebar — webview or Cline copy is enough; waiting CSS may hide the pane. */
const CLINE_UI_CONTENT_READY = `(function () {
  const t = (document.body && document.body.innerText ? document.body.innerText : '').toLowerCase()
  if (t.includes('what can i help')) return true
  if (t.includes('new task')) return true
  if (t.includes('type a message')) return true
  if (t.includes('api provider')) return true
  if (t.includes('welcome to cline')) return true
  if (t.includes('sign in to cline')) return true
  const sidebar = document.querySelector('.part.sidebar')
  if (!sidebar) return false
  const webviews = sidebar.querySelectorAll('.webview, .webview-container, iframe.webview, iframe')
  if (webviews.length) return true
  const text = (sidebar.innerText || sidebar.textContent || '').trim().toLowerCase()
  if (text.length < 8) return false
  if (/^(outline|timeline|explorer|readme|no folder)/.test(text)) return false
  return /\\bcline\\b/.test(text) || text.includes('task') || text.includes('api') || text.includes('provider')
})()`

/** Sidebar extensions — webview in the sidebar is enough. */
const SIDEBAR_UI_CONTENT_READY = `(function () {
  const sidebar = document.querySelector('.part.sidebar')
  if (!sidebar) return false
  const text = (sidebar.innerText || sidebar.textContent || '').trim().toLowerCase()
  if (/^(outline|timeline|explorer|readme|no folder|open a folder)/.test(text)) return false
  if (text.includes('extension-host-workspac') && text.includes('readme')) return false
  const webviews = sidebar.querySelectorAll('.webview, .webview-container, iframe.webview, iframe')
  if (webviews.length) return true
  if (text.length < 24) return false
  if (/explorer|no folder opened|open a folder to/.test(text) && !/provider|api key|new task|welcome/.test(text)) return false
  return /provider|api key|new task|welcome|sign in|choose your|model/.test(text)
})()`

/** Any other VS Code extension — require the extension webview, never an empty editor. */
const GENERIC_UI_CONTENT_READY = `(function () {
  const webviews = document.querySelectorAll('.webview, .webview-container, iframe.webview, iframe')
  if (webviews.length) return true
  const t = (document.body && document.body.innerText ? document.body.innerText : '').toLowerCase()
  if (/provider|api key|sign in|welcome|choose your/.test(t) && t.length > 40) return true
  return false
})()`

/** Anthropic Claude Code only — not Cline (saoudrizwan.claude-dev) or other "claude" extensions. */
function isClaudeExtension(extensionId = '') {
  const id = String(extensionId || '').toLowerCase()
  if (!id) return false
  if (id.includes('claude-dev') || id.endsWith('.cline')) return false
  return id.startsWith('anthropic.') || id.includes('claude-code')
}

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

function isClineExtension(extensionId = '') {
  return String(extensionId || '').includes('claude-dev')
}

async function extensionUiContentReady(webContents, extensionId = '', embedSurface = 'editor') {
  if (isClaudeExtension(extensionId)) return (await evaluate(webContents, CLAUDE_UI_CONTENT_READY)) === true
  if (isClineExtension(extensionId)) return (await evaluate(webContents, CLINE_UI_CONTENT_READY)) === true
  if (embedSurface === 'sidebar') return (await evaluate(webContents, SIDEBAR_UI_CONTENT_READY)) === true
  return (await evaluate(webContents, GENERIC_UI_CONTENT_READY)) === true
}

async function revealExtensionUi(webContents, embedSurface = 'editor') {
  if (!webContents || webContents.isDestroyed()) return
  await stripWorkbenchChrome(webContents, { embedSurface })
  scheduleChromeStripPasses(webContents, embedSurface)
  notifyExtensionHostUiReady(webContents)
}

async function signalUiReady(webContents, { extensionId = '', embedSurface = 'editor' } = {}) {
  if (!webContents || webContents.isDestroyed()) return
  if (!(await extensionUiContentReady(webContents, extensionId, embedSurface))) return
  await revealExtensionUi(webContents, embedSurface)
}

function clearExtensionHostCommandRun(webContents) {
  if (!webContents) return
  runs.delete(webContents)
  for (const timer of retries.get(webContents) || []) clearTimeout(timer)
  retries.delete(webContents)
}

/** Extensions can reveal their own side bar view after activation, so chrome is stripped again. */
function scheduleChromeStripPasses(wc, embedSurface = 'editor') {
  const timers = [100, 250, 800, 2000, 5000].map((ms) =>
    setTimeout(() => {
      if (!wc.isDestroyed()) void stripWorkbenchChrome(wc, { embedSurface })
    }, ms),
  )
  retries.set(wc, timers)
}

/**
 * Waits for the extension to finish activating, then opens it once — firing twice would stack up
 * duplicate tabs.
 */
async function scheduleExtensionHostCommand(
  webContents,
  { openCommand = '', extensionId = '', title = '', embedSurface = '', containerId = '' } = {},
) {
  if (!webContents || webContents.isDestroyed()) return
  if (!openCommand && !extensionId) return
  const gen = (runGen.get(webContents) || 0) + 1
  runGen.set(webContents, gen)
  runs.set(webContents, true)

  try {
    await prepareExtensionHostPage(webContents)
    let cid = String(containerId || '').trim()
    if (!cid && String(extensionId || '').includes('claude-dev')) cid = 'claude-dev-ActivityBar'
    const surface = inferEmbedSurface(extensionId, openCommand, embedSurface)
    const sidebarClick = usesSidebarClick(openCommand, surface, extensionId)
    let bindCmd = bindableOpenCommand(openCommand)
    if (String(extensionId || '').includes('claude-dev')) bindCmd = 'cline.focusChatInput'
    if (bindCmd) {
      try {
        seedHostKeybindings(bindCmd)
      } catch {
        /* keep the previous binding */
      }
    }
    const keywords = viewKeywords(title, extensionId)
    const inspect = inspectScript(keywords, cid)
    const click = () => evaluate(webContents, clickScript(keywords, cid))
    let lastSidebarOpenAttempt = 0

    // Wait for the extension to register before sending a command — firing early shows
    // "command not found" and never opens Cline.
    const claude = isClaudeExtension(extensionId)
    let appeared = false
    const stillThisRun = () => runGen.get(webContents) === gen && !webContents.isDestroyed()
    for (let i = 0; i < 40 && stillThisRun(); i++) {
      const status = await evaluate(webContents, inspect)
      if (status === 'ready' || status === 'open') {
        appeared = true
        break
      }
      await sleep(400)
    }
    if (!appeared && sidebarClick) await sleep(800)
    if (!stillThisRun()) return

    if (!claude && !sidebarClick) await dismissStaleExtensionPanels(webContents, extensionId)

    if (appeared || bindCmd) {
      focusWorkbenchSurface(webContents)
      await click()
      if (appeared) await fireOpenChord(webContents)
      await sleep(700)
    }
    if (claude) await stripWorkbenchChrome(webContents, { embedSurface: 'editor' })

    const signalReady = (opts = {}) => signalUiReady(webContents, { extensionId, embedSurface: surface, ...opts })
    const deadline = Date.now() + (sidebarClick ? SIDEBAR_OPEN_DEADLINE_MS : OPEN_DEADLINE_MS)
    let chords = 0
    while (Date.now() < deadline && stillThisRun()) {
      const status = await evaluate(webContents, inspect)
      if (sidebarClick && status === 'ready' && Date.now() - lastSidebarOpenAttempt > 2000) {
        lastSidebarOpenAttempt = Date.now()
        await openSidebarViewWhenReady(webContents, { click })
      }
      if (status === 'open') {
        await revealExtensionUi(webContents, surface)
        return
      }
      if (status === 'ready' && !claude) {
        focusWorkbenchSurface(webContents)
        await click()
        await fireOpenChord(webContents)
        await sleep(900)
        if (await extensionUiContentReady(webContents, extensionId, surface)) {
          await signalReady()
          return
        }
      }
      if (!sidebarClick && status !== 'open' && chords < MAX_OPEN_CHORDS && bindCmd) {
        focusWorkbenchSurface(webContents)
        await sleep(120)
        await fireOpenChord(webContents)
        await click()
        chords += 1
        await sleep(1400)
        continue
      }
      if (!claude && (await extensionUiContentReady(webContents, extensionId, surface))) {
        await signalReady()
        return
      }
      await sleep(OPEN_POLL_MS)
    }

    if (stillThisRun()) {
      await click()
      for (let i = 0; i < 12 && stillThisRun(); i++) {
        const status = await evaluate(webContents, inspect)
        if (claude) {
          if (await extensionUiContentReady(webContents, extensionId, surface)) {
            await signalReady()
            return
          }
        } else if (await extensionUiContentReady(webContents, extensionId, surface)) {
          await signalReady()
          return
        }
        await click()
        await sleep(OPEN_POLL_MS)
      }
      if (!claude && (await extensionUiContentReady(webContents, extensionId, surface))) {
        await signalReady()
      } else {
        const open = (await evaluate(webContents, inspect)) === 'open'
        if (open) await revealExtensionUi(webContents, surface)
      }
    }
  } finally {
    if (runGen.get(webContents) === gen) clearExtensionHostCommandRun(webContents)
  }
}

module.exports = {
  scheduleExtensionHostCommand,
  clearExtensionHostCommandRun,
  focusWorkbenchSurface,
  prepareExtensionHostPage,
  applyEmbedLayout,
}
