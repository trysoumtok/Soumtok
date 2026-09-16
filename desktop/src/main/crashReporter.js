const { app, crashReporter, ipcMain } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const CRASH_DIR = path.join(app.getPath('userData'), 'crashes')

function ensureCrashDir() {
  try {
    fs.mkdirSync(CRASH_DIR, { recursive: true })
  } catch {
    /* ignore */
  }
}

function startCrashReporter() {
  ensureCrashDir()
  try {
    crashReporter.start({
      productName: app.getName() || 'Soumtok',
      companyName: 'Soumtok',
      submitURL: process.env.SOUMTOK_CRASH_URL || '',
      uploadToServer: Boolean(process.env.SOUMTOK_CRASH_URL),
      compress: true,
      ignoreSystemCrashHandler: false,
    })
  } catch {
    /* crashReporter may fail in dev */
  }
}

function registerCrashIpc() {
  ipcMain.handle('crash:last', () => {
    ensureCrashDir()
    try {
      const files = fs
        .readdirSync(CRASH_DIR)
        .filter((f) => f.endsWith('.json') || f.endsWith('.log'))
        .map((f) => ({ name: f, mtime: fs.statSync(path.join(CRASH_DIR, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)
      return { dir: CRASH_DIR, files: files.slice(0, 8) }
    } catch {
      return { dir: CRASH_DIR, files: [] }
    }
  })

  ipcMain.handle('crash:log', (_e, payload) => {
    ensureCrashDir()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const file = path.join(CRASH_DIR, `renderer-${stamp}.json`)
    const row = {
      at: new Date().toISOString(),
      platform: process.platform,
      versions: process.versions,
      message: String(payload?.message || ''),
      stack: String(payload?.stack || ''),
      context: payload?.context || null,
    }
    try {
      fs.writeFileSync(file, JSON.stringify(row, null, 2), 'utf8')
      return { ok: true, file }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  })
}

function bindProcessHandlers() {
  process.on('uncaughtException', (err) => {
    ensureCrashDir()
    try {
      const file = path.join(CRASH_DIR, `main-${Date.now()}.log`)
      fs.writeFileSync(
        file,
        `[${new Date().toISOString()}] uncaughtException\n${err?.stack || err}\n`,
        'utf8',
      )
    } catch {
      /* ignore */
    }
    console.error('[Soumtok] uncaughtException', err)
  })

  process.on('unhandledRejection', (reason) => {
    ensureCrashDir()
    try {
      const file = path.join(CRASH_DIR, `main-reject-${Date.now()}.log`)
      fs.writeFileSync(
        file,
        `[${new Date().toISOString()}] unhandledRejection\n${reason?.stack || reason}\n`,
        'utf8',
      )
    } catch {
      /* ignore */
    }
    console.error('[Soumtok] unhandledRejection', reason)
  })
}

module.exports = { startCrashReporter, registerCrashIpc, bindProcessHandlers, CRASH_DIR }
