/**
 * Inline agent diff review — Monaco diff editor overlay in the main editor host.
 */
;(function initSoumtokEditorDiff() {
  const state = {
    open: false,
    path: '',
    before: '',
    after: '',
    onAccept: null,
    onReject: null,
    diffEditor: null,
    originalModel: null,
    modifiedModel: null,
  }

  function bar() {
    return document.getElementById('editor-diff-bar')
  }

  function host() {
    return document.getElementById('editor')
  }

  function close() {
    const b = bar()
    if (b) b.hidden = true
    if (state.diffEditor) {
      try {
        state.diffEditor.dispose()
      } catch {
        /* ignore */
      }
      state.diffEditor = null
    }
    if (state.originalModel) {
      try {
        state.originalModel.dispose()
      } catch {
        /* ignore */
      }
      state.originalModel = null
    }
    if (state.modifiedModel) {
      try {
        state.modifiedModel.dispose()
      } catch {
        /* ignore */
      }
      state.modifiedModel = null
    }
    state.open = false
    state.path = ''
    state.before = ''
    state.after = ''
    state.onAccept = null
    state.onReject = null
    const h = host()
    if (h) {
      h.classList.remove('editor-diff-active')
      const monacoHost = h.querySelector('.editor-monaco-host')
      if (monacoHost) monacoHost.hidden = false
      const diffHost = h.querySelector('.editor-diff-host')
      if (diffHost) diffHost.remove()
    }
  }

  let barBound = false

  function ensureBar() {
    const b = bar()
    if (!b) return null
    if (!barBound) {
      barBound = true
      b.querySelector('#editor-diff-accept')?.addEventListener('click', () => {
        const fn = state.onAccept
        close()
        fn?.()
      })
      b.querySelector('#editor-diff-reject')?.addEventListener('click', () => {
        const fn = state.onReject
        close()
        fn?.()
      })
    }
    return b
  }

  function show(path, before, after, opts = {}) {
    if (!window.monaco) return false
    const h = host()
    if (!h) return false
    close()
    state.open = true
    state.path = path
    state.before = before
    state.after = after
    state.onAccept = opts.onAccept || null
    state.onReject = opts.onReject || null

    const b = ensureBar()
    b.hidden = false
    const label = document.getElementById('editor-diff-label')
    if (label) {
      const name = String(path || '').split(/[/\\]/).pop() || path
      label.textContent = `Review agent edit · ${name}`
    }

    h.classList.add('editor-diff-active')
    let diffHost = h.querySelector('.editor-diff-host')
    if (!diffHost) {
      diffHost = document.createElement('div')
      diffHost.className = 'editor-diff-host'
      h.appendChild(diffHost)
    }
    const monacoHost = h.querySelector('.editor-monaco-host')
    if (monacoHost) monacoHost.hidden = true

    const uri = window.monaco.Uri.file(String(path || 'file').replace(/\\/g, '/'))
    state.originalModel = window.monaco.editor.createModel(before, undefined, uri)
    state.modifiedModel = window.monaco.editor.createModel(after, undefined, uri.with({ path: `${uri.path}.modified` }))
    state.diffEditor = window.monaco.editor.createDiffEditor(diffHost, {
      automaticLayout: true,
      readOnly: true,
      renderSideBySide: true,
      theme: document.body.classList.contains('theme-light') ? 'vs' : 'vs-dark',
    })
    state.diffEditor.setModel({
      original: state.originalModel,
      modified: state.modifiedModel,
    })
    return true
  }

  window.SoumtokEditorDiff = { show, close, isOpen: () => state.open }
})()
