const { BrowserView, session } = require('electron')
const { scheduleExtensionHostFocus, clearFocusTimers } = require('./extensionHostFocus')
const { scheduleExtensionHostCommand, clearExtensionHostCommandRun, prepareExtensionHostPage } = require('./extensionHostCommand')
const { applyHostSessionFixes } = require('./extensionHostSession')
const { activeUserKey } = require('./userScope')

const configuredPartitions = new Set()

function hostPartitionName() {
  return `persist:soumtok-extension-host-${activeUserKey()}`
}

function configureHostSession(partition) {
  if (configuredPartitions.has(partition)) return
  configuredPartitions.add(partition)
  applyHostSessionFixes(session.fromPartition(partition))
}

/** Per-window embedded extension host (code-server) — not subject to iframe X-Frame-Options. */
const views = new Map()

function getEntry(win) {
  if (!win || win.isDestroyed()) return null
  return views.get(win.webContents.id) || null
}

function attachExtensionHostView(win, url, options = {}) {
  if (!win || win.isDestroyed()) return { ok: false, error: 'No window' }
  const u = String(url || '').trim()
  if (!/^https?:\/\/127\.0\.0\.1:\d+/i.test(u) && !/^https?:\/\/localhost:\d+/i.test(u)) {
    return { ok: false, error: 'Invalid host URL' }
  }
  const partition = hostPartitionName()
  configureHostSession(partition)
  let entry = getEntry(win)
  // Account switch: recreate the view so cookies and storage stay with that account only.
  if (entry && entry.partition !== partition) {
    destroyExtensionHostView(win)
    entry = null
  }
  if (!entry) {
    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        webSecurity: false,
        backgroundThrottling: true,
        session: session.fromPartition(partition),
      },
    })
    view.setBackgroundColor('#1e1e1e')
    view.webContents.setWindowOpenHandler(({ url: target }) => {
      const { shell } = require('electron')
      if (/^https?:\/\//i.test(target)) shell.openExternal(target)
      return { action: 'deny' }
    })
    entry = { view, url: '', hooked: false, options: {}, partition }
    views.set(win.webContents.id, entry)
  }
  const prevExtensionId = entry.options?.extensionId || ''
  const prevOpenCommand = entry.options?.openCommand || ''
  const prevEmbedSurface = entry.options?.embedSurface || ''
  const prevContainerId = entry.options?.containerId || ''
  entry.options = {
    extensionId: options.extensionId,
    openCommand: options.openCommand,
    title: options.title,
    embedSurface: options.embedSurface,
    containerId: options.containerId,
  }
  const wc = entry.view.webContents
  if (!entry.hooked) {
    entry.hooked = true
    wc.on('did-finish-load', () => {
      void prepareExtensionHostPage(wc).then(() => scheduleExtensionHostCommand(wc, entry.options))
    })
    // The workbench reloads itself on some setting changes, which restores its chrome, so the
    // open-once guard is released on every navigation and the next load re-applies everything.
    wc.on('did-navigate', () => clearExtensionHostCommandRun(wc))
    wc.on('did-fail-load', (_e, code, desc, url) => {
      if (code === -3) return
      console.warn('[extension-host] load failed', code, desc, url)
    })
  }
  const contextChanged =
    prevExtensionId !== entry.options.extensionId ||
    prevOpenCommand !== (entry.options.openCommand || '') ||
    prevEmbedSurface !== (entry.options.embedSurface || '') ||
    prevContainerId !== (entry.options.containerId || '')
  if (entry.url !== u) {
    entry.url = u
    clearExtensionHostCommandRun(wc)
    void wc.loadURL(u).catch(() => {})
  } else if (contextChanged && !wc.isLoading()) {
    clearExtensionHostCommandRun(wc)
    void wc.reload()
  } else if (!wc.isLoading()) {
    clearExtensionHostCommandRun(wc)
    scheduleExtensionHostCommand(wc, entry.options)
  }
  return { ok: true }
}

function layoutExtensionHostView(win, bounds) {
  const entry = getEntry(win)
  if (!entry || !win || win.isDestroyed()) return { ok: false }
  const x = Math.round(Number(bounds?.x) || 0)
  const y = Math.round(Number(bounds?.y) || 0)
  const w = Math.max(0, Math.round(Number(bounds?.width) || 0))
  const h = Math.max(0, Math.round(Number(bounds?.height) || 0))
  if (w < 8 || h < 8) {
    entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    return { ok: true, hidden: true }
  }
  win.setBrowserView(entry.view)
  entry.view.setBounds({ x, y, width: w, height: h })
  entry.view.setAutoResize({ width: false, height: false })
  const visible = x + w > 8 && y + h > 8 && x < 4000
  if (visible) {
    try {
      entry.view.webContents.focus()
    } catch {
      /* ignore */
    }
  }
  return { ok: true }
}

function hideExtensionHostView(win) {
  const entry = getEntry(win)
  if (!entry || !win || win.isDestroyed()) return { ok: true }
  try {
    const wc = entry.view.webContents
    clearExtensionHostCommandRun(wc)
    clearFocusTimers(wc)
    win.removeBrowserView(entry.view)
  } catch {
    /* ignore */
  }
  return { ok: true }
}

function destroyExtensionHostView(win) {
  let id
  try {
    if (!win || win.isDestroyed()) return
    id = win.webContents?.id
  } catch {
    return
  }
  if (!id) return
  hideExtensionHostView(win)
  const entry = views.get(id)
  try {
    if (entry?.view?.webContents && !entry.view.webContents.isDestroyed()) {
      clearFocusTimers(entry.view.webContents)
      entry.view.webContents.close()
    }
  } catch {
    /* ignore */
  }
  views.delete(id)
}

/** Destroy every embedded host view — used when the signed-in account changes. */
function notifyExtensionHostUiReady(hostWebContents) {
  if (!hostWebContents || hostWebContents.isDestroyed()) return
  const { BrowserWindow } = require('electron')
  for (const win of BrowserWindow.getAllWindows()) {
    const entry = views.get(win.webContents.id)
    if (entry?.view?.webContents === hostWebContents) {
      win.webContents.send('extension-host:ui-ready', {})
      return
    }
  }
}

function destroyAllExtensionHostViews() {
  for (const [id, entry] of views) {
    try {
      if (entry?.view?.webContents && !entry.view.webContents.isDestroyed()) {
        clearExtensionHostCommandRun(entry.view.webContents)
        clearFocusTimers(entry.view.webContents)
        entry.view.webContents.close()
      }
    } catch {
      /* ignore */
    }
    views.delete(id)
  }
}

module.exports = {
  attachExtensionHostView,
  layoutExtensionHostView,
  hideExtensionHostView,
  destroyExtensionHostView,
  destroyAllExtensionHostViews,
  notifyExtensionHostUiReady,
}
