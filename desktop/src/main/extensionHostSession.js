/**
 * Session fixes for the embedded host. code-server registers its webview service worker at
 * root scope without sending `Service-Worker-Allowed: /`, so Chromium rejects it and every
 * webview (Claude's UI included) renders blank. We add the header on the way in.
 */

const SERVICE_WORKER_URL = /service-?worker[^/]*\.js(\?|$)/i

function applyHostSessionFixes(ses) {
  if (!ses || ses.__soumtokHostFixes) return
  ses.__soumtokHostFixes = true
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(true))
  ses.setPermissionCheckHandler(() => true)
  ses.webRequest.onHeadersReceived(
    { urls: ['http://127.0.0.1/*', 'http://127.0.0.1:*/*', 'http://localhost/*', 'http://localhost:*/*'] },
    (details, callback) => {
      if (!SERVICE_WORKER_URL.test(details.url)) {
        callback({})
        return
      }
      const responseHeaders = { ...(details.responseHeaders || {}) }
      for (const key of Object.keys(responseHeaders)) {
        if (key.toLowerCase() === 'service-worker-allowed') delete responseHeaders[key]
      }
      responseHeaders['Service-Worker-Allowed'] = ['/']
      callback({ responseHeaders })
    },
  )
}

module.exports = { applyHostSessionFixes }
