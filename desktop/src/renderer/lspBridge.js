/**
 * LSP bridge — Monaco handles TS/JS; other languages use the extension host.
 */
;(function initSoumtokLspBridge() {
  const LANG_EXT = {
    py: { id: 'ms-python.python', label: 'Python', command: 'python.openNativeInteractiveWindow' },
    rs: { id: 'rust-lang.rust-analyzer', label: 'Rust', command: 'rust-analyzer.openDocs' },
    go: { id: 'golang.go', label: 'Go', command: 'go.openPackage' },
    java: { id: 'redhat.java', label: 'Java', command: 'java.project.open' },
    cs: { id: 'ms-dotnettools.csharp', label: 'C#', command: 'dotnet.openProject' },
    cpp: { id: 'ms-vscode.cpptools', label: 'C/C++', command: 'C_Cpp.SwitchHeaderSource' },
    c: { id: 'ms-vscode.cpptools', label: 'C/C++', command: 'C_Cpp.SwitchHeaderSource' },
    h: { id: 'ms-vscode.cpptools', label: 'C/C++', command: 'C_Cpp.SwitchHeaderSource' },
    php: { id: 'bmewburn.vscode-intelephense-client', label: 'PHP', command: 'intelephense.indexWorkspace' },
    rb: { id: 'Shopify.ruby-lsp', label: 'Ruby', command: 'rubyLsp.start' },
  }

  const MONACO_LANGS = new Set([
    'javascript',
    'typescript',
    'javascriptreact',
    'typescriptreact',
    'json',
    'css',
    'html',
    'markdown',
    'yaml',
    'plaintext',
  ])

  function extForTab(tab) {
    const name = String(tab?.name || tab?.path || '').toLowerCase()
    const ext = name.includes('.') ? name.split('.').pop() : name
    return LANG_EXT[ext] || null
  }

  function monacoHandlesLanguage(langId) {
    return MONACO_LANGS.has(String(langId || '').toLowerCase())
  }

  function preferExtensionLsp() {
    const wb = window.__soumtokWorkbench
    return wb?.state?.agentPrefs?.preferExtensionLsp !== false
  }

  function removeBanner(host) {
    host?.querySelector('.editor-lsp-banner')?.remove()
  }

  function paintBanner(host, tab, hint) {
    if (!host || !hint) return
    removeBanner(host)
    const bar = document.createElement('div')
    bar.className = 'editor-lsp-banner'
    bar.innerHTML = `<span class="editor-lsp-banner-text">${hint.label} — full LSP via extension host</span>
      <button type="button" class="ghost editor-lsp-open">Open LSP</button>
      <button type="button" class="ghost editor-lsp-dismiss" aria-label="Dismiss">×</button>`
    bar.querySelector('.editor-lsp-dismiss')?.addEventListener('click', () => bar.remove())
    bar.querySelector('.editor-lsp-open')?.addEventListener('click', () => {
      void openExtensionLsp(hint)
      bar.remove()
    })
    host.insertBefore(bar, host.firstChild)
  }

  async function openExtensionLsp(hint) {
    const api = window.soumtok
    if (!api?.extensionHostStart) {
      window.__soumtokWorkbench?.appendPanelOutput?.('[LSP] Install Soumtok Code host (Settings → Setup)\n')
      return
    }
    const item = {
      extensionId: hint.id,
      displayName: `${hint.label} (LSP)`,
      openCommand: hint.command,
    }
    if (typeof window.__soumtokOpenExtensionLsp === 'function') {
      await window.__soumtokOpenExtensionLsp(item)
      return
    }
    await api.extensionHostStart?.({ usePlatformWorkspace: true })
    window.__soumtokWorkbench?.appendPanelOutput?.(
      `[LSP] Extension host started — install ${hint.id} from Extensions if needed.\n`,
    )
  }

  function onEditorRender(host, tab, langId) {
    if (!host || !tab) return
    if (monacoHandlesLanguage(langId)) {
      removeBanner(host)
      return
    }
    if (!preferExtensionLsp()) return
    const hint = extForTab(tab)
    if (!hint) return
    paintBanner(host, tab, hint)
  }

  window.SoumtokLspBridge = {
    onEditorRender,
    monacoHandlesLanguage,
    extForTab,
    openExtensionLsp,
  }
})()
