const { app, ipcMain, dialog } = require('electron')

let autoUpdater = null
let mainWindow = null

function initAutoUpdater(getMainWindow) {
  mainWindow = getMainWindow
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

  const feed = process.env.SOUMTOK_UPDATE_URL || ''
  if (feed) {
    try {
      autoUpdater.setFeedURL({ provider: 'generic', url: feed.replace(/\/$/, '') })
    } catch {
      /* ignore */
    }
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    const win = mainWindow?.()
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
    if (!win || win.isDestroyed()) return
    dialog
      .showMessageBox(win, {
        type: 'info',
        title: 'Update ready',
        message: 'Restart Soumtok to install the update.',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall(false, true)
      })
      .catch(() => {})
  })

  autoUpdater.on('error', (err) => {
    console.warn('[Soumtok] autoUpdater', err?.message || err)
  })

  registerUpdateIpc(async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return { ok: true, updateInfo: result?.updateInfo || null }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  })

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 12_000)
}

function registerUpdateIpc(checkFn) {
  ipcMain.handle('app:checkUpdates', () => checkFn())
}

module.exports = { initAutoUpdater }
