const { app, ipcMain, dialog } = require('electron')
const { getDesktopConfig } = require('./desktopControl')

let autoUpdater = null
let mainWindow = null
let forceUpdateMode = false

function isForceUpdateMode() {
  const config = getDesktopConfig()
  return forceUpdateMode || Boolean(config?.updateRequired)
}

function initAutoUpdater(getMainWindow, options = {}) {
  mainWindow = getMainWindow
  forceUpdateMode = Boolean(options.forceUpdate)

  if (!app.isPackaged) {
    registerUpdateIpc(() => ({ ok: false, reason: 'dev' }))
    return
  }

  try {
    autoUpdater = require('electron-updater').autoUpdater
  } catch {
    registerUpdateIpc(() => ({ ok: false, reason: 'module-missing' }))
    return
  }

  const config = getDesktopConfig()
  const feed = config?.updateFeedUrl || process.env.SOUMTOK_UPDATE_URL || ''
  if (feed) {
    try {
      autoUpdater.setFeedURL({ provider: 'generic', url: feed.replace(/\/$/, '') })
    } catch {
      /* ignore */
    }
  }

  autoUpdater.autoDownload = isForceUpdateMode()
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    const win = mainWindow?.()
    const forced = isForceUpdateMode()
    if (forced) {
      void autoUpdater.downloadUpdate()
      if (win && !win.isDestroyed()) {
        dialog.showMessageBox(win, {
          type: 'info',
          title: 'Update required',
          message: `Soumtok ${info?.version || ''} is required.`,
          detail: 'Downloading the update now. Soumtok will restart when it is ready.',
          buttons: ['OK'],
        }).catch(() => {})
      }
      return
    }
    if (!win || win.isDestroyed()) return
    dialog
      .showMessageBox(win, {
        type: 'info',
        title: 'Update available',
        message: `Soumtok ${info?.version || ''} is available.`,
        detail: 'Download and install on quit?',
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) void autoUpdater.downloadUpdate()
      })
      .catch(() => {})
  })

  autoUpdater.on('update-downloaded', () => {
    const win = mainWindow?.()
    const forced = isForceUpdateMode()
    if (!win || win.isDestroyed()) {
      if (forced) autoUpdater.quitAndInstall(false, true)
      return
    }
    dialog
      .showMessageBox(win, {
        type: 'info',
        title: forced ? 'Update ready — restart required' : 'Update ready',
        message: forced ? 'Restart Soumtok to finish the required update.' : 'Restart Soumtok to install the update.',
        buttons: forced ? ['Restart now'] : ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: forced ? 0 : 1,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall(false, true)
      })
      .catch(() => {})
  })

  autoUpdater.on('update-not-available', () => {
    /* manual check uses IPC return value */
  })

  autoUpdater.on('error', (err) => {
    console.warn('[Soumtok] autoUpdater', err?.message || err)
  })

  registerUpdateIpc(async () => {
    try {
      autoUpdater.autoDownload = isForceUpdateMode()
      const result = await autoUpdater.checkForUpdates()
      return { ok: true, updateInfo: result?.updateInfo || null, forceUpdate: isForceUpdateMode() }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  })

  setTimeout(() => {
    autoUpdater.autoDownload = isForceUpdateMode()
    autoUpdater.checkForUpdates().catch(() => {})
  }, 12_000)
}

function registerUpdateIpc(checkFn) {
  ipcMain.handle('app:checkUpdates', () => checkFn())
}

module.exports = { initAutoUpdater }
