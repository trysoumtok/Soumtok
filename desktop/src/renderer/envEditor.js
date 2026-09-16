/** Dotenv files (.env, .env.local, …) — key/value editor like IDE environment settings. */
;(function () {
  function isDotEnvFileName(name) {
    const base = String(name || '').split(/[/\\]/).pop() || ''
    if (base === '.env') return true
    if (base.startsWith('.env.')) return true
    return false
  }

  function parseDotEnv(text) {
    const lines = String(text || '').split(/\r?\n/)
    const comments = []
    const pairs = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        comments.push(line)
        continue
      }
      const eq = line.indexOf('=')
      if (eq < 1) {
        comments.push(line)
        continue
      }
      const key = line.slice(0, eq).trim()
      let value = line.slice(eq + 1)
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      pairs.push({ key, value })
    }
    return { comments, pairs }
  }

  function serializeDotEnv(comments, pairs) {
    const out = []
    for (const line of comments || []) out.push(line)
    if (out.length && pairs?.length) out.push('')
    for (const row of pairs || []) {
      const key = String(row.key || '').trim()
      if (!key) continue
      const val = String(row.value ?? '')
      const needsQuote = /[\s#"'\\]/.test(val)
      out.push(`${key}=${needsQuote ? `"${val.replace(/"/g, '\\"')}"` : val}`)
    }
    return out.join('\n')
  }

  function hydrateEnvTab(tab) {
    if (!tab.envPairs) {
      const parsed = parseDotEnv(tab.text || '')
      tab.envComments = parsed.comments
      tab.envPairs = parsed.pairs
    }
    return tab
  }

  function render(host, tab, hooks) {
    hydrateEnvTab(tab)
    const pairs = tab.envPairs
    host.classList.remove('editor-monaco-host', 'ext-editor-host')
    host.innerHTML = `<div class="env-editor-page">
      <header class="env-editor-head">
        <div>
          <h1 class="env-editor-title">Environment variables</h1>
          <p class="env-editor-path">${escapeHtml(tab.name)}</p>
        </div>
        <div class="env-editor-head-actions">
          <button type="button" class="ghost env-editor-raw" id="env-edit-raw">Edit as text</button>
          <button type="button" class="primary env-editor-save" id="env-edit-save">Save</button>
        </div>
      </header>
      <p class="env-editor-lead">Keys in this file become environment variables for Soumtok tools and terminals in this workspace.</p>
      <div class="env-editor-table-wrap soumtok-scroll">
        <table class="env-editor-table" aria-label="Environment variables">
          <thead><tr><th>Key</th><th>Value</th><th></th></tr></thead>
          <tbody id="env-editor-rows"></tbody>
        </table>
      </div>
      <button type="button" class="env-editor-add" id="env-edit-add">+ Add variable</button>
    </div>`

    const tbody = host.querySelector('#env-editor-rows')

    function syncText() {
      tab.text = serializeDotEnv(tab.envComments, tab.envPairs)
    }

    function paint() {
      tbody.innerHTML = pairs
        .map(
          (row, idx) => `<tr data-idx="${idx}">
            <td><input type="text" class="env-key" value="${escapeAttr(row.key)}" autocomplete="off" spellcheck="false" /></td>
            <td><input type="text" class="env-val" value="${escapeAttr(row.value)}" autocomplete="off" spellcheck="false" /></td>
            <td><button type="button" class="env-row-del" title="Remove" aria-label="Remove">×</button></td>
          </tr>`,
        )
        .join('')
      tbody.querySelectorAll('tr').forEach((tr) => {
        const idx = Number(tr.dataset.idx)
        tr.querySelector('.env-key')?.addEventListener('input', (e) => {
          pairs[idx].key = e.target.value
          syncText()
          hooks.onDirty?.()
        })
        tr.querySelector('.env-val')?.addEventListener('input', (e) => {
          pairs[idx].value = e.target.value
          syncText()
          hooks.onDirty?.()
        })
        tr.querySelector('.env-row-del')?.onclick = () => {
          pairs.splice(idx, 1)
          syncText()
          paint()
          hooks.onDirty?.()
        }
      })
    }

    paint()
    host.querySelector('#env-edit-add')?.addEventListener('click', () => {
      pairs.push({ key: '', value: '' })
      syncText()
      paint()
      hooks.onDirty?.()
      tbody.querySelector('tr:last-child .env-key')?.focus()
    })
    host.querySelector('#env-edit-save')?.addEventListener('click', () => {
      syncText()
      void hooks.onSave?.()
    })
    host.querySelector('#env-edit-raw')?.addEventListener('click', () => {
      syncText()
      tab.envEditorMode = 'text'
      hooks.onRenderText?.()
    })
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;')
  }

  window.SoumtokEnvEditor = {
    isDotEnvFileName,
    parseDotEnv,
    serializeDotEnv,
    hydrateEnvTab,
    render,
  }
})()
