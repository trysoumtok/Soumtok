/** Wire xterm UMD globals for terminalPanel (must run in renderer — not via preload). */
;(function () {
  if (window.xterm?.Terminal && typeof window.xterm.Terminal === 'function') return
  const termExport = globalThis.Terminal
  const fitExport = globalThis.FitAddon
  const Terminal = termExport?.Terminal ?? termExport
  const FitAddon = fitExport?.FitAddon ?? fitExport
  if (typeof Terminal !== 'function') {
    console.error('[soumtok] xterm.js did not load — check node_modules/@xterm/xterm in index.html')
    return
  }
  window.xterm = {
    Terminal,
    FitAddon: typeof FitAddon === 'function' ? FitAddon : null,
  }
})()
