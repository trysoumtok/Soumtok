const { app, dialog } = require('electron')
const http = require('http')
const https = require('https')

let cachedConfig = null
let pollTimer = null

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(
      url,
      {
        headers: {
          Accept: 'application/json',
          ...headers,
        },
      },
      (res) => {
        let body = ''
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`))
            return
          }
          try {
            resolve(JSON.parse(body))
          } catch (err) {
            reject(err)
          }
        })
      },
    )
    req.on('error', reject)
    req.setTimeout(12_000, () => {
      req.destroy(new Error('timeout'))
    })
  })
}

async function fetchDesktopConfig(apiBase, version) {
  const url = `${apiBase.replace(/\/$/, '')}/api/desktop/config`
  const config = await fetchJson(url, {
    'X-Soumtok-Desktop-Version': version,
    'User-Agent': `SoumtokDesktop/${version}`,
  })
  cachedConfig = config
  return config
}

function getDesktopConfig() {
  return cachedConfig
}

async function enforceDesktopPolicy(config, getMainWindow) {
  if (!config?.disabled) return { ok: true, config }

  const message =
    config.disabledMessage ||
    'Soumtok Desktop is temporarily unavailable. Use Studio in the browser at soumtok.com.'

  const win = getMainWindow?.()
  if (win && !win.isDestroyed()) {
    await dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Soumtok unavailable',
      message: 'This desktop build has been disabled.',
      detail: message,
      buttons: ['Quit'],
    })
  } else {
    await dialog.showMessageBox({
      type: 'warning',
      title: 'Soumtok unavailable',
      message: 'This desktop build has been disabled.',
      detail: message,
      buttons: ['Quit'],
    })
  }

  app.quit()
  return { ok: false, config, reason: 'disabled' }
}

async function initDesktopControl({ apiBase, version, getMainWindow }) {
  if (!app.isPackaged) {
    return { ok: true, config: null, reason: 'dev' }
  }

  try {
    const config = await fetchDesktopConfig(apiBase, version)
    const enforced = await enforceDesktopPolicy(config, getMainWindow)
    if (!enforced.ok) return enforced
    return { ok: true, config }
  } catch (err) {
    console.warn('[Soumtok] desktop config fetch failed', err?.message || err)
    return { ok: true, config: null, reason: 'offline' }
  }
}

function startDesktopControlPolling({ apiBase, version, getMainWindow, intervalMs = 6 * 60 * 60_000 }) {
  if (!app.isPackaged || pollTimer) return
  pollTimer = setInterval(() => {
    void fetchDesktopConfig(apiBase, version)
      .then((config) => enforceDesktopPolicy(config, getMainWindow))
      .catch(() => {})
  }, intervalMs)
  if (typeof pollTimer.unref === 'function') pollTimer.unref()
}

module.exports = {
  initDesktopControl,
  startDesktopControlPolling,
  fetchDesktopConfig,
  getDesktopConfig,
  enforceDesktopPolicy,
}
