/**
 * Test Hub — direct model chat (no agent harness) with code cards + live preview.
 */
;(function () {
  const CATALOG = window.SOUMTOK_MODEL_CATALOG || { MODELS: [], sortForDisplay: (l) => l }
  const ART = () => window.SoumtokTestHubArtifacts || {}

  const TEST_HUB_SYSTEM = `You are in Soumtok Test Hub — direct model access with no agent harness, no tools, and no automatic workspace scan.
Only use text the user sends, files they explicitly attach, and the project files already in this chat session.
You cannot see their folders, desktop, or repo unless they attach those files or paste contents.
If they refer to files or images you were not given, say so and ask them to attach what you need.

This chat has memory: earlier turns and the current project files stay in context. When the user asks for changes, edits, fixes, or follow-ups, update the existing project — do not start over from scratch unless they ask for a brand-new app.
Answer directly and helpfully — build, explain, review, or debug based on what they provide.

When the user asks you to build or change a page, app, or UI: always include runnable fenced files with paths, e.g.
\`\`\`html file="index.html"
<!DOCTYPE html>...
\`\`\`
Add separate \`\`\`css file="style.css"\`\`\` and \`\`\`javascript file="script.js"\`\`\` blocks when needed.
Prefer rewriting the full updated file contents for each changed path so the live preview stays correct.`

  const TEST_HUB_AVATAR_BLUE = '#2f6fed'

  let hubAvatar = null
  let modelFilesSnapshot = {}
  let previewRefreshTimer = null

  const GOOGLE_STUBS = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', cost: 'Low', strength: 'Fast Gemini' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', cost: 'Mid', strength: 'Strong Gemini' },
    { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', provider: 'google', cost: 'Cheap', strength: 'Light Gemini' },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', provider: 'google', cost: 'Cheap', strength: 'New Gemini' },
  ]

  const STORAGE_KEY = 'soumtok-test-hub-session'
  const LIVE_LINKS_KEY = 'soumtok-test-hub-live-links'

  const state = {
    model: 'auto',
    models: [],
    messages: [],
    pending: [],
    busy: false,
    files: {},
    outputTab: 'preview',
    live: '',
    modelPanelOpen: false,
    modelSearch: '',
    activeFile: '',
    archivesOpen: false,
    saveHint: '',
    workspaces: [],
    activeId: '',
    dirtyFiles: {},
    compareMode: false,
    comparePick: ['deepseek-v4-flash', 'deepseek-chat'],
    compareRuns: [],
    compareActive: false,
    previewLogs: [],
    sandboxOpen: false,
    sandboxBusy: false,
    sandboxLog: '',
    lastBenchmarkId: '',
    scoresOpen: false,
    linksOpen: false,
    shareBusy: false,
    activeLiveDeploy: null,
    plan: 'hobby',
    byokAllowed: false,
  }

  const DEFAULT_COMPARE_PICK = ['deepseek-v4-flash', 'gpt-4.1-mini']

  /** Matches shared/usagePools EVERYDAY_MODEL_IDS — Start plan pool. */
  const EVERYDAY_MODEL_IDS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro', 'gpt-4.1-mini'])

  let persistTimer = null
  let upgradeModalEl = null
  let previewMessageBound = false
  let lastPreviewSrc = ''

  function $(id, root) {
    return (root || document).getElementById(id)
  }

  function api() {
    return window.soumtok
  }

  function mountHubAvatar() {
    const host = $('test-hub-avatar-host')
    if (!host || !window.SoumtokAgentAvatar?.mountInline) return
    hubAvatar = window.SoumtokAgentAvatar.mountInline(host, {
      color: TEST_HUB_AVATAR_BLUE,
      size: 30,
      state: state.busy ? 'working' : 'idle',
    })
  }

  function setHubAvatarState(next) {
    const host = $('test-hub-avatar-host')
    if (host && window.SoumtokAgentAvatar?.setInlineState) {
      window.SoumtokAgentAvatar.setInlineState(host, next)
    } else {
      hubAvatar?.setState?.(next)
    }
  }

  function projectFilesSnapshot(files) {
    const paths = Object.keys(files || {}).sort()
    if (!paths.length) return ''
    const parts = []
    let total = 0
    for (const path of paths) {
      let body = String(files[path] ?? '')
      if (body.length > 40_000) body = `${body.slice(0, 40_000)}\n/* …truncated… */`
      const chunk = `### ${path}\n\`\`\`\n${body}\n\`\`\``
      if (total + chunk.length > 120_000) {
        parts.push(`### ${path}\n(/* omitted — context limit */)`)
        break
      }
      parts.push(chunk)
      total += chunk.length
    }
    return `Current project files in this Test Hub session (includes any user edits). Continue from these when the user asks for changes:\n\n${parts.join('\n\n')}`
  }

  function refreshPreviewOnly() {
    const preview = wrapPreviewHtml(state.files)
    const stack = $('test-hub-preview-stack')
    const frame = $('test-hub-preview')
    const previewEmpty = $('test-hub-preview-empty')
    if (!frame) return
    if (preview) {
      if (stack) stack.hidden = false
      frame.hidden = false
      if (previewEmpty) previewEmpty.hidden = true
      if (preview !== lastPreviewSrc) {
        lastPreviewSrc = preview
        clearPreviewConsole()
        frame.srcdoc = preview
      }
    } else {
      lastPreviewSrc = ''
      if (stack) stack.hidden = true
      frame.hidden = true
      frame.removeAttribute('srcdoc')
      if (previewEmpty) previewEmpty.hidden = false
      clearPreviewConsole()
    }
  }

  function syncFileEditorHighlight(fromScroll) {
    const editor = $('test-hub-file-editor')
    const highlight = $('test-hub-file-highlight')
    if (!editor || !highlight) return
    if (fromScroll) {
      highlight.scrollTop = editor.scrollTop
      highlight.scrollLeft = editor.scrollLeft
      return
    }
    const code = highlight.querySelector('code')
    if (!code) return
    const path = state.activeFile || editor.dataset.path || ''
    const ext = path.split('.').pop() || 'txt'
    code.innerHTML = highlightCode(editor.value, ext)
    highlight.scrollTop = editor.scrollTop
    highlight.scrollLeft = editor.scrollLeft
  }

  function flushFileEditor() {
    const editor = $('test-hub-file-editor')
    const path = state.activeFile
    if (!editor || !path) return
    const next = editor.value
    if (state.files[path] === next) return
    state.files[path] = next
    state.dirtyFiles[path] = true
  }

  function filesForExport() {
    flushFileEditor()
    snapshotActive()
    schedulePersist()
    return { ...state.files }
  }

  function onFileEditorInput() {
    const editor = $('test-hub-file-editor')
    const path = state.activeFile
    if (!editor || !path) return
    state.files[path] = editor.value
    state.dirtyFiles[path] = true
    syncFileEditorHighlight()
    schedulePersist()
    if (previewRefreshTimer) clearTimeout(previewRefreshTimer)
    previewRefreshTimer = setTimeout(() => {
      previewRefreshTimer = null
      refreshPreviewOnly()
    }, 280)
  }

  function workspaceId() {
    return `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  }

  function emptyWorkspace(partial = {}) {
    return {
      id: workspaceId(),
      title: 'New project',
      model: 'auto',
      messages: [],
      files: {},
      activeFile: '',
      outputTab: 'preview',
      updatedAt: Date.now(),
      ...partial,
    }
  }

  function ensureActiveWorkspace() {
    if (!state.workspaces.length) {
      const ws = emptyWorkspace({ title: 'Project 1', model: state.model })
      state.workspaces = [ws]
      state.activeId = ws.id
      return ws
    }
    let ws = state.workspaces.find((w) => w.id === state.activeId)
    if (!ws) {
      ws = state.workspaces[0]
      state.activeId = ws.id
    }
    return ws
  }

  function snapshotActive() {
    const ws = ensureActiveWorkspace()
    ws.title = projectTitleFromMessages(state.messages) || ws.title || 'New project'
    ws.model = state.model
    ws.messages = state.messages
    ws.files = { ...state.files }
    ws.activeFile = state.activeFile
    ws.outputTab = state.outputTab
    ws.updatedAt = Date.now()
    return ws
  }

  function applyWorkspace(ws) {
    if (!ws) return
    state.activeId = ws.id
    state.model = ws.model || 'auto'
    state.messages = Array.isArray(ws.messages) ? ws.messages : []
    state.files = ws.files && typeof ws.files === 'object' ? { ...ws.files } : {}
    state.activeFile = ws.activeFile || ''
    state.outputTab = ws.outputTab === 'code' ? 'code' : 'preview'
    state.pending = []
    state.live = ''
    state.archivesOpen = false
    state.saveHint = ''
    state.dirtyFiles = {}
    const fromChat = {}
    for (const msg of state.messages) {
      if (msg.role === 'assistant') Object.assign(fromChat, extractBuildArtifacts(msg.content))
    }
    modelFilesSnapshot = { ...fromChat }
    for (const path of Object.keys(state.files)) {
      if (state.files[path] !== fromChat[path]) state.dirtyFiles[path] = true
    }
  }

  function projectTitleFromMessages(messages) {
    const first = (messages || []).find((m) => m.role === 'user' && m.content?.trim())
    if (!first) return ''
    return (
      first.content
        .trim()
        .slice(0, 36)
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, ' ') || ''
    )
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

  function isGoogleModel(m) {
    return m?.provider === 'google' || /^gemini|gemma/i.test(String(m?.id || ''))
  }

  function isUnpaidPlan(plan) {
    return !plan || plan === 'hobby' || plan === 'trial'
  }

  function hasAdditionalPool(plan) {
    const p = plan === 'teams' ? 'team' : plan || 'hobby'
    return p === 'pro' || p === 'pro_plus' || p === 'team' || p === 'team_plus'
  }

  function isEverydayModelId(id) {
    return EVERYDAY_MODEL_IDS.has(String(id || ''))
  }

  /** @returns {{ tier: 'ok' | 'locked', pool?: 'everyday' | 'additional', reason?: 'subscribe' | 'pro' | 'soon' | 'keys' }} */
  function modelAccess(m) {
    const id = m?.id || 'auto'
    if (isGoogleModel(m)) return { tier: 'locked', reason: 'soon' }
    if (isUnpaidPlan(state.plan)) return { tier: 'locked', reason: 'subscribe' }
    if (id === 'auto') return { tier: 'ok', pool: 'everyday' }
    if (isEverydayModelId(id)) return { tier: 'ok', pool: 'everyday' }
    if (hasAdditionalPool(state.plan)) return { tier: 'ok', pool: 'additional' }
    return { tier: 'locked', reason: 'pro' }
  }

  function isHubModelSelectable(m) {
    return modelAccess(m).tier === 'ok'
  }

  function isHubModelDisabled(m) {
    return !isHubModelSelectable(m)
  }

  function planLabelShort() {
    if (isUnpaidPlan(state.plan)) return 'Free — no plan'
    const labels = {
      start: 'Start',
      pro: 'Pro',
      pro_plus: 'Pro Plus',
      team: 'Team',
      teams: 'Team',
      team_plus: 'Team Premium',
    }
    return labels[state.plan] || 'Plan'
  }

  function upgradeCopy(reason) {
    if (reason === 'subscribe') {
      return {
        title: 'Subscribe to start coding',
        body: 'Test Hub uses your Soumtok plan pools. Start ($5/mo) unlocks Everyday models — DeepSeek Flash, DeepSeek Pro, and GPT-4.1 Mini.',
        cta: 'Subscribe — $5/mo',
      }
    }
    if (reason === 'pro') {
      return {
        title: 'Upgrade to Pro',
        body: 'This model uses the Additional pool — Opus, GPT-6, Sonnet, Grok, and the rest. Pro ($20/mo) adds a separate $10 Additional budget. Or add your own API keys on Pro and pay your vendor directly.',
        cta: 'Upgrade to Pro — $20/mo',
      }
    }
    if (reason === 'keys') {
      return {
        title: 'Pro plan for your own keys',
        body: 'Bring your own OpenAI, Anthropic, DeepSeek, or xAI keys on Pro ($20/mo) to code at vendor cost without touching Soumtok pools.',
        cta: 'Upgrade to Pro',
      }
    }
    return {
      title: 'Coming soon',
      body: 'This model is not available in Test Hub yet.',
      cta: 'OK',
    }
  }

  function ensureUpgradeModal() {
    if (upgradeModalEl) return upgradeModalEl
    const el = document.createElement('div')
    el.id = 'test-hub-upgrade-modal'
    el.className = 'test-hub-upgrade-modal'
    el.hidden = true
    el.innerHTML = `<div class="test-hub-upgrade-backdrop" data-close="1"></div>
      <div class="test-hub-upgrade-card" role="dialog" aria-modal="true" aria-labelledby="test-hub-upgrade-title">
        <h2 id="test-hub-upgrade-title"></h2>
        <p id="test-hub-upgrade-body"></p>
        <div class="test-hub-upgrade-actions">
          <button type="button" class="test-hub-upgrade-primary" id="test-hub-upgrade-go"></button>
          <button type="button" class="test-hub-upgrade-ghost" data-close="1">Not now</button>
        </div>
      </div>`
    document.body.appendChild(el)
    el.querySelectorAll('[data-close]').forEach((node) => {
      node.addEventListener('click', () => {
        el.hidden = true
      })
    })
    el.querySelector('#test-hub-upgrade-go')?.addEventListener('click', () => {
      el.hidden = true
      const reason = el.dataset.reason || 'subscribe'
      if (reason === 'soon') return
      api().openBilling?.()
    })
    upgradeModalEl = el
    return el
  }

  function showUpgradeModal(reason) {
    const copy = upgradeCopy(reason)
    const el = ensureUpgradeModal()
    el.dataset.reason = reason || 'subscribe'
    const title = el.querySelector('#test-hub-upgrade-title')
    const body = el.querySelector('#test-hub-upgrade-body')
    const go = el.querySelector('#test-hub-upgrade-go')
    if (title) title.textContent = copy.title
    if (body) body.textContent = copy.body
    if (go) {
      go.textContent = copy.cta
      go.hidden = reason === 'soon'
    }
    el.hidden = false
  }

  function accessibleCompareDefaults() {
    const ids = ['deepseek-v4-flash', 'gpt-4.1-mini', 'deepseek-v4-pro']
    const picked = ids.filter((id) => modelAccess({ id }).tier === 'ok')
    return picked.length >= 2 ? picked.slice(0, 2) : picked.length ? [...picked, ...picked] : []
  }

  function sanitizeComparePick() {
    state.comparePick = state.comparePick.filter((id) => modelAccess({ id }).tier === 'ok')
    if (state.comparePick.length < 2) {
      const next = accessibleCompareDefaults()
      state.comparePick = next.length >= 2 ? next : next.length ? next : []
    }
  }

  function comparePoolModels() {
    const byId = new Map(state.models.map((m) => [m.id, m]))
    const out = []
    for (const id of CATALOG.TOP_HUB_MODEL_IDS || []) {
      const hit = byId.get(id)
      if (hit && !isGoogleModel(hit)) out.push(hit)
    }
    for (const m of state.models) {
      if (!out.some((row) => row.id === m.id) && !isGoogleModel(m)) out.push(m)
    }
    return out.slice(0, 16)
  }

  function partitionCompareModels(list) {
    const onPlan = []
    const needUpgrade = []
    for (const m of list) {
      const access = modelAccess(m)
      if (access.tier === 'ok') onPlan.push(m)
      else if (access.reason === 'pro' || access.reason === 'subscribe') needUpgrade.push(m)
    }
    return { onPlan, needUpgrade }
  }

  function renderCompareChip(m, on) {
    const access = modelAccess(m)
    const locked = access.tier === 'locked'
    const badge =
      locked && access.reason === 'pro'
        ? ' <span class="test-hub-compare-chip-badge">Pro</span>'
        : locked && access.reason === 'subscribe'
          ? ' <span class="test-hub-compare-chip-badge">Start</span>'
          : ''
    return `<button type="button" class="test-hub-compare-chip ${on ? 'on' : ''}${locked ? ' locked' : ''}" data-id="${escapeAttr(m.id)}" data-locked="${locked ? access.reason || '1' : ''}">${escapeHtml(m.name)}${badge}</button>`
  }

  function renderCompareGate(run) {
    const msg = String(run.error || '')
    let reason = 'pro'
    if (/Subscribe to Start/i.test(msg)) reason = 'subscribe'
    else if (/requires Pro|own API key/i.test(msg)) reason = 'pro'
    const copy = upgradeCopy(reason)
    return `<div class="test-hub-compare-gate">
      <p class="test-hub-compare-gate-title">${escapeHtml(copy.title)}</p>
      <p class="test-hub-compare-gate-body">${escapeHtml(copy.body)}</p>
      <button type="button" class="test-hub-compare-upgrade" data-reason="${escapeAttr(reason)}">${escapeHtml(copy.cta)}</button>
    </div>`
  }

  function isUpgradeError(msg) {
    return /Subscribe to Start|Everyday models only|requires Pro|own API key/i.test(String(msg || ''))
  }

  function mergeAllModels(apiList) {
    const byId = new Map()
    for (const m of CATALOG.MODELS || []) byId.set(m.id, { ...m, ready: true })
    for (const m of GOOGLE_STUBS) {
      if (!byId.has(m.id)) byId.set(m.id, { ...m, ready: false })
    }
    for (const m of apiList) {
      const base = byId.get(m.id) || {}
      const merged = {
        ...base,
        ...m,
        name: base.name || m.name || m.id,
        provider: m.provider || base.provider,
        tags: [...new Set([...(base.tags || []), ...(m.tags || [])])],
      }
      merged.ready = isGoogleModel(merged) ? false : true
      byId.set(m.id, merged)
    }
    let list = [...byId.values()].filter((m) => m.id !== 'soumtok-agent' && m.id !== 'composer-2-5')
    if (typeof CATALOG.sortForDisplay === 'function') list = CATALOG.sortForDisplay(list)
    return list
  }

  function currentModelName() {
    if (state.model === 'auto') return 'Auto'
    const hit = state.models.find((m) => m.id === state.model)
    return hit?.name || state.model
  }

  let modelPopListeners = null

  function clearModelPopPosition() {
    const pop = $('test-hub-model-pop')
    if (!pop) return
    pop.classList.remove('is-portal', 'is-above')
    pop.style.removeProperty('position')
    pop.style.removeProperty('top')
    pop.style.removeProperty('bottom')
    pop.style.removeProperty('left')
    pop.style.removeProperty('width')
    pop.style.removeProperty('max-height')
    if (modelPopListeners) {
      window.removeEventListener('resize', modelPopListeners.reposition)
      window.removeEventListener('scroll', modelPopListeners.reposition, true)
      modelPopListeners = null
    }
  }

  function positionModelPop() {
    const pop = $('test-hub-model-pop')
    const btn = $('test-hub-model-btn')
    if (!pop || !btn || pop.hidden) return

    const margin = 8
    const rect = btn.getBoundingClientRect()
    const maxH = Math.min(360, Math.max(180, window.innerHeight * 0.42))
    const width = Math.min(Math.max(rect.width, 260), window.innerWidth - margin * 2)
    const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin)
    const spaceBelow = window.innerHeight - rect.bottom - margin
    const spaceAbove = rect.top - margin
    const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow

    pop.classList.add('is-portal')
    pop.classList.toggle('is-above', openAbove)
    pop.style.width = `${width}px`
    pop.style.left = `${left}px`
    pop.style.maxHeight = `${Math.min(maxH, openAbove ? spaceAbove : spaceBelow)}px`

    if (openAbove) {
      pop.style.bottom = `${window.innerHeight - rect.top + margin}px`
      pop.style.top = 'auto'
    } else {
      pop.style.top = `${rect.bottom + margin}px`
      pop.style.bottom = 'auto'
    }
  }

  function closeModelPanel() {
    state.modelPanelOpen = false
    const pop = $('test-hub-model-pop')
    const btn = $('test-hub-model-btn')
    const picker = document.querySelector('.test-hub-model-picker')
    if (pop) pop.hidden = true
    if (btn) btn.setAttribute('aria-expanded', 'false')
    picker?.classList.remove('is-open')
    clearModelPopPosition()
  }

  function openModelPanel() {
    state.modelPanelOpen = true
    state.modelSearch = ''
    const pop = $('test-hub-model-pop')
    const btn = $('test-hub-model-btn')
    const picker = document.querySelector('.test-hub-model-picker')
    const search = $('test-hub-model-search')
    if (pop) pop.hidden = false
    if (btn) btn.setAttribute('aria-expanded', 'true')
    picker?.classList.add('is-open')
    if (search) {
      search.value = ''
      setTimeout(() => search.focus(), 20)
    }
    paintModelList()
    requestAnimationFrame(() => {
      positionModelPop()
      const reposition = () => {
        if (state.modelPanelOpen) positionModelPop()
      }
      modelPopListeners = { reposition }
      window.addEventListener('resize', reposition)
      window.addEventListener('scroll', reposition, true)
    })
  }

  function paintModelTrigger() {
    const current = $('test-hub-model-current')
    const btn = $('test-hub-model-btn')
    const name = currentModelName()
    if (current) current.textContent = name
    if (btn) btn.textContent = `${name} ▾`
  }

  function pickHubModel(id) {
    state.model = id || 'auto'
    closeModelPanel()
    paintModelList()
    paintModelTrigger()
  }

  function hubTierTagClass(cost) {
    const c = String(cost || '').trim()
    if (/Smart pick/i.test(c)) return 'test-hub-model-tier tier-auto'
    if (/Highest|Higher/.test(c)) return 'test-hub-model-tier tier-highest'
    if (/^High/.test(c)) return 'test-hub-model-tier tier-high'
    if (/Mid|Varies/.test(c)) return 'test-hub-model-tier tier-mid'
    if (/Free|Cheap|Cheapest|Low/.test(c)) return 'test-hub-model-tier tier-value'
    return 'test-hub-model-tier tier-neutral'
  }

  function hubModelPriceLine(m) {
    if (!m || m.id === 'auto') return '$2.00 / 1M on-demand after included pool'
    try {
      const pricing = window.SoumtokModelPricing?.resolveModelPricing?.(m)
      if (pricing?.headline) return pricing.headline
    } catch {
      /* ignore */
    }
    return m.cost || ''
  }

  function renderHubModelRow(m) {
    const access = modelAccess(m)
    const disabled = access.tier === 'locked'
    const on = !disabled && state.model === m.id
    const newTag = m.tags?.includes('New') ? '<span class="test-hub-model-chip-tag tag-new">New</span>' : ''
    const lockLabel =
      access.reason === 'pro' ? 'Pro'
      : access.reason === 'subscribe' ? 'Start'
      : access.reason === 'soon' ? 'Soon'
      : ''
    const lock = lockLabel ? `<span class="test-hub-model-chip-lock tag-soon">${lockLabel}</span>` : ''
    const strength = m.strength ? escapeHtml(m.strength) : ''
    const price = escapeHtml(hubModelPriceLine(m))
    const tier = m.cost
      ? `<span class="${hubTierTagClass(m.cost)}">${escapeHtml(m.cost)}</span>`
      : ''
    return `<div class="test-hub-model-row">
      <button type="button" class="test-hub-model-chip ${on ? 'on' : ''} ${disabled ? 'off locked' : ''}" data-id="${escapeAttr(m.id)}" data-locked="${disabled ? access.reason || '1' : ''}" role="option" aria-selected="${on}">
        <span class="test-hub-model-chip-main">
          <span class="test-hub-model-chip-head">
            <span class="test-hub-model-chip-name">${escapeHtml(m.name)}</span>
            <span class="test-hub-model-chip-tags">${newTag}${tier}${lock}</span>
          </span>
          ${strength ? `<span class="test-hub-model-chip-meta">${strength}</span>` : ''}
          <span class="test-hub-model-chip-price">${price}${/\bin ·\b/.test(price) ? ' <span class="test-hub-model-chip-price-unit">/ 1M tokens</span>' : ''}</span>
        </span>
      </button>
      <button type="button" class="test-hub-model-info" data-id="${escapeAttr(m.id)}" title="Open full model study" aria-label="Model study for ${escapeAttr(m.name)}">Study</button>
    </div>`
  }

  function modelsForPicker() {
    const q = state.modelSearch.trim().toLowerCase()
    if (!q) return state.models
    return state.models.filter((m) => {
      const hay = `${m.name} ${m.id} ${m.provider || ''} ${m.strength || ''} ${m.cost || ''} ${(m.tags || []).join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }

  function paintModelList() {
    const host = $('test-hub-model-list')
    paintModelTrigger()
    if (!host) return

    const q = state.modelSearch.trim().toLowerCase()
    const autoAccess = modelAccess({ id: 'auto' })
    const autoLocked = autoAccess.tier === 'locked'
    const autoOn = state.model === 'auto'
    const showAuto = !q || 'auto'.includes(q) || 'pick'.includes(q)
    let html = showAuto
      ? `<div class="test-hub-model-row test-hub-model-row-auto">
        <button type="button" class="test-hub-model-chip ${autoOn ? 'on' : ''}${autoLocked ? ' locked off' : ''}" data-id="auto" data-locked="${autoLocked ? autoAccess.reason || '1' : ''}" role="option" aria-selected="${autoOn}">
          <span class="test-hub-model-chip-main">
            <span class="test-hub-model-chip-head">
              <span class="test-hub-model-chip-name">Auto</span>
              <span class="${hubTierTagClass('Smart pick')}">Smart pick</span>
            </span>
            <span class="test-hub-model-chip-meta">Routes to the best ready model for your prompt.</span>
            <span class="test-hub-model-chip-price">Included pool first · $2.00 <span class="test-hub-model-chip-price-unit">/ 1M on-demand</span></span>
          </span>
        </button>
      </div>`
      : ''

    if (q) {
      const flat = modelsForPicker()
      for (const m of flat) html += renderHubModelRow(m)
      if (!showAuto && !flat.length) {
        html = `<p class="test-hub-model-empty">No models match “${escapeHtml(state.modelSearch.trim())}”.</p>`
      }
    } else {
      const grouped =
        typeof CATALOG.partitionHubPickerModels === 'function'
          ? CATALOG.partitionHubPickerModels(state.models.filter((m) => !isGoogleModel(m)))
          : { top: state.models.slice(0, 10), rest: state.models.slice(10) }
      const flat = [...grouped.top, ...grouped.rest]
      const { onPlan, needUpgrade } = partitionCompareModels(flat)
      if (onPlan.length) {
        html += `<p class="test-hub-model-section">On your plan · ${escapeHtml(planLabelShort())}</p>`
        for (const m of onPlan) html += renderHubModelRow(m)
      }
      if (needUpgrade.length) {
        html += `<p class="test-hub-model-section">${isUnpaidPlan(state.plan) ? 'Subscribe to unlock' : 'Upgrade to Pro'}</p>`
        for (const m of needUpgrade.slice(0, 12)) html += renderHubModelRow(m)
      }
    }

    host.innerHTML = html
    host.querySelectorAll('.test-hub-model-chip').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation()
        if (btn.dataset.locked) {
          showUpgradeModal(btn.dataset.locked)
          return
        }
        pickHubModel(btn.dataset.id)
      }
    })
    host.querySelectorAll('.test-hub-model-info').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation()
        closeModelPanel()
        window.SoumtokModelBriefSheet?.open?.(btn.dataset.id)
      }
    })
  }

  function extractBuildArtifacts(text) {
    return ART().extractBuildArtifacts?.(text) || {}
  }

  function buildPreviewHtml(files) {
    return ART().buildPreviewHtml?.(files) || ''
  }

  function wrapPreviewHtml(files) {
    const html = buildPreviewHtml(files)
    if (!html) return ''
    return ART().injectPreviewErrorBridge?.(html) || html
  }

  function bindPreviewConsole() {
    if (previewMessageBound) return
    previewMessageBound = true
    window.addEventListener('message', (e) => {
      if (!e.data || e.data.type !== 'soumtok-preview-log') return
      const frame = $('test-hub-preview')
      if (!frame?.contentWindow || e.source !== frame.contentWindow) return
      state.previewLogs.push({
        level: e.data.level || 'error',
        message: String(e.data.message || ''),
        source: e.data.source || '',
        line: e.data.line || 0,
      })
      if (state.previewLogs.length > 48) state.previewLogs.shift()
      paintPreviewConsole()
    })
  }

  function paintPreviewConsole() {
    const panel = $('test-hub-preview-console')
    const log = $('test-hub-preview-console-log')
    if (!panel || !log) return
    panel.hidden = !state.previewLogs.length
    log.textContent = state.previewLogs
      .map((row) => {
        const where = row.source ? ` (${row.source}${row.line ? `:${row.line}` : ''})` : ''
        return `[${row.level}] ${row.message}${where}`
      })
      .join('\n')
  }

  function clearPreviewConsole() {
    state.previewLogs = []
    paintPreviewConsole()
  }

  function modelNameById(id) {
    return state.models.find((m) => m.id === id)?.name || id
  }

  function scoreRun(run) {
    return ART().scoreCompareRun?.(run) ?? 0
  }

  function isViteProject(files) {
    return ART().looksLikeViteProject?.(files) ?? false
  }

  function lastUserPrompt() {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      if (state.messages[i]?.role === 'user') return String(state.messages[i].content || '')
    }
    return ''
  }

  async function saveBenchmarkRuns(runs, opts = {}) {
    if (!runs?.length) return null
    const payload = {
      prompt: lastUserPrompt(),
      compareMode: Boolean(opts.compareMode),
      viteEnabled: Boolean(opts.viteEnabled),
      runs: runs.map((run) => ({
        model: run.model,
        modelName: run.modelName,
        text: run.text,
        ms: run.ms,
        status: run.status,
        error: run.error,
        previewErrors: run.previewErrors || 0,
        viteBuildOk: run.viteBuildOk ?? null,
      })),
    }
    try {
      const res = await api().testHubSaveBenchmark?.(payload)
      if (res?.id) {
        state.lastBenchmarkId = res.id
        const winner = res.winnerModel ? modelNameById(res.winnerModel) : ''
        if (winner && res.winnerScore != null) {
          flashSaveHint(`Benchmark saved · ${winner} ${Math.round(res.winnerScore)}/100`)
        } else if (res.ok) {
          flashSaveHint('Benchmark saved')
        }
      } else if (res?.error) {
        flashSaveHint(res.error)
      }
      return res
    } catch {
      return null
    }
  }

  async function maybeViteCheckRun(run) {
    const files = extractBuildArtifacts(run.text || '')
    if (!isViteProject(files)) return run
    try {
      const res = await api().testHubRunViteSandbox?.({ files })
      run.viteBuildOk = Boolean(res?.ok)
      if (res?.previewHtml) run.vitePreviewHtml = res.previewHtml
      if (res?.log) run.viteLog = res.log
      if (!res?.ok && res?.error) run.viteError = res.error
    } catch {
      run.viteBuildOk = false
    }
    return run
  }

  async function runViteSandbox() {
    if (state.sandboxBusy) return
    const files = filesForExport()
    if (!Object.keys(files).length) {
      flashSaveHint('No files to run')
      return
    }
    if (!isViteProject(files)) {
      flashSaveHint('Add a Vite package.json to run npm build')
      return
    }
    state.sandboxBusy = true
    state.sandboxOpen = true
    state.sandboxLog = 'Starting npm install + build…'
    paintSandboxLog()
    paint()
    try {
      const res = await api().testHubRunViteSandbox?.({ files })
      state.sandboxLog = res?.log || res?.error || 'Done'
      if (res?.ok && res.previewHtml) {
        lastPreviewSrc = ''
        state.files['dist/index.html'] = res.previewHtml
        if (!state.activeFile) state.activeFile = 'dist/index.html'
        state.outputTab = 'preview'
        rebuildWorkspace()
        flashSaveHint('Vite build OK — preview updated')
      } else if (res?.error) {
        flashSaveHint(res.error)
      }
    } finally {
      state.sandboxBusy = false
      paintSandboxLog()
      paint()
    }
  }

  function paintSandboxLog() {
    const panel = $('test-hub-sandbox-log')
    const body = $('test-hub-sandbox-log-body')
    const title = $('test-hub-sandbox-log-title')
    if (!panel || !body) return
    panel.hidden = !state.sandboxOpen
    if (title) title.textContent = state.sandboxBusy ? 'Vite sandbox · running…' : 'Vite sandbox'
    body.textContent = state.sandboxLog || ''
  }

  let shareApiOrigin = ''

  function normalizeShareSlug(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  function suggestShareSlug(title) {
    const slug = normalizeShareSlug(title)
    if (slug.length >= 3) return slug.slice(0, 40)
    return `demo-${Date.now().toString(36).slice(-6)}`
  }

  function shareSlugError(value) {
    const slug = normalizeShareSlug(value)
    if (!slug) return 'Choose a slug for the link'
    if (slug.length < 3) return 'Slug must be at least 3 characters'
    if (slug.length > 40) return 'Slug must be 40 characters or fewer'
    if (!/^[a-z0-9]/.test(slug)) return 'Slug must start with a letter or number'
    if (!/^[a-z0-9-]+$/.test(slug)) return 'Use only lowercase letters, numbers, and hyphens'
    return null
  }

  function setShareDialogError(message) {
    const err = $('test-hub-share-error')
    if (!err) return
    if (message) {
      err.hidden = false
      err.textContent = message
    } else {
      err.hidden = true
      err.textContent = ''
    }
  }

  function paintShareUrlPreview() {
    const preview = $('test-hub-share-url-preview')
    const slugInput = $('test-hub-share-slug')
    if (!preview || !slugInput) return
    const slug = normalizeShareSlug(slugInput.value) || 'your-slug'
    const origin = shareApiOrigin || window.location.origin || 'https://soumtok.com'
    preview.textContent = `${origin.replace(/\/$/, '')}/t/${slug}/`
  }

  async function ensureShareApiOrigin() {
    if (shareApiOrigin) return shareApiOrigin
    try {
      const info = await api().appInfo?.()
      shareApiOrigin = String(info?.api || '').replace(/\/$/, '')
    } catch {
      shareApiOrigin = ''
    }
    return shareApiOrigin
  }

  let lastPublishedShareUrl = ''

  function showShareDialogForm() {
    $('test-hub-share-form')?.removeAttribute('hidden')
    $('test-hub-share-success')?.setAttribute('hidden', '')
  }

  function formatShareDuration(minutes) {
    const m = Math.max(30, Math.min(43200, Math.round(Number(minutes) || 30)))
    if (m < 60) return `${m} minutes`
    if (m < 1440) {
      const h = Math.round(m / 60)
      return `${h} hour${h === 1 ? '' : 's'}`
    }
    const d = Math.round(m / 1440)
    return `${d} day${d === 1 ? '' : 's'}`
  }

  async function copyTextToClipboard(text) {
    const s = String(text || '').trim()
    if (!s) return false
    if (api().clipboardWriteText) {
      try {
        await api().clipboardWriteText(s)
        return true
      } catch {
        /* fall through */
      }
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(s)
        return true
      } catch {
        /* fall through */
      }
    }
    try {
      const ta = document.createElement('textarea')
      ta.value = s
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }

  function flashCopyButton(btn, restoreLabel = 'Copy link') {
    if (!btn) return
    btn.textContent = 'Copied'
    window.clearTimeout(flashCopyButton._timer)
    flashCopyButton._timer = window.setTimeout(() => {
      if (btn.textContent === 'Copied') btn.textContent = restoreLabel
    }, 2000)
  }

  function ttlMinutesFromDeploy(row) {
    if (!row?.expires_at) return 30
    const expires = new Date(row.expires_at).getTime()
    const created = row.created_at ? new Date(row.created_at).getTime() : Date.now()
    return Math.max(30, Math.min(43200, Math.round((expires - created) / 60_000)))
  }

  function deployMatchesProject(row, projectId, projectLabel) {
    if (!row || row.expired) return false
    if (projectId && row.project_id === projectId) return true
    const label = String(projectLabel || '').trim().toLowerCase()
    if (!label) return false
    const rowLabel = String(row.project_title || row.title || '').trim().toLowerCase()
    return rowLabel === label
  }

  function deployIsLive(row) {
    if (!row?.url) return false
    if (row.expired) return false
    if (!row.expires_at) return true
    return new Date(row.expires_at).getTime() > Date.now()
  }

  function readLiveLinkStore() {
    try {
      return JSON.parse(localStorage.getItem(LIVE_LINKS_KEY) || '{}')
    } catch {
      return {}
    }
  }

  function writeLiveLinkStore(store) {
    try {
      localStorage.setItem(LIVE_LINKS_KEY, JSON.stringify(store))
    } catch {
      /* ignore */
    }
  }

  function cacheLiveDeploy(projectId, deploy) {
    if (!projectId || !deploy?.url) return
    const store = readLiveLinkStore()
    store[projectId] = deploy
    if (deploy.slug) store[`slug:${deploy.slug}`] = deploy
    writeLiveLinkStore(store)
  }

  function removeCachedLiveDeploy(projectId, deployId) {
    const store = readLiveLinkStore()
    if (projectId && store[projectId]?.id === deployId) delete store[projectId]
    for (const [key, row] of Object.entries(store)) {
      if (row?.id === deployId) delete store[key]
    }
    writeLiveLinkStore(store)
  }

  function pickCachedLiveDeploy(projectId, projectLabel) {
    const store = readLiveLinkStore()
    if (deployIsLive(store[projectId])) return store[projectId]
    const label = String(projectLabel || '').trim().toLowerCase()
    for (const row of Object.values(store)) {
      if (!deployIsLive(row)) continue
      if (deployMatchesProject(row, projectId, label)) return row
    }
    const guessSlug = suggestShareSlug(projectLabel)
    if (guessSlug && deployIsLive(store[`slug:${guessSlug}`])) return store[`slug:${guessSlug}`]
    const rows = Object.values(store)
      .filter((row) => deployIsLive(row))
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    return rows[0] || null
  }

  function syncCachedLiveDeploy() {
    if (state.activeLiveDeploy?.url && deployIsLive(state.activeLiveDeploy)) return state.activeLiveDeploy
    const ws = ensureActiveWorkspace()
    const projectId = state.activeId || ws.id
    const cached = pickCachedLiveDeploy(projectId, ws.title || projectTitle())
    if (cached) state.activeLiveDeploy = cached
    return state.activeLiveDeploy
  }

  async function refreshActiveLiveDeploy() {
    if (!api().testHubListDeploys) {
      state.activeLiveDeploy = null
      paintRunViteButton()
      return null
    }
    try {
      const ws = ensureActiveWorkspace()
      const projectId = state.activeId || ws.id
      const projectLabel = ws.title || projectTitle() || ''
      let rows = (await api().testHubListDeploys({ limit: 10, projectId }))?.rows || []
      let live = rows.find((row) => !row.expired) || null
      if (!live) {
        const allRows = (await api().testHubListDeploys({ limit: 30 }))?.rows || []
        live =
          allRows.find((row) => deployMatchesProject(row, projectId, projectLabel)) ||
          allRows.find((row) => !row.expired) ||
          null
      }
      if (live) cacheLiveDeploy(projectId, live)
      state.activeLiveDeploy = live || pickCachedLiveDeploy(projectId, projectLabel)
    } catch {
      state.activeLiveDeploy = pickCachedLiveDeploy(
        state.activeId || ensureActiveWorkspace().id,
        ensureActiveWorkspace().title || projectTitle(),
      )
    }
    paintRunViteButton()
    return state.activeLiveDeploy
  }

  function showShareDialogSuccess(url, ttlMinutes, opts = {}) {
    const existing = Boolean(opts.existing)
    lastPublishedShareUrl = url || ''
    $('test-hub-share-form')?.setAttribute('hidden', '')
    $('test-hub-share-success')?.removeAttribute('hidden')
    const titleEl = $('test-hub-share-success-title')
    const lead = $('test-hub-share-success-lead')
    const urlEl = $('test-hub-share-success-url')
    const copyBtn = $('test-hub-share-copy-again')
    const newBtn = $('test-hub-share-new-link')
    if (titleEl) titleEl.textContent = existing ? 'Link is live' : 'Published successfully'
    if (lead) {
      if (existing && state.activeLiveDeploy?.expires_at) {
        lead.textContent = `Your link is still live — expires ${new Date(state.activeLiveDeploy.expires_at).toLocaleString()}.`
      } else {
        lead.textContent = `Your link is live for ${formatShareDuration(ttlMinutes)} — copied to clipboard.`
      }
    }
    if (urlEl) urlEl.textContent = url || ''
    if (copyBtn) copyBtn.textContent = 'Copy link'
    if (newBtn) {
      if (existing) newBtn.removeAttribute('hidden')
      else newBtn.setAttribute('hidden', '')
    }
  }

  function closeShareDialog() {
    const dialog = $('test-hub-share-dialog')
    if (dialog) dialog.hidden = true
    showShareDialogForm()
    setShareDialogError('')
    state.shareBusy = false
    lastPublishedShareUrl = ''
    paintRunViteButton()
  }

  async function openSharePublishForm() {
    const files = filesForExport()
    if (!Object.keys(files).length || !buildPreviewHtml(files)) {
      flashSaveHint('Nothing to share — build something first')
      return
    }
    if (state.shareBusy) return
    const dialog = $('test-hub-share-dialog')
    const titleInput = $('test-hub-share-name')
    const slugInput = $('test-hub-share-slug')
    if (!dialog || !titleInput || !slugInput) {
      flashSaveHint('Share dialog unavailable — restart Soumtok Desktop')
      return
    }
    if (!api().testHubPublish) {
      flashSaveHint('Restart Soumtok Desktop to enable Share link')
      return
    }
    await ensureShareApiOrigin()
    const title = projectTitle().slice(0, 120) || 'Test Hub preview'
    titleInput.value = title
    slugInput.value = suggestShareSlug(title)
    delete slugInput.dataset.touched
    setShareDialogError('')
    showShareDialogForm()
    paintShareUrlPreview()
    dialog.hidden = false
    slugInput.focus()
    slugInput.select()
  }

  async function handleShareLinkClick(forceNew = false) {
    const files = filesForExport()
    if (!Object.keys(files).length || !buildPreviewHtml(files)) {
      flashSaveHint('Nothing to share — build something first')
      return
    }
    if (state.shareBusy) return
    if (!api().testHubPublish) {
      flashSaveHint('Restart Soumtok Desktop to enable Share link')
      return
    }
    await refreshActiveLiveDeploy()
    const live = state.activeLiveDeploy
    if (!forceNew && live?.url) {
      const dialog = $('test-hub-share-dialog')
      if (!dialog) {
        flashSaveHint('Share dialog unavailable — restart Soumtok Desktop')
        return
      }
      await ensureShareApiOrigin()
      showShareDialogSuccess(live.url, ttlMinutesFromDeploy(live), { existing: true })
      dialog.hidden = false
      return
    }
    await openSharePublishForm()
  }

  async function confirmSharePublish() {
    if (state.shareBusy) return
    const files = filesForExport()
    const titleInput = $('test-hub-share-name')
    const slugInput = $('test-hub-share-slug')
    const confirmBtn = $('test-hub-share-confirm')
    const title = String(titleInput?.value || projectTitle() || 'Test Hub preview').trim().slice(0, 120)
    const slugErr = shareSlugError(slugInput?.value || '')
    if (slugErr) {
      setShareDialogError(slugErr)
      slugInput?.focus()
      return
    }
    const slug = normalizeShareSlug(slugInput?.value || '')
    const ttlMinutes = Math.max(30, Math.min(43200, Number($('test-hub-share-ttl')?.value) || 30))
    if (!api().testHubPublish) {
      setShareDialogError('Restart Soumtok Desktop to enable Share link')
      return
    }
    state.shareBusy = true
    setShareDialogError('')
    if (confirmBtn) {
      confirmBtn.disabled = true
      confirmBtn.textContent = 'Publishing…'
    }
    paintRunViteButton()
    try {
      const ws = ensureActiveWorkspace()
      const res = await api().testHubPublish({
        files,
        title,
        slug,
        projectId: state.activeId || ws.id,
        projectTitle: ws.title || projectTitle(),
        ttlMinutes,
      })
      if (res?.url) {
        await copyTextToClipboard(res.url)
        state.activeLiveDeploy = {
          id: res.id,
          url: res.url,
          slug: res.slug,
          expires_at: res.expiresAt,
          created_at: new Date().toISOString(),
          expired: false,
          live: true,
          project_id: state.activeId || ws.id,
          project_title: ws.title || projectTitle(),
          title,
        }
        cacheLiveDeploy(state.activeId || ws.id, state.activeLiveDeploy)
        showShareDialogSuccess(res.url, res.ttlMinutes)
        flashSaveHint('Published · link copied')
        state.linksOpen = true
        state.scoresOpen = false
        state.archivesOpen = false
        void paintDeployLinks()
        paintRunViteButton()
        void paintBenchmarkScores()
        void paintArchivesList()
      } else {
        setShareDialogError(
          res?.error ||
            'Could not publish — start the API (npm run dev) and sign in, then try again.',
        )
      }
    } catch {
      setShareDialogError('Could not reach Soumtok — start npm run dev and sign in')
    } finally {
      state.shareBusy = false
      if (confirmBtn) {
        confirmBtn.disabled = false
        confirmBtn.textContent = 'Publish'
      }
      paintRunViteButton()
    }
  }

  function paintRunViteButton() {
    syncCachedLiveDeploy()
    const files = state.files || {}
    const vite = isViteProject(files)
    const busy = state.sandboxBusy || state.busy || state.shareBusy
    const label = state.sandboxBusy ? 'Building…' : 'Run Vite'
    const canShare = Boolean(Object.keys(files).length && buildPreviewHtml(files))
    const hasLiveLink = deployIsLive(state.activeLiveDeploy)
    const shareLabel = state.shareBusy ? 'Publishing…' : hasLiveLink ? 'Manage' : 'Share link'
    for (const id of ['test-hub-run-vite', 'test-hub-preview-run-vite']) {
      const btn = $(id)
      if (!btn) continue
      btn.hidden = !vite
      btn.disabled = busy
      btn.textContent = label
    }
    for (const id of ['test-hub-share-link', 'test-hub-preview-share']) {
      const btn = $(id)
      if (!btn) continue
      btn.hidden = !canShare
      btn.disabled = busy
      btn.textContent = shareLabel
      if (hasLiveLink && state.activeLiveDeploy?.url) {
        btn.title = state.activeLiveDeploy.url
        btn.classList.add('is-live')
      } else {
        btn.title = 'Publish a live share link'
        btn.classList.remove('is-live')
      }
    }
    const type = $('test-hub-project-type')
    if (type) {
      if (!Object.keys(files).length) {
        type.hidden = true
        type.textContent = ''
      } else {
        type.hidden = false
        type.textContent = vite ? 'Vite · npm' : 'Static · iframe'
        type.classList.toggle('is-vite', vite)
      }
    }
    const meta = $('test-hub-preview-meta')
    const mode = $('test-hub-preview-mode')
    const liveLinkWrap = $('test-hub-preview-live-link')
    const liveUrlEl = $('test-hub-preview-live-url')
    const liveCopyBtn = $('test-hub-preview-live-copy')
    if (meta && mode) {
      const hasPreview = Boolean(buildPreviewHtml(files))
      meta.hidden = !hasPreview && !vite
      if (vite) {
        mode.textContent = hasLiveLink
          ? 'Vite project · share link is live'
          : 'Vite project — run npm build to verify'
      } else {
        mode.textContent = hasLiveLink
          ? 'Static preview · share link is live'
          : 'Static preview — HTML/CSS/JS inlined'
      }
      const liveUrl = hasLiveLink ? String(state.activeLiveDeploy?.url || '').trim() : ''
      meta.classList.toggle('is-live-bar', Boolean(liveUrl))
      if (liveLinkWrap && liveUrlEl) {
        if (liveUrl) {
          liveLinkWrap.removeAttribute('hidden')
          liveUrlEl.textContent = liveUrl
          liveUrlEl.href = liveUrl
          liveUrlEl.title = liveUrl
        } else {
          liveLinkWrap.setAttribute('hidden', '')
          liveUrlEl.textContent = ''
          liveUrlEl.removeAttribute('href')
        }
      }
      if (liveCopyBtn && liveCopyBtn.textContent === 'Copied' && !liveUrl) {
        liveCopyBtn.textContent = 'Copy'
      }
    }
  }

  function deployStatusLabel(row) {
    if (row?.expired) return 'Expired'
    if (row?.live) return 'Live'
    return 'Saved'
  }

  async function paintDeployLinks() {
    const list = $('test-hub-links-list')
    const panel = $('test-hub-links')
    const head = $('test-hub-links-head')
    if (!list || !panel) return
    panel.hidden = !state.linksOpen
    if (!state.linksOpen) return
    const ws = ensureActiveWorkspace()
    const projectId = state.activeId || ws.id
    const projectLabel = ws.title || projectTitle() || 'this project'
    if (head) head.textContent = `Share links · ${projectLabel}`
    list.innerHTML = '<p class="test-hub-archives-empty">Loading share links…</p>'
    let rows = []
    try {
      rows = (await api().testHubListDeploys?.({ limit: 30, projectId }))?.rows || []
    } catch {
      rows = []
    }
    state.activeLiveDeploy = rows.find((row) => !row.expired) || null
    paintRunViteButton()
    if (!rows.length) {
      list.innerHTML =
        '<p class="test-hub-archives-empty">No links for this project yet. Publish from Share link — they stay with this project after refresh.</p>'
      return
    }
    list.innerHTML = rows
      .map((row) => {
        const status = deployStatusLabel(row)
        const statusClass =
          status === 'Live' ? 'is-live' : status === 'Expired' ? 'is-expired' : 'is-saved'
        return `<div class="test-hub-link-item" data-id="${escapeAttr(row.id)}">
          <div class="test-hub-link-copy">
            <span class="test-hub-archive-title">${escapeHtml(row.title || row.slug || 'Preview')}</span>
            <span class="test-hub-link-status ${statusClass}">${status}</span>
            <span class="test-hub-link-url">${escapeHtml(row.url || '')}</span>
            <span class="test-hub-archive-meta">${row.file_count || 0} files · ${new Date(row.created_at).toLocaleString()}${row.expired ? '' : ` · expires ${new Date(row.expires_at).toLocaleString()}`}</span>
          </div>
          <div class="test-hub-link-actions">
            <button type="button" class="test-hub-link-btn" data-copy="${escapeAttr(row.url || '')}">Copy</button>
            <button type="button" class="test-hub-link-btn danger" data-delete="${escapeAttr(row.id)}">Delete</button>
          </div>
        </div>`
      })
      .join('')
    list.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const url = btn.getAttribute('data-copy') || ''
        if (!url) return
        const prev = btn.textContent || 'Copy'
        if (await copyTextToClipboard(url)) {
          flashCopyButton(btn, prev)
          flashSaveHint('Copied')
        } else {
          flashSaveHint(url)
        }
      })
    })
    list.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-delete')
        if (!id || !window.confirm('Delete this share link from your history?')) return
        btn.disabled = true
        const res = await api().testHubDeleteDeploy?.({ id })
        if (res?.error) {
          flashSaveHint(res.error)
          btn.disabled = false
          return
        }
        flashSaveHint('Link deleted')
        if (state.activeLiveDeploy?.id === id) state.activeLiveDeploy = null
        removeCachedLiveDeploy(state.activeId || ensureActiveWorkspace().id, id)
        void paintDeployLinks()
        paintRunViteButton()
      })
    })
  }

  async function paintBenchmarkScores() {
    const panel = $('test-hub-scores')
    const list = $('test-hub-scores-list')
    if (!panel || !list) return
    panel.hidden = !state.scoresOpen
    if (!state.scoresOpen) return
    list.innerHTML = '<p class="test-hub-scores-loading">Loading scores…</p>'
    let rows = []
    try {
      rows = (await api().testHubBenchmarkSummary?.())?.rows || []
    } catch {
      rows = []
    }
    if (!rows.length) {
      list.innerHTML =
        '<p class="test-hub-scores-empty">No benchmark runs yet. Send a build or run Compare — scores save when you are signed in.</p>'
      return
    }
    list.innerHTML = `<table class="test-hub-scores-table">
      <thead><tr><th>Model</th><th>Avg score</th><th>Runs</th><th>Avg time</th><th>Avg files</th></tr></thead>
      <tbody>${rows
        .map(
          (row) => `<tr>
            <td>${escapeHtml(row.model_name || row.model || '—')}</td>
            <td><strong>${row.avg_score ?? '—'}</strong></td>
            <td>${row.runs ?? 0}</td>
            <td>${row.avg_ms ? `${(Number(row.avg_ms) / 1000).toFixed(1)}s` : '—'}</td>
            <td>${row.avg_files ?? '—'}</td>
          </tr>`,
        )
        .join('')}</tbody>
    </table>`
  }

  function toggleCompareMode() {
    state.compareMode = !state.compareMode
    if (state.compareMode && state.comparePick.length < 2) {
      sanitizeComparePick()
    }
    const tab = $('test-hub-compare-tab')
    if (tab) tab.hidden = !state.compareMode && !state.compareRuns.length
    paintCompareBar()
    paint()
  }

  function toggleComparePick(id) {
    if (!id) return
    const m = state.models.find((row) => row.id === id)
    if (!m) return
    const access = modelAccess(m)
    if (access.tier === 'locked') {
      showUpgradeModal(access.reason)
      return
    }
    const pick = [...state.comparePick]
    const idx = pick.indexOf(id)
    if (idx >= 0) {
      if (pick.length <= 2) return
      pick.splice(idx, 1)
    } else if (pick.length >= 3) {
      return
    } else {
      pick.push(id)
    }
    state.comparePick = pick
    paintCompareBar()
  }

  function paintCompareBar() {
    const bar = $('test-hub-compare-bar')
    const single = $('test-hub-single-model-bar')
    const host = $('test-hub-compare-models')
    const toggle = $('test-hub-compare-toggle')
    if (bar) bar.hidden = !state.compareMode
    if (single) single.hidden = state.compareMode
    if (toggle) {
      toggle.classList.toggle('on', state.compareMode)
      toggle.setAttribute('aria-pressed', state.compareMode ? 'true' : 'false')
    }
    if (!host || !state.compareMode) return
    const { onPlan, needUpgrade } = partitionCompareModels(comparePoolModels())
    let html = ''
    if (onPlan.length) {
      html += `<div class="test-hub-compare-section">
        <p class="test-hub-compare-section-label">On your plan · ${escapeHtml(planLabelShort())}</p>
        <div class="test-hub-compare-models-row">${onPlan.map((m) => renderCompareChip(m, state.comparePick.includes(m.id))).join('')}</div>
      </div>`
    } else if (isUnpaidPlan(state.plan)) {
      html += `<div class="test-hub-compare-section">
        <p class="test-hub-compare-section-label">No models on your plan yet</p>
        <button type="button" class="test-hub-compare-inline-upgrade" data-reason="subscribe">Subscribe to Start — $5/mo</button>
      </div>`
    }
    if (needUpgrade.length) {
      html += `<div class="test-hub-compare-section locked">
        <p class="test-hub-compare-section-label">${isUnpaidPlan(state.plan) ? 'After you subscribe' : 'Upgrade to Pro'}</p>
        <div class="test-hub-compare-models-row">${needUpgrade.slice(0, 8).map((m) => renderCompareChip(m, false)).join('')}</div>
      </div>`
    }
    host.innerHTML = html
    host.querySelectorAll('.test-hub-compare-chip').forEach((btn) => {
      btn.onclick = () => toggleComparePick(btn.dataset.id)
    })
    host.querySelectorAll('.test-hub-compare-inline-upgrade, .test-hub-compare-upgrade').forEach((btn) => {
      btn.onclick = () => showUpgradeModal(btn.dataset.reason || 'subscribe')
    })
  }

  function paintCompareGrid() {
    const empty = $('test-hub-compare-empty')
    const grid = $('test-hub-compare-grid')
    if (!grid) return
    const runs = state.compareRuns || []
    if (!runs.length) {
      if (empty) empty.hidden = false
      grid.hidden = true
      grid.innerHTML = ''
      return
    }
    if (empty) empty.hidden = true
    grid.hidden = false
    grid.innerHTML = runs
      .map((run, idx) => {
        const files = extractBuildArtifacts(run.text || '')
        const preview = wrapPreviewHtml(files)
        const ms = run.ms ? `${(run.ms / 1000).toFixed(1)}s` : run.status === 'running' ? '…' : '—'
        const autoScore = run.status === 'done' ? scoreRun(run) : null
        const status =
          run.status === 'error'
            ? isUpgradeError(run.error)
              ? 'Plan limit'
              : 'Error'
            : run.status === 'running'
              ? 'Building…'
              : `${Object.keys(files).length} file${Object.keys(files).length === 1 ? '' : 's'}${autoScore != null ? ` · ${autoScore}/100` : ''}${run.viteBuildOk === true ? ' · vite ✓' : run.viteBuildOk === false ? ' · vite ✗' : ''}`
        const previewBlock =
          run.status === 'error' && isUpgradeError(run.error)
            ? renderCompareGate(run)
            : preview
              ? `<iframe class="test-hub-compare-frame" title="Preview ${escapeAttr(run.modelName)}" sandbox="allow-scripts allow-same-origin" srcdoc="${escapeAttr(preview)}"></iframe>`
              : run.status === 'error'
                ? `<div class="test-hub-compare-gate error"><p>${escapeHtml(run.error || 'Error')}</p></div>`
                : `<div class="test-hub-compare-no-preview">No preview yet</div>`
        const useBtn =
          run.status === 'done' && run.text
            ? `<button type="button" class="test-hub-compare-use" data-idx="${idx}">Use this build</button>`
            : ''
        return `<article class="test-hub-compare-col ${run.status === 'running' ? 'is-live' : ''}">
          <header class="test-hub-compare-col-head">
            <span class="test-hub-compare-col-name">${escapeHtml(run.modelName)}</span>
            <span class="test-hub-compare-col-meta">${ms} · ${status}</span>
          </header>
          ${previewBlock}
          ${useBtn}
        </article>`
      })
      .join('')
    grid.querySelectorAll('.test-hub-compare-use').forEach((btn) => {
      btn.onclick = () => applyCompareWinner(Number(btn.dataset.idx))
    })
    grid.querySelectorAll('.test-hub-compare-upgrade').forEach((btn) => {
      btn.onclick = () => showUpgradeModal(btn.dataset.reason || 'pro')
    })
  }

  function applyCompareWinner(idx) {
    const run = state.compareRuns[idx]
    if (!run?.text) return
    state.model = run.model
    state.messages.push({ role: 'assistant', content: run.text })
    state.compareRuns = []
    state.compareActive = false
    rebuildWorkspace()
    state.outputTab = 'preview'
    paintCompareGrid()
    paintFeed()
    paint()
    schedulePersist()
    flashSaveHint(`Using ${run.modelName}`)
  }

  function highlightCode(body, lang) {
    return ART().highlightCode?.(body, lang) || escapeHtml(body)
  }

  function formatProseHtml(text) {
    if (ART().formatProseHtml) return ART().formatProseHtml(text)
    return escapeHtml(text)
  }

  function parseSegments(text) {
    return ART().parseSegments?.(text) || [{ kind: 'text', content: text }]
  }

  function projectTitle() {
    return projectTitleFromMessages(state.messages) || ensureActiveWorkspace().title || 'New project'
  }

  function sortFilePaths(paths) {
    const rank = (p) => {
      if (p === 'index.html') return 0
      if (/\.html?$/i.test(p)) return 1
      if (/\.css$/i.test(p)) return 2
      if (/\.(js|jsx|ts|tsx)$/i.test(p)) return 3
      return 4
    }
    return [...paths].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  }

  function fileIcon(path) {
    const name = String(path || '').split(/[/\\]/).pop() || path
    const icons = window.SoumtokFileIcons
    if (icons?.fileIconFile && icons?.iconUrl) {
      const src = icons.iconUrl(icons.fileIconFile(name))
      return `<img class="test-hub-file-icon-img" src="${escapeAttr(src)}" alt="" width="16" height="16" draggable="false" />`
    }
    const ext = name.split('.').pop()?.toLowerCase() || ''
    if (ext === 'html' || ext === 'htm') return '<span class="test-hub-file-badge" style="--tone:#e44d26">HTML</span>'
    if (ext === 'css') return '<span class="test-hub-file-badge" style="--tone:#264de4">CSS</span>'
    if (ext === 'js' || ext === 'jsx' || ext === 'mjs') return '<span class="test-hub-file-badge" style="--tone:#f7df1e">JS</span>'
    if (ext === 'ts' || ext === 'tsx') return '<span class="test-hub-file-badge" style="--tone:#3178c6">TS</span>'
    return '<span class="test-hub-file-badge" style="--tone:#8b8b8b">FILE</span>'
  }

  function schedulePersist() {
    clearTimeout(persistTimer)
    persistTimer = setTimeout(() => void persistSession(), 350)
  }

  async function persistSession() {
    snapshotActive()
    const active = ensureActiveWorkspace()
    const payload = {
      version: 2,
      activeId: state.activeId,
      workspaces: state.workspaces.map((w) => ({
        id: w.id,
        title: w.title,
        model: w.model,
        messages: w.messages,
        files: w.files,
        activeFile: w.activeFile,
        outputTab: w.outputTab,
        updatedAt: w.updatedAt,
      })),
      model: active.model,
      messages: active.messages,
      files: active.files,
      activeFile: active.activeFile,
      outputTab: active.outputTab,
      title: active.title,
    }
    try {
      if (api().testHubSaveSession) {
        await api().testHubSaveSession(payload)
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...payload, updatedAt: Date.now() }))
      }
    } catch {
      /* ignore */
    }
  }

  async function loadSession() {
    try {
      let saved = null
      if (api().testHubLoadSession) {
        saved = await api().testHubLoadSession()
      } else {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) saved = JSON.parse(raw)
      }
      if (!saved) {
        ensureActiveWorkspace()
        return
      }
      if (Array.isArray(saved.workspaces) && saved.workspaces.length) {
        state.workspaces = saved.workspaces.map((w, i) =>
          emptyWorkspace({
            id: w.id || workspaceId(),
            title: w.title || `Project ${i + 1}`,
            model: w.model || 'auto',
            messages: Array.isArray(w.messages) ? w.messages : [],
            files: w.files && typeof w.files === 'object' ? w.files : {},
            activeFile: w.activeFile || '',
            outputTab: w.outputTab === 'code' ? 'code' : 'preview',
            updatedAt: w.updatedAt || Date.now(),
          }),
        )
        const active = state.workspaces.find((w) => w.id === saved.activeId) || state.workspaces[0]
        applyWorkspace(active)
        if (state.linksOpen) void paintDeployLinks()
        void refreshActiveLiveDeploy()
        return
      }
      const ws = emptyWorkspace({
        title: saved.title || projectTitleFromMessages(saved.messages) || 'Project 1',
        model: saved.model || 'auto',
        messages: Array.isArray(saved.messages) ? saved.messages : [],
        files: saved.files && typeof saved.files === 'object' ? saved.files : {},
        activeFile: saved.activeFile || '',
        outputTab: saved.outputTab === 'code' ? 'code' : 'preview',
      })
      state.workspaces = [ws]
      applyWorkspace(ws)
    } catch {
      ensureActiveWorkspace()
    }
    void refreshActiveLiveDeploy()
  }

  function rebuildWorkspace(liveText) {
    const fromChat = {}
    for (const msg of state.messages) {
      if (msg.role === 'assistant') Object.assign(fromChat, extractBuildArtifacts(msg.content))
    }
    if (liveText) Object.assign(fromChat, extractBuildArtifacts(liveText))

    const next = { ...fromChat }
    for (const path of Object.keys(state.dirtyFiles || {})) {
      const prevModel = modelFilesSnapshot[path]
      const chatNow = fromChat[path]
      if (chatNow !== undefined && chatNow !== prevModel) {
        delete state.dirtyFiles[path]
        next[path] = chatNow
      } else if (state.files[path] != null) {
        next[path] = state.files[path]
      }
    }
    modelFilesSnapshot = { ...fromChat }
    state.files = next
    const paths = sortFilePaths(Object.keys(state.files))
    if (paths.length && (!state.activeFile || !state.files[state.activeFile])) {
      state.activeFile = paths[0]
    }
    if (buildPreviewHtml(state.files)) state.outputTab = 'preview'
    paintOutput()
    schedulePersist()
  }

  function clearProject(opts = {}) {
    const { soft } = opts
    if (state.busy) return false
    const dirty = state.messages.length || Object.keys(state.files).length || state.pending.length || state.live
    if (dirty && !soft) {
      const ok = window.confirm('Clear this workspace? Chat and files here will be removed. Other projects stay.')
      if (!ok) return false
    }
    state.messages = []
    state.pending = []
    state.files = {}
    state.dirtyFiles = {}
    modelFilesSnapshot = {}
    state.live = ''
    state.activeFile = ''
    state.archivesOpen = false
    state.saveHint = ''
    state.outputTab = 'preview'
    state.compareRuns = []
    state.compareActive = false
    const ws = ensureActiveWorkspace()
    ws.title = 'New project'
    paintWorkspaceTabs()
    paintFeed()
    paintOutput()
    paint()
    schedulePersist()
    return true
  }

  function newProject() {
    if (state.busy) return
    snapshotActive()
    const ws = emptyWorkspace({
      title: `Project ${state.workspaces.length + 1}`,
      model: state.model || 'auto',
    })
    state.workspaces.push(ws)
    applyWorkspace(ws)
    paintWorkspaceTabs()
    paintFeed()
    paintOutput()
    paint()
    schedulePersist()
    flashSaveHint('New workspace')
    $('test-hub-input')?.focus()
  }

  function switchProject(id) {
    if (state.busy || !id || id === state.activeId) return
    snapshotActive()
    const ws = state.workspaces.find((w) => w.id === id)
    if (!ws) return
    applyWorkspace(ws)
    paintWorkspaceTabs()
    paintFeed()
    paintOutput()
    paint()
    if (state.linksOpen) void paintDeployLinks()
    void refreshActiveLiveDeploy()
    schedulePersist()
  }

  function closeWorkspace(id) {
    if (state.busy) return
    if (state.workspaces.length <= 1) {
      clearProject()
      return
    }
    const idx = state.workspaces.findIndex((w) => w.id === id)
    if (idx < 0) return
    const closingActive = state.activeId === id
    if (closingActive) snapshotActive()
    state.workspaces.splice(idx, 1)
    if (closingActive) {
      const next = state.workspaces[Math.max(0, idx - 1)] || state.workspaces[0]
      applyWorkspace(next)
    }
    paintWorkspaceTabs()
    paintFeed()
    paintOutput()
    paint()
    if (state.linksOpen) void paintDeployLinks()
    void refreshActiveLiveDeploy()
    schedulePersist()
  }

  function paintWorkspaceTabs() {
    const host = $('test-hub-workspace-tabs')
    if (!host) return
    ensureActiveWorkspace()
    snapshotActive()
    host.innerHTML = state.workspaces
      .map((w) => {
        const on = w.id === state.activeId
        const label = escapeHtml(w.title || 'Project')
        return `<div class="test-hub-workspace-tab ${on ? 'on' : ''}" role="tab" aria-selected="${on}" data-id="${escapeAttr(w.id)}">
          <button type="button" class="test-hub-workspace-tab-btn" data-id="${escapeAttr(w.id)}" title="${label}">${label}</button>
          <button type="button" class="test-hub-workspace-tab-close" data-close="${escapeAttr(w.id)}" title="Close workspace" aria-label="Close ${label}">×</button>
        </div>`
      })
      .join('')
    host.querySelectorAll('.test-hub-workspace-tab-btn').forEach((btn) => {
      btn.onclick = () => switchProject(btn.dataset.id)
    })
    host.querySelectorAll('.test-hub-workspace-tab-close').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation()
        closeWorkspace(btn.dataset.close)
      }
    })
  }

  function flashSaveHint(text) {
    state.saveHint = text
    const el = $('test-hub-file-count')
    if (el) {
      el.textContent = text
      setTimeout(() => {
        if (state.saveHint === text) {
          state.saveHint = ''
          paintOutputFileCount()
        }
      }, 2200)
    }
  }

  function paintOutputFileCount() {
    const el = $('test-hub-file-count')
    if (!el || state.saveHint) return
    const n = Object.keys(state.files).length
    el.textContent = n ? `${n} file${n === 1 ? '' : 's'}` : ''
  }

  function codeCardLabel(seg, index) {
    if (seg.file) return seg.file
    if (seg.lang && seg.lang !== 'text') {
      const lang = String(seg.lang).toLowerCase()
      if (lang === 'html' || lang === 'htm') return 'index.html'
      if (lang === 'css') return 'style.css'
      if (lang === 'js' || lang === 'javascript') return 'script.js'
      if (lang === 'ts' || lang === 'typescript') return 'script.ts'
      if (lang === 'tsx') return 'Component.tsx'
      return `snippet.${lang}`
    }
    return `snippet-${index + 1}`
  }

  function fileLangBadge(path) {
    const ext = String(path || '').split('.').pop()?.toLowerCase() || ''
    const map = { json: 'JSON', ts: 'TS', tsx: 'TS', js: 'JS', jsx: 'JS', mjs: 'JS', css: 'CSS', html: 'HTML', htm: 'HTML', md: 'MD', py: 'PY' }
    return map[ext] || ext.toUpperCase().slice(0, 4) || 'FILE'
  }

  function parseCodeRows(body) {
    let lines = String(body || '').replace(/\r\n/g, '\n').split('\n')
    if (lines.length > 1 && lines[lines.length - 1] === '') lines = lines.slice(0, -1)
    const marked = lines.filter((l) => /^[+-]/.test(l) && !/^[+-]{3}/.test(l)).length
    const looksDiff = lines.length > 2 && marked >= Math.max(2, Math.floor(lines.length * 0.25))
    const rows = []
    let added = 0
    let removed = 0
    if (looksDiff) {
      for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          added += 1
          rows.push({ type: 'add', text: line.slice(1) })
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          removed += 1
          rows.push({ type: 'del', text: line.slice(1) })
        } else {
          rows.push({ type: '', text: line.replace(/^ /, '') })
        }
      }
    } else {
      added = lines.length
      for (const line of lines) rows.push({ type: 'add', text: line })
    }
    return { rows, added, removed }
  }

  function renderModelFileCard(seg, index) {
    const path = codeCardLabel(seg, index)
    const nameOnly = path.split(/[/\\]/).pop() || path
    const { rows, added, removed } = parseCodeRows(seg.content)
    const iconHtml = fileIcon(path)
    const badge = fileLangBadge(path)
    const stats = `<span class="agent-diff-stats" aria-label="${added} lines added, ${removed} lines removed"><span class="agent-diff-add">+${added}</span><span class="agent-diff-del">−${removed}</span></span>`
    const maxLines = 120
    const shown = rows.slice(0, maxLines)
    const more =
      rows.length > maxLines ? `<div class="agent-diff-more">${rows.length - maxLines} more lines</div>` : ''
    const bodyHtml = shown.length
      ? shown
          .map((row, i) => {
            const cls = row.type === 'add' ? 'diff-add' : row.type === 'del' ? 'diff-del' : ''
            const gutter = row.type === 'add' ? '+' : row.type === 'del' ? '−' : ''
            return `<div class="agent-diff-line ${cls}"><span class="agent-diff-ln">${i + 1}</span><span class="agent-diff-gutter">${gutter}</span><code class="agent-diff-text">${highlightCode(row.text, seg.lang || path)}</code></div>`
          })
          .join('')
      : `<div class="agent-diff-line diff-muted"><span class="agent-diff-text">(Empty file)</span></div>`

    return `<details class="agent-file-card agent-edit-card test-hub-model-file-card" open>
      <summary class="agent-file-card-head">
        <span class="test-hub-card-icon" aria-hidden="true">${iconHtml}</span>
        <span class="agent-file-lang">${escapeHtml(badge)}</span>
        <span class="agent-file-card-name" title="${escapeAttr(path)}">${escapeHtml(nameOnly)}</span>
        ${stats}
      </summary>
      <div class="agent-diff-body test-hub-diff-body">${bodyHtml}${more}</div>
    </details>`
  }

  function renderMessageHtml(msg, streaming) {
    if (msg.role === 'user') {
      const attach = msg.files?.length
        ? `<div class="test-hub-attach">${msg.files.map((f) => `<span class="test-hub-chip">${escapeHtml(f.name)}</span>`).join('')}</div>`
        : ''
      return `<article class="test-hub-msg user">
        <div class="test-hub-msg-label">You</div>
        <div class="test-hub-user-card">
          ${attach}
          <div class="test-hub-user-text">${escapeHtml(msg.content)}</div>
        </div>
      </article>`
    }

    const segments = parseSegments(msg.content)
    const inner = segments
      .map((seg, i) => {
        if (seg.kind === 'text') {
          const t = seg.content.trim()
          if (!t) return ''
          return `<div class="test-hub-prose-card">${formatProseHtml(t)}</div>`
        }
        return renderModelFileCard(seg, i)
      })
      .join('')

    return `<article class="test-hub-msg assistant${streaming ? ' test-hub-msg-live' : ''}">
      <div class="test-hub-msg-label">Model</div>
      <div class="test-hub-msg-stack">${inner || `<div class="test-hub-prose-card">${formatProseHtml(msg.content)}</div>`}</div>
    </article>`
  }

  function paintFeed() {
    const feed = $('test-hub-feed')
    if (!feed) return
    let html = ''
    if (!state.messages.length && !state.live && !state.busy) {
      html = `<div class="test-hub-empty">
        <p class="test-hub-empty-title">Ask the model to build or explain anything.</p>
        <p class="test-hub-empty-sub">Pick a model below — attach files or folders; preview and code land on the right.</p>
      </div>`
    } else {
      html = state.messages.map((m) => renderMessageHtml(m, false)).join('')
      if (state.live) {
        html += renderMessageHtml({ role: 'assistant', content: state.live }, true)
      } else if (state.busy) {
        html += `<div class="test-hub-thinking">${state.compareActive ? `Comparing ${state.compareRuns.length} models…` : 'Thinking…'}</div>`
      }
    }
    feed.innerHTML = html
    feed.scrollTop = feed.scrollHeight
  }

  async function paintArchivesList() {
    const list = $('test-hub-archives-list')
    const panel = $('test-hub-archives')
    if (!list || !panel) return
    panel.hidden = !state.archivesOpen
    if (!state.archivesOpen) return
    let rows = []
    try {
      rows = (await api().testHubListArchives?.()) || []
    } catch {
      rows = []
    }
    if (!rows.length) {
      list.innerHTML = '<p class="test-hub-archives-empty">No saved builds yet. Tap Save to keep this project.</p>'
      return
    }
    list.innerHTML = rows
      .map(
        (row) => `<button type="button" class="test-hub-archive-item" data-id="${escapeAttr(row.id)}">
          <span class="test-hub-archive-title">${escapeHtml(row.title || row.id)}</span>
          <span class="test-hub-archive-meta">${row.fileCount || 0} files · ${new Date(row.updatedAt).toLocaleString()}</span>
        </button>`,
      )
      .join('')
    list.querySelectorAll('.test-hub-archive-item').forEach((btn) => {
      btn.onclick = async () => {
        const data = await api().testHubLoadArchive?.(btn.dataset.id)
        if (data?.error) {
          flashSaveHint(data.error)
          return
        }
        state.messages = data.messages || []
        state.files = data.files || {}
        state.model = data.model || state.model
        state.activeFile = data.activeFile || ''
        state.archivesOpen = false
        state.dirtyFiles = {}
        const fromChat = {}
        for (const msg of state.messages) {
          if (msg.role === 'assistant') Object.assign(fromChat, extractBuildArtifacts(msg.content))
        }
        modelFilesSnapshot = { ...fromChat }
        for (const path of Object.keys(state.files)) {
          if (state.files[path] !== fromChat[path]) state.dirtyFiles[path] = true
        }
        paintOutput()
        paintFeed()
        paint()
        flashSaveHint('Build restored')
      }
    })
  }

  function paintOutput() {
    const paths = sortFilePaths(Object.keys(state.files))
    const codeEmpty = $('test-hub-code-empty')
    const workspace = $('test-hub-code-workspace')
    if (paths.length && (!state.activeFile || !state.files[state.activeFile])) {
      state.activeFile = paths[0]
    }
    if (codeEmpty) codeEmpty.hidden = paths.length > 0
    if (workspace) workspace.hidden = !paths.length

    const tree = $('test-hub-file-tree')
    if (tree) {
      tree.innerHTML = paths
        .map(
          (p) => `<button type="button" class="test-hub-file-item ${p === state.activeFile ? 'on' : ''}" data-path="${escapeAttr(p)}">
            <span class="test-hub-file-icon" aria-hidden="true">${fileIcon(p)}</span>
            <span class="test-hub-file-name">${escapeHtml(p)}</span>
          </button>`,
        )
        .join('')
      tree.querySelectorAll('.test-hub-file-item').forEach((btn) => {
        btn.onclick = () => {
          state.activeFile = btn.dataset.path || ''
          paintOutput()
        }
      })
    }

    const tabName = $('test-hub-file-tab-name')
    const editor = $('test-hub-file-editor')
    const editorBody = document.querySelector('.test-hub-file-editor-body')
    if (state.activeFile && state.files[state.activeFile] != null) {
      if (tabName) tabName.textContent = state.activeFile
      if (editorBody) editorBody.hidden = false
      if (editor) {
        const nextVal = state.files[state.activeFile]
        const editingHere = document.activeElement === editor && editor.dataset.path === state.activeFile
        if (!editingHere) {
          editor.value = nextVal
          editor.dataset.path = state.activeFile
          syncFileEditorHighlight()
        }
      }
    } else {
      if (tabName) tabName.textContent = 'No file selected'
      if (editorBody) editorBody.hidden = true
      if (editor) {
        editor.value = ''
        editor.dataset.path = ''
      }
      const highlight = $('test-hub-file-highlight')
      const code = highlight?.querySelector('code')
      if (code) code.innerHTML = ''
    }
    paintOutputFileCount()
    void paintArchivesList()

    const preview = wrapPreviewHtml(state.files)
    const stack = $('test-hub-preview-stack')
    const frame = $('test-hub-preview')
    const previewEmpty = $('test-hub-preview-empty')
    if (frame) {
      if (preview) {
        if (stack) stack.hidden = false
        frame.hidden = false
        if (previewEmpty) previewEmpty.hidden = true
        if (preview !== lastPreviewSrc) {
          lastPreviewSrc = preview
          clearPreviewConsole()
          frame.srcdoc = preview
        }
      } else {
        lastPreviewSrc = ''
        if (stack) stack.hidden = true
        frame.hidden = true
        frame.removeAttribute('srcdoc')
        if (previewEmpty) previewEmpty.hidden = false
        clearPreviewConsole()
      }
    }
    paintCompareGrid()
    paintRunViteButton()
    paintSandboxLog()
    void paintBenchmarkScores()
  }

  function paint() {
    paintWorkspaceTabs()
    paintFeed()
    paintModelList()
    paintCompareBar()
    paintCompareGrid()
    paintRunViteButton()
    paintSandboxLog()
    void paintBenchmarkScores()
    const compareTab = $('test-hub-compare-tab')
    if (compareTab) compareTab.hidden = !state.compareMode && !state.compareRuns.length
    const chips = $('test-hub-pending')
    if (chips) {
      chips.innerHTML = state.pending.map((f) => `<span class="test-hub-chip">${escapeHtml(f.name)}</span>`).join('')
      chips.hidden = !state.pending.length
    }
    const send = $('test-hub-send')
    if (send) {
      send.disabled = state.busy || (state.compareMode && state.comparePick.length < 2)
      send.textContent = state.busy ? 'Sending…' : state.compareMode ? 'Compare' : 'Send'
    }
    document.querySelectorAll('.test-hub-out-tab').forEach((btn) => {
      btn.classList.toggle('on', btn.dataset.out === state.outputTab)
      btn.setAttribute('aria-selected', btn.dataset.out === state.outputTab ? 'true' : 'false')
    })
    const previewPane = $('test-hub-preview-pane')
    const codePane = $('test-hub-code-pane')
    const comparePane = $('test-hub-compare-pane')
    if (previewPane) {
      previewPane.classList.toggle('on', state.outputTab === 'preview')
      previewPane.hidden = state.outputTab !== 'preview'
    }
    if (codePane) {
      codePane.classList.toggle('on', state.outputTab === 'code')
      codePane.hidden = state.outputTab !== 'code'
    }
    if (comparePane) {
      comparePane.classList.toggle('on', state.outputTab === 'compare')
      comparePane.hidden = state.outputTab !== 'compare'
    }
  }

  function buildApiMessages() {
    const snapshot = projectFilesSnapshot(state.files)
    const out = [{ role: 'system', content: snapshot ? `${TEST_HUB_SYSTEM}\n\n${snapshot}` : TEST_HUB_SYSTEM }]
    for (const m of state.messages) {
      let content = m.content || ''
      if (m.files?.length) {
        content += `\n\n--- attached ---\n${m.files.map((f) => `### ${f.name}\n${f.text || ''}`).join('\n\n')}`
      }
      out.push({ role: m.role, content })
    }
    return out
  }

  async function loadPlanAccess() {
    try {
      const data = await api().fetchAccountSummary?.()
      if (data && !data.error) {
        state.plan = data.plan || 'hobby'
        state.byokAllowed = Boolean(data.byokAllowed)
      }
    } catch {
      /* ignore */
    }
    sanitizeComparePick()
  }

  async function loadModels() {
    await loadPlanAccess()
    let apiList = []
    try {
      const data = await api().fetchModels?.()
      apiList = Array.isArray(data?.models) ? data.models : []
    } catch {
      /* ignore */
    }
    state.models = mergeAllModels(apiList)
    if (state.model !== 'auto' && !isHubModelSelectable(state.models.find((m) => m.id === state.model))) {
      state.model = 'auto'
    }
    sanitizeComparePick()
    paintModelList()
    paintCompareBar()
  }

  function mergePending(files) {
    if (!files?.length) return
    state.pending = [...state.pending, ...files].slice(0, 6)
    paint()
  }

  async function sendCompare() {
    const box = $('test-hub-input')
    const text = box?.value?.trim() || ''
    if (state.busy || (!text && !state.pending.length)) return
    const models = state.comparePick.filter((id) => {
      const m = state.models.find((row) => row.id === id)
      return m && isHubModelSelectable(m)
    })
    if (models.length < 2) {
      if (isUnpaidPlan(state.plan)) showUpgradeModal('subscribe')
      else flashSaveHint('Pick at least 2 models on your plan to compare')
      return
    }

    state.messages.push({ role: 'user', content: text, files: state.pending.length ? [...state.pending] : undefined })
    state.pending = []
    if (box) box.value = ''
    state.busy = true
    state.compareActive = true
    state.live = ''
    const stamp = Date.now()
    state.compareRuns = models.map((id) => ({
      streamId: `compare-${id}-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
      model: id,
      modelName: modelNameById(id),
      text: '',
      status: 'running',
      ms: 0,
      error: '',
    }))
    state.outputTab = 'compare'
    const compareTab = $('test-hub-compare-tab')
    if (compareTab) compareTab.hidden = false
    setHubAvatarState('working')
    paintCompareGrid()
    paint()

    const apiMessages = buildApiMessages()
    const streamFn = api().testHubStream || api().testHubChat
    let offChunk = null
    try {
      offChunk = api().onTestHubChunk?.(({ streamId, text: chunk }) => {
        const run = state.compareRuns.find((row) => row.streamId === streamId)
        if (!run || run.status !== 'running') return
        run.text = chunk || ''
        paintCompareGrid()
      })

      await Promise.all(
        state.compareRuns.map(async (run) => {
          const t0 = performance.now()
          try {
            const res = await streamFn?.({
              model: run.model,
              messages: apiMessages,
              streamId: run.streamId,
            })
            if (res?.error) {
              run.status = 'error'
              run.error = res.error
            } else {
              run.text = res?.text || run.text || ''
              run.status = 'done'
            }
          } catch (err) {
            run.status = 'error'
            run.error = err?.message || String(err)
          }
          run.ms = Math.round(performance.now() - t0)
          paintCompareGrid()
        }),
      )

      const viteAny = state.compareRuns.some((run) => isViteProject(extractBuildArtifacts(run.text || '')))
      if (viteAny) {
        await Promise.all(state.compareRuns.map((run) => (run.status === 'done' ? maybeViteCheckRun(run) : run)))
        paintCompareGrid()
      }
      await saveBenchmarkRuns(state.compareRuns, { compareMode: true, viteEnabled: viteAny })
    } finally {
      if (offChunk) offChunk()
      state.busy = false
      state.compareActive = false
      setHubAvatarState('idle')
      paintCompareGrid()
      schedulePersist()
      paint()
    }
  }

  async function send() {
    if (state.compareMode) return sendCompare()
    const box = $('test-hub-input')
    const text = box?.value?.trim() || ''
    if (state.busy || (!text && !state.pending.length)) return
    if (state.model !== 'auto') {
      const picked = state.models.find((m) => m.id === state.model)
      const access = modelAccess(picked || { id: state.model })
      if (access.tier === 'locked') {
        showUpgradeModal(access.reason)
        return
      }
    } else if (isUnpaidPlan(state.plan)) {
      showUpgradeModal('subscribe')
      return
    }
    state.messages.push({ role: 'user', content: text, files: state.pending.length ? [...state.pending] : undefined })
    state.pending = []
    if (box) box.value = ''
    state.busy = true
    state.live = ''
    setHubAvatarState('working')
    paint()

    let offChunk = null
    try {
      offChunk = api().onTestHubChunk?.(({ streamId, text: chunk }) => {
        if (streamId && streamId !== 'default') return
        state.live = chunk || ''
        rebuildWorkspace(state.live)
        paintFeed()
      })

      const streamFn = api().testHubStream || api().testHubChat
      const res = await streamFn?.({
        model: state.model,
        messages: buildApiMessages(),
        streamId: 'default',
      })

      if (res?.error) throw new Error(res.error)
      const reply = res?.text || state.live || ''
      state.messages.push({ role: 'assistant', content: reply })
      state.live = ''
      rebuildWorkspace()
      const run = {
        model: state.model,
        modelName: modelNameById(state.model),
        text: reply,
        ms: 0,
        status: 'done',
        previewErrors: state.previewLogs.length,
      }
      if (isViteProject(state.files)) await maybeViteCheckRun(run)
      await saveBenchmarkRuns([run], { compareMode: false, viteEnabled: isViteProject(state.files) })
    } catch (err) {
      let msg = err?.message || String(err)
      if (/never sent|timed out|Could not reach/i.test(msg) && api().testHubChat) {
        try {
          const res = await api().testHubChat({
            model: state.model,
            messages: buildApiMessages(),
          })
          if (!res?.error) {
            const reply = res?.text || ''
            state.messages.push({ role: 'assistant', content: reply })
            state.live = ''
            rebuildWorkspace(reply)
            state.busy = false
            setHubAvatarState('idle')
            schedulePersist()
            paint()
            return
          }
          msg = res.error
        } catch (retryErr) {
          msg = retryErr?.message || msg
        }
      }
      if (isUpgradeError(msg)) showUpgradeModal(/Subscribe to Start/i.test(msg) ? 'subscribe' : 'pro')
      else state.messages.push({ role: 'assistant', content: `Error: ${msg}` })
      state.live = ''
    } finally {
      if (offChunk) offChunk()
      state.busy = false
      setHubAvatarState('idle')
      schedulePersist()
      paint()
    }
  }

  function setOutputTab(tab) {
    state.outputTab = tab === 'code' ? 'code' : tab === 'compare' ? 'compare' : 'preview'
    paint()
  }

  function bind() {
    $('test-hub-model-btn')?.addEventListener('click', (e) => {
      e.stopPropagation()
      if (state.modelPanelOpen) closeModelPanel()
      else openModelPanel()
    })
    $('test-hub-model-pop')?.addEventListener('click', (e) => e.stopPropagation())
    $('test-hub-model-search')?.addEventListener('input', (e) => {
      state.modelSearch = e.target.value || ''
      paintModelList()
    })
    $('test-hub-model-search')?.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') e.preventDefault()
    })
    document.addEventListener('click', () => {
      if (state.modelPanelOpen) closeModelPanel()
    })

    $('test-hub-send')?.addEventListener('click', () => void send())
    $('test-hub-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void send()
      }
    })
    $('test-hub-attach')?.addEventListener('click', async () => {
      mergePending(await api().pickFiles?.())
    })
    $('test-hub-folder')?.addEventListener('click', async () => {
      mergePending(await api().pickFolderAttach?.())
    })
    $('test-hub-compare-toggle')?.addEventListener('click', () => toggleCompareMode())
    $('test-hub-preview-console-clear')?.addEventListener('click', () => clearPreviewConsole())
    $('test-hub-preview-console-fix')?.addEventListener('click', () => {
      if (!state.previewLogs.length) return
      const summary = state.previewLogs
        .map((row) => {
          const where = row.source ? ` (${row.source}${row.line ? `:${row.line}` : ''})` : ''
          return `[${row.level}] ${row.message}${where}`
        })
        .join('\n')
      const box = $('test-hub-input')
      const fixPrompt = `The live preview threw these runtime errors:\n\n${summary}\n\nFix the project files so the preview runs without errors.`
      if (box) {
        box.value = fixPrompt
        box.focus()
      }
    })
    bindPreviewConsole()
    $('test-hub-close')?.addEventListener('click', () => {
      window.SoumtokTestHub?.close?.()
    })
    $('test-hub-clear-project')?.addEventListener('click', () => {
      if (clearProject()) flashSaveHint('Project cleared')
    })
    $('test-hub-new-project')?.addEventListener('click', () => newProject())
    document.querySelectorAll('.test-hub-out-tab').forEach((btn) => {
      btn.addEventListener('click', () => setOutputTab(btn.dataset.out))
    })

    $('test-hub-show-archives')?.addEventListener('click', () => {
      state.archivesOpen = !state.archivesOpen
      state.scoresOpen = false
      state.linksOpen = false
      void paintArchivesList()
      void paintBenchmarkScores()
      void paintDeployLinks()
    })

    $('test-hub-save-archive')?.addEventListener('click', async () => {
      const files = filesForExport()
      if (!Object.keys(files).length) return
      const res = await api().testHubSaveArchive?.({
        title: projectTitle(),
        model: state.model,
        messages: state.messages,
        files,
        activeFile: state.activeFile,
      })
      if (res?.title) {
        flashSaveHint(`Saved · ${res.title}`)
        state.archivesOpen = true
        void paintArchivesList()
      }
    })

    $('test-hub-export-zip')?.addEventListener('click', async () => {
      const files = filesForExport()
      if (!Object.keys(files).length) return
      const res = await api().testHubExportZip?.({ files, defaultName: projectTitle() })
      if (res?.path) {
        const n = res.count ?? Object.keys(files).length
        flashSaveHint(`Downloaded ${n} file${n === 1 ? '' : 's'} · ${res.path.split(/[/\\]/).pop()}`)
      } else if (res?.error) flashSaveHint(res.error)
    })

    $('test-hub-run-vite')?.addEventListener('click', () => void runViteSandbox())
    $('test-hub-preview-run-vite')?.addEventListener('click', () => void runViteSandbox())
    $('test-hub-share-link')?.addEventListener('click', () => void handleShareLinkClick())
    $('test-hub-preview-share')?.addEventListener('click', () => void handleShareLinkClick())
    $('test-hub-preview-live-copy')?.addEventListener('click', async () => {
      const url =
        String(state.activeLiveDeploy?.url || '').trim() ||
        String($('test-hub-preview-live-url')?.textContent || '').trim()
      if (!url) return
      const btn = $('test-hub-preview-live-copy')
      flashCopyButton(btn, 'Copy')
      const ok = await copyTextToClipboard(url)
      if (ok) flashSaveHint('Copied')
      else if (btn) btn.textContent = 'Copy'
    })
    $('test-hub-share-cancel')?.addEventListener('click', () => closeShareDialog())
    $('test-hub-share-done')?.addEventListener('click', () => closeShareDialog())
    $('test-hub-share-new-link')?.addEventListener('click', () => {
      setShareDialogError('')
      void openSharePublishForm()
    })
    $('test-hub-share-copy-again')?.addEventListener('click', async () => {
      const url =
        lastPublishedShareUrl || String($('test-hub-share-success-url')?.textContent || '').trim()
      if (!url) return
      const btn = $('test-hub-share-copy-again')
      flashCopyButton(btn, 'Copy link')
      const ok = await copyTextToClipboard(url)
      if (ok) flashSaveHint('Copied')
      else {
        btn.textContent = 'Copy link'
        flashSaveHint(url)
      }
    })
    $('test-hub-share-confirm')?.addEventListener('click', () => void confirmSharePublish())
    $('test-hub-share-name')?.addEventListener('input', () => {
      const slugInput = $('test-hub-share-slug')
      if (slugInput && !slugInput.dataset.touched) {
        slugInput.value = suggestShareSlug($('test-hub-share-name')?.value || '')
      }
      paintShareUrlPreview()
    })
    $('test-hub-share-slug')?.addEventListener('input', () => {
      const slugInput = $('test-hub-share-slug')
      if (slugInput) slugInput.dataset.touched = '1'
      paintShareUrlPreview()
    })
    $('test-hub-share-dialog')?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeShareDialog()
      if (event.key === 'Enter') {
        event.preventDefault()
        void confirmSharePublish()
      }
    })
    $('test-hub-show-scores')?.addEventListener('click', () => {
      state.scoresOpen = !state.scoresOpen
      state.archivesOpen = false
      state.linksOpen = false
      void paintBenchmarkScores()
      void paintArchivesList()
      void paintDeployLinks()
    })
    $('test-hub-show-links')?.addEventListener('click', () => {
      state.linksOpen = !state.linksOpen
      state.scoresOpen = false
      state.archivesOpen = false
      void paintDeployLinks()
      void paintBenchmarkScores()
      void paintArchivesList()
    })
    $('test-hub-links-close')?.addEventListener('click', () => {
      state.linksOpen = false
      void paintDeployLinks()
    })
    $('test-hub-scores-close')?.addEventListener('click', () => {
      state.scoresOpen = false
      void paintBenchmarkScores()
    })
    $('test-hub-sandbox-log-close')?.addEventListener('click', () => {
      state.sandboxOpen = false
      paintSandboxLog()
    })
    $('test-hub-export-folder')?.addEventListener('click', async () => {
      const files = filesForExport()
      const names = Object.keys(files)
      if (!names.length) {
        flashSaveHint('No files to save')
        return
      }
      const res = await api().testHubExportFolder?.({ files })
      if (res?.path) {
        const n = res.count ?? names.length
        const label = res.path.split(/[/\\]/).filter(Boolean).pop() || res.path
        flashSaveHint(`Saved ${n} file${n === 1 ? '' : 's'} to ${label}`)
      } else if (res?.error) flashSaveHint(res.error)
    })

    $('test-hub-file-copy')?.addEventListener('click', async () => {
      const text = state.activeFile ? state.files[state.activeFile] : ''
      if (!text) return
      try {
        await navigator.clipboard.writeText(text)
        flashSaveHint('Copied')
      } catch {
        /* ignore */
      }
    })

    $('test-hub-archives-close')?.addEventListener('click', () => {
      state.archivesOpen = false
      void paintArchivesList()
    })

    $('test-hub-file-editor')?.addEventListener('input', () => onFileEditorInput())
    $('test-hub-file-editor')?.addEventListener('scroll', () => syncFileEditorHighlight(true))
    mountHubAvatar()
  }

  async function show(on) {
    const el = $('test-hub-screen')
    if (el) el.hidden = !on
    document.body.classList.toggle('test-hub-mode', on)
    if (on) {
      await loadSession()
      void loadModels()
      if (!Object.keys(state.files).length) rebuildWorkspace()
      else paintOutput()
      paint()
      mountHubAvatar()
      setHubAvatarState(state.busy ? 'working' : 'idle')
      void refreshActiveLiveDeploy()
      $('test-hub-input')?.focus()
    }
  }

  function close() {
    if (typeof window.SoumtokTestHubOnClose === 'function') {
      window.SoumtokTestHubOnClose()
      return
    }
    show(false)
  }

  bind()
  window.SoumtokTestHub = { show, close, isOpen: () => !($('test-hub-screen')?.hidden ?? true) }
})()
