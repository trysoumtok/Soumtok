/** Diagnostic preload (contextIsolation disabled) — surfaces the real service worker error. */
const sw = navigator.serviceWorker
if (sw && typeof sw.register === 'function') {
  const orig = sw.register.bind(sw)
  sw.register = function (url, opts) {
    const scope = (opts && opts.scope) || '(default)'
    return orig(url, opts).then(
      (reg) => {
        console.log(`SWPROBE ok url=${url} scope=${scope}`)
        return reg
      },
      (err) => {
        console.log(`SWPROBE fail url=${url} scope=${scope} -> ${err && err.name}: ${err && err.message}`)
        throw err
      },
    )
  }
}
