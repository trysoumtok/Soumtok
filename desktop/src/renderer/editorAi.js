/**
 * Soumtok Tab (inline completions) + Ctrl+K inline edit — Monaco layer.
 * Full VS Code extensions still need the extension host (see docs/VSCODE-EXTENSION-API-GUIDE.md).
 */
;(function () {
  const api = window.soumtok
  if (!api?.editorAiComplete) return

  const state = {
    registered: false,
    tabEnabled: true,
    tabDebounce: null,
    inlineWidget: null,
    providerDisposables: [],
    tabStats: { offered: 0, accepted: 0 },
    lastOfferText: '',
    lastOfferAt: 0,
  }

  function getWorkbenchState() {
    return window.__soumtokWorkbench || null
  }

  function tabModelId() {
    const wb = getWorkbenchState()
    const fromPrefs = wb?.state?.agentPrefs?.tabModel || wb?.state?.tabModel
    return fromPrefs || wb?.state?.agentModel || 'auto'
  }

  function tabEnabled() {
    const wb = getWorkbenchState()
    if (wb?.state?.agentPrefs?.tabCompletions === false) return false
    if (wb?.state?.tabCompletions === false) return false
    return state.tabEnabled
  }

  function workspaceFolder() {
    const wb = getWorkbenchState()
    return wb?.state?.folder || null
  }

  function activeFilePath() {
    const wb = getWorkbenchState()
    if (!wb?.activeEditorTab) return ''
    const tab = wb.activeEditorTab()
    return tab?.path || ''
  }

  function relatedOpenSnippets(activePath) {
    const wb = getWorkbenchState()
    const tabs = wb?.state?.tabs || []
    const cur = String(activePath || '').replace(/\\/g, '/').toLowerCase()
    const out = []
    for (const tab of tabs) {
      const p = String(tab?.path || '').replace(/\\/g, '/')
      if (!p || p.toLowerCase() === cur || tab.agentPeek) continue
      if (!/\.(js|jsx|ts|tsx|json|css|html|md|py|rs|go)$/i.test(p)) continue
      const text = String(tab.text || '')
      if (!text.trim()) continue
      out.push({ path: p.split('/').pop() || p, snippet: text.slice(0, 1200) })
      if (out.length >= 3) break
    }
    return out
  }

  function tabDebounceMs() {
    const model = tabModelId()
    if (String(model).includes('flash') || model === 'auto') return 260
    return 340
  }

  async function fetchCompletion(model, position, monacoModel) {
    const offset = monacoModel.getOffsetAt(position)
    const full = monacoModel.getValue()
    const prefix = full.slice(0, offset)
    const suffix = full.slice(offset)
    const filePath = activeFilePath()
    return api.editorAiComplete({
      kind: 'tab',
      model: tabModelId(),
      language: monacoModel.getLanguageId(),
      filePath,
      folder: workspaceFolder(),
      prefix,
      suffix,
      openFiles: (getWorkbenchState()?.state?.tabs || []).map((t) => t.path).filter(Boolean),
      relatedSnippets: relatedOpenSnippets(filePath),
    })
  }

  function registerProviders(monaco) {
    if (state.registered || !monaco?.languages?.registerInlineCompletionsProvider) return
    state.registered = true
    const langs = [
      'javascript',
      'javascriptreact',
      'typescript',
      'typescriptreact',
      'json',
      'css',
      'html',
      'markdown',
      'python',
      'rust',
      'go',
      'plaintext',
    ]
    let pending = null
    const waitQuiet = (token) =>
      new Promise((resolve) => {
        if (pending) clearTimeout(pending)
        pending = setTimeout(resolve, tabDebounceMs())
        if (token?.onCancellationRequested) {
          token.onCancellationRequested(() => {
            clearTimeout(pending)
            resolve('cancel')
          })
        }
      })
    for (const lang of langs) {
      const disp = monaco.languages.registerInlineCompletionsProvider(lang, {
        provideInlineCompletions: async (model, position, _ctx, token) => {
          if (!tabEnabled() || token.isCancellationRequested) return { items: [] }
          const typed = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
          if (!typed.trim() && position.column < 3) return { items: [] }
          const quiet = await waitQuiet(token)
          if (quiet === 'cancel' || token.isCancellationRequested) return { items: [] }
          try {
            const res = await fetchCompletion(model, position, model)
            if (token.isCancellationRequested || !res?.ok || !res.text) return { items: [] }
            const word = model.getWordUntilPosition(position)
            const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, position.column)
            state.tabStats.offered += 1
            state.lastOfferText = String(res.text)
            state.lastOfferAt = Date.now()
            window.__soumtokWorkbench?.updateStatus?.()
            return { items: [{ insertText: res.text, range }] }
          } catch {
            return { items: [] }
          }
        },
        freeInlineCompletions: () => {},
      })
      state.providerDisposables.push(disp)
    }
  }

  function removeInlineWidget() {
    if (state.inlineWidget?.el?.parentNode) state.inlineWidget.el.remove()
    state.inlineWidget = null
  }

  function openInlineEdit(hostEl) {
    const wb = getWorkbenchState()
    const editor = wb?.state?.editor
    if (!editor || !hostEl) return
    removeInlineWidget()
    const sel = editor.getSelection()
    const model = editor.getModel()
    if (!model || !sel) return
    const selection = model.getValueInRange(sel)
    const wrap = document.createElement('div')
    wrap.className = 'inline-k-widget'
    wrap.innerHTML = `<label class="inline-k-label">Inline edit (Ctrl+K)</label>
      <input type="text" class="inline-k-input" placeholder="Describe the change…" autocomplete="off" />
      <div class="inline-k-actions">
        <button type="button" class="inline-k-cancel">Cancel</button>
        <button type="button" class="inline-k-submit primary">Apply</button>
      </div>`
    hostEl.appendChild(wrap)
    const input = wrap.querySelector('.inline-k-input')
    const rect = editor.getScrolledVisiblePosition(sel.getStartPosition())
    if (rect) {
      wrap.style.top = `${Math.max(8, rect.top + 24)}px`
      wrap.style.left = `${Math.max(8, rect.left)}px`
    }
    state.inlineWidget = { el: wrap, sel, selection }
    input.focus()
    wrap.querySelector('.inline-k-cancel').onclick = () => removeInlineWidget()
    wrap.querySelector('.inline-k-submit').onclick = () => void submitInlineEdit(input.value, editor, sel, selection)
    input.onkeydown = (e) => {
      if (e.key === 'Escape') removeInlineWidget()
      if (e.key === 'Enter') {
        e.preventDefault()
        void submitInlineEdit(input.value, editor, sel, selection)
      }
    }
  }

  async function submitInlineEdit(instruction, editor, sel, selection) {
    const model = editor.getModel()
    if (!model) return
    removeInlineWidget()
    const res = await api.editorAiComplete({
      kind: 'inline-edit',
      model: tabModelId(),
      language: model.getLanguageId(),
      filePath: activeFilePath(),
      folder: workspaceFolder(),
      selection,
      instruction,
    })
    if (!res?.ok) {
      window.__soumtokWorkbench?.appendPanelOutput?.(`[inline edit] ${res?.error || 'Failed'}\n`)
      return
    }
    editor.executeEdits('soumtok-inline-k', [{ range: sel, text: res.text, forceMoveMarkers: true }])
    triggerNextEdit()
  }

  function triggerNextEdit() {
    const editor = getWorkbenchState()?.state?.editor
    if (!editor || !tabEnabled()) return
    setTimeout(() => {
      try {
        editor.trigger('soumtok-tab', 'editor.action.inlineSuggest.trigger', {})
      } catch {
        /* monaco build without this command */
      }
    }, 120)
  }

  function noteTabAccepted(insertText) {
    const t = String(insertText || '')
    if (!t) return
    if (state.lastOfferText && t.includes(state.lastOfferText.slice(0, 12))) {
      state.tabStats.accepted += 1
      state.lastOfferText = ''
      window.__soumtokWorkbench?.updateStatus?.()
      triggerNextEdit()
    }
  }

  window.SoumtokEditorAi = {
    registerProviders,
    openInlineEdit,
    removeInlineWidget,
    getTabStats() {
      return { ...state.tabStats }
    },
    noteTabAccepted,
    setTabEnabled(on) {
      state.tabEnabled = on
      window.__soumtokWorkbench?.updateStatus?.()
    },
  }
})()
