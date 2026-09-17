const api = window.soumtok
const parseAgentChoices = (text) => window.SOUMTOK_AGENT_CHOICES?.parseAgentChoices(text) ?? null
const stripNumberedListForChoices = (text, choices) =>
  window.SOUMTOK_AGENT_CHOICES?.stripNumberedListForChoices(text, choices) ?? text
const DEV_SNAPSHOT = 'soumtok-ide-dev'
const EXT_DOCK_KEY = 'soumtok-ext-dock'
const AGENT_THREADS_BACKUP_PREFIX = 'soumtok-agent-threads-v1'
const EXT_MARKET_FILTER_KEY = 'soumtok-ext-market-filter'
const EXT_INSTALL_UNAVAILABLE_MSG =
  'Extension installs are under development — we are facing a few things right now and will be back soon.'
const SKIP_WIN = navigator.platform.startsWith('Mac')
if (SKIP_WIN) document.querySelectorAll('[data-win]').forEach((btn) => { btn.hidden = true })

function syncWinMaxIcon(maximized) {
  const btn = document.querySelector('[data-win="max"]')
  if (!btn || SKIP_WIN) return
  btn.classList.toggle('is-restored', !!maximized)
  const label = maximized ? 'Restore' : 'Maximize'
  btn.title = label
  btn.setAttribute('aria-label', label)
}

function bindWindowChrome() {
  if (SKIP_WIN) return
  api.isWindowMaximized?.().then(syncWinMaxIcon).catch(() => {})
  api.onWindowMaxChanged?.(syncWinMaxIcon)
}

const MODEL_CATALOG = window.SOUMTOK_MODEL_CATALOG || { MODELS: [], RECOMMENDED_MODEL_IDS: [] }
/** Always available in the renderer — desktop never shows an empty model list. */
const BUILTIN_DESKTOP_MODELS = MODEL_CATALOG.MODELS
const RECOMMENDED_MODEL_IDS = new Set(MODEL_CATALOG.RECOMMENDED_MODEL_IDS || [])
const SETTINGS_MODELS_COLLAPSED = 8
/** Included on Soumtok platform routing when signed in (trial + paid). */
const SOUMTOK_DESKTOP_PROVIDERS = new Set(['deepseek', 'openai', 'anthropic', 'xai'])

function builtinDesktopModels(ready = false) {
  return BUILTIN_DESKTOP_MODELS.map((m) => ({ ...m, ready }))
}

function readyProvidersFromApiList(apiList) {
  const out = new Set()
  for (const m of apiList) {
    if (m?.provider && m.ready !== false) out.add(m.provider)
  }
  return out
}

function resolveConnectedProviders() {
  const connected = new Set()
  for (const p of state.accountSummary?.providers || []) {
    if (p.connected) connected.add(p.id)
  }
  for (const k of state.providerKeys || []) {
    if (k.provider) connected.add(k.provider)
  }
  for (const id of state.platformProviders || []) {
    if (id) connected.add(id)
  }
  if (state.user) {
    for (const id of SOUMTOK_DESKTOP_PROVIDERS) connected.add(id)
  }
  return connected
}

function applyConnectedProvidersToModels(models) {
  const connected = resolveConnectedProviders()
  const openRouter = connected.has('openrouter')
  if (!connected.size) return models
  return models.map((m) => {
    if (m.ready === true || !m.provider || m.provider === 'auto') return m
    if (connected.has(m.provider) || openRouter) return { ...m, ready: true }
    return m
  })
}

/** If one model on a provider is ready, treat the whole provider as ready in the picker. */
function applyProviderReadinessToModels(models) {
  const connected = resolveConnectedProviders()
  const readyProviders = readyProvidersFromApiList(models)
  for (const id of connected) readyProviders.add(id)
  const openRouter = connected.has('openrouter')
  return models.map((m) => {
    if (m.ready === true || !m.provider || m.provider === 'auto') return m
    if (m.ready !== false) return m
    if (readyProviders.has(m.provider) || openRouter) return { ...m, ready: true }
    return m
  })
}

/** Picker lock — signed-in Soumtok users use platform routing for desktop providers. */
function modelNeedsKey(m) {
  if (!m || m.id === 'auto' || !m.provider) return false
  if (state.user && SOUMTOK_DESKTOP_PROVIDERS.has(m.provider)) return false
  return m.ready === false
}

function refreshModelReadiness() {
  if (!state.modelOptions.length) return
  state.modelOptions = applyProviderReadinessToModels(applyConnectedProvidersToModels(state.modelOptions))
  refreshModelPickerList()
  setModelTriggerLabel()
}

function mergeModelCatalog(fromApi) {
  const apiList = Array.isArray(fromApi) ? fromApi : []
  if (!apiList.length) {
    let out = applyProviderReadinessToModels(applyConnectedProvidersToModels(builtinDesktopModels(false)))
    if (typeof MODEL_CATALOG.sortForDisplay === 'function') return MODEL_CATALOG.sortForDisplay(out)
    return out
  }
  const readyProviders = readyProvidersFromApiList(apiList)
  const byId = new Map(apiList.map((m) => [m.id, m]))
  const merged = BUILTIN_DESKTOP_MODELS.map((base) => {
    const hit = byId.get(base.id)
    if (!hit) {
      const ready = base.provider && readyProviders.has(base.provider) ? true : false
      return { ...base, ready }
    }
    const tags = [...new Set([...(base.tags || []), ...(hit.tags || [])])]
    return { ...base, ...hit, name: hit.name || base.name, tags }
  })
  for (const m of apiList) {
    if (!merged.some((row) => row.id === m.id)) merged.push(m)
  }
  let out = merged.filter((m) => m.id !== 'soumtok-agent' && m.id !== 'composer-2-5')
  out = applyProviderReadinessToModels(applyConnectedProvidersToModels(out))
  if (typeof MODEL_CATALOG.sortForDisplay === 'function') return MODEL_CATALOG.sortForDisplay(out)
  return out
}

const state = {
  side: 'files',
  folder: null,
  tree: [],
  tabs: [],
  active: null,
  user: null,
  editor: null,
  monacoReady: false,
  editorModel: null,
  monacoLoadPromise: null,
  dirty: new Map(),
  threads: [],
  activeThreadId: null,
  agentMode: 'agent',
  agentDriver: 'ide',
  agentModel: 'auto',
  agentBusy: false,
  agentRunThreadId: null,
  modelOptions: builtinDesktopModels(false),
  modelLoadError: '',
  modelSetupHint: '',
  agentModelFast: false,
  agentModelPicker: null,
  agentModePicker: false,
  agentIntelPicker: false,
  agentModelSearch: '',
  agentHistoryOpen: false,
  agentMoreOpen: false,
  agentHistorySearch: '',
  agentArchivedOpen: false,
  agentPreviewEditors: true,
  agentAttachments: [],
  settingsOpen: false,
  settingsTab: 'general',
  settingsSearch: '',
  settingsModelSearch: '',
  settingsModelsExpanded: false,
  settingsConnectorSearch: '',
  settingsDeployLinks: [],
  settingsDeployLinksLoading: false,
  settingsDeployLinksError: '',
  userSkills: [],
  pluginsCatalog: [],
  installedPlugins: [],
  settingsSkillsLoading: false,
  settingsSkillsError: '',
  settingsSkillsStatus: '',
  settingsConnectLink: '',
  settingsConnectCode: '',
  settingsConnectPluginId: '',
  settingsSkillsSubview: 'marketplace',
  settingsSkillsSearch: '',
  settingsSkillsCustomMcpOpen: false,
  pluginInstallBusy: '',
  agentSkillsPickerOpen: false,
  agentSkillsPickerSearch: '',
  localAgentSkills: [],
  localAgentSkillsLoading: false,
  connectorsMarket: null,
  connectorsMine: [],
  connectorsStatus: '',
  subagentModel: 'auto',
  accountSummary: null,
  accountSummaryError: '',
  accountSummaryLoading: false,
  profile: null,
  avatarDataUrl: '',
  avatarUploadBusy: false,
  avatarUploadProgress: 0,
  avatarUploadStage: '',
  testHubAgentWasOff: null,
  testHubSidebarWasOff: null,
  platformProviders: [],
  providerKeys: [],
  providerKeysLoading: false,
  appInfo: null,
  editorFontSize: 13,
  themePref: 'system',
  disabledModels: new Set(),
  agentCtrlEnter: false,
  agentPrefs: null,
  agentOutbox: [],
  agentLiveStatus: '',
  agentTerminalLive: '',
  agentInterruptAfterCancel: null,
  agentAvatarState: 'idle',
  agentLiveFile: null,
  agentReview: null,
  agentBgTerminals: [],
  agentCanvas: null,
  windowLayout: 'editor',
  expandedDirs: new Set(),
  gitSnapshot: null,
  editorCursor: { line: 1, column: 1 },
  explorerFocus: null,
  explorerFilterOpen: false,
  explorerFilterText: '',
  explorerInlineCreate: null,
  extensionActivity: [],
  extHostLaunched: new Set(),
  installedExtById: new Map(),
  installedExtCacheAt: 0,
  workspaceExtraFolders: [],
  workspaceFilePath: null,
  extraRoots: [],
}

const AGENT_PREFS_KEY = 'soumtok-agent-prefs'
const DEFAULT_AGENT_PREFS = {
  includeOpenFiles: true,
  localToolsEnabled: true,
  workspaceBoundary: true,
  terminalSandbox: 'permissive',
  fileDeletionProtection: false,
  webSearchTool: true,
  webFetchTool: true,
  waitForMcpAuth: true,
  thirdPartyImports: true,
  mcpConnectors: true,
  agentTextSize: 'default',
  codeBlockWordWrap: false,
  queueWhileBusy: 'queue',
  usageSummary: 'auto',
  agentAutocomplete: true,
  autoApproveModeSwitch: false,
  runMode: 'run-everything',
  inlineDiffs: true,
  tabCompletions: true,
  tabModel: 'deepseek-v4-flash',
  preferExtensionLsp: true,
  jumpNextDiffOnAccept: true,
  autoFormatOnFinish: true,
  legacyTerminal: false,
  toolbarOnSelection: true,
  intelligence: 'balanced',
  thinkFirst: true,
  browserVerify: true,
  skillsEnabled: true,
  codebaseSearch: true,
}

const LAYOUT_KEY = 'soumtok-layout'
const layout = { sidebar: 280, agent: 420, extdock: 460, panel: 200 }

const PROVIDER_NAMES = {
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  anthropic: 'Claude',
  xai: 'Grok',
  openrouter: 'OpenRouter',
  auto: 'Auto',
}

const DESKTOP_KEY_PROVIDERS = [
  { id: 'deepseek', hint: 'platform.deepseek.com' },
  { id: 'openai', hint: 'platform.openai.com' },
  { id: 'anthropic', hint: 'console.anthropic.com' },
  { id: 'xai', hint: 'console.x.ai' },
  { id: 'openrouter', hint: 'openrouter.ai (all models)' },
]

function settingsRow(title, desc, control) {
  return `<div class="settings-row">
    <div class="settings-row-text"><strong>${title}</strong><span>${desc}</span></div>
    ${control}
  </div>`
}

function settingsCard(rowsHtml) {
  return `<div class="settings-card">${rowsHtml}</div>`
}

function settingsSection(title, bodyHtml) {
  return `<div class="settings-section">
    ${title ? `<h2 class="settings-section-title">${title}</h2>` : ''}
    ${bodyHtml}
  </div>`
}

function settingsNavIcon(id) {
  const icons = {
    general: `<svg class="settings-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>`,
    models: `<svg class="settings-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2 2 7l10 5 10-5-10-5Z"/>
      <path d="m2 12 10 5 10-5"/>
      <path d="m2 17 10 5 10-5"/>
    </svg>`,
    agents: `<svg class="settings-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 8V4H8"/>
      <rect x="4" y="8" width="16" height="12" rx="2"/>
      <path d="M2 14h2"/>
      <path d="M20 14h2"/>
      <path d="M9 13v2"/>
      <path d="M15 13v2"/>
    </svg>`,
    keys: `<svg class="settings-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2 18v3c0 .6.4 1 1 1h3"/>
      <path d="M15 6a6 6 0 0 0-9 9l-4 4"/>
      <circle cx="15" cy="6" r="4"/>
    </svg>`,
    plan: `<svg class="settings-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <path d="M2 10h20"/>
    </svg>`,
    connectors: `<svg class="settings-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l1.42-1.42a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54L5.04 11.9a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>`,
    'test-hub': `<svg class="settings-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l1.42-1.42a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54L5.04 11.9a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      <circle cx="7" cy="7" r="2"/>
    </svg>`,
    skills: `<svg class="settings-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      <path d="M8 7h8M8 11h8"/>
    </svg>`,
  }
  return icons[id] || icons.general
}

function prettySkillSize(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function keyForProvider(id) {
  return state.providerKeys.find((k) => k.provider === id)
}

function applyEditorFontSize(size) {
  const n = Math.min(20, Math.max(11, Number(size) || 13))
  state.editorFontSize = n
  try {
    localStorage.setItem('soumtok-editor-font', String(n))
  } catch {
    /* ignore */
  }
  if (state.editor) state.editor.updateOptions({ fontSize: n })
}

async function loadAppInfo() {
  try {
    state.appInfo = await api.appInfo()
  } catch {
    state.appInfo = null
  }
}

async function loadPlatformProviders() {
  if (typeof api?.fetchPlatformProviders !== 'function') return
  try {
    const data = await api.fetchPlatformProviders()
    const ids = data?.providers
    if (Array.isArray(ids) && ids.length) state.platformProviders = ids
  } catch {
    /* ignore */
  }
}

/** Signed-in: platform keys + account + BYOK, then model list — no manual Refresh. */
async function syncModelCatalogForSession() {
  if (!state.user) {
    await loadAgentModels()
    return
  }
  await Promise.all([loadPlatformProviders(), loadProviderKeys(), loadAccountSummary()])
  await loadAgentModels()
}

async function loadProviderKeys() {
  state.providerKeysLoading = true
  try {
    const data = await api.listProviderKeys()
    state.providerKeys = data.keys || []
  } catch {
    state.providerKeys = []
  } finally {
    state.providerKeysLoading = false
    refreshModelReadiness()
  }
}

function resetDesktopPreferences() {
  const keys = [
    'soumtok-agent-driver',
    'soumtok-agent-model-fast',
    'soumtok-agent-ctrl-enter',
    'soumtok-default-model',
    'soumtok-disabled-models',
    'soumtok-window-layout',
    'soumtok-editor-font',
    'soumtok-theme',
    AGENT_PREFS_KEY,
  ]
  keys.forEach((k) => {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  })
  state.agentDriver = 'ide'
  state.agentModel = 'auto'
  state.agentModelFast = false
  state.agentCtrlEnter = false
  state.agentPrefs = { ...DEFAULT_AGENT_PREFS }
  state.agentOutbox = []
  state.disabledModels = new Set()
  state.windowLayout = 'agent'
  document.body.classList.remove('agent-off')
  applyEditorFontSize(13)
  applyDesktopTheme('system')
  applyAgentPrefsUi()
  persistAgentDriver('ide')
  renderSettingsScreen()
  if (document.body.classList.contains('mode-project')) renderAgentPanel()
}

function getThemePref() {
  try {
    const stored = localStorage.getItem('soumtok-theme')
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function resolvedTheme(pref = state.themePref || getThemePref()) {
  if (pref === 'light') return 'light'
  if (pref === 'dark') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function monacoThemeId() {
  return resolvedTheme() === 'light' ? 'vs' : 'vs-dark'
}

function applyDesktopTheme(pref) {
  state.themePref = pref === 'light' || pref === 'dark' ? pref : 'system'
  try {
    localStorage.setItem('soumtok-theme', state.themePref)
  } catch {
    /* ignore */
  }
  const resolved = resolvedTheme(state.themePref)
  const root = document.documentElement
  root.dataset.theme = resolved
  root.dataset.themePref = state.themePref
  root.style.colorScheme = resolved
  if (document.body) document.body.style.colorScheme = resolved
  if (window.monaco?.editor?.setTheme) {
    window.monaco.editor.setTheme(monacoThemeId())
  }
  if (state.settingsOpen) renderSettingsScreen()
  if (document.body.classList.contains('mode-project')) {
    renderAgentPanel()
    renderTabs()
    renderSide()
  }
}

function watchDesktopTheme() {
  state.themePref = getThemePref()
  applyDesktopTheme(state.themePref)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePref() === 'system') applyDesktopTheme('system')
  })
}

function formatTokens(n) {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0M$/, 'M')}M`
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1).replace(/\.0K$/, 'K')}K`
  return String(Math.round(v))
}

function loadAgentPrefs() {
  try {
    const raw = localStorage.getItem(AGENT_PREFS_KEY)
    const saved = raw ? JSON.parse(raw) : {}
    state.agentPrefs = { ...DEFAULT_AGENT_PREFS, ...saved }
    if (!saved._harnessV2) {
      state.agentPrefs.runMode = saved.runMode === 'ask' ? 'ask' : 'run-everything'
      state.agentPrefs.autoFormatOnFinish = true
      state.agentPrefs._harnessV2 = true
    }
    if (!saved._prefsV3) {
      state.agentPrefs.localToolsEnabled = true
      state.agentPrefs.mcpConnectors = true
      state.agentPrefs.webSearchTool = true
      state.agentPrefs.webFetchTool = true
      state.agentPrefs.includeOpenFiles = true
      state.agentPrefs.runMode = state.agentPrefs.runMode || 'run-everything'
      state.agentPrefs._prefsV3 = true
    }
    if (!saved._prefsV4) {
      state.agentPrefs.runMode = 'run-everything'
      state.agentPrefs.localToolsEnabled = true
      state.agentPrefs.terminalSandbox = 'permissive'
      state.agentPrefs.fileDeletionProtection = false
      state.agentPrefs._prefsV4 = true
    }
    if (!saved._prefsV5) {
      state.agentPrefs.intelligence = state.agentPrefs.intelligence || 'max'
      state.agentPrefs.thinkFirst = state.agentPrefs.thinkFirst !== false
      state.agentPrefs.browserVerify = state.agentPrefs.browserVerify !== false
      state.agentPrefs.skillsEnabled = state.agentPrefs.skillsEnabled !== false
      state.agentPrefs.codebaseSearch = state.agentPrefs.codebaseSearch !== false
      state.agentPrefs.thirdPartyImports = true
      state.agentPrefs._prefsV5 = true
    }
    applyRunModeLocally(state.agentPrefs.runMode || 'run-everything')
    try {
      localStorage.setItem(AGENT_PREFS_KEY, JSON.stringify(state.agentPrefs))
    } catch {
      /* ignore */
    }
  } catch {
    state.agentPrefs = { ...DEFAULT_AGENT_PREFS }
  }
  applyAgentPrefsUi()
}

function saveAgentPrefs() {
  try {
    localStorage.setItem(AGENT_PREFS_KEY, JSON.stringify(state.agentPrefs))
  } catch {
    /* ignore */
  }
  applyAgentPrefsUi()
}

function applyRunModeLocally(runMode, target = state.agentPrefs) {
  if (!target) return
  if (runMode === 'ask') {
    target.terminalSandbox = 'strict'
    target.fileDeletionProtection = true
    target.workspaceBoundary = true
  } else if (runMode === 'auto-review') {
    target.terminalSandbox = 'standard'
    target.fileDeletionProtection = true
    target.workspaceBoundary = true
  } else {
    target.terminalSandbox = 'permissive'
    target.fileDeletionProtection = false
    target.workspaceBoundary = true
  }
}

function effectiveAgentPrefs() {
  const p = { ...(state.agentPrefs || DEFAULT_AGENT_PREFS) }
  applyRunModeLocally(p.runMode || 'run-everything', p)
  return p
}

function setAgentPref(key, value) {
  if (!state.agentPrefs) loadAgentPrefs()
  if (key === 'intelligence') {
    const intel = value === 'fast' || value === 'balanced' ? value : 'max'
    state.agentPrefs.intelligence = intel
    if (intel === 'fast') {
      state.agentPrefs.thinkFirst = false
      state.agentPrefs.browserVerify = false
      state.agentPrefs.skillsEnabled = false
      state.agentPrefs.codebaseSearch = true
    } else {
      state.agentPrefs.thinkFirst = true
      state.agentPrefs.browserVerify = true
      state.agentPrefs.skillsEnabled = true
      state.agentPrefs.codebaseSearch = true
    }
  } else {
    state.agentPrefs[key] = value
  }
  if (key === 'runMode') applyRunModeLocally(value)
  saveAgentPrefs()
}

function applyAgentPrefsUi() {
  const p = state.agentPrefs || DEFAULT_AGENT_PREFS
  document.body.dataset.agentText = p.agentTextSize || 'default'
  document.body.classList.toggle('agent-code-wrap', Boolean(p.codeBlockWordWrap))
  document.body.classList.toggle('agent-autocomplete-off', !p.agentAutocomplete)
  const intel = $('agent-intel-label')
  if (intel) intel.textContent = agentIntelligenceLabel(p.intelligence)
}

function settingsPrefSwitch(title, desc, prefKey, note) {
  const on = Boolean(state.agentPrefs?.[prefKey])
  const detail = note ? `${desc} <span class="settings-row-note">${escapeHtml(note)}</span>` : desc
  return settingsRow(
    title,
    detail,
    `<button type="button" class="settings-switch ${on ? 'on' : ''}" data-pref="${prefKey}" role="switch" aria-checked="${on}"></button>`,
  )
}

function settingsPrefSelect(title, desc, prefKey, options) {
  const val = state.agentPrefs?.[prefKey] ?? options[0]?.value
  const opts = options
    .map((o) => `<option value="${escapeAttr(o.value)}" ${val === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`)
    .join('')
  return settingsRow(title, desc, `<select class="settings-inline-select" data-pref-select="${prefKey}">${opts}</select>`)
}

function recommendedDisabledSet() {
  const disabled = new Set()
  for (const m of BUILTIN_DESKTOP_MODELS) {
    if (!RECOMMENDED_MODEL_IDS.has(m.id)) disabled.add(m.id)
  }
  return disabled
}

function migrateDisabledModelIds(set) {
  set.delete('composer-2-5')
  set.delete('soumtok-agent')
  return set
}

function loadDisabledModels() {
  try {
    const raw = localStorage.getItem('soumtok-disabled-models')
    const picksVersion = localStorage.getItem('soumtok-model-picks-version')
    if ((!raw || raw === '[]') && picksVersion !== '3') {
      const disabled = recommendedDisabledSet()
      try {
        localStorage.setItem('soumtok-model-picks-version', '3')
        localStorage.setItem('soumtok-disabled-models', JSON.stringify([...disabled]))
      } catch {
        /* ignore */
      }
      return disabled
    }
    if (raw) {
      const arr = JSON.parse(raw)
      const set = migrateDisabledModelIds(new Set(Array.isArray(arr) ? arr : []))
      if (arr.includes('composer-2-5') || arr.includes('soumtok-agent')) {
        try {
          localStorage.setItem('soumtok-disabled-models', JSON.stringify([...set]))
        } catch {
          /* ignore */
        }
      }
      return set
    }
  } catch {
    /* fall through */
  }
  return recommendedDisabledSet()
}

function saveDisabledModels() {
  try {
    localStorage.setItem('soumtok-disabled-models', JSON.stringify([...state.disabledModels]))
  } catch {
    /* ignore */
  }
}

function isModelEnabledInPicker(id) {
  if (id === 'auto') return true
  return !state.disabledModels.has(id)
}

function toggleModelEnabled(id, on) {
  if (id === 'auto') return
  if (on) state.disabledModels.delete(id)
  else state.disabledModels.add(id)
  saveDisabledModels()
  refreshModelPickerList()
}

async function ensureLanguageHostRunning() {
  try {
    await api.extensionHostStart?.({
      usePlatformWorkspace: !state.folder,
      workspace: state.folder || undefined,
    })
  } catch {
    /* host starts on demand when an app panel opens */
  }
}

async function activateInstalledExtensionsQuiet(options = {}) {
  try {
    await refreshExtensionActivityBar()
    await ensureLanguageHostRunning()
    const pub = options.publisher
    const name = options.name
    if (pub && name) {
      const item = findExtensionActivityItem(extensionId(pub, name))
      if (item) return
    }
  } catch {
    /* ignore */
  }
}

async function openInstalledExtensionInHost(publisher, name) {
  await refreshExtensionActivityBar()
  const item = findExtensionActivityItem(extensionId(publisher, name))
  if (!item) return false
  state.side = extensionSideId(item.extensionId)
  document.querySelectorAll('#activity .act').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.side === state.side)
  })
  await openExtensionHostEditor(item)
  return true
}

function extensionSideId(extensionId) {
  return `ext:${extensionId}`
}

function extensionIdFromSide(side) {
  return String(side || '').startsWith('ext:') ? side.slice(4) : ''
}

function findExtensionActivityItem(extId) {
  const id = String(extId || '').toLowerCase()
  return state.extensionActivity.find((x) => String(x.extensionId || '').toLowerCase() === id) || null
}

const EXT_HOST_TAB_PATH = 'soumtok-code-host:main'
let extHostStopTimer = null
let extHostLayoutTimer = null

function cancelExtensionHostIdleStop() {
  if (extHostStopTimer) {
    clearTimeout(extHostStopTimer)
    extHostStopTimer = null
  }
}

function scheduleExtensionHostIdleStop() {
  if (shouldKeepExtensionHost()) return
  cancelExtensionHostIdleStop()
  extHostStopTimer = setTimeout(() => {
    extHostStopTimer = null
    if (extensionHostViewActive()) return
    if (extensionDockOpen()) return
    void (async () => {
      try {
        await api.extensionHostStop?.()
        const dock = state.extDock
        if (dock) {
          dock.url = ''
          dock.embeddedUrl = ''
          dock.loading = false
        }
      } catch {
        /* ignore */
      }
    })()
  }, 2000)
}

function triggerExtensionOpenCommand() {
  /* Claude open is handled in main process (extensionHostCommand.js) — no IPC spam here */
}

async function refreshExtensionActivityBar() {
  try {
    const res = await api.extensionsInstalled?.()
    if (res?.ok && Array.isArray(res.extensions)) {
      state.installedExtById = new Map(
        res.extensions.map((e) => [extensionId(e.publisher, e.name), { ...e, installPath: e.path }]),
      )
      state.installedExtCacheAt = Date.now()
    }
  } catch {
    /* ignore */
  }
  const anchor = document.querySelector('#activity .act-spacer')
  if (!anchor) return
  document.querySelectorAll('#activity .act-ext').forEach((el) => el.remove())
  let items = []
  try {
    if (typeof api.extensionsActivityBar === 'function') {
      const res = await api.extensionsActivityBar()
      if (res?.ok) items = res.items || []
    }
  } catch {
    items = []
  }
  state.extensionActivity = items
  for (const item of items) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'act act-ext'
    btn.dataset.side = extensionSideId(item.extensionId)
    btn.dataset.extId = item.extensionId
    btn.title = item.title || item.displayName || item.extensionId
    if (item.iconUrl) {
      const mono = platformIconNeedsMono(item.iconUrl) ? ' act-ext-icon-mono' : ''
      btn.innerHTML = `<span class="act-ext-icon-wrap"><img class="act-ext-icon${mono}" src="${escapeAttr(item.iconUrl)}" alt="" referrerpolicy="no-referrer" decoding="async" /></span>`
    } else {
      btn.innerHTML = `<span class="act-ext-letter" aria-hidden="true">${escapeHtml((item.title || '?').charAt(0))}</span>`
    }
    anchor.parentElement.insertBefore(btn, anchor)
  }
  syncActivityRailHighlight()
}

function syncActivityRailHighlight() {
  document.querySelectorAll('#activity .act').forEach((btn) => {
    const side = btn.dataset.side
    if (side === 'test-hub') btn.classList.toggle('on', state.side === 'test-hub' && !state.settingsOpen)
    else btn.classList.toggle('on', state.side === side && !state.settingsOpen)
  })
}

function isExtensionHostTab(tab) {
  return tab?.kind === 'extension-host' || String(tab?.path || '').startsWith('soumtok-code-host:')
}

/**
 * Extensions live in a dock beside Soumtok's editor, the way Cursor keeps Claude in a side panel.
 * The embedded workbench itself is chrome-less, so the dock shows the extension's own UI only.
 */
let extDockReadyTimer = null

function extensionDockState() {
  if (!state.extDock) {
    state.extDock = {
      item: null,
      url: '',
      loading: false,
      booting: false,
      uiReady: false,
      error: '',
      embeddedUrl: '',
      progress: '',
    }
  }
  return state.extDock
}

function clearExtensionDockReadyTimer() {
  if (extDockReadyTimer) {
    clearTimeout(extDockReadyTimer)
    extDockReadyTimer = null
  }
}

function extensionDockLabel(item) {
  const raw = String(item?.displayName || item?.title || '').trim()
  if (!raw || /^%[\w.-]+%$/.test(raw)) return item?.name || 'Extension'
  return raw
}

function extensionDockLoaderLabel() {
  const dock = extensionDockState()
  if (dock.progress) return dock.progress
  const name = extensionDockLabel(dock.item)
  return dock.loading ? `Starting ${name}…` : `Loading ${name}…`
}

function mountExtensionDockLoader() {
  const loader = $('ext-dock-loader')
  const msg = $('ext-dock-loader-msg')
  const body = $('ext-dock-body')
  if (!loader) return
  document.body.classList.add('extdock-booting')
  if (body) body.classList.remove('ext-dock-embedded')
  if (msg) msg.textContent = extensionDockLoaderLabel()
  loader.removeAttribute('hidden')
  const host = $('ext-dock-avatar-host')
  if (host && window.SoumtokAgentAvatar?.mountExtensionDock) {
    window.SoumtokAgentAvatar.mountExtensionDock(host, { size: 88 })
    window.SoumtokAgentAvatar.setExtensionDockState('thinking')
  }
}

function unmountExtensionDockLoader() {
  document.body.classList.remove('extdock-booting')
  const loader = $('ext-dock-loader')
  if (loader) loader.setAttribute('hidden', '')
  window.SoumtokAgentAvatar?.destroyExtensionDock?.()
}

function markExtensionDockUiReady() {
  const dock = extensionDockState()
  if (dock.uiReady) {
    void syncExtensionHostViewBoundsNow()
    return
  }
  dock.uiReady = true
  dock.booting = false
  clearExtensionDockReadyTimer()
  unmountExtensionDockLoader()
  const body = $('ext-dock-body')
  if (body) {
    body.classList.add('ext-dock-embedded')
    body.innerHTML = ''
  }
  void syncExtensionHostViewBoundsNow()
  requestAnimationFrame(() => void syncExtensionHostViewBoundsNow())
  setTimeout(() => void syncExtensionHostViewBoundsNow(), 280)
  setTimeout(() => void syncExtensionHostViewBoundsNow(), 900)
}

function scheduleExtensionDockReadyFallback(ms = 45_000) {
  clearExtensionDockReadyTimer()
  extDockReadyTimer = setTimeout(() => {
    extDockReadyTimer = null
    const dock = extensionDockState()
    if (!extensionDockOpen() || !dock.booting) return
    dock.error = `Could not open ${extensionDockLabel(dock.item)}. Close the panel and open it again.`
    dock.booting = false
    dock.embeddedUrl = ''
    paintExtensionDock()
  }, ms)
}

function extensionDockOpen() {
  return document.body.classList.contains('extdock-on')
}

function serializeExtDockItem(item) {
  if (!item) return null
  const extensionId = item.extensionId || item.id
  if (!extensionId) return null
  return {
    extensionId,
    publisher: item.publisher || '',
    name: item.name || '',
    displayName: item.displayName || item.title || '',
    title: item.title || item.displayName || '',
    openCommand: item.openCommand || '',
    embedSurface: item.embedSurface || '',
    containerId: item.containerId || '',
  }
}

function persistExtDock() {
  try {
    const payload = extensionDockOpen() ? serializeExtDockItem(state.extDock?.item) : null
    if (!payload) localStorage.removeItem(EXT_DOCK_KEY)
    else localStorage.setItem(EXT_DOCK_KEY, JSON.stringify(payload))
  } catch {
    /* private mode */
  }
}

function readPersistedExtDock() {
  try {
    const raw = localStorage.getItem(EXT_DOCK_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

async function restoreExtDock(saved = readPersistedExtDock()) {
  const item = saved?.item || saved
  if (!item?.extensionId) return
  cancelExtensionHostIdleStop()
  await refreshExtensionActivityBar()
  const live = findExtensionActivityItem(item.extensionId)
  await openExtensionHostEditor(live || item)
}

async function openExtensionHostEditor(item) {
  if (!item) return
  const nextId = item.extensionId || item.id
  if (extensionDockOpen() && state.extDock?.item?.extensionId === nextId && state.extDock?.uiReady && !state.extDock?.error) {
    persistExtDock()
    void syncExtensionHostViewBoundsNow()
    return
  }
  cancelExtensionHostIdleStop()
  enterWorkbench({ allowNoFolder: true })
  const dock = extensionDockState()
  const label = extensionDockLabel(item)
  dock.item = item || dock.item
  dock.error = ''
  dock.progress = ''
  dock.uiReady = false
  dock.booting = false
  document.body.classList.add('extdock-on')
  persistExtDock()
  applyLayout()

  const startPayload = {
    usePlatformWorkspace: !state.folder,
    workspace: state.folder || undefined,
    publisher: item?.publisher,
    name: item?.name,
    extensionId: item?.extensionId || item?.id,
    openCommand: item?.openCommand || '',
    embedSurface: item?.embedSurface || '',
    containerId: item?.containerId || '',
  }

  dock.loading = true
  dock.url = dock.url || ''
  dock.embeddedUrl = ''
  dock.uiReady = false
  paintExtensionDock()
  try {
    const out = await api.extensionHostStart?.(startPayload)
    if (!out?.ok) {
      dock.loading = false
      dock.progress = ''
      dock.error = out?.error || `Could not open ${label}`
      paintExtensionDock()
      appendPanelOutput(`[extensions] ${dock.error}\n`)
      return
    }
    dock.url = out.url
    dock.loading = false
    dock.progress = ''
    dock.booting = true
    dock.embeddedUrl = ''
    paintExtensionDock()
  } catch (err) {
    dock.loading = false
    dock.progress = ''
    dock.error = err?.message || `Could not open ${label}`
    paintExtensionDock()
    appendPanelOutput(`[extensions] ${dock.error}\n`)
  }
}

function paintExtensionDock() {
  const dock = extensionDockState()
  const body = $('ext-dock-body')
  const title = $('ext-dock-title')
  if (!body || !title) return
  title.textContent = extensionDockLabel(dock.item)
  if (dock.error) {
    clearExtensionDockReadyTimer()
    unmountExtensionDockLoader()
    body.classList.remove('ext-dock-embedded')
    dock.embeddedUrl = ''
    dock.booting = false
    dock.uiReady = false
    void hideExtensionHostViewIfNeeded()
    body.innerHTML = `<div class="ext-dock-error"><pre class="ext-dock-error-msg">${escapeHtml(dock.error)}</pre><button type="button" class="ext-activity-open" id="ext-dock-retry">Retry</button></div>`
    $('ext-dock-retry')?.addEventListener('click', () => void openExtensionHostEditor(dock.item))
    return
  }
  if (dock.loading || dock.booting) {
    mountExtensionDockLoader()
  }
  if (dock.loading || !dock.url) {
    void hideExtensionHostViewIfNeeded()
    return
  }
  if (dock.embeddedUrl === dock.url) {
    void syncExtensionHostViewBounds()
    return
  }
  dock.embeddedUrl = dock.url
  scheduleExtensionDockReadyFallback()
  void (async () => {
    const embed = await api.extensionHostEmbed?.({
      url: dock.url,
      extensionId: dock.item?.extensionId,
      openCommand: dock.item?.openCommand,
      title: dock.item?.displayName || dock.item?.title,
      embedSurface: dock.item?.embedSurface,
      containerId: dock.item?.containerId,
    })
    if (!embed?.ok) {
      dock.embeddedUrl = ''
      dock.booting = false
      dock.error = embed?.error || 'Could not show extension panel'
      paintExtensionDock()
      return
    }
    void syncExtensionHostViewBoundsNow()
  })()
}

function closeExtensionDock() {
  document.body.classList.remove('extdock-on')
  persistExtDock()
  clearExtensionDockReadyTimer()
  unmountExtensionDockLoader()
  const dock = extensionDockState()
  dock.embeddedUrl = ''
  dock.booting = false
  dock.uiReady = false
  applyLayout()
  void hideExtensionHostViewIfNeeded()
  scheduleExtensionHostIdleStop()
}

async function openExtensionInHost(item) {
  if (!item) return
  await openExtensionHostEditor(item)
}

function extensionHostEmbedActive() {
  const dock = state.extDock
  return Boolean(extensionDockOpen() && dock?.url && !dock.loading && !dock.error)
}

function extensionHostViewActive() {
  const dock = state.extDock
  return Boolean(extensionHostEmbedActive() && dock?.uiReady)
}

function shouldKeepExtensionHost() {
  if (extensionDockOpen() || extensionDockState().booting) return true
  return Boolean(readPersistedExtDock()?.extensionId)
}

async function hideExtensionHostViewIfNeeded() {
  if (shouldKeepExtensionHost()) return
  try {
    await api.extensionHostHide?.()
  } catch {
    /* ignore */
  }
}

async function syncExtensionHostViewBoundsNow() {
  if (!extensionHostEmbedActive()) {
    if (shouldKeepExtensionHost()) return
    await hideExtensionHostViewIfNeeded()
    scheduleExtensionHostIdleStop()
    return
  }
  cancelExtensionHostIdleStop()
  const body = $('ext-dock-body')
  if (!body || typeof api.extensionHostLayout !== 'function') return
  if (!extensionHostViewActive()) {
    const r = body.getBoundingClientRect()
    await api.extensionHostLayout({
      x: -4800,
      y: 0,
      width: Math.max(480, Math.round(r.width) || 480),
      height: Math.max(720, Math.round(r.height) || 720),
    })
    return
  }
  const r = body.getBoundingClientRect()
  await api.extensionHostLayout({
    x: r.left,
    y: r.top,
    width: r.width,
    height: r.height,
  })
}

function syncExtensionHostViewBounds() {
  if (extHostLayoutTimer) return
  extHostLayoutTimer = setTimeout(() => {
    extHostLayoutTimer = null
    void syncExtensionHostViewBoundsNow()
  }, 64)
}

function paintExtensionContributionSide(extensionId) {
  const item = state.extensionActivity.find((x) => x.extensionId === extensionId)
  const root = $('sidebar')
  if (!item) {
    root.innerHTML =
      '<div class="side-section"><div class="side-body"><p class="git-scm-muted">Extension view unavailable. Reopen Extensions or restart Soumtok.</p></div></div>'
    return
  }
  const icon = item.iconUrl
    ? (() => {
        const mono = platformIconNeedsMono(item.iconUrl) ? ' act-ext-icon-mono' : ''
        return `<span class="act-ext-icon-wrap act-ext-icon-wrap-lg"><img class="ext-activity-hero-icon${mono}" src="${escapeAttr(item.iconUrl)}" alt="" referrerpolicy="no-referrer" decoding="async" /></span>`
      })()
    : ''
  root.innerHTML = `<div class="side-section ext-activity-section">
    <div class="side-section-head">
      <span class="side-section-title">${escapeHtml(item.title || item.displayName)}</span>
    </div>
    <div class="side-body ext-activity-body">
      <div class="ext-activity-hero">${icon}<div>
        <strong>${escapeHtml(item.displayName || item.title)}</strong>
        <p class="git-scm-muted ext-activity-lead">Opens inside Soumtok Code — same extensions you installed from the marketplace. Sign in and use the full extension UI here.</p>
      </div></div>
      <button type="button" class="ext-activity-open" id="ext-activity-open">Open in Soumtok Code</button>
      <button type="button" class="ext-activity-market" id="ext-activity-market">Extension details</button>
      <p class="git-scm-muted ext-activity-tip">Inside the panel, click this extension’s activity bar icon (same logo) to sign in.</p>
    </div>
  </div>`
  $('ext-activity-open').onclick = () => void openExtensionInHost(item)
  $('ext-activity-market').onclick = () => {
    void openExtensionDetail({
      publisher: item.publisher,
      name: item.name,
      displayName: item.displayName || item.title,
    })
  }
}

async function runExtensionHost() {
  if (!requireUser()) return
  await openExtensionHostEditor(state.extensionActivity[0] || null)
}

const AUTO_SAVE_KEY = 'soumtok-auto-save'
let autoSaveTimer = null

function isAutoSaveOn() {
  try {
    return localStorage.getItem(AUTO_SAVE_KEY) === '1'
  } catch {
    return false
  }
}

function setAutoSaveOn(on) {
  try {
    localStorage.setItem(AUTO_SAVE_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
  renderFileMenu()
}

function scheduleAutoSaveIfEnabled() {
  if (!isAutoSaveOn()) return
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null
    void saveActive()
  }, 700)
}

function workspaceFolderPaths() {
  const primary = state.folder ? [state.folder] : []
  const extras = (state.workspaceExtraFolders || []).filter(
    (p) => p && !primary.some((x) => workspacePathsEqual(x, p)),
  )
  return [...primary, ...extras]
}

const COMMANDS = [
  { id: 'folder', label: 'Open Folder', run: openFolder },
  { id: 'clone', label: 'Clone Repository', run: cloneRepo },
  { id: 'new-text-file', label: 'New Text File', run: newTextFile },
  { id: 'new-file', label: 'New File', run: createFile },
  { id: 'open-file', label: 'Open File', run: openFileFromDialog },
  { id: 'open-workspace', label: 'Open Workspace from File', run: openWorkspaceFromFile },
  { id: 'add-folder-workspace', label: 'Add Folder to Workspace', run: addFolderToWorkspace },
  { id: 'save-workspace-as', label: 'Save Workspace As', run: saveWorkspaceAsFile },
  { id: 'duplicate-workspace', label: 'Duplicate Workspace', run: duplicateWorkspaceFile },
  { id: 'save-as', label: 'Save As', run: saveActiveAs },
  { id: 'save-all', label: 'Save All', run: saveAllDirty },
  { id: 'auto-save', label: 'Auto Save', run: toggleAutoSave },
  { id: 'preferences', label: 'Preferences', run: () => toggleSettings() },
  { id: 'revert-file', label: 'Revert File', run: revertActiveFile },
  { id: 'close-editor', label: 'Close Editor', run: () => closeActiveEditorTab() },
  { id: 'close-folder', label: 'Close Folder', run: closeProjectFolder },
  { id: 'close-window', label: 'Close Window', run: () => api.window('close') },
  { id: 'exit', label: 'Exit', run: () => api.quitApp?.() },
  { id: 'switch-agents', label: 'Switch to Agents Window', run: switchToAgentsWindow },
  { id: 'new-window-signed', label: 'New Window (signed in)', run: () => api.newWindow() },
  { id: 'share-copy-path', label: 'Copy Path', run: shareCopyProjectPath },
  { id: 'share-reveal', label: 'Reveal in File Explorer', run: shareRevealProjectFolder },
  { id: 'new-folder', label: 'New Folder', run: () => explorerNewFolder() },
  { id: 'refresh-explorer', label: 'Refresh Explorer', run: () => refreshTree() },
  { id: 'save', label: 'Save File', run: saveActive },
  { id: 'new-window', label: 'New Window', run: () => api.newWindow() },
  { id: 'agent', label: 'Open Agent', run: openAgentsWindow },
  { id: 'files', label: 'Explorer', run: () => showSide('files') },
  { id: 'extensions', label: 'Extensions', run: () => showSide('extensions') },
  { id: 'connectors', label: 'Connectors', run: () => showSide('connectors') },
  { id: 'test-hub', label: 'Test Hub', run: () => showSide('test-hub') },
  {
    id: 'ext-host',
    label: 'Run Extensions in Code Host',
    run: () => runExtensionHost(),
  },
  {
    id: 'inline-edit',
    label: 'Inline Edit (Ctrl+K)',
    run: () => {
      const host = $('editor')
      if (host && window.SoumtokEditorAi) window.SoumtokEditorAi.openInlineEdit(host)
    },
  },
  { id: 'terminal', label: 'Toggle Terminal', run: togglePanel },
  { id: 'open-terminal', label: 'Open Terminal', run: () => openTerminalPanel(false) },
  { id: 'new-terminal', label: 'New Terminal', run: () => openTerminalPanel(true) },
  { id: 'split-terminal', label: 'Split Terminal', run: () => {} },
  {
    id: 'run-task',
    label: 'Run Task…',
    run: () => {
      appendPanelOutput('Use the Agent panel — the model can call the task() tool (explore / generalPurpose subagents).\n')
    },
  },
  { id: 'run-build-task', label: 'Run Build Task', run: runBuildTask },
  { id: 'run-active-file', label: 'Run Active File', run: runActiveFile },
  { id: 'run-selected-text', label: 'Run Selected Text', run: runSelectedText },
  { id: 'configure-tasks', label: 'Configure Tasks…', run: () => appendPanelOutput('Add a tasks.json in your project to configure tasks.\n') },
  { id: 'configure-build-task', label: 'Configure Default Build Task…', run: () => appendPanelOutput('Set default build task in .vscode/tasks.json.\n') },
  { id: 'login', label: 'Sign in', run: () => login('in') },
  { id: 'account', label: 'Account & Settings', run: toggleSettings },
  { id: 'billing', label: 'Billing', run: () => api.openBilling() },
  { id: 'docs', label: 'Documentation', run: () => api.openHelp() },
  { id: 'bug-report', label: 'Report a bug', run: () => openBugReport() },
  { id: 'palette', label: 'Command Palette', run: openPalette },
  { id: 'layout', label: 'Toggle Sidebar', run: toggleSidebar },
  { id: 'back', label: 'Back', run: goBack },
  { id: 'forward', label: 'Forward', run: goForward },
  { id: 'go-last-edit', label: 'Last Edit Location', run: goLastEditLocation },
  { id: 'go-next-editor', label: 'Next Editor', run: () => switchEditorTab(1) },
  { id: 'go-prev-editor', label: 'Previous Editor', run: () => switchEditorTab(-1) },
  { id: 'go-to-file', label: 'Go to File…', run: openQuickOpen },
  { id: 'go-symbol-editor', label: 'Go to Symbol in Editor…', run: () => runMonacoGoAction('editor.action.quickOutline') },
  { id: 'go-to-line', label: 'Go to Line/Column…', run: () => void goToLineFromStatus() },
  { id: 'go-to-bracket', label: 'Go to Bracket', run: () => runMonacoGoAction('editor.action.jumpToBracket') },
  { id: 'go-next-problem', label: 'Next Problem', run: () => runMonacoGoAction('editor.action.marker.next') },
  { id: 'go-prev-problem', label: 'Previous Problem', run: () => runMonacoGoAction('editor.action.marker.prev') },
  { id: 'edit-undo', label: 'Undo', run: () => runMonacoAction('editor.action.undo') },
  { id: 'edit-redo', label: 'Redo', run: () => runMonacoAction('editor.action.redo') },
  { id: 'edit-cut', label: 'Cut', run: () => runMonacoAction('editor.action.clipboardCutAction') },
  { id: 'edit-copy', label: 'Copy', run: () => runMonacoAction('editor.action.clipboardCopyAction') },
  { id: 'edit-paste', label: 'Paste', run: () => runMonacoAction('editor.action.clipboardPasteAction') },
  { id: 'edit-find', label: 'Find', run: () => runMonacoAction('actions.find') },
  { id: 'edit-replace', label: 'Replace', run: () => runMonacoAction('editor.action.startFindReplaceAction') },
  { id: 'edit-find-files', label: 'Find in Files', run: () => openFindInFiles() },
  { id: 'edit-replace-files', label: 'Replace in Files', run: () => openReplaceInFiles() },
  { id: 'edit-line-comment', label: 'Toggle Line Comment', run: () => runMonacoAction('editor.action.commentLine') },
  { id: 'edit-block-comment', label: 'Toggle Block Comment', run: () => runMonacoAction('editor.action.blockComment') },
  { id: 'select-all', label: 'Select All', run: selectAll },
]

let recentsLimit = 5
let panelMaxBefore = null
let promptResolver = null
let loginPollTimer = null
let offAgentEvent = null
const agentEventCursor = new Map()
let pendingLoginId = ''
let tabHistory = []
let historyAt = -1
let lastEditLocation = null
let paletteMode = 'command'
let palettePick = 0
let quickOpenHits = []
let workspaceSearchUi = { showReplace: false, query: '', replace: '' }
let workspaceSearchTimer = null
let errors = 0
let warnings = 0
let workspaceSaveTimer = null
let agentReadDecorations = []
let agentScanTimer = null
let agentScanGen = 0

function $(id) {
  return document.getElementById(id)
}

function normPath(p) {
  return String(p || '').replace(/\\/g, '/')
}

function sameFilePath(a, b) {
  return normPath(a) === normPath(b)
}

function dedupeTabs() {
  const seen = new Map()
  const next = []
  for (const tab of state.tabs) {
    const key = normPath(tab.path)
    const existing = seen.get(key)
    if (existing) {
      if (state.active && sameFilePath(state.active, tab.path)) state.active = existing.path
      if (!state.dirty.get(existing.path) && tab.text != null) existing.text = tab.text
      continue
    }
    seen.set(key, tab)
    next.push(tab)
  }
  state.tabs = next
  if (state.active && !state.tabs.some((t) => sameFilePath(t.path, state.active))) {
    state.active = state.tabs[0]?.path || null
  }
}

function ancestorDirs(filePath) {
  const root = normPath(state.folder)
  const norm = normPath(filePath)
  if (!root || !norm.startsWith(root)) return []
  const dirs = new Set()
  let cur = norm.slice(0, norm.lastIndexOf('/'))
  while (cur.length > root.length) {
    dirs.add(cur)
    dirs.add(cur.replace(/\//g, '\\'))
    cur = cur.slice(0, cur.lastIndexOf('/'))
  }
  return [...dirs]
}

function joinWorkspacePath(relOrAbs) {
  const raw = String(relOrAbs || '').trim()
  if (!raw || raw === '.') return state.folder
  if (/^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith('\\\\')) return raw
  if (!state.folder) return raw.replace(/\//g, '\\')
  const sep = state.folder.includes('\\') ? '\\' : '/'
  const rel = raw.replace(/^[/\\]+/, '').replace(/\//g, sep)
  return `${state.folder.replace(/[/\\]$/, '')}${sep}${rel}`
}

function fileNameFromPath(p) {
  return String(p || '').split(/[/\\]/).pop() || String(p || '')
}

function parseReadToolText(text) {
  const s = String(text || '')
  const m = s.match(/^([^\n]+?) \(\d+ lines\)\n([\s\S]*)$/)
  if (m) return { rel: m[1].trim(), body: m[2] }
  const nl = s.indexOf('\n')
  if (nl >= 0 && /^\S+ \(\d+ lines\)$/.test(s.slice(0, nl))) {
    return { rel: s.slice(0, nl).replace(/\s*\(\d+ lines\)$/, '').trim(), body: s.slice(nl + 1) }
  }
  return { rel: '', body: s }
}

function isTerminalToolName(name) {
  const n = String(name || '').toLowerCase()
  return n === 'terminal' || n === 'shell'
}

function agentToolLiveLabel(name, args, phase) {
  const n = String(name || '').toLowerCase()
  const a = args || {}
  const p = a.path || a.file || a.dir || ''
  if (n === 'read' || n === 'read_file') {
    const f = p || 'file'
    return phase === 'done' ? `Opened ${f}` : `Opening ${f}…`
  }
  if (n === 'list_dir' || n === 'list') {
    const d = p || '.'
    return phase === 'done' ? `Listed ${d}` : `Listing ${d}…`
  }
  if (n === 'grep') {
    const q = a.pattern || a.query || 'pattern'
    return phase === 'done' ? `Searched for “${q}”` : `Searching for “${q}”…`
  }
  if (n === 'codebase_search') {
    const q = a.query || a.pattern || 'code'
    return phase === 'done' ? `Found “${q}”` : `Searching “${q}”…`
  }
  if (n === 'git') {
    const a0 = a.action || 'status'
    return phase === 'done' ? `Git ${a0}` : `Git ${a0}…`
  }
  if (n === 'browser' || n === 'screenshot') {
    return phase === 'done' ? 'Saw the page' : 'Opening the page…'
  }
  if (n === 'write' || n === 'diff' || n === 'edit') {
    const f = p || 'file'
    return phase === 'done' ? `Updated ${f}` : `Editing ${f}…`
  }
  if (n === 'terminal' || n === 'shell') {
    const c = String(a.command || a.cmd || 'command').slice(0, 48)
    return phase === 'done' ? `Ran ${c}` : `Running ${c}…`
  }
  if (n === 'generate_image') {
    const ratio = String(a.aspect || a.aspect_ratio || a.ratio || '1:1').trim() || '1:1'
    return phase === 'done' ? `Still · ${ratio}` : `Generating still · ${ratio}`
  }
  return phase === 'done' ? `Done: ${name}` : `${name}…`
}

function ensureAgentLayoutForPreview() {
  if (!state.agentPreviewEditors) return
  enterWorkbench()
  if (state.windowLayout === 'agent') document.body.classList.remove('agent-off')
}

function updateAgentEditorTrack() {
  const bar = $('agent-editor-track')
  if (!bar) return
  const live = state.agentLiveFile
  const show = Boolean(state.agentBusy && live && state.agentPreviewEditors)
  bar.hidden = !show
  document.body.classList.toggle('agent-editor-live', show)
  if (!show) return
  const action = $('agent-track-action')
  const fileEl = $('agent-track-file')
  const lineEl = $('agent-track-line')
  if (action) action.textContent = live.action || 'Reading'
  if (fileEl) fileEl.textContent = live.rel || fileNameFromPath(live.path)
  if (lineEl) {
    lineEl.textContent =
      live.line && live.lineTotal ? `Line ${live.line} / ${live.lineTotal}` : live.detail || ''
  }
}

function clearAgentReadVisuals() {
  agentScanGen += 1
  if (agentScanTimer) {
    clearTimeout(agentScanTimer)
    agentScanTimer = null
  }
  if (state.editor && window.monaco) {
    agentReadDecorations = state.editor.deltaDecorations(agentReadDecorations, [])
  }
  state.agentLiveFile = null
  document.body.classList.remove('agent-reading-file')
  document.querySelectorAll('#tabs .file-tab.agent-reading').forEach((el) => el.classList.remove('agent-reading'))
  window.SoumtokAgentAvatar?.clearAgentPanelGazeLock?.()
  updateAgentEditorTrack()
}

function setAgentReadDecorations(upToLine) {
  if (!state.editor || !window.monaco) return
  const model = state.editor.getModel()
  if (!model) return
  const line = Math.max(1, Math.min(upToLine, model.getLineCount()))
  const monaco = window.monaco
  agentReadDecorations = state.editor.deltaDecorations(agentReadDecorations, [
    {
      range: new monaco.Range(1, 1, line, model.getLineMaxColumn(line)),
      options: { isWholeLine: true, className: 'agent-read-scanned' },
    },
    {
      range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)),
      options: { isWholeLine: true, className: 'agent-read-cursor-line' },
    },
  ])
}

function animateAgentReadScan() {
  if (!state.agentPreviewEditors || !state.editor || !window.monaco) return
  const model = state.editor.getModel()
  if (!model) return
  const total = model.getLineCount()
  const cap = Math.min(total, 200)
  let line = 1
  agentScanGen += 1
  const gen = agentScanGen
  const stepMs = Math.max(16, Math.min(48, Math.floor(2800 / Math.max(cap, 8))))

  const tick = () => {
    if (gen !== agentScanGen || !state.agentBusy) return
    setAgentReadDecorations(line)
    state.editor.revealLineInCenterIfOutsideViewport(line)
    if (state.agentLiveFile) {
      state.agentLiveFile.line = line
      state.agentLiveFile.lineTotal = total
      state.agentLiveFile.detail = `Scanning line ${line} of ${total}`
      updateAgentEditorTrack()
    }
    const gazeY = total > 1 ? -0.35 + (line / total) * 0.55 : 0
    window.SoumtokAgentAvatar?.setAgentPanelGaze?.(0.42, gazeY)
    line += line < cap ? 1 : Math.max(1, Math.ceil((total - line) / 12))
    if (line <= total && state.agentBusy) {
      agentScanTimer = setTimeout(tick, stepMs)
    }
  }
  tick()
}

async function loadImageTab(tab) {
  tab.kind = 'image'
  tab.text = ''
  try {
    const media = await api.readFileMedia?.(tab.path)
    if (media?.dataUrl) {
      tab.dataUrl = media.dataUrl
      tab.mediaSize = media.size
      tab.mediaError = ''
    } else {
      tab.dataUrl = ''
      tab.mediaError = media?.error || 'Could not open image'
    }
  } catch (err) {
    tab.dataUrl = ''
    tab.mediaError = String(err?.message || err || 'Could not open image')
  }
  return tab
}

async function revealAgentFile(relPath, opts = {}) {
  if (!state.agentPreviewEditors || !relPath) return
  ensureAgentLayoutForPreview()
  const rel = String(relPath).replace(/^[/\\]+/, '')
  const full = joinWorkspacePath(rel)
  const name = fileNameFromPath(full)
  const fullNorm = normPath(full)
  if (isImageFileName(name)) {
    let tab = state.tabs.find((t) => normPath(t.path) === fullNorm)
    if (!tab) {
      tab = { path: full, name, kind: 'image', text: '', agentPeek: true }
      state.tabs.push(tab)
    }
    tab.agentPeek = true
    await loadImageTab(tab)
    state.active = tab.path
    for (const d of ancestorDirs(full)) state.expandedDirs.add(d)
    renderTabs()
    renderEditor()
    return
  }
  await ensureMonacoReady()
  let body = opts.body
  if (body == null) {
    try {
      body = await api.readFile(full)
    } catch {
      return
    }
  }
  let tab = state.tabs.find((t) => normPath(t.path) === fullNorm)
  if (!tab) {
    tab = { path: full, name, text: body, agentPeek: true }
    state.tabs.push(tab)
  } else {
    tab.name = name
    if (!state.dirty.get(full) && !state.dirty.get(fullNorm)) tab.text = body
    tab.agentPeek = true
  }
  state.active = tab.path
  state.agentLiveFile = {
    path: full,
    rel,
    action: opts.action || 'Reading',
    line: 0,
    lineTotal: 0,
    detail: opts.detail || '',
  }
  for (const d of ancestorDirs(full)) state.expandedDirs.add(d)
  renderTabs()
  renderEditor()
  syncExplorerSelection()
  requestAnimationFrame(() => {
    document.querySelector('#tree .tree-row.tree-file.on')?.scrollIntoView({ block: 'nearest' })
    if (opts.scan !== false) animateAgentReadScan()
  })
  updateAgentEditorTrack()
  layoutEditor()
}

function agentFollowToolStart(name, args) {
  const n = String(name || '').toLowerCase()
  const a = args || {}
  if (isTerminalToolName(n)) {
    state.agentTerminalLive = String(a.command || a.cmd || '').trim()
  }
  if (!state.agentPreviewEditors) return
  const label = agentToolLiveLabel(name, a, 'start')
  if (n === 'read' || n === 'read_file') {
    const rel = a.path || a.file
    setAgentAvatarState('working')
    document.body.classList.add('agent-reading-file')
    if (rel) void revealAgentFile(rel, { action: 'Opening', detail: label, scan: false })
    return
  }
  if (n === 'write' || n === 'diff' || n === 'edit') {
    const rel = a.path || a.file
    if (rel) {
      const full = joinWorkspacePath(rel)
      const tab = state.tabs.find((t) => sameFilePath(t.path, full))
      if (tab && tab.text != null) tab.beforeAgentEdit = tab.text
      void revealAgentFile(rel, { action: 'Editing', detail: label, scan: false })
    }
    return
  }
  if (n === 'list_dir' || n === 'list') {
    const rel = a.path || a.dir || '.'
    state.agentLiveFile = {
      path: joinWorkspacePath(rel),
      rel: rel === '.' ? state.folder : rel,
      action: 'Listing',
      detail: label,
    }
    updateAgentEditorTrack()
    if (state.side === 'files') renderSide()
    return
  }
  state.agentLiveFile = {
    path: state.active,
    rel: '',
    action: agentToolStepLabel(name, a).label,
    detail: label,
  }
  updateAgentEditorTrack()
}

function agentFollowToolResult(name, ok, text, pathHint) {
  if (isTerminalToolName(name)) {
    state.agentTerminalLive = ''
  }
  if (!state.agentPreviewEditors) return
  const n = String(name || '').toLowerCase()
  if (n === 'read' || n === 'read_file') {
    if (!ok) return
    const parsed = parseReadToolText(text)
    const rel = parsed.rel || pathHint || ''
    if (!rel) return
    void revealAgentFile(rel, {
      body: parsed.body,
      action: 'Reading',
      detail: agentToolLiveLabel(name, { path: rel }, 'done'),
      scan: true,
    })
    return
  }
  if (n === 'generate_image' && ok) {
    return
  }
  if (n === 'grep' && ok && text) {
    const first = text.split('\n').find((l) => /:\d+:/.test(l))
    if (first) {
      const rel = first.split(':')[0]
      if (rel) void revealAgentFile(rel, { action: 'Search hit', detail: first.slice(0, 80), scan: true })
    }
  }
  if ((n === 'write' || n === 'diff' || n === 'edit') && ok && state.agentPrefs?.inlineDiffs !== false) {
    const rel = pathHint || ''
    if (!rel) return
    const full = joinWorkspacePath(rel)
    const tab = state.tabs.find((t) => sameFilePath(t.path, full))
    const before = tab?.beforeAgentEdit
    if (before == null) return
    void api.readFile(full).then((after) => {
      if (after === before) {
        delete tab.beforeAgentEdit
        return
      }
      const cpId = state.agentReview?.checkpointId
      window.SoumtokEditorDiff?.show(full, before, after, {
        onAccept: () => {
          delete tab.beforeAgentEdit
          tab.text = after
          state.dirty.delete(full)
          state.dirty.delete(normPath(full))
          renderEditor()
        },
        onReject: () => {
          if (cpId) {
            void api.checkpointRestore(cpId).then(() => {
              void api.readFile(full).then((body) => {
                tab.text = body
                delete tab.beforeAgentEdit
                renderEditor()
                void refreshTree()
              })
            })
          } else {
            tab.text = before
            void api.writeFile(full, before)
            delete tab.beforeAgentEdit
            renderEditor()
          }
        },
      })
    })
  }
}

function defaultThreadTitle() {
  return state.agentDriver === 'bot' ? 'New Bot' : 'New Agent'
}

function botChatTitle() {
  const t = activeThread()
  if (t.title === 'New Agent' || t.title === 'New Bot') return 'New Bot'
  return t.title
}

function applyAgentDriverUi() {
  document.body.classList.remove('driver-bot')
  syncAccountActivityIndicator()
  state.threads.forEach((t) => {
    if (t.title === 'New Bot') t.title = 'New Agent'
  })
  if (document.body.classList.contains('mode-project')) renderAgentPanel()
}

function persistAgentDriver(_next) {
  state.agentDriver = 'ide'
  const t = activeThread()
  if (t) t.driver = 'ide'
  try {
    localStorage.setItem('soumtok-agent-driver', 'ide')
  } catch {
    /* ignore */
  }
  applyAgentDriverUi()
  window.dispatchEvent(new CustomEvent('soumtok-agent-driver', { detail: 'ide' }))
}

function syncAccountActivityIndicator() {
  /* profile removed from activity bar */
}

function profileInitial(label) {
  return String(label || 'S')
    .trim()
    .charAt(0)
    .toUpperCase() || 'S'
}

function settingsAvatarMarkup(sizeClass) {
  const email = state.user?.email || state.user?.name || 'Signed in'
  const initial = profileInitial(email)
  if (state.avatarDataUrl) {
    return `<img class="${sizeClass}-img" src="${escapeAttr(state.avatarDataUrl)}" alt="" />`
  }
  return `<div class="${sizeClass}-letter" aria-hidden="true">${escapeHtml(initial)}</div>`
}

async function loadUserProfile() {
  if (!state.user) {
    state.profile = null
    state.avatarDataUrl = ''
    if (state.settingsOpen) renderSettingsScreen()
    return
  }
  try {
    const data = await api.fetchProfile?.()
    if (data?.error) return
    state.profile = data
    if (data.hasAvatar) {
      const av = await api.fetchAvatarDataUrl?.()
      if (av?.dataUrl) {
        state.avatarDataUrl = av.dataUrl
      } else if (!state.avatarDataUrl) {
        state.avatarDataUrl = ''
        const note = $('settings-avatar-note')
        if (note && av?.error) {
          note.textContent = 'Could not load profile photo — try Upload again or refresh after signing in on the web.'
          note.hidden = false
        }
      }
    } else {
      state.avatarDataUrl = ''
    }
  } catch {
    /* ignore */
  }
  if (state.settingsOpen) renderSettingsScreen()
}

function avatarUploadProgressLabel() {
  const pct = state.avatarUploadProgress || 0
  const stage = state.avatarUploadStage || 'upload'
  if (stage === 'pick') return 'Choose an image…'
  if (stage === 'read') return 'Reading file…'
  if (stage === 'save') return `Saving to your account… ${pct}%`
  if (stage === 'done') return 'Saved — synced with soumtok.com'
  return pct > 0 ? `Uploading… ${pct}%` : 'Uploading…'
}

function paintAvatarUploadProgress() {
  const wrap = $('settings-avatar-progress')
  const fill = $('settings-avatar-progress-fill')
  const label = $('settings-avatar-progress-label')
  if (!wrap || !fill) return
  wrap.hidden = !state.avatarUploadBusy
  fill.style.width = `${Math.max(4, state.avatarUploadProgress || 0)}%`
  if (label) label.textContent = avatarUploadProgressLabel()
}

async function uploadProfilePhoto() {
  if (state.avatarUploadBusy) return
  state.avatarUploadBusy = true
  state.avatarUploadProgress = 0
  state.avatarUploadStage = 'pick'
  const note = $('settings-avatar-note')
  if (note) {
    note.hidden = true
    note.textContent = ''
    note.style.color = ''
  }
  if (state.settingsOpen) {
    renderSettingsScreen()
    paintAvatarUploadProgress()
  }
  const offProgress = api.onProfileUploadProgress?.((payload) => {
    if (typeof payload?.percent === 'number') state.avatarUploadProgress = payload.percent
    if (payload?.stage) state.avatarUploadStage = payload.stage
    paintAvatarUploadProgress()
  })
  let savedOk = false
  try {
    const res = await api.uploadProfileAvatar?.()
    if (res?.cancelled) return
    if (!res?.ok) {
      const message = res?.error || 'Could not upload photo'
      if (note) {
        note.textContent = message
        note.hidden = false
      } else {
        window.alert(message)
      }
      return
    }
    savedOk = true
    state.profile = { ...(state.profile || {}), hasAvatar: true }
    if (res?.dataUrl) state.avatarDataUrl = res.dataUrl
    state.avatarUploadStage = 'done'
    state.avatarUploadProgress = 100
    paintAvatarUploadProgress()
    if (note) {
      note.textContent = 'Photo saved — same profile on desktop and soumtok.com'
      note.hidden = false
      note.style.color = '#3fb950'
    }
    await loadUserProfile()
  } finally {
    offProgress?.()
    if (savedOk) {
      window.setTimeout(() => {
        state.avatarUploadBusy = false
        state.avatarUploadProgress = 0
        state.avatarUploadStage = ''
        if (state.settingsOpen) renderSettingsScreen()
      }, 2400)
    } else {
      state.avatarUploadBusy = false
      state.avatarUploadProgress = 0
      state.avatarUploadStage = ''
      if (state.settingsOpen) renderSettingsScreen()
    }
  }
}

function formatProjectName(raw) {
  const s = String(raw || '').trim()
  if (!s) return 'Workspace'
  const spaced = s.replace(/[-_]+/g, ' ')
  const letters = spaced.replace(/[^a-zA-Z]/g, '')
  if (!letters) return spaced
  if (letters === letters.toUpperCase() || /[-_]/.test(s)) {
    return spaced.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
  }
  return spaced
}

function treeChevron(open) {
  const el = document.createElement('span')
  el.className = 'tree-chev'
  el.innerHTML = open
    ? '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.2 3.2 10.8 8 5.2 12.8V3.2z"/></svg>'
    : '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M6.2 4.2 11.8 8 6.2 11.8V4.2z"/></svg>'
  return el
}

function treeIcon(node, open) {
  if (window.SoumtokFileIcons?.createTreeIconEl) {
    return window.SoumtokFileIcons.createTreeIconEl(node, open)
  }
  const el = document.createElement('span')
  el.className = 'tree-icon'
  return el
}

function saveDevSnapshot() {
  try {
    const mode = !state.user
      ? 'auth'
      : document.body.classList.contains('mode-project')
        ? 'project'
        : 'home'
    sessionStorage.setItem(
      DEV_SNAPSHOT,
      JSON.stringify({
        mode,
        side: state.side,
        active: state.active,
        tabs: state.tabs.map(serializeTabForSession),
        threads: state.threads,
        activeThreadId: state.activeThreadId,
        panelCollapsed: !isPanelOpen(),
        panel: document.querySelector('#panel-bar .panel-tab.on')?.dataset.panel || 'terminal',
        sidebarOff: document.body.classList.contains('sidebar-off'),
        folder: state.folder || null,
        extDock: serializeExtDockItem(extensionDockOpen() ? state.extDock?.item : null),
        extMarketFilter: (() => {
          try {
            return JSON.parse(localStorage.getItem(EXT_MARKET_FILTER_KEY) || 'null')
          } catch {
            return null
          }
        })(),
      }),
    )
  } catch {
    /* private mode */
  }
}

function loadDevSnapshot() {
  try {
    const raw = sessionStorage.getItem(DEV_SNAPSHOT)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

async function restoreDevSnapshot(snap) {
  if (!snap || !state.user) return
  if (snap.mode === 'auth') {
    await enterSignedInUi()
    return
  }
  if (snap.folder && typeof snap.folder === 'string') {
    await api.openPath(snap.folder)
    state.folder = snap.folder
  }
  const hasExtensionTabs = (snap.tabs || []).some(
    (t) => t.kind === 'extension' || String(t.path || '').startsWith('extension:'),
  )
  if (snap.folder) await refreshTree()
  if ((snap.mode === 'home' || !state.folder) && !hasExtensionTabs) {
    setMode('home')
    await renderRecents()
    return
  }
  if (!state.folder && hasExtensionTabs) {
    setMode('project')
    document.body.classList.remove('agent-off')
    applyAgentDriverUi()
  } else {
    setMode('project')
  }
  const snapSide =
    snap.side === 'agent' || snap.side === 'account' ? 'files' : snap.side || 'files'
  state.side = ['files', 'search', 'git', 'extensions', 'connectors'].includes(snapSide)
    ? snapSide
    : snapSide === 'account'
      ? 'account'
      : 'files'
  if (state.folder) {
    await loadWorkspaceLocal()
  } else {
    applyBestThreadHistory({ backup: readAgentThreadsBackup('_home') })
  }
  if (Array.isArray(snap.threads) && snap.threads.length) {
    const snapScore = threadHistoryScore(snap.threads)
    const loadedScore = threadHistoryScore(state.threads)
    if (snapScore >= loadedScore) {
      state.threads = snap.threads
      state.activeThreadId = snap.activeThreadId || snap.threads[0].id
    }
  }
  ensureThreads()
  renderAgentPanel()
  state.tabs = (snap.tabs || []).map(normalizeRestoredTab)
  state.active = snap.active || null
  if (snap.extMarketFilter?.mode) {
    try {
      localStorage.setItem(EXT_MARKET_FILTER_KEY, JSON.stringify(snap.extMarketFilter))
    } catch {
      /* ignore */
    }
  }
  document.body.classList.toggle('sidebar-off', Boolean(snap.sidebarOff))
  showSide(state.side)
  if (snap.panelCollapsed) {
    setPanelOpen(false)
  } else {
    showPanel(snap.panel || 'terminal')
  }
  await Promise.all(state.tabs.map((tab) => hydrateRestoredTab(tab)))
  renderTabs()
  syncExtensionMarketSelection()
  if (state.active && state.tabs.some((t) => t.path === state.active || sameFilePath(t.path, state.active))) {
    renderEditor()
  } else {
    renderEditor()
  }
  updateStatus()
  await restoreExtDock(snap.extDock || readPersistedExtDock())
}

function ensureThreads() {
  if (!state.threads.length) {
    const id = `t${Date.now()}`
    state.threads = [{
      id,
      title: defaultThreadTitle(),
      items: [],
      modelMessages: [],
      attachedSkills: [],
      attachedPluginSkills: [],
      attachedLocalSkills: [],
      attachedManualSkills: [],
      mode: state.agentMode,
      driver: state.agentDriver,
      model: state.agentModel,
    }]
    state.activeThreadId = id
  }
}

function activeThread() {
  ensureThreads()
  return state.threads.find((t) => t.id === state.activeThreadId) || state.threads[0]
}

function threadIsRunning(threadId) {
  return state.agentBusy && state.agentRunThreadId === threadId
}

function closeOpenActivitiesOnThread(threadId) {
  const th = state.threads.find((row) => row.id === threadId)
  if (!th) return
  for (const item of th.items) {
    if (item.role === 'activity' && item.open) item.open = false
  }
}

function resetAgentRunUiState() {
  state.agentBusy = false
  state.agentRunThreadId = null
  state.agentLiveStatus = ''
  state.agentInterruptAfterCancel = null
  clearAgentReadVisuals()
  setAgentAvatarState('idle')
}

function cancelAgentRunForThread(threadId, opts = {}) {
  const onThread = threadId && state.agentRunThreadId === threadId
  if (!state.agentBusy && !onThread) return
  if (threadId && state.agentRunThreadId && state.agentRunThreadId !== threadId) return
  if (!opts.keepInterrupt) state.agentInterruptAfterCancel = null
  void api.agentCancel?.()
  resetAgentRunUiState()
  if (threadId) closeOpenActivitiesOnThread(threadId)
  updateAgentBusyUi()
}

async function syncAgentRunStateFromMain() {
  try {
    const running = await api.agentIsRunning?.()
    if (running === true) {
      state.agentBusy = true
      const jobs = await api.agentJobs?.()
      const live = Array.isArray(jobs) ? jobs.filter((j) => j.status === 'running') : []
      if (live.length && !state.agentReplayedJobs) state.agentReplayedJobs = new Set()
      for (const job of live) {
        if (!job?.id || state.agentReplayedJobs.has(job.id)) continue
        state.agentReplayedJobs.add(job.id)
        const events = await api.agentJobEvents?.(job.id)
        if (Array.isArray(events)) {
          for (const ev of events) handleAgentStreamEvent(ev)
        }
      }
      updateAgentBusyUi()
    } else if (running === false && state.agentBusy) {
      resetAgentRunUiState()
    }
  } catch {
    /* ignore */
  }
}

function activeThreadIsRunning() {
  return threadIsRunning(state.activeThreadId)
}

function newAgentThread() {
  ensureThreads()
  const id = `t${Date.now()}`
  const now = Date.now()
  state.threads.unshift({
    id,
    title: defaultThreadTitle(),
    items: [],
    modelMessages: [],
    attachedSkills: [],
    attachedPluginSkills: [],
    attachedLocalSkills: [],
    attachedManualSkills: [],
    mode: state.agentMode || 'agent',
    driver: state.agentDriver,
    model: state.agentModel || 'auto',
    archived: false,
    updatedAt: now,
  })
  state.activeThreadId = id
  clearAgentComposerAttachments()
  closeAgentToolbarPopovers()
  renderAgentPanel()
  scheduleWorkspaceSave()
  $('agent-input')?.focus()
}

function touchThreadActivity(thread) {
  if (thread) thread.updatedAt = Date.now()
}

function closeAgentToolbarPopovers() {
  state.agentHistoryOpen = false
  state.agentMoreOpen = false
}

function agentBarIcon(name) {
  const icons = {
    plus:
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9"/></svg>',
    stop:
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" aria-hidden="true"><rect x="5.25" y="5.25" width="5.5" height="5.5" rx="1.1"/></svg>',
    history:
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="5.75"/><path d="M8 5v3.2l2.1 1.3"/></svg>',
    more:
      '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3.2" cy="8" r="1.15"/><circle cx="8" cy="8" r="1.15"/><circle cx="12.8" cy="8" r="1.15"/></svg>',
    copy:
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" aria-hidden="true"><rect x="5.5" y="5.5" width="7" height="8" rx="1.1"/><path d="M3.5 10.5V4.2A1.2 1.2 0 0 1 4.7 3h6"/></svg>',
    panel:
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" aria-hidden="true"><rect x="2.5" y="3" width="11" height="10" rx="1.2"/><path d="M10 3v10"/></svg>',
    canvas:
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12.5l8.5-8.5 2 2L5 14.5H3v-2z"/><path d="M9.5 4.5l2 2"/></svg>',
  }
  return icons[name] || ''
}

function threadMatchesHistorySearch(thread, q) {
  if (!q) return true
  const hay = `${thread.title || ''} ${thread.items.map((m) => m.text || '').join(' ')}`.toLowerCase()
  return hay.includes(q)
}

function renderAgentHistoryPopHtml() {
  const q = state.agentHistorySearch.trim().toLowerCase()
  const activeRows = state.threads.filter((t) => !t.archived && threadMatchesHistorySearch(t, q))
  const archivedRows = state.threads.filter((t) => t.archived && threadMatchesHistorySearch(t, q))
  const list =
    activeRows.length ?
      activeRows
        .map((t) => {
          const on = t.id === state.activeThreadId
          return `<button type="button" class="agent-history-row ${on ? 'on' : ''}" data-pick-thread="${escapeAttr(t.id)}">
            <span class="agent-history-row-title">${escapeHtml(t.title || 'Agent')}</span>
          </button>`
        })
        .join('')
    : `<p class="agent-history-empty">${q ? 'No matching agents' : 'No agents yet'}</p>`
  const archivedBlock =
    archivedRows.length ?
      `<button type="button" class="agent-history-archived-toggle" id="agent-history-archived-toggle" aria-expanded="${state.agentArchivedOpen}">
        <svg class="agent-history-chev ${state.agentArchivedOpen ? 'open' : ''}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 4l4 4-4 4"/></svg>
        Archived
      </button>
      <div class="agent-history-archived-list" ${state.agentArchivedOpen ? '' : 'hidden'}>
        ${archivedRows
          .map(
            (t) =>
              `<button type="button" class="agent-history-row muted" data-pick-thread="${escapeAttr(t.id)}">
                <span class="agent-history-row-title">${escapeHtml(t.title || 'Agent')}</span>
              </button>`,
          )
          .join('')}
      </div>`
    : ''
  return `<div class="agent-history-pop-inner">
    <input type="search" class="agent-history-search" id="agent-history-search" placeholder="Search Agents…" value="${escapeAttr(state.agentHistorySearch)}" autocomplete="off" spellcheck="false" />
    <div class="agent-history-list">${list}</div>
    ${archivedBlock}
  </div>`
}

function agentMoreCheckIcon(on) {
  if (!on) return '<span class="agent-more-check" aria-hidden="true"></span>'
  return `<span class="agent-more-check on" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3.5 8.2 6.5 11.2 12.5 4.8"/></svg></span>`
}

function renderAgentMoreMenuHtml() {
  const previewOn = state.agentPreviewEditors
  return `<div class="agent-more-menu" role="menu">
    <button type="button" class="agent-more-item" data-agent-more="copy-chat" role="menuitem">Copy entire chat</button>
    <button type="button" class="agent-more-item" data-agent-more="browser" role="menuitem">Open Browser</button>
    <button type="button" class="agent-more-item" data-agent-more="export" role="menuitem">Export Transcript</button>
    <button type="button" class="agent-more-item" data-agent-more="copy-id" role="menuitem">Copy Request ID</button>
    <button type="button" class="agent-more-item" data-agent-more="feedback" role="menuitem">Report a bug</button>
    <div class="agent-more-sep" role="separator"></div>
    <button type="button" class="agent-more-item" data-agent-more="settings" role="menuitem">Agent Settings</button>
    <div class="agent-more-sep" role="separator"></div>
    <button type="button" class="agent-more-item" data-agent-more="close-all" role="menuitem">Close All</button>
    <button type="button" class="agent-more-item" data-agent-more="close-saved" role="menuitem">Close Saved</button>
    <div class="agent-more-sep" role="separator"></div>
    <button type="button" class="agent-more-item check ${previewOn ? 'on' : ''}" data-agent-more="preview" role="menuitemcheckbox" aria-checked="${previewOn}">
      ${agentMoreCheckIcon(previewOn)}<span class="agent-more-label">Enable Preview Editors</span>
    </button>
    <button type="button" class="agent-more-item" data-agent-more="archive" role="menuitem">Archive Current Chat</button>
  </div>`
}

function runAgentMoreAction(action) {
  if (action === 'preview') {
    state.agentPreviewEditors = !state.agentPreviewEditors
    try {
      localStorage.setItem('soumtok-agent-preview-editors', state.agentPreviewEditors ? '1' : '0')
    } catch {
      /* ignore */
    }
    const pop = $('agent-more-pop')
    if (pop && state.agentMoreOpen) {
      pop.innerHTML = renderAgentMoreMenuHtml()
      bindAgentMoreMenuContents()
    }
    return
  }
  if (action === 'archive') {
    archiveCurrentAgentThread()
    return
  }
  if (action === 'close-all') {
    closeAllAgentThreads()
    return
  }
  if (action === 'close-saved') {
    closeSavedAgentThreads()
    return
  }
  if (action === 'settings') {
    closeAgentToolbarPopovers()
    syncAgentToolbarPops()
    state.settingsTab = 'agents'
    openSettings()
    return
  }
  closeAgentToolbarPopovers()
  syncAgentToolbarPops()
  if (action === 'browser') {
    if (typeof api.openDashboard === 'function') api.openDashboard()
    else if (typeof api.openHelp === 'function') api.openHelp()
  } else if (action === 'copy-chat') void copyEntireAgentChat()
  else if (action === 'export') exportAgentTranscript()
  else if (action === 'copy-id') void copyAgentRequestId()
  else if (action === 'feedback') openBugReport()
  renderAgentPanel()
}

function bindAgentMoreMenuContents() {
  $('agent-more-pop')?.querySelectorAll('[data-agent-more]').forEach((btn) => {
    btn.onclick = (event) => {
      event.stopPropagation()
      runAgentMoreAction(btn.dataset.agentMore)
    }
  })
}

function refreshAgentHistoryPop() {
  const pop = $('agent-history-pop')
  if (!pop || pop.hidden) return
  pop.innerHTML = renderAgentHistoryPopHtml()
  bindAgentHistoryPopContents()
}

function bindAgentHistoryPopContents() {
  const search = $('agent-history-search')
  if (search) {
    search.oninput = (event) => {
      state.agentHistorySearch = event.target.value
      refreshAgentHistoryPop()
    }
  }
  const archived = $('agent-history-archived-toggle')
  if (archived) {
    archived.onclick = () => {
      state.agentArchivedOpen = !state.agentArchivedOpen
      refreshAgentHistoryPop()
    }
  }
  popPickThreads($('agent-history-pop'))
}

function popPickThreads(root) {
  root?.querySelectorAll('[data-pick-thread]').forEach((btn) => {
    btn.onclick = () => {
      state.activeThreadId = btn.dataset.pickThread
      const th = activeThread()
      th.archived = false
      touchThreadActivity(th)
      closeAgentToolbarPopovers()
      clearAgentComposerAttachments()
      renderAgentPanel()
      refreshAgentAttachRow()
      scheduleWorkspaceSave()
    }
  })
}

function formatAgentChatTranscript(t) {
  const thread = t || activeThread()
  const lines = [`# ${thread.title || 'Agent chat'}`, '']
  for (const item of thread.items || []) {
    if (item.role === 'user') lines.push(`## User\n\n${item.text || ''}`)
    else if (item.role === 'agent') {
      const who = item.model ? `Assistant (${item.model})` : 'Assistant'
      lines.push(`## ${who}\n\n${item.text || ''}`)
    } else if (item.role === 'activity') {
      const steps = (item.steps || [])
        .map((s) => {
          if (s.kind === 'tool') {
            const args = s.args ? JSON.stringify(s.args) : ''
            const result = s.result ? `\n${String(s.result).slice(0, 4000)}` : ''
            return `- tool ${s.name || ''} ${args}${result}`
          }
          if (s.kind === 'checkpoint') return `- checkpoint ${s.id || ''}`
          return `- ${s.kind || 'step'}`
        })
        .join('\n')
      lines.push(`## Activity\n\n${item.status || ''}\n${steps}`.trim())
    } else if (item.role === 'tool') lines.push(`> Tool: ${item.text || ''}`)
    else if (item.role === 'status') lines.push(`_ ${item.text} _`)
    else if (item.role === 'result') lines.push(`\`\`\`\n${item.text || ''}\n\`\`\``)
  }
  return lines.join('\n\n').trim() || '(empty chat)'
}

function exportAgentTranscript() {
  const t = activeThread()
  const body = formatAgentChatTranscript(t)
  const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(t.title || 'agent').replace(/[^\w.-]+/g, '_')}.md`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function copyEntireAgentChat() {
  const t = activeThread()
  const body = formatAgentChatTranscript(t)
  let ok = false
  try {
    await navigator.clipboard.writeText(body)
    ok = true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = body
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      ok = document.execCommand('copy')
      ta.remove()
    } catch {
      ok = false
    }
  }
  t.items.push({
    role: 'status',
    text: ok ? 'Entire chat copied. Paste it anywhere (Ctrl+V).' : 'Could not copy chat — try Export Transcript.',
  })
  paintAgentThread()
}

async function copyAgentRequestId() {
  const t = activeThread()
  const id = `${t.id}-${t.updatedAt || Date.now()}`
  let ok = false
  try {
    await navigator.clipboard.writeText(id)
    ok = true
  } catch {
    ok = false
  }
  t.items.push({ role: 'status', text: ok ? 'Request ID copied to clipboard.' : 'Could not copy request ID.' })
  if (t.id === state.activeThreadId) paintAgentThread()
}

function closeAllAgentThreads() {
  const id = `t${Date.now()}`
  state.threads = [
    {
      id,
      title: defaultThreadTitle(),
      items: [],
      modelMessages: [],
      attachedSkills: [],
      attachedPluginSkills: [],
      attachedLocalSkills: [],
      attachedManualSkills: [],
      mode: state.agentMode,
      driver: state.agentDriver,
      model: state.agentModel,
      archived: false,
      updatedAt: Date.now(),
    },
  ]
  state.activeThreadId = id
  closeAgentToolbarPopovers()
  renderAgentPanel()
  scheduleWorkspaceSave()
}

function closeSavedAgentThreads() {
  const empty = state.threads.filter((t) => !t.items.length)
  if (!empty.length) return
  state.threads = state.threads.filter((t) => t.items.length > 0)
  if (!state.threads.length) {
    closeAllAgentThreads()
    return
  }
  if (!state.threads.some((t) => t.id === state.activeThreadId)) {
    state.activeThreadId = state.threads[0].id
  }
  closeAgentToolbarPopovers()
  renderAgentPanel()
  scheduleWorkspaceSave()
}

function archiveCurrentAgentThread() {
  const t = activeThread()
  t.archived = true
  touchThreadActivity(t)
  const next = state.threads.find((row) => !row.archived && row.id !== t.id)
  if (next) {
    state.activeThreadId = next.id
  } else {
    newAgentThread()
    return
  }
  closeAgentToolbarPopovers()
  renderAgentPanel()
  scheduleWorkspaceSave()
}

function onAgentToolbarDocDown(event) {
  if (event.target.closest('.agent-toolbar-anchor')) return
  if (!state.agentHistoryOpen && !state.agentMoreOpen) return
  closeAgentToolbarPopovers()
  renderAgentPanel()
}

function syncAgentToolbarPops() {
  const historyPop = $('agent-history-pop')
  const morePop = $('agent-more-pop')
  const historyBtn = $('agent-history')
  const moreBtn = $('agent-more')
  if (historyPop) historyPop.hidden = !state.agentHistoryOpen
  if (morePop) morePop.hidden = !state.agentMoreOpen
  if (historyBtn) historyBtn.setAttribute('aria-expanded', String(state.agentHistoryOpen))
  if (moreBtn) moreBtn.setAttribute('aria-expanded', String(state.agentMoreOpen))
  if (state.agentHistoryOpen && historyPop) {
    historyPop.innerHTML = renderAgentHistoryPopHtml()
    bindAgentHistoryPopContents()
  }
  if (state.agentMoreOpen && morePop) {
    morePop.innerHTML = renderAgentMoreMenuHtml()
    bindAgentMoreMenuContents()
  }
}

function bindAgentToolbar() {
  const newBtn = $('agent-new')
  if (newBtn) newBtn.onclick = () => newAgentThread()

  const stopBtn = $('agent-stop')
  if (stopBtn) stopBtn.onclick = () => api.agentCancel()

  const copyChatBtn = $('agent-copy-chat')
  if (copyChatBtn) copyChatBtn.onclick = () => void copyEntireAgentChat()

  const historyBtn = $('agent-history')
  if (historyBtn) {
    historyBtn.onclick = (event) => {
      event.stopPropagation()
      state.agentMoreOpen = false
      state.agentHistoryOpen = !state.agentHistoryOpen
      if (state.agentHistoryOpen) state.agentHistorySearch = ''
      syncAgentToolbarPops()
      if (state.agentHistoryOpen) $('agent-history-search')?.focus()
    }
  }

  const moreBtn = $('agent-more')
  if (moreBtn) {
    moreBtn.onclick = (event) => {
      event.stopPropagation()
      state.agentHistoryOpen = false
      state.agentMoreOpen = !state.agentMoreOpen
      syncAgentToolbarPops()
    }
  }

  const panelBtn = $('agent-panel-toggle')
  if (panelBtn) {
    panelBtn.onclick = () => {
      closeAgentToolbarPopovers()
      syncAgentToolbarPops()
      document.body.classList.toggle('agent-off')
      if (!document.body.classList.contains('agent-off')) {
        renderAgentPanel()
        $('agent-input')?.focus()
      }
    }
  }

  syncAgentToolbarPops()

  if (!document.body.dataset.agentToolbarDoc) {
    document.body.dataset.agentToolbarDoc = '1'
    document.addEventListener('mousedown', onAgentToolbarDocDown)
  }
}

function closeAgentThread(id) {
  const closing = id || state.activeThreadId
  const t = state.threads.find((row) => row.id === closing)
  if (!t) return
  if (threadIsRunning(closing)) cancelAgentRunForThread(closing)
  const hasContent = t.items.some((item) => item.role === 'user' || item.role === 'agent') || (t.modelMessages?.length > 0)
  const openTabs = state.threads.filter((row) => !row.archived)
  if (openTabs.length <= 1 && openTabs[0]?.id === closing) {
    if (hasContent) {
      t.archived = true
      touchThreadActivity(t)
      newAgentThread()
    } else {
      t.items = []
      t.modelMessages = []
      t.title = defaultThreadTitle()
      closeOpenActivitiesOnThread(t.id)
    }
    void renderAgentPanel()
    scheduleWorkspaceSave()
    return
  }
  if (hasContent) {
    t.archived = true
    touchThreadActivity(t)
  } else {
    state.threads = state.threads.filter((row) => row.id !== closing)
  }
  if (state.activeThreadId === closing) {
    const next = state.threads.find((row) => !row.archived && row.id !== closing)
    if (next) state.activeThreadId = next.id
    else newAgentThread()
  }
  void renderAgentPanel()
  scheduleWorkspaceSave()
}

const MODEL_PROVIDER_ORDER = [
  ['deepseek', 'DeepSeek'],
  ['openai', 'OpenAI'],
  ['anthropic', 'Anthropic'],
  ['xai', 'Grok'],
]

function isFastModel(m) {
  const hay = `${m.id} ${m.name} ${m.cost || ''}`.toLowerCase()
  return /flash|v4\.1|mini|nano|haiku|cheap|cheapest|v4-flash|fast|lite|gemma/.test(hay)
}

const AGENT_MODEL_STORAGE_KEY = 'soumtok-default-model'

function persistAgentModel(id) {
  state.agentModel = id || 'auto'
  try {
    localStorage.setItem(AGENT_MODEL_STORAGE_KEY, state.agentModel)
  } catch {
    /* ignore */
  }
  const th = activeThread()
  if (th) th.model = state.agentModel
  scheduleWorkspaceSave()
  updateStatus()
}

function loadPersistedAgentModel() {
  try {
    const saved = localStorage.getItem(AGENT_MODEL_STORAGE_KEY)
    if (!saved || saved === 'soumtok-agent' || saved === 'composer-2-5') return
    state.agentModel = saved
  } catch {
    /* ignore */
  }
}

function syncThreadModelFromGlobal() {
  const th = activeThread()
  if (th) th.model = state.agentModel
}

function modelTierTag(cost) {
  const c = String(cost || '')
  if (/Highest|Higher/.test(c)) return 'High'
  if (/^High/.test(c)) return 'High'
  if (/Mid|Varies/.test(c)) return 'Medium'
  if (/Free|Cheap|Cheapest|Low/.test(c)) return 'Value'
  return c || ''
}

function modelTagClass(label) {
  const t = String(label || '').toLowerCase()
  if (t === 'new') return 'agent-model-tag tag-new'
  if (t === 'value' || t === 'fast') return 'agent-model-tag tag-value'
  if (t === 'medium') return 'agent-model-tag tag-mid'
  if (t === 'high') return 'agent-model-tag tag-high'
  return 'agent-model-tag'
}

function modelTagsHtml(m) {
  if (m.id === 'auto') return ''
  const tags = []
  const tier = modelTierTag(m.cost)
  if (tier) tags.push(tier)
  if (m.tags?.includes('New')) tags.push('New')
  return tags.map((t) => `<span class="${modelTagClass(t)}">${escapeHtml(t)}</span>`).join('')
}

function modelStrengthLine(m) {
  if (m.id === 'auto') return 'Picks the best model for each task.'
  const s = String(m.strength || '').trim()
  if (s) return s
  const hit = BUILTIN_DESKTOP_MODELS.find((row) => row.id === m.id)
  return hit?.strength || ''
}

function selectedModelHintHtml() {
  if (state.agentModel === 'auto') {
    return '<p class="agent-model-selected-hint">Auto uses DeepSeek V4 Flash / Pro — great coding, low credits. The harness does the heavy work for every model, including Fable.</p>'
  }
  const m = state.modelOptions.find((row) => row.id === state.agentModel)
  const line = modelStrengthLine(m || { id: state.agentModel })
  if (!line) return ''
  return `<p class="agent-model-selected-hint">${escapeHtml(line)}</p>`
}

function agentModelCurrentName() {
  if (state.agentModel === 'auto') return 'Auto'
  return state.modelOptions.find((m) => m.id === state.agentModel)?.name || state.agentModel
}

function modelDisplayNameForId(id) {
  if (!id || id === 'auto') return 'Auto'
  const hit = state.modelOptions.find((m) => m.id === id)
  if (hit) return hit.name
  return String(id)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function agentModelTriggerLabel() {
  const name = agentModelCurrentName()
  if (state.agentModel === 'auto') return 'Auto · cheap'
  if (state.agentModelFast && isFastModel({ id: state.agentModel, name, cost: '' })) return `${name} · Fast`
  return name
}

function setModelTriggerLabel() {
  const label = $('agent-model-btn-label')
  const btn = $('agent-model-btn')
  if (label) label.textContent = agentModelTriggerLabel()
  if (btn) {
    const m = state.modelOptions.find((row) => row.id === state.agentModel)
    const hint = modelStrengthLine(m || { id: state.agentModel })
    btn.title = hint ? `${agentModelCurrentName()} — ${hint}` : 'Choose model'
  }
}

function agentModeLabel(mode = state.agentMode) {
  if (mode === 'ask') return 'Ask'
  if (mode === 'plan') return 'Plan'
  if (mode === 'debug') return 'Debug'
  return 'Agent'
}

function closeAgentModePicker() {
  state.agentModePicker = false
  $('agent-mode-pop')?.setAttribute('hidden', '')
}

function agentIntelligenceLabel(value = state.agentPrefs?.intelligence) {
  if (value === 'fast') return 'Fast'
  if (value === 'balanced') return 'Balanced'
  return 'Max'
}

function closeAgentIntelPicker() {
  state.agentIntelPicker = false
  $('agent-intel-pop')?.setAttribute('hidden', '')
}

function openAgentIntelPicker() {
  closeAgentModePicker()
  closeModelPicker()
  state.agentIntelPicker = true
  $('agent-intel-pop')?.removeAttribute('hidden')
}

function bindAgentIntelPicker() {
  const btn = $('agent-intel-btn')
  const pop = $('agent-intel-pop')
  if (!btn || !pop) return
  btn.onclick = (event) => {
    event.stopPropagation()
    if (state.agentBusy) return
    if (state.agentIntelPicker) closeAgentIntelPicker()
    else openAgentIntelPicker()
  }
  pop.onclick = (event) => event.stopPropagation()
  pop.querySelectorAll('[data-intel]').forEach((row) => {
    row.onclick = () => {
      setAgentPref('intelligence', row.dataset.intel)
      const label = $('agent-intel-label')
      if (label) label.textContent = agentIntelligenceLabel()
      pop.querySelectorAll('[data-intel]').forEach((el) =>
        el.classList.toggle('on', el.dataset.intel === (state.agentPrefs?.intelligence || 'max')),
      )
      closeAgentIntelPicker()
    }
  })
  if (!document.body.dataset.agentIntelDoc) {
    document.body.dataset.agentIntelDoc = '1'
    document.addEventListener('click', () => closeAgentIntelPicker())
  }
}

function openAgentModePicker() {
  closeModelPicker()
  closeAgentIntelPicker()
  state.agentModePicker = true
  $('agent-mode-pop')?.removeAttribute('hidden')
}

function bindAgentModePicker() {
  const btn = $('agent-mode-btn')
  const pop = $('agent-mode-pop')
  if (!btn || !pop) return
  btn.onclick = (event) => {
    event.stopPropagation()
    if (state.agentBusy) return
    if (state.agentModePicker) closeAgentModePicker()
    else openAgentModePicker()
  }
  pop.onclick = (event) => event.stopPropagation()
  pop.querySelectorAll('[data-mode]').forEach((row) => {
    row.onclick = () => {
      state.agentMode = row.dataset.mode
      activeThread().mode = state.agentMode
      $('agent-mode-label').textContent = agentModeLabel()
      pop.querySelectorAll('[data-mode]').forEach((el) => el.classList.toggle('on', el.dataset.mode === state.agentMode))
      closeAgentModePicker()
    }
  })
  if (!document.body.dataset.agentModeDoc) {
    document.body.dataset.agentModeDoc = '1'
    document.addEventListener('click', () => closeAgentModePicker())
  }
}

function growAgentInput() {
  const box = $('agent-input')
  if (!box) return
  box.style.height = 'auto'
  box.style.height = `${Math.min(box.scrollHeight, 160)}px`
  const bar = box.closest('.bot-composer-bar')
  if (bar) bar.classList.toggle('has-text', Boolean(box.value.trim()))
}

function modelsForPickerList() {
  const q = state.agentModelSearch.trim().toLowerCase()
  const models =
    typeof MODEL_CATALOG.sortForDisplay === 'function' ?
      MODEL_CATALOG.sortForDisplay(state.modelOptions)
    : state.modelOptions
  const rows = [{ id: 'auto', name: 'Auto', ready: true, cost: 'Varies', provider: 'auto' }, ...models]
  let list = rows
  const fullList = state.agentModelPicker === 'list'
  if (state.agentModelFast && !fullList) {
    list = list.filter((m) => m.id === 'auto' || isFastModel(m))
  }
  if (!fullList) {
    list = list.filter((m) => isModelEnabledInPicker(m.id))
  }
  if (q) {
    list = list.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        String(m.provider || '').toLowerCase().includes(q),
    )
  }
  return list
}

function renderModelPickerListHtml() {
  const list = modelsForPickerList()
  if (!list.length) {
    if (!state.modelOptions.length) {
      const hint = state.modelLoadError || 'Open Settings → Models and tap Refresh.'
      return `<p class="agent-model-empty">${escapeHtml(hint)}</p>`
    }
    return '<p class="agent-model-empty">No models match. Turn off Fast or clear search.</p>'
  }
  return list
    .map((m) => {
      const on = m.id === state.agentModel
      const off = modelNeedsKey(m)
      const disabledInSettings = m.id !== 'auto' && !isModelEnabledInPicker(m.id)
      const desc = modelStrengthLine(m)
      return `<button type="button" class="agent-model-item ${on ? 'on' : ''} ${disabledInSettings ? 'muted' : ''}" data-id="${escapeAttr(m.id)}" ${
        off || disabledInSettings ? 'disabled' : ''
      } data-disabled-settings="${disabledInSettings ? '1' : '0'}">
        <span class="agent-model-item-main">
          <span class="agent-model-item-name">${escapeHtml(m.name)}</span>
          ${desc ? `<span class="agent-model-item-desc">${escapeHtml(desc)}</span>` : ''}
          <span class="agent-model-item-tags">${modelTagsHtml(m)}</span>
        </span>
        ${on ? '<span class="agent-model-check" aria-hidden="true"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 11.5L3 8l1.4-1.4 2.1 2.1 5.1-5.1L13 5l-6.5 6.5z"/></svg></span>' : ''}
        ${off ? '<span class="agent-model-lock">Key needed</span>' : ''}
        ${disabledInSettings ? '<span class="agent-model-lock">Off</span>' : ''}
      </button>`
    })
    .join('')
}

function renderModelPickerPopHtml() {
  const open = Boolean(state.agentModelPicker)
  const listOpen = state.agentModelPicker === 'list'
  return `<div class="agent-model-pop ${listOpen ? 'is-list' : ''}" id="agent-model-pop" ${open ? '' : 'hidden'}>
    <div class="agent-model-pop-inner">
      <div class="agent-model-quick">
        <label class="agent-model-row agent-model-fast-row">
          <span>Fast</span>
          <span class="agent-model-switch ${state.agentModelFast ? 'on' : ''}" id="agent-model-fast" role="switch" aria-checked="${state.agentModelFast}" tabindex="0"></span>
        </label>
        <button type="button" class="agent-model-row agent-model-goto-list" id="agent-model-goto-list">
          <span>Model</span>
          <span class="agent-model-row-right">
            <span class="agent-model-current">${escapeHtml(agentModelCurrentName())}</span>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M6 4l4 4-4 4"/></svg>
          </span>
        </button>
        ${selectedModelHintHtml()}
      </div>
      <div class="agent-model-list-panel" ${listOpen ? '' : 'hidden'}>
        <input type="search" id="agent-model-search" class="agent-model-search" placeholder="Search models" value="${escapeAttr(state.agentModelSearch)}" autocomplete="off" />
        ${state.agentModelFast ? '<p class="agent-model-list-hint">Fast mode filters the quick picker only. Scroll for every model — enable more in Settings → Models.</p>' : ''}
        <div class="agent-model-list" id="agent-model-list">${renderModelPickerListHtml()}</div>
        <button type="button" class="agent-model-add" id="agent-model-add">Add models in Settings</button>
      </div>
    </div>
  </div>`
}

function pickModel(id) {
  persistAgentModel(id)
  closeModelPicker()
  setModelTriggerLabel()
}

function bindModelListItems() {
  $('agent-model-list')?.querySelectorAll('.agent-model-item').forEach((row) => {
    row.onclick = (event) => {
      event.stopPropagation()
      if (row.dataset.disabledSettings === '1') {
        openSettingsModels()
        closeModelPicker()
        return
      }
      if (row.disabled) return
      pickModel(row.dataset.id)
    }
  })
}

function refreshModelPickerList() {
  const box = $('agent-model-list')
  if (box) box.innerHTML = renderModelPickerListHtml()
  bindModelListItems()
  const cur = document.querySelector('.agent-model-current')
  if (cur) cur.textContent = agentModelCurrentName()
  const hint = document.querySelector('.agent-model-selected-hint')
  if (hint) {
    const next = selectedModelHintHtml()
    if (next) hint.outerHTML = next
    else hint.remove()
  } else if (selectedModelHintHtml()) {
    $('agent-model-goto-list')?.insertAdjacentHTML('afterend', selectedModelHintHtml())
  }
  setModelTriggerLabel()
}

function closeModelPicker() {
  state.agentModelPicker = null
  $('agent-model-pop')?.setAttribute('hidden', '')
}

function openModelPicker(view = 'quick') {
  closeAgentModePicker()
  closeAgentIntelPicker()
  state.agentModelPicker = view
  const pop = $('agent-model-pop')
  if (!pop) return
  pop.removeAttribute('hidden')
  pop.classList.toggle('is-list', view === 'list')
  $('agent-model-list-panel')?.toggleAttribute('hidden', view !== 'list')
  if (view === 'list') {
    $('agent-model-search')?.focus()
    refreshModelPickerList()
    if (state.user) {
      void loadPlatformProviders().then(() => {
        refreshModelReadiness()
        refreshModelPickerList()
      })
    }
  }
}

function bindModelPicker() {
  const btn = $('agent-model-btn')
  const pop = $('agent-model-pop')
  if (!btn || !pop) return

  btn.onclick = (event) => {
    event.stopPropagation()
    if (state.agentBusy) return
    if (state.agentModelPicker) closeModelPicker()
    else openModelPicker('quick')
  }

  pop.onclick = (event) => event.stopPropagation()

  $('agent-model-goto-list')?.addEventListener('click', (e) => {
    e.stopPropagation()
    openModelPicker('list')
  })

  const fast = $('agent-model-fast')
  if (fast) {
    const toggleFast = () => {
      state.agentModelFast = !state.agentModelFast
      try {
        localStorage.setItem('soumtok-agent-model-fast', state.agentModelFast ? '1' : '0')
      } catch {
        /* ignore */
      }
      fast.classList.toggle('on', state.agentModelFast)
      fast.setAttribute('aria-checked', String(state.agentModelFast))
      refreshModelPickerList()
      setModelTriggerLabel()
    }
    fast.onclick = toggleFast
    fast.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggleFast()
      }
    }
  }

  $('agent-model-search')?.addEventListener('input', (e) => {
    state.agentModelSearch = e.target.value
    refreshModelPickerList()
  })

  bindModelListItems()

  const addBtn = $('agent-model-add')
  if (addBtn) {
    addBtn.onclick = (e) => {
      e.stopPropagation()
      closeModelPicker()
      openSettingsModels()
    }
  }

  if (!document.body.dataset.modelPickerDoc) {
    document.body.dataset.modelPickerDoc = '1'
    document.addEventListener('click', () => closeModelPicker())
  }
}

async function loadAgentModels() {
  state.modelLoadError = ''
  state.modelSetupHint = ''
  if (state.user) await loadPlatformProviders()
  let data = null
  try {
    if (typeof api?.fetchModels === 'function') {
      data = await api.fetchModels()
    }
  } catch {
    data = null
  }
  const fromMain = Array.isArray(data?.models) ? data.models : []
  if (Array.isArray(data?.platformProviders)) state.platformProviders = data.platformProviders
  state.modelOptions = mergeModelCatalog(fromMain)
  refreshModelReadiness()
  if (data?.error && !state.user) state.modelLoadError = data.error
  else state.modelLoadError = ''
  state.modelSetupHint = data?.setupHint || ''
  if (data?.offlineCatalog && state.user && !state.modelOptions.some((m) => m.ready !== false)) {
    state.modelSetupHint = 'Soumtok could not reach the model API. Add your own keys under Settings → API Keys, or try again when online.'
  }
  const pickable = state.modelOptions.filter((m) => m.ready !== false)
  const hasSelected = state.modelOptions.some((m) => m.id === state.agentModel)
  if (state.agentModel !== 'auto' && !hasSelected) {
    const saved = localStorage.getItem(AGENT_MODEL_STORAGE_KEY)
    if (saved === state.agentModel) {
      /* keep user choice until catalog catches up */
    } else {
      persistAgentModel(pickable[0]?.id || saved || 'auto')
    }
  } else {
    syncThreadModelFromGlobal()
  }
  setModelTriggerLabel()
}

async function loadAccountSummary() {
  if (!state.user) return
  state.accountSummaryLoading = true
  state.accountSummaryError = ''
  let data = null
  try {
    data = await api.fetchAccountSummary()
  } catch {
    state.accountSummary = null
    state.accountSummaryError = 'Could not load plan and usage'
    state.accountSummaryLoading = false
    return
  }
  if (data?.error) {
    state.accountSummary = null
    state.accountSummaryError = data.error
  } else {
    state.accountSummary = data
    if (data?.planLabel && state.user) state.user.plan = data.plan
  }
  state.accountSummaryLoading = false
  refreshModelReadiness()
}

function showDesktopUpdateBanner(config) {
  if (!config?.updateRequired && !config?.updateAvailable) return
  if (document.getElementById('desktop-update-banner')) return
  const el = document.createElement('div')
  el.id = 'desktop-update-banner'
  el.className = 'desktop-update-banner'
  el.setAttribute('role', 'status')
  const msg = document.createElement('span')
  msg.className = 'desktop-update-banner-text'
  const latest = String(config?.latestVersion || '').trim()
  msg.innerHTML = `<strong>Update available</strong> — Soumtok ${latest || 'latest'} includes security fixes.`
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'desktop-update-banner-btn'
  btn.textContent = 'Download update'
  btn.addEventListener('click', () => void api.checkUpdates?.())
  const dismiss = document.createElement('button')
  dismiss.type = 'button'
  dismiss.className = 'desktop-update-banner-dismiss'
  dismiss.title = 'Dismiss'
  dismiss.textContent = '×'
  dismiss.addEventListener('click', () => el.remove())
  el.append(msg, btn, dismiss)
  document.body.prepend(el)
}

async function boot() {
  window.addEventListener('error', (event) => {
    void api.logCrash?.({
      message: event.message,
      stack: event.error?.stack,
      context: 'renderer-error',
    })
  })
  window.addEventListener('unhandledrejection', (event) => {
    void api.logCrash?.({
      message: String(event.reason?.message || event.reason || 'unhandledrejection'),
      stack: event.reason?.stack,
      context: 'renderer-rejection',
    })
  })
  try {
    state.agentDriver = 'ide'
    localStorage.setItem('soumtok-agent-driver', 'ide')
    state.agentModelFast = localStorage.getItem('soumtok-agent-model-fast') === '1'
    state.agentPreviewEditors = localStorage.getItem('soumtok-agent-preview-editors') !== '0'
    state.subagentModel = localStorage.getItem('soumtok-subagent-model') || 'auto'
    state.agentCtrlEnter = localStorage.getItem('soumtok-agent-ctrl-enter') === '1'
    state.disabledModels = loadDisabledModels()
    loadAgentPrefs()
    loadPersistedAgentModel()
    const legacy = localStorage.getItem(AGENT_MODEL_STORAGE_KEY)
    if (legacy === 'soumtok-agent' || legacy === 'composer-2-5') {
      persistAgentModel('auto')
    }
    const savedFont = Number(localStorage.getItem('soumtok-editor-font'))
    if (savedFont >= 11 && savedFont <= 20) state.editorFontSize = savedFont
    const wl = localStorage.getItem('soumtok-window-layout')
    if (wl === 'agent' || wl === 'editor') {
      state.windowLayout = wl
      if (wl === 'editor') document.body.classList.add('agent-off')
    }
  } catch {
    /* ignore */
  }
  window.addEventListener('soumtok-agent-driver', () => {
    state.agentDriver = 'ide'
    const t = activeThread()
    if (t) t.driver = 'ide'
    applyAgentDriverUi()
    if (state.side === 'account') renderSide()
  })
  applyAgentDriverUi()
  watchDesktopTheme()
  loadLayout()
  bind()
  void refreshExtensionActivityBar()
  window.__soumtokWorkbench = {
    state,
    activeEditorTab,
    appendPanelOutput,
    updateStatus,
  }
  window.__soumtokOpenExtensionLsp = (item) => {
    const id = String(item?.extensionId || item?.id || '').toLowerCase()
    const activity = typeof findExtensionActivityItem === 'function' ? findExtensionActivityItem(id) : null
    if (activity) return openExtensionHostEditor(activity)
    return ensureLanguageHostRunning()
  }
  bindLayoutResize()
  window.addEventListener('resize', () => applyLayout())
  offAgentEvent?.()
  offAgentEvent = api.onAgentEvent?.((ev) => handleAgentStreamEvent(ev))
  api.onAgentFileChanged?.(() => {
    void refreshTree()
    if (state.side === 'files') renderSide()
  })
  api.onDevReload?.(() => saveDevSnapshot())
  api.onExtensionsScopeChanged?.(() => {
    if (typeof closeExtensionDock === 'function') closeExtensionDock()
    if (state.extDock) {
      state.extDock.url = ''
      state.extDock.embeddedUrl = ''
      state.extDock.item = null
      state.extDock.error = ''
      state.extDock.loading = false
      state.extDock.booting = false
      state.extDock.uiReady = false
    }
    void refreshExtensionActivityBar()
    if (state.side === 'extensions') renderSide()
  })
  api.onConnectorsUpdated?.(() => {
    void refreshConnectorsMine()
    if (state.side === 'connectors') void paintConnectorsPanel()
    if (state.settingsOpen && state.settingsTab === 'connectors') void paintConnectorsMarketplace()
    if (state.settingsOpen && state.settingsTab === 'skills') {
      renderSettingsScreen()
      bindSettingsScreen()
    }
  })
  api.onExtensionHostUiReady?.(() => markExtensionDockUiReady())
  api.onExtensionHostDownloadProgress?.((data) => {
    const dock = extensionDockState()
    if (!extensionDockOpen()) return
    dock.progress = String(data?.message || '').trim()
    if (dock.progress) {
      dock.loading = true
      dock.error = ''
      const msg = $('ext-dock-loader-msg')
      if (msg) msg.textContent = dock.progress
      paintExtensionDock()
    }
  })
  api.onTermRunRequest?.((payload) => {
    const cmd = String(typeof payload === 'string' ? payload : payload?.command || '').trim()
    if (cmd) {
      const label = cmd.length > 52 ? `${cmd.slice(0, 50)}…` : cmd
      state.agentBgTerminals.unshift({ command: cmd, label, at: Date.now() })
      state.agentBgTerminals = state.agentBgTerminals.slice(0, 8)
      paintAgentBgTerminals()
    }
    void runAgentTerminalCommand(payload)
  })
  api.onTermMirror?.((payload) => {
    void mirrorAgentTerminalOutput(payload)
  })
  window.addEventListener('beforeunload', () => {
    persistExtDock()
    flushWorkspaceSaveSync()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && pendingLoginId) void tryPollLogin()
  })
  window.addEventListener('focus', () => {
    void syncAgentRunStateFromMain().then(() => updateAgentBusyUi())
    void refreshGit()
    if (pendingLoginId) void tryPollLogin()
    else {
      void refreshSession().then(async () => {
        if (!state.user) return
        if (document.body.classList.contains('mode-auth')) {
          setAuthBootLoading(true, 'Loading your account…')
          await enterSignedInUi()
          setAuthBootLoading(false)
        }
      })
    }
  })
  setAuthBootLoading(true, 'Checking your session…')
  try {
    const info = await api.info?.()
    if (info?.desktopConfig) showDesktopUpdateBanner(info.desktopConfig)
  } catch {
    /* ignore */
  }
  const snap = loadDevSnapshot()
  try {
    await refreshSession()
    updateStatus()
    if (!state.user) {
      setMode('auth')
      mountAuthGateAvatar()
      try {
        const savedPending = sessionStorage.getItem('soumtok-desktop-pending')
        if (savedPending) startLoginPoll(savedPending)
      } catch {
        /* ignore */
      }
      updateAuthContinueUi()
      return
    }
    stopLoginPoll()
    pendingLoginId = ''
    try {
      sessionStorage.removeItem('soumtok-desktop-pending')
    } catch {
      /* ignore */
    }
    setAuthBootLoading(true, 'Opening your workspace…')
    try {
      await withTimeout(
        (async () => {
          if (snap && snap.mode !== 'auth') await restoreDevSnapshot(snap)
          else await enterSignedInUi()
        })(),
        15000,
        'Opening workspace',
      )
    } catch (err) {
      console.error('boot workspace', err)
      setMode('home')
      try {
        await renderRecents()
      } catch {
        /* ignore */
      }
    }
  } finally {
    finishAuthBoot()
  }
  if (state.user && !extensionDockOpen()) void restoreExtDock()
  if (state.user) await syncModelCatalogForSession()
  else void loadAgentModels()
  await loadMonaco()
  if (window.monaco) window.monaco.editor.onDidChangeMarkers(countMarkers)
  if (snap && state.user && snap.mode === 'project' && state.active) renderEditor()
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

const EDITOR_VIEW_PADDING = { top: 22, bottom: 14 }

function layoutEditor() {
  if (!state.editor?.layout) return
  state.editor.updateOptions({ padding: EDITOR_VIEW_PADDING })
  state.editor.layout()
}

const LAYOUT_ACTIVITY = 48
const LAYOUT_MIN_CENTER = 240
const LAYOUT_MIN_SIDEBAR = 160
const LAYOUT_MIN_AGENT = 260
const LAYOUT_MIN_EXTDOCK = 280

function fitLayoutToWindow() {
  const ww = window.innerWidth
  const wh = window.innerHeight
  const sidebarOn = !document.body.classList.contains('sidebar-off')
  const agentOn =
    document.body.classList.contains('mode-project') &&
    !document.body.classList.contains('agent-off') &&
    !document.body.classList.contains('driver-bot')

  layout.sidebar = clamp(layout.sidebar, LAYOUT_MIN_SIDEBAR, Math.min(640, ww * 0.45))
  layout.agent = clamp(layout.agent, LAYOUT_MIN_AGENT, Math.min(720, ww * 0.55))
  layout.extdock = clamp(layout.extdock, LAYOUT_MIN_EXTDOCK, Math.min(900, ww * 0.6))
  layout.panel = clamp(layout.panel, 80, Math.min(480, wh * 0.5))

  const dockOn = document.body.classList.contains('extdock-on')
  if (dockOn) {
    const room = ww - LAYOUT_ACTIVITY - (sidebarOn ? layout.sidebar : 0) - LAYOUT_MIN_CENTER
    layout.extdock = clamp(layout.extdock, LAYOUT_MIN_EXTDOCK, Math.max(LAYOUT_MIN_EXTDOCK, room))
  }
  const chrome = LAYOUT_ACTIVITY + (sidebarOn ? layout.sidebar : 0) + (agentOn ? layout.agent : 0)
  const overflow = chrome + LAYOUT_MIN_CENTER - ww
  if (overflow > 0 && agentOn) {
    layout.agent = clamp(layout.agent - overflow, LAYOUT_MIN_AGENT, layout.agent)
  }
  const chrome2 = LAYOUT_ACTIVITY + (sidebarOn ? layout.sidebar : 0) + (agentOn ? layout.agent : 0)
  const overflow2 = chrome2 + LAYOUT_MIN_CENTER - ww
  if (overflow2 > 0 && sidebarOn) {
    layout.sidebar = clamp(layout.sidebar - overflow2, LAYOUT_MIN_SIDEBAR, layout.sidebar)
  }
  if (ww < 720 && agentOn) {
    layout.agent = clamp(layout.agent, 220, Math.min(layout.agent, ww * 0.48))
  }
  if (ww < 560 && sidebarOn) {
    layout.sidebar = clamp(layout.sidebar, 140, Math.min(layout.sidebar, ww * 0.38))
  }
}

function applyLayout() {
  fitLayoutToWindow()
  document.documentElement.style.setProperty('--sidebar', `${layout.sidebar}px`)
  document.documentElement.style.setProperty('--agent', `${layout.agent}px`)
  document.documentElement.style.setProperty('--extdock', `${layout.extdock}px`)
  document.documentElement.style.setProperty('--panel', `${layout.panel}px`)
  layoutEditor()
  window.SoumtokTerminal?.fitAll()
  void syncExtensionHostViewBounds()
}

function loadLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      if (Number.isFinite(saved.sidebar)) layout.sidebar = saved.sidebar
      if (Number.isFinite(saved.agent)) layout.agent = saved.agent
      if (Number.isFinite(saved.extdock)) layout.extdock = saved.extdock
      if (Number.isFinite(saved.panel)) layout.panel = saved.panel
    }
  } catch {
    /* private mode */
  }
  applyLayout()
}

function saveLayout() {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
  } catch {
    /* ignore */
  }
}

function bindLayoutResize() {
  $('ext-dock-close')?.addEventListener('click', () => closeExtensionDock())

  $('resize-sidebar')?.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    const startX = event.clientX
    const startW = layout.sidebar
    document.body.classList.add('resizing')
    const move = (ev) => {
      layout.sidebar = clamp(startW + (ev.clientX - startX), 160, Math.min(640, window.innerWidth * 0.45))
      applyLayout()
    }
    const up = () => {
      document.body.classList.remove('resizing')
      saveLayout()
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      layoutEditor()
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  })

  $('resize-agent')?.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    const startX = event.clientX
    const startW = layout.agent
    document.body.classList.add('resizing')
    const move = (ev) => {
      layout.agent = clamp(startW + (startX - ev.clientX), 260, Math.min(720, window.innerWidth * 0.55))
      applyLayout()
    }
    const up = () => {
      document.body.classList.remove('resizing')
      saveLayout()
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      layoutEditor()
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  })

  $('resize-extdock')?.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    const startX = event.clientX
    const startW = layout.extdock
    document.body.classList.add('resizing')
    const move = (ev) => {
      layout.extdock = clamp(startW + (startX - ev.clientX), LAYOUT_MIN_EXTDOCK, Math.min(900, window.innerWidth * 0.6))
      applyLayout()
    }
    const up = () => {
      document.body.classList.remove('resizing')
      saveLayout()
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      layoutEditor()
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  })

  $('resize-panel')?.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    setPanelOpen(true)
    const startY = event.clientY
    const startH = layout.panel
    document.body.classList.add('resizing-panel')
    const move = (ev) => {
      layout.panel = clamp(startH + (startY - ev.clientY), 80, Math.min(480, window.innerHeight * 0.5))
      applyLayout()
    }
    const up = () => {
      document.body.classList.remove('resizing-panel')
      saveLayout()
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      layoutEditor()
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  })
}

function loadMonaco() {
  if (state.monacoLoadPromise) return state.monacoLoadPromise
  state.monacoLoadPromise = new Promise((resolve, reject) => {
    if (state.monacoReady && window.monaco) {
      resolve()
      return
    }
    const vs = '../../node_modules/monaco-editor/min/vs'
    const loader = document.createElement('script')
    loader.src = `${vs}/loader.js`
    loader.onload = () => {
      window.require.config({ paths: { vs } })
      window.require(['vs/editor/editor.main'], () => {
        state.monacoReady = true
        window.SoumtokMonacoLanguages?.configure(window.monaco, { workspaceRoot: state.folder })
        if (state.active && activeEditorTab()) {
          renderEditor()
          layoutEditor()
        }
        if (state.agentLiveFile && state.agentBusy) {
          requestAnimationFrame(() => animateAgentReadScan())
        }
        resolve()
      })
    }
    loader.onerror = () => reject(new Error('Could not load the editor engine'))
    document.head.appendChild(loader)
  })
  return state.monacoLoadPromise
}

function ensureMonacoReady() {
  return loadMonaco()
}

function activeEditorTab() {
  const active = normPath(state.active)
  if (!active) return null
  return state.tabs.find((t) => normPath(t.path) === active) || null
}

function bind() {
  window.SoumtokTestHubOnClose = closeTestHub
  const activity = $('activity')
  if (activity && !activity.dataset.sideNavBound) {
    activity.dataset.sideNavBound = '1'
    activity.addEventListener('click', (event) => {
      const btn = event.target.closest('.act[data-side]')
      if (!btn) return
      closeSettings()
      showSide(btn.dataset.side)
    })
  }
  document.querySelectorAll('[data-win]').forEach((btn) => {
    btn.onclick = async () => {
      await api.window(btn.dataset.win)
      if (btn.dataset.win === 'max') {
        api.isWindowMaximized?.().then(syncWinMaxIcon).catch(() => {})
      }
    }
  })
  bindWindowChrome()
  document.querySelectorAll('[data-cmd]').forEach((btn) => {
    btn.onclick = (event) => {
      event.stopPropagation()
      closeMenus()
      COMMANDS.find((c) => c.id === btn.dataset.cmd)?.run()
    }
  })
  document.querySelectorAll('[data-menu]').forEach((btn) => {
    btn.onclick = (event) => {
      event.stopPropagation()
      const list =
        btn.dataset.menu === 'file'
          ? $('file-menu-list')
          : btn.dataset.menu === 'go'
            ? $('go-menu-list')
            : btn.dataset.menu === 'edit'
              ? $('edit-menu-list')
              : btn.parentElement.querySelector('.menu-list')
      const open = list && !list.hidden
      closeMenus()
      if (btn.dataset.menu === 'file') void renderFileMenu()
      if (btn.dataset.menu === 'go') renderGoMenu()
      if (btn.dataset.menu === 'edit') renderEditMenu()
      if (list) list.hidden = open
    }
  })
  void renderFileMenu()
  document.querySelectorAll('#panel-bar .panel-tab').forEach((btn) => {
    btn.onclick = () => showPanel(btn.dataset.panel)
  })
  $('panel-close').onclick = () => setPanelOpen(false)
  $('panel-max')?.addEventListener('click', togglePanelMax)
  $('term-new')?.addEventListener('click', () => void openTerminalPanel(true))
  $('term-kill')?.addEventListener('click', () => window.SoumtokTerminal?.killActive())
  $('output-clear')?.addEventListener('click', () => {
    const log = $('panel-output-log')
    if (log) log.textContent = ''
    syncPanelToolbar('output')
  })
  syncPanelToolbar(document.querySelector('#panel-bar .panel-tab.on')?.dataset.panel || 'terminal')
  $('home-open').onclick = openFolder
  $('home-clone').onclick = cloneRepo
  $('home-ssh').onclick = connectSsh
  $('home-github').onclick = () => api.openGithub()
  $('auth-in').onclick = () => login('in')
  $('auth-up').onclick = () => login('up')
  $('auth-continue')?.addEventListener('click', () => void continueAfterBrowserSignIn())
  $('auth-boot-continue')?.addEventListener('click', () => void continueAfterBrowserSignIn())
  $('home-view-all').onclick = () => {
    recentsLimit = recentsLimit > 5 ? 5 : 12
    renderRecents()
  }
  $('st-git').onclick = () => showSide('git')
  $('st-errors').onclick = () => showPanel('problems')
  $('st-warnings').onclick = () => showPanel('problems')
  $('st-tab-btn').onclick = () => toggleTabCompletionsFromStatus()
  $('st-agent-btn').onclick = openAgentsWindow
  $('st-model-btn').onclick = () => {
    if (!requireUser()) return
    enterWorkbench()
    document.body.classList.remove('agent-off')
    applyAgentDriverUi()
    renderAgentPanel()
    state.agentModelPicker = true
    renderAgentPanel()
    $('agent-model-btn')?.click()
  }
  $('st-cursor').onclick = () => void goToLineFromStatus()
  $('st-user').onclick = () => (state.user ? toggleSettings() : login('in'))
  $('prompt-cancel').onclick = () => closePrompt(null)
  $('prompt-ok').onclick = () => closePrompt($('prompt-input').value)
  $('project-switch-cancel')?.addEventListener('click', () => closeProjectSwitchCard(false))
  $('project-switch-confirm')?.addEventListener('click', () => closeProjectSwitchCard(true))
  $('project-switch')?.addEventListener('click', (ev) => {
    if (ev.target === $('project-switch')) closeProjectSwitchCard(false)
  })
  $('prompt-input').onkeydown = (event) => {
    if (event.key === 'Enter') closePrompt($('prompt-input').value)
    if (event.key === 'Escape') closePrompt(null)
  }
  $('bug-report-cancel')?.addEventListener('click', closeBugReport)
  $('bug-report-done')?.addEventListener('click', closeBugReport)
  $('bug-report-send')?.addEventListener('click', () => void submitBugReport())
  $('bug-report')?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeBugReport()
  })
  $('trust-publisher-cancel').onclick = () => closeTrustPublisher(false)
  $('trust-publisher-install').onclick = () => closeTrustPublisher(true)
  $('trust-publisher-learn').onclick = () => {
    void api.openUrl?.('https://code.visualstudio.com/docs/editor/extension-marketplace#_extension-verification')
  }
  $('trust-publisher')?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeTrustPublisher(false)
  })
  document.addEventListener('click', closeMenus)
  document.addEventListener('keydown', onKeys)
  bindTabScroll()
  ensureExtHoverCard()
  if (!window.__extHoverScrollBound) {
    window.__extHoverScrollBound = true
    document.addEventListener('scroll', hideExtMarketHover, true)
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.ext-manage-wrap')) closeExtManageMenus()
  })
}

function closeMenus() {
  document.querySelectorAll('.menu-list').forEach((list) => {
    list.hidden = true
  })
  const fileMenu = $('file-menu-list')
  if (fileMenu) fileMenu.hidden = true
  const goMenu = $('go-menu-list')
  if (goMenu) goMenu.hidden = true
  const editMenu = $('edit-menu-list')
  if (editMenu) editMenu.hidden = true
}

function onKeys(event) {
  if (event.target?.closest?.('.xterm')) return
  const key = event.key.toLowerCase()
  if (event.key === 'Escape') {
    closeMenus()
    closePalette()
    if (state.settingsOpen) closeSettings()
  }
  if (event.altKey && event.key === 'ArrowLeft') {
    event.preventDefault()
    goBack()
  }
  if (event.altKey && event.key === 'ArrowRight') {
    event.preventDefault()
    goForward()
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'p') {
    event.preventDefault()
    openPalette()
  }
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'p') {
    event.preventDefault()
    openQuickOpen()
  }
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'g') {
    event.preventDefault()
    void goToLineFromStatus()
  }
  if (key === 'f8' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault()
    runMonacoGoAction(event.shiftKey ? 'editor.action.marker.prev' : 'editor.action.marker.next')
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'o') {
    event.preventDefault()
    runMonacoGoAction('editor.action.quickOutline')
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === '\\') {
    event.preventDefault()
    runMonacoGoAction('editor.action.jumpToBracket')
  }
  if ((event.ctrlKey || event.metaKey) && key === 'tab') {
    event.preventDefault()
    switchEditorTab(event.shiftKey ? -1 : 1)
  }
  if (isMonacoFocused() && (event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'z') {
    event.preventDefault()
    runMonacoAction('editor.action.undo')
  }
  if (isMonacoFocused() && (event.ctrlKey || event.metaKey) && key === 'y') {
    event.preventDefault()
    runMonacoAction('editor.action.redo')
  }
  if (isMonacoFocused() && (event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'x') {
    event.preventDefault()
    runMonacoAction('editor.action.clipboardCutAction')
  }
  if (isMonacoFocused() && (event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'c') {
    event.preventDefault()
    runMonacoAction('editor.action.clipboardCopyAction')
  }
  if (isMonacoFocused() && (event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'v') {
    event.preventDefault()
    runMonacoAction('editor.action.clipboardPasteAction')
  }
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'f') {
    if (state.editor) {
      event.preventDefault()
      runMonacoAction('actions.find')
    }
  }
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'h') {
    if (state.editor) {
      event.preventDefault()
      runMonacoAction('editor.action.startFindReplaceAction')
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'f') {
    event.preventDefault()
    openFindInFiles()
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'h') {
    event.preventDefault()
    openReplaceInFiles()
  }
  if (isMonacoFocused() && (event.ctrlKey || event.metaKey) && !event.shiftKey && key === '/') {
    event.preventDefault()
    runMonacoAction('editor.action.commentLine')
  }
  if (isMonacoFocused() && event.shiftKey && event.altKey && key === 'a') {
    event.preventDefault()
    runMonacoAction('editor.action.blockComment')
  }
  if ((event.ctrlKey || event.metaKey) && key === 's') {
    event.preventDefault()
    if (event.shiftKey) void saveActiveAs()
    else void saveActive()
  }
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'n') {
    event.preventDefault()
    newTextFile()
  }
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'o') {
    event.preventDefault()
    void openFileFromDialog()
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'n') {
    event.preventDefault()
    api.newWindow()
  }
  if ((event.ctrlKey || event.metaKey) && event.altKey && key === 'n') {
    event.preventDefault()
    switchToAgentsWindow()
  }
  if (key === 'f4' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    closeActiveEditorTab()
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === '`') {
    event.preventDefault()
    void openTerminalPanel(false)
  }
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && key === '`') {
    event.preventDefault()
    togglePanel()
  }
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'j') {
    event.preventDefault()
    void openTerminalPanel(false)
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'b') {
    event.preventDefault()
    runBuildTask()
  }
  if ((event.ctrlKey || event.metaKey) && key === 'r') {
    event.preventDefault()
    location.reload()
  }
  if ((event.ctrlKey || event.metaKey) && key === 'i') {
    event.preventDefault()
    openAgentsWindow()
    showSide('agent')
  }
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'k') {
    event.preventDefault()
    const host = $('editor')
    if (host && window.SoumtokEditorAi) window.SoumtokEditorAi.openInlineEdit(host)
  }
  if (state.settingsOpen && (event.ctrlKey || event.metaKey) && key === 'f') {
    event.preventDefault()
    $('settings-search')?.focus()
  }
}

async function openFolder(stayOnSide) {
  if (!requireUser()) return
  await switchToProject({ pickFolder: true, stayOnSide })
}

function newTextFile() {
  if (!requireUser()) return
  enterWorkbench()
  const n = state.tabs.filter((t) => t.untitled || String(t.path || '').startsWith('untitled:')).length + 1
  const name = `Untitled-${n}`
  const tab = { path: `untitled:${name}`, name, text: '', untitled: true }
  state.tabs.push(tab)
  state.active = tab.path
  state.dirty.set(tab.path, true)
  renderTabs()
  renderEditor()
  scheduleWorkspaceSave()
}

async function openFileFromDialog() {
  if (!requireUser()) return
  const picked = await api.openFileDialog?.()
  if (!picked?.path) return
  await openFile({ path: picked.path, name: picked.name, type: 'file' })
}

async function openWorkspaceFromFile() {
  if (!requireUser()) return
  if (!(await confirmLeaveCurrentProject({ pickFolder: true }))) return
  showProjectSwitchProgress('Saving project session…')
  try {
    await persistCurrentProjectSession()
    clearProjectUiForSwitch()
    window.SoumtokTerminal?.killAll?.()
    showProjectSwitchProgress('Opening workspace file…')
    const res = await api.openWorkspaceFile?.()
    if (!res) {
      hideProjectSwitchProgress()
      await refreshTree()
      return
    }
    if (res.error) {
      hideProjectSwitchProgress()
      await askPrompt(res.error, '', true)
      await refreshTree()
      return
    }
    state.workspaceFilePath = res.workspacePath || null
    state.workspaceExtraFolders = Array.isArray(res.extraFolders) ? res.extraFolders.slice() : []
    showProjectSwitchProgress(`Loading ${projectFolderLabel(res.folder)}…`)
    await enterProject()
    hideProjectSwitchProgress()
  } catch (err) {
    hideProjectSwitchProgress()
    await refreshTree()
  }
}

async function addFolderToWorkspace() {
  if (!requireUser()) return
  if (!state.folder) {
    await openFolder()
    return
  }
  const picked = await api.pickFolder?.()
  if (!picked) return
  if (workspacePathsEqual(picked, state.folder)) return
  if (state.workspaceExtraFolders.some((p) => workspacePathsEqual(p, picked))) return
  state.workspaceExtraFolders.push(picked)
  await refreshTree()
  scheduleWorkspaceSave()
}

async function saveWorkspaceAsFile() {
  if (!requireUser()) return
  const folders = workspaceFolderPaths()
  if (!folders.length) {
    await askPrompt('Open a folder first.', '', true)
    return
  }
  const res = await api.saveWorkspaceAs?.({
    folders,
    defaultName: state.workspaceFilePath
      ? pathBasename(state.workspaceFilePath)
      : `${projectFolderLabel(state.folder)}.code-workspace`,
  })
  if (res?.path) state.workspaceFilePath = res.path
}

async function duplicateWorkspaceFile() {
  if (!requireUser()) return
  if (!state.workspaceFilePath) {
    await saveWorkspaceAsFile()
    return
  }
  const res = await api.duplicateWorkspace?.(state.workspaceFilePath)
  if (res?.path) state.workspaceFilePath = res.path
}

function pathBasename(p) {
  return String(p || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .pop()
}

async function saveActiveAs() {
  const tab = activeEditorTab()
  if (!tab || isImageTab(tab) || isBrowserTab(tab) || isExtensionTab(tab)) return
  if (isDotEnvTab(tab) && tab.envEditorMode !== 'text' && tab.envPairs) {
    tab.text = window.SoumtokEnvEditor.serializeDotEnv(tab.envComments, tab.envPairs)
  } else if (state.editor) {
    tab.text = state.editor.getValue()
  }
  const res = await api.saveFileAs?.({ path: tab.untitled ? undefined : tab.path, contents: tab.text })
  if (!res?.path) return
  const oldPath = tab.path
  tab.path = res.path
  tab.name = res.name
  tab.untitled = false
  state.dirty.delete(oldPath)
  if (state.active === oldPath) state.active = tab.path
  state.dirty.delete(tab.path)
  renderTabs()
  renderEditor()
  await refreshTree()
  void refreshGit()
  scheduleWorkspaceSave()
}

async function saveAllDirty() {
  const paths = [...state.dirty.keys()]
  for (const p of paths) {
    if (!state.dirty.get(p)) continue
    const prev = state.active
    state.active = p
    renderEditor()
    await saveActive()
    state.active = prev
  }
  renderEditor()
}

function toggleAutoSave() {
  setAutoSaveOn(!isAutoSaveOn())
}

async function revertActiveFile() {
  const tab = activeEditorTab()
  if (!tab || tab.untitled) return
  if (!window.confirm(`Revert “${tab.name}”? Unsaved changes will be lost.`)) return
  if (isImageTab(tab)) {
    await loadImageTab(tab)
    state.dirty.delete(tab.path)
    renderEditor()
    return
  }
  const text = await api.readFile(tab.path)
  tab.text = text
  state.dirty.delete(tab.path)
  renderTabs()
  renderEditor()
}

function closeActiveEditorTab() {
  if (!state.active) return
  closeTab(state.active)
}

async function closeProjectFolder() {
  if (!requireUser()) return
  if (!(await currentOpenProjectPath())) {
    setMode('home')
    await renderRecents()
    return
  }
  await persistCurrentProjectSession()
  resetWorkspaceSessionState()
  await api.closeFolder?.()
  state.folder = null
  state.tree = []
  setMode('home')
  await renderRecents()
  renderEditor()
  $('tb-center').textContent = ''
}

function switchToAgentsWindow() {
  openAgentsWindow()
  showSide('agent')
  document.body.classList.remove('agent-off')
  applyAgentDriverUi()
  renderAgentPanel()
}

async function shareCopyProjectPath() {
  const p = state.folder || (await currentOpenProjectPath())
  if (!p) return
  try {
    await navigator.clipboard.writeText(p)
  } catch {
    await askPrompt('Path', p, true)
  }
}

async function shareRevealProjectFolder() {
  const p = state.folder || (await currentOpenProjectPath())
  if (!p) return
  await api.showItemInFolder?.(p)
}

function runMenuCommand(cmd) {
  if (!cmd) return
  if (cmd.startsWith('recent:')) {
    void openRecent(cmd.slice(7))
    return
  }
  COMMANDS.find((c) => c.id === cmd)?.run?.()
}

async function renderFileMenu() {
  const host = $('file-menu-list')
  if (!host) return
  const recents = ((await api.recents()) || []).slice(0, 12)
  const autoOn = isAutoSaveOn()
  const saveAllDisabled = state.dirty.size === 0
  const rows = []
  const pushBtn = (cmd, label, opts = {}) => {
    const kbd = opts.kbd ? `<span class="menu-kbd">${escapeHtml(opts.kbd)}</span>` : ''
    const dis = opts.disabled ? ' disabled' : ''
    const chk = opts.check != null ? ` menu-check${opts.check ? ' on' : ''}` : ''
    rows.push(
      `<button type="button" class="menu-item-row${chk}" data-cmd="${escapeAttr(cmd)}" role="menuitem"${dis}>${escapeHtml(label)}${kbd}</button>`,
    )
  }
  const pushSep = () => rows.push('<hr class="menu-sep" />')
  pushBtn('new-text-file', 'New Text File', { kbd: 'Ctrl+N' })
  pushBtn('new-window', 'New Window', { kbd: 'Ctrl+Shift+N' })
  pushBtn('switch-agents', 'Switch to Agents Window', { kbd: 'Ctrl+Alt+N' })
  rows.push(`<div class="menu-submenu-wrap" role="none">
    <button type="button" class="menu-submenu-trigger menu-item-row" tabindex="0">New Window with Profile</button>
    <div class="menu-submenu" role="menu">
      <button type="button" class="menu-item-row" data-cmd="new-window" role="menuitem">Default</button>
      <button type="button" class="menu-item-row" data-cmd="new-window-signed" role="menuitem">Signed-in profile</button>
    </div></div>`)
  pushSep()
  pushBtn('open-file', 'Open File…', { kbd: 'Ctrl+O' })
  pushBtn('folder', 'Open Folder…', { kbd: 'Ctrl+K Ctrl+O' })
  pushBtn('open-workspace', 'Open Workspace from File…')
  const recentItems = recents.length
    ? recents
        .map(
          (item) =>
            `<button type="button" class="menu-item-row" data-cmd="recent:${escapeAttr(item.path)}" role="menuitem" title="${escapeAttr(item.path)}">${escapeHtml(item.name)}</button>`,
        )
        .join('')
    : '<p class="menu-submenu-empty">No recent folders</p>'
  rows.push(`<div class="menu-submenu-wrap" role="none">
    <button type="button" class="menu-submenu-trigger menu-item-row" tabindex="0">Open Recent</button>
    <div class="menu-submenu menu-list-wide" role="menu">${recentItems}</div></div>`)
  pushSep()
  pushBtn('add-folder-workspace', 'Add Folder to Workspace…')
  pushBtn('save-workspace-as', 'Save Workspace As…')
  pushBtn('duplicate-workspace', 'Duplicate Workspace')
  pushSep()
  pushBtn('save', 'Save', { kbd: 'Ctrl+S' })
  pushBtn('save-as', 'Save As…', { kbd: 'Ctrl+Shift+S' })
  pushBtn('save-all', 'Save All', { kbd: 'Ctrl+K S', disabled: saveAllDisabled })
  pushSep()
  rows.push(`<div class="menu-submenu-wrap" role="none">
    <button type="button" class="menu-submenu-trigger menu-item-row" tabindex="0">Share</button>
    <div class="menu-submenu" role="menu">
      <button type="button" class="menu-item-row" data-cmd="share-copy-path" role="menuitem">Copy Path of Project Root</button>
      <button type="button" class="menu-item-row" data-cmd="share-reveal" role="menuitem">Reveal Project Folder in File Explorer</button>
    </div></div>`)
  pushBtn('auto-save', 'Auto Save', { check: autoOn })
  rows.push(`<div class="menu-submenu-wrap" role="none">
    <button type="button" class="menu-submenu-trigger menu-item-row" tabindex="0">Preferences</button>
    <div class="menu-submenu" role="menu">
      <button type="button" class="menu-item-row" data-cmd="preferences" role="menuitem">Settings</button>
      <button type="button" class="menu-item-row" data-cmd="account" role="menuitem">Account</button>
    </div></div>`)
  pushSep()
  pushBtn('revert-file', 'Revert File')
  pushBtn('close-editor', 'Close Editor', { kbd: 'Ctrl+F4' })
  pushBtn('close-folder', 'Close Folder', { kbd: 'Ctrl+K F' })
  pushBtn('close-window', 'Close Window', { kbd: 'Alt+F4' })
  pushSep()
  pushBtn('exit', 'Exit')
  host.innerHTML = rows.join('\n')
  host.querySelectorAll('[data-cmd]').forEach((btn) => {
    btn.onclick = (event) => {
      event.stopPropagation()
      closeMenus()
      runMenuCommand(btn.dataset.cmd)
    }
  })
}

function canGoBack() {
  return historyAt > 0 && tabHistory.length > 1
}

function canGoForward() {
  return historyAt >= 0 && historyAt < tabHistory.length - 1
}

function renderGoMenu() {
  const host = $('go-menu-list')
  if (!host) return
  const hasEditor = Boolean(state.editor && activeEditorTab())
  const hasProject = Boolean(state.folder)
  const rows = []
  const pushBtn = (cmd, label, opts = {}) => {
    const kbd = opts.kbd ? `<span class="menu-kbd">${escapeHtml(opts.kbd)}</span>` : ''
    const dis = opts.disabled ? ' disabled' : ''
    rows.push(
      `<button type="button" class="menu-item-row" data-cmd="${escapeAttr(cmd)}" role="menuitem"${dis}>${escapeHtml(label)}${kbd}</button>`,
    )
  }
  const pushSep = () => rows.push('<hr class="menu-sep" />')
  pushBtn('back', 'Back', { kbd: 'Alt+Left', disabled: !canGoBack() })
  pushBtn('forward', 'Forward', { kbd: 'Alt+Right', disabled: !canGoForward() })
  pushBtn('go-last-edit', 'Last Edit Location', { disabled: !lastEditLocation })
  pushSep()
  pushBtn('go-next-editor', 'Next Editor', { kbd: 'Ctrl+Tab', disabled: state.tabs.length < 2 })
  pushBtn('go-prev-editor', 'Previous Editor', { kbd: 'Ctrl+Shift+Tab', disabled: state.tabs.length < 2 })
  pushSep()
  pushBtn('go-to-file', 'Go to File…', { kbd: 'Ctrl+P', disabled: !hasProject })
  pushBtn('go-symbol-editor', 'Go to Symbol in Editor…', { kbd: 'Ctrl+Shift+O', disabled: !hasEditor })
  pushSep()
  pushBtn('go-to-line', 'Go to Line/Column…', { kbd: 'Ctrl+G', disabled: !hasEditor })
  pushBtn('go-to-bracket', 'Go to Bracket', { kbd: 'Ctrl+Shift+\\', disabled: !hasEditor })
  pushSep()
  pushBtn('go-next-problem', 'Next Problem', { kbd: 'F8' })
  pushBtn('go-prev-problem', 'Previous Problem', { kbd: 'Shift+F8' })
  pushSep()
  pushBtn('files', 'Explorer')
  host.innerHTML = rows.join('\n')
  host.querySelectorAll('[data-cmd]').forEach((btn) => {
    btn.onclick = (event) => {
      event.stopPropagation()
      closeMenus()
      runMenuCommand(btn.dataset.cmd)
    }
  })
}

function isMonacoFocused() {
  if (!state.editor) return false
  const root = state.editor.getDomNode()
  const active = document.activeElement
  return Boolean(root && active && root.contains(active))
}

function canEditorUndo() {
  return Boolean(state.editor?.getModel()?.canUndo?.())
}

function canEditorRedo() {
  return Boolean(state.editor?.getModel()?.canRedo?.())
}

function renderEditMenu() {
  const host = $('edit-menu-list')
  if (!host) return
  const hasEditor = Boolean(state.editor && activeEditorTab())
  const hasProject = Boolean(state.folder)
  const rows = []
  const pushBtn = (cmd, label, opts = {}) => {
    const kbd = opts.kbd ? `<span class="menu-kbd">${escapeHtml(opts.kbd)}</span>` : ''
    const dis = opts.disabled ? ' disabled' : ''
    rows.push(
      `<button type="button" class="menu-item-row" data-cmd="${escapeAttr(cmd)}" role="menuitem"${dis}>${escapeHtml(label)}${kbd}</button>`,
    )
  }
  const pushSep = () => rows.push('<hr class="menu-sep" />')
  pushBtn('edit-undo', 'Undo', { kbd: 'Ctrl+Z', disabled: !hasEditor || !canEditorUndo() })
  pushBtn('edit-redo', 'Redo', { kbd: 'Ctrl+Y', disabled: !hasEditor || !canEditorRedo() })
  pushSep()
  pushBtn('edit-cut', 'Cut', { kbd: 'Ctrl+X', disabled: !hasEditor })
  pushBtn('edit-copy', 'Copy', { kbd: 'Ctrl+C', disabled: !hasEditor })
  pushBtn('edit-paste', 'Paste', { kbd: 'Ctrl+V', disabled: !hasEditor })
  pushSep()
  pushBtn('edit-find', 'Find', { kbd: 'Ctrl+F', disabled: !hasEditor })
  pushBtn('edit-replace', 'Replace', { kbd: 'Ctrl+H', disabled: !hasEditor })
  pushSep()
  pushBtn('edit-find-files', 'Find in Files', { kbd: 'Ctrl+Shift+F', disabled: !hasProject })
  pushBtn('edit-replace-files', 'Replace in Files', { kbd: 'Ctrl+Shift+H', disabled: !hasProject })
  pushSep()
  pushBtn('edit-line-comment', 'Toggle Line Comment', { kbd: 'Ctrl+/', disabled: !hasEditor })
  pushBtn('edit-block-comment', 'Toggle Block Comment', { kbd: 'Shift+Alt+A', disabled: !hasEditor })
  host.innerHTML = rows.join('\n')
  host.querySelectorAll('[data-cmd]').forEach((btn) => {
    btn.onclick = (event) => {
      event.stopPropagation()
      closeMenus()
      runMenuCommand(btn.dataset.cmd)
    }
  })
}

function openFindInFiles(prefill = '') {
  if (!requireUser()) return
  if (!state.folder) {
    void askPrompt('Open a folder first to search across files.', '', true)
    return
  }
  workspaceSearchUi = {
    showReplace: false,
    query: prefill || workspaceSearchUi.query || '',
    replace: workspaceSearchUi.replace || '',
  }
  showSide('search')
}

function openReplaceInFiles() {
  if (!requireUser()) return
  if (!state.folder) {
    void askPrompt('Open a folder first to replace across files.', '', true)
    return
  }
  workspaceSearchUi = {
    showReplace: true,
    query: workspaceSearchUi.query || '',
    replace: workspaceSearchUi.replace || '',
  }
  showSide('search')
}

async function reloadTabsAfterWorkspaceWrite(paths) {
  const touched = new Set((paths || []).map((p) => normPath(p)))
  for (const tab of state.tabs) {
    if (tab.untitled || state.dirty.has(tab.path)) continue
    if (!touched.has(normPath(tab.path))) continue
    try {
      tab.text = await api.readFile(tab.path)
    } catch {
      /* ignore */
    }
  }
  if (state.active) renderEditor()
}

async function runWorkspaceReplaceAll() {
  const q = $('search-q')?.value?.trim() || ''
  const rep = $('search-replace')?.value ?? ''
  if (!q) return
  const ok = await confirmLeaveCurrentProject({
    intent: 'replace',
    title: 'Replace across files?',
    body: `Replace all matches of “${q}” with “${rep}” in the workspace? This cannot be undone automatically.`,
    confirmLabel: 'Replace All',
  }).catch(() => false)
  if (!ok) return
  const res = await api.workspaceReplaceAll({ pattern: q, replacement: rep })
  if (!res?.ok) {
    await askPrompt(res?.error || 'Replace failed.', '', true)
    return
  }
  await reloadTabsAfterWorkspaceWrite(res.paths || [])
  void runWorkspaceSearch()
  await askPrompt(`Updated ${res.files || 0} file(s), ${res.replacements || 0} replacement(s).`, '', true)
}

async function runWorkspaceSearch() {
  const box = $('search-hits')
  const q = $('search-q')?.value?.trim() || ''
  workspaceSearchUi.query = q
  workspaceSearchUi.replace = $('search-replace')?.value ?? ''
  if (!box) return
  if (!q) {
    box.innerHTML = `<p class="msg">Type to search across project files.</p>`
    return
  }
  if (!state.folder) {
    box.innerHTML = `<p class="msg">Open a folder to search.</p>`
    return
  }
  box.innerHTML = `<p class="msg">Searching…</p>`
  const res = await api.workspaceGrep({ pattern: q, limit: 200 })
  if (!res?.ok) {
    box.innerHTML = `<p class="msg">${escapeHtml(res?.error || 'Search failed.')}</p>`
    return
  }
  const matches = res.matches || []
  if (!matches.length) {
    box.innerHTML = `<p class="msg">No results found.</p>`
    return
  }
  box.innerHTML = matches
    .map(
      (m, i) =>
        `<button type="button" class="search-hit" data-search-idx="${i}"><span class="search-hit-loc">${escapeHtml(m.rel)}:${m.line}</span><span class="search-hit-text">${escapeHtml(m.text)}</span></button>`,
    )
    .join('')
  box._searchMatches = matches
  box.querySelectorAll('.search-hit').forEach((btn) => {
    btn.onclick = () => {
      const m = box._searchMatches?.[Number(btn.dataset.searchIdx)]
      if (!m) return
      void openFile({ path: m.path, name: m.rel.split('/').pop() || m.rel }).then(() => {
        requestAnimationFrame(() => {
          if (!state.editor) return
          state.editor.setPosition({ lineNumber: m.line, column: 1 })
          state.editor.revealLineInCenter(m.line)
          state.editor.focus()
        })
      })
    }
  })
}

function agentThreadsBackupKey(folderPath) {
  const user = state.user?.id || state.user?.email || 'anon'
  const folder = folderPath || state.folder || '_home'
  return `${AGENT_THREADS_BACKUP_PREFIX}:${user}:${normPath(folder).toLowerCase()}`
}

function threadHistoryScore(threads) {
  if (!Array.isArray(threads)) return 0
  return threads.reduce((sum, t) => sum + (Array.isArray(t.items) ? t.items.length : 0), 0)
}

function readAgentThreadsBackup(folderPath) {
  try {
    const raw = localStorage.getItem(agentThreadsBackupKey(folderPath))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveAgentThreadsBackup(forFolder) {
  if (!state.threads.length) return
  try {
    localStorage.setItem(
      agentThreadsBackupKey(forFolder),
      JSON.stringify({
        threads: state.threads,
        activeThreadId: state.activeThreadId,
        savedAt: Date.now(),
      }),
    )
  } catch {
    /* private mode / quota */
  }
}

function applyBestThreadHistory({ diskThreads, diskActiveId, diskUpdatedAt, backup, legacyMessages }) {
  /** @type {{ threads: typeof state.threads, activeThreadId: string | null, score: number, updatedAt: number }} */
  let best = { threads: [], activeThreadId: null, score: 0, updatedAt: 0 }
  const consider = (threads, activeThreadId, score, updatedAt = 0) => {
    if (!Array.isArray(threads) || !threads.length) return
    const at = Number(updatedAt) || 0
    const weighted = score + at / 1e12
    const bestWeighted = best.score + best.updatedAt / 1e12
    if (weighted > bestWeighted) best = { threads, activeThreadId, score, updatedAt: at }
  }
  consider(diskThreads, diskActiveId, threadHistoryScore(diskThreads), diskUpdatedAt ? Date.parse(diskUpdatedAt) : 0)
  consider(backup?.threads, backup?.activeThreadId, threadHistoryScore(backup?.threads), backup?.savedAt || 0)
  if (legacyMessages?.length) {
    ensureThreads()
    const legacyThread = [{ ...activeThread(), items: legacyMessages }]
    consider(legacyThread, legacyThread[0].id, legacyMessages.length, 0)
  }
  if (best.threads.length) {
    state.threads = best.threads
    state.activeThreadId = best.activeThreadId || best.threads[0].id
    return true
  }
  return false
}

async function loadWorkspaceLocal() {
  if (!state.folder) return
  const cache = await api.workspaceLoad()
  if (Array.isArray(cache.workspaceExtraFolders)) {
    state.workspaceExtraFolders = cache.workspaceExtraFolders.filter(Boolean)
  }
  if (cache.workspaceFilePath) state.workspaceFilePath = cache.workspaceFilePath
  const backup = readAgentThreadsBackup(state.folder)
  applyBestThreadHistory({
    diskThreads: cache.threads,
    diskActiveId: cache.activeThreadId,
    diskUpdatedAt: cache.updatedAt,
    backup,
    legacyMessages: cache.messages,
  })
  if (Array.isArray(cache.tabs) && cache.tabs.length) {
    state.tabs = cache.tabs.map(normalizeRestoredTab)
    state.active = cache.active || state.tabs[0]?.path || null
    if (cache.side && ['files', 'search', 'git', 'extensions', 'connectors'].includes(cache.side)) {
      state.side = cache.side
    }
    if (cache.extMarketFilter?.mode) {
      try {
        localStorage.setItem(EXT_MARKET_FILTER_KEY, JSON.stringify(cache.extMarketFilter))
      } catch {
        /* ignore */
      }
    }
    await Promise.all(state.tabs.map((tab) => hydrateRestoredTab(tab)))
    renderTabs()
    syncExtensionMarketSelection()
  }
  if (!state.threads.length) ensureThreads()
  loadPersistedAgentModel()
  syncThreadModelFromGlobal()
  if (Array.isArray(cache.terminals) && cache.terminals.length) {
    window.SoumtokTerminal?.setRestoreLogs?.(cache.terminals)
  }
  if (cache.extDock?.extensionId && !extensionDockOpen()) {
    await restoreExtDock(cache.extDock)
  }
}

function workspaceSavePayload() {
  return {
    workspaceExtraFolders: state.workspaceExtraFolders || [],
    workspaceFilePath: state.workspaceFilePath || null,
    threads: state.threads.map((t) => ({
      id: t.id,
      title: t.title,
      items: t.items,
      modelMessages: t.modelMessages,
      attachedSkills: t.attachedSkills || [],
      attachedPluginSkills: t.attachedPluginSkills || [],
      attachedLocalSkills: t.attachedLocalSkills || [],
      attachedManualSkills: t.attachedManualSkills || [],
      mode: t.mode,
      model: t.model,
      archived: !!t.archived,
      updatedAt: t.updatedAt || 0,
    })),
    activeThreadId: state.activeThreadId,
    tabs: state.tabs.map(serializeTabForSession),
    active: state.active,
    side: state.side,
    terminals: window.SoumtokTerminal?.snapshot?.() || [],
    extMarketFilter: loadExtMarketFilter(),
    extDock: serializeExtDockItem(extensionDockOpen() ? state.extDock?.item : null),
  }
}

async function flushWorkspaceSave(forFolder) {
  const folder = forFolder || state.folder
  if (!folder) {
    saveAgentThreadsBackup(forFolder || '_home')
    saveDevSnapshot()
    return
  }
  saveAgentThreadsBackup(folder)
  saveDevSnapshot()
  await api.workspaceSave({ ...workspaceSavePayload(), path: folder })
}

function flushWorkspaceSaveSync(forFolder) {
  if (workspaceSaveTimer) {
    clearTimeout(workspaceSaveTimer)
    workspaceSaveTimer = null
  }
  const folder = forFolder || state.folder
  saveAgentThreadsBackup(folder || '_home')
  saveDevSnapshot()
  if (!folder) return false
  try {
    return api.workspaceSaveSync({ ...workspaceSavePayload(), path: folder })
  } catch {
    return false
  }
}

if (typeof window !== 'undefined') {
  window.__soumtokFlushWorkspace = () => flushWorkspaceSaveSync()
}

function resetWorkspaceSessionState() {
  state.tabs = []
  state.active = null
  state.threads = []
  state.activeThreadId = null
  tabHistory = []
  historyAt = -1
  state.workspaceExtraFolders = []
  state.extraRoots = []
  state.workspaceFilePath = null
  state.folder = null
  state.tree = []
  state.dirty.clear()
}

function projectFolderLabel(folderPath) {
  if (!folderPath) return 'this project'
  const parts = String(folderPath).replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || folderPath
}

let projectSwitchResolver = null

function askProjectSwitchCard({ currentPath, nextPath, pickFolder, intent }) {
  const currentName = projectFolderLabel(currentPath)
  const nextName = nextPath ? projectFolderLabel(nextPath) : ''
  if (intent === 'clone') {
    $('project-switch-title').textContent = 'Clone into a new project?'
    $('project-switch-body').textContent = `Save agent chats, tabs, and layout for “${currentName}”, then open the cloned repository.`
    $('project-switch-confirm').textContent = 'Save session & clone'
  } else if (pickFolder) {
    $('project-switch-title').textContent = 'Open another folder?'
    $('project-switch-body').textContent = `Soumtok will save agent chats, open tabs, and layout for “${currentName}” on this PC, then let you pick a new folder.`
    $('project-switch-confirm').textContent = 'Save session & choose folder…'
  } else {
    $('project-switch-title').textContent = 'Switch project?'
    $('project-switch-body').textContent = `Save the session for “${currentName}” (chats, tabs, layout) and open “${nextName}”?`
    $('project-switch-confirm').textContent = 'Save session & open'
  }
  const nextEl = $('project-switch-next')
  if (nextPath && !pickFolder && intent !== 'clone') {
    nextEl.textContent = nextPath
    nextEl.hidden = false
  } else {
    nextEl.textContent = ''
    nextEl.hidden = true
  }
  $('project-switch').hidden = false
  return new Promise((resolve) => {
    projectSwitchResolver = resolve
  })
}

function closeProjectSwitchCard(confirmed) {
  $('project-switch').hidden = true
  const done = projectSwitchResolver
  projectSwitchResolver = null
  done?.(Boolean(confirmed))
}

async function currentOpenProjectPath() {
  const info = await api.info()
  return state.folder || info.folder || null
}

function workspacePathsEqual(a, b) {
  if (!a || !b) return false
  return normPath(a).toLowerCase() === normPath(b).toLowerCase()
}

async function persistCurrentProjectSession() {
  if (workspaceSaveTimer) {
    clearTimeout(workspaceSaveTimer)
    workspaceSaveTimer = null
  }
  if (state.agentBusy) cancelAgentRunForThread(state.agentRunThreadId)
  const saveRoot = state.folder || (await api.info()).folder
  const dirtyPaths = [...state.dirty.keys()].filter((p) => !String(p).startsWith('untitled:'))
  for (const p of dirtyPaths) {
    if (!state.dirty.get(p)) continue
    const prev = state.active
    state.active = p
    renderEditor()
    await saveActive()
    state.active = prev
  }
  if (saveRoot) await flushWorkspaceSave(saveRoot)
  saveDevSnapshot()
}

function showProjectSwitchProgress(message) {
  const el = $('project-switch-progress')
  const msg = $('project-switch-progress-msg')
  if (msg && message) msg.textContent = message
  if (el) el.hidden = false
}

function hideProjectSwitchProgress() {
  const el = $('project-switch-progress')
  if (el) el.hidden = true
}

function clearProjectUiForSwitch() {
  closeSettings()
  resetWorkspaceSessionState()
  renderTabs()
  renderEditor()
  renderAgentPanel()
  $('tb-center').textContent = ''
  const treeHost = $('tree')
  if (treeHost) treeHost.innerHTML = ''
}

/** Ask only — save happens in switchToProject with progress UI. */
async function confirmLeaveCurrentProject({ nextPath, pickFolder, intent }) {
  const currentPath = await currentOpenProjectPath()
  if (!currentPath) return true
  if (nextPath && workspacePathsEqual(currentPath, nextPath)) return false
  return askProjectSwitchCard({
    currentPath,
    nextPath,
    pickFolder: Boolean(pickFolder),
    intent,
  })
}

/**
 * Save current project, show progress, open new folder (picker or path).
 * @returns {Promise<boolean>}
 */
async function switchToProject({ pickFolder, nextPath, intent, stayOnSide } = {}) {
  if (!(await confirmLeaveCurrentProject({ nextPath, pickFolder, intent }))) return false
  showProjectSwitchProgress('Saving project session…')
  try {
    await persistCurrentProjectSession()
    showProjectSwitchProgress('Closing current project…')
    clearProjectUiForSwitch()
    window.SoumtokTerminal?.killAll?.()
    let newFolder = null
    if (pickFolder) {
      showProjectSwitchProgress('Choose a folder…')
      newFolder = await api.openFolder()
    } else if (nextPath) {
      showProjectSwitchProgress(`Opening ${projectFolderLabel(nextPath)}…`)
      newFolder = await api.openPath(nextPath)
    }
    if (!newFolder) {
      hideProjectSwitchProgress()
      await refreshTree()
      return false
    }
    showProjectSwitchProgress(`Loading ${projectFolderLabel(newFolder)}…`)
    state.workspaceFilePath = null
    state.workspaceExtraFolders = []
    await enterProject(stayOnSide)
    hideProjectSwitchProgress()
    return true
  } catch (err) {
    hideProjectSwitchProgress()
    console.error('switchToProject', err)
    await askPrompt(String(err?.message || err || 'Could not switch project'), '', true)
    await refreshTree()
    return false
  }
}

function scheduleWorkspaceSave() {
  if (workspaceSaveTimer) clearTimeout(workspaceSaveTimer)
  workspaceSaveTimer = setTimeout(() => {
    void flushWorkspaceSave()
  }, 400)
}

async function reopenLastProjectFolder() {
  const info = await api.info()
  const target = state.folder || info.folder || info.lastFolder
  if (!target || typeof target !== 'string') return false
  const opened = await api.openPath(target)
  if (!opened) return false
  const after = await api.info()
  return Boolean(after.folder)
}

async function enterProject(stayOnSide) {
  const info = await api.info()
  if (!info.folder) {
    await refreshTree()
    if (!state.folder) {
      setMode('home')
      await renderRecents()
    }
    return
  }
  state.folder = info.folder
  setMode('project')
  document.body.classList.remove('agent-off')
  applyAgentDriverUi()
  await loadWorkspaceLocal()
  await refreshTree()
  const side = typeof stayOnSide === 'string' && stayOnSide !== 'account' ? stayOnSide : 'files'
  state.side = side
  document.querySelectorAll('#activity .act').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.side === side)
  })
  showSide(side)
  renderAgentPanel()
  window.SoumtokTerminal?.setProjectCwd(state.folder)
  if (window.monaco) window.SoumtokMonacoLanguages?.applyWorkspaceTsconfig?.(window.monaco, state.folder)
  renderEditor()
  scheduleWorkspaceSave()
}

function setMode(mode) {
  document.body.classList.remove('mode-home', 'mode-project', 'mode-auth')
  document.body.classList.add(`mode-${mode}`)
  if (mode === 'auth') mountAuthGateAvatar()
}

function updateAuthContinueUi() {
  const waiting = Boolean(pendingLoginId)
  for (const id of ['auth-continue', 'auth-boot-continue']) {
    const el = $(id)
    if (el) el.hidden = !waiting
  }
}

function mountAuthGateAvatar() {
  const host = $('auth-gate-avatar-host')
  if (!host || !window.SoumtokAgentAvatar || state.user) return
  window.SoumtokAgentAvatar.mount(host, { size: 80 })
  window.SoumtokAgentAvatar.setState('idle')
}

function ensureAppShellVisible() {
  if (!state.user) {
    setMode('auth')
    const gate = $('auth-gate')
    const boot = $('auth-boot')
    if (boot) boot.hidden = true
    if (gate) gate.hidden = false
    mountAuthGateAvatar()
    return
  }
  if (!document.body.classList.contains('mode-home') && !document.body.classList.contains('mode-project')) {
    if (state.folder) {
      setMode('project')
      if (state.side === 'account' || !['files', 'search', 'git', 'extensions', 'connectors'].includes(state.side)) {
        state.side = 'files'
      }
      document.querySelectorAll('#activity .act').forEach((btn) => {
        btn.classList.toggle('on', btn.dataset.side === state.side)
      })
      showSide(state.side)
      renderAgentPanel()
      renderEditor()
    } else {
      setMode('home')
      void renderRecents()
    }
  }
}

function finishAuthBoot() {
  const boot = $('auth-boot')
  const gate = $('auth-gate')
  if (boot) boot.hidden = true
  document.body.classList.remove('auth-booting')
  window.SoumtokAgentAvatar?.setState('idle')
  window.SoumtokAgentAvatar?.destroyAuthBoot?.()
  if (gate) gate.hidden = Boolean(state.user)
  ensureAppShellVisible()
}

function setAuthBootLoading(on, message) {
  const boot = $('auth-boot')
  const gate = $('auth-gate')
  const msg = $('auth-boot-msg')
  if (!boot || !gate) return
  if (on) {
    boot.hidden = false
    gate.hidden = true
    document.body.classList.add('auth-booting')
    if (msg && message) msg.textContent = message
    mountAuthBootAvatar()
    window.SoumtokAgentAvatar?.setState('thinking')
  } else {
    finishAuthBoot()
  }
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(label || 'Timed out')), ms)
    }),
  ])
}

function mountAuthBootAvatar() {
  const host = $('auth-avatar-host')
  if (!host || !window.SoumtokAgentAvatar) return
  window.SoumtokAgentAvatar.mount(host, { size: 96 })
  window.SoumtokAgentAvatar.setState('thinking')
}

async function openSignedInWorkspace() {
  if (await reopenLastProjectFolder()) {
    await enterProject('files')
  }
  if (!state.folder) {
    await refreshTree()
  }
  if (state.folder) {
    await loadWorkspaceLocal()
    state.side = 'files'
    showSide('files')
    setMode('project')
    renderEditor()
    renderAgentPanel()
    return
  }
  applyBestThreadHistory({ backup: readAgentThreadsBackup('_home') })
  ensureThreads()
  renderAgentPanel()
  setMode('home')
  await renderRecents()
}

/** Home / project shell after a valid session (dashboard in the app). */
async function completeSignedInEntry() {
  if (!state.user) return false
  $('st-user').textContent = state.user.email || state.user.name || 'Signed in'
  void loadUserProfile()
  setAuthBootLoading(true, 'Opening your workspace…')
  try {
    await withTimeout(openSignedInWorkspace(), 15000, 'Opening workspace')
  } catch (err) {
    console.error('completeSignedInEntry', err)
    if (state.folder) {
      setMode('project')
      showSide(state.side || 'files')
      renderEditor()
    } else {
      setMode('home')
      try {
        await renderRecents()
      } catch {
        /* ignore */
      }
    }
  }
  updateStatus()
  updateAuthContinueUi()
  setAuthBootLoading(false)
  return true
}

/** Leave the sign-in gate whenever we have a valid session. */
async function enterSignedInUi() {
  if (!state.user) {
    setAuthBootLoading(false)
    setMode('auth')
    return
  }
  await completeSignedInEntry()
}

async function continueAfterBrowserSignIn() {
  const note = $('auth-note')
  setAuthBootLoading(true, 'Checking sign-in…')
  if (pendingLoginId) {
    const ok = await tryPollLogin()
    if (ok) return
  }
  await refreshSession()
  if (state.user) {
    stopLoginPoll()
    pendingLoginId = ''
    try {
      sessionStorage.removeItem('soumtok-desktop-pending')
    } catch {
      /* ignore */
    }
    if (note) note.textContent = ''
    await completeSignedInEntry()
    await syncModelCatalogForSession()
    return
  }
  setAuthBootLoading(false)
  mountAuthGateAvatar()
  if (note) {
    note.textContent =
      'Still waiting. In the browser, finish sign-in until you see “You can return to the app”, then tap Continue in app again.'
  }
}

function requireUser() {
  if (state.user) {
    if (document.body.classList.contains('mode-auth')) {
      void enterSignedInUi()
    }
    return true
  }
  setMode('auth')
  return false
}

function toggleSidebar() {
  if (!requireUser()) return
  enterWorkbench()
  document.body.classList.toggle('sidebar-off')
}

function enterWorkbench(opts = {}) {
  if (document.body.classList.contains('mode-auth')) return
  const allowNoFolder = Boolean(opts.allowNoFolder)
  if (!state.folder && !allowNoFolder) return
  if (!document.body.classList.contains('mode-project')) {
    setMode('project')
    renderEditor()
    void refreshExtensionActivityBar()
  }
}

function openAgentsWindow() {
  if (!requireUser()) return
  enterWorkbench()
  document.body.classList.toggle('agent-off')
  if (!document.body.classList.contains('agent-off')) {
    renderAgentPanel()
    $('agent-input')?.focus()
  }
  syncActivityRailHighlight()
}

function closeSettings() {
  if (!state.settingsOpen) return
  state.settingsOpen = false
  document.body.classList.remove('settings-open')
  const screen = $('settings-screen')
  if (screen) screen.hidden = true
  syncActivityRailHighlight()
  layoutEditor()
}

function toggleSettings() {
  if (state.settingsOpen) {
    closeSettings()
    return
  }
  openSettings()
}

function openSettingsModels() {
  state.settingsTab = 'models'
  openSettings()
}

function openSettingsConnectors() {
  state.settingsTab = 'connectors'
  openSettings()
}

function openSettingsSkills() {
  state.settingsTab = 'skills'
  openSettings()
  void loadSettingsSkills()
}

function openSettings() {
  if (!requireUser()) return
  void enterWorkbench()
  void loadUserProfile()
  state.settingsOpen = true
  document.body.classList.add('settings-open')
  syncActivityRailHighlight()
  if (state.side === 'account') {
    state.side = 'files'
    renderSide()
  }
  refreshModelReadiness()
  void syncModelCatalogForSession().then(() => {
    renderSettingsScreen()
    refreshModelPickerList()
    setModelTriggerLabel()
  })
  void loadAppInfo().then(() => renderSettingsScreen())
  renderSettingsScreen()
  layoutEditor()
  if (state.settingsTab === 'test-hub') void loadSettingsDeployLinks()
  if (state.settingsTab === 'skills') void loadSettingsSkills()
}

const SETTINGS_NAV = [
  { id: 'general', label: 'General' },
  { id: 'models', label: 'Models' },
  { id: 'agents', label: 'Agents' },
  { id: 'skills', label: 'Skills', aliases: ['skill', 'upload', 'playbook', 'custom'] },
  { id: 'keys', label: 'API Keys' },
  { id: 'connectors', label: 'Connectors', aliases: ['mcp', 'marketplace', 'higgsfield', 'plugin'] },
  { id: 'test-hub', label: 'Test Hub', aliases: ['share', 'links', 'publish', 'deploy'] },
  { id: 'plan', label: 'Plan & Usage' },
]

function settingsNavHtml() {
  const q = state.settingsSearch.trim().toLowerCase()
  return SETTINGS_NAV.filter(
    (item) =>
      !q ||
      item.label.toLowerCase().includes(q) ||
      (item.aliases || []).some((alias) => alias.includes(q)),
  )
    .map(
      (item) =>
        `<button type="button" class="settings-nav-item ${item.id === state.settingsTab ? 'on' : ''}" data-tab="${item.id}">${settingsNavIcon(item.id)}<span>${escapeHtml(item.label)}</span></button>`,
    )
    .join('')
}

function deployStatusLabel(row) {
  if (row?.expired) return 'Expired'
  if (row?.live) return 'Live'
  return 'Saved'
}

async function loadSettingsDeployLinks() {
  state.settingsDeployLinksLoading = true
  state.settingsDeployLinksError = ''
  renderSettingsScreen()
  try {
    const res = (await api.testHubListDeploys?.({ limit: 30 })) || { rows: [] }
    if (res.error) {
      state.settingsDeployLinksError = res.error
      state.settingsDeployLinks = []
    } else {
      state.settingsDeployLinks = res.rows || []
    }
  } catch {
    state.settingsDeployLinksError = 'Could not load share links'
    state.settingsDeployLinks = []
  } finally {
    state.settingsDeployLinksLoading = false
    renderSettingsScreen()
    bindSettingsScreen()
  }
}

function settingsTestHubHtml() {
  const rows = state.settingsDeployLinks || []
  const loading = state.settingsDeployLinksLoading
  const err = state.settingsDeployLinksError
  let body = ''
  if (loading) {
    body = '<p class="settings-section-desc">Loading share links…</p>'
  } else if (err) {
    body = `<p class="settings-section-desc" style="color:#e06c75">${escapeHtml(err)}</p>`
  } else if (!rows.length) {
    body = '<p class="settings-section-desc">No share links yet. Publish from Test Hub — links stay here until you delete them.</p>'
  } else {
    body = `<div class="settings-card settings-share-links">${rows
      .map((row) => {
        const status = deployStatusLabel(row)
        return `<div class="settings-share-link-row" data-deploy-id="${escapeAttr(row.id)}">
          <div class="settings-share-link-meta">
            <span class="settings-share-link-title">${escapeHtml(row.title || row.slug || 'Preview')} · ${escapeHtml(status)}</span>
            <span class="settings-share-link-url">${escapeHtml(row.url || '')}</span>
            <span class="settings-share-link-sub">${row.file_count || 0} files · ${escapeHtml(new Date(row.created_at).toLocaleString())}${row.expired ? '' : ` · expires ${escapeHtml(new Date(row.expires_at).toLocaleString())}`}</span>
          </div>
          <div class="settings-share-link-actions">
            <button type="button" class="settings-row-btn" data-deploy-copy="${escapeAttr(row.url || '')}">Copy</button>
            <button type="button" class="settings-row-btn" data-deploy-delete="${escapeAttr(row.id)}">Delete</button>
          </div>
        </div>`
      })
      .join('')}</div>`
  }
  return `<h1 class="settings-title">Test Hub</h1>
    ${settingsSection(
      'Share links',
      `<p class="settings-section-desc">Published Test Hub previews. You pick how long each link lives (max 30 days). Expired links are removed automatically.</p>
      <div class="settings-card settings-card-pad" style="padding:0; overflow:hidden;">
        ${body}
      </div>
      <div class="settings-row-actions" style="margin-top:10px;">
        <button type="button" class="settings-row-btn" id="settings-deploy-refresh" ${loading ? 'disabled' : ''}>Refresh</button>
      </div>`,
    )}`
}

function settingsGeneralHtml() {
  const agentLayout = state.windowLayout === 'agent'
  const email = state.user?.email || state.user?.name || 'Signed in'
  const ver = state.appInfo?.version || '…'
  const apiHost = state.appInfo?.api || '…'
  const dataPath = state.appInfo?.localData || '…'
  return `<h1 class="settings-title">General</h1>
    ${settingsSection(
      'Profile image',
      `<div class="settings-profile-upload">
        <div class="settings-avatar settings-avatar-lg">${settingsAvatarMarkup('settings-avatar')}</div>
        <div class="settings-profile-upload-meta">
          <p class="settings-section-desc">Used in Studio and your account. PNG, JPEG, or WebP up to 6 MB.</p>
          <button type="button" class="settings-row-btn" id="settings-upload-avatar" ${state.avatarUploadBusy ? 'disabled' : ''}>${state.avatarUploadBusy ? 'Uploading…' : 'Upload image'}</button>
          <div class="settings-avatar-progress" id="settings-avatar-progress" ${state.avatarUploadBusy ? '' : 'hidden'}>
            <div class="settings-avatar-progress-track" aria-hidden="true"><div class="settings-avatar-progress-fill" id="settings-avatar-progress-fill" style="width:${Math.max(4, state.avatarUploadProgress || 0)}%"></div></div>
            <p class="settings-footnote settings-avatar-progress-label" id="settings-avatar-progress-label">${escapeHtml(avatarUploadProgressLabel())}</p>
          </div>
          <p class="settings-footnote settings-avatar-note" id="settings-avatar-note" hidden></p>
        </div>
      </div>`,
    )}
    ${settingsSection(
      'Account',
      settingsCard(
        settingsRow('Account', 'Email on this Soumtok account', `<span class="settings-meta-val">${escapeHtml(email)}</span>`) +
          settingsRow(
            'Session',
            'Desktop uses your Soumtok account for models and usage',
            `<button type="button" class="settings-row-btn" id="settings-logout">Sign out</button>`,
          ),
      ),
    )}
    ${settingsSection(
      'Layout',
      `<p class="settings-section-desc">How Soumtok Desktop arranges the editor and agent panel.</p>
      <div class="settings-layout-pick" role="group" aria-label="Window layout">
        <button type="button" class="settings-layout-tile ${agentLayout ? 'on' : ''}" data-layout="agent">
          <span class="settings-layout-thumb agent"></span>
          <span>Agent</span>
        </button>
        <button type="button" class="settings-layout-tile ${!agentLayout ? 'on' : ''}" data-layout="editor">
          <span class="settings-layout-thumb editor"></span>
          <span>Editor</span>
        </button>
      </div>` +
        settingsCard(
          settingsRow(
            'Agent panel',
            'Show the chat panel beside the editor',
            `<button type="button" class="settings-switch ${document.body.classList.contains('agent-off') ? '' : 'on'}" id="settings-agent-panel" role="switch" aria-checked="${!document.body.classList.contains('agent-off')}"></button>`,
          ),
        ),
    )}
    ${settingsSection(
      'Appearance',
      `<p class="settings-section-desc">Theme for Soumtok Desktop — editor, sidebars, and settings.</p>
      <div class="settings-theme-pick" role="group" aria-label="Color theme">
        <button type="button" class="settings-theme-tile ${state.themePref === 'system' ? 'on' : ''}" data-theme-pref="system">
          <span class="settings-theme-thumb system"></span>
          <span>System</span>
        </button>
        <button type="button" class="settings-theme-tile ${state.themePref === 'dark' ? 'on' : ''}" data-theme-pref="dark">
          <span class="settings-theme-thumb dark"></span>
          <span>Dark</span>
        </button>
        <button type="button" class="settings-theme-tile ${state.themePref === 'light' ? 'on' : ''}" data-theme-pref="light">
          <span class="settings-theme-thumb light"></span>
          <span>Light</span>
        </button>
      </div>`,
    )}
    ${settingsSection(
      'Editor',
      settingsCard(
        settingsRow(
          'Font size',
          'Monaco editor text size in the project view',
          `<select id="settings-editor-font" class="settings-inline-select">
            ${[11, 12, 13, 14, 15, 16, 18]
              .map((n) => `<option value="${n}" ${state.editorFontSize === n ? 'selected' : ''}>${n}px</option>`)
              .join('')}
          </select>`,
        ) +
          settingsPrefSwitch(
            'Tab completions',
            'Inline ghost completions while typing (Tab to accept)',
            'tabCompletions',
          ) +
          settingsRow(
            'Tab model',
            'Fast model used for Tab — keep on Flash for speed',
            `<select id="settings-tab-model" class="settings-inline-select" data-pref-select="tabModel">
              <option value="deepseek-v4-flash" ${(state.agentPrefs?.tabModel || 'deepseek-v4-flash') === 'deepseek-v4-flash' ? 'selected' : ''}>DeepSeek V4 Flash (recommended)</option>
              <option value="auto" ${state.agentPrefs?.tabModel === 'auto' ? 'selected' : ''}>Auto (agent default)</option>
              ${state.modelOptions
                .filter((m) => /flash|mini|haiku|fast/i.test(m.name + m.id))
                .slice(0, 12)
                .map(
                  (m) =>
                    `<option value="${escapeAttr(m.id)}" ${state.agentPrefs?.tabModel === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`,
                )
                .join('')}
            </select>`,
          ) +
          settingsPrefSwitch(
            'Extension host for languages',
            'Keep Python, Rust, Go, and other installed language extensions available to the editor and agent',
            'preferExtensionLsp',
          ) +
          settingsRow(
            'Updates',
            'Check for a newer Soumtok Desktop build',
            `<button type="button" class="settings-row-btn" id="settings-check-updates">Check for updates</button>
             <span class="settings-meta-val" id="settings-update-status"></span>`,
          ),
      ),
    )}
    ${settingsSection(
      'Soumtok Desktop',
      settingsCard(
        settingsRow('Version', appProductLabel(), `<span class="settings-meta-val">${escapeHtml(ver)}</span>`) +
          settingsRow('Server', 'API your desktop app talks to', `<span class="settings-meta-val settings-mono" title="${escapeAttr(apiHost)}">${escapeHtml(apiHost)}</span>`) +
          settingsRow('Local data', 'Preferences and window state on this machine', `<span class="settings-meta-val settings-mono settings-truncate" title="${escapeAttr(dataPath)}">${escapeHtml(dataPath)}</span>`) +
          settingsRow(
            'Reset preferences',
            'Restore default agent, layout, models, and editor settings on this device',
            `<button type="button" class="settings-row-btn" id="settings-reset-prefs">Reset</button>`,
          ) +
          settingsRow(
            'Report a bug',
            'Send details to support@soumtok.com',
            `<button type="button" class="settings-row-btn" id="settings-bug-report">Report…</button>`,
          ),
      ),
    )}`
}

function appProductLabel() {
  return state.appInfo?.productName || 'Soumtok Desktop'
}

function sortedSettingsModels() {
  const q = state.settingsModelSearch.trim().toLowerCase()
  let list = [...state.modelOptions]
  if (q) {
    list = list.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        String(m.provider || '').toLowerCase().includes(q),
    )
  }
  if (typeof MODEL_CATALOG.sortForDisplay === 'function') list = MODEL_CATALOG.sortForDisplay(list)
  return list
}

function settingsModelListHtml() {
  const list = sortedSettingsModels()
  if (!list.length) {
    return `<p class="settings-hint settings-model-empty">${state.modelOptions.length ? 'No models match your search.' : 'Loading models…'}</p>`
  }
  const expanded = state.settingsModelsExpanded || Boolean(state.settingsModelSearch.trim())
  const visible = expanded ? list : list.slice(0, SETTINGS_MODELS_COLLAPSED)
  const rows = visible
    .map((m) => {
      const on = isModelEnabledInPicker(m.id)
      const newTag = m.tags?.includes('New') ? '<span class="settings-model-new">New</span>' : ''
      return `<div class="settings-model-row">
        <span class="settings-model-name">${escapeHtml(m.name)}${newTag}</span>
        <button type="button" class="settings-switch ${on ? 'on' : ''}" data-model-toggle="${escapeAttr(m.id)}" role="switch" aria-checked="${on}"></button>
      </div>`
    })
    .join('')
  const canExpand = !expanded && list.length > SETTINGS_MODELS_COLLAPSED
  const footer =
    canExpand ?
      `<button type="button" class="settings-view-all-models" id="settings-view-all-models">View All Models</button>`
    : expanded && list.length > SETTINGS_MODELS_COLLAPSED && !state.settingsModelSearch.trim() ?
      `<button type="button" class="settings-view-all-models muted" id="settings-view-all-models">Show fewer</button>`
    : ''
  return `${rows}${footer}`
}

function settingsUsageBar(label, hint, pct, detail, opts = {}) {
  const p = Math.min(100, Math.max(0, Number(pct) || 0))
  const locked = Boolean(opts.locked)
  const tone = opts.tone === 'premium' ? ' premium' : ''
  return `<div class="settings-usage-block${locked ? ' locked' : ''}">
    <div class="settings-usage-head">
      <div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(hint)}</span></div>
      <span class="settings-usage-pct">${locked ? '—' : `${p}%`}</span>
    </div>
    <div class="settings-usage-track${tone}"><div class="settings-usage-fill${tone}" style="width:${locked ? 0 : p}%"></div></div>
    <p class="settings-usage-detail">${escapeHtml(detail)}</p>
  </div>`
}

function isUnpaidPlanId(plan) {
  return !plan || plan === 'hobby' || plan === 'trial'
}

function formatPoolUsd(n) {
  return `$${Number(n || 0).toFixed(2)}`
}

function settingsPlanKeysBlock(byokAllowed) {
  const loading = state.providerKeysLoading
  const rows = DESKTOP_KEY_PROVIDERS.map((p) => {
    const saved = keyForProvider(p.id)
    const status = saved ? `Connected ····${escapeHtml(saved.last4 || '****')}` : 'Not set'
    const disabled = byokAllowed ? '' : ' disabled'
    const saveDisabled = byokAllowed ? '' : ' disabled aria-disabled="true"'
    return `<div class="settings-key-block" data-provider="${escapeAttr(p.id)}">
      <div class="settings-key-head">
        <strong>${escapeHtml(PROVIDER_NAMES[p.id])}</strong>
        <span class="settings-key-status ${saved ? 'ok' : ''}">${status}</span>
      </div>
      <p class="settings-key-hint">${escapeHtml(p.hint)}</p>
      <div class="settings-key-row">
        <input type="password" class="settings-key-input"${disabled} id="settings-key-${escapeAttr(p.id)}" placeholder="${saved ? 'Paste new key to replace' : 'Paste API key'}" autocomplete="off" spellcheck="false" />
        <button type="button" class="settings-row-btn"${saveDisabled} data-save-key="${escapeAttr(p.id)}">Save</button>
        ${saved && byokAllowed ? `<button type="button" class="settings-row-btn ghost" data-rm-key="${escapeAttr(p.id)}">Remove</button>` : ''}
      </div>
    </div>`
  }).join('')
  const gate =
    byokAllowed ?
      '<p class="settings-card-note">Tokens bill directly to your provider — not your Soumtok pools. After saving, refresh Models if a row still shows not ready.</p>'
    : `<div class="settings-plan-gate">
        <p><strong>Pro plan required.</strong> Add your own OpenAI, Anthropic, DeepSeek, or xAI keys to code at your vendor&apos;s cost — without touching Soumtok pools.</p>
        <button type="button" class="settings-row-btn primary" id="settings-upgrade-byok">Upgrade to Pro in browser</button>
      </div>`
  return `${gate}${loading ? '<p class="settings-footnote">Loading keys…</p>' : ''}<div class="settings-keys-grid">${rows}</div>`
}

function settingsModelsHtml() {
  const modelOpts = state.modelOptions
    .filter((m) => isModelEnabledInPicker(m.id))
    .map(
      (m) =>
        `<option value="${escapeAttr(m.id)}" ${state.agentModel === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`,
    )
    .join('')
  const subagentOpts = [
    `<option value="auto" ${state.subagentModel === 'auto' ? 'selected' : ''}>Default</option>`,
    ...state.modelOptions
      .filter((m) => RECOMMENDED_MODEL_IDS.has(m.id))
      .map(
        (m) =>
          `<option value="${escapeAttr(m.id)}" ${state.subagentModel === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`,
      ),
  ].join('')
  const errBanner = state.modelLoadError
    ? `<p class="settings-alert">${escapeHtml(state.modelLoadError)}</p>`
    : ''
  const expandedClass = state.settingsModelsExpanded || state.settingsModelSearch.trim() ? ' expanded' : ''
  return `<h1 class="settings-title">Models</h1>
    <p class="settings-page-desc">Choose which models appear in the model picker. While signed in, DeepSeek, OpenAI, Anthropic, and Grok run on Soumtok included routing unless you add your own API keys.</p>
    ${errBanner}
    ${settingsSection(
      'Task Models',
      settingsCard(
        settingsRow(
          'Explore Subagent Model',
          'Choose a model or use the cost- and availability-aware default',
          `<select id="settings-subagent-model" class="settings-inline-select">${subagentOpts}</select>`,
        ),
      ),
    )}
    ${settingsSection(
      '',
      `<div class="settings-model-search-row">
        <input type="search" id="settings-model-search" class="settings-search settings-model-search" placeholder="Add or search model" value="${escapeAttr(state.settingsModelSearch)}" autocomplete="off" spellcheck="false" />
        <button type="button" class="settings-icon-btn" id="settings-refresh-models" title="Refresh models" aria-label="Refresh models">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M13 3v3h-3M3 13V10h3"/><path d="M3.5 6.5A5 5 0 0 1 12 4.5L13 3M3 13l1.5-1.5A5 5 0 0 0 11.5 9.5"/></svg>
        </button>
      </div>
      <div class="settings-card settings-card-flush settings-model-card${expandedClass}">
        <div class="settings-model-list" id="settings-model-list">${settingsModelListHtml()}</div>
      </div>`,
    )}
    ${settingsSection(
      'Defaults',
      settingsCard(
        settingsRow(
          'Default model',
          'Used when a new agent chat starts',
          `<select id="settings-default-model" class="settings-inline-select">
            <option value="auto" ${state.agentModel === 'auto' ? 'selected' : ''}>Auto</option>
            ${modelOpts}
          </select>`,
        ) +
          settingsRow(
            'Fast models only',
            'Limit the picker to fast, low-cost models',
            `<button type="button" class="settings-switch ${state.agentModelFast ? 'on' : ''}" id="settings-fast-models" role="switch" aria-checked="${state.agentModelFast}"></button>`,
          ),
      ),
    )}`
}

function settingsKeysHtml() {
  const byokAllowed = Boolean(state.accountSummary?.byokAllowed)
  return `<h1 class="settings-title">API Keys</h1>
    <p class="settings-page-desc">Add provider keys to code at your vendor&apos;s cost. Keys are stored encrypted on your Soumtok account.</p>
    <div class="settings-card settings-card-pad">${settingsPlanKeysBlock(byokAllowed)}</div>
    <p class="settings-footnote">Bring your own keys requires <strong>Pro ($20/mo)</strong> or higher. On Start, use Everyday models on your included pool.</p>`
}

function settingsAgentsHtml() {
  if (!state.agentPrefs) loadAgentPrefs()
  const p = state.agentPrefs
  const intel = p.intelligence || 'max'
  const ideRounds = intel === 'fast' ? 12 : intel === 'balanced' ? 24 : 42
  const driverNote = `IDE Agent pair-programs with you (up to ${ideRounds} tool rounds at ${intel} intelligence). For direct model chat without tools, use Test Hub.`
  const modelOpts =
    state.modelOptions.length ?
      state.modelOptions.map(
        (m) => `<option value="${escapeAttr(m.id)}" ${state.agentModel === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`,
      )
    : '<option value="auto">Auto</option>'
  const toolTags = ['list_dir', 'read', 'write', 'grep', 'diff', 'terminal', 'git']
  if (p.codebaseSearch !== false) toolTags.push('codebase_search')
  if (p.browserVerify !== false) toolTags.push('browser')
  if (p.skillsEnabled !== false) toolTags.push('read_skill')
  if (p.webFetchTool || p.webSearchTool) toolTags.push('fetch')
  if (p.mcpConnectors) toolTags.push('mcp')
  toolTags.push('generate_image', 'examine_media')
  const toolsHtml = toolTags.map((t) => `<span>${t}</span>`).join('')

  return `<h1 class="settings-title">Agents</h1>
    <p class="settings-page-desc settings-page-desc-wide">Control how Soumtok Desktop agents think, use tools on your machine (integrated Terminal), and talk to models through your account.</p>
    ${settingsSection(
      'Agent',
      `<p class="settings-section-desc">${driverNote}</p>`,
    )}
    ${settingsSection(
      'Intelligence',
      settingsCard(
        settingsPrefSelect(
          'Agent intelligence',
          'How hard the agent thinks and how many tool rounds it may use. Change this from the composer too.',
          'intelligence',
          [
            { value: 'fast', label: 'Fast — fewer rounds, skip think-first and browser verify' },
            { value: 'balanced', label: 'Balanced — think, search, verify' },
            { value: 'max', label: 'Max — deepest loop, browser, skills, more retries' },
          ],
        ) +
          settingsPrefSwitch('Think first', 'Plan the job, then read the right files, then edit — not README-first', 'thinkFirst') +
          settingsPrefSwitch(
            'Browser verify',
            'After localhost is up, snapshot the running page (DOM, screenshot, console, network)',
            'browserVerify',
          ) +
          settingsPrefSwitch('Codebase search', 'Meaning search across the project, not only exact grep', 'codebaseSearch') +
          settingsPrefSwitch('Skills', 'Load SKILL.md playbooks (bundled, project, and imported)', 'skillsEnabled'),
      ),
    )}
    ${settingsSection(
      'Conversation',
      settingsCard(
        settingsPrefSelect('Agent text size', 'Conversation font size in the agent panel', 'agentTextSize', [
          { value: 'small', label: 'Small' },
          { value: 'default', label: 'Default' },
          { value: 'large', label: 'Large' },
        ]) +
          settingsRow(
            'Default mode',
            'Agent, Ask, or Plan when you open the composer',
            `<select id="settings-default-mode" class="settings-inline-select">
              <option value="agent" ${state.agentMode === 'agent' ? 'selected' : ''}>Agent</option>
              <option value="ask" ${state.agentMode === 'ask' ? 'selected' : ''}>Ask</option>
              <option value="plan" ${state.agentMode === 'plan' ? 'selected' : ''}>Plan</option>
            </select>`,
          ) +
          settingsRow(
            'Default model',
            'Model new agent threads start with',
            `<select id="settings-agents-default-model" class="settings-inline-select">
              <option value="auto" ${state.agentModel === 'auto' ? 'selected' : ''}>Auto</option>
              ${modelOpts}
            </select>`,
          ) +
          settingsRow(
            'Submit with Ctrl + Enter',
            'Ctrl+Enter sends; Enter adds a newline when off',
            `<button type="button" class="settings-switch ${state.agentCtrlEnter ? 'on' : ''}" id="settings-ctrl-enter" role="switch" aria-checked="${state.agentCtrlEnter}"></button>`,
          ) +
          settingsPrefSelect(
            'Messages while agent is busy',
            'Queue or send immediately when a run is in progress',
            'queueWhileBusy',
            [
              { value: 'queue', label: 'Queue' },
              { value: 'send-immediately', label: 'Send immediately' },
            ],
          ) +
          settingsPrefSwitch(
            'Code block word wrap',
            'Wrap long lines in agent markdown code blocks',
            'codeBlockWordWrap',
          ) +
          settingsPrefSelect('Usage summary', 'When to show token usage in the agent panel', 'usageSummary', [
            { value: 'auto', label: 'Auto' },
            { value: 'always', label: 'Always' },
            { value: 'never', label: 'Never' },
          ]) +
          settingsPrefSwitch('Agent autocomplete', 'Contextual suggestions while typing (when available)', 'agentAutocomplete') +
          settingsPrefSwitch(
            'Auto-approve mode transitions',
            'Allow switching Agent / Ask / Plan without an extra confirm step',
            'autoApproveModeSwitch',
          ),
      ),
    )}
    ${settingsSection(
      'Third-party imports',
      settingsCard(
        settingsPrefSwitch(
          'Import plugins, skills, and configs',
          'Load SKILL.md from ~/.cursor/skills, project .cursor/skills, and .github/skills in addition to Soumtok skills',
          'thirdPartyImports',
        ),
      ),
    )}
    ${settingsSection(
      'Context & tools',
      settingsCard(
        settingsPrefSwitch('Open files in context', 'Include active editor tabs in each agent round', 'includeOpenFiles') +
          settingsPrefSwitch('Local tools', 'read, write, grep, diff, terminal on this project folder', 'localToolsEnabled') +
          settingsPrefSwitch(
            'External-file protection',
            'Block reads and writes outside the open project folder',
            'workspaceBoundary',
          ) +
          settingsPrefSwitch('Web search tool', 'Let the agent search the public web (fetch)', 'webSearchTool') +
          settingsPrefSwitch('Web fetch tool', 'Let the agent fetch https pages and docs', 'webFetchTool') +
          settingsPrefSwitch('Wait for MCP authentication', 'When MCP is enabled, wait for auth instead of skipping', 'waitForMcpAuth') +
          settingsPrefSwitch('MCP connectors', 'Expose MCP tools after you Connect in Settings → Connectors (marketplace)', 'mcpConnectors'),
      ),
    )}
    ${settingsSection(
      'Execution and approvals',
      settingsCard(
        settingsPrefSelect(
          'Run mode',
          'Controls terminal sandbox strictness and file protections (Soumtok Auto-Review)',
          'runMode',
          [
            { value: 'ask', label: 'Ask before run — strict sandbox' },
            { value: 'auto-review', label: 'Auto-review — balanced sandbox' },
            { value: 'run-everything', label: 'Run more — permissive terminal' },
          ],
        ) +
          settingsPrefSwitch(
            'File-deletion protection',
            'Block writes that empty or delete an existing file',
            'fileDeletionProtection',
          ) +
          settingsPrefSelect('Terminal sandbox', 'Fine-tune shell policy (Run mode also adjusts this)', 'terminalSandbox', [
            { value: 'strict', label: 'Strict' },
            { value: 'standard', label: 'Standard' },
            { value: 'permissive', label: 'Permissive' },
          ]),
      ),
    )}
    ${settingsSection(
      'Editor & Tab',
      settingsCard(
        settingsPrefSwitch('Tab completions', 'Inline ghost completions while typing', 'tabCompletions') +
          settingsPrefSelect('Tab model', 'Fast completion model (Settings → General → Editor too)', 'tabModel', [
            { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash (recommended)' },
            { value: 'auto', label: 'Auto — follow agent model' },
            ...state.modelOptions
              .filter((m) => /flash|mini|haiku|fast/i.test(String(m.name + m.id)))
              .slice(0, 8)
              .map((m) => ({ value: m.id, label: m.name })),
          ]),
      ),
    )}
    ${settingsSection(
      'Applying changes',
      settingsCard(
        settingsPrefSwitch(
          'Inline diffs in editor',
          'Show change decorations in Monaco when the agent edits files',
          'inlineDiffs',
        ) +
          settingsPrefSwitch(
            'Jump to next diff on accept',
            'After accepting a change, move to the next diff',
            'jumpNextDiffOnAccept',
          ) +
          settingsPrefSwitch('Auto-format when agent finishes', 'Run formatter on touched files after a run', 'autoFormatOnFinish'),
      ),
    )}
    ${settingsSection(
      'Terminal and editing',
      settingsCard(
        settingsPrefSwitch('Legacy terminal tool', 'Use legacy terminal execution path', 'legacyTerminal') +
          settingsPrefSwitch(
            'Toolbar on selection',
            'Show quick actions when selecting code in the editor',
            'toolbarOnSelection',
            'Selection toolbar ships in a follow-up — preference stored.',
          ),
      ),
    )}
    ${settingsSection(
      'Tools exposed to the model',
      settingsCard(
        `<div class="settings-tools-list">${toolsHtml}</div>
        <p class="settings-card-note">Skills live under Settings → Skills. Toggles above control tools on the next run.</p>`,
      ),
    )}`
}

function settingsPlanHtml() {
  const s = state.accountSummary
  const loading = state.accountSummaryLoading
  const err = state.accountSummaryError
  if (loading && !s) {
    return `<h1 class="settings-title">Plan & Usage</h1><p class="settings-lead">Loading your plan…</p>`
  }
  if (err && !s) {
    return `<h1 class="settings-title">Plan & Usage</h1>
      <p class="settings-lead">${escapeHtml(err)}</p>
      <button type="button" class="settings-row-btn" id="settings-reload-plan">Retry</button>`
  }
  const unpaid = isUnpaidPlanId(s?.plan)
  const planName = unpaid ? 'Free — no plan' : s?.planLabel || 'Plan'
  const planPrice = unpaid ? '' : s?.planPrice || ''
  const priceHtml = planPrice ? `<span>${escapeHtml(planPrice)}</span>` : ''
  const renewText =
    !unpaid && s?.planRenewsAt && s?.renewsInDays != null
      ? `Pools reset ${new Date(s.planRenewsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (${s.renewsInDays} days left)`
      : unpaid ?
        'Subscribe to Start ($5/mo) to open Everyday models in Studio and Desktop.'
      : 'Usage resets monthly on your billing cycle'
  const pools = s?.pools || {}
  const byokAllowed = Boolean(s?.byokAllowed)
  const hasAdditional = Number(pools.premiumDisplayUsd) > 0
  const everydayDetail =
    unpaid ?
      'Subscribe to Start — $5/mo Everyday pool on DeepSeek Flash, DeepSeek Pro, and GPT-4.1 Mini.'
    : `${formatPoolUsd(pools.cheapUsedUsd)} of ${formatPoolUsd(pools.cheapDisplayUsd)} used this cycle`
  const additionalDetail =
    hasAdditional ?
      `${formatPoolUsd(pools.premiumUsedUsd)} of ${formatPoolUsd(pools.premiumDisplayUsd)} used this cycle`
    : 'Upgrade to Pro — separate pool for Opus, GPT-6, Sonnet, and Grok.'
  const upgrade = s?.upgrade
  const topModels =
    s?.topModels?.length ?
      `<ul class="settings-top-models">${s.topModels
        .slice(0, 6)
        .map(
          (row) =>
            `<li><span>${escapeHtml(row.model)}</span><span>${formatTokens(row.tokens)}</span></li>`,
        )
        .join('')}</ul>`
    : '<p class="settings-hint">No model usage yet this month.</p>'

  const usageSection =
    unpaid ?
      `<div class="settings-card settings-card-pad">
        ${settingsUsageBar('Everyday', 'DeepSeek Flash, DeepSeek Pro, GPT-4.1 Mini', 0, everydayDetail, { locked: true })}
        ${settingsUsageBar('Additional', 'Opus, GPT-6, Sonnet, Grok', 0, 'Available on Pro ($20/mo) and above.', { locked: true, tone: 'premium' })}
        <button type="button" class="settings-row-btn primary" id="settings-upgrade">Subscribe to Start</button>
      </div>`
    : `<div class="settings-card settings-card-pad">
        ${settingsUsageBar('Everyday', 'DeepSeek Flash, DeepSeek Pro, GPT-4.1 Mini', pools.cheapPct ?? 0, everydayDetail)}
        ${settingsUsageBar(
          'Additional',
          'Opus, GPT-6, Sonnet, Grok',
          hasAdditional ? pools.premiumPct ?? 0 : 0,
          additionalDetail,
          { locked: !hasAdditional, tone: 'premium' },
        )}
        ${!hasAdditional ? '<button type="button" class="settings-row-btn" id="settings-upgrade">Upgrade to Pro</button>' : ''}
      </div>`

  return `<h1 class="settings-title">Plan & Usage</h1>
    <p class="settings-page-desc">Live usage for your account in Soumtok Desktop. Billing changes use your browser once — everything else stays here.</p>
    <div class="settings-plan-cards">
      <div class="settings-plan-card">
        <div class="settings-plan-kicker">Current plan</div>
        <div class="settings-plan-name">${escapeHtml(planName)} ${priceHtml}</div>
        <p class="settings-section-desc">${escapeHtml(renewText)}</p>
      </div>
      ${
        upgrade && !unpaid ?
          `<div class="settings-plan-card upgrade">
            <div class="settings-plan-kicker">Upgrade available</div>
            <div class="settings-plan-name">${escapeHtml(upgrade.name)} <span>${escapeHtml(upgrade.price)}</span></div>
            <p class="settings-section-desc">${escapeHtml(upgrade.tagline)}</p>
            <button type="button" class="settings-row-btn primary" id="settings-upgrade">Upgrade in browser</button>
          </div>`
        : ''
      }
    </div>
    ${settingsSection('Usage pools', usageSection)}
    ${settingsSection('Your API keys', `<div class="settings-card settings-card-pad">${settingsPlanKeysBlock(byokAllowed)}</div>`)}
    ${settingsSection('This month by model', `<div class="settings-card settings-card-pad settings-card-list">${topModels}</div>`)}
    <p class="settings-footnote">Need invoices or checkout? <button type="button" class="settings-link" id="settings-billing">Billing in browser</button></p>`
}

function settingsConnectorsHtml() {
  const q = escapeAttr(state.settingsConnectorSearch || '')
  return `<h1 class="settings-title">Connectors</h1>
    <p class="settings-page-desc settings-page-desc-wide">Connect a remote MCP in your browser. We save the official URL and list its tools after you sign in.</p>
    <div class="settings-conn-toolbar">
      <input type="search" id="settings-conn-search" class="settings-search settings-conn-search" placeholder="Search connectors" value="${q}" autocomplete="off" />
    </div>
    <p class="settings-footnote" id="settings-conn-status">${escapeHtml(state.connectorsStatus || '')}</p>
    <div id="settings-conn-mine"></div>
    ${settingsSection(
      'Add by URL',
      `<div class="settings-card settings-card-pad settings-conn-custom">
        <input type="text" id="settings-conn-name" class="settings-key-input" placeholder="Name" autocomplete="off" />
        <input type="url" id="settings-conn-url" class="settings-key-input" placeholder="https://…/mcp" autocomplete="off" />
        <button type="button" class="settings-row-btn primary" id="settings-conn-add-url">Connect</button>
      </div>`,
    )}
    <div id="settings-conn-market"><p class="git-scm-muted">Loading marketplace…</p></div>`
}

function settingsMainHtml() {
  if (state.settingsTab === 'models') return settingsModelsHtml()
  if (state.settingsTab === 'agents') return settingsAgentsHtml()
  if (state.settingsTab === 'skills') return settingsSkillsHtml()
  if (state.settingsTab === 'keys') return settingsKeysHtml()
  if (state.settingsTab === 'connectors') return settingsConnectorsHtml()
  if (state.settingsTab === 'plan') return settingsPlanHtml()
  if (state.settingsTab === 'test-hub') return settingsTestHubHtml()
  return settingsGeneralHtml()
}

async function loadLocalAgentSkills() {
  state.localAgentSkillsLoading = true
  try {
    const res = (await api.agentListLocalSkills?.()) || { skills: [] }
    state.localAgentSkills = res.skills || []
  } catch {
    state.localAgentSkills = []
  } finally {
    state.localAgentSkillsLoading = false
  }
}

async function loadUserSkills() {
  if (!state.user) {
    state.userSkills = []
    return
  }
  try {
    const res = (await api.skillsList?.()) || { skills: [] }
    if (res.error && !res.skills?.length) {
      state.settingsSkillsError = res.error
      state.userSkills = []
      return
    }
    state.settingsSkillsError = ''
    state.userSkills = res.skills || []
  } catch {
    state.settingsSkillsError = 'Could not load skills'
    state.userSkills = []
  }
}

async function loadPlugins() {
  if (!state.user) {
    state.pluginsCatalog = []
    state.installedPlugins = []
    return
  }
  try {
    const res = (await api.pluginsList?.()) || { catalog: [], installed: [] }
    if (res.error && !res.catalog?.length) {
      if (!state.settingsSkillsError) state.settingsSkillsError = res.error
      return
    }
    state.pluginsCatalog = res.catalog || []
    state.installedPlugins = res.installed || []
  } catch {
    if (!state.settingsSkillsError) state.settingsSkillsError = 'Could not load marketplace'
  }
}

async function refreshConnectorsMine() {
  if (!api.connectorsList) return
  try {
    const data = await api.connectorsList()
    state.connectorsMine = data.connectors || []
  } catch {
    /* optional */
  }
}

function skillPackLiveStatus(plug) {
  const meta = catalogPluginById(plug.plugin_id)
  const mcpUrl = plug.mcp_url || meta?.mcpHint || meta?.mcps?.[0]?.url || null
  const hasLive = Boolean(mcpUrl || plug.mcps?.length || meta?.mcps?.length)
  if (!hasLive) return { needsLive: false, connected: true }
  const saved = findSavedConnector(state.connectorsMine || [], {
    pluginId: plug.plugin_id,
    name: plug.name || meta?.name,
    mcpUrl,
    id: plug.plugin_id,
  })
  return { needsLive: true, connected: Boolean(saved?.connected) }
}

async function waitForConnectDevice(code, setStatus, timeoutMs = 180000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const data = await api.connectPoll?.(code)
    if (data?.error && !data?.status) {
      setStatus(data.error)
      return null
    }
    if (data?.status === 'authorized') return data
    if (data?.status === 'expired' || data?.status === 'denied') {
      setStatus(data.status === 'denied' ? 'Sign-in was denied.' : 'Connect link expired — tap Connect again.')
      return null
    }
    setStatus('Finish sign-in in your browser — updating live when OAuth completes…')
    await sleepMs(1200)
  }
  return null
}

async function connectSkillPack(pluginId, btn) {
  if (!requireUser() || !pluginId) return
  const meta = catalogPluginById(pluginId)
  const plug = installedSkillPlugins().find((row) => row.plugin_id === pluginId)
  const name = plug?.name || meta?.name || pluginId
  const label = btn?.textContent
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Connecting…'
  }
  const setStatus = (msg) => {
    state.settingsSkillsStatus = msg
    if (state.settingsOpen && state.settingsTab === 'skills') {
      renderSettingsScreen()
      bindSettingsScreen()
    }
  }
  try {
    if (!api.connectStart) throw new Error('Restart the desktop app to use Connect from Skills.')
    if (!state.agentPrefs) loadAgentPrefs()
    if (state.agentPrefs && !state.agentPrefs.mcpConnectors) setAgentPref('mcpConnectors', true)

    setStatus('Creating secure connect link…')
    state.settingsConnectLink = ''
    state.settingsConnectCode = ''
    state.settingsConnectPluginId = ''
    const started = await api.connectStart({ pluginId })
    if (started?.error) throw new Error(started.error)
    if (!started?.connectorId) throw new Error('Could not save connector')
    state.settingsConnectLink = started.url || started.verificationUri || ''
    state.settingsConnectCode = started.code || ''
    state.settingsConnectPluginId = pluginId
    setStatus(`Sign in to ${name}, or copy the link below to open on another device.`)
    const oauth = await api.connectorsOauth({
      id: started.connectorId,
      loginUrl: started.loginUrl || meta?.signupUrl || '',
    })
    if (!oauth?.openedOauth && !oauth?.noAuth && started.url) {
      void api.openUrl?.(started.url)
    }
    if (oauth?.error && !/already connected|token/i.test(oauth.error)) {
      throw new Error(oauth.error)
    }

    if (!oauth?.noAuth && started.code) {
      setStatus(`Approve ${name} in your browser. Status updates here automatically.`)
      const ready = await waitForConnectDevice(started.code, setStatus)
      if (!ready) return
    }

    setStatus('Activating live tools…')
    const done = await api.connectorsConnect(started.connectorId)
    if (done?.error) throw new Error(done.error)
    const n = done.mcp?.tools?.length
    state.settingsConnectLink = ''
    state.settingsConnectCode = ''
    state.settingsConnectPluginId = ''
    setStatus(
      done.connected || n
        ? `${name} connected${n ? ` · ${n} live tools` : ''}. Attach skills in chat ◆.`
        : `${name} saved. Tap Connect again if tools are still empty.`,
    )
    await loadSettingsSkills()
  } catch (err) {
    setStatus(err?.message || 'Connect failed')
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = label || 'Connect'
    }
  }
}

async function loadSettingsSkills() {
  state.settingsSkillsLoading = true
  state.settingsSkillsError = ''
  renderSettingsScreen()
  await Promise.all([loadUserSkills(), loadPlugins(), refreshConnectorsMine()])
  state.settingsSkillsLoading = false
  renderSettingsScreen()
  bindSettingsScreen()
  bindLogoFallback($('settings-screen'))
}

function catalogPluginById(id) {
  return (state.pluginsCatalog || []).find((row) => row.id === id) || null
}

function installedPluginIdsSet() {
  return new Set((state.installedPlugins || []).map((row) => row.plugin_id))
}

function filterPluginsCatalog(list) {
  const q = state.settingsSkillsSearch.trim().toLowerCase()
  if (!q) return list || []
  return (list || []).filter(
    (row) =>
      row.name.toLowerCase().includes(q) ||
      String(row.description || '').toLowerCase().includes(q) ||
      String(row.category || '').toLowerCase().includes(q),
  )
}

function enabledInstalledPlugins() {
  return (state.installedPlugins || []).filter((row) => row.enabled !== false)
}

/** Skill packs only — MCP-only connectors live under Settings → Connectors. */
function catalogHasSkills(item) {
  return Boolean(item && Array.isArray(item.skills) && item.skills.length > 0)
}

function skillsCatalogOnly(list) {
  return (list || []).filter(catalogHasSkills)
}

function installedSkillPlugins() {
  return enabledInstalledPlugins().filter((plug) => {
    const meta = catalogPluginById(plug.plugin_id)
    const skills = plug.skills?.length ? plug.skills : meta?.skills || []
    return skills.length > 0
  })
}

function flattenPluginSkills() {
  const out = []
  for (const plug of installedSkillPlugins()) {
    const meta = catalogPluginById(plug.plugin_id)
    const skills = plug.skills?.length ? plug.skills : meta?.skills || []
    for (const skill of skills) {
      out.push({
        id: `${plug.plugin_id}:${skill.id}`,
        skillId: skill.id,
        pluginId: plug.plugin_id,
        pluginName: plug.name || meta?.name || plug.plugin_id,
        label: skill.label || skill.id,
        description: skill.description || '',
        insert: skill.insert || `Use the ${skill.label || skill.id} skill from ${plug.name || meta?.name || plug.plugin_id}.\n\n`,
        sourceUrl: skill.sourceUrl || '',
      })
    }
  }
  return out
}

function pluginMarketCardHtml(item) {
  const installed = installedPluginIdsSet().has(item.id)
  const skillCount = item.skills?.length || 0
  const busy = state.pluginInstallBusy === item.id
  return `<div class="conn-market-block">
    <div class="conn-market-card skills-market-card">
      ${marketLogoHtml({ ...item, pluginId: item.id, logo: item.logo })}
      <div class="conn-meta">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${skillCount} skill${skillCount === 1 ? '' : 's'} · GitHub</span>
      </div>
      <button type="button" class="conn-btn ${installed ? 'on' : ''}" data-plugin-install="${escapeAttr(item.id)}" ${busy || installed ? 'disabled' : ''}>${busy ? '…' : installed ? 'Added' : 'Add'}</button>
    </div>
  </div>`
}

function settingsSkillsTabsHtml() {
  const sub = state.settingsSkillsSubview || 'marketplace'
  return `<div class="settings-skills-tabs" role="tablist">
    ${[
      ['marketplace', 'Browse'],
      ['installed', 'Installed'],
      ['custom', 'Yours'],
    ]
      .map(
        ([id, label]) =>
          `<button type="button" class="settings-skills-tab ${sub === id ? 'on' : ''}" data-skills-sub="${id}" role="tab">${escapeHtml(label)}</button>`,
      )
      .join('')}
  </div>`
}

function settingsSkillsMarketplaceHtml() {
  const installedIds = installedPluginIdsSet()
  const catalog = skillsCatalogOnly(filterPluginsCatalog(state.pluginsCatalog || []))
  const available = catalog.filter((row) => !installedIds.has(row.id))
  const featured = available.filter((row) => row.featured)
  const suggested = available.filter((row) => row.suggested && !row.featured)
  const rest = available.filter((row) => !row.featured && !row.suggested)
  const sections = []
  if (featured.length) {
    sections.push(`<section class="conn-market-section"><h2 class="settings-section-title">Featured</h2><div class="conn-market-grid">${featured.map(pluginMarketCardHtml).join('')}</div></section>`)
  }
  if (suggested.length) {
    sections.push(`<section class="conn-market-section"><h2 class="settings-section-title">Suggested</h2><div class="conn-market-grid">${suggested.map(pluginMarketCardHtml).join('')}</div></section>`)
  }
  if (rest.length) {
    sections.push(`<section class="conn-market-section"><h2 class="settings-section-title">More</h2><div class="conn-market-grid">${rest.map(pluginMarketCardHtml).join('')}</div></section>`)
  }
  if (!sections.length) {
    return '<div class="skills-empty">All skill packs installed.</div>'
  }
  return sections.join('')
}

function settingsSkillsInstalledHtml() {
  const rows = installedSkillPlugins()
  if (!rows.length) {
    return '<div class="skills-empty">No skill packs yet.</div>'
  }
  return `<div class="skills-installed-list">${rows
    .map((plug) => {
      const meta = catalogPluginById(plug.plugin_id)
      const skills = plug.skills?.length ? plug.skills : meta?.skills || []
      const skillList = skills.length
        ? `<div class="settings-plugin-skills">${skills
            .slice(0, 10)
            .map(
              (skill) =>
                `<button type="button" class="settings-plugin-skill-link" data-plugin-skill="${escapeAttr(`${plug.plugin_id}:${skill.id}`)}">${escapeHtml(skill.label || skill.id)}</button>`,
            )
            .join('')}</div>`
        : ''
      const live = skillPackLiveStatus(plug)
      const liveLine = live.needsLive
        ? live.connected
          ? '<span class="skills-live-tag on">Connected</span>'
          : '<span class="skills-live-tag">Connect for live tools</span>'
        : ''
      const connectBtn = live.needsLive
        ? live.connected
          ? ''
          : `<button type="button" class="settings-row-btn primary" data-plugin-connect="${escapeAttr(plug.plugin_id)}">Connect</button>`
        : ''
      return `<div class="skills-installed-row" data-plugin-row="${escapeAttr(plug.id)}">
        <div class="skills-installed-main">
          ${connectorLogoHtml(plug.plugin_id, plug.name)}
          <div class="skills-installed-meta">
            <strong>${escapeHtml(plug.name)}</strong>
            <span>${skills.length} skill${skills.length === 1 ? '' : 's'}</span>
            ${liveLine}
          </div>
        </div>
        ${skillList}
        <div class="skills-installed-actions">
          ${connectBtn}
          <button type="button" class="settings-row-btn" data-plugin-uninstall="${escapeAttr(plug.id)}">Remove</button>
        </div>
      </div>`
    })
    .join('')}</div>`
}

function settingsSkillsCustomHtml() {
  const skills = state.userSkills || []
  let list = ''
  if (!skills.length) {
    list = '<div class="skills-empty">No files yet.</div>'
  } else {
    list = `<div class="skills-file-list">${skills
      .map(
        (skill) => `<div class="skills-file-row" data-skill-id="${escapeAttr(skill.id)}">
          <div class="skills-file-meta">
            <strong>${escapeHtml(skill.name || skill.file_name || 'Skill')}</strong>
            <span>${escapeHtml(prettySkillSize(skill.size))}</span>
          </div>
          <div class="skills-file-actions">
            <button type="button" class="settings-row-btn" data-skill-attach="${escapeAttr(skill.id)}">Use</button>
            <button type="button" class="settings-row-btn" data-skill-delete="${escapeAttr(skill.id)}">Remove</button>
          </div>
        </div>`,
      )
      .join('')}</div>`
  }
  return `${list}
    <div class="skills-custom-actions">
      <button type="button" class="settings-row-btn primary" id="settings-skill-upload">Upload</button>
    </div>`
}

function settingsConnectLinkHtml() {
  const url = state.settingsConnectLink
  const code = state.settingsConnectCode
  const pluginId = state.settingsConnectPluginId
  if (!url) return ''
  const meta = pluginId ? catalogPluginById(pluginId) : null
  const logo = pluginId ? connectorLogoHtml(pluginId, meta?.name || pluginId) : ''
  return `<div class="skills-connect-link-box">
    ${
      pluginId
        ? `<div class="skills-connect-link-head">${logo}<div><strong>${escapeHtml(meta?.name || pluginId)}</strong><span>Connect link</span></div></div>`
        : '<p class="skills-connect-link-label">Connect link</p>'
    }
    <input type="text" class="skills-connect-link-input" id="settings-connect-link" readonly value="${escapeAttr(url)}" />
    <div class="skills-connect-link-actions">
      <button type="button" class="settings-row-btn" id="settings-connect-copy-link">Copy link</button>
      ${code ? `<button type="button" class="settings-row-btn" id="settings-connect-copy-code">Copy code</button>` : ''}
      <button type="button" class="settings-row-btn primary" id="settings-connect-open-link">Open</button>
    </div>
    ${
      code
        ? `<p class="skills-connect-link-hint">Enter code <span class="skills-connect-code">${escapeHtml(code)}</span> if asked.</p>`
        : ''
    }
  </div>`
}

function settingsSkillsHtml() {
  const loading = state.settingsSkillsLoading
  const err = state.settingsSkillsError
  const status = state.settingsSkillsStatus
  const sub = state.settingsSkillsSubview || 'marketplace'
  let body = ''
  if (loading) body = '<div class="skills-empty">Loading…</div>'
  else if (err && sub !== 'custom') body = `<div class="skills-empty skills-empty-err">${escapeHtml(err)}</div>`
  else if (sub === 'marketplace') body = settingsSkillsMarketplaceHtml()
  else if (sub === 'installed') body = settingsSkillsInstalledHtml()
  else body = settingsSkillsCustomHtml()
  return `<div class="skills-panel">
    <h1 class="settings-title">Skills</h1>
    ${status ? `<p class="skills-status">${escapeHtml(status)}</p>` : ''}
    ${settingsConnectLinkHtml()}
    <div class="settings-skills-toolbar">
      <input type="search" id="settings-skills-search" class="settings-search" placeholder="Search" value="${escapeAttr(state.settingsSkillsSearch)}" autocomplete="off" />
      ${sub === 'custom' ? '' : `<button type="button" class="settings-row-btn primary settings-skills-add" id="settings-skills-goto-custom" ${sub === 'custom' ? 'hidden' : ''}>Upload</button>`}
    </div>
    ${settingsSkillsTabsHtml()}
    <div class="settings-skills-body">${body}</div>
  </div>`
}

async function installMarketplacePlugin(pluginId) {
  if (!requireUser() || !pluginId) return
  state.pluginInstallBusy = pluginId
  state.settingsSkillsStatus = ''
  renderSettingsScreen()
  bindSettingsScreen()
  const res = await api.pluginsInstall?.({ pluginId })
  state.pluginInstallBusy = ''
  if (res?.error) {
    state.settingsSkillsStatus = res.error
    if (state.agentSkillsPickerOpen) paintAgentSkillsPicker()
    if (state.settingsOpen) {
      renderSettingsScreen()
      bindSettingsScreen()
    }
    return
  }
  const meta = catalogPluginById(pluginId)
  const n = meta?.skills?.length || 0
  const needsSignIn = Boolean(meta?.mcps?.length || meta?.mcpHint)
  state.settingsSkillsStatus = n
    ? needsSignIn
      ? `${meta?.name || 'Skill pack'} installed (${n} skills). Attach in chat ◆, then tap Connect on the Installed tab for live ${meta?.name || 'service'} tools.`
      : `${meta?.name || 'Skill pack'} installed (${n} skill${n === 1 ? '' : 's'}). Attach from chat ◆.`
    : `${meta?.name || 'Skill pack'} installed.`
  state.settingsSkillsSubview = 'installed'
  await loadPlugins()
  if (needsSignIn && meta?.id) {
    state.settingsSkillsStatus = `${meta?.name || 'Service'} installed — opening sign-in for live tools…`
    if (state.settingsOpen) {
      renderSettingsScreen()
      bindSettingsScreen()
    }
    await connectSkillPack(meta.id)
  } else if (state.settingsOpen) {
    await loadSettingsSkills()
  }
  if (state.agentSkillsPickerOpen) paintAgentSkillsPicker()
}

async function uploadSettingsSkill() {
  if (!requireUser()) return
  state.settingsSkillsStatus = ''
  const res = await api.skillsUpload?.()
  if (res?.cancelled) return
  if (res?.error) {
    state.settingsSkillsStatus = res.error
    renderSettingsScreen()
    bindSettingsScreen()
    return
  }
  state.settingsSkillsStatus = res?.skill?.name ? `Saved ${res.skill.name} as a skill.` : 'Skill saved.'
  await loadSettingsSkills()
}

function attachSkillToThread(skill) {
  if (!skill?.id) return
  const t = activeThread()
  t.attachedSkills = t.attachedSkills || []
  if (t.attachedSkills.some((row) => row.id === skill.id)) return
  t.attachedSkills.push({
    id: skill.id,
    name: skill.name,
    file_name: skill.file_name,
    excerpt: skill.excerpt,
  })
  scheduleWorkspaceSave()
  refreshAgentAttachRow()
}

function skillMetaFromAgentText(name, text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  const isSkillName = /skill\.md$/i.test(name) || /\.skill$/i.test(name)
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
  if (fm) {
    const meta = {}
    for (const line of fm[1].split('\n')) {
      const at = line.indexOf(':')
      if (at < 0) continue
      meta[line.slice(0, at).trim()] = line.slice(at + 1).trim().replace(/^["']|["']$/g, '')
    }
    if (meta.name || meta.description || isSkillName) {
      return {
        name: meta.name || String(name).replace(/\.(md|skill)$/i, ''),
        description: meta.description || 'Skill document',
        source: 'file',
        fileName: name,
        body: raw,
      }
    }
  }
  if (isSkillName || /^#\s+skill\b/im.test(raw) || /\bwhen to use\b/i.test(raw.slice(0, 1200))) {
    return {
      name: String(name).replace(/\.(md|skill)$/i, ''),
      description: 'Skill document',
      source: 'file',
      fileName: name,
      body: raw,
    }
  }
  return null
}

function attachManualSkillToThread(skill) {
  if (!skill?.name) return
  const t = activeThread()
  t.attachedManualSkills = t.attachedManualSkills || []
  if (t.attachedManualSkills.some((row) => row.name === skill.name && row.fileName === skill.fileName)) return
  t.attachedManualSkills.push({
    name: skill.name,
    description: skill.description || '',
    source: skill.source || 'file',
    fileName: skill.fileName || '',
    body: String(skill.body || '').slice(0, 120_000),
  })
  scheduleWorkspaceSave()
  refreshAgentAttachRow()
}

function detachManualSkillFromThread(name, fileName = '') {
  const t = activeThread()
  if (!Array.isArray(t.attachedManualSkills)) return
  t.attachedManualSkills = t.attachedManualSkills.filter(
    (row) => row.name !== name || (fileName && row.fileName !== fileName),
  )
  scheduleWorkspaceSave()
  refreshAgentAttachRow()
}

function attachLocalSkillToThread(skill) {
  if (!skill?.name) return
  const t = activeThread()
  t.attachedLocalSkills = t.attachedLocalSkills || []
  if (t.attachedLocalSkills.some((row) => row.name === skill.name)) return
  t.attachedLocalSkills.push({
    name: skill.name,
    description: skill.description || '',
    source: skill.source || 'local',
  })
  scheduleWorkspaceSave()
  refreshAgentAttachRow()
}

function detachLocalSkillFromThread(name) {
  const t = activeThread()
  if (!Array.isArray(t.attachedLocalSkills)) return
  t.attachedLocalSkills = t.attachedLocalSkills.filter((row) => row.name !== name)
  scheduleWorkspaceSave()
  refreshAgentAttachRow()
}

function toggleLocalSkillAttachment(skill) {
  const t = activeThread()
  const attached = (t.attachedLocalSkills || []).some((row) => row.name === skill.name)
  if (attached) detachLocalSkillFromThread(skill.name)
  else attachLocalSkillToThread(skill)
  paintAgentSkillsPicker()
}

function detachSkillFromThread(skillId) {
  const t = activeThread()
  if (!Array.isArray(t.attachedSkills)) return
  t.attachedSkills = t.attachedSkills.filter((row) => row.id !== skillId)
  scheduleWorkspaceSave()
  refreshAgentAttachRow()
}

function attachPluginSkillToThread(skill) {
  if (!skill?.id) return
  const t = activeThread()
  t.attachedPluginSkills = t.attachedPluginSkills || []
  if (t.attachedPluginSkills.some((row) => row.id === skill.id)) return
  t.attachedPluginSkills.push({ ...skill })
  scheduleWorkspaceSave()
  refreshAgentAttachRow()
}

function togglePluginSkillAttachment(skill) {
  if (!skill?.id) return
  const t = activeThread()
  const attached = (t.attachedPluginSkills || []).some((row) => row.id === skill.id)
  if (attached) detachPluginSkillFromThread(skill.id)
  else attachPluginSkillToThread(skill)
  paintAgentSkillsPicker()
}

function toggleSkillAttachment(skill) {
  if (!skill?.id) return
  const t = activeThread()
  const attached = (t.attachedSkills || []).some((row) => row.id === skill.id)
  if (attached) detachSkillFromThread(skill.id)
  else attachSkillToThread(skill)
  paintAgentSkillsPicker()
}

function detachPluginSkillFromThread(skillId) {
  const t = activeThread()
  if (!Array.isArray(t.attachedPluginSkills)) return
  t.attachedPluginSkills = t.attachedPluginSkills.filter((row) => row.id !== skillId)
  scheduleWorkspaceSave()
  refreshAgentAttachRow()
}

function pluginSkillByKey(key) {
  return flattenPluginSkills().find((row) => row.id === key) || null
}

function applyWindowLayout(layout) {
  state.windowLayout = layout === 'agent' ? 'agent' : 'editor'
  try {
    localStorage.setItem('soumtok-window-layout', state.windowLayout)
  } catch {
    /* ignore */
  }
  if (state.windowLayout === 'agent') document.body.classList.remove('agent-off')
  else document.body.classList.add('agent-off')
  renderAgentPanel()
  layoutEditor()
}

function bindSettingsScreen() {
  const screen = $('settings-screen')
  if (!screen) return
  screen.querySelectorAll('.settings-nav-item').forEach((btn) => {
    btn.onclick = () => {
      state.settingsTab = btn.dataset.tab
      if (state.settingsTab === 'test-hub') void loadSettingsDeployLinks()
      if (state.settingsTab === 'skills') void loadSettingsSkills()
      if (state.settingsTab === 'plan' || state.settingsTab === 'keys') void loadProviderKeys()
      renderSettingsScreen()
    }
  })
  $('settings-deploy-refresh')?.addEventListener('click', () => void loadSettingsDeployLinks())
  $('settings-skill-upload')?.addEventListener('click', () => void uploadSettingsSkill())
  $('settings-skills-goto-custom')?.addEventListener('click', () => {
    state.settingsSkillsSubview = 'custom'
    renderSettingsScreen()
    bindSettingsScreen()
    void uploadSettingsSkill()
  })
  screen.querySelectorAll('[data-skill-delete]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-skill-delete')
      const skill = state.userSkills.find((row) => row.id === id)
      if (!id || !window.confirm(`Remove "${skill?.name || 'this skill'}" from your account?`)) return
      btn.disabled = true
      const res = await api.skillsRemove?.({ id })
      btn.disabled = false
      if (res?.error) {
        state.settingsSkillsStatus = res.error
        renderSettingsScreen()
        bindSettingsScreen()
        return
      }
      state.settingsSkillsStatus = 'Skill removed.'
      state.threads.forEach((thread) => {
        if (Array.isArray(thread.attachedSkills)) {
          thread.attachedSkills = thread.attachedSkills.filter((row) => row.id !== id)
        }
      })
      await loadSettingsSkills()
    }
  })
  screen.querySelectorAll('[data-skill-attach]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-skill-attach')
      const skill = state.userSkills.find((row) => row.id === id)
      if (!skill) return
      attachSkillToThread(skill)
      state.settingsOpen = false
      document.body.classList.remove('settings-open')
      renderAgentPanel()
      state.settingsSkillsStatus = `Attached "${skill.name}" to this chat.`
    }
  })
  $('settings-skills-search')?.addEventListener('input', (e) => {
    state.settingsSkillsSearch = e.target.value
    renderSettingsScreen()
    bindSettingsScreen()
  })
  screen.querySelectorAll('[data-skills-sub]').forEach((btn) => {
    btn.onclick = () => {
      state.settingsSkillsSubview = btn.getAttribute('data-skills-sub') || 'marketplace'
      renderSettingsScreen()
      bindSettingsScreen()
    }
  })
  screen.querySelectorAll('[data-plugin-install]').forEach((btn) => {
    btn.onclick = () => void installMarketplacePlugin(btn.getAttribute('data-plugin-install'))
  })
  screen.querySelectorAll('[data-plugin-uninstall]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-plugin-uninstall')
      const plug = state.installedPlugins.find((row) => row.id === id)
      if (!id || !window.confirm(`Remove ${plug?.name || 'this plugin'} and its skills?`)) return
      btn.disabled = true
      const res = await api.pluginsRemove?.({ id })
      btn.disabled = false
      if (res?.error) {
        state.settingsSkillsStatus = res.error
        renderSettingsScreen()
        bindSettingsScreen()
        return
      }
      state.settingsSkillsStatus = 'Plugin removed.'
      await loadSettingsSkills()
    }
  })
  screen.querySelectorAll('[data-plugin-connect]').forEach((btn) => {
    btn.onclick = () => void connectSkillPack(btn.getAttribute('data-plugin-connect'), btn)
  })
  $('settings-connect-copy-link')?.addEventListener('click', async () => {
    const url = $('settings-connect-link')?.value || state.settingsConnectLink
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      state.settingsSkillsStatus = 'Link copied.'
    } catch {
      window.prompt('Copy link', url)
    }
    renderSettingsScreen()
    bindSettingsScreen()
  })
  $('settings-connect-copy-code')?.addEventListener('click', async () => {
    const code = state.settingsConnectCode
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      state.settingsSkillsStatus = 'Code copied.'
    } catch {
      window.prompt('Copy code', code)
    }
    renderSettingsScreen()
    bindSettingsScreen()
  })
  $('settings-connect-open-link')?.addEventListener('click', () => {
    const url = $('settings-connect-link')?.value || state.settingsConnectLink
    if (url) void api.openUrl?.(url)
  })
  screen.querySelectorAll('[data-plugin-skill]').forEach((btn) => {
    btn.onclick = () => {
      const skill = pluginSkillByKey(btn.getAttribute('data-plugin-skill'))
      if (!skill) return
      attachPluginSkillToThread(skill)
      state.settingsOpen = false
      document.body.classList.remove('settings-open')
      renderAgentPanel()
    }
  })
  screen.querySelectorAll('[data-deploy-copy]').forEach((btn) => {
    btn.onclick = async () => {
      const url = btn.getAttribute('data-deploy-copy') || ''
      if (!url) return
      try {
        await navigator.clipboard.writeText(url)
      } catch {
        window.prompt('Copy link', url)
      }
    }
  })
  screen.querySelectorAll('[data-deploy-delete]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-deploy-delete')
      if (!id || !window.confirm('Delete this share link from your history?')) return
      btn.disabled = true
      const res = await api.testHubDeleteDeploy?.({ id })
      btn.disabled = false
      if (res?.error) {
        window.alert(res.error)
        return
      }
      void loadSettingsDeployLinks()
    }
  })
  $('settings-search')?.addEventListener('input', (e) => {
    state.settingsSearch = e.target.value
    const nav = $('settings-nav-list')
    if (nav) nav.innerHTML = settingsNavHtml()
    bindSettingsScreen()
  })
  $('settings-upload-avatar')?.addEventListener('click', () => void uploadProfilePhoto())
  $('settings-billing')?.addEventListener('click', () => api.openBilling())
  $('settings-upgrade')?.addEventListener('click', () => api.openBilling())
  $('settings-upgrade-byok')?.addEventListener('click', () => api.openBilling())
  $('settings-reset-prefs')?.addEventListener('click', () => {
    if (window.confirm('Reset all Soumtok Desktop preferences on this device?')) resetDesktopPreferences()
  })
  $('settings-bug-report')?.addEventListener('click', () => openBugReport())
  $('settings-editor-font')?.addEventListener('change', (e) => {
    applyEditorFontSize(Number(e.target.value))
  })
  screen.querySelectorAll('[data-save-key]').forEach((btn) => {
    btn.onclick = async () => {
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return
      const id = btn.dataset.saveKey
      const input = $(`settings-key-${id}`)
      const key = input?.value?.trim()
      if (!key) return
      btn.disabled = true
      const res = await api.saveProviderKey(id, key)
      btn.disabled = false
      if (res?.error) {
        window.alert(res.error)
        return
      }
      if (input) input.value = ''
      await Promise.all([loadProviderKeys(), loadAgentModels(), loadAccountSummary()])
      renderSettingsScreen()
    }
  })
  screen.querySelectorAll('[data-rm-key]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.rmKey
      if (!window.confirm(`Remove ${PROVIDER_NAMES[id] || id} key from your account?`)) return
      const res = await api.deleteProviderKey(id)
      if (res?.error) {
        window.alert(res.error)
        return
      }
      await Promise.all([loadProviderKeys(), loadAgentModels(), loadAccountSummary()])
      renderSettingsScreen()
    }
  })
  $('settings-reload-plan')?.addEventListener('click', () => {
    void loadAccountSummary().then(() => renderSettingsScreen())
  })
  $('settings-refresh-models')?.addEventListener('click', () => {
    void Promise.all([loadAgentModels(), loadAccountSummary(), loadProviderKeys()]).then(() => renderSettingsScreen())
  })
  $('settings-model-search')?.addEventListener('input', (e) => {
    state.settingsModelSearch = e.target.value
    const box = $('settings-model-list')
    if (box) box.innerHTML = settingsModelListHtml()
    const card = box?.closest('.settings-model-card')
    if (card) {
      card.classList.toggle('expanded', state.settingsModelsExpanded || Boolean(state.settingsModelSearch.trim()))
    }
    bindSettingsScreen()
  })
  $('settings-view-all-models')?.addEventListener('click', () => {
    if (state.settingsModelsExpanded) state.settingsModelsExpanded = false
    else state.settingsModelsExpanded = true
    renderSettingsScreen()
  })
  const connSearch = $('settings-conn-search')
  if (connSearch) {
    connSearch.addEventListener('input', (e) => {
      state.settingsConnectorSearch = e.target.value
      clearTimeout(state._connMarketTimer)
      state._connMarketTimer = setTimeout(() => void paintConnectorsMarketplace(), 280)
    })
  }
  $('settings-conn-add-url')?.addEventListener('click', () => void connectCustomMcpUrl())
  $('settings-subagent-model')?.addEventListener('change', (e) => {
    state.subagentModel = e.target.value
    try {
      localStorage.setItem('soumtok-subagent-model', state.subagentModel)
    } catch {
      /* ignore */
    }
  })
  $('settings-default-model')?.addEventListener('change', (e) => {
    persistAgentModel(e.target.value)
    try {
      localStorage.setItem(AGENT_MODEL_STORAGE_KEY, state.agentModel)
    } catch {
      /* ignore */
    }
    setModelTriggerLabel()
  })
  const fastToggle = $('settings-fast-models')
  if (fastToggle) {
    fastToggle.onclick = () => {
      state.agentModelFast = !state.agentModelFast
      try {
        localStorage.setItem('soumtok-agent-model-fast', state.agentModelFast ? '1' : '0')
      } catch {
        /* ignore */
      }
      renderSettingsScreen()
      refreshModelPickerList()
    }
  }
  const ctrlToggle = $('settings-ctrl-enter')
  if (ctrlToggle) {
    ctrlToggle.onclick = () => {
      state.agentCtrlEnter = !state.agentCtrlEnter
      try {
        localStorage.setItem('soumtok-agent-ctrl-enter', state.agentCtrlEnter ? '1' : '0')
      } catch {
        /* ignore */
      }
      renderSettingsScreen()
    }
  }
  screen.querySelectorAll('[data-model-toggle]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.modelToggle
      const on = btn.classList.contains('on')
      toggleModelEnabled(id, !on)
      renderSettingsScreen()
    }
  })
  $('settings-logout')?.addEventListener('click', () => {
    closeSettings()
    void logout()
  })
  screen.querySelectorAll('.settings-layout-tile').forEach((btn) => {
    btn.onclick = () => {
      applyWindowLayout(btn.dataset.layout)
      renderSettingsScreen()
    }
  })
  screen.querySelectorAll('[data-theme-pref]').forEach((btn) => {
    btn.onclick = () => {
      applyDesktopTheme(btn.dataset.themePref)
      renderSettingsScreen()
    }
  })
  const agentToggle = $('settings-agent-panel')
  if (agentToggle) {
    agentToggle.onclick = () => {
      document.body.classList.toggle('agent-off')
      agentToggle.classList.toggle('on', !document.body.classList.contains('agent-off'))
      agentToggle.setAttribute('aria-checked', String(!document.body.classList.contains('agent-off')))
      layoutEditor()
    }
  }
  $('settings-default-mode')?.addEventListener('change', (e) => {
    state.agentMode = e.target.value
    activeThread().mode = state.agentMode
  })
  $('settings-agents-default-model')?.addEventListener('change', (e) => {
    persistAgentModel(e.target.value)
    try {
      localStorage.setItem(AGENT_MODEL_STORAGE_KEY, state.agentModel)
    } catch {
      /* ignore */
    }
    setModelTriggerLabel()
  })
  screen.querySelectorAll('[data-pref]').forEach((btn) => {
    btn.onclick = () => {
      const key = btn.dataset.pref
      if (!key) return
      setAgentPref(key, !state.agentPrefs[key])
      renderSettingsScreen()
    }
  })
  screen.querySelectorAll('[data-pref-select]').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      const key = sel.dataset.prefSelect
      if (!key) return
      setAgentPref(key, e.target.value)
      renderSettingsScreen()
    })
  })
  $('settings-check-updates')?.addEventListener('click', async () => {
    const status = $('settings-update-status')
    if (status) status.textContent = 'Checking…'
    try {
      const res = await api.checkUpdates?.()
      if (!status) return
      if (res?.ok && res?.updateInfo?.version) {
        status.textContent = `Update ${res.updateInfo.version} available`
      } else if (res?.reason === 'dev') {
        status.textContent = 'Updates run in packaged builds only'
      } else if (res?.ok) {
        status.textContent = 'You’re on the latest version'
      } else {
        status.textContent = res?.error || 'Could not check updates'
      }
    } catch (err) {
      if (status) status.textContent = err?.message || 'Check failed'
    }
  })
}

function renderSettingsScreen() {
  const screen = $('settings-screen')
  if (!screen || !state.settingsOpen) return
  const email = state.user?.email || state.user?.name || 'Signed in'
  const plan =
    state.accountSummary?.planLabel ||
    (state.user?.plan ? String(state.user.plan) : 'Soumtok')
  screen.hidden = false
  screen.innerHTML = `<div class="settings-shell">
    <aside class="settings-nav">
      <div class="settings-profile">
        <div class="settings-avatar settings-avatar-lg">${settingsAvatarMarkup('settings-avatar')}</div>
        <div class="settings-profile-meta">
          <div class="settings-email">${escapeHtml(email)}</div>
          <div class="settings-plan">${escapeHtml(plan)}</div>
        </div>
      </div>
      <input type="search" id="settings-search" class="settings-search" placeholder="Search settings" value="${escapeAttr(state.settingsSearch)}" autocomplete="off" />
      <nav class="settings-nav-list" id="settings-nav-list">${settingsNavHtml()}</nav>
    </aside>
    <main class="settings-main"><div class="settings-main-inner ${state.settingsTab === 'agents' || state.settingsTab === 'connectors' || state.settingsTab === 'skills' ? 'settings-main-wide' : ''}">${settingsMainHtml()}</div></main>
  </div>`
  bindSettingsScreen()
  if (state.settingsTab === 'connectors') void paintConnectorsMarketplace()
}

async function createFile() {
  if (!requireUser()) return
  if (state.folder) {
    await explorerNewFile()
    return
  }
  const file = await api.createFile()
  if (!file) return
  await enterProject()
  await openFile(file)
}

function isDotEnvTab(tab) {
  return tab && window.SoumtokEnvEditor?.isDotEnvFileName?.(tab.name || tab.path)
}

function setExplorerFocus(node) {
  if (!node?.path) {
    state.explorerFocus = state.folder ? { path: state.folder, type: 'dir' } : null
  } else {
    state.explorerFocus = { path: node.path, type: node.type || 'file' }
  }
  syncExplorerFocusUi()
}

function syncExplorerFocusUi() {
  const focus = state.explorerFocus?.path ? normPath(state.explorerFocus.path) : ''
  document.querySelectorAll('#tree .tree-row').forEach((row) => {
    const p = row.dataset.path ? normPath(row.dataset.path) : ''
    row.classList.toggle('explorer-focus', Boolean(focus && p === focus))
  })
}

function explorerTargetDirPath() {
  const focus = state.explorerFocus
  if (!state.folder) return null
  if (!focus?.path) return state.folder
  if (focus.type === 'dir' || focus.path === state.folder) return focus.path
  const parts = focus.path.replace(/\\/g, '/').split('/')
  parts.pop()
  const joined = parts.join('/')
  if (!joined || normPath(joined) === normPath(state.folder)) return state.folder
  return focus.path.includes('\\') ? parts.join('\\') : joined
}

function workspaceRelPath(absPath) {
  const root = normPath(state.folder)
  const full = normPath(absPath)
  if (!root || !full.startsWith(root)) return absPath
  return full.slice(root.length).replace(/^\/+/, '')
}

function explorerInlineParentIs(dirPath) {
  const ic = state.explorerInlineCreate
  if (!ic?.parentPath || !dirPath) return false
  return normPath(ic.parentPath) === normPath(dirPath)
}

function cancelExplorerInlineCreate() {
  if (!state.explorerInlineCreate) return
  state.explorerInlineCreate = null
  renderSide()
}

function beginExplorerInlineCreate(mode) {
  if (!requireUser() || !state.folder) return
  const parent = explorerTargetDirPath() || state.folder
  state.explorerInlineCreate = { mode, parentPath: parent }
  state.expandedDirs.add(state.folder)
  state.expandedDirs.add(parent)
  state.expandedDirs.add(normPath(parent))
  for (const d of ancestorDirs(parent)) {
    state.expandedDirs.add(d)
    state.expandedDirs.add(normPath(d))
  }
  renderSide()
  requestAnimationFrame(() => {
    const inp = document.querySelector('#tree .tree-inline-input')
    inp?.focus()
    inp?.select()
  })
}

function explorerNewFile() {
  beginExplorerInlineCreate('file')
}

function explorerNewFolder() {
  beginExplorerInlineCreate('folder')
}

async function commitExplorerInlineCreate(name) {
  const ic = state.explorerInlineCreate
  if (!ic || !state.folder) return
  const trimmed = String(name || '').trim()
  if (!trimmed) {
    cancelExplorerInlineCreate()
    return
  }
  if (/[\\/:*?"<>|]/.test(trimmed)) {
    appendPanelOutput('[explorer] Name cannot contain \\ / : * ? " < > |\n')
    return
  }
  const baseDir = ic.parentPath || state.folder
  const relBase = workspaceRelPath(baseDir)
  const rel = relBase ? `${relBase}/${trimmed}`.replace(/\\/g, '/') : trimmed
  state.explorerInlineCreate = null
  try {
    if (ic.mode === 'folder') {
      const dir = await api.mkdirPath(rel)
      state.expandedDirs.add(baseDir)
      state.expandedDirs.add(dir.path)
      await refreshTree()
      setExplorerFocus({ path: dir.path, type: 'dir' })
      return
    }
    const isEnv = window.SoumtokEnvEditor?.isDotEnvFileName?.(trimmed)
    const seed = isEnv ? '# Environment variables\nSOUMTOK_API=\n' : ''
    const file = await api.createFilePath(rel, seed)
    await refreshTree()
    setExplorerFocus({ path: file.path, type: 'file' })
    await openFile(file)
  } catch (err) {
    appendPanelOutput(`[explorer] ${err?.message || 'Could not create'}\n`)
    renderSide()
  }
}

function appendExplorerInlineRow(wrap, depth, parentPath) {
  const ic = state.explorerInlineCreate
  if (!ic || !wrap) return
  const row = document.createElement('div')
  row.className = 'tree-row tree-inline-create'
  row.style.setProperty('--depth', String(depth))
  const pad = document.createElement('span')
  pad.className = 'tree-chev tree-chev-pad'
  row.appendChild(pad)
  const stub = { type: ic.mode === 'folder' ? 'dir' : 'file', name: ic.mode === 'folder' ? 'folder' : 'file' }
  const icon = window.SoumtokFileIcons?.createTreeIconEl?.(stub, false) || document.createElement('span')
  icon.className = 'tree-icon'
  row.appendChild(icon)
  const field = document.createElement('div')
  field.className = 'tree-inline-field'
  const inputWrap = document.createElement('div')
  inputWrap.className = 'tree-inline-input-wrap'
  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'tree-inline-input'
  input.placeholder = ic.mode === 'folder' ? 'New folder' : 'New file'
  input.setAttribute('aria-label', ic.mode === 'folder' ? 'New folder name' : 'New file name')
  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'tree-inline-cancel'
  cancelBtn.title = 'Cancel'
  cancelBtn.setAttribute('aria-label', ic.mode === 'folder' ? 'Cancel new folder' : 'Cancel new file')
  cancelBtn.innerHTML =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 8.71 11.65 12l.7-.71L8.71 8l3.64-3.65-.71-.7L8 7.29 4.35 3.65l-.7.71L7.29 8l-3.64 3.65.71.7L8 8.71z"/></svg>'
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    cancelExplorerInlineCreate()
  })
  inputWrap.appendChild(input)
  inputWrap.appendChild(cancelBtn)
  const sep = parentPath.includes('\\') ? '\\' : '/'
  const pathHint = document.createElement('span')
  pathHint.className = 'tree-inline-path'
  pathHint.textContent = parentPath.endsWith(sep) ? parentPath : `${parentPath}${sep}`
  field.appendChild(inputWrap)
  field.appendChild(pathHint)
  row.appendChild(field)
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      void commitExplorerInlineCreate(input.value)
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelExplorerInlineCreate()
    }
  })
  input.addEventListener('click', (e) => e.stopPropagation())
  row.addEventListener('click', (e) => e.stopPropagation())
  wrap.appendChild(row)
}

function explorerCollapseAll() {
  state.expandedDirs.clear()
  if (state.folder) state.expandedDirs.add(state.folder)
  paintExplorerTree()
}

function explorerRelPath(nodePath, rootPath) {
  const p = normPath(nodePath || '')
  const r = normPath(rootPath || '')
  if (r && p.startsWith(r)) return p.slice(r.length).replace(/^\//, '').toLowerCase()
  return p.toLowerCase()
}

function nodeMatchesExplorerFilter(node, query, rootPath) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  const name = String(node.name || '').toLowerCase()
  const rel = explorerRelPath(node.path, rootPath)
  return name.includes(q) || rel.includes(q)
}

function filterExplorerTree(nodes, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return nodes
  const walk = (list, rootPath) => {
    const out = []
    for (const node of list || []) {
      const branchRoot = node.workspaceRoot ? node.path : rootPath
      if (node.type === 'file') {
        if (nodeMatchesExplorerFilter(node, q, branchRoot)) out.push(node)
        continue
      }
      const children = walk(node.children || [], branchRoot)
      const nameHit = nodeMatchesExplorerFilter(node, q, branchRoot)
      if (nameHit || children.length) {
        out.push({ ...node, children: nameHit ? node.children || [] : children })
      }
    }
    return out
  }
  return walk(nodes, state.folder)
}

function expandFilteredExplorerDirs(nodes) {
  for (const node of nodes || []) {
    if (node.type !== 'dir') continue
    state.expandedDirs.add(node.path)
    state.expandedDirs.add(normPath(node.path))
    expandFilteredExplorerDirs(node.children)
  }
}

function toggleExplorerFilter() {
  state.explorerFilterOpen = !state.explorerFilterOpen
  if (!state.explorerFilterOpen) state.explorerFilterText = ''
  renderSide()
  if (state.explorerFilterOpen) {
    requestAnimationFrame(() => $('explorer-filter-input')?.focus())
  }
}

function onExplorerFilterInput() {
  state.explorerFilterText = $('explorer-filter-input')?.value || ''
  const q = state.explorerFilterText.trim()
  if (q && state.folder) {
    const roots = [
      {
        name: formatProjectName($('tb-center')?.textContent || ''),
        type: 'dir',
        path: state.folder,
        children: state.tree,
        workspaceRoot: true,
      },
      ...(state.extraRoots || []).map((r) => ({
        name: r.name || projectFolderLabel(r.path),
        type: 'dir',
        path: r.path,
        children: r.tree || [],
        workspaceRoot: true,
      })),
    ]
    expandFilteredExplorerDirs(filterExplorerTree(roots, q))
  }
  paintExplorerTree()
}

function paintExplorerTree() {
  const treeHost = $('tree')
  if (!treeHost) return
  treeHost.innerHTML = ''
  if (!state.folder) return
  const q = state.explorerFilterText.trim()
  const filterRow = $('explorer-filter-row')
  const filterBtn = $('explorer-filter')
  if (filterRow) filterRow.hidden = !state.explorerFilterOpen
  if (filterBtn) filterBtn.classList.toggle('on', state.explorerFilterOpen)
  if (!(state.tree.length || state.extraRoots?.length)) {
    treeHost.innerHTML = q ? '<p class="tree-empty">No files match filter.</p>' : '<p class="tree-empty">Empty folder</p>'
    return
  }
  let roots = [
    {
      name: formatProjectName($('tb-center')?.textContent || ''),
      type: 'dir',
      path: state.folder,
      children: state.tree,
      workspaceRoot: true,
    },
    ...(state.extraRoots || []).map((r) => ({
      name: r.name || projectFolderLabel(r.path),
      type: 'dir',
      path: r.path,
      children: r.tree || [],
      workspaceRoot: true,
    })),
  ]
  if (q) {
    roots = filterExplorerTree(roots, q)
    if (!roots.length) {
      treeHost.innerHTML = '<p class="tree-empty">No files match filter.</p>'
      return
    }
  }
  treeHost.appendChild(renderTree(roots, 0))
  if (!state.explorerFocus) setExplorerFocus({ path: state.folder, type: 'dir' })
  else syncExplorerFocusUi()
}

async function explorerRevealInOs(node) {
  if (!node?.path) return
  try {
    await api.showItemInFolder(node.path)
  } catch (err) {
    appendPanelOutput(`[explorer] ${err?.message || 'Reveal failed'}\n`)
  }
}

async function explorerDeleteNode(node) {
  if (!node?.path || !state.folder) return
  const ok = await askPrompt(`Delete “${node.name}”?`, 'Type DELETE to confirm')
  if (String(ok || '').trim().toUpperCase() !== 'DELETE') return
  try {
    await api.deletePath(node.path)
    const tab = state.tabs.find((t) => sameFilePath(t.path, node.path))
    if (tab) closeTab(tab.path)
    await refreshTree()
  } catch (err) {
    appendPanelOutput(`[explorer] ${err?.message || 'Delete failed'}\n`)
  }
}

async function explorerRenameNode(node) {
  if (!node?.path) return
  const next = await askPrompt('Rename to', node.name)
  if (next == null || !String(next).trim() || next === node.name) return
  const dir = node.path.replace(/[/\\][^/\\]+$/, '')
  const to = `${dir}${node.path.includes('\\') ? '\\' : '/'}${String(next).trim()}`
  try {
    const out = await api.renamePath(node.path, to)
    const tab = state.tabs.find((t) => sameFilePath(t.path, node.path))
    if (tab) {
      tab.path = out.path
      tab.name = out.name
      if (state.active && sameFilePath(state.active, node.path)) state.active = out.path
    }
    await refreshTree()
    setExplorerFocus({ path: out.path, type: node.type })
  } catch (err) {
    appendPanelOutput(`[explorer] ${err?.message || 'Rename failed'}\n`)
  }
}

function bindExplorerContextMenu() {
  let menu = document.getElementById('tree-context-menu')
  if (!menu) {
    menu = document.createElement('div')
    menu.id = 'tree-context-menu'
    menu.className = 'tree-context-menu'
    menu.hidden = true
    menu.setAttribute('role', 'menu')
    document.body.appendChild(menu)
  }
  if (menu.dataset.bound) return
  menu.dataset.bound = '1'
  document.addEventListener('click', () => {
    menu.hidden = true
  })
}

function openExplorerContextMenu(x, y, node) {
  bindExplorerContextMenu()
  const menu = document.getElementById('tree-context-menu')
  if (!menu) return
  setExplorerFocus(node)
  const isDir = node.type === 'dir'
  menu.innerHTML = `
    <button type="button" class="tree-ctx-item" data-act="new-file">New File</button>
    <button type="button" class="tree-ctx-item" data-act="new-folder">New Folder</button>
    <hr class="ext-filter-sep" />
    <button type="button" class="tree-ctx-item" data-act="rename"${isDir && node.workspaceRoot ? ' disabled' : ''}>Rename</button>
    <button type="button" class="tree-ctx-item" data-act="delete"${node.workspaceRoot ? ' disabled' : ''}>Delete</button>
    <hr class="ext-filter-sep" />
    <button type="button" class="tree-ctx-item" data-act="reveal">Reveal in File Explorer</button>
    <button type="button" class="tree-ctx-item" data-act="refresh">Refresh Explorer</button>`
  menu.hidden = false
  menu.style.left = `${x}px`
  menu.style.top = `${y}px`
  menu.querySelectorAll('.tree-ctx-item').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation()
      menu.hidden = true
      const act = btn.dataset.act
      if (act === 'new-file') void explorerNewFile()
      if (act === 'new-folder') void explorerNewFolder()
      if (act === 'rename') void explorerRenameNode(node)
      if (act === 'delete') void explorerDeleteNode(node)
      if (act === 'reveal') void explorerRevealInOs(node)
      if (act === 'refresh') void refreshTree()
    }
  })
}

function rememberLastEditLocation() {
  const tab = activeEditorTab()
  if (!tab || !state.editor || !state.editorCursor) return
  lastEditLocation = {
    path: tab.path,
    line: state.editorCursor.line,
    column: state.editorCursor.column,
  }
}

async function goLastEditLocation() {
  if (!lastEditLocation) return
  const { path, line, column } = lastEditLocation
  await openFile({ path, name: path.split(/[/\\]/).pop() || path })
  requestAnimationFrame(() => {
    if (!state.editor) return
    state.editor.setPosition({ lineNumber: line, column: column || 1 })
    state.editor.revealLineInCenter(line)
    state.editor.focus()
  })
}

function switchEditorTab(delta) {
  if (state.tabs.length < 2) return
  const idx = state.tabs.findIndex((t) => sameFilePath(t.path, state.active))
  const base = idx >= 0 ? idx : 0
  const next = (base + delta + state.tabs.length) % state.tabs.length
  rememberLastEditLocation()
  state.active = state.tabs[next].path
  renderTabs()
  renderEditor()
}

function runMonacoAction(actionId) {
  if (!state.editor) return false
  state.editor.focus()
  const action = state.editor.getAction(actionId)
  if (!action) return false
  void action.run()
  return true
}

function runMonacoGoAction(actionId) {
  if (!state.editor) {
    showPanel('problems')
    return false
  }
  return runMonacoAction(actionId)
}

function goBack() {
  if (!canGoBack()) return
  rememberLastEditLocation()
  historyAt -= 1
  state.active = tabHistory[historyAt]
  renderTabs()
  renderEditor()
}

function goForward() {
  if (!canGoForward()) return
  rememberLastEditLocation()
  historyAt += 1
  state.active = tabHistory[historyAt]
  renderTabs()
  renderEditor()
}

function selectAll() {
  state.editor?.focus()
  state.editor?.getAction('editor.action.selectAll')?.run()
}

function isPanelOpen() {
  return $('workbench')?.classList.contains('panel-open') ?? false
}

function setPanelOpen(open) {
  $('workbench')?.classList.toggle('panel-open', open)
  if (open) {
    requestAnimationFrame(() => window.SoumtokTerminal?.fitAll())
  }
}

async function mirrorAgentTerminalOutput(payload) {
  let out = String(payload?.output || '')
  if (!out.trim()) return
  out = out.replace(/^\[soumtok capture\]\r?\n/gim, '')
  if (out.length > 24_000) out = out.slice(-24_000)
  await openTerminalPanel(false)
  window.SoumtokTerminal?.appendDisplay?.(out)
}

async function runAgentTerminalCommand(payload) {
  const line = String(typeof payload === 'string' ? payload : payload?.command || '').trim()
  if (!line) return
  const dir = (typeof payload === 'object' && payload?.cwd) || state.folder
  const newSession = typeof payload === 'object' && payload?.newSession === true
  showPanel('terminal')
  if (layout.panel < 220) {
    layout.panel = clamp(280, 120, Math.min(480, window.innerHeight * 0.45))
    applyLayout()
  }
  if (dir) {
    const same =
      state.folder &&
      String(dir).replace(/\\/g, '/').toLowerCase() === String(state.folder).replace(/\\/g, '/').toLowerCase()
    if (!same) {
      try {
        await api.openPath(dir)
      } catch {
        /* ignore */
      }
    }
    window.SoumtokTerminal?.setProjectCwd(dir)
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  if (newSession) await window.SoumtokTerminal?.newTerminal?.()
  else await window.SoumtokTerminal?.ensureReady?.()
  window.SoumtokTerminal?.focusActive?.()
  await new Promise((r) => setTimeout(r, 450))
  if (typeof window.SoumtokTerminal?.runAgentCommand === 'function') {
    await window.SoumtokTerminal.runAgentCommand(line, { cwd: dir })
    return
  }
  await window.SoumtokTerminal?.runAgentCommand?.(line, { cwd: dir })
}

async function openTerminalPanel(newSession = false) {
  showPanel('terminal')
  if (layout.panel < 220) {
    layout.panel = clamp(280, 120, Math.min(480, window.innerHeight * 0.45))
    applyLayout()
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  if (state.folder) {
    window.SoumtokTerminal?.setProjectCwd(state.folder)
    try {
      await api.openPath(state.folder)
    } catch {
      /* main may already know folder */
    }
  }
  if (newSession) await window.SoumtokTerminal?.newTerminal()
  else await window.SoumtokTerminal?.ensureOne()
  window.SoumtokTerminal?.focusActive?.()
}

function appendPanelOutput(text) {
  showPanel('output')
  const log = $('panel-output-log')
  if (log) {
    log.textContent += text
    log.scrollTop = log.scrollHeight
  }
  $('output-clear')?.removeAttribute('disabled')
  $('output-scroll-lock')?.removeAttribute('disabled')
  $('output-clear')?.setAttribute('title', 'Clear Output')
  $('output-scroll-lock')?.setAttribute('title', 'Toggle scroll lock')
}

async function runBuildTask() {
  if (!state.folder) {
    appendPanelOutput('[build] Open a folder first.\n')
    return
  }
  const tasksPath = joinWorkspacePath('.vscode/tasks.json')
  let raw
  try {
    raw = await api.readFile(tasksPath)
  } catch {
    appendPanelOutput('[build] Add .vscode/tasks.json with a build task (label "build").\n')
    return
  }
  let tasks
  try {
    tasks = JSON.parse(raw)
  } catch {
    appendPanelOutput('[build] Invalid tasks.json\n')
    return
  }
  const list = tasks?.tasks || []
  const build =
    list.find((t) => t.group?.kind === 'build' && t.group?.isDefault) ||
    list.find((t) => t.group?.kind === 'build') ||
    list.find((t) => /^build$/i.test(t.label || ''))
  if (!build) {
    appendPanelOutput('[build] No build task in tasks.json\n')
    return
  }
  const cmd = build.command || (build.type === 'npm' ? 'npm' : '')
  const args = (build.args || []).join(' ')
  const line = [cmd, args].filter(Boolean).join(' ').trim() || build.label
  appendPanelOutput(`[build] ${line}\n`)
  await openTerminalPanel(false)
  api.termWrite({ data: `${line}\r\n` })
}

async function runActiveFile() {
  const tab = activeEditorTab()
  if (!tab?.path) {
    appendPanelOutput('[run] Open a file first.\n')
    return
  }
  await openTerminalPanel(false)
  const p = tab.path.replace(/"/g, '\\"')
  const ext = (tab.name || tab.path).split('.').pop()?.toLowerCase() || ''
  let cmd = `node "${p}"\n`
  if (ext === 'py') cmd = `python "${p}"\n`
  if (ext === 'ps1') cmd = `powershell -File "${p}"\n`
  api.termWrite({ data: cmd.replace(/\n/g, '\r\n') })
}

function runSelectedText() {
  const sel = state.editor?.getModel()?.getValueInRange(state.editor.getSelection())
  if (!sel?.trim()) {
    appendPanelOutput('[run] Select code in the editor first.\n')
    return
  }
  void openTerminalPanel(false).then(() => {
    api.termWrite({ data: `${sel.trim()}\r\n` })
  })
}

function togglePanelMax() {
  if (panelMaxBefore != null) {
    layout.panel = panelMaxBefore
    panelMaxBefore = null
  } else {
    panelMaxBefore = layout.panel
    layout.panel = Math.min(Math.round(window.innerHeight * 0.55), 520)
  }
  applyLayout()
  window.SoumtokTerminal?.fitAll()
}

function syncPanelToolbar(panelId) {
  const id = panelId || 'terminal'
  for (const el of document.querySelectorAll('.panel-view-actions, #term-toolbar')) {
    el.hidden = true
  }
  const map = {
    problems: 'panel-actions-problems',
    output: 'panel-actions-output',
    debug: 'panel-actions-debug',
    terminal: 'term-toolbar',
    ports: 'panel-actions-ports',
  }
  const active = $(map[id] || 'term-toolbar')
  if (active) active.hidden = false

  const log = $('panel-output-log')
  const hasOut = Boolean(log?.textContent?.trim())
  $('output-clear')?.toggleAttribute('disabled', !hasOut)
  $('output-scroll-lock')?.toggleAttribute('disabled', !hasOut)
  if (hasOut) {
    $('output-clear')?.setAttribute('title', 'Clear Output')
    $('output-scroll-lock')?.setAttribute('title', 'Toggle scroll lock')
  }

  window.SoumtokTerminal?.syncToolbar?.()
}

function showPanel(id) {
  if (!requireUser()) return
  enterWorkbench()
  setPanelOpen(true)
  const panelId = id || 'terminal'
  document.querySelectorAll('#panel-bar .panel-tab').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.panel === panelId)
  })
  for (const view of document.querySelectorAll('#panel-body .panel-view')) {
    view.hidden = view.id !== `view-${panelId}`
  }
  syncPanelToolbar(panelId)
  if (panelId === 'terminal') {
    if (state.folder) window.SoumtokTerminal?.setProjectCwd(state.folder)
    void window.SoumtokTerminal?.ensureOne()?.then?.(() => {
      window.SoumtokTerminal?.fitAll()
      window.SoumtokTerminal?.syncToolbar?.()
      setTimeout(() => {
        window.SoumtokTerminal?.fitAll()
        window.SoumtokTerminal?.syncToolbar?.()
      }, 250)
    })
  }
  if (panelId === 'problems') renderProblemsPanel()
  requestAnimationFrame(() => window.SoumtokTerminal?.fitAll())
}

function inferWorkspaceRootFromTabs() {
  const paths = state.tabs.map((t) => t.path).filter(Boolean)
  if (!paths.length) return null
  let root = paths[0]
  for (const p of paths) {
    if (!p) continue
    const file = normPath(p)
    let base = root
    while (base) {
      const b = normPath(base)
      if (file === b || file.startsWith(`${b}/`)) break
      base = base.replace(/[/\\][^/\\]+$/, '')
    }
    root = base || root
  }
  return root || null
}

function inferWorkspaceRootFromTree() {
  if (!state.tree?.length) return null
  const paths = state.tree.map((n) => n.path).filter(Boolean)
  if (!paths.length) return null
  let root = paths[0]
  for (const p of paths) {
    const file = normPath(p)
    let base = root
    while (base) {
      const b = normPath(base)
      if (file === b || file.startsWith(`${b}/`)) break
      base = base.replace(/[/\\][^/\\]+$/, '')
    }
    root = base || root
  }
  return root || null
}

function gitWorkspaceHint() {
  return state.folder || inferWorkspaceRootFromTabs() || inferWorkspaceRootFromTree() || null
}

async function ensureProjectFolder() {
  const info = await api.info()
  if (info.folder) {
    state.folder = info.folder
    return info.folder
  }
  const inferred = inferWorkspaceRootFromTabs()
  const target = inferred || state.folder || info.lastFolder || null
  if (!target) return null
  const opened = await api.openPath(target)
  if (opened) {
    state.folder = opened
    return opened
  }
  return null
}

async function refreshTree() {
  if (!state.user) {
    setMode('auth')
    return
  }
  await ensureProjectFolder()
  const data = await api.tree(state.workspaceExtraFolders)
  state.folder = data.folder
  state.tree = data.tree || []
  state.extraRoots = data.extraRoots || []
  $('tb-center').textContent = formatProjectName(data.name || '')
  if (state.folder) {
    setMode('project')
    window.SoumtokTerminal?.setProjectCwd(state.folder)
    renderAgentPanel()
    if (state.side === 'account') state.side = 'files'
    if (state.side === 'files' || state.side === 'search' || state.side === 'git') {
      renderSide()
    } else {
      state.side = 'files'
      showSide('files')
    }
    renderEditor()
    await refreshGit()
  } else {
    setMode('home')
    await renderRecents()
  }
}

async function renderRecents() {
  const items = ((await api.recents()) || []).slice().sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0))
  $('home-view-all').textContent = items.length ? `View all (${items.length})` : 'View all'
  const shown = items.slice(0, recentsLimit)
  if (!shown.length) {
    $('home-recents').innerHTML = `<div class="home-empty">No recent projects yet</div>`
    return
  }
  $('home-recents').innerHTML = shown
    .map(
      (item) =>
        `<div class="recent" data-path="${escapeAttr(item.path)}"><span class="recent-name">${escapeHtml(item.name)}</span><span class="recent-path">${escapeHtml(item.path)}</span></div>`,
    )
    .join('')
  $('home-recents').querySelectorAll('.recent').forEach((row) => {
    row.onclick = () => openRecent(row.dataset.path)
  })
}

async function openRecent(dir) {
  if (!requireUser()) return
  if (!dir) return
  if (workspacePathsEqual(await currentOpenProjectPath(), dir)) return
  await switchToProject({ nextPath: dir })
}

async function cloneRepo() {
  if (!requireUser()) return
  const url = await askPrompt('Clone repository', 'https://github.com/org/repo.git')
  if (!url) return
  if (!(await confirmLeaveCurrentProject({ intent: 'clone' }))) return
  showProjectSwitchProgress('Saving project session…')
  await persistCurrentProjectSession()
  clearProjectUiForSwitch()
  showProjectSwitchProgress('Cloning repository…')
  const res = await api.clone(url)
  hideProjectSwitchProgress()
  if (res?.error) {
    await askPrompt(res.error, '', true)
    return
  }
  await enterProject()
}

async function connectSsh() {
  if (!requireUser()) return
  const target = await askPrompt('Connect via SSH', 'user@host')
  if (!target) return
  const res = await api.ssh(target)
  if (res?.error) await askPrompt(res.error, '', true)
}

function askPrompt(title, placeholder, notice = false) {
  $('prompt-title').textContent = title
  $('prompt-input').value = ''
  $('prompt-input').placeholder = placeholder || ''
  $('prompt-input').hidden = notice
  $('prompt-ok').textContent = notice ? 'OK' : 'Continue'
  $('prompt').hidden = false
  if (!notice) $('prompt-input').focus()
  return new Promise((resolve) => {
    promptResolver = resolve
  })
}

function closePrompt(value) {
  $('prompt').hidden = true
  $('prompt-input').hidden = false
  const done = promptResolver
  promptResolver = null
  done?.(value)
}

function openTestHub() {
  if (!requireUser()) return
  closeSettings()
  if (state.testHubAgentWasOff === null) {
    state.testHubAgentWasOff = document.body.classList.contains('agent-off')
  }
  if (state.testHubSidebarWasOff === null) {
    state.testHubSidebarWasOff = document.body.classList.contains('sidebar-off')
  }
  document.body.classList.add('agent-off')
  enterWorkbench({ allowNoFolder: true })
  state.side = 'test-hub'
  document.body.classList.add('sidebar-off')
  syncActivityRailHighlight()
  renderSide()
  window.SoumtokTestHub?.show(true)
  layoutEditor()
}

function closeTestHub() {
  const restoreAgent = state.testHubAgentWasOff
  const restoreSidebar = state.testHubSidebarWasOff
  state.testHubAgentWasOff = null
  state.testHubSidebarWasOff = null
  const el = $('test-hub-screen')
  if (el) el.hidden = true
  document.body.classList.remove('test-hub-mode')
  if (restoreAgent === false) document.body.classList.remove('agent-off')
  else document.body.classList.add('agent-off')
  if (restoreSidebar) document.body.classList.add('sidebar-off')
  else document.body.classList.remove('sidebar-off')
  if (state.side === 'test-hub') {
    state.side = 'files'
    renderSide()
  }
  syncActivityRailHighlight()
  layoutEditor()
}

function showSide(id) {
  if (!requireUser()) return
  closeSettings()
  if (state.side === 'test-hub' && id !== 'test-hub') {
    closeTestHub()
  }
  const extId = extensionIdFromSide(id)
  if (extId) {
    enterWorkbench({ allowNoFolder: true })
    const item = findExtensionActivityItem(extId)
    const sameExtension = state.extDock?.item?.extensionId === item?.extensionId
    document.querySelectorAll('#activity .act').forEach((btn) => {
      btn.classList.toggle('on', btn.dataset.side === id)
    })
    if (extensionDockOpen() && sameExtension) {
      closeExtensionDock()
      document.querySelectorAll('#activity .act').forEach((btn) => {
        btn.classList.toggle('on', btn.dataset.side === state.side)
      })
      return
    }
    state.side = id
    void openExtensionHostEditor(item)
    return
  }
  enterWorkbench({ allowNoFolder: id === 'extensions' || id === 'connectors' })
  state.side = id
  document.body.classList.remove('sidebar-off')
  document.querySelectorAll('#activity .act').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.side === id)
  })
  if (id === 'agent') {
    openAgentsWindow()
    return
  }
  if (id === 'test-hub') {
    if (state.side === 'test-hub' && window.SoumtokTestHub?.isOpen?.()) {
      closeTestHub()
      return
    }
    openTestHub()
    return
  }
  renderSide()
}

function renderSide() {
  const root = $('sidebar')
  if (state.side === 'files') {
    root.innerHTML = `<div class="side-section">
      <div class="side-section-head">
        <span class="side-section-title">Explorer</span>
        <div class="side-section-tools">
          <button type="button" class="side-icon-btn" id="explorer-new-file" title="New File">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M9 2.5H4.5A1.5 1.5 0 0 0 3 4v8a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 13 12V6.5L9 2.5z"/><path d="M9 2.5V6.5H13"/><path d="M8 9v3M6.5 10.5H9.5"/></svg>
          </button>
          <button type="button" class="side-icon-btn" id="explorer-new-folder" title="New Folder">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M2.5 4.5h5l1.5 2h5.5v6.5H2.5V4.5z"/><path d="M8 8v3M6.5 9.5h3"/></svg>
          </button>
          <button type="button" class="side-icon-btn" id="explorer-refresh" title="Refresh Explorer">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M2.5 8a5.5 5.5 0 0 1 9.2-4"/><path d="M13.5 8a5.5 5.5 0 0 1-9.2 4"/><path d="M11 2.5h2v2M5 13.5H3v-2"/></svg>
          </button>
          <button type="button" class="side-icon-btn${state.explorerFilterOpen ? ' on' : ''}" id="explorer-filter" title="Filter Files in Explorer">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M2.5 4h11M4.5 8h7M6.5 12h3"/></svg>
          </button>
        </div>
      </div>
      <div class="explorer-filter-row"${state.explorerFilterOpen ? '' : ' hidden'} id="explorer-filter-row">
        <input id="explorer-filter-input" type="search" placeholder="Filter files (e.g. .ts, src/)" value="${escapeAttr(state.explorerFilterText)}" />
      </div>
      <div class="side-body tree-scroll" id="tree"></div>
    </div>`
    $('explorer-new-file').onclick = () => void explorerNewFile()
    $('explorer-new-folder').onclick = () => void explorerNewFolder()
    $('explorer-refresh').onclick = () => void refreshTree()
    $('explorer-filter').onclick = () => toggleExplorerFilter()
    const filterInput = $('explorer-filter-input')
    filterInput?.addEventListener('input', onExplorerFilterInput)
    filterInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        state.explorerFilterOpen = false
        state.explorerFilterText = ''
        renderSide()
      }
    })
    paintExplorerTree()
    return
  }
  if (state.side === 'test-hub') {
    root.innerHTML = ''
    return
  }
  if (state.side === 'search') {
    const showReplace = workspaceSearchUi.showReplace
    root.innerHTML = `<div class="side-section search-workspace-section">
      <div class="side-section-head"><span class="side-section-title">Search</span></div>
      <div class="side-body search-workspace-body">
        <input id="search-q" type="search" placeholder="Search" value="${escapeAttr(workspaceSearchUi.query)}" />
        <input id="search-replace" placeholder="Replace"${showReplace ? '' : ' hidden'} value="${escapeAttr(workspaceSearchUi.replace)}" />
        <div class="search-workspace-actions"${showReplace ? '' : ' hidden'}>
          <button type="button" class="ghost search-replace-all" id="search-replace-all">Replace All</button>
        </div>
        <div id="search-hits" class="search-hits"></div>
      </div>
    </div>`
    const box = $('search-q')
    const replaceBox = $('search-replace')
    const scheduleSearch = () => {
      clearTimeout(workspaceSearchTimer)
      workspaceSearchTimer = setTimeout(() => void runWorkspaceSearch(), 220)
    }
    box.oninput = scheduleSearch
    replaceBox?.addEventListener('input', () => {
      workspaceSearchUi.replace = replaceBox.value
    })
    $('search-replace-all')?.addEventListener('click', () => void runWorkspaceReplaceAll())
    box.onkeydown = (e) => {
      if (e.key === 'Enter') void runWorkspaceSearch()
    }
    box.focus()
    if (workspaceSearchUi.query) void runWorkspaceSearch()
    else $('search-hits').innerHTML = `<p class="msg">Type to search across project files.</p>`
    return
  }
  if (state.side === 'git') {
    root.innerHTML = `<div class="side-section git-scm-section">
      <div class="side-body git-scm-body" id="git-body"><p class="git-scm-muted">Loading…</p></div>
    </div>`
    void paintGitPanel()
    return
  }
  if (state.side === 'connectors') {
    void paintConnectorsPanel()
    return
  }
  if (state.side === 'extensions') {
    void paintExtensionsPanel()
    return
  }
  root.innerHTML = accountHtml()
  $('login-btn')?.addEventListener('click', login)
  $('logout-btn')?.addEventListener('click', logout)
  $('billing-btn')?.addEventListener('click', () => api.openBilling())
}

const PLUGIN_LOGO_SKIP_SIMPLE = new Set(['neon', 'canva', 'salesforce', 'context7', 'huggingface', 'higgsfield'])
const PLUGIN_LOGO_FILL = new Set(['canva', 'context7', 'neon', 'higgsfield', 'huggingface'])
const PLUGIN_LOGO_COLOR_BRAND = new Set([
  'figma',
  'notion',
  'slack',
  'stripe',
  'github',
  'linear',
  'sentry',
  'postman',
  'granola',
  'datadog',
  'gmail',
  'google-drive',
  'google-calendar',
])
const OFFICIAL_COMPANY_LOGOS = {
  higgsfield: 'https://higgsfield.ai/icon.png',
  canva: 'https://static.canva.com/static/images/android-192x192-2.png',
  huggingface: 'https://huggingface.co/front/assets/huggingface_logo-noborder.svg',
  context7: 'https://context7.com/brand/context7-icon-dark.svg',
  salesforce: 'https://a.sfdcstatic.com/shared/images/c360-nav/salesforce-no-type-logo.svg',
  neon: 'https://neon.com/brand/neon-logomark-dark-color.svg',
  hubspot: 'https://www.hubspot.com/hubfs/HubSpot_Logos/HubSpot-Inversed-Favicon.png',
}

/** Dark/black platform logos need a light tile or invert on the dark activity rail. */
function platformIconNeedsMono(url) {
  const u = String(url || '').toLowerCase()
  if (!u) return false
  if (/\/logos\/plugins\//.test(u) || /plugin-logos\//.test(u)) return false
  if (/simpleicons\.org|logo-dark|icon-dark|noborder\.svg|inversed|inverse|monochrome|\/dark[\./-]/.test(u)) {
    return true
  }
  if (/\.svg(\?|$)/.test(u) && !/color|brand|favicon|\.png|higgsfield|canva|hubspot|figma|notion|slack/.test(u)) {
    return true
  }
  return false
}

function pluginLogoCandidates(id) {
  const slug = String(id || 'custom')
  const host = String(state.appInfo?.api || 'https://soumtok.com').replace(/\/$/, '')
  const official = OFFICIAL_COMPANY_LOGOS[slug] || ''
  const simple = PLUGIN_LOGO_SKIP_SIMPLE.has(slug)
    ? ''
    : `https://cdn.simpleicons.org/${encodeURIComponent(slug)}`
  const meta = catalogPluginById(slug)
  const catalogLogo = meta?.logo && !/^https?:\/\//i.test(meta.logo) ? `${host}${meta.logo}` : meta?.logo || ''
  return [
    catalogLogo,
    official,
    `../../resources/plugin-logos/${encodeURIComponent(slug)}.svg`,
    `${host}/logos/plugins/${encodeURIComponent(slug)}.svg`,
    simple,
  ].filter(Boolean)
}

function pluginLogoUrl(id) {
  return pluginLogoCandidates(id)[0]
}

function connectorLogoHtml(id, name) {
  const slug = String(id || 'custom')
  const [first, ...rest] = pluginLogoCandidates(slug)
  const letter = String(name || slug).replace(/^[^a-zA-Z0-9]+/, '').slice(0, 1).toUpperCase() || '?'
  const fill = PLUGIN_LOGO_FILL.has(slug) || PLUGIN_LOGO_COLOR_BRAND.has(slug) ? ' conn-logo-fill' : ''
  const mono = platformIconNeedsMono(first) ? ' conn-logo-mono' : ''
  return `<span class="conn-logo${fill}${mono}" title="${escapeAttr(name || slug)}"><img src="${escapeAttr(first)}" alt="" data-fallbacks="${escapeAttr(JSON.stringify(rest))}" data-letter="${escapeAttr(letter)}" /></span>`
}

function soumtokSkillLogoCandidates() {
  const host = String(state.appInfo?.api || 'https://soumtok.com').replace(/\/$/, '')
  return [
    '../../resources/brand/soumtok-mark-dark.png',
    `${host}/images/soumtok-mark-dark.png`,
    '../../resources/brand/soumtok-mark.png',
    `${host}/images/soumtok-mark.png`,
  ]
}

function soumtokSkillLogoHtml() {
  const [first, ...rest] = soumtokSkillLogoCandidates()
  return `<span class="conn-logo conn-logo-soumtok" title="Soumtok"><img src="${escapeAttr(first)}" alt="" data-fallbacks="${escapeAttr(JSON.stringify(rest))}" data-letter="S" /></span>`
}

function marketLogoHtml(item) {
  const logo = String(item?.logo || '')
  const higgs = item?.pluginId === 'higgsfield' || item?.source === 'higgsfield' || item?.id === 'higgsfield'
  const slug = item?.pluginId || (item?.source === 'catalog' ? item.id : '') || ''
  const letter = String(item?.name || slug || '?').replace(/^[^a-zA-Z0-9]+/, '').slice(0, 1).toUpperCase() || '?'
  const chain = []
  if (/^https?:\/\//i.test(logo)) chain.push(logo)
  if (slug) {
    for (const url of pluginLogoCandidates(slug)) {
      if (!chain.includes(url)) chain.push(url)
    }
  }
  if (!chain.length) {
    return `<span class="conn-logo conn-logo-letter">${escapeHtml(letter)}</span>`
  }
  const [first, ...rest] = chain
  const fill = higgs || PLUGIN_LOGO_FILL.has(slug) ? ' conn-logo-fill' : ''
  const dark = higgs ? ' conn-logo-dark' : ''
  const mono = platformIconNeedsMono(first) ? ' conn-logo-mono' : ''
  return `<span class="conn-logo${dark}${fill}${mono}" title="${escapeAttr(item?.name || slug)}"><img src="${escapeAttr(first)}" alt="" data-fallbacks="${escapeAttr(JSON.stringify(rest))}" data-letter="${escapeAttr(letter)}" /></span>`
}

function bindLogoFallback(root) {
  root?.querySelectorAll('img[data-fallback], img[data-fallbacks]').forEach((img) => {
    img.onerror = () => {
      let queue = []
      try {
        queue = JSON.parse(img.getAttribute('data-fallbacks') || '[]')
      } catch {
        queue = []
      }
      const single = img.getAttribute('data-fallback')
      if (single) queue.push(single)
      const next = queue.find((url) => url && img.src !== url)
      if (next) {
        img.setAttribute('data-fallbacks', JSON.stringify(queue.filter((url) => url !== next)))
        img.removeAttribute('data-fallback')
        img.src = next
        return
      }
      const letter = img.getAttribute('data-letter')
      const parent = img.parentElement
      if (letter && parent) {
        parent.classList.add('conn-logo-letter')
        parent.textContent = letter
      }
    }
  })
}

function connectorTools(row) {
  return row?.last_check?.mcp?.tools || row?.tools || []
}

function findSavedConnector(connectors, item) {
  const list = Array.isArray(connectors) ? connectors : []
  const mcpUrl = String(item?.mcpUrl || item?.mcp_url || '').replace(/\/+$/, '')
  return (
    list.find((row) => String(row.mcp_url || row.mcpUrl || '').replace(/\/+$/, '') === mcpUrl) ||
    list.find((row) => item?.pluginId && (row.plugin_id === item.pluginId || row.plugin_id === item.id)) ||
    list.find((row) => row.id === item?.id) ||
    list.find((row) => row.name && item?.name && String(row.name).toLowerCase() === String(item.name).toLowerCase()) ||
    null
  )
}

function marketToolsHtml(tools) {
  const list = Array.isArray(tools) ? tools : []
  if (!list.length) return ''
  const extra = list.length > 48 ? `<span class="conn-kind">+${list.length - 48}</span>` : ''
  return `<div class="conn-tools">${list
    .slice(0, 48)
    .map((t) => `<code title="${escapeAttr(t.description || '')}">${escapeHtml(t.name || t)}</code>`)
    .join('')}${extra}</div>`
}

function marketCardHtml(item, saved) {
  const on = Boolean(saved?.connected)
  const tools = connectorTools(saved)
  const sub = on ? (tools.length ? `${tools.length} tools` : 'Connected') : item.mcpUrl || ''
  const higgs = item?.pluginId === 'higgsfield' || item?.source === 'higgsfield' || item?.id === 'higgsfield'
  const key = encodeURIComponent(
    JSON.stringify({
      id: higgs ? 'higgsfield' : item.id,
      name: higgs ? 'Higgsfield' : item.name,
      mcpUrl: item.mcpUrl,
      loginUrl: item.loginUrl,
      source: higgs ? 'catalog' : item.source,
      pluginId: higgs ? 'higgsfield' : item.pluginId || '',
    }),
  )
  return `<div class="conn-market-block">
    <div class="conn-market-card" data-item="${escapeAttr(key)}">
      ${marketLogoHtml(item)}
      <div class="conn-meta">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(sub)}</span>
      </div>
      <button type="button" class="conn-btn ${on ? 'on' : ''}" data-item="${escapeAttr(key)}">${on ? 'Reconnect' : 'Connect'}</button>
    </div>
    ${on ? marketToolsHtml(tools) : ''}
  </div>`
}

function marketSectionHtml(title, rows, saved) {
  if (!rows?.length) return ''
  return `<section class="conn-market-section">
    <h2 class="settings-section-title">${escapeHtml(title)}</h2>
    <div class="conn-market-grid">${rows.map((item) => marketCardHtml(item, findSavedConnector(saved, item))).join('')}</div>
  </section>`
}

function parseMarketItem(raw) {
  try {
    return JSON.parse(decodeURIComponent(String(raw || '')))
  } catch {
    return null
  }
}

function bindMarketConnectButtons(root, { setStatus, refresh }) {
  root?.querySelectorAll('.conn-btn[data-item]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation()
      const item = parseMarketItem(btn.dataset.item)
      if (item) void connectMarketplaceItem(item, { setStatus, refresh, btn })
    }
  })
  bindLogoFallback(root)
}

function settingsConnStatus(msg) {
  state.connectorsStatus = msg || ''
  const el = $('settings-conn-status') || $('conn-status')
  if (el) el.textContent = state.connectorsStatus
}

function higgsSectionHtml(data, saved) {
  const official = data.higgsfield
  if (!official) return ''
  const row = findSavedConnector(saved, official)
  return `<section class="conn-market-section conn-higgs-section">
    <h2 class="settings-section-title">Higgsfield</h2>
    <div class="conn-market-grid">${marketCardHtml(official, row)}</div>
  </section>`
}

async function paintConnectorsMarketplace() {
  const mine = $('settings-conn-mine')
  const marketEl = $('settings-conn-market')
  if (!marketEl) return
  const setStatus = settingsConnStatus
  if (!api.connectorsMarketplace && !api.connectorsList) {
    marketEl.innerHTML = '<p class="git-scm-muted">Restart Soumtok Desktop to load the connectors marketplace.</p>'
    return
  }
  try {
    const data = api.connectorsMarketplace
      ? await api.connectorsMarketplace(state.settingsConnectorSearch || '')
      : await api.connectorsList()
    if (data?.error && !data.catalog?.length && !data.higgsfield) {
      marketEl.innerHTML = `<p class="git-scm-muted">${escapeHtml(data.error)}</p>`
      return
    }
    state.connectorsMarket = data
    state.connectorsMine = data.connectors || []
    const saved = state.connectorsMine
    if (mine) {
      const live = saved.filter((row) => row.connected)
      mine.innerHTML = live.length
        ? settingsSection(
            'Active',
            `<div class="conn-market-grid">${live
              .map((row) =>
                marketCardHtml(
                  {
                    id: row.id,
                    name: row.name,
                    mcpUrl: row.mcp_url || row.mcpUrl,
                    loginUrl: '',
                    description: `${connectorTools(row).length || 0} tools`,
                    logo: row.plugin_id === 'higgsfield' ? 'https://higgsfield.ai/icon.png' : '',
                    source: 'saved',
                    pluginId: row.plugin_id || '',
                    badge: 'Active',
                  },
                  row,
                ),
              )
              .join('')}</div>`,
          )
        : ''
      bindMarketConnectButtons(mine, { setStatus, refresh: paintConnectorsMarketplace })
    }
    const catalog = (data.catalog || []).filter((row) => !(data.trending || []).some((t) => t.id === row.id))
    marketEl.innerHTML = [
      higgsSectionHtml(data, saved),
      marketSectionHtml('Trending', data.trending || [], saved),
      marketSectionHtml('Catalog', catalog, saved),
    ]
      .filter(Boolean)
      .join('') || '<p class="git-scm-muted">No connectors match that search.</p>'
    bindMarketConnectButtons(marketEl, { setStatus, refresh: paintConnectorsMarketplace })
    if (data.error) setStatus(data.error)
  } catch (err) {
    marketEl.innerHTML = `<p class="git-scm-muted">${escapeHtml(err?.message || 'Could not load marketplace')}</p>`
  }
}

async function paintConnectorsPanel() {
  const root = $('sidebar')
  if (!root) return
  root.innerHTML = `<div class="side-section connectors-section">
    <div class="side-section-head"><span class="side-section-title">Connectors</span></div>
    <div class="side-body connectors-body">
      <p class="git-scm-muted">Connect MCP in Settings. One server per card — tools load after you sign in.</p>
      <button type="button" class="settings-row-btn primary" id="conn-open-settings">Open marketplace</button>
      <div id="conn-status" class="conn-status">${escapeHtml(state.connectorsStatus || '')}</div>
      <div id="conn-list" class="conn-list"><p class="git-scm-muted">Loading…</p></div>
    </div>
  </div>`
  $('conn-open-settings')?.addEventListener('click', () => openSettingsConnectors())
  const listEl = $('conn-list')
  const setStatus = (msg) => {
    settingsConnStatus(msg)
    const statusEl = $('conn-status')
    if (statusEl) statusEl.textContent = msg || ''
  }
  async function refresh() {
    if (!api.connectorsList) {
      listEl.innerHTML = '<p class="git-scm-muted">Restart Soumtok Desktop to load connectors.</p>'
      return
    }
    const data = await api.connectorsList()
    if (data?.error && !data.connectors?.length && !data.catalog?.length) {
      listEl.innerHTML = `<p class="git-scm-muted">${escapeHtml(data.error)}</p>`
      return
    }
    state.connectorsMine = data.connectors || []
    const saved = state.connectorsMine
    const catalog = (data.catalog || []).slice(0, 12)
    if (!catalog.length && !saved.length) {
      listEl.innerHTML = '<p class="git-scm-muted">Open Settings → Connectors to browse MCP servers.</p>'
      return
    }
    const activeHtml = saved.filter((row) => row.connected).length
      ? `<p class="connectors-subhead">Active</p>${saved
          .filter((row) => row.connected)
          .map((row) =>
            marketCardHtml(
              {
                id: row.id,
                name: row.name,
                mcpUrl: row.mcp_url,
                loginUrl: '',
                description: connectorTools(row).length ? `${connectorTools(row).length} tools` : 'Connected',
                pluginId: row.plugin_id || '',
                source: 'saved',
              },
              row,
            ),
          )
          .join('')}`
      : ''
    const catalogHtml = catalog.length
      ? `<p class="connectors-subhead">Catalog</p>${catalog
          .map((item) =>
            marketCardHtml(
              {
                id: item.id,
                name: item.name,
                mcpUrl: item.mcpUrl,
                loginUrl: item.loginUrl,
                description: item.mcpUrl,
                pluginId: item.pluginId || item.id,
                source: 'catalog',
              },
              findSavedConnector(saved, { ...item, pluginId: item.pluginId || item.id, mcpUrl: item.mcpUrl }),
            ),
          )
          .join('')}`
      : ''
    listEl.innerHTML = `${activeHtml}${catalogHtml}`
    bindMarketConnectButtons(listEl, { setStatus, refresh })
  }
  await refresh()
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForConnectorSaved(id, setStatus, timeoutMs = 180000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const data = await api.connectorsList()
    const row = (data.connectors || []).find((c) => c.id === id)
    if (row?.connected || row?.hasToken) return row
    setStatus('Finish sign-in in your browser… saved automatically when OAuth completes.')
    await sleepMs(2500)
  }
  return null
}

async function connectCustomMcpUrl() {
  const name = String($('settings-conn-name')?.value || '').trim()
  const mcpUrl = String($('settings-conn-url')?.value || '').trim()
  if (!name || !mcpUrl) {
    settingsConnStatus('Name and HTTPS MCP URL required')
    return
  }
  await connectMarketplaceItem(
    { id: '', name, mcpUrl, loginUrl: '', source: 'custom', pluginId: '' },
    { setStatus: settingsConnStatus, refresh: paintConnectorsMarketplace },
  )
}

async function connectCatalogConnector(catalogId, opts) {
  return connectMarketplaceItem(
    { id: catalogId, name: catalogId, mcpUrl: '', loginUrl: '', source: 'catalog', pluginId: catalogId },
    opts,
  )
}

async function connectMarketplaceItem(item, { setStatus = settingsConnStatus, refresh, btn } = {}) {
  if (!item) return
  const label = btn?.textContent
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Connecting…'
  }
  setStatus('Saving connector…')
  try {
    if (!state.agentPrefs) loadAgentPrefs()
    if (state.agentPrefs && !state.agentPrefs.mcpConnectors) setAgentPref('mcpConnectors', true)
    const catalogId = item.source === 'catalog' && item.pluginId && !String(item.id || '').includes(':') ? item.pluginId || item.id : ''
    const added = catalogId && !item.mcpUrl
      ? await api.connectorsAdd(catalogId)
      : await api.connectorsAdd({
          catalogId: catalogId || undefined,
          name: item.name,
          mcpUrl: item.mcpUrl,
        })
    if (added?.error) throw new Error(added.error)
    const row = added.connector
    if (!row?.id) throw new Error('Could not save connector')
    setStatus('Opening your browser to connect…')
    const oauth = await api.connectorsOauth({ id: row.id, loginUrl: item.loginUrl || added.loginUrl || '' })
    if (oauth?.noAuth) {
      setStatus('No sign-in needed. Activating tools…')
    } else if (oauth?.openedOauth || oauth?.needsPoll) {
      setStatus('Approve access in your browser. We will save and activate this connector when you finish.')
      const ready = await waitForConnectorSaved(row.id, setStatus)
      if (!ready) setStatus('Still waiting — finish sign-in in the browser, then tap Reconnect.')
    } else if (oauth?.error && !/already connected|token/i.test(oauth.error)) {
      setStatus(oauth.error)
    }
    setStatus('Activating tools on the saved MCP URL…')
    const done = await api.connectorsConnect(row.id)
    if (done?.error) throw new Error(done.error)
    const n = done.mcp?.tools?.length
    const active = done.connected || n
    setStatus(
      active
        ? `Connected and active${n ? ` · ${n} tools` : ''}. Agent can call mcp() on ${item.name}. Results save in mcp-exports/.`
        : done.needsLogin
          ? 'Saved. Finish sign-in in the browser, then tap Reconnect to activate tools.'
          : 'Saved. Reconnect if tools are still empty.',
    )
    await refreshConnectorsMine()
    if (state.side === 'connectors') await paintConnectorsPanel()
    if (active && catalogId && !installedPluginIdsSet().has(catalogId)) {
      const meta = catalogPluginById(catalogId)
      if (meta?.skills?.length) {
        setStatus(`Installing ${meta.name} skill pack…`)
        await api.pluginsInstall?.({ pluginId: catalogId })
        await loadPlugins()
        setStatus(
          `${meta.name} connected${n ? ` · ${n} tools` : ''} and skill pack installed. Attach skills in chat ◆ — agent can mcp({ server: "${catalogId}" }).`,
        )
      }
    }
    if (typeof refresh === 'function') await refresh()
    if (state.settingsOpen && state.settingsTab === 'connectors' && refresh !== paintConnectorsMarketplace) {
      void paintConnectorsMarketplace()
    }
  } catch (err) {
    setStatus(err?.message || 'Connect failed')
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = label || 'Connect'
    }
  }
}

const EXT_MAIN_RESTART_HINT =
  'Close every Soumtok window, then start again from desktop folder: npm start'

function extensionTabPath(publisher, name) {
  return `extension:${publisher}/${name}`
}

function parseExtensionTabPath(tabPath) {
  const s = String(tabPath || '')
  if (!s.startsWith('extension:')) return null
  const rest = s.slice('extension:'.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return null
  return { publisher: decodeURIComponent(rest.slice(0, slash)), name: decodeURIComponent(rest.slice(slash + 1)) }
}

function isExtensionTab(tab) {
  return tab?.kind === 'extension' || String(tab?.path || '').startsWith('extension:')
}

function isBrowserTab(tab) {
  return tab?.kind === 'browser' || String(tab?.path || '').startsWith('browser:')
}

function isImageFileName(name) {
  return /\.(png|jpe?g|gif|webp|bmp|ico|avif|svg)$/i.test(String(name || ''))
}

function isImageTab(tab) {
  return tab?.kind === 'image' || isImageFileName(tab?.name || tab?.path)
}

function normalizeBrowserUrl(raw) {
  let s = String(raw || '').trim()
  if (!s) return ''
  try {
    s = decodeURIComponent(s)
  } catch {
    /* keep raw */
  }
  s = s.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
  s = s.split(/[<>]/)[0]
  s = s.replace(/\/\*+.*/, '/')
  s = s.replace(/\*+$/g, '')
  s = s.replace(/[)\].,;:!?]+$/g, '')
  if (/^(localhost|127\.0\.0\.1):\d+/i.test(s)) s = `http://${s}`
  if (!/^https?:\/\//i.test(s)) return ''
  try {
    const u = new URL(s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
    if (/strong|em>|br>|div|span|script|markdown/i.test(`${u.pathname}${u.search}${u.hash}`)) {
      u.pathname = '/'
      u.search = ''
      u.hash = ''
    }
    if (u.pathname.includes('*')) u.pathname = u.pathname.replace(/\*+/g, '') || '/'
    return u.href
  } catch {
    return ''
  }
}

function browserTabLabel(url) {
  try {
    const u = new URL(url)
    const path = u.pathname === '/' ? '' : u.pathname
    return `${u.host}${path}`.slice(0, 48) || 'Browser'
  } catch {
    return 'Browser'
  }
}

function disposeMonacoIfAny() {
  if (state.editor) {
    state.editor.dispose()
    state.editor = null
  }
  if (state.editorModel) {
    state.editorModel.dispose()
    state.editorModel = null
  }
}

function openSimpleBrowser(url) {
  const href = normalizeBrowserUrl(url)
  if (!href) return false
  const path = `browser:${href}`
  let tab = state.tabs.find((t) => isBrowserTab(t) && (normalizeBrowserUrl(t.url) === href || t.path === path))
  if (!tab) {
    try {
      const origin = new URL(href).origin
      tab = state.tabs.find((t) => {
        if (!isBrowserTab(t) || !t.url) return false
        try {
          return new URL(normalizeBrowserUrl(t.url) || t.url).origin === origin
        } catch {
          return false
        }
      })
    } catch {
      /* ignore */
    }
  }
  if (!tab) {
    tab = { kind: 'browser', path, name: browserTabLabel(href), url: href, text: '', history: [href], historyAt: 0 }
    state.tabs.push(tab)
  } else {
    tab.url = href
    tab.path = path
    tab.name = browserTabLabel(href)
    if (tab.history?.[tab.historyAt] !== href) {
      tab.history = (tab.history || [href]).slice(0, (tab.historyAt || 0) + 1)
      tab.history.push(href)
      tab.historyAt = tab.history.length - 1
    }
  }
  state.active = tab.path
  renderTabs()
  renderEditor()
  updateStatus()
  return true
}

function bindSimpleBrowser(host, tab) {
  const input = host.querySelector('.simple-browser-url')
  const frame = host.querySelector('.simple-browser-frame')
  const go = (next) => {
    const href = normalizeBrowserUrl(next)
    if (!href) return
    tab.url = href
    tab.name = browserTabLabel(href)
    if (!tab.history) tab.history = [href]
    if (tab.history[tab.historyAt] !== href) {
      tab.history = tab.history.slice(0, tab.historyAt + 1)
      tab.history.push(href)
      tab.historyAt = tab.history.length - 1
    }
    if (input) input.value = href
    if (frame) {
      frame.dataset.src = href
      frame.src = href
    }
    renderTabs()
  }
  host.querySelector('[data-sb="back"]')?.addEventListener('click', () => {
    if (!tab.history?.length || tab.historyAt <= 0) return
    tab.historyAt -= 1
    go(tab.history[tab.historyAt])
  })
  host.querySelector('[data-sb="forward"]')?.addEventListener('click', () => {
    if (!tab.history?.length || tab.historyAt >= tab.history.length - 1) return
    tab.historyAt += 1
    go(tab.history[tab.historyAt])
  })
  host.querySelector('[data-sb="reload"]')?.addEventListener('click', () => {
    if (frame?.src) frame.src = frame.src
  })
  host.querySelector('[data-sb="external"]')?.addEventListener('click', () => {
    void api.openUrl?.(tab.url)
  })
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      go(input.value)
    }
  })
}

function simpleBrowserIcon(name) {
  if (name === 'back') {
    return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10.2 3.2L5.4 8l4.8 4.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  }
  if (name === 'forward') {
    return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5.8 3.2L10.6 8l-4.8 4.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  }
  if (name === 'reload') {
    return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.3-3.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M13 2.8V6h-3.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  }
  return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M9.2 3.2H13v3.8M13 3.2L8.2 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 9.2v2.3A1.5 1.5 0 0 1 10.5 13h-5A1.5 1.5 0 0 1 4 11.5v-5A1.5 1.5 0 0 1 5.5 5H8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
}

function renderSimpleBrowser(tab) {
  const host = $('editor')
  if (!host) return
  tab.url = normalizeBrowserUrl(tab.url || tab.path.replace(/^browser:/, '')) || tab.url
  disposeMonacoIfAny()
  host.classList.remove('editor-monaco-host', 'ext-editor-host', 'soumtok-code-host')
  host.classList.add('simple-browser-host')
  const existing = host.querySelector('.simple-browser')
  let origin = ''
  try {
    origin = new URL(tab.url).origin
  } catch {
    origin = ''
  }
  if (existing && (existing.dataset.path === tab.path || (origin && existing.dataset.origin === origin))) {
    existing.dataset.path = tab.path
    existing.dataset.origin = origin
    const input = existing.querySelector('.simple-browser-url')
    const frame = existing.querySelector('.simple-browser-frame')
    if (input && document.activeElement !== input) input.value = tab.url
    if (frame && frame.dataset.src !== tab.url) {
      frame.dataset.src = tab.url
      frame.src = tab.url
    }
    return
  }
  const href = escapeAttr(tab.url || '')
  host.innerHTML = `<div class="simple-browser" data-path="${escapeAttr(tab.path)}" data-origin="${escapeAttr(origin)}">
    <div class="simple-browser-bar">
      <button type="button" class="simple-browser-btn" data-sb="back" title="Back" aria-label="Back">${simpleBrowserIcon('back')}</button>
      <button type="button" class="simple-browser-btn" data-sb="forward" title="Forward" aria-label="Forward">${simpleBrowserIcon('forward')}</button>
      <button type="button" class="simple-browser-btn" data-sb="reload" title="Reload" aria-label="Reload">${simpleBrowserIcon('reload')}</button>
      <input class="simple-browser-url" type="text" spellcheck="false" value="${href}" aria-label="Address" />
      <button type="button" class="simple-browser-btn simple-browser-external" data-sb="external" title="Open in system browser" aria-label="Open in system browser">${simpleBrowserIcon('external')}</button>
    </div>
    <iframe class="simple-browser-frame" data-src="${href}" src="${href}" title="${escapeAttr(tab.name || 'Browser')}" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads allow-pointer-lock"></iframe>
  </div>`
  bindSimpleBrowser(host, tab)
}

function openAgentHref(href, { external = false } = {}) {
  const raw = String(href || '').trim()
  if (!raw) return
  if (external) {
    const url = normalizeBrowserUrl(raw)
    if (url) void api.openUrl?.(url)
    return
  }
  if (state.folder && agentMarkdownLooksLikePath(raw)) {
    const abs = joinWorkspacePath(raw)
    void openFile({ path: abs, name: fileNameFromPath(abs), type: 'file' })
    return
  }
  if (openSimpleBrowser(raw)) return
  if (state.folder && !/\s/.test(raw) && /[/\\.]/.test(raw)) {
    const abs = joinWorkspacePath(raw)
    void openFile({ path: abs, name: fileNameFromPath(abs), type: 'file' })
  }
}

function ensureExtensionTabIdentity(tab) {
  if (!isExtensionTab(tab)) return tab
  tab.kind = 'extension'
  const parsed = parseExtensionTabPath(tab.path)
  if (!tab.extPublisher && parsed?.publisher) tab.extPublisher = parsed.publisher
  if (!tab.extName && parsed?.name) tab.extName = parsed.name
  if (parsed?.publisher && parsed?.name && !tab.path.includes('/')) {
    tab.path = extensionTabPath(parsed.publisher, parsed.name)
  }
  return tab
}

function serializeTabForSession(tab) {
  const base = { path: tab.path, name: tab.name }
  if (isBrowserTab(tab)) {
    return { ...base, kind: 'browser', url: tab.url || String(tab.path || '').replace(/^browser:/, '') }
  }
  if (isExtensionTab(tab)) {
    ensureExtensionTabIdentity(tab)
    return {
      ...base,
      kind: 'extension',
      extPublisher: tab.extPublisher,
      extName: tab.extName,
      extPaneTab: tab.extPaneTab || 'details',
      extFeatureSection: tab.extFeatureSection || undefined,
    }
  }
  if (isImageTab(tab)) {
    return { ...base, kind: 'image' }
  }
  if (isDotEnvTab(tab)) {
    return { ...base, envEditorMode: tab.envEditorMode || 'form' }
  }
  return base
}

function normalizeRestoredTab(raw) {
  const tab = { ...raw, text: raw?.text ?? '' }
  if (tab.kind === 'browser' || String(tab.path || '').startsWith('browser:')) {
    tab.kind = 'browser'
    tab.url = tab.url || String(tab.path || '').replace(/^browser:/, '')
    tab.name = tab.name || browserTabLabel(tab.url)
    tab.history = tab.url ? [tab.url] : []
    tab.historyAt = 0
    return tab
  }
  if (tab.kind === 'extension' || String(tab.path || '').startsWith('extension:')) {
    ensureExtensionTabIdentity(tab)
    tab.detail = null
    tab.detailLoading = false
    delete tab.envPairs
  }
  return tab
}

async function hydrateRestoredTab(tab) {
  if (isBrowserTab(tab)) {
    tab.kind = 'browser'
    tab.url = tab.url || String(tab.path || '').replace(/^browser:/, '')
    tab.name = tab.name || browserTabLabel(tab.url)
    return
  }
  if (isExtensionTab(tab)) {
    ensureExtensionTabIdentity(tab)
    await loadExtensionDetailForTab(tab)
    return
  }
  if (isImageFileName(tab.name || tab.path) || tab.kind === 'image') {
    await loadImageTab(tab)
    return
  }
  try {
    tab.text = await api.readFile(tab.path)
  } catch {
    tab.text = ''
  }
  if (isDotEnvTab(tab) && tab.envEditorMode !== 'text') {
    window.SoumtokEnvEditor?.hydrateEnvTab?.(tab)
  }
}

function formatExtCount(n) {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (v >= 1000) return `${Math.round(v / 1000)}K`
  return String(v)
}

function extIconLetter(displayName) {
  return (String(displayName || 'E')[0] || 'E').toUpperCase()
}

function extIconUrl(ext) {
  if (ext?.iconUrl) return ext.iconUrl
  const pub = ext?.publisher
  const name = ext?.name
  const ver = ext?.version
  if (!pub || !name || !ver) return ''
  return `https://open-vsx.org/api/${encodeURIComponent(pub)}/${encodeURIComponent(name)}/${encodeURIComponent(ver)}/file/icon.png`
}

function extIconHtml(ext) {
  const url = extIconUrl(ext)
  const fall = extIconLetter(ext.displayName || ext.name)
  if (url) {
    return `<img class="ext-market-icon-img" src="${escapeAttr(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ext-market-icon-fallback',textContent:${JSON.stringify(fall)}}))" />`
  }
  return `<span class="ext-market-icon-fallback">${escapeHtml(fall)}</span>`
}

const EXT_VERIFIED_BADGE_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="m11.335 2.065l.076.153l.577 1.533c.045.12.14.216.261.261l1.48.555c.65.244.999.938.826 1.595l-.042.13l-.688 1.523a.45.45 0 0 0 0 .37l.653 1.439a1.34 1.34 0 0 1-.543 1.711l-.153.076l-1.533.577a.45.45 0 0 0-.261.261l-.555 1.48a1.34 1.34 0 0 1-1.595.826l-.13-.042l-1.523-.688a.45.45 0 0 0-.37 0l-1.439.654a1.34 1.34 0 0 1-1.711-.544l-.076-.153l-.577-1.533a.45.45 0 0 0-.261-.261l-1.48-.555a1.34 1.34 0 0 1-.826-1.595l.042-.13l.689-1.523a.45.45 0 0 0 0-.37l-.654-1.439a1.34 1.34 0 0 1 .543-1.711l.153-.076l1.533-.577a.45.45 0 0 0 .261-.261l.555-1.48a1.34 1.34 0 0 1 1.595-.826l.13.042l1.523.689a.45.45 0 0 0 .37 0l1.439-.654a1.34 1.34 0 0 1 1.711.543m-1.171 3.64L6.978 9.348L5.816 8.184a.447.447 0 1 0-.632.632l1.5 1.5a.447.447 0 0 0 .652-.022l3.5-4a.447.447 0 0 0-.672-.588"/></svg>'

function extensionIsVerified(ext) {
  if (!ext) return false
  if (ext.verified === true) return true
  if (typeof publisherVerifiedFromGallery === 'function') {
    return publisherVerifiedFromGallery({
      isDomainVerified: ext.isDomainVerified,
      flags: ext.publisherFlags || ext.publisher?.flags,
    })
  }
  return false
}

function normalizeMarketExtension(ext) {
  if (!ext) return ext
  const verified = extensionIsVerified(ext)
  return verified === ext.verified ? ext : { ...ext, verified }
}

function extVerifiedBadgeHtml(title = 'Verified publisher') {
  return `<span class="ext-verified-badge" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}">${EXT_VERIFIED_BADGE_SVG}</span>`
}

function extPublisherLineHtml(ext) {
  const name = escapeHtml(ext.publisherDisplayName || ext.publisher || '')
  const badge = extensionIsVerified(ext) ? extVerifiedBadgeHtml() : ''
  return `<span class="ext-market-publisher-line">${badge}<span class="ext-market-publisher-name">${name}</span></span>`
}

const EXT_DISABLED_KEY = 'soumtok-ext-disabled'
const EXT_TRUSTED_PUBLISHERS_KEY = 'soumtok-trusted-publishers'

function readTrustedPublishers() {
  try {
    const raw = localStorage.getItem(EXT_TRUSTED_PUBLISHERS_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.map(String) : []
  } catch {
    return []
  }
}

function isPublisherTrusted(publisherId) {
  const id = String(publisherId || '').trim().toLowerCase()
  if (!id) return false
  return readTrustedPublishers().some((p) => String(p).toLowerCase() === id)
}

function trustPublisher(publisherId) {
  const id = String(publisherId || '').trim().toLowerCase()
  if (!id) return
  const set = new Set(readTrustedPublishers().map((p) => String(p).toLowerCase()))
  set.add(id)
  localStorage.setItem(EXT_TRUSTED_PUBLISHERS_KEY, JSON.stringify([...set]))
}

let trustPublisherResolver = null
let trustPublisherMeta = null

function closeTrustPublisher(confirmed) {
  $('trust-publisher').hidden = true
  const meta = trustPublisherMeta
  const done = trustPublisherResolver
  trustPublisherResolver = null
  trustPublisherMeta = null
  if (confirmed && meta?.publisher) trustPublisher(meta.publisher)
  done?.(Boolean(confirmed))
}

function bugReportContext() {
  return {
    version: String(state.appInfo?.version || ''),
    platform: String(state.appInfo?.platform || ''),
    api: String(state.appInfo?.api || ''),
    folder: String(state.folder || ''),
    product: appProductLabel(),
  }
}

function openBugReport() {
  const modal = $('bug-report')
  if (!modal) return
  $('bug-report-form').hidden = false
  $('bug-report-sent').hidden = true
  $('bug-report-error').hidden = true
  $('bug-report-error').textContent = ''
  $('bug-report-message').value = ''
  $('bug-report-category').value = 'Bug'
  const emailRow = $('bug-report-email-row')
  const signedIn = Boolean(state.user?.email)
  if (emailRow) emailRow.hidden = signedIn
  if ($('bug-report-email')) $('bug-report-email').value = state.user?.email || ''
  modal.hidden = false
  $('bug-report-message')?.focus()
}

function closeBugReport() {
  const modal = $('bug-report')
  if (modal) modal.hidden = true
}

async function submitBugReport() {
  const msg = String($('bug-report-message')?.value || '').trim()
  const errEl = $('bug-report-error')
  if (msg.length < 8) {
    errEl.textContent = 'Describe what happened (at least a few words).'
    errEl.hidden = false
    return
  }
  const email = state.user?.email || String($('bug-report-email')?.value || '').trim()
  if (!email) {
    errEl.textContent = 'Enter your email or sign in to Soumtok.'
    errEl.hidden = false
    return
  }
  const btn = $('bug-report-send')
  if (btn) btn.disabled = true
  errEl.hidden = true
  try {
    const res = await api.sendBugReport({
      email,
      category: String($('bug-report-category')?.value || 'Bug'),
      message: msg,
      surface: 'Desktop',
      context: bugReportContext(),
    })
    if (res?.error) throw new Error(res.error)
    $('bug-report-form').hidden = true
    $('bug-report-sent').hidden = false
  } catch (err) {
    errEl.textContent = err instanceof Error ? err.message : 'Could not send. Try again.'
    errEl.hidden = false
  } finally {
    if (btn) btn.disabled = false
  }
}

function askTrustPublisher(meta) {
  const publisher = String(meta?.publisher || '').trim()
  if (!publisher || isPublisherTrusted(publisher)) return Promise.resolve(true)
  const pubLabel = meta.publisherDisplayName || publisher
  const extLabel = meta.displayName || meta.name || 'this extension'
  $('trust-publisher-title').textContent = `Do you trust the publisher “${pubLabel}”?`
  $('trust-publisher-body').innerHTML = `The extension <strong>${escapeHtml(extLabel)}</strong> is published by <strong>${escapeHtml(pubLabel)}</strong>. This is the first extension you’re installing from this publisher.`
  const verifiedEl = $('trust-publisher-verified')
  const domain = String(meta.publisherDomain || '').trim()
  const verified = Boolean(meta.verified)
  if (verified && domain) {
    verifiedEl.hidden = false
    verifiedEl.innerHTML = `${extVerifiedBadgeHtml('Verified publisher')}<span>${escapeHtml(pubLabel)} has verified ownership of <a href="#" class="trust-publisher-domain-link">${escapeHtml(domain)}</a>.</span>`
    verifiedEl.querySelector('.trust-publisher-domain-link')?.addEventListener('click', (e) => {
      e.preventDefault()
      void api.openUrl?.(`https://${domain.replace(/^https?:\/\//, '')}`)
    })
  } else if (verified) {
    verifiedEl.hidden = false
    verifiedEl.innerHTML = `${extVerifiedBadgeHtml('Verified publisher')}<span>This publisher is verified on the Visual Studio Marketplace.</span>`
  } else {
    verifiedEl.hidden = true
    verifiedEl.textContent = ''
  }
  $('trust-publisher').hidden = false
  trustPublisherMeta = { ...meta, publisher }
  return new Promise((resolve) => {
    trustPublisherResolver = resolve
  })
}

async function extensionTrustMeta(publisher, name) {
  const key = extensionId(publisher, name)
  const cached = extMarketCache.get(key)
  if (cached) {
    return {
      publisher,
      name,
      displayName: cached.displayName || name,
      publisherDisplayName: cached.publisherDisplayName || publisher,
      verified: extensionIsVerified(cached),
      publisherDomain: cached.publisherDomain || '',
    }
  }
  try {
    if (typeof api.extensionsDetail === 'function') {
      const res = await api.extensionsDetail({ publisher, name })
      const d = res?.detail || res?.extension
      if (d) {
        return {
          publisher,
          name,
          displayName: d.displayName || name,
          publisherDisplayName: d.publishedBy || d.publisherDisplayName || publisher,
          verified: extensionIsVerified(d),
          publisherDomain: d.publisherDomain || '',
        }
      }
    }
  } catch {
    /* ignore */
  }
  return {
    publisher,
    name,
    displayName: name,
    publisherDisplayName: publisher,
    verified: false,
    publisherDomain: '',
  }
}

function readDisabledExtensionIds() {
  try {
    const raw = localStorage.getItem(EXT_DISABLED_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function writeDisabledExtensionIds(set) {
  try {
    localStorage.setItem(EXT_DISABLED_KEY, JSON.stringify([...set]))
  } catch {
    /* ignore */
  }
}

function extensionId(pub, name) {
  return `${String(pub || '').trim()}.${String(name || '').trim()}`.toLowerCase()
}

function compareSemver(a, b) {
  const parts = (v) =>
    String(v || '0')
      .split(/[.+_-]/)
      .map((x) => {
        const n = parseInt(x, 10)
        return Number.isFinite(n) ? n : 0
      })
  const pa = parts(a)
  const pb = parts(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

function extensionUpdateAvailable(ext) {
  const cur = ext?.installedVersion || ext?.version
  const latest = ext?.marketVersion || ext?.detailVersion
  if (!cur || !latest) return false
  return compareSemver(cur, latest) < 0
}

const EXT_AUTO_UPDATE_KEY = 'soumtok-ext-auto-update'

function readExtAutoUpdate(id) {
  try {
    const raw = JSON.parse(localStorage.getItem(EXT_AUTO_UPDATE_KEY) || '{}')
    if (raw[id] === false) return false
  } catch {
    /* ignore */
  }
  return true
}

function writeExtAutoUpdate(id, on) {
  try {
    const raw = JSON.parse(localStorage.getItem(EXT_AUTO_UPDATE_KEY) || '{}')
    if (on) delete raw[id]
    else raw[id] = false
    localStorage.setItem(EXT_AUTO_UPDATE_KEY, JSON.stringify(raw))
  } catch {
    /* ignore */
  }
}

function notifyExtensionInstallUnavailable() {
  window.alert(EXT_INSTALL_UNAVAILABLE_MSG)
  appendPanelOutput(`[extensions] ${EXT_INSTALL_UNAVAILABLE_MSG}\n`)
}

async function refreshInstalledExtensionCache() {
  let list = []
  try {
    if (typeof api.extensionsInstalledMarket === 'function') {
      const res = await api.extensionsInstalledMarket()
      if (res?.ok) list = res.extensions || []
    }
    if (!list.length) {
      const res = await api.extensionsInstalled()
      if (res?.ok) {
        list = (res.extensions || []).map((row) => ({
          ...row,
          installPath: row.path,
          installedVersion: row.version,
          marketVersion: row.version,
        }))
      }
    }
  } catch {
    return
  }
  state.installedExtById = new Map(
    list.map((e) => [extensionId(e.publisher, e.name), normalizeMarketExtension(e)]),
  )
  state.installedExtCacheAt = Date.now()
}

function getInstalledExtensionRecord(publisher, name) {
  return state.installedExtById.get(extensionId(publisher, name)) || null
}

function extManageGearSvg() {
  return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" aria-hidden="true"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>'
}

function extMarketplaceUrl(ext) {
  if (ext?.marketplaceUrl) return ext.marketplaceUrl
  const pub = ext?.publisher || ''
  const name = ext?.name || ''
  return `https://marketplace.visualstudio.com/items?itemName=${encodeURIComponent(pub)}.${encodeURIComponent(name)}`
}

function copyTextToClipboard(text) {
  const s = String(text || '')
  if (!s) return Promise.resolve(false)
  if (api.clipboardWriteText) return api.clipboardWriteText(s).then(() => true).catch(() => copyTextFallback(s))
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(s).then(() => true).catch(() => copyTextFallback(s))
  return Promise.resolve(copyTextFallback(s))
}

function copyTextFallback(text) {
  try {
    const ta = document.createElement('textarea')
    ta.value = String(text || '')
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

let extHoverTimer = null
let extHoverRow = null
const extMarketCache = new Map()

function ensureExtHoverCard() {
  let card = document.getElementById('ext-hover-card')
  if (!card) {
    card = document.createElement('div')
    card.id = 'ext-hover-card'
    card.hidden = true
    card.setAttribute('role', 'tooltip')
    document.body.appendChild(card)
  }
  return card
}

function hideExtMarketHover() {
  if (extHoverTimer) {
    clearTimeout(extHoverTimer)
    extHoverTimer = null
  }
  extHoverRow = null
  const card = document.getElementById('ext-hover-card')
  if (card) card.hidden = true
}

function showExtMarketHover(row, ext) {
  const card = ensureExtHoverCard()
  const id = extensionId(ext.publisher, ext.name)
  const disabled = readDisabledExtensionIds().has(id)
  const dl = ext.downloadCount ? formatExtCount(ext.downloadCount) : ''
  const rating = ext.averageRating ? Number(ext.averageRating).toFixed(1) : ''
  const ver = ext.version ? `v${escapeHtml(ext.version)}` : ''
  card.innerHTML = `<div class="ext-hover-head"><strong>${escapeHtml(ext.displayName || ext.name)}</strong>${ver ? `<span class="ext-hover-ver">${ver}</span>` : ''}</div>
    <p class="ext-hover-desc">${escapeHtml(ext.description || 'No description.')}</p>
    <div class="ext-hover-meta">${extPublisherLineHtml(ext)}</div>
    <div class="ext-hover-stats">${[dl && `${dl} installs`, rating && `★ ${rating}`, disabled && 'Disabled locally'].filter(Boolean).join(' · ') || 'Visual Studio Marketplace'}</div>`
  card.hidden = false
  const rect = row.getBoundingClientRect()
  const cardW = Math.min(340, Math.max(260, window.innerWidth * 0.28))
  let left = rect.right + 12
  if (left + cardW > window.innerWidth - 8) left = Math.max(8, rect.left - cardW - 12)
  let top = rect.top
  card.style.width = `${cardW}px`
  card.style.left = `${left}px`
  card.style.top = `${Math.max(8, Math.min(top, window.innerHeight - 120))}px`
}

function scheduleExtMarketHover(row, ext) {
  hideExtMarketHover()
  extHoverRow = row
  extHoverTimer = setTimeout(() => {
    if (extHoverRow === row) showExtMarketHover(row, ext)
  }, 480)
}

function closeExtManageMenus() {
  document.querySelectorAll('.ext-manage-menu').forEach((m) => {
    m.hidden = true
  })
  document.querySelectorAll('.ext-manage-btn[aria-expanded="true"]').forEach((b) => {
    b.setAttribute('aria-expanded', 'false')
  })
}

function extManageMenuHtml(ext, { installPath = '', updateAvailable = false, latestVersion = '' } = {}) {
  const id = extensionId(ext.publisher, ext.name)
  const disabled = readDisabledExtensionIds().has(id)
  const updateLine = updateAvailable
    ? `<button type="button" class="ext-manage-item ext-manage-update" data-action="update" role="menuitem">Update to v${escapeHtml(latestVersion || ext.marketVersion || '')}</button><hr class="ext-filter-sep" />`
    : ''
  return `<div class="ext-manage-menu" hidden role="menu">
    ${updateLine}
    ${ext.hasAppUi || ext.kind === 'app' ? `<button type="button" class="ext-manage-item" data-action="open-panel" role="menuitem">Open panel</button>` : ''}
    <button type="button" class="ext-manage-item" data-action="enable" role="menuitem"${disabled ? '' : ' disabled'}>Enable</button>
    <button type="button" class="ext-manage-item" data-action="disable" role="menuitem"${disabled ? ' disabled' : ''}>Disable</button>
    <hr class="ext-filter-sep" />
    <button type="button" class="ext-manage-item" data-action="uninstall" role="menuitem">Uninstall</button>
    <button type="button" class="ext-manage-item" data-action="copy-id" role="menuitem">Copy Extension ID</button>
    <button type="button" class="ext-manage-item" data-action="copy-link" role="menuitem">Copy Link</button>
    <button type="button" class="ext-manage-item" data-action="marketplace" role="menuitem">Open in Marketplace</button>
    <hr class="ext-filter-sep" />
    <button type="button" class="ext-manage-item" data-action="settings" role="menuitem">Extension Settings</button>
  </div>`
}

async function runExtManageAction(action, ext, installPath) {
  const id = extensionId(ext.publisher, ext.name)
  const url = extMarketplaceUrl(ext)
  if (action === 'copy-id') {
    copyTextToClipboard(id)
    return
  }
  if (action === 'copy-link') {
    copyTextToClipboard(url)
    return
  }
  if (action === 'marketplace') {
    void api.openUrl(url)
    return
  }
  if (action === 'open-panel') {
    await openInstalledExtensionInHost(ext.publisher, ext.name)
    return
  }
  if (action === 'settings') {
    void openExtensionDetail({
      publisher: ext.publisher,
      name: ext.name,
      displayName: ext.displayName || ext.name,
    })
    return
  }
  if (action === 'update') {
    await updateExtensionFromDetail(ext.publisher, ext.name, null, ext.marketVersion || ext.version)
    return
  }
  if (action === 'enable' || action === 'disable') {
    const set = readDisabledExtensionIds()
    if (action === 'enable') set.delete(id)
    else set.add(id)
    writeDisabledExtensionIds(set)
    appendPanelOutput(`[extensions] ${id} ${action === 'enable' ? 'enabled' : 'disabled'} locally (extension host picks up on next launch).\n`)
    return
  }
  if (action === 'uninstall' && installPath) {
    const out = await api.extensionsUninstall(installPath)
    if (!out?.ok) appendPanelOutput(`[extensions] ${out?.error || 'Uninstall failed'}\n`)
    else {
      if (typeof window.__soumtokExtInstalledRefresh === 'function') await window.__soumtokExtInstalledRefresh()
      await refreshExtensionActivityBar()
      const tab = activeEditorTab()
      if (tab && isExtensionTab(tab) && extensionId(tab.extPublisher, tab.extName) === id) {
        await refreshInstalledExtensionCache()
        renderExtensionDetailPane(tab)
      }
      if (extensionIdFromSide(state.side)) showSide('extensions')
    }
  }
}

function bindExtManageMenus(container) {
  container.querySelectorAll('.ext-manage-wrap').forEach((wrap) => {
    const btn = wrap.querySelector('.ext-manage-btn')
    const menu = wrap.querySelector('.ext-manage-menu')
    if (!btn || !menu) return
    btn.onclick = (e) => {
      e.stopPropagation()
      const open = menu.hidden
      closeExtManageMenus()
      hideExtMarketHover()
      menu.hidden = !open
      btn.setAttribute('aria-expanded', open ? 'true' : 'false')
    }
    menu.querySelectorAll('.ext-manage-item').forEach((item) => {
      item.onclick = (e) => {
        e.stopPropagation()
        const ext = {
          publisher: wrap.dataset.publisher,
          name: wrap.dataset.name,
          displayName: wrap.dataset.display,
          version: wrap.dataset.version,
          marketVersion: wrap.dataset.marketVersion || wrap.dataset.version,
          marketplaceUrl: wrap.dataset.marketplace || '',
        }
        closeExtManageMenus()
        void runExtManageAction(item.dataset.action, ext, wrap.dataset.path || '')
      }
    })
  })
}

function syncExtensionMarketSelection() {
  const tab = activeEditorTab()
  if (!tab || !isExtensionTab(tab)) return
  document.querySelectorAll('.ext-market-item').forEach((row) => {
    const on =
      extensionId(row.dataset.publisher, row.dataset.name) ===
      extensionId(tab.extPublisher, tab.extName)
    row.classList.toggle('on', on)
  })
}

async function fetchExtensionDetailAny(publisher, name) {
  if (typeof api.extensionsDetail === 'function') {
    try {
      const res = await api.extensionsDetail({ publisher, name })
      if (res?.ok && res.extension) return res.extension
    } catch (err) {
      if (!extensionsIpcMissing(err)) throw err
    }
  }
  const res = await fetch(
    `https://open-vsx.org/api/${encodeURIComponent(publisher)}/${encodeURIComponent(name)}`,
  )
  if (!res.ok) throw new Error(`Extension not found (${res.status})`)
  const data = await res.json()
  return {
    publisher: data.namespace || publisher,
    name: data.name || name,
    displayName: data.displayName || name,
    description: data.description || '',
    version: data.version || '',
    downloadCount: data.downloadCount || 0,
    averageRating: data.averageRating || 0,
    publishedBy: data.publishedBy?.displayName || data.namespace || publisher,
    categories: data.categories || [],
    license: data.license || '',
    marketplaceUrl: `https://open-vsx.org/extension/${encodeURIComponent(data.namespace || publisher)}/${encodeURIComponent(data.name || name)}`,
    iconUrl: data.files?.icon || '',
    readme: '',
  }
}

async function openExtensionDetail(ext) {
  if (!requireUser()) return
  enterWorkbench({ allowNoFolder: true })
  const publisher = ext.publisher
  const name = ext.name
  const path = extensionTabPath(publisher, name)
  let tab = state.tabs.find((t) => t.path === path)
  if (!tab) {
    tab = {
      path,
      name: ext.displayName || name,
      kind: 'extension',
      extPublisher: publisher,
      extName: name,
      detail: null,
      detailLoading: true,
      text: '',
    }
    state.tabs.push(tab)
  }
  state.active = path
  closeSettings()
  renderTabs()
  renderEditor()
  syncExtensionMarketSelection()
  scheduleWorkspaceSave()
  saveDevSnapshot()
  void loadExtensionDetailForTab(tab)
}

async function loadExtensionDetailForTab(tab) {
  if (!isExtensionTab(tab)) return
  ensureExtensionTabIdentity(tab)
  if (!tab.extPublisher || !tab.extName) {
    tab.detail = { error: 'Invalid extension tab' }
    tab.detailLoading = false
    if (state.active === tab.path) renderEditor()
    return
  }
  tab.detailLoading = true
  if (state.active === tab.path) renderEditor()
  try {
    tab.detail = await fetchExtensionDetailAny(tab.extPublisher, tab.extName)
    tab.name = tab.detail.displayName || tab.name
    await refreshInstalledExtensionCache()
    const inst = getInstalledExtensionRecord(tab.extPublisher, tab.extName)
    if (inst && tab.detail?.version) {
      inst.marketVersion = tab.detail.version
    }
  } catch (err) {
    tab.detail = { error: err?.message || 'Failed to load extension' }
  }
  tab.detailLoading = false
  renderTabs()
  scheduleWorkspaceSave()
  saveDevSnapshot()
  if (state.active === tab.path) renderEditor()
}

async function restartExtensionHostAfterExtensionChange(publisher, name) {
  try {
    await api.extensionHostStop?.()
    state.extOpenCommandSent = new Set()
    const dock = state.extDock
    if (dock) {
      dock.url = ''
      dock.embeddedUrl = ''
    }
    await activateInstalledExtensionsQuiet({ publisher, name })
  } catch {
    /* ignore */
  }
}

async function installExtensionFromDetail(_publisher, _name, _btn) {
  notifyExtensionInstallUnavailable()
  return false
}

async function updateExtensionFromDetail(publisher, name, btn, targetVersion) {
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Updating…'
  }
  try {
    const out = await api.extensionsInstall({ publisher, name })
    if (!out.ok) {
      appendPanelOutput(`[extensions] ${out.error || 'Update failed'}\n`)
      if (btn) {
        btn.disabled = false
        btn.textContent = 'Update'
      }
      return false
    }
    await refreshInstalledExtensionCache()
    await refreshExtensionActivityBar()
    await window.__soumtokExtInstalledRefresh?.()
    await restartExtensionHostAfterExtensionChange(publisher, name)
    const ver = targetVersion || out.extension?.version || ''
    appendPanelOutput(`[extensions] Updated ${publisher}.${name}${ver ? ` to v${ver}` : ''} — reopening in extension host…\n`)
    const tab = activeEditorTab()
    if (tab && isExtensionTab(tab)) {
      tab.detailLoading = false
      void loadExtensionDetailForTab(tab)
    }
    return true
  } catch (err) {
    appendPanelOutput(`[extensions] ${err?.message || 'Update failed'}\n`)
    if (btn) {
      btn.disabled = false
      btn.textContent = 'Update'
    }
    return false
  }
}

function extDetailActionsHtml(d) {
  const installed = getInstalledExtensionRecord(d.publisher, d.name)
  const id = extensionId(d.publisher, d.name)
  const autoOn = readExtAutoUpdate(id)
  const autoLabel = `<label class="ext-detail-auto"><input type="checkbox" class="ext-detail-auto-input" data-ext-id="${escapeAttr(id)}" ${autoOn ? 'checked' : ''} /> Auto Update</label>`
  const mktUrl = d.marketplaceUrl || extMarketplaceUrl(d)
  if (!installed) {
    return `<button type="button" class="primary ext-detail-install" data-publisher="${escapeAttr(d.publisher)}" data-name="${escapeAttr(d.name)}">Install</button>${autoLabel}`
  }
  const marketVer = d.version || installed.marketVersion || installed.version
  const instRow = { ...installed, marketVersion: marketVer, installedVersion: installed.installedVersion || installed.version }
  const updateAvail = extensionUpdateAvailable(instRow)
  const updateBtn = updateAvail
    ? `<button type="button" class="primary ext-detail-update" data-publisher="${escapeAttr(d.publisher)}" data-name="${escapeAttr(d.name)}" data-version="${escapeAttr(marketVer)}">Update to v${escapeHtml(marketVer)}</button>`
    : ''
  const installedBtn = `<button type="button" class="ext-detail-installed" disabled aria-disabled="true">Installed</button>`
  const manage = `<div class="ext-manage-wrap ext-detail-manage" data-publisher="${escapeAttr(d.publisher)}" data-name="${escapeAttr(d.name)}" data-display="${escapeAttr(d.displayName || d.name)}" data-version="${escapeAttr(installed.version || '')}" data-path="${escapeAttr(installed.installPath || installed.path || '')}" data-marketplace="${escapeAttr(mktUrl)}" data-market-version="${escapeAttr(marketVer)}">
    <button type="button" class="ext-manage-btn" title="Manage" aria-label="Manage extension" aria-haspopup="true" aria-expanded="false">${extManageGearSvg()}</button>
    ${extManageMenuHtml(
      { publisher: d.publisher, name: d.name, displayName: d.displayName, version: installed.version, marketVersion: marketVer },
      { installPath: installed.installPath || installed.path || '', updateAvailable: updateAvail, latestVersion: marketVer },
    )}
  </div>`
  const notify = updateAvail
    ? `<p class="ext-detail-update-note">Update available: v${escapeHtml(installed.version || '?')} → v${escapeHtml(marketVer)}</p>`
    : `<p class="ext-detail-update-note ext-detail-version-ok">Installed version v${escapeHtml(installed.version || '—')}</p>`
  return `<div class="ext-detail-actions-row">${updateBtn}${installedBtn}${manage}</div>${autoLabel}${notify}`
}

function formatExtGalleryDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return String(iso)
  }
}

function extStarRowHtml(rating, count, reviewsUrl) {
  const r = Number(rating) || 0
  const full = Math.round(Math.max(0, Math.min(5, r)))
  let stars = ''
  for (let i = 1; i <= 5; i++) {
    stars += `<span class="ext-star${i <= full ? ' on' : ''}" aria-hidden="true">★</span>`
  }
  const countLabel = count ? ` (${Number(count).toLocaleString()})` : ''
  return `<button type="button" class="ext-detail-rating" data-open-url="${escapeAttr(reviewsUrl || '')}" title="Rate and review on Visual Studio Marketplace (opens in browser)">${stars}<span class="ext-rating-num">${r ? r.toFixed(1) : '—'}${countLabel}</span></button>`
}

function extDetailPaneBodyHtml(d, pane, tab) {
  const renderReadme =
    window.SoumtokExtMarkdown?.renderMarketReadme || window.SoumtokExtMarkdown?.renderMarketMarkdown
  if (pane === 'changelog') {
    const src = d.changelog || '_No changelog published._'
    return renderReadme ? renderReadme(src) : `<pre class="ext-detail-readme">${escapeHtml(src)}</pre>`
  }
  if (pane === 'features') return extFeaturesPaneHtml(d, tab)
  const src = d.readme || d.description || ''
  return renderReadme && src ? renderReadme(src) : `<p class="ext-detail-lead">${escapeHtml(d.description || '')}</p>`
}

function extFeaturesPaneHtml(d, tab) {
  const sections = Array.isArray(d.featureSections) ? d.featureSections : []
  if (!sections.length) {
    return `<p class="ext-detail-lead">${escapeHtml(d.description || 'No contribution manifest for this version.')}</p>`
  }
  if (!tab.extFeatureSection || !sections.some((s) => s.id === tab.extFeatureSection)) {
    tab.extFeatureSection = sections[0].id
  }
  const active = sections.find((s) => s.id === tab.extFeatureSection) || sections[0]
  const nav = sections
    .map(
      (s) =>
        `<button type="button" class="ext-feature-nav${s.id === active.id ? ' on' : ''}" data-feature="${escapeAttr(s.id)}">${escapeHtml(s.label)} <span class="ext-feature-count">${s.items.length}</span></button>`,
    )
    .join('')
  const items = active.items
    .map((item) => `<li><code class="ext-feature-chip">${escapeHtml(String(item))}</code></li>`)
    .join('')
  return `<div class="ext-features-layout">
    <nav class="ext-feature-side" aria-label="Feature groups">${nav}</nav>
    <div class="ext-feature-panel">
      <h2 class="ext-feature-heading">${escapeHtml(active.label)}</h2>
      <ul class="ext-feature-list">${items}</ul>
    </div>
  </div>`
}

function extAsideIconSvg(kind) {
  const icons = {
    review: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8 2.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>',
    publisher: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-5 6s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H3z"/></svg>',
    repo: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 2.5a5.5 5.5 0 0 0-3.14 10 1 1 0 0 0 .28-1.28L4.5 10.5l.28-.03A4 4 0 0 1 8 3.5a4 4 0 0 1 3.22 6.97l.28.03-.64 1.72a1 1 0 0 0 .28 1.28A5.5 5.5 0 0 0 8 2.5z"/></svg>',
    issues: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor"/><circle cx="8" cy="8" r="2.5"/></svg>',
    license: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M6 2.5h6l2 2V13H4V2.5h2z"/><path d="M10 2.5V5h2M6 8h6M6 10.5h4"/></svg>',
    external: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M6 3.5h6.5V10M9.5 6.5 4 12"/></svg>',
    market: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12v2H2V3zm0 4h12v6H2V7zm2 2v2h2V9H4z"/></svg>',
  }
  return icons[kind] || icons.external
}

function extAsideResourceRow(label, url, iconKind) {
  if (!url) return ''
  return `<li><button type="button" class="ext-aside-link" data-open-url="${escapeAttr(url)}"><span class="ext-aside-ico" aria-hidden="true">${extAsideIconSvg(iconKind)}</span><span>${escapeHtml(label)}</span></button></li>`
}

function bindExtensionDetailPage(host, tab) {
  host.querySelectorAll('[data-open-url]').forEach((el) => {
    el.addEventListener('click', () => {
      const url = el.dataset.openUrl
      if (url) void api.openUrl?.(url)
    })
  })
  host.querySelectorAll('.ext-md-link[data-href]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault()
      void api.openUrl?.(a.dataset.href)
    })
  })
  host.querySelectorAll('.ext-md-html a[href]').forEach((a) => {
    const href = a.getAttribute('href')
    if (!href || !/^https?:\/\//i.test(href)) return
    a.addEventListener('click', (e) => {
      e.preventDefault()
      void api.openUrl?.(href)
    })
  })
  host.querySelectorAll('.ext-detail-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      tab.extPaneTab = btn.dataset.pane || 'details'
      renderExtensionDetailPane(tab)
    })
  })
  host.querySelectorAll('.ext-feature-nav').forEach((btn) => {
    btn.addEventListener('click', () => {
      tab.extFeatureSection = btn.dataset.feature
      renderExtensionDetailPane(tab)
    })
  })
  host.querySelector('.ext-detail-install')?.addEventListener('click', async (e) => {
    const b = e.currentTarget
    await installExtensionFromDetail(b.dataset.publisher, b.dataset.name, b)
  })
  host.querySelector('.ext-detail-update')?.addEventListener('click', async (e) => {
    const b = e.currentTarget
    await updateExtensionFromDetail(b.dataset.publisher, b.dataset.name, b, b.dataset.version)
  })
  host.querySelectorAll('.ext-detail-auto-input').forEach((input) => {
    input.addEventListener('change', () => {
      writeExtAutoUpdate(input.dataset.extId, input.checked)
    })
  })
  bindExtManageMenus(host)
}

function renderExtensionDetailPane(tab) {
  const host = $('editor')
  if (!host) return
  ensureExtensionTabIdentity(tab)
  if (!tab.detail && !tab.detailLoading && tab.extPublisher && tab.extName) {
    tab.detailLoading = true
    host.classList.add('ext-editor-host')
    host.innerHTML = `<div class="ext-detail-page"><p class="git-scm-muted">Loading extension…</p></div>`
    void loadExtensionDetailForTab(tab)
    return
  }
  if (state.editor) {
    state.editor.dispose()
    state.editor = null
  }
  if (state.editorModel) {
    state.editorModel.dispose()
    state.editorModel = null
  }
  host.classList.remove('editor-monaco-host')
  host.classList.add('ext-editor-host')
  if (tab.detailLoading) {
    host.innerHTML = `<div class="ext-detail-page"><p class="git-scm-muted">Loading extension…</p></div>`
    return
  }
  const d = tab.detail || {}
  if (d.error) {
    host.innerHTML = `<div class="ext-detail-page"><p class="git-scm-muted">${escapeHtml(d.error)}</p></div>`
    return
  }
  if (!state.installedExtCacheAt) {
    void refreshInstalledExtensionCache().then(() => {
      if (state.active === tab.path) renderExtensionDetailPane(tab)
    })
    return
  }
  if (!tab.extPaneTab) tab.extPaneTab = 'details'
  const pane = tab.extPaneTab
  const cats = (d.categories || []).map((c) => `<li class="ext-tag-pill">${escapeHtml(String(c))}</li>`).join('')
  const iconSrc = d.iconUrl || extIconUrl(d)
  const heroIcon = iconSrc
    ? `<img class="ext-detail-icon-img" src="${escapeAttr(iconSrc)}" alt="" referrerpolicy="no-referrer" decoding="async" />`
    : `<div class="ext-detail-icon">${escapeHtml(extIconLetter(d.displayName))}</div>`
  const publisherUrl = d.publisherPageUrl || `https://marketplace.visualstudio.com/publishers/${encodeURIComponent(d.publisher)}`
  const reviewsUrl = d.reviewsUrl || `${d.marketplaceUrl || ''}&ssr=false#review-details`
  const domain = d.publisherDomain ? String(d.publisherDomain).replace(/^https?:\/\//, '') : ''
  const domainBtn = domain
    ? `<button type="button" class="ext-detail-domain" data-open-url="https://${escapeAttr(domain)}">${escapeHtml(domain)}</button>`
    : ''
  const tabBtn = (id, label) =>
    `<button type="button" class="ext-detail-tab${pane === id ? ' on' : ''}" data-pane="${id}">${label}</button>`

  host.innerHTML = `<div class="ext-detail-page">
    <header class="ext-detail-hero">
      ${heroIcon}
      <div class="ext-detail-hero-main">
        <h1 class="ext-detail-title">${escapeHtml(d.displayName || d.name)}</h1>
        <p class="ext-detail-tagline">${escapeHtml(d.description || '')}</p>
        <p class="ext-detail-sub ext-detail-sub-publisher">
          ${extensionIsVerified(d) ? extVerifiedBadgeHtml() : ''}
          <button type="button" class="ext-detail-publisher-link" data-open-url="${escapeAttr(publisherUrl)}">${escapeHtml(d.publishedBy || d.publisher)}</button>
          ${domainBtn}
        </p>
        <div class="ext-detail-stats-row">
          ${d.downloadCount ? `<span class="ext-detail-dl">${Number(d.downloadCount).toLocaleString()} downloads</span>` : ''}
          ${extStarRowHtml(d.averageRating, d.ratingCount, reviewsUrl)}
        </div>
        <div class="ext-detail-actions">${extDetailActionsHtml(d)}</div>
      </div>
    </header>
    <div class="ext-detail-layout">
      <div class="ext-detail-main">
        <nav class="ext-detail-tabs" aria-label="Extension">${tabBtn('details', 'Details')}${tabBtn('features', 'Features')}${tabBtn('changelog', 'Changelog')}</nav>
        <div class="ext-detail-readme">${extDetailPaneBodyHtml(d, pane, tab)}</div>
      </div>
      <aside class="ext-detail-aside">
        <h3>Marketplace</h3>
        <dl>
          <dt>Identifier</dt><dd>${escapeHtml(`${d.publisher}.${d.name}`)}</dd>
          <dt>Version</dt><dd>${(() => {
            const inst = getInstalledExtensionRecord(d.publisher, d.name)
            if (!inst) return escapeHtml(d.version || '—')
            const latest = d.version || inst.marketVersion || '—'
            if (extensionUpdateAvailable({ ...inst, marketVersion: latest, installedVersion: inst.installedVersion || inst.version })) {
              return `${escapeHtml(inst.version || '—')} → <strong>${escapeHtml(latest)}</strong>`
            }
            return escapeHtml(inst.version || latest || '—')
          })()}</dd>
          <dt>Last updated</dt><dd>${escapeHtml(formatExtGalleryDate(d.lastUpdated))}</dd>
          ${d.license ? `<dt>License</dt><dd>${escapeHtml(d.license)}</dd>` : ''}
        </dl>
        ${cats ? `<h3>Categories</h3><ul class="ext-detail-cats ext-detail-tags">${cats}</ul>` : ''}
        <h3>Resources</h3>
        <ul class="ext-detail-resources">
          ${extAsideResourceRow('Rate & Review', reviewsUrl, 'review')}
          ${extAsideResourceRow(d.publishedBy || 'Publisher', publisherUrl, 'publisher')}
          ${extAsideResourceRow('Repository', d.repository, 'repo')}
          ${extAsideResourceRow('Issues', d.issuesUrl, 'issues')}
          ${extAsideResourceRow('License', d.licenseUrl, 'license')}
          ${extAsideResourceRow('Homepage', d.homepage, 'external')}
          ${extAsideResourceRow('Marketplace', d.marketplaceUrl, 'market')}
          ${extAsideResourceRow('Open VSX mirror', d.openVsxUrl, 'external')}
          ${d.publisherDomain ? extAsideResourceRow(d.publisherDomain, `https://${d.publisherDomain}`, 'external') : ''}
        </ul>
      </aside>
    </div>
  </div>`
  bindExtensionDetailPage(host, tab)
}

function extensionsIpcMissing(err) {
  return /no handler registered/i.test(String(err?.message || err))
}

const VSX_GALLERY_URL =
  'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=7.1-preview.1'
const VSX_GALLERY_FLAGS = 914
const VSX_GALLERY_TARGET = 'Microsoft.VisualStudio.Code'

function mapVsxGalleryRow(ext) {
  const publisher = ext.publisher?.publisherName || ''
  const name = ext.extensionName || ''
  const ver = ext.versions?.[0]
  const stats = ext.statistics?.length ? ext.statistics : ver?.statistics || []
  const install = stats.find((s) => s.statisticName === 'install')?.value || 0
  const averageRating = stats.find((s) => s.statisticName === 'averagerating')?.value || 0
  const files = ver?.files || []
  const iconUrl =
    files.find((f) => f.assetType === 'Microsoft.VisualStudio.Services.Icons.Default')?.source || ''
  return {
    publisher,
    name,
    version: ver?.version || '',
    displayName: ext.displayName || name,
    description: ext.shortDescription || '',
    downloadCount: install,
    averageRating,
    iconUrl,
    publisherDisplayName: ext.publisher?.displayName || publisher,
    verified:
      typeof publisherVerifiedFromGallery === 'function'
        ? publisherVerifiedFromGallery(ext.publisher)
        : Boolean(ext.verified),
  }
}

async function postVsxGallery(filter) {
  const res = await fetch(VSX_GALLERY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json;api-version=7.1-preview.1',
      'X-Market-Client-Id': 'Soumtok.desktop',
    },
    body: JSON.stringify({ filters: [filter], flags: VSX_GALLERY_FLAGS }),
  })
  if (!res.ok) throw new Error(`Marketplace unavailable (${res.status})`)
  const data = await res.json()
  if (data.errorCode != null) throw new Error(data.message || 'Gallery error')
  const result = data.results?.[0] || {}
  const totalMeta = result.resultMetadata?.find((m) => m.metadataType === 'ResultCount')
  const totalItem = totalMeta?.metadataItems?.find((m) => m.name === 'TotalCount')
  const extensions = (result.extensions || []).map(mapVsxGalleryRow)
  return {
    extensions,
    total: totalItem?.count ?? extensions.length,
  }
}

async function openVsxGalleryPopularDirect(pageNumber = 1, pageSize = 50) {
  const { extensions, total } = await postVsxGallery({
    criteria: [{ filterType: 8, value: VSX_GALLERY_TARGET }],
    pageNumber,
    pageSize,
    sortBy: 4,
    sortOrder: 2,
  })
  return { list: extensions, total }
}

async function openVsxGallerySearchDirect(query, pageNumber = 1, pageSize = 48) {
  const q = String(query || '').trim()
  if (!q) return { list: [], total: 0 }
  const { extensions, total } = await postVsxGallery({
    criteria: [
      { filterType: 10, value: q.slice(0, 200) },
      { filterType: 8, value: VSX_GALLERY_TARGET },
    ],
    pageNumber,
    pageSize,
    sortBy: 0,
    sortOrder: 0,
  })
  return { list: extensions, total }
}

function loadExtMarketFilter() {
  try {
    const raw = localStorage.getItem(EXT_MARKET_FILTER_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { mode: 'popular', sort: 'installs' }
}

function saveExtMarketFilter(filter) {
  try {
    localStorage.setItem(EXT_MARKET_FILTER_KEY, JSON.stringify(filter))
  } catch {
    /* ignore */
  }
}

const EXT_MARKET_MODE_LABELS = {
  popular: 'Most Popular',
  featured: 'Featured',
  recent: 'Recently Published',
  recommended: 'Recommended',
  installed: 'Installed',
}

async function showExtensionUpdateBanner(installedList) {
  const banner = document.getElementById('ext-update-banner')
  if (!banner) return
  const updates = (installedList || []).filter((e) => extensionUpdateAvailable(e))
  if (!updates.length) {
    banner.hidden = true
    banner.innerHTML = ''
    return
  }
  state.extUpdatesNotified = state.extUpdatesNotified || new Set()
  const summary = updates
    .map((e) => `${e.displayName || e.name}: v${e.installedVersion || e.version} → v${e.marketVersion}`)
    .join('; ')
  for (const ext of updates) {
    const notifyKey = `${extensionId(ext.publisher, ext.name)}@${ext.marketVersion}`
    if (!state.extUpdatesNotified.has(notifyKey)) {
      state.extUpdatesNotified.add(notifyKey)
      appendPanelOutput(`[extensions] Update available — ${ext.displayName || ext.name} (v${ext.marketVersion} on Marketplace)\n`)
    }
  }
  const remaining = (installedList || []).filter((e) => extensionUpdateAvailable(e))
  if (!remaining.length) {
    banner.hidden = true
    return
  }
  const lines = remaining.map((e) => escapeHtml(e.displayName || e.name)).join(', ')
  banner.hidden = false
  banner.innerHTML = `<span class="ext-update-banner-text"><strong>Updates available</strong> — ${lines}</span>
    <button type="button" class="ext-update-banner-btn" id="ext-update-all">Update all</button>
    <button type="button" class="ext-update-banner-dismiss" id="ext-update-dismiss" title="Dismiss">×</button>`
  banner.querySelector('#ext-update-dismiss')?.addEventListener('click', () => {
    banner.hidden = true
  })
  banner.querySelector('#ext-update-all')?.addEventListener('click', async () => {
    for (const ext of remaining) {
      await updateExtensionFromDetail(ext.publisher, ext.name, null, ext.marketVersion)
    }
    banner.hidden = true
  })
}

async function paintExtensionsPanel() {
  state.extMarketAutoOpened = false
  const root = $('sidebar')
  root.innerHTML = `<div class="side-section extensions-section">
    <div class="side-section-head">
      <span class="side-section-title">Extensions</span>
      <span class="side-section-sub">Marketplace</span>
      <button type="button" class="side-icon-btn" id="ext-run-host" title="Run installed extensions in VS Code / Soumtok Code">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
      </button>
    </div>
    <div class="side-body extensions-body">
      <div class="extensions-search-row">
        <button type="button" class="ext-filter-btn" id="ext-filter-btn" title="Filter extensions" aria-haspopup="true" aria-expanded="false">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2 4h12M4 8h8M6 12h4"/></svg>
        </button>
        <input type="text" id="ext-search" class="extensions-search" placeholder="Search Extensions in Marketplace" autocomplete="off" spellcheck="false" />
        <div class="ext-filter-menu" id="ext-filter-menu" hidden role="menu">
          <button type="button" class="ext-filter-item" data-mode="featured" role="menuitem">Featured</button>
          <button type="button" class="ext-filter-item" data-mode="popular" role="menuitem">Most Popular</button>
          <button type="button" class="ext-filter-item" data-mode="recent" role="menuitem">Recently Published</button>
          <button type="button" class="ext-filter-item" data-mode="recommended" role="menuitem">Recommended</button>
          <hr class="ext-filter-sep" />
          <button type="button" class="ext-filter-item" data-mode="installed" role="menuitem">Installed</button>
          <hr class="ext-filter-sep" />
          <div class="ext-filter-subhead">Sort by</div>
          <button type="button" class="ext-filter-item" data-sort="installs" role="menuitem">Install count</button>
          <button type="button" class="ext-filter-item" data-sort="rating" role="menuitem">Rating</button>
          <button type="button" class="ext-filter-item" data-sort="published" role="menuitem">Published date</button>
          <button type="button" class="ext-filter-item" data-sort="name" role="menuitem">Name</button>
        </div>
      </div>
      <div class="ext-update-banner" id="ext-update-banner" hidden role="status"></div>
      <h3 class="extensions-subhead" id="ext-installed-head">Installed</h3>
      <div id="ext-installed" class="extensions-installed"><p class="git-scm-muted">Loading…</p></div>
      <div id="ext-rec" class="extensions-rec"></div>
      <h3 class="extensions-subhead" id="ext-market-head">Popular</h3>
      <div id="ext-results" class="extensions-results"><p class="git-scm-muted">Loading marketplace…</p></div>
    </div>
  </div>`
  const recBox = $('ext-rec')
  const installedBox = $('ext-installed')
  const installedHead = $('ext-installed-head')
  const marketHead = $('ext-market-head')
  const resultsBox = $('ext-results')
  $('ext-run-host')?.addEventListener('click', () => void runExtensionHost())
  const search = $('ext-search')
  let installedKeys = new Set()
  let marketPage = 1
  let marketQuery = ''
  let marketTotal = 0
  const MARKET_PAGE_SIZE = 48
  const savedFilter = loadExtMarketFilter()
  let marketMode = savedFilter.mode || 'popular'
  let marketSort = savedFilter.sort || 'installs'
  const filterBtn = $('ext-filter-btn')
  const filterMenu = $('ext-filter-menu')
  function syncFilterUi() {
    filterMenu?.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.classList.toggle('on', btn.dataset.mode === marketMode)
    })
    filterMenu?.querySelectorAll('[data-sort]').forEach((btn) => {
      btn.classList.toggle('on', btn.dataset.sort === marketSort)
    })
    const hideInstalledBlock = marketMode === 'installed'
    if (installedHead) installedHead.style.display = hideInstalledBlock ? 'none' : ''
    if (installedBox) installedBox.style.display = hideInstalledBlock ? 'none' : ''
  }

  function closeFilterMenu() {
    if (!filterMenu) return
    filterMenu.hidden = true
    filterBtn?.setAttribute('aria-expanded', 'false')
  }

  filterBtn?.addEventListener('click', (e) => {
    e.stopPropagation()
    if (!filterMenu) return
    const open = filterMenu.hidden
    filterMenu.hidden = !open
    filterBtn.setAttribute('aria-expanded', open ? 'true' : 'false')
  })
  filterMenu?.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      marketMode = btn.dataset.mode || 'popular'
      saveExtMarketFilter({ mode: marketMode, sort: marketSort })
      syncFilterUi()
      closeFilterMenu()
      search.value = ''
      marketQuery = ''
      void reloadMarket(false)
    })
  })
  filterMenu?.querySelectorAll('[data-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      marketSort = btn.dataset.sort || 'installs'
      saveExtMarketFilter({ mode: marketMode, sort: marketSort })
      syncFilterUi()
      closeFilterMenu()
      if (!search.value.trim() && marketMode !== 'recommended' && marketMode !== 'installed') {
        void reloadMarket(false)
      }
    })
  })
  filterMenu?.addEventListener('click', (e) => e.stopPropagation())
  root.querySelector('.extensions-body')?.addEventListener('click', () => {
    closeFilterMenu()
    closeExtManageMenus()
  })
  syncFilterUi()

  function marketRowHtml(ext, { installedRow = false } = {}) {
    ext = normalizeMarketExtension(ext)
    const key = extensionId(ext.publisher, ext.name)
    extMarketCache.set(key, ext)
    const isOn = installedKeys.has(key) || installedRow
    const updateAvail = isOn && extensionUpdateAvailable(ext)
    const dl = ext.downloadCount ? formatExtCount(ext.downloadCount) : ''
    const rating = ext.averageRating ? Number(ext.averageRating).toFixed(1) : ''
    const stats = [dl, rating ? `★ ${rating}` : ''].filter(Boolean).join(' ')
    const mktUrl = extMarketplaceUrl(ext)
    const marketVer = ext.marketVersion || ext.version || ''
    const actions = isOn
      ? `<div class="ext-manage-wrap ext-market-actions" data-publisher="${escapeAttr(ext.publisher)}" data-name="${escapeAttr(ext.name)}" data-display="${escapeAttr(ext.displayName || ext.name)}" data-version="${escapeAttr(ext.version || '')}" data-market-version="${escapeAttr(marketVer)}" data-path="${escapeAttr(ext.installPath || ext.path || '')}" data-marketplace="${escapeAttr(mktUrl)}">
          ${updateAvail ? `<button type="button" class="ext-update-pill" data-publisher="${escapeAttr(ext.publisher)}" data-name="${escapeAttr(ext.name)}" data-version="${escapeAttr(marketVer)}">Update</button>` : ''}
          <button type="button" class="ext-manage-btn" title="Manage" aria-label="Manage extension" aria-haspopup="true" aria-expanded="false">${extManageGearSvg()}</button>
          ${extManageMenuHtml(ext, { installPath: ext.installPath || ext.path || '', updateAvailable: updateAvail, latestVersion: marketVer })}
        </div>`
      : `<button type="button" class="ext-install ext-market-actions" data-publisher="${escapeAttr(ext.publisher)}" data-name="${escapeAttr(ext.name)}" data-display="${escapeAttr(ext.displayName || ext.name)}" data-publisher-display="${escapeAttr(ext.publisherDisplayName || ext.publisher)}" data-verified="${extensionIsVerified(ext) ? '1' : '0'}" data-publisher-domain="${escapeAttr(ext.publisherDomain || '')}">Install</button>`
    return `<div class="ext-market-item${isOn ? ' ext-market-installed' : ''}" data-publisher="${escapeAttr(ext.publisher)}" data-name="${escapeAttr(ext.name)}" data-display="${escapeAttr(ext.displayName || ext.name)}" role="button" tabindex="0">
      <div class="ext-market-icon" aria-hidden="true">${extIconHtml(ext)}</div>
      <div class="ext-market-body">
        <div class="ext-market-title-row">
          <span class="ext-market-title">${escapeHtml(ext.displayName)}</span>
          ${ext.kind === 'language' ? '<span class="ext-kind-chip">Language · Agent</span>' : ext.hasAppUi || ext.kind === 'app' ? '<span class="ext-kind-chip">App</span>' : ''}
          ${stats ? `<span class="ext-market-stats">${escapeHtml(stats)}</span>` : ''}
        </div>
        <div class="ext-market-publisher">${extPublisherLineHtml(ext)}</div>
        <div class="ext-market-desc">${escapeHtml((ext.description || '').slice(0, 96))}</div>
      </div>
      ${actions}
    </div>`
  }

  function bindMarketItems(container) {
    bindInstallButtons(container)
    bindExtManageMenus(container)
    container.querySelectorAll('.ext-update-pill').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation()
        void updateExtensionFromDetail(btn.dataset.publisher, btn.dataset.name, btn, btn.dataset.version)
      }
    })
    container.querySelectorAll('.ext-market-item').forEach((row) => {
      const ext =
        extMarketCache.get(extensionId(row.dataset.publisher, row.dataset.name)) ||
        normalizeMarketExtension({
          publisher: row.dataset.publisher,
          name: row.dataset.name,
          displayName: row.dataset.display,
          description: row.querySelector('.ext-market-desc')?.textContent || '',
          publisherDisplayName: row.querySelector('.ext-market-publisher-name')?.textContent || row.dataset.publisher,
        })
      const open = () => {
        hideExtMarketHover()
        void openExtensionDetail({
          publisher: row.dataset.publisher,
          name: row.dataset.name,
          displayName: row.dataset.display,
        })
      }
      row.addEventListener('mouseenter', () => scheduleExtMarketHover(row, ext))
      row.addEventListener('mouseleave', () => hideExtMarketHover())
      row.addEventListener('click', (e) => {
        if (e.target.closest('.ext-install, .ext-manage-wrap, .ext-manage-menu')) return
        void open()
      })
      row.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        if (e.target.closest('.ext-install, .ext-manage-wrap')) return
        e.preventDefault()
        void open()
      })
    })
  }

  function bindInstallButtons(container) {
    container.querySelectorAll('.ext-install:not(.ext-installed)').forEach((btn) => {
      btn.onclick = () => {
        notifyExtensionInstallUnavailable()
      }
    })
  }

  async function drawInstalled() {
    let list = []
    try {
      const res = await api.extensionsInstalled()
      if (!res?.ok && res?.error) throw new Error(res.error)
      list = (res.extensions || []).map((row) => ({ ...row, installPath: row.path }))
    } catch (err) {
      if (extensionsIpcMissing(err)) {
        installedBox.innerHTML = `<p class="git-scm-muted">${escapeHtml(EXT_MAIN_RESTART_HINT)}</p>`
      } else {
        installedBox.innerHTML = `<p class="git-scm-muted">${escapeHtml(err?.message || 'Could not load installed extensions')}</p>`
      }
      installedKeys = new Set()
      return
    }
    list = list.map((e) =>
      normalizeMarketExtension({ ...e, installPath: e.installPath || e.path }),
    )
    installedKeys = new Set(list.map((e) => extensionId(e.publisher, e.name)))
    state.installedExtById = new Map(list.map((e) => [extensionId(e.publisher, e.name), e]))
    state.installedExtCacheAt = Date.now()
    if (installedHead) installedHead.textContent = list.length ? `Installed (${list.length})` : 'Installed'
    void showExtensionUpdateBanner(list)
    if (!list.length) {
      installedBox.innerHTML = '<p class="git-scm-muted">None yet — pick Install below.</p>'
      return
    }
    installedBox.innerHTML = list.map((ext) => marketRowHtml(ext, { installedRow: true })).join('')
    bindMarketItems(installedBox)
  }

  window.__soumtokExtInstalledRefresh = async () => {
    await drawInstalled()
    if (!search.value.trim()) await reloadMarket(false)
    else await runSearch(false)
    const tab = activeEditorTab()
    if (tab && isExtensionTab(tab)) renderExtensionDetailPane(tab)
  }

  async function drawRecommendations() {
    let recs = []
    try {
      const res = await api.extensionsRecommendations()
      recs = res.recommendations || []
    } catch {
      recs = []
    }
    if (!recs.length) {
      recBox.innerHTML = ''
      return
    }
    recBox.innerHTML = `<h3 class="extensions-subhead">Recommended (${recs.length})</h3><div class="extensions-rec-list"><p class="git-scm-muted">Loading…</p></div>`
    const listEl = recBox.querySelector('.extensions-rec-list')
    const rows = await Promise.all(
      recs.slice(0, 8).map(async (id) => {
        const dot = id.indexOf('.')
        const publisher = dot > 0 ? id.slice(0, dot) : id
        const name = dot > 0 ? id.slice(dot + 1) : ''
        try {
          const detail = await fetchExtensionDetailAny(publisher, name)
          return {
            publisher: detail.publisher || publisher,
            name: detail.name || name,
            version: detail.version || '',
            displayName: detail.displayName || name,
            description: detail.description || '',
            downloadCount: detail.downloadCount || 0,
            averageRating: detail.averageRating || 0,
            iconUrl: detail.iconUrl || '',
            verified: Boolean(detail.verified),
          }
        } catch {
          return {
            publisher,
            name,
            displayName: name || id,
            description: '',
          }
        }
      }),
    )
    listEl.innerHTML = rows.map((ext) => marketRowHtml(normalizeMarketExtension(ext))).join('')
    bindMarketItems(listEl)
    syncExtensionMarketSelection()
  }

  function marketHeading(base, listLen) {
    if (marketTotal > listLen) return `${base} (${listLen} of ${marketTotal.toLocaleString()}+)`
    if (listLen) return `${base} (${listLen})`
    return base
  }

  function attachLoadMoreMarket() {
    resultsBox.querySelector('.ext-market-more')?.remove()
    if (marketMode === 'installed' || marketMode === 'recommended') return
    const loaded = resultsBox.querySelectorAll('.ext-market-item').length
    if (loaded < MARKET_PAGE_SIZE) return
    if (marketTotal && loaded >= marketTotal) return
    const foot = document.createElement('div')
    foot.className = 'ext-market-more'
    foot.innerHTML =
      '<button type="button" class="ext-load-more">Load more extensions…</button>'
    resultsBox.appendChild(foot)
    foot.querySelector('.ext-load-more').onclick = () => {
      marketPage += 1
      void (marketQuery ? runSearch(true) : reloadMarket(true))
    }
  }

  async function renderMarketList(list, heading, append = false) {
    if (marketHead) marketHead.textContent = marketHeading(heading, append ? resultsBox.querySelectorAll('.ext-market-item').length + list.length : list.length)
    if (!list.length && !append) {
      resultsBox.innerHTML = '<p class="git-scm-muted">No extensions found.</p>'
      return list
    }
    const html = list.map((ext) => marketRowHtml(normalizeMarketExtension(ext))).join('')
    if (append) {
      resultsBox.querySelector('.ext-market-more')?.remove()
      resultsBox.insertAdjacentHTML('beforeend', html)
    } else {
      resultsBox.innerHTML = html
    }
    bindMarketItems(resultsBox)
    syncExtensionMarketSelection()
    if (marketHead && list.length) {
      marketHead.textContent = marketHeading(heading, resultsBox.querySelectorAll('.ext-market-item').length)
    }
    attachLoadMoreMarket()
    return list
  }

  async function fetchRecommendedMarket() {
    let recs = []
    try {
      const res = await api.extensionsRecommendations()
      recs = res.recommendations || []
    } catch {
      recs = []
    }
    const rows = await Promise.all(
      recs.slice(0, 24).map(async (id) => {
        const dot = id.indexOf('.')
        const publisher = dot > 0 ? id.slice(0, dot) : id
        const name = dot > 0 ? id.slice(dot + 1) : ''
        try {
          const detail = await fetchExtensionDetailAny(publisher, name)
          return {
            publisher: detail.publisher || publisher,
            name: detail.name || name,
            version: detail.version || '',
            displayName: detail.displayName || name,
            description: detail.description || '',
            downloadCount: detail.downloadCount || 0,
            averageRating: detail.averageRating || 0,
            iconUrl: detail.iconUrl || '',
            verified: Boolean(detail.verified),
            publisherDisplayName: detail.publishedBy || publisher,
          }
        } catch {
          return { publisher, name, displayName: name || id, description: '' }
        }
      }),
    )
    return { list: rows.filter((r) => r.publisher && r.name), total: rows.length }
  }

  async function fetchMarketPage(query, pageNumber) {
    if (!query && marketMode === 'installed') {
      const res = await api.extensionsInstalled()
      const list = (res.extensions || []).map((row) => ({
        publisher: row.publisher,
        name: row.name,
        displayName: row.displayName,
        description: row.description,
        version: row.version,
        installed: true,
      }))
      return { list, total: list.length }
    }
    if (!query && marketMode === 'recommended') return fetchRecommendedMarket()

    const payload = { pageNumber, pageSize: MARKET_PAGE_SIZE, mode: marketMode, sort: marketSort }
    if (query) payload.query = query
    if (typeof api.extensionsPopular === 'function' && !query) {
      try {
        const res = await api.extensionsPopular(payload)
        if (res?.ok && (res.extensions || []).length) {
          return { list: res.extensions, total: res.total || 0 }
        }
      } catch (err) {
        if (!extensionsIpcMissing(err)) throw err
      }
    }
    if (typeof api.extensionsSearch === 'function' && query) {
      try {
        const res = await api.extensionsSearch(payload)
        if (res?.ok) return { list: res.extensions || [], total: res.total || 0 }
      } catch (err) {
        if (!extensionsIpcMissing(err)) throw err
      }
    }
    return query
      ? await openVsxGallerySearchDirect(query, pageNumber, MARKET_PAGE_SIZE)
      : await openVsxGalleryPopularDirect(pageNumber, MARKET_PAGE_SIZE)
  }

  async function reloadMarket(append = false) {
    const q = search.value.trim()
    if (q) {
      await runSearch(append)
      return
    }
    if (!append) {
      marketPage = 1
      marketQuery = ''
      resultsBox.innerHTML = '<p class="git-scm-muted">Loading VS Code Marketplace…</p>'
    }
    try {
      const { list, total } = await fetchMarketPage('', marketPage)
      marketTotal = total
      const heading = EXT_MARKET_MODE_LABELS[marketMode] || 'Marketplace'
      await renderMarketList(list, heading, append)
    } catch (err) {
      resultsBox.innerHTML = `<p class="git-scm-muted">${escapeHtml(err?.message || 'Could not reach marketplace')}</p>`
    }
  }

  async function loadPopular(append = false) {
    marketMode = 'popular'
    saveExtMarketFilter({ mode: marketMode, sort: marketSort })
    syncFilterUi()
    await reloadMarket(append)
  }

  async function runSearch(append = false) {
    const q = search.value.trim()
    if (!q) {
      await reloadMarket(false)
      return
    }
    if (!append) {
      marketPage = 1
      marketQuery = q
      resultsBox.innerHTML = '<p class="git-scm-muted">Searching Marketplace…</p>'
    }
    try {
      const { list, total } = await fetchMarketPage(q, marketPage)
      marketTotal = total
      await renderMarketList(list, `Results for “${q}”`, append)
    } catch (err) {
      resultsBox.innerHTML = `<p class="git-scm-muted">${escapeHtml(err?.message || 'Search failed')}</p>`
    }
  }

  let searchTimer = null
  search.onkeydown = (e) => {
    if (e.key === 'Enter') void runSearch()
  }
  search.oninput = () => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      void runSearch()
    }, 280)
  }

  void drawInstalled()
  if (marketMode === 'recommended') {
    recBox.innerHTML = ''
  } else {
    void drawRecommendations()
  }
  requestAnimationFrame(() => {
    void reloadMarket(false)
  })
  search.focus()
}

function renderTree(nodes, depth) {
  const wrap = document.createElement('div')
  wrap.className = depth === 0 ? 'tree-root' : 'tree-children'
  for (const node of nodes) {
    const isDir = node.type === 'dir'
    const hasKids = isDir && node.children?.length
    const inlineHere = isDir && explorerInlineParentIs(node.path)
    const expanded =
      Boolean(node.workspaceRoot) ||
      (isDir && (state.expandedDirs.has(node.path) || state.expandedDirs.has(normPath(node.path)))) ||
      inlineHere
    const row = document.createElement('div')
    row.className = `tree-row ${node.type === 'dir' ? 'tree-dir' : 'tree-file'}`
    row.dataset.path = node.path
    if (node.type === 'file') {
      if (state.active && (node.path === state.active || normPath(node.path) === normPath(state.active))) {
        row.classList.add('on')
      }
    }
    row.oncontextmenu = (e) => {
      e.preventDefault()
      e.stopPropagation()
      openExplorerContextMenu(e.clientX, e.clientY, node)
    }
    row.style.setProperty('--depth', String(depth))
    const chevEl =
      hasKids || node.type === 'dir'
        ? treeChevron(expanded)
        : (() => {
            const pad = document.createElement('span')
            pad.className = 'tree-chev tree-chev-pad'
            return pad
          })()
    const iconEl = treeIcon(node, expanded)
    row.appendChild(chevEl)
    row.appendChild(iconEl)
    const label = document.createElement('span')
    label.className = 'tree-label'
    label.textContent = node.name
    row.appendChild(label)
    row.title = node.path
    wrap.appendChild(row)
    let childWrap = null
    if (isDir && (hasKids || inlineHere)) {
      childWrap = hasKids ? renderTree(node.children, depth + 1) : document.createElement('div')
      if (!hasKids) childWrap.className = 'tree-children'
      if (inlineHere) appendExplorerInlineRow(childWrap, depth + 1, node.path)
      if (!expanded) childWrap.hidden = true
      wrap.appendChild(childWrap)
      row.onclick = () => {
        setExplorerFocus(node)
        const willOpen = childWrap.hidden
        childWrap.hidden = !willOpen
        if (willOpen) {
          state.expandedDirs.add(node.path)
          state.expandedDirs.add(normPath(node.path))
        } else {
          state.expandedDirs.delete(node.path)
          state.expandedDirs.delete(normPath(node.path))
        }
        const chev = row.querySelector('.tree-chev:not(.tree-chev-pad)')
        const icon = row.querySelector('.tree-icon')
        if (chev) chev.replaceWith(treeChevron(willOpen))
        if (icon) icon.replaceWith(treeIcon(node, willOpen))
      }
    } else if (node.type === 'file') {
      row.onclick = () => {
        setExplorerFocus(node)
        void openFile(node)
      }
    } else if (node.type === 'dir') {
      row.onclick = () => setExplorerFocus(node)
    }
  }
  return wrap
}

async function openFile(node) {
  let tab = state.tabs.find((t) => sameFilePath(t.path, node.path))
  if (!tab) {
    if (isImageFileName(node.name || node.path)) {
      tab = { path: node.path, name: node.name, kind: 'image', text: '' }
      await loadImageTab(tab)
    } else {
      const text = await api.readFile(node.path)
      tab = { path: node.path, name: node.name, text, envEditorMode: 'form' }
      if (isDotEnvTab(tab)) {
        tab.envEditorMode = 'form'
        window.SoumtokEnvEditor?.hydrateEnvTab?.(tab)
      }
    }
    state.tabs.push(tab)
  } else if (isImageTab(tab) && !tab.dataUrl) {
    await loadImageTab(tab)
  }
  if (state.active && !sameFilePath(state.active, tab.path)) rememberLastEditLocation()
  setExplorerFocus({ path: node.path, type: 'file' })
  state.active = tab.path
  for (const d of ancestorDirs(tab.path)) state.expandedDirs.add(d)
  if (tabHistory[historyAt] !== tab.path) {
    tabHistory = tabHistory.slice(0, historyAt + 1)
    tabHistory.push(tab.path)
    historyAt = tabHistory.length - 1
  }
  renderTabs()
  renderEditor()
  if (state.side === 'files') renderSide()
  else syncExplorerSelection()
  requestAnimationFrame(() => {
    document.querySelector('#tree .tree-row.tree-file.on')?.scrollIntoView({ block: 'nearest' })
  })
  updateStatus()
  scheduleWorkspaceSave()
}

function syncExplorerSelection() {
  if (state.side !== 'files') return
  const active = state.active ? normPath(state.active) : ''
  document.querySelectorAll('#tree .tree-row.tree-file').forEach((row) => {
    const match = active && normPath(row.dataset.path || '') === active
    row.classList.toggle('on', match)
  })
}

function closeTab(path, event) {
  event?.stopPropagation()
  event?.preventDefault()
  const idx = state.tabs.findIndex((t) => sameFilePath(t.path, path))
  if (idx < 0) return
  const closed = state.tabs[idx]
  state.tabs.splice(idx, 1)
  state.dirty.delete(closed.path)
  if (state.active && sameFilePath(state.active, closed.path)) {
    const next = state.tabs[idx] || state.tabs[idx - 1]
    state.active = next?.path || null
  }
  renderTabs()
  renderEditor()
  syncExplorerSelection()
  scheduleWorkspaceSave()
}

function tabDisplayLabel(tab, tabs) {
  const name = tab.name || fileNameFromPath(tab.path)
  const dupes = tabs.filter((t) => (t.name || fileNameFromPath(t.path)) === name)
  if (dupes.length <= 1) return name
  const root = normPath(state.folder)
  const full = normPath(tab.path)
  let rel = full
  if (root && full.startsWith(root)) rel = full.slice(root.length).replace(/^\/+/, '')
  if (!rel || rel === name) return name
  const parts = rel.split('/').filter(Boolean)
  if (parts.length >= 2) return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
  return rel
}

function tabExtClass(name, tab) {
  if (tab && isExtensionTab(tab)) return 'tab-ext-extension'
  if (tab && isBrowserTab(tab)) return 'tab-ext-browser'
  if (tab && isImageTab(tab)) return 'tab-ext-image'
  const ext = String(name || '').split('.').pop()?.toLowerCase() || ''
  if (['js', 'mjs', 'cjs', 'jsx'].includes(ext)) return 'tab-ext-js'
  if (['ts', 'tsx'].includes(ext)) return 'tab-ext-ts'
  if (ext === 'json') return 'tab-ext-json'
  if (['md', 'markdown'].includes(ext)) return 'tab-ext-md'
  if (window.SoumtokEnvEditor?.isDotEnvFileName?.(name)) return 'tab-ext-env'
  return 'tab-ext-file'
}

function updateTabScrollControls() {
  const tabs = $('tabs')
  const viewport = $('tabs-scroll-viewport')
  const prev = $('tabs-scroll-prev')
  const next = $('tabs-scroll-next')
  if (!tabs) return
  if (!state.tabs.length) return
  const maxScroll = tabs.scrollWidth - tabs.clientWidth
  const canScroll = maxScroll > 2
  const canLeft = tabs.scrollLeft > 2
  const canRight = tabs.scrollLeft < maxScroll - 2
  viewport?.classList.toggle('can-scroll-left', canScroll && canLeft)
  viewport?.classList.toggle('can-scroll-right', canScroll && canRight)
  if (prev) prev.hidden = !canScroll || !canLeft
  if (next) next.hidden = !canScroll || !canRight
}

function scrollActiveTabIntoView() {
  const tabs = $('tabs')
  const active = tabs?.querySelector('.file-tab.on')
  if (!active || !tabs) return
  const pad = 12
  const tabLeft = active.offsetLeft
  const tabRight = tabLeft + active.offsetWidth
  const viewLeft = tabs.scrollLeft
  const viewRight = viewLeft + tabs.clientWidth
  if (tabLeft < viewLeft + pad) {
    tabs.scrollLeft = Math.max(0, tabLeft - pad)
  } else if (tabRight > viewRight - pad) {
    tabs.scrollLeft = tabRight - tabs.clientWidth + pad
  }
}

let tabScrollBound = false
function bindTabScroll() {
  if (tabScrollBound) return
  tabScrollBound = true
  const tabs = $('tabs')
  const prev = $('tabs-scroll-prev')
  const next = $('tabs-scroll-next')
  if (!tabs) return
  tabs.addEventListener('scroll', () => updateTabScrollControls(), { passive: true })
  window.addEventListener('resize', () => updateTabScrollControls())
  prev?.addEventListener('click', () => tabs.scrollBy({ left: -Math.max(120, tabs.clientWidth * 0.45), behavior: 'smooth' }))
  next?.addEventListener('click', () => tabs.scrollBy({ left: Math.max(120, tabs.clientWidth * 0.45), behavior: 'smooth' }))
  tabs.addEventListener(
    'wheel',
    (event) => {
      if (state.tabs.length < 2) return
      const max = tabs.scrollWidth - tabs.clientWidth
      if (max <= 0) return
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (!delta) return
      tabs.scrollLeft += delta
      event.preventDefault()
      updateTabScrollControls()
    },
    { passive: false },
  )
}

function renderTabs() {
  dedupeTabs()
  const bar = $('tabs')
  const tabsBar = $('tabs-bar')
  if (!bar) return
  const show = state.tabs.length > 0
  if (tabsBar) tabsBar.style.display = show ? 'flex' : 'none'
  bar.style.display = show ? 'flex' : 'none'
  bar.innerHTML = state.tabs
    .map(
      (tab) => {
        const label = tabDisplayLabel(tab, state.tabs)
        const extCls = tabExtClass(tab.name, tab)
        const dirty = state.dirty.get(tab.path) ? ' tab-dirty' : ''
        return `<button type="button" class="file-tab ${extCls}${dirty} ${sameFilePath(tab.path, state.active) ? 'on' : ''} ${state.agentLiveFile && normPath(tab.path) === normPath(state.agentLiveFile.path) ? 'agent-reading' : ''}" data-path="${escapeAttr(tab.path)}" title="${escapeAttr(tab.path)}">
          <span class="tab-icon" aria-hidden="true"></span>
          <span class="tab-label">${escapeHtml(label)}</span>
          <span class="tab-close" data-close="${escapeAttr(tab.path)}" title="Close" aria-label="Close">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>
          </span>
        </button>`
      },
    )
    .join('')
  $('tabs').querySelectorAll('.file-tab').forEach((btn) => {
    btn.onclick = (event) => {
      if (event.target.closest('.tab-close')) return
      state.active = btn.dataset.path
      renderTabs()
      renderEditor()
      syncExplorerSelection()
    }
  })
  $('tabs').querySelectorAll('.tab-close').forEach((btn) => {
    btn.onclick = (event) => closeTab(btn.dataset.close, event)
  })
  syncExplorerSelection()
  requestAnimationFrame(() => {
    scrollActiveTabIntoView()
    updateTabScrollControls()
  })
}

function welcomeHtml() {
  const mod = navigator.platform.startsWith('Mac') ? 'Cmd' : 'Ctrl'
  return `<div id="welcome">
    <div class="welcome-watermark" aria-hidden="true">
      <img src="../../resources/icon.png" alt="" />
    </div>
    <ul class="welcome-keys">
      <li><span class="wk-action">New Agent</span><span class="wk-bind">${mod} + Shift + L</span></li>
      <li><span class="wk-action">Show Terminal</span><span class="wk-bind">${mod} + J</span></li>
      <li><span class="wk-action">Search Files</span><span class="wk-bind">${mod} + P</span></li>
      <li><span class="wk-action">Command Palette</span><span class="wk-bind">${mod} + Shift + P</span></li>
      <li><span class="wk-action">Save File</span><span class="wk-bind">${mod} + S</span></li>
    </ul>
  </div>`
}

function renderImageEditor(tab) {
  const host = $('editor')
  if (!host) return
  if (state.editor) {
    state.editor.dispose()
    state.editor = null
  }
  if (state.editorModel) {
    state.editorModel.dispose()
    state.editorModel = null
  }
  host.classList.remove('editor-monaco-host', 'simple-browser-host', 'ext-editor-host', 'soumtok-code-host')
  host.classList.add('image-editor-host')
  const kb = tab.mediaSize ? `${Math.max(1, Math.round(tab.mediaSize / 1024))} KB` : ''
  const src = tab.dataUrl || ''
  const body = src
    ? `<button type="button" class="image-editor-shot" data-full="${escapeAttr(src)}" title="Open image">
         <img src="${escapeAttr(src)}" alt="${escapeAttr(tab.name || 'image')}" />
       </button>`
    : `<p class="image-editor-error">${escapeHtml(tab.mediaError || 'Could not open image')}</p>`
  host.innerHTML = `<div class="image-editor">
    <div class="image-editor-bar">
      <span class="image-editor-name" title="${escapeAttr(tab.path || tab.name)}">${escapeHtml(tab.name || 'image')}</span>
      <span class="image-editor-meta">${escapeHtml(kb)}</span>
    </div>
    <div class="image-editor-stage">${body}</div>
  </div>`
  host.querySelector('.image-editor-shot')?.addEventListener('click', () => {
    if (src) openAgentImageLightbox(src)
  })
}

function renderEditorFallbackPreview(tab) {
  const host = $('editor')
  if (!host) return
  const lang = languageFor(tab.name)
  host.innerHTML = `<div class="editor-fallback-preview agent-file-card agent-file-card-${escapeAttr(lang)}">
    <div class="agent-file-card-head"><span class="agent-file-card-name">${escapeHtml(tab.name)}</span><span class="agent-file-card-meta">Loading editor…</span></div>
    <pre class="agent-code agent-code-file"><code>${escapeHtml(String(tab.text || '').slice(0, 80_000))}</code></pre>
  </div>`
}

function renderEditor() {
  const hostEl = $('editor')
  const tab = activeEditorTab()
  if (tab && isExtensionHostTab(tab)) {
    // Extensions moved into the side dock — drop host tabs left over from older sessions.
    state.tabs = state.tabs.filter((t) => !isExtensionHostTab(t))
    state.active = state.tabs[state.tabs.length - 1]?.path || null
    renderTabs()
    renderEditor()
    return
  }
  if (extensionDockOpen()) {
    if (extensionHostViewActive()) void syncExtensionHostViewBounds()
  } else {
    void hideExtensionHostViewIfNeeded()
    scheduleExtensionHostIdleStop()
  }
  hostEl?.classList.remove('soumtok-code-host')
  if (tab && isBrowserTab(tab)) {
    renderSimpleBrowser(tab)
    return
  }
  hostEl?.classList.remove('simple-browser-host')
  if (tab && isExtensionTab(tab)) {
    renderExtensionDetailPane(tab)
    return
  }
  hostEl?.classList.remove('ext-editor-host')
  if (tab && isImageTab(tab)) {
    if (!tab.dataUrl && !tab.mediaError && tab.path) {
      void loadImageTab(tab).then(() => renderEditor())
      return
    }
    renderImageEditor(tab)
    return
  }
  hostEl?.classList.remove('image-editor-host')
  if (tab && isDotEnvTab(tab) && tab.envEditorMode !== 'text' && window.SoumtokEnvEditor) {
    if (state.editor) {
      state.editor.dispose()
      state.editor = null
    }
    if (state.editorModel) {
      state.editorModel.dispose()
      state.editorModel = null
    }
    const host = $('editor')
    window.SoumtokEnvEditor.render(host, tab, {
      onDirty() {
        state.dirty.set(tab.path, true)
        renderTabs()
      },
      onSave: () => saveActive(),
      onRenderText() {
        renderEditor()
      },
    })
    return
  }
  if (!tab) {
    if (state.editor) {
      state.editor.dispose()
      state.editor = null
    }
    if (state.editorModel) {
      state.editorModel.dispose()
      state.editorModel = null
    }
    const projectOpen = Boolean(state.folder) && document.body.classList.contains('mode-project')
    hostEl?.classList.remove('image-editor-host', 'editor-monaco-host')
    if (projectOpen) {
      $('editor').innerHTML = welcomeHtml()
    } else {
      $('editor').innerHTML = `<div id="empty"><p class="empty-title">Open a folder to start coding.</p><p style="margin-top:16px"><button class="primary" id="empty-open">Open folder</button></p></div>`
      $('empty-open').onclick = openFolder
    }
    return
  }
  if (!state.monacoReady || !window.monaco) {
    renderEditorFallbackPreview(tab)
    void ensureMonacoReady().then(() => renderEditor())
    return
  }
  const host = $('editor')
  if (!host) return
  host.classList.remove('simple-browser-host', 'image-editor-host')
  if (state.editor && state.editor.getDomNode()?.parentElement !== host) {
    state.editor.dispose()
    state.editor = null
  }
  const lang = isDotEnvTab(tab) ? 'plaintext' : languageFor(tab.name)
  const readOnly = Boolean(tab.agentPeek && state.agentBusy)
  if (isDotEnvTab(tab) && tab.envEditorMode === 'text') {
    delete tab.envPairs
    delete tab.envComments
  }
  if (!state.editor) {
    host.innerHTML = ''
    host.classList.add('editor-monaco-host')
    state.editor = window.monaco.editor.create(host, {
      value: tab.text,
      language: lang,
      theme: monacoThemeId(),
      automaticLayout: true,
      fontSize: state.editorFontSize,
      minimap: { enabled: true },
      smoothScrolling: true,
      readOnly,
      scrollBeyondLastLine: false,
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true },
      colorDecorators: true,
      padding: EDITOR_VIEW_PADDING,
      lineNumbersMinChars: 3,
      inlineSuggest: { enabled: true, mode: 'prefix', suppressSuggestions: false },
      quickSuggestions: { other: true, comments: false, strings: false },
      tabCompletion: 'on',
    })
    state.editor.onDidChangeModelContent((e) => {
      const current = activeEditorTab()
      if (current) {
        current.text = state.editor.getValue()
        state.dirty.set(current.path, true)
        renderTabs()
        scheduleAutoSaveIfEnabled()
      }
      for (const ch of e.changes || []) {
        if (ch.text && ch.text.length > 2) window.SoumtokEditorAi?.noteTabAccepted?.(ch.text)
      }
    })
    state.editor.onDidChangeCursorPosition((e) => {
      state.editorCursor = { line: e.position.lineNumber, column: e.position.column }
      syncEditorStatusItems()
    })
    if (window.SoumtokEditorAi) window.SoumtokEditorAi.registerProviders(window.monaco)
  } else {
    host.classList.add('editor-monaco-host')
    if (state.editorModel) {
      state.editorModel.dispose()
      state.editorModel = null
    }
    const uri = window.monaco.Uri.file(tab.path.replace(/\\/g, '/'))
    state.editorModel = window.monaco.editor.createModel(tab.text, lang, uri)
    state.editor.setModel(state.editorModel)
    state.editor.updateOptions({
      readOnly,
      padding: EDITOR_VIEW_PADDING,
      inlineSuggest: { enabled: true, mode: 'prefix' },
    })
  }
  state.editor.layout()
  const pos = state.editor.getPosition()
  if (pos) state.editorCursor = { line: pos.lineNumber, column: pos.column }
  syncEditorStatusItems()
  window.SoumtokLspBridge?.onEditorRender?.(host, tab, lang)
  if (
    state.agentBusy &&
    state.agentLiveFile &&
    normPath(tab.path) === normPath(state.agentLiveFile.path)
  ) {
    requestAnimationFrame(() => animateAgentReadScan())
  }
}

function languageFor(name) {
  const base = String(name || '').toLowerCase()
  const ext = base.includes('.') ? base.split('.').pop() : base
  const map = {
    js: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    jsx: 'javascript',
    json: 'json',
    css: 'css',
    scss: 'scss',
    html: 'html',
    htm: 'html',
    md: 'markdown',
    markdown: 'markdown',
    py: 'python',
    rs: 'rust',
    go: 'go',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'toml',
    xml: 'xml',
    sh: 'shell',
    bash: 'shell',
  }
  if (base === 'dockerfile') return 'dockerfile'
  if (base.endsWith('.d.ts')) return 'typescript'
  return map[ext] || 'plaintext'
}

async function saveActive() {
  const tab = activeEditorTab()
  if (!tab) return
  if (isBrowserTab(tab) || isExtensionTab(tab) || isImageTab(tab)) return
  if (tab.untitled || String(tab.path || '').startsWith('untitled:')) {
    await saveActiveAs()
    return
  }
  if (isDotEnvTab(tab) && tab.envEditorMode !== 'text' && tab.envPairs) {
    tab.text = window.SoumtokEnvEditor.serializeDotEnv(tab.envComments, tab.envPairs)
  } else if (!state.editor) return
  else tab.text = state.editor.getValue()
  await api.writeFile(tab.path, tab.text)
  state.dirty.delete(tab.path)
  renderTabs()
  void refreshGit()
}

function togglePanel() {
  if (!requireUser()) return
  enterWorkbench()
  if (isPanelOpen()) setPanelOpen(false)
  else showPanel(document.querySelector('#panel-bar .panel-tab.on')?.dataset.panel || 'terminal')
}

const GIT_GH_ICON =
  '<svg class="git-scm-gh-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.18.82.63-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.51-1.04 2.18-.82 2.18-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>'

function gitScmHeadRow() {
  return `<div class="git-scm-head-row">
    <span class="git-scm-subhead">Changes</span>
    <button type="button" class="git-scm-refresh" id="git-refresh" title="Refresh">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
    </button>
  </div>`
}

function gitChangeRow(c) {
  const full = c.path || ''
  const base = full.split(/[/\\]/).pop() || full
  const parts = full.replace(/\\/g, '/').split('/')
  parts.pop()
  const dir = parts.length ? parts[parts.length - 1] : ''
  const code = c.code || 'M'
  return `<button type="button" class="git-scm-change" data-path="${escapeAttr(full)}">
    <span class="git-scm-change-code git-scm-code-${escapeAttr(code)}">${escapeHtml(code)}</span>
    <span class="git-scm-change-meta">
      <span class="git-scm-path-base">${escapeHtml(base)}</span>
      ${dir ? `<span class="git-scm-path-dir">${escapeHtml(dir)}</span>` : ''}
    </span>
  </button>`
}

function gitPanelHtml(git) {
  if (!git.hasFolder) {
    return `${gitScmHeadRow()}
    <div class="git-scm-block">
      <p class="git-scm-copy">Open a git repository to see the branch.</p>
      <button type="button" class="git-scm-btn git-scm-btn-outline" id="git-open-folder">Open Folder</button>
    </div>`
  }
  if (!git.isRepo) {
    return `${gitScmHeadRow()}
    <div class="git-scm-block">
      <p class="git-scm-copy">The folder currently open doesn't have a Git repository. You can initialize a repository which will enable source control features powered by Git.</p>
      <button type="button" class="git-scm-btn" id="git-init">Initialize Repository</button>
      <p class="git-scm-link-note">To learn more about how to use Git and source control in Soumtok <button type="button" class="git-scm-link" id="git-docs">read our docs</button>.</p>
    </div>
    <div class="git-scm-block git-scm-block-spaced">
      <p class="git-scm-copy">You can directly publish this folder to a GitHub repository. Once published, you'll have access to source control features powered by Git and GitHub.</p>
      <button type="button" class="git-scm-btn git-scm-btn-github" id="git-publish">${GIT_GH_ICON}Publish to GitHub</button>
    </div>`
  }
  const changes = git.changes || []
  const list = changes.length
    ? changes.map(gitChangeRow).join('')
    : `<p class="git-scm-muted git-scm-empty">No changes</p>`
  return `${gitScmHeadRow()}
    <div class="git-scm-block">
      <div class="git-scm-commit-row">
        <input type="text" class="git-scm-commit-input" id="git-commit-msg" placeholder="Message (Ctrl+Enter to commit)" autocomplete="off" spellcheck="true" />
        <button type="button" class="git-scm-btn git-scm-btn-commit" id="git-commit">Commit</button>
      </div>
      <div class="git-scm-changes">${list}</div>
    </div>
    <div class="git-scm-block git-scm-block-spaced">
      <button type="button" class="git-scm-btn git-scm-btn-github" id="git-publish">${GIT_GH_ICON}Publish to GitHub</button>
    </div>`
}

function bindGitPanel() {
  document.getElementById('git-open-folder')?.addEventListener('click', () => openFolder('git'))
  document.getElementById('git-init')?.addEventListener('click', async () => {
    const res = await api.gitInit(gitWorkspaceHint())
    if (res?.error) showGitError(res.error)
    else await paintGitPanel()
  })
  document.getElementById('git-docs')?.addEventListener('click', () => api.openHelp())
  document.getElementById('git-publish')?.addEventListener('click', async () => {
    const btn = document.getElementById('git-publish')
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Publishing…'
    }
    try {
      const res = await api.gitPublish(gitWorkspaceHint())
      if (res?.error && !res.opened) showGitError(res.error)
      else if (res?.hint) showGitError(res.hint)
      else if (res?.ok) {
        showGitError(res.fullName ? `Published to ${res.fullName}` : 'Published to GitHub.')
      }
    } finally {
      await paintGitPanel()
    }
  })
  document.getElementById('git-commit')?.addEventListener('click', () => void doGitCommit())
  document.getElementById('git-commit-msg')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void doGitCommit()
    }
  })
  document.querySelectorAll('.git-scm-change').forEach((btn) => {
    btn.onclick = () => {
      const full = btn.dataset.path
      if (full) openFile({ path: full, name: full.split(/[/\\]/).pop() || full })
    }
  })
  document.getElementById('git-refresh')?.addEventListener('click', () => void paintGitPanel())
}

function showGitError(message) {
  const box = document.getElementById('git-body')
  if (!box) return
  let err = box.querySelector('.git-scm-error')
  if (!err) {
    err = document.createElement('p')
    err.className = 'git-scm-error'
    box.appendChild(err)
  }
  err.textContent = String(message || '')
}

async function doGitCommit() {
  const msg = document.getElementById('git-commit-msg')?.value || ''
  const res = await api.gitCommit(msg, gitWorkspaceHint())
  if (res?.error) {
    showGitError(res.error)
    return
  }
  const input = document.getElementById('git-commit-msg')
  if (input) input.value = ''
  await paintGitPanel()
}

async function ensureFolderForGitPanel() {
  await ensureProjectFolder()
  const hint = gitWorkspaceHint()
  if (hint && !(await api.info()).folder) await api.openPath(hint)
  const data = await api.tree(state.workspaceExtraFolders)
  if (data.folder) {
    state.folder = data.folder
    state.tree = data.tree || []
    state.extraRoots = data.extraRoots || []
    $('tb-center').textContent = formatProjectName(data.name || '')
    if (!document.body.classList.contains('mode-project')) {
      setMode('project')
      document.body.classList.remove('agent-off')
      applyAgentDriverUi()
      window.SoumtokTerminal?.setProjectCwd(data.folder)
    }
  } else if (hint) {
    state.folder = hint
  }
  return state.folder || data.folder || hint
}

async function paintGitPanel() {
  const box = document.getElementById('git-body')
  if (!box) return
  box.innerHTML = `<p class="git-scm-muted">Loading…</p>`
  let git
  try {
    const workspace = await ensureFolderForGitPanel()
    git = await api.gitStatus(workspace || gitWorkspaceHint())
  } catch {
    box.innerHTML = `<p class="git-scm-muted">Could not read Git status.</p>`
    return
  }
  box.innerHTML = gitPanelHtml(git)
  bindGitPanel()
  applyGitStatusToState(git)
}

function applyGitStatusToState(git) {
  state.gitSnapshot = git || null
  const el = $('st-branch')
  if (!el) return
  if (!git?.hasFolder) {
    el.textContent = 'No folder'
    el.title = 'Open a folder for Git'
    return
  }
  if (!git.isRepo) {
    el.textContent = 'No repository'
    el.title = 'Initialize Git in this folder'
    return
  }
  const branch = git.branch || 'HEAD'
  const dirty = Number(git.dirty) || 0
  el.textContent = dirty ? `${branch}* (${dirty})` : branch
  el.title = dirty ? `${branch} — ${dirty} changed file(s)` : `${branch} — clean working tree`
}

async function refreshGit() {
  await ensureProjectFolder()
  try {
    const git = await api.gitStatus(gitWorkspaceHint())
    applyGitStatusToState(git)
    if (state.side === 'git') await paintGitPanel()
  } catch {
    applyGitStatusToState({ hasFolder: Boolean(state.folder), isRepo: false, branch: '', dirty: 0 })
  }
}

function flatten(nodes, out = []) {
  for (const node of nodes || []) {
    out.push(node)
    if (node.children?.length) flatten(node.children, out)
  }
  return out
}

function tabCompletionsEnabled() {
  if (!state.agentPrefs) loadAgentPrefs()
  return state.agentPrefs?.tabCompletions !== false
}

function toggleTabCompletionsFromStatus() {
  if (!requireUser()) return
  if (!state.agentPrefs) loadAgentPrefs()
  const next = !tabCompletionsEnabled()
  setAgentPref('tabCompletions', next)
  window.SoumtokEditorAi?.setTabEnabled?.(next)
  updateStatus()
}

function statusModelLabel() {
  const id = state.agentModel || 'auto'
  const hit = state.modelOptions?.find((m) => m.id === id)
  if (hit?.name) return hit.name.length > 22 ? `${hit.name.slice(0, 20)}…` : hit.name
  return PROVIDER_NAMES[id] || id
}

function languageLabelForTab(tab) {
  if (isImageTab(tab)) return 'Image'
  if (!tab?.name) return 'Plain Text'
  const lang = languageFor(tab.name)
  const labels = {
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    plaintext: 'Plain Text',
    markdown: 'Markdown',
    python: 'Python',
    json: 'JSON',
    css: 'CSS',
    html: 'HTML',
  }
  return labels[lang] || lang
}

function syncEditorStatusItems() {
  const tab = activeEditorTab()
  const curBtn = $('st-cursor')
  const langBtn = $('st-lang')
  const inCode = tab && !isExtensionTab(tab) && !isBrowserTab(tab) && !isImageTab(tab) && state.editor
  if (curBtn) {
    if (inCode) {
      curBtn.hidden = false
      const { line, column } = state.editorCursor
      curBtn.textContent = `Ln ${line}, Col ${column}`
    } else curBtn.hidden = true
  }
  if (langBtn) {
    if (isImageTab(tab)) {
      langBtn.hidden = false
      langBtn.textContent = 'Image'
    } else if (inCode) {
      langBtn.hidden = false
      langBtn.textContent = languageLabelForTab(tab)
    } else langBtn.hidden = true
  }
}

async function goToLineFromStatus() {
  if (!state.editor) return
  const pos = state.editor.getPosition()
  const current = pos ? pos.lineNumber : 1
  const raw = await askPrompt('Go to line', String(current))
  if (raw == null) return
  const n = Math.max(1, parseInt(String(raw).trim(), 10) || 1)
  const model = state.editor.getModel()
  const line = model ? Math.min(n, model.getLineCount()) : n
  state.editor.setPosition({ lineNumber: line, column: 1 })
  state.editor.revealLineInCenter(line)
  state.editor.focus()
}

function renderProblemsPanel() {
  const box = $('problems-list')
  if (!box) return
  if (!window.monaco) {
    box.innerHTML = `<p class="problems-empty">Open a file in the editor to see diagnostics.</p>`
    return
  }
  const sev = window.monaco.MarkerSeverity
  const marks = window.monaco.editor
    .getModelMarkers({})
    .filter((m) => m.severity === sev.Error || m.severity === sev.Warning)
    .sort((a, b) => {
      const pa = String(a.resource?.path || a.resource?.fsPath || '')
      const pb = String(b.resource?.path || b.resource?.fsPath || '')
      if (pa !== pb) return pa.localeCompare(pb)
      return (a.startLineNumber || 0) - (b.startLineNumber || 0)
    })
  if (!marks.length) {
    box.innerHTML = `<p class="problems-empty">No problems have been detected in the workspace.</p>`
    $('problems-collapse-all')?.setAttribute('disabled', '')
    $('problems-collapse-all')?.setAttribute('title', 'Collapse All (no problems)')
    return
  }
  $('problems-collapse-all')?.removeAttribute('disabled')
  $('problems-collapse-all')?.setAttribute('title', 'Collapse All')
  box.innerHTML = marks
    .map((m, i) => {
      const err = m.severity === sev.Error
      const path = decodeURIComponent(String(m.resource?.path || m.resource?.fsPath || '').replace(/^file:\/\//, ''))
      const file = path.split(/[/\\]/).pop() || path
      const loc = `${file}:${m.startLineNumber}:${m.startColumn}`
      return `<button type="button" class="problem-row" data-problem-idx="${i}">
        <span class="problem-sev ${err ? 'err' : 'warn'}" aria-hidden="true">${err ? '✕' : '⚠'}</span>
        <span class="problem-msg">${escapeHtml(m.message || 'Diagnostic')}</span>
        <span class="problem-loc">${escapeHtml(loc)}</span>
      </button>`
    })
    .join('')
  box._problemMarks = marks
  box.querySelectorAll('.problem-row').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.problemIdx)
      const m = box._problemMarks?.[idx]
      if (!m) return
      const path = decodeURIComponent(String(m.resource?.path || m.resource?.fsPath || '').replace(/^file:\/\//, ''))
      if (path) {
        void openFile({ path, name: path.split(/[/\\]/).pop() || path }).then(() => {
          requestAnimationFrame(() => {
            if (!state.editor) return
            state.editor.setPosition({
              lineNumber: m.startLineNumber || 1,
              column: m.startColumn || 1,
            })
            state.editor.revealLineInCenter(m.startLineNumber || 1)
            state.editor.focus()
          })
        })
      }
    }
  })
}

function updateStatus() {
  if (!state.agentPrefs) loadAgentPrefs()
  const tabOn = tabCompletionsEnabled()
  const tabStats = window.SoumtokEditorAi?.getTabStats?.() || { offered: 0, accepted: 0 }
  const tabEl = $('st-tab')
  if (tabEl) {
    if (!tabOn) tabEl.textContent = 'Off'
    else if (tabStats.offered) {
      const pct = Math.round((tabStats.accepted / tabStats.offered) * 100)
      tabEl.textContent = `${tabStats.accepted}/${tabStats.offered} (${pct}%)`
    } else tabEl.textContent = 'On'
  }
  const tabBtn = $('st-tab-btn')
  if (tabBtn) tabBtn.title = tabOn ? 'Tab completions on (click to turn off)' : 'Tab completions off (click to turn on)'

  ensureThreads()
  const agentEl = $('st-agent')
  if (agentEl) {
    if (state.agentBusy || activeThreadIsRunning()) {
      const live = agentLiveStatusFromState() || 'Running…'
      agentEl.textContent = live.length > 36 ? `${live.slice(0, 34)}…` : live
    } else if (state.agentOutbox?.length) agentEl.textContent = `Queued ${state.agentOutbox.length}`
    else agentEl.textContent = 'Idle'
  }
  const modelEl = $('st-model')
  if (modelEl) modelEl.textContent = statusModelLabel()

  $('st-err-count').textContent = String(errors)
  $('st-warn-count').textContent = String(warnings)
  const errBtn = $('st-errors')
  const warnBtn = $('st-warnings')
  if (errBtn) errBtn.title = errors ? `${errors} error(s) — open Problems` : 'No errors'
  if (warnBtn) warnBtn.title = warnings ? `${warnings} warning(s) — open Problems` : 'No warnings'
  syncEditorStatusItems()
  renderProblemsPanel()
}

function countMarkers() {
  if (!window.monaco) return
  const marks = window.monaco.editor.getModelMarkers({})
  errors = marks.filter((m) => m.severity === window.monaco.MarkerSeverity.Error).length
  warnings = marks.filter((m) => m.severity === window.monaco.MarkerSeverity.Warning).length
  updateStatus()
}

function agentToolStepLabel(name, args) {
  const n = String(name || '').toLowerCase()
  const a = args || {}
  if (n === 'read' || n === 'read_file') {
    return { badge: 'read', label: 'Read', detail: a.path || a.file || '' }
  }
  if (n === 'list_dir' || n === 'list') {
    return { badge: 'list', label: 'Explored', detail: a.path || a.dir || '.' }
  }
  if (n === 'grep' || n === 'glob' || n === 'codebase_search') {
    return { badge: 'grep', label: n === 'codebase_search' ? 'Searched' : 'Searched', detail: a.pattern || a.query || a.glob || '' }
  }
  if (n === 'git') {
    return { badge: 'tool', label: 'Git', detail: a.action || a.command || 'status' }
  }
  if (n === 'browser' || n === 'browser_snapshot' || n === 'screenshot') {
    return { badge: 'grep', label: 'Looked', detail: a.url || a.action || 'page' }
  }
  if (n === 'read_skill') {
    return { badge: 'read', label: 'Skill', detail: a.name || a.skill || '' }
  }
  if (n === 'terminal' || n === 'shell' || n === 'read_terminal') {
    return { badge: 'terminal', label: 'Ran', detail: a.command || a.cmd || (n === 'read_terminal' ? 'terminal' : '') }
  }
  if (n === 'write') {
    return { badge: 'edit', label: 'Wrote', detail: a.path || a.file || '' }
  }
  if (n === 'diff' || n === 'edit' || n === 'str_replace' || n === 'apply_patch') {
    return { badge: 'edit', label: 'Edited', detail: a.path || a.file || '' }
  }
  if (n === 'delete' || n === 'wipe_workspace') {
    return { badge: 'edit', label: n === 'wipe_workspace' ? 'Cleared' : 'Deleted', detail: a.path || 'workspace' }
  }
  if (n === 'todo_write') {
    return { badge: 'tool', label: 'Plan', detail: '' }
  }
  if (n === 'fetch') {
    return { badge: 'grep', label: 'Fetched', detail: a.url || a.query || '' }
  }
  if (n === 'generate_image') {
    const ratio = String(a.aspect || a.aspect_ratio || a.ratio || '').trim()
    return { badge: 'edit', label: 'Generated', detail: ratio || String(a.prompt || a.path || '').slice(0, 48) }
  }
  return { badge: 'tool', label: name || 'Tool', detail: a.path || a.command || '' }
}

function scrubDsmlForDisplay(text) {
  let s = String(text || '').replace(/\uFF5C/g, '|')
  s = s.replace(/<([^>\n]*)>/g, (full) => {
    if (!/DSML/i.test(full)) return full.replace(/<\s+/g, '<').replace(/\s+>/g, '>')
    let t = full
    for (let i = 0; i < 16; i++) {
      const next = t.replace(/\s*\|\s*\|\s*/g, '|')
      if (next === t) break
      t = next
    }
    return t.replace(/<\s+/g, '<').replace(/\s+>/g, '>')
  })
  let prev = ''
  for (let i = 0; i < 12 && prev !== s; i++) {
    prev = s
    s = s.replace(/<\|DSML\|[^>]*>[\s\S]*?<\/\|DSML\|[^>]*>/gi, '')
  }
  s = s.replace(/<write\s+path=["'][^"']+["'][^>]*>[\s\S]*?<\/write>/gi, '')
  s = s.replace(/<read(?:\s[^>]*)?>[\s\S]*?<\/read>/gi, '')
  s = s.replace(/<(?:read|write|diff|terminal|read_terminal)\b[^>]*\/\s*>/gi, '')
  s = s.replace(/<terminal\b[\s\S]*?(?:\/>|><\/terminal>)/gi, '')
  s = s.replace(/<read_terminal\b[\s\S]*?(?:\/>|><\/read_terminal>)/gi, '')
  s = s.replace(/<diff\b[^>]*>[\s\S]*?(?:<\/diff>|\*\*\*\s*End Patch)/gi, '')
  s = s.replace(/<diff\b[^>]*>[\s\S]*$/gi, '')
  s = s.replace(/^\s*@@.*$/gm, '')
  s = s.replace(/^\s*\*\*\*.*$/gm, '')
  s = s.replace(/<\|DSML\|[\s\S]*$/gi, '')
  s = s.replace(/<\|DSML\|[^>\n]*/gi, '')
  s = s.replace(/<\/\|DSML\|[^>\n]*/gi, '')
  return s.trim()
}

function agentMarkdownLooksLikePath(inner) {
  const t = String(inner || '').trim()
  if (!t || /\s/.test(t) || /^https?:\/\//i.test(t)) return false
  if (!/[/\\]/.test(t) && !/\.(tsx?|jsx?|mjs|cjs|json|md|css|html|yml|yaml|env|toml)$/i.test(t)) return false
  return /^[\w@./\\-]+$/.test(t)
}

function formatAgentMarkdownInline(text, { breaks = false } = {}) {
  let s = escapeHtml(scrubDsmlForDisplay(text))
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const h = String(href || '').trim().replace(/&amp;/g, '&')
    const url = normalizeBrowserUrl(h) || (/^https?:\/\//i.test(h) ? h : '')
    if (url) {
      const u = escapeAttr(url)
      return `<a class="agent-md-link" href="${u}" data-href="${u}">${label}</a>`
    }
    if (state.folder && agentMarkdownLooksLikePath(h.replace(/&amp;/g, '&'))) {
      return `<button type="button" class="agent-md-link agent-path-link" data-agent-path="${escapeAttr(h)}">${label}</button>`
    }
    return `[${label}](${href})`
  })
  s = s.replace(/`([^`\n]+)`/g, (_, inner) => {
    if (state.folder && agentMarkdownLooksLikePath(inner)) {
      const rel = escapeAttr(inner.trim())
      return `<button type="button" class="agent-inline-code agent-path-link" data-agent-path="${rel}">${inner}</button>`
    }
    return `<code class="agent-inline-code">${inner}</code>`
  })
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
  s = s.replace(
    /(?<![\w/"'=])((?:https?:\/\/)?(?:localhost|127\.0\.0\.1):\d{2,5}(?:\/[\w./~%+-]*)?|https?:\/\/[^\s<"'*)\]]+)/gi,
    (url) => {
      const href = normalizeBrowserUrl(url)
      if (!href) return url
      const u = escapeAttr(href)
      return `<a class="agent-md-link" href="${u}" data-href="${u}">${url.replace(/\*+$/, '')}</a>`
    },
  )
  if (breaks) s = s.replace(/\n/g, '<br>')
  return s
}

function formatAgentMarkdownBlocks(text) {
  const lines = String(text || '').split('\n')
  const html = []
  let i = 0
  const isBlockStart = (line) =>
    /^#{1,6}\s/.test(line) ||
    /^(\s*)[-*•]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i++
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const level = Math.min(heading[1].length, 6)
      html.push(`<h${level} class="agent-md-h agent-md-h${level}">${formatAgentMarkdownInline(heading[2])}</h${level}>`)
      i++
      continue
    }
    if (/^(\s*)[-*•]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^(\s*)[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^(\s*)[-*•]\s+/, ''))
        i++
      }
      html.push(
        `<ul class="agent-md-ul">${items.map((row) => `<li class="agent-md-li">${formatAgentMarkdownInline(row)}</li>`).join('')}</ul>`,
      )
      continue
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i++
      }
      html.push(
        `<ol class="agent-md-ol">${items.map((row) => `<li class="agent-md-li">${formatAgentMarkdownInline(row)}</li>`).join('')}</ol>`,
      )
      continue
    }
    if (/^>\s?/.test(line)) {
      const quote = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      html.push(
        `<blockquote class="agent-md-quote">${formatAgentMarkdownInline(quote.join('\n'), { breaks: true })}</blockquote>`,
      )
      continue
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      html.push('<hr class="agent-md-hr">')
      i++
      continue
    }
    const para = []
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      para.push(lines[i])
      i++
    }
    if (para.length) {
      html.push(`<p class="agent-md-p">${formatAgentMarkdownInline(para.join('\n'), { breaks: true })}</p>`)
    }
  }
  return html.join('')
}

const AGENT_TOOL_DIGEST_MARK =
  /(?:Tool results on the user's machine:|\[Soumtok harness\]\s*LOCAL TOOL OUTPUT)/i

function splitAgentReplySections(text) {
  const raw = scrubDsmlForDisplay(text)
  const idx = raw.search(AGENT_TOOL_DIGEST_MARK)
  if (idx < 0) return { prose: raw.trim(), digest: '' }
  return { prose: raw.slice(0, idx).trim(), digest: raw.slice(idx).trim() }
}

function formatToolDigestSection(digest) {
  let body = String(digest || '')
    .replace(/^Tool results on the user's machine:\s*/i, '')
    .replace(/^\[Soumtok harness\]\s*LOCAL TOOL OUTPUT[^:\n]*:?\s*/i, '')
    .trim()
  if (!body) return ''
  const chunks = body.split(/\n---\n/)
  const cards = []
  for (const chunk of chunks) {
    const part = chunk.trim()
    if (!part) continue
    const m = part.match(/^\[([^\]]+)\]\s*\n([\s\S]*)$/)
    if (!m) continue
    const tool = m[1].toLowerCase()
    const payload = m[2].trim()
    if (tool === 'read' || tool === 'read_file') {
      const parsed = parseReadToolText(payload.includes(' lines)\n') ? payload : `file\n${payload}`)
      const rel = parsed.rel || payload.split('\n')[0] || 'file'
      const codeBody = parsed.body || ''
      const linesM = payload.match(/\((\d+) lines\)/)
      cards.push(agentFileCodeCard(rel, codeBody, linesM ? `${linesM[1]} lines` : ''))
      continue
    }
    if (tool === 'grep' || tool === 'terminal' || tool === 'shell') {
      const label = tool === 'grep' ? 'Search results' : 'Terminal output'
      cards.push(
        `<details class="agent-file-card agent-digest-card">
          <summary class="agent-file-card-head"><span class="agent-file-card-chev"></span><span class="agent-file-card-name">${escapeHtml(label)}</span></summary>
          <pre class="agent-code agent-code-out"><code>${escapeHtml(payload.slice(0, 8000))}</code></pre>
        </details>`,
      )
      continue
    }
    cards.push(
      `<details class="agent-file-card agent-digest-card">
        <summary class="agent-file-card-head"><span class="agent-file-card-chev"></span><span class="agent-file-card-name">${escapeHtml(tool)}</span></summary>
        <pre class="agent-code agent-code-out"><code>${escapeHtml(payload.slice(0, 4000))}</code></pre>
      </details>`,
    )
  }
  if (!cards.length) return ''
  return `<div class="agent-tool-digest" aria-label="Tool output">${cards.join('')}</div>`
}

function formatAgentReplyHtml(text) {
  const { prose, digest } = splitAgentReplySections(text)
  let html = ''
  if (prose) html += formatAgentMarkdown(prose)
  if (digest) html += formatToolDigestSection(digest)
  if (!html) html = formatAgentMarkdown(String(text || ''))
  return html
}

function formatAgentMarkdown(text) {
  const raw = String(text || '')
  const re = /```([\w.-]*)\n([\s\S]*?)```/g
  let out = ''
  let last = 0
  let m
  while ((m = re.exec(raw))) {
    out += formatAgentMarkdownBlocks(raw.slice(last, m.index))
    let langRaw = (m[1] || '').trim()
    let diffStats = ''
    const statMatch = langRaw.match(/^(.+?)\s+\+(\d+)\s+-(\d+)\s*$/)
    if (statMatch) {
      langRaw = statMatch[1].replace(/^#+\s*/, '')
      diffStats = agentDiffStatHtml(Number(statMatch[2]), Number(statMatch[3]))
    }
    const langTag = langRaw.toLowerCase()
    const langLabel = langRaw ? escapeHtml(langRaw.replace(/^#+\s*/, '')) : ''
    const lang = langLabel
      ? `<span class="agent-md-block-head"><span class="agent-code-lang">${langLabel}</span>${diffStats}</span>`
      : diffStats
    const hl = highlightAgentCode(m[2].trimEnd(), langTag || 'text')
    out += `<div class="agent-md-block">${lang}<pre class="agent-code agent-md-code"><code>${hl}</code></pre></div>`
    last = m.index + m[0].length
  }
  out += formatAgentMarkdownBlocks(raw.slice(last))
  return `<div class="agent-md-doc">${out}</div>`
}

function agentToolStepHtml(item) {
  const meta = agentToolStepLabel(item.toolName || item.name, item.args)
  const detail = meta.detail ? `<span class="agent-step-path">${escapeHtml(meta.detail)}</span>` : ''
  return `<div class="agent-step">
    <div class="agent-step-head">
      <span class="agent-step-badge ${escapeAttr(meta.badge)}">${escapeHtml(meta.label)}</span>
      ${detail}
    </div>
  </div>`
}

function codeLangFromPath(pathOrHead) {
  const s = String(pathOrHead || '').toLowerCase()
  if (s.endsWith('.json')) return 'json'
  if (s.endsWith('.md') || s.endsWith('.markdown')) return 'markdown'
  if (s.endsWith('.ts') || s.endsWith('.tsx')) return 'typescript'
  if (s.endsWith('.js') || s.endsWith('.jsx') || s.endsWith('.mjs')) return 'javascript'
  if (s.endsWith('.py')) return 'python'
  if (s.endsWith('.css')) return 'css'
  if (s.endsWith('.html')) return 'html'
  return 'text'
}

function highlightJsonCode(text) {
  let s = escapeHtml(text)
  s = s.replace(/"((?:\\.|[^"\\])*)"(?=\s*:)/g, (_, key) => `<span class="hl-key">"${key}"</span>`)
  s = s.replace(/(:\s*)"((?:\\.|[^"\\])*)"/g, (_, pre, val) => `${pre}<span class="hl-str">"${val}"</span>`)
  s = s.replace(/\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, '<span class="hl-num">$1</span>')
  s = s.replace(/\b(true|false|null)\b/g, '<span class="hl-lit">$1</span>')
  return s
}

function highlightMarkdownFileCode(text) {
  let s = escapeHtml(text)
  s = s.replace(/^(#{1,6}\s.+)$/gm, '<span class="hl-md-h">$1</span>')
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<span class="hl-md-strong">$1</span>')
  s = s.replace(/`([^`\n]+)`/g, '<span class="hl-md-code">`$1`</span>')
  s = s.replace(/^\s*[-*]\s+/gm, '<span class="hl-md-bullet">• </span>')
  return s
}

function highlightJsLikeCode(text) {
  let s = escapeHtml(text)
  s = s.replace(/^(\+[^\n]*)$/gm, '<span class="diff-add-line">$1</span>')
  s = s.replace(/^(-[^\n]*)$/gm, '<span class="diff-del-line">$1</span>')
  s = s.replace(
    /\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (m) => `<span class="hl-cmt">${m}</span>`,
  )
  s = s.replace(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g,
    (m) => `<span class="hl-str">${m}</span>`,
  )
  s = s.replace(
    /\b(const|let|var|function|return|import|export|from|async|await|class|if|else|for|while|try|catch|new|typeof|interface|type|extends|implements|public|private|readonly)\b/g,
    '<span class="hl-kw">$1</span>',
  )
  s = s.replace(/\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, '<span class="hl-num">$1</span>')
  return s
}

function highlightGenericCode(text) {
  let s = escapeHtml(text)
  s = s.replace(/^(\+[^\n]*)$/gm, '<span class="diff-add-line">$1</span>')
  s = s.replace(/^(-[^\n]*)$/gm, '<span class="diff-del-line">$1</span>')
  s = s.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (m) => `<span class="hl-str">${m}</span>`)
  s = s.replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="hl-num">$1</span>')
  return s
}

function normalizeHighlightLang(lang) {
  const l = String(lang || '').toLowerCase()
  if (l === 'json') return 'json'
  if (l === 'md' || l === 'markdown') return 'markdown'
  if (l === 'js' || l === 'jsx' || l === 'javascript') return 'javascript'
  if (l === 'ts' || l === 'tsx' || l === 'typescript') return 'typescript'
  if (l === 'py' || l === 'python') return 'python'
  return l || 'text'
}

function highlightAgentCode(body, lang) {
  const text = String(body || '').slice(0, 12_000)
  const kind = normalizeHighlightLang(lang)
  if (kind === 'json') return highlightJsonCode(text)
  if (kind === 'markdown') return highlightMarkdownFileCode(text)
  if (kind === 'javascript' || kind === 'typescript') return highlightJsLikeCode(text)
  if (kind === 'python') {
    let s = escapeHtml(text)
    s = s.replace(/#[^\n]*/g, (m) => `<span class="hl-cmt">${m}</span>`)
    s = s.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (m) => `<span class="hl-str">${m}</span>`)
    s = s.replace(
      /\b(def|class|import|from|return|if|elif|else|for|while|try|except|with|as|pass|None|True|False)\b/g,
      '<span class="hl-kw">$1</span>',
    )
    return s
  }
  return highlightGenericCode(text)
}

function agentDiffStatHtml(added, removed) {
  const a = Number(added) || 0
  const r = Number(removed) || 0
  if (!a && !r) return ''
  return `<span class="agent-diff-stats" aria-label="${a} lines added, ${r} lines removed"><span class="agent-diff-add">+${a}</span><span class="agent-diff-del">−${r}</span></span>`
}

function fileLangBadge(relPath) {
  const ext = String(relPath || '').split('.').pop()?.toLowerCase() || ''
  const map = {
    json: 'JSON',
    ts: 'TS',
    tsx: 'TS',
    js: 'JS',
    jsx: 'JS',
    mjs: 'JS',
    css: 'CSS',
    html: 'HTML',
    md: 'MD',
    py: 'PY',
  }
  return map[ext] || ext.toUpperCase().slice(0, 4)
}

function agentEditDiffCard(relPath, previewLines, added, removed) {
  const fullTitle = escapeHtml(relPath || 'file')
  const nameOnly = escapeHtml(String(relPath || 'file').split(/[/\\]/).pop() || 'file')
  const stats = agentDiffStatHtml(added, removed)
  const badge = fileLangBadge(relPath)
  const lines = Array.isArray(previewLines) ? previewLines : []
  const preview = lines.slice(0, 8)
  const body = preview.length
    ? preview
        .map((row, i) => {
          const type = row.type
          const text = row.text
          const cls = type === 'add' ? 'diff-add' : type === 'del' ? 'diff-del' : ''
          const gutter = type === 'add' ? '+' : type === 'del' ? '−' : ''
          const num = i + 1
          return `<div class="agent-diff-line ${cls}"><span class="agent-diff-ln">${num}</span><span class="agent-diff-gutter">${gutter}</span><code class="agent-diff-text">${escapeHtml(String(text ?? ''))}</code></div>`
        })
        .join('')
    : `<div class="agent-diff-line diff-muted"><span class="agent-diff-text">(No line preview)</span></div>`
  const more = lines.length > 8 ? `<div class="agent-diff-more">${lines.length - 8} more lines</div>` : ''
  return `<details class="agent-file-card agent-edit-card" open>
    <summary class="agent-file-card-head">
      <span class="agent-file-lang">${escapeHtml(badge)}</span>
      <span class="agent-file-card-name" title="${fullTitle}">${nameOnly}</span>
      ${stats}
    </summary>
    <div class="agent-diff-body">${body}${more}</div>
  </details>`
}

function agentShellCard(command, output, ok) {
  const cmd = String(command || '').trim()
  const out = String(output || '').slice(0, 6000)
  return `<div class="agent-shell-card ${ok === false ? 'is-error' : ''}">
    <div class="agent-shell-head">
      <span class="agent-shell-icon" aria-hidden="true">&gt;_</span>
      <span class="agent-shell-cmd" title="${escapeAttr(cmd)}">${escapeHtml(cmd || 'terminal')}</span>
    </div>
    ${out ? `<pre class="agent-shell-out"><code>${escapeHtml(out)}</code></pre>` : ''}
  </div>`
}

function agentFileCodeCard(relPath, body, linesLabel) {
  const lang = codeLangFromPath(relPath)
  const fullTitle = escapeHtml(relPath || 'file')
  const nameOnly = escapeHtml(String(relPath || 'file').split(/[/\\]/).pop() || 'file')
  const meta = linesLabel ? `<span class="agent-file-card-meta">${escapeHtml(linesLabel)}</span>` : ''
  const code = highlightAgentCode(body, lang)
  return `<details class="agent-file-card agent-file-card-${escapeAttr(lang)}">
    <summary class="agent-file-card-head">
      <span class="agent-file-card-chev" aria-hidden="true"></span>
      <span class="agent-file-card-name" title="${fullTitle}">${nameOnly}</span>
      ${meta}
    </summary>
    <pre class="agent-code agent-code-file"><code>${code}</code></pre>
  </details>`
}

function agentFileLeaf(pathOrHead) {
  const s = String(pathOrHead || '').trim()
  if (!s) return ''
  return s.split(/[/\\]/).pop() || s
}

function agentGeneratedImageCard(item) {
  const src = String(item.image || '')
  const rel = String(item.path || item.rel || '')
  const aspect = String(item.aspect || '1:1').trim() || '1:1'
  const [aw, ah] = aspect.split(':')
  const ratioCss = `${Number(aw) || 1} / ${Number(ah) || 1}`
  const running = Boolean(item.running)
  const img = src
    ? `<button type="button" class="agent-gen-frame" data-full="${escapeAttr(src)}" title="Open ${escapeAttr(aspect)} still" style="aspect-ratio:${ratioCss}">
         <img src="${escapeAttr(src)}" alt="${escapeAttr(rel || 'generated still')}" />
       </button>`
    : running
      ? `<div class="agent-gen-frame is-loading" style="aspect-ratio:${ratioCss}">
           <span class="agent-gen-skel" aria-hidden="true"></span>
         </div>`
      : ''
  const fileName = rel.split(/[/\\]/).pop() || rel
  const pathBtn = rel
    ? `<button type="button" class="agent-gen-path" data-agent-path="${escapeAttr(rel)}">${escapeHtml(fileName)}</button>`
    : ''
  const note = !src && !running && item.text ? `<pre class="agent-code agent-code-out"><code>${escapeHtml(String(item.text).slice(0, 400))}</code></pre>` : ''
  return `<article class="agent-gen-card${running ? ' is-loading' : ''}" data-aspect="${escapeAttr(aspect)}">
    <header class="agent-gen-card-head">
      <span class="agent-gen-card-label">${running ? 'Generating…' : 'Still'}</span>
      <span class="agent-gen-ratio">${escapeHtml(aspect)}</span>
    </header>
    ${img}
    ${pathBtn ? `<footer class="agent-gen-card-foot">${pathBtn}</footer>` : ''}
    ${note}
  </article>`
}

function agentWriteFileCard(relPath) {
  const full = String(relPath || 'file').replace(/\\/g, '/')
  const nameOnly = full.split('/').pop() || full
  return `<div class="agent-write-row">
    <span class="agent-write-verb">Wrote</span>
    <button type="button" class="agent-write-path" data-agent-path="${escapeAttr(full)}" title="${escapeAttr(full)}">${escapeHtml(nameOnly)}</button>
  </div>`
}

function agentToolResultBody(item) {
  const name = String(item.toolName || item.name || '').toLowerCase()
  const text = String(item.text || '')
  if (name === 'generate_image') return agentGeneratedImageCard(item)
  if (item.ok && /^(write|diff|edit|str_replace|apply_patch)$/.test(name)) {
    const rel = item.path || item.rel || text.replace(/^Updated\s+|^Wrote\s+/i, '').split(/\s+\(/)[0] || 'file'
    if (item.diffPreview?.length || item.linesAdded || item.linesRemoved) {
      return agentEditDiffCard(rel, item.diffPreview, item.linesAdded, item.linesRemoved)
    }
    return agentWriteFileCard(rel)
  }
  if (!item.ok) {
    return `<pre class="agent-code agent-code-out is-error"><code>${escapeHtml(text.slice(0, 400))}</code></pre>`
  }
  if (name === 'read' || name === 'read_file') {
    const parsed = parseReadToolText(text)
    const rel = parsed.rel || item.path || ''
    const body = parsed.body || (parsed.rel ? '' : text)
    const headLine = parsed.rel || text.split('\n')[0] || rel
    const linesM = String(text).match(/\((\d+) lines\)/)
    const meta = linesM ? `${linesM[1]} lines` : ''
    return body.trim() ? agentFileCodeCard(rel || headLine, body, meta) : ''
  }
  if (name === 'list_dir' || name === 'list') {
    const lines = text.split('\n').filter(Boolean).slice(0, 40)
    const chips = lines.map((f) => `<span class="agent-file-chip">${escapeHtml(f)}</span>`).join('')
    return `<div class="agent-file-chips">${chips || `<span class="agent-step-muted">(empty)</span>`}</div>`
  }
  if (name === 'terminal' || name === 'shell' || name === 'read_terminal') {
    return agentShellCard(item.path || item.command || '', text, item.ok !== false)
  }
  if (name === 'grep' || name === 'glob' || name === 'fetch') {
    return `<pre class="agent-code agent-code-out"><code>${escapeHtml(text.slice(0, 4000))}</code></pre>`
  }
  return text ? `<pre class="agent-code agent-code-out"><code>${escapeHtml(text.slice(0, 1200))}</code></pre>` : ''
}

function agentToolResultHtml(item) {
  const name = String(item.toolName || item.name || '').toLowerCase()
  const meta = agentToolStepLabel(name, { path: item.path, command: item.path })
  const body = agentToolResultBody(item)
  return `<div class="agent-step agent-step-${escapeAttr(meta.badge)}">${body}</div>`
}

function agentActivitySummary(item) {
  const steps = (item.steps || []).filter((s) => s.kind === 'tool')
  let explored = 0
  let edited = 0
  let ran = 0
  for (const s of steps) {
    const n = String(s.name || '').toLowerCase()
    if (/^(read|read_file|list_dir|list|grep|glob|fetch|codebase_search|read_skill|browser)$/.test(n)) explored += 1
    else if (/^(write|diff|edit|str_replace|apply_patch|delete|wipe_workspace)$/.test(n)) edited += 1
    else if (/^(terminal|shell|read_terminal|git|generate_image)$/.test(n)) ran += 1
  }
  const parts = []
  if (explored) parts.push(`Explored ${explored}`)
  if (edited) parts.push(`Edited ${edited}`)
  if (ran) parts.push(`Ran ${ran}`)
  return parts.join(' · ') || 'Done'
}

function agentActivityStepHtml(step) {
  if (!step) return ''
  if (step.kind === 'checkpoint') {
    const n = (step.paths || []).length
    return `<div class="agent-call is-done">
      <div class="agent-call-row">
        <span class="agent-call-dot"></span>
        <span class="agent-call-verb">Checkpoint</span>
        <span class="agent-call-target">${n} file${n === 1 ? '' : 's'}</span>
        <button type="button" class="agent-checkpoint-restore" data-cp-id="${escapeAttr(step.id)}">Restore</button>
      </div>
    </div>`
  }
  if (step.kind !== 'tool') return ''
  const meta = agentToolStepLabel(step.name, step.args)
  const stepState = step.state || 'running'
  const targetRaw = meta.detail || ''
  const targetShow = /[/\\]/.test(targetRaw) ? agentFileLeaf(targetRaw) : targetRaw
  const stats =
    stepState === 'done' && (step.linesAdded || step.linesRemoved)
      ? agentDiffStatHtml(step.linesAdded, step.linesRemoved)
      : ''
  const n = String(step.name || '').toLowerCase()
  if (step.kind === 'tool' && /^(write|diff|edit|str_replace|apply_patch)$/.test(n) && step.result && (step.state || 'running') === 'done') {
    return agentToolResultBody({
      toolName: step.name,
      name: step.name,
      ok: true,
      text: step.result,
      path: step.path || '',
      linesAdded: step.linesAdded,
      linesRemoved: step.linesRemoved,
      diffPreview: step.diffPreview,
    })
  }
  if (step.kind === 'tool' && /^(terminal|shell|read_terminal)$/.test(n) && step.result && (step.state || 'running') !== 'running') {
    const cmd = step.args?.command || step.args?.cmd || step.path || ''
    return agentShellCard(cmd, step.result, step.state !== 'error')
  }
  if (step.kind === 'tool' && n === 'generate_image') {
    const aspect = step.aspect || step.args?.aspect || step.args?.aspect_ratio || step.args?.ratio || '1:1'
    if ((step.state || 'running') === 'running') {
      return agentGeneratedImageCard({
        running: true,
        aspect,
        prompt: step.args?.prompt || '',
      })
    }
    if (step.result && step.state !== 'running') {
      return agentGeneratedImageCard({
        image: step.image || '',
        path: step.path || '',
        text: step.result,
        ok: step.state !== 'error',
        aspect,
      })
    }
  }
  if (step.kind === 'tool' && /^(browser|browser_snapshot|screenshot)$/.test(n) && step.result) {
    const shot = step.image
      ? `<img class="agent-browser-shot" alt="page snapshot" src="${escapeAttr(step.image)}" />`
      : ''
    return `<div class="agent-shell-card agent-browser-card">
      <div class="agent-shell-head"><span class="agent-shell-icon" aria-hidden="true">◉</span>
      <span class="agent-shell-cmd">${escapeHtml(step.args?.url || step.path || 'page')}</span></div>
      ${shot}
      <pre class="agent-shell-out"><code>${escapeHtml(String(step.result).slice(0, 4000))}</code></pre>
    </div>`
  }
  let body = ''
  if (
    stepState === 'running' &&
    /^(write|diff|edit|str_replace|apply_patch)$/.test(n) &&
    step.contentPreview
  ) {
    const rel = step.path || step.args?.path || step.args?.file || 'file'
    body = agentFileCodeCard(rel, step.contentPreview, 'Writing…')
  } else if (stepState === 'running' && (n === 'read' || n === 'read_file')) {
    body = `<div class="agent-call-hint">Opening <span class="mono">${escapeHtml(String(step.args?.path || step.args?.file || 'file'))}</span>…</div>`
  } else if (step.result && stepState === 'done') {
    body = agentToolResultBody({
      toolName: step.name,
      name: step.name,
      ok: true,
      text: step.result,
      path: step.path || '',
      image: step.image || '',
      aspect: step.aspect || step.args?.aspect || '',
      linesAdded: step.linesAdded,
      linesRemoved: step.linesRemoved,
      diffPreview: step.diffPreview,
    })
  } else if (stepState === 'error') {
    body = `<pre class="agent-code agent-code-out is-error"><code>${escapeHtml(String(step.result || 'Failed').slice(0, 400))}</code></pre>`
  }
  const keepOpen = stepState === 'running' || /^(write|diff|edit|terminal|shell)$/.test(n)
  const pulse = stepState === 'running' ? '<span class="agent-call-pulse" aria-hidden="true"></span>' : ''
  return `<details class="agent-call is-${escapeAttr(stepState)}"${keepOpen ? ' open' : ''}>
    <summary class="agent-call-row">
      <span class="agent-call-dot"></span>
      <span class="agent-call-verb">${escapeHtml(meta.label)}</span>
      <span class="agent-call-target" title="${escapeAttr(targetRaw)}">${escapeHtml(targetShow)}</span>
      ${stats}
      ${pulse}
    </summary>
    ${body ? `<div class="agent-call-body">${body}</div>` : ''}
  </details>`
}

function formatThoughtMs(ms) {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000))
  if (s < 1) return 'Thought briefly'
  if (s < 60) return `Thought for ${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r ? `Thought for ${m}m ${r}s` : `Thought for ${m}m`
}

function collapseImageGenSteps(steps) {
  const out = []
  for (const step of steps || []) {
    const n = String(step.name || '').toLowerCase()
    const prev = out[out.length - 1]
    if (n === 'generate_image' && prev && String(prev.name || '').toLowerCase() === 'generate_image') {
      out[out.length - 1] = { ...prev, ...step, args: { ...(prev.args || {}), ...(step.args || {}) } }
      continue
    }
    out.push(step)
  }
  return out
}

function agentStatusDisplayText(raw) {
  const t = String(raw || '').trim()
  if (!t) return ''
  const planMatch = t.match(/^Plan · (\d+) steps/i)
  if (planMatch) return `Planning · ${planMatch[1]} steps`
  if (t.length > 80 || /→|GROUND TRUTH|CODE SHAPE|VERIFY:/i.test(t)) {
    if (/plan/i.test(t)) return 'Planning…'
    if (/think/i.test(t)) return 'Thinking…'
    return 'Working…'
  }
  return t
}

function agentActivityHtml(item) {
  const steps = collapseImageGenSteps(item.steps || []).map(agentActivityStepHtml).join('')
  const open = Boolean(item.open)
  const thought = agentStatusDisplayText(item.status || item.thought || '')
  const hasSteps = Boolean((item.steps || []).length)
  const hasPlan = Boolean((item.todos || []).length)
  const liveLabel = /plan/i.test(thought)
    ? 'Planning'
    : /think/i.test(thought)
      ? 'Thinking'
      : 'Working'
  const thinkLabel = open ? liveLabel : formatThoughtMs(item.thoughtMs)
  const thinkLive = open
    ? `<span class="agent-think-shimmer">${escapeHtml(thought || (hasPlan ? 'Planning…' : hasSteps ? 'Soumtok is working…' : 'Thinking…'))}</span>`
    : ''
  const thinkBody = ''
  const todos = (item.todos || [])
    .map((t) => {
      const st = t.status || 'pending'
      const mark = st === 'completed' ? '✓' : st === 'in_progress' ? '→' : '○'
      return `<li class="agent-todo agent-todo-${escapeAttr(st)}"><span class="agent-todo-mark">${mark}</span>${escapeHtml(t.content || t.id || '')}</li>`
    })
    .join('')
  const todoBlock = todos
    ? `<div class="agent-plan">
        <div class="agent-plan-label">Plan</div>
        <ul class="agent-todo-list">${todos}</ul>
      </div>`
    : ''
  const summary = !open && (item.steps || []).length
    ? `<div class="agent-run-summary">${escapeHtml(agentActivitySummary(item))}</div>`
    : ''
  return `<div class="agent-activity ${open ? 'is-open' : 'is-done'}">
    <details class="agent-think"${open ? ' open' : ''}>
      <summary class="agent-think-row">
        ${open ? '<div class="agent-think-avatar" data-activity-avatar aria-hidden="true"></div>' : ''}
        <span class="agent-think-chev" aria-hidden="true"></span>
        <span class="agent-think-label">${thinkLabel}</span>
        ${open ? '<span class="agent-think-who">Soumtok agent</span>' : ''}
        ${thinkLive}
      </summary>
      ${thinkBody}
    </details>
    ${todoBlock}
    ${summary}
    ${steps ? `<div class="agent-activity-steps">${steps}</div>` : ''}
  </div>`
}

function stripAttachCaptions(text) {
  return String(text || '')
    .replace(/\s*📎\s+\S+(?:\s*,\s*\S+)*/gu, '')
    .trim()
}

function agentChoicePickerHtml(item, index) {
  if (!item.choices?.length || item.choicePicked || item.choicePending === false) return ''
  const prompt = item.choicePrompt || item.choiceTitle || 'Choose one'
  const chips = item.choices
    .map(
      (c) =>
        `<button type="button" class="agent-choice-chip" data-choice-index="${index}" data-choice-num="${c.num}" data-choice-label="${escapeAttr(c.label)}">
          <span class="agent-choice-num">${c.num}</span>
          <span class="agent-choice-label">${escapeHtml(c.label)}</span>
        </button>`,
    )
    .join('')
  return `<div class="agent-choice-picker" data-choice-picker="${index}">
    <p class="agent-choice-title">${escapeHtml(prompt)}</p>
    <div class="agent-choice-list">${chips}</div>
    <div class="agent-choice-custom-row">
      <input type="text" class="agent-choice-custom" data-choice-index="${index}" placeholder="Or type your own…" />
      <button type="button" class="agent-choice-send" data-choice-custom-send="${index}">Send</button>
    </div>
  </div>`
}

function bindAgentChoicePickers() {
  document.querySelectorAll('.agent-choice-chip').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.choiceIndex)
      const num = btn.dataset.choiceNum
      const label = btn.dataset.choiceLabel || ''
      void submitAgentChoice(idx, label ? `${num}. ${label}` : String(num))
    }
  })
  document.querySelectorAll('[data-choice-custom-send]').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.choiceCustomSend)
      const input = document.querySelector(`.agent-choice-custom[data-choice-index="${idx}"]`)
      const text = String(input?.value || '').trim()
      if (!text) return
      void submitAgentChoice(idx, text)
    }
  })
  document.querySelectorAll('.agent-choice-custom').forEach((input) => {
    input.onkeydown = (e) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      const idx = Number(input.dataset.choiceIndex)
      const text = String(input.value || '').trim()
      if (!text) return
      void submitAgentChoice(idx, text)
    }
  })
}

async function submitAgentChoice(index, text) {
  const t = activeThread()
  const item = t.items[index]
  if (!item || item.role !== 'agent' || item.choicePicked || !text) return
  item.choicePicked = text
  item.choicePending = false
  paintAgentThread()
  await sendAgentWithText(text)
}

function agentAskSummary(answers, questions) {
  const lines = []
  for (const q of questions || []) {
    const picked = answers?.[q.id] || []
    const label = Array.isArray(picked) && picked.length ? picked.join(', ') : 'Skipped'
    lines.push(`${q.prompt}: ${label}`)
  }
  return lines.join(' · ')
}

function agentAskCardHtml(item, index) {
  const done = Boolean(item.answers) || !item.pending
  const qs = Array.isArray(item.questions) ? item.questions : []
  const picked = item.answers || item._picked || {}
  const body = qs
    .map((q, qi) => {
      const opts = (q.options || [])
        .map(
          (opt, oi) =>
            `<button type="button" class="agent-ask-opt${(picked[q.id] || []).includes(opt.label) ? ' on' : ''}" data-ask-index="${index}" data-qid="${escapeAttr(q.id)}" data-opt="${escapeAttr(opt.label)}" ${done ? 'disabled' : ''}>${String.fromCharCode(97 + oi)}. ${escapeHtml(opt.label)}</button>`,
        )
        .join('')
      const custom =
        q.allowCustom !== false && !done
          ? `<input type="text" class="agent-ask-custom" data-ask-index="${index}" data-qid="${escapeAttr(q.id)}" value="${escapeAttr(item._custom?.[q.id] || '')}" placeholder="Or type your own…" />`
          : ''
      return `<div class="agent-ask-q"><span class="agent-ask-q-prompt">${qi + 1}. ${escapeHtml(q.prompt)}</span>${opts}${custom}</div>`
    })
    .join('')
  const actions = done
    ? ''
    : `<div class="agent-ask-actions"><button type="button" class="ghost" data-ask-skip="${index}">Skip</button><button type="button" class="primary" data-ask-submit="${index}">Continue</button></div>`
  return `<div class="agent-ask-card${done ? ' is-done' : ''}" data-ask-card="${index}">
    <p class="agent-ask-title">${escapeHtml(item.title || 'Question')}</p>
    ${item.intro ? `<p class="agent-ask-intro">${escapeHtml(item.intro)}</p>` : ''}
    ${body}
    ${actions}
  </div>`
}

function bindAgentAskCards() {
  document.querySelectorAll('.agent-ask-opt').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.askIndex)
      const qid = btn.dataset.qid
      const opt = btn.dataset.opt
      const t = activeThread()
      const item = t.items[idx]
      if (!item || item.role !== 'ask' || item.answers) return
      item._picked = item._picked || {}
      const q = (item.questions || []).find((row) => row.id === qid)
      const multi = Boolean(q?.allowMultiple)
      const cur = item._picked[qid] || []
      if (multi) {
        item._picked[qid] = cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt]
      } else {
        item._picked[qid] = [opt]
      }
      paintAgentThread()
    }
  })
  document.querySelectorAll('[data-ask-submit]').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.askSubmit)
      void submitAgentAskCard(idx)
    }
  })
  document.querySelectorAll('[data-ask-skip]').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.askSkip)
      void submitAgentAskCard(idx, true)
    }
  })
  document.querySelectorAll('.agent-ask-custom').forEach((input) => {
    input.oninput = () => {
      const idx = Number(input.dataset.askIndex)
      const qid = input.dataset.qid
      const t = activeThread()
      const item = t.items[idx]
      if (!item || item.role !== 'ask' || item.answers) return
      item._custom = item._custom || {}
      item._custom[qid] = input.value
    }
  })
}

async function submitAgentAskCard(index, skip = false) {
  const t = activeThread()
  const item = t.items[index]
  if (!item || item.role !== 'ask' || !item.pending) return
  const answers = skip ? {} : { ...(item._picked || {}) }
  if (!skip) {
    for (const q of item.questions || []) {
      const extra = String(item._custom?.[q.id] || '').trim()
      if (!extra) continue
      const cur = answers[q.id] || []
      if (!cur.includes(extra)) answers[q.id] = [...cur, extra]
    }
  }
  item.answers = answers
  item.pending = false
  await api.agentAskReply({ id: item.id, answers })
  t.items.splice(index, 1)
  paintAgentThread()
}

let agentMentionPick = 0

function closeAgentMentionPop() {
  document.getElementById('agent-mention-pop')?.remove()
}

function openAgentMentionPop(anchor) {
  closeAgentMentionPop()
  if (!state.folder) return
  const files = flatten(state.tree).filter((n) => n.type === 'file').slice(0, 60)
  if (!files.length) return
  const pop = document.createElement('div')
  pop.id = 'agent-mention-pop'
  pop.className = 'agent-mention-pop'
  pop.innerHTML = files
    .map(
      (f, i) =>
        `<button type="button" class="agent-mention-item${i === 0 ? ' on' : ''}" data-mention-path="${escapeAttr(f.path)}" data-mention-name="${escapeAttr(f.name)}">@${escapeHtml(f.name)}</button>`,
    )
    .join('')
  const rect = anchor.getBoundingClientRect()
  pop.style.left = `${rect.left}px`
  pop.style.top = `${rect.top - 8}px`
  pop.style.transform = 'translateY(-100%)'
  document.body.appendChild(pop)
  agentMentionPick = 0
  pop.querySelectorAll('.agent-mention-item').forEach((row, i) => {
    row.onclick = () => {
      insertAgentInputText(`@${row.dataset.mentionName} `)
      closeAgentMentionPop()
    }
  })
}

function bindAgentMentionInput() {
  const input = $('agent-input')
  if (!input || input.dataset.mentionBound) return
  input.dataset.mentionBound = '1'
  input.addEventListener('keydown', (e) => {
    const pop = document.getElementById('agent-mention-pop')
    if (pop && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      const items = pop.querySelectorAll('.agent-mention-item')
      agentMentionPick = Math.max(0, Math.min(agentMentionPick + (e.key === 'ArrowDown' ? 1 : -1), items.length - 1))
      items.forEach((el, i) => el.classList.toggle('on', i === agentMentionPick))
      return
    }
    if (pop && e.key === 'Enter') {
      const picked = pop.querySelectorAll('.agent-mention-item')[agentMentionPick]
      if (picked) {
        e.preventDefault()
        insertAgentInputText(`@${picked.dataset.mentionName} `)
        closeAgentMentionPop()
      }
      return
    }
    if (e.key === 'Escape') closeAgentMentionPop()
    if (e.key === '@') {
      requestAnimationFrame(() => openAgentMentionPop(input))
    }
  })
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#agent-mention-pop') && e.target !== input) closeAgentMentionPop()
  })
}

function agentItemHtml(item, index, items) {
  if (item.role === 'activity') {
    const hasBody = item.open || item.status || (item.steps && item.steps.length)
    if (!hasBody) return ''
    return agentActivityHtml(item)
  }
  if (item.role === 'tool') {
    if (item.args || item.toolName || item.name) return agentToolStepHtml(item)
    return `<div class="msg tool"><span class="tool-name">${escapeHtml(item.text || '')}</span></div>`
  }
  if (item.role === 'result') {
    return agentToolResultHtml(item)
  }
  if (item.role === 'status') {
    return `<div class="msg status">${escapeHtml(item.text)}</div>`
  }
  if (item.role === 'agent') {
    const pending = item.pending ? '<span class="agent-pending-dot"></span>' : ''
    const model = item.model ? `<span class="agent-msg-model">${escapeHtml(item.model)}</span>` : ''
    const bodyText =
      item.choices?.length && !item.choicePicked
        ? stripNumberedListForChoices(item.text, { items: item.choices })
        : item.text
    const picker = agentChoicePickerHtml(item, index)
    const picked =
      item.choicePicked && !picker
        ? `<p class="agent-choice-done">You chose: ${escapeHtml(item.choicePicked)}</p>`
        : ''
    return `<div class="msg agent agent-rich agent-conclusion ${item.pending ? 'is-pending' : ''}" data-msg-index="${index}">
      <div class="agent-msg-body">${item.pending ? pending : formatAgentReplyHtml(bodyText)}</div>
      ${picker}
      ${picked}
      <div class="agent-msg-foot">${model}<button type="button" class="agent-msg-copy" data-copy-index="${index}" title="Copy reply">Copy</button></div>
    </div>`
  }
  if (item.role === 'ask') {
    return agentAskCardHtml(item, index)
  }
  if (item.role === 'user') {
    const thumbs = (item.attachPreview || [])
      .map((a) => {
        const full = escapeAttr(a.dataUrl || a.thumbUrl || '')
        const src = escapeAttr(a.thumbUrl || a.dataUrl || '')
        if (!src) return ''
        return `<button type="button" class="agent-sent-attach-card" data-full="${full}" title="Open image">
          <img class="agent-sent-attach-img" src="${src}" alt="" />
        </button>`
      })
      .join('')
    const thumbBlock = thumbs ? `<div class="agent-sent-attachments">${thumbs}</div>` : ''
    const shown = stripAttachCaptions(item.text)
    return `<div class="msg user" data-msg-index="${index}">${thumbBlock}${shown ? escapeHtml(shown) : ''}</div>`
  }
  return `<div class="msg ${item.role}">${escapeHtml(item.text)}</div>`
}

function userFirstName() {
  const raw = state.user?.name || state.user?.email || 'there'
  const part = String(raw).trim().split(/\s+/)[0] || 'there'
  return part.includes('@') ? part.split('@')[0] : part
}

const BOT_ONBOARD = [
  {
    key: 'A',
    title: 'Day-to-day tasks',
    sub: 'Reminders, research, drafting, errands',
    prompt: 'I mainly want help with day-to-day tasks — reminders, research, drafting, and errands.',
  },
  {
    key: 'B',
    title: 'Work / projects',
    sub: 'Code, docs, ops, shipping',
    prompt: 'I mainly want help with work and projects — code, docs, ops, and shipping.',
  },
  {
    key: 'C',
    title: 'Life admin',
    sub: 'Calendar, shopping, travel, bookings',
    prompt: 'I mainly want help with life admin — calendar, shopping, travel, and bookings.',
  },
  {
    key: 'D',
    title: 'Something specific',
    sub: "I'll tell you what it is",
    prompt: 'I have something specific in mind — I will describe it in my own words.',
  },
]

function botEmptyHtml() {
  const name = userFirstName()
  const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const opts = BOT_ONBOARD.map(
    (row) =>
      `<button type="button" class="bot-onboard-opt" data-bot-pick="${escapeAttr(row.prompt)}" ${state.agentBusy ? 'disabled' : ''}>
        <span class="bot-onboard-key">${row.key}</span>
        <span><strong>${escapeHtml(row.title)}</strong><span>${escapeHtml(row.sub)}</span></span>
      </button>`,
  ).join('')
  return `<div class="bot-welcome">
    <p class="bot-welcome-time">Today ${escapeHtml(time)}</p>
    <p class="bot-welcome-hey">Hey ${escapeHtml(name)} — glad you're here.</p>
    <div class="bot-onboard-card">
      <p class="bot-onboard-title">What do you mainly want me for?</p>
      <p class="bot-onboard-sub">Pick whatever hits best, or type your own.</p>
      <div class="bot-onboard-list">${opts}</div>
      <form class="bot-onboard-form" id="bot-onboard-form">
        <input id="bot-onboard-input" placeholder="Type your own answer" ${state.agentBusy ? 'disabled' : ''} />
      </form>
    </div>
  </div>`
}

function bindBotOnboarding() {
  const box = $('agent-thread')
  if (!box) return
  box.querySelectorAll('[data-bot-pick]').forEach((btn) => {
    btn.onclick = () => {
      if (state.agentBusy) return
      void sendAgentWithText(btn.dataset.botPick || '')
    }
  })
  $('bot-onboard-form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const text = $('bot-onboard-input')?.value?.trim()
    if (!text || state.agentBusy) return
    void sendAgentWithText(text)
  })
}

function botSidebarHtml() {
  ensureThreads()
  const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const rows = state.threads
    .map((t) => {
      const lastUser = [...t.items].reverse().find((m) => m.role === 'user')
      const preview = lastUser?.text ? lastUser.text.slice(0, 52) : 'New conversation'
      const on = t.id === state.activeThreadId
      const isNewBot = t.title === 'New Bot' && !t.items.length
      return `<button type="button" class="bot-side-row ${on ? 'on' : ''}" data-thread="${escapeAttr(t.id)}">
        <span class="bot-side-glyph${isNewBot ? ' warn' : ''}" aria-hidden="true">${isNewBot ? '▲' : escapeHtml((t.title || 'S').slice(0, 1).toUpperCase())}</span>
        <span class="bot-side-meta"><strong>${escapeHtml(isNewBot ? 'New Bot' : t.title)}</strong><span>${escapeHtml(preview)}</span></span>
        ${on ? `<span class="bot-side-time">${escapeHtml(time)}</span>` : ''}
      </button>`
    })
    .join('')
  const who = state.user?.name || state.user?.email || 'Account'
  const initials = profileInitials(who)
  return `<aside class="bot-desktop-side" aria-label="Bot chats">
    <div class="bot-side-top">
      <button type="button" class="bot-side-search" id="bot-side-search">Search</button>
      <button type="button" class="bot-side-new" id="bot-side-new" aria-label="New chat">+</button>
    </div>
    <div class="bot-side-list">${rows}</div>
    <div class="bot-side-foot">
      <button type="button" class="bot-side-market" id="bot-side-market">Marketplace</button>
      <button type="button" class="bot-side-profile" id="bot-side-profile">
        <span class="bot-side-avatar">${escapeHtml(initials)}</span>
        <span class="bot-side-name">${escapeHtml(who)}</span>
      </button>
    </div>
  </aside>`
}

function profileInitials(label) {
  const raw = String(label || '').trim()
  if (!raw) return '?'
  if (raw.includes('@')) return raw.slice(0, 2).toUpperCase()
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
  return raw.slice(0, 2).toUpperCase()
}

function closeBotProfileMenu() {
  const pop = $('bot-profile-pop')
  if (pop) pop.hidden = true
  document.removeEventListener('mousedown', onBotProfileOutside)
}

function onBotProfileOutside(event) {
  const pop = $('bot-profile-pop')
  const btn = $('bot-side-profile')
  if (pop?.contains(event.target) || btn?.contains(event.target)) return
  closeBotProfileMenu()
}

function renderBotProfileMenu() {
  let pop = $('bot-profile-pop')
  if (!pop) {
    pop = document.createElement('div')
    pop.id = 'bot-profile-pop'
    pop.className = 'bot-profile-pop'
    pop.hidden = true
    document.body.appendChild(pop)
  }
  const who = state.user?.name || state.user?.email || 'Account'
  const initials = profileInitials(who)
  pop.innerHTML = `<div class="bot-profile-card" role="menu">
    <button type="button" class="bot-profile-row" id="bot-profile-settings">
      <span class="bot-profile-row-icon">⚙</span> Settings
    </button>
    <button type="button" class="bot-profile-row" id="bot-profile-billing">
      <span class="bot-profile-row-icon">◷</span> Account & billing
    </button>
    <div class="bot-profile-divider"></div>
    <button type="button" class="bot-profile-row" id="bot-profile-logout">
      <span class="bot-profile-row-icon">↩</span> Log out
    </button>
  </div>
  <button type="button" class="bot-profile-trigger" id="bot-profile-trigger-anchor">
    <span class="bot-side-avatar">${escapeHtml(initials)}</span>
    <span class="bot-side-name">${escapeHtml(who)}</span>
  </button>`
  $('bot-profile-settings')?.addEventListener('click', () => {
    closeBotProfileMenu()
    state.settingsTab = 'agents'
    openSettings()
  })
  $('bot-profile-billing')?.addEventListener('click', () => {
    closeBotProfileMenu()
    api.openBilling()
  })
  $('bot-profile-logout')?.addEventListener('click', () => {
    closeBotProfileMenu()
    void logout()
  })
  $('bot-profile-trigger-anchor')?.addEventListener('click', () => closeBotProfileMenu())
  return pop
}

function toggleBotProfileMenu(anchor) {
  const pop = renderBotProfileMenu()
  if (!pop.hidden) {
    closeBotProfileMenu()
    return
  }
  const rect = anchor.getBoundingClientRect()
  pop.style.left = `${Math.max(8, rect.left)}px`
  pop.style.bottom = `${window.innerHeight - rect.top + 8}px`
  pop.hidden = false
  setTimeout(() => document.addEventListener('mousedown', onBotProfileOutside), 0)
}

function bindBotSidebar() {
  $('bot-side-new')?.addEventListener('click', () => newAgentThread())
  $('bot-side-search')?.addEventListener('click', () => openSettings())
  $('bot-side-profile')?.addEventListener('click', (event) => {
    event.stopPropagation()
    toggleBotProfileMenu(event.currentTarget)
  })
  $('bot-side-market')?.addEventListener('click', () => api.openGithub())
  document.querySelectorAll('.bot-side-row').forEach((btn) => {
    btn.onclick = () => {
      state.activeThreadId = btn.dataset.thread
      renderAgentPanel()
    }
  })
}

function setAgentAvatarState(mode) {
  const next = mode === 'thinking' || mode === 'working' ? mode : 'idle'
  state.agentAvatarState = next
  window.SoumtokAgentAvatar?.setAgentPanelState?.(next)
  document.querySelectorAll('[data-activity-avatar]').forEach((host) => {
    window.SoumtokAgentAvatar?.setInlineState?.(host, next === 'idle' && state.agentBusy ? 'thinking' : next)
  })
}

function syncAgentAvatarUi() {
  const host = $('agent-avatar-host')
  if (!host) return
  const hasChat = activeThread().items.length > 0
  host.classList.toggle('compact', hasChat)
  const size = hasChat ? 44 : state.agentDriver === 'bot' ? 72 : 96
  window.SoumtokAgentAvatar?.setAgentPanelSize?.(size)
  if (state.agentBusy) {
    if (state.agentAvatarState === 'idle') setAgentAvatarState('thinking')
  } else {
    setAgentAvatarState('idle')
  }
}

function mountAgentAvatarIfNeeded() {
  const host = $('agent-avatar-host')
  if (!host || !window.SoumtokAgentAvatar?.mountAgentPanel) return
  window.SoumtokAgentAvatar.mountAgentPanel(host, { size: 96 })
  syncAgentAvatarUi()
}

function lastUserMessageIndex(items) {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].role === 'user') return i
  }
  return -1
}

/** Latest user message pinned above scroll while this turn has any follow-up (agent busy or replies/tools below). */
function agentThreadScrollItems(items) {
  const list = items || []
  const lastUserIdx = lastUserMessageIndex(list)
  if (lastUserIdx < 0) return { pin: null, scrollItems: list }
  const tail = list.slice(lastUserIdx + 1)
  const turnActive =
    state.agentBusy || tail.some((i) => i.role === 'activity' && i.open)
  if (!turnActive) return { pin: null, scrollItems: list }
  return {
    pin: list[lastUserIdx],
    /** Current turn only under the pin — not earlier messages in this chat. */
    scrollItems: tail,
  }
}

function paintAgentUserPin(pin, thread) {
  let pinEl = $('agent-user-pin')
  if (!pinEl) {
    const scroll = $('agent-thread')
    if (!scroll?.parentElement) return
    pinEl = document.createElement('div')
    pinEl.id = 'agent-user-pin'
    pinEl.className = 'agent-user-pin'
    pinEl.hidden = true
    scroll.parentElement.insertBefore(pinEl, scroll)
  }
  if (!pin) {
    pinEl.hidden = true
    pinEl.innerHTML = ''
    return
  }
  pinEl.hidden = false
  const act = thread?.items?.find((i) => i.role === 'activity' && i.open)
  const live =
    (act?.status && state.agentBusy ? act.status : '') ||
    (state.agentBusy ? state.agentLiveStatus || 'Soumtok is working…' : '')
  const showAvatar = Boolean(state.agentBusy)
  pinEl.innerHTML = `<div class="agent-user-pin-inner">
      ${showAvatar ? '<div class="agent-pin-avatar-host" id="agent-pin-avatar-host" data-activity-avatar aria-hidden="true"></div>' : ''}
      <div class="agent-user-pin-main">
        <div class="msg user agent-user-pin-msg">${escapeHtml(stripAttachCaptions(pin.text))}</div>
        ${
          live
            ? `<div class="agent-pin-live"><span class="agent-pin-live-who">Soumtok agent</span><span>${escapeHtml(live)}</span></div>`
            : ''
        }
      </div>
    </div>`
}

function openAgentImageLightbox(src) {
  if (!src) return
  let el = document.getElementById('agent-img-lightbox')
  if (!el) {
    el = document.createElement('div')
    el.id = 'agent-img-lightbox'
    el.className = 'agent-img-lightbox'
    el.hidden = true
    el.innerHTML =
      '<button type="button" class="agent-img-lightbox-close" aria-label="Close">×</button><img alt="" />'
    document.body.appendChild(el)
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('.agent-img-lightbox-close')) {
        el.hidden = true
        el.querySelector('img').src = ''
      }
    })
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !el.hidden) {
        el.hidden = true
        el.querySelector('img').src = ''
      }
    })
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      e.stopPropagation()
      openAgentContextMenu(e)
    })
  }
  el.querySelector('img').src = src
  el.hidden = false
}

let paintAgentScheduled = false
function schedulePaintAgentThread() {
  if (paintAgentScheduled) return
  paintAgentScheduled = true
  requestAnimationFrame(() => {
    paintAgentScheduled = false
    paintAgentThread()
  })
}

function paintAgentThread() {
  const box = $('agent-thread')
  if (!box) return
  const t = activeThread()
  paintAgentUserPin(null)
  if (!t.items.length) {
    if (state.agentDriver === 'bot') {
      box.innerHTML = botEmptyHtml()
      bindBotOnboarding()
      return
    }
    box.innerHTML = `<div class="agent-empty-wrap">
      <p class="agent-empty">What should we work on?</p>
    </div>`
    return
  }
  const { pin, scrollItems } = agentThreadScrollItems(t.items)
  paintAgentUserPin(pin, t)
  box.innerHTML = scrollItems
    .map((item, i, arr) => {
      const origIdx = t.items.indexOf(item)
      return agentItemHtml(item, origIdx >= 0 ? origIdx : i, arr)
    })
    .join('')
  mountAgentAvatarIfNeeded()
  mountActivityInlineAvatars()
  bindAgentAskCards()
  bindAgentChoicePickers()
  requestAnimationFrame(() => {
    box.scrollTop = box.scrollHeight
  })
}

function mountActivityInlineAvatars() {
  window.SoumtokAgentAvatar?.destroyInlineAvatars?.()
  const hosts = document.querySelectorAll('[data-activity-avatar]')
  if (!hosts.length) return
  const avatarState =
    state.agentAvatarState === 'working' ? 'working' : state.agentBusy ? 'thinking' : 'working'
  hosts.forEach((host) => {
    const size = host.classList.contains('agent-think-avatar') ? 26 : 32
    window.SoumtokAgentAvatar?.mountInline?.(host, { size, state: avatarState })
  })
}

function dataUrlToBlob(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/)
  if (!m) return null
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: m[1] || 'image/png' })
}

async function srcToDataUrl(src) {
  const s = String(src || '')
  if (s.startsWith('data:')) return s
  const res = await fetch(s)
  const blob = await res.blob()
  return readBlobAsDataUrl(blob)
}

async function copyImageToClipboard(src) {
  const dataUrl = await srcToDataUrl(src)
  if (!dataUrl) return false
  if (api.clipboardWriteImage) {
    const ok = await api.clipboardWriteImage(dataUrl)
    if (ok) return true
  }
  const blob = dataUrlToBlob(dataUrl)
  if (blob && navigator.clipboard?.write) {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })])
    return true
  }
  return false
}

async function saveChatImageAs(src) {
  const dataUrl = await srcToDataUrl(src)
  if (!dataUrl) return
  if (api.saveDataUrl) {
    await api.saveDataUrl({ dataUrl, name: 'image.png' })
    return
  }
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = 'image.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

async function addAgentClipboardImage(dataUrl) {
  const blob = dataUrlToBlob(dataUrl)
  if (!blob) return
  const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
  const file = new File([blob], `image.${ext}`, { type: blob.type || 'image/png' })
  await addAgentFiles([file])
}

function selectedChatText() {
  return String(window.getSelection?.()?.toString() || '')
}

function insertAgentInputText(text) {
  const input = $('agent-input')
  if (!input || text == null) return
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? start
  const v = input.value
  input.value = `${v.slice(0, start)}${text}${v.slice(end)}`
  const pos = start + String(text).length
  input.setSelectionRange(pos, pos)
  input.focus()
  growAgentInput()
}

function cutAgentInput() {
  const input = $('agent-input')
  if (!input) return
  const start = input.selectionStart ?? 0
  const end = input.selectionEnd ?? 0
  const picked = input.value.slice(start, end)
  if (!picked) return
  void copyTextToClipboard(picked)
  input.value = `${input.value.slice(0, start)}${input.value.slice(end)}`
  input.setSelectionRange(start, start)
  growAgentInput()
}

async function pasteIntoAgentComposer({ imageOnly = false } = {}) {
  const img = await api.clipboardReadImage?.()
  if (imageOnly) {
    if (img) await addAgentClipboardImage(img)
    return
  }
  let text = ''
  try {
    text = (await api.clipboardReadText?.()) || ''
  } catch {
    text = ''
  }
  if (String(text).trim()) {
    insertAgentInputText(text)
    return
  }
  if (img) await addAgentClipboardImage(img)
}

function hideAgentContextMenu() {
  const menu = document.getElementById('agent-ctx-menu')
  if (menu) menu.hidden = true
}

function ensureAgentContextMenu() {
  let menu = document.getElementById('agent-ctx-menu')
  if (!menu) {
    menu = document.createElement('div')
    menu.id = 'agent-ctx-menu'
    menu.className = 'tree-context-menu agent-ctx-menu'
    menu.hidden = true
    menu.setAttribute('role', 'menu')
    document.body.appendChild(menu)
    document.addEventListener('click', () => hideAgentContextMenu())
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideAgentContextMenu()
    })
    window.addEventListener('blur', () => hideAgentContextMenu())
  }
  return menu
}

function agentImageSrcFromEvent(e) {
  const hit = e.target.closest?.('[data-full], .agent-sent-attach-card, .agent-attach-preview, .agent-sent-attach-img, .agent-attach-preview-img, #agent-img-lightbox img, img')
  if (!hit) return ''
  if (hit.dataset?.full) return hit.dataset.full
  const img = hit.tagName === 'IMG' ? hit : hit.querySelector?.('img')
  return img?.src || ''
}

function openAgentContextMenu(e) {
  const menu = ensureAgentContextMenu()
  const sel = selectedChatText()
  const input = e.target.closest?.('#agent-input')
  const imgSrc = agentImageSrcFromEvent(e)
  const isImg = Boolean(imgSrc && (e.target.closest?.('[data-full], .agent-sent-attach-card, .agent-attach-item.is-image, #agent-img-lightbox, img')))
  const link = e.target.closest?.('a.agent-md-link')
  const code = e.target.closest?.('pre.agent-code, pre.agent-md-code, code')
  const attachItem = e.target.closest?.('.agent-attach-item')
  const msg = e.target.closest?.('.msg.user, .msg.agent')
  const rows = []
  const push = (id, label, extra = '') => {
    rows.push(`<button type="button" class="tree-ctx-item" data-act="${escapeAttr(id)}" ${extra}>${escapeHtml(label)}</button>`)
  }
  const sep = () => rows.push('<hr class="ext-filter-sep" />')

  if (isImg && imgSrc) {
    push('open-image', 'Open Preview')
    push('copy-image', 'Copy Image')
    push('save-image', 'Save Image As…')
    if (attachItem) push('remove-attach', 'Remove')
    sep()
  }
  if (link?.dataset.href || link?.href) {
    push('open-link', 'Open Link')
    push('copy-link', 'Copy Link')
    sep()
  }
  if (code) push('copy-code', 'Copy Code')
  if (input) {
    push('cut', 'Cut')
    push('copy', 'Copy')
    push('paste', 'Paste')
    push('paste-image', 'Paste Image')
    push('select-all', 'Select All')
  } else {
    if (sel) push('copy', 'Copy')
    else if (msg) push('copy-message', 'Copy Message')
    else push('copy', 'Copy')
    push('paste', 'Paste')
    if (msg) push('select-all', 'Select All')
    sep()
    push('copy-chat', 'Copy Entire Chat')
  }

  menu.innerHTML = rows.join('')
  menu.hidden = false
  const pad = 8
  const x = Math.min(e.clientX, window.innerWidth - menu.offsetWidth - pad)
  const y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - pad)
  menu.style.left = `${Math.max(pad, x)}px`
  menu.style.top = `${Math.max(pad, y)}px`

  const ctx = {
    imgSrc,
    href: link?.dataset.href || link?.href || '',
    codeText: code ? code.innerText || code.textContent || '' : '',
    attachItem,
    msg,
    sel,
    input,
  }
  menu.querySelectorAll('[data-act]').forEach((btn) => {
    btn.onclick = (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      hideAgentContextMenu()
      void runAgentContextAction(btn.dataset.act, ctx)
    }
  })
}

async function runAgentContextAction(act, ctx) {
  if (act === 'open-image' && ctx.imgSrc) openAgentImageLightbox(ctx.imgSrc)
  else if (act === 'copy-image' && ctx.imgSrc) await copyImageToClipboard(ctx.imgSrc)
  else if (act === 'save-image' && ctx.imgSrc) await saveChatImageAs(ctx.imgSrc)
  else if (act === 'remove-attach' && ctx.attachItem) {
    const idx = Number(ctx.attachItem.querySelector('[data-rm]')?.dataset.rm)
    if (Number.isFinite(idx)) {
      state.agentAttachments.splice(idx, 1)
      refreshAgentAttachRow()
    }
  } else if (act === 'open-link' && ctx.href) openAgentHref(ctx.href)
  else if (act === 'copy-link' && ctx.href) await copyTextToClipboard(ctx.href)
  else if (act === 'copy-code' && ctx.codeText) await copyTextToClipboard(ctx.codeText)
  else if (act === 'cut') cutAgentInput()
  else if (act === 'copy') {
    const text = ctx.input ? ctx.input.value.slice(ctx.input.selectionStart, ctx.input.selectionEnd) || ctx.sel : ctx.sel
    if (text) await copyTextToClipboard(text)
    else if (ctx.msg) {
      const idx = Number(ctx.msg.dataset.msgIndex)
      const item = activeThread().items[idx]
      await copyTextToClipboard(stripAttachCaptions(item?.text || ctx.msg.innerText || ''))
    }
  } else if (act === 'copy-message' && ctx.msg) {
    const idx = Number(ctx.msg.dataset.msgIndex)
    const item = Number.isFinite(idx) ? activeThread().items[idx] : null
    await copyTextToClipboard(stripAttachCaptions(item?.text || ctx.msg.innerText || ''))
  } else if (act === 'paste') await pasteIntoAgentComposer()
  else if (act === 'paste-image') await pasteIntoAgentComposer({ imageOnly: true })
  else if (act === 'select-all') {
    if (ctx.input) {
      ctx.input.focus()
      ctx.input.select()
    } else if (ctx.msg) {
      const range = document.createRange()
      range.selectNodeContents(ctx.msg)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
    }
  } else if (act === 'copy-chat') await copyEntireAgentChat()
}

function bindAgentChatContextMenu() {
  const panel = $('agent-panel')
  if (panel && !panel.dataset.ctxBound) {
    panel.dataset.ctxBound = '1'
    panel.addEventListener('contextmenu', (e) => {
      if (e.target.closest('#agent-ctx-menu, .tree-context-menu')) return
      e.preventDefault()
      openAgentContextMenu(e)
    })
  }
}

function bindAgentThreadActions() {
  const box = $('agent-thread')
  if (!box || box.dataset.copyBound) return
  box.dataset.copyBound = '1'
  box.addEventListener('click', (e) => {
    const cp = e.target.closest('.agent-checkpoint-restore')
    if (cp?.dataset.cpId) {
      void api.checkpointRestore(cp.dataset.cpId).then((res) => {
        appendPanelOutput(`[checkpoint] ${res.ok ? res.text : res.error || 'Restore failed'}\n`)
        void refreshTree()
      })
      return
    }
    const pathBtn = e.target.closest('[data-agent-path]')
    if (pathBtn?.dataset.agentPath && state.folder) {
      e.preventDefault()
      const abs = joinWorkspacePath(pathBtn.dataset.agentPath)
      void openFile({ path: abs, name: fileNameFromPath(abs), type: 'file' })
      return
    }
    const pic = e.target.closest('[data-full]')
    if (pic?.dataset.full) {
      e.preventDefault()
      openAgentImageLightbox(pic.dataset.full)
      return
    }
    const link = e.target.closest('a.agent-md-link')
    if (link?.dataset.href || link?.href) {
      e.preventDefault()
      openAgentHref(link.dataset.href || link.href, { external: e.metaKey || e.ctrlKey })
      return
    }
    const btn = e.target.closest('.agent-msg-copy')
    if (!btn) return
    const idx = Number(btn.dataset.copyIndex)
    const item = activeThread().items[idx]
    const text = item?.role === 'agent' ? item.text : ''
    if (text) void navigator.clipboard?.writeText(text)
  })
}

async function sendAgentWithText(text) {
  const input = $('agent-input')
  if (input) input.value = text
  await sendAgent()
}

const AGENT_TAB_CHAT_ICON =
  '<svg class="agent-tab-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" aria-hidden="true"><path d="M3 4.5h10a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H6l-3 2.5V5.5a1 1 0 0 1 1-1z"/></svg>'

function renderAgentTabs() {
  const row = $('agent-tabs')
  if (!row) return
  ensureThreads()
  const tabs = state.threads.filter((t) => !t.archived)
  if (!tabs.some((t) => t.id === state.activeThreadId) && tabs.length) {
    state.activeThreadId = tabs[0].id
  }
  row.innerHTML = tabs
    .map((t) => {
      const on = t.id === state.activeThreadId
      const running = threadIsRunning(t.id)
      const label = t.title || defaultThreadTitle()
      return `<button type="button" class="agent-tab ${on ? 'on' : ''} ${running ? 'running' : ''}" data-id="${escapeAttr(t.id)}" title="${escapeAttr(label)}">
          ${AGENT_TAB_CHAT_ICON}
          <span class="agent-tab-label">${escapeHtml(label)}</span>
          ${running ? '<span class="agent-tab-run" aria-label="Agent running"></span>' : ''}
          <span class="agent-tab-close" data-close="${escapeAttr(t.id)}" title="Close chat (saved in History)">×</span>
        </button>`
    })
    .join('')
  row.querySelectorAll('.agent-tab').forEach((btn) => {
    btn.onclick = (event) => {
      if (event.target.closest('.agent-tab-close')) return
      if (btn.dataset.id === state.activeThreadId) return
      state.activeThreadId = btn.dataset.id
      const th = activeThread()
      state.agentMode = th.mode || state.agentMode
      loadPersistedAgentModel()
      syncThreadModelFromGlobal()
      closeAgentToolbarPopovers()
      clearAgentComposerAttachments()
      renderAgentPanel()
      refreshAgentAttachRow()
    }
  })
  row.querySelectorAll('.agent-tab-close').forEach((btn) => {
    btn.onclick = (event) => {
      event.stopPropagation()
      closeAgentThread(btn.dataset.close)
    }
  })
}

function agentVoiceSheetHtml() {
  const wave = Array.from({ length: 16 }, () => '<span></span>').join('')
  return `<div class="agent-voice-sheet" id="agent-voice-sheet" hidden aria-live="polite">
    <div class="agent-voice-sheet-inner">
      <div id="agent-voice-avatar-host" class="agent-voice-avatar-host" aria-hidden="true"></div>
      <div class="agent-voice-sheet-main">
        <p class="agent-voice-sheet-head">
          <span class="agent-voice-sheet-title">Listening</span>
          <span class="agent-voice-sheet-hint" id="agent-voice-status">Speak naturally — text goes into the prompt</span>
        </p>
        <div class="agent-voice-wave-row">
          <div class="agent-voice-wave" aria-hidden="true">${wave}</div>
          <p class="agent-voice-live" id="agent-voice-live">…</p>
        </div>
      </div>
      <div class="agent-voice-sheet-actions">
        <button type="button" class="agent-voice-ghost" id="agent-voice-cancel">Cancel</button>
        <button type="button" class="agent-voice-done" id="agent-voice-done">Done</button>
      </div>
    </div>
  </div>`
}

function renderBotAgentShell() {
  const title = botChatTitle()
  return `<div class="agent-shell bot-mode">
    <header class="bot-chat-head">
      <div class="bot-chat-head-left">
        <span class="bot-chat-mark" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 2 14 13H2L8 2z"/></svg>
        </span>
        <h1 class="bot-chat-title">${escapeHtml(title)}</h1>
      </div>
      <div class="bot-chat-head-actions">
        <button type="button" class="bot-chat-head-btn" id="agent-new" title="New chat">+</button>
        <button type="button" class="bot-chat-head-btn agent-bar-stop" id="agent-stop" title="Stop" hidden>■</button>
      </div>
    </header>
    <div class="agent-user-pin" id="agent-user-pin" hidden aria-live="polite"></div>
    <div class="agent-scroll bot-thread-scroll" id="agent-thread"></div>
    <div class="bot-composer-wrap">
      <div class="agent-attach-row" id="agent-attach-row">${renderAgentAttachChips()}</div>
      ${agentVoiceSheetHtml()}
      <div class="bot-composer-bar">
        <input type="file" id="agent-file-input" accept="*/*" multiple hidden />
        <div class="agent-skills-anchor-wrap bot-attach-wrap">
          <button type="button" class="bot-composer-skill" id="agent-skills-btn" title="Load skills" ${state.agentBusy ? 'disabled' : ''}>◆</button>
          <div class="agent-skills-anchor" id="agent-skills-anchor" hidden></div>
        </div>
        <button type="button" class="bot-composer-plus" id="agent-attach" title="Attach files" ${state.agentBusy ? 'disabled' : ''}>+</button>
        <textarea id="agent-input" rows="1" placeholder="Message New Bot" ${state.agentBusy ? 'disabled' : ''}></textarea>
        <button type="button" class="bot-composer-mic agent-voice-btn" id="agent-voice-btn" title="Voice input" aria-label="Voice input" aria-pressed="false" ${state.agentBusy ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z"/><path d="M19 11v1a7 7 0 0 1-14 0v-1M12 18v3"/></svg>
        </button>
        <button type="button" class="bot-composer-send" id="agent-go" title="Send" ${state.agentBusy ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
        </button>
      </div>
    </div>
  </div>`
}

function renderIdeAgentShell(pickerOpen) {
  return `<div class="agent-shell">
    <header class="agent-toolbar agent-toolbar-tabs">
      <div class="agent-tabs" id="agent-tabs" role="tablist" aria-label="Agent chats"></div>
      <div class="agent-toolbar-actions">
        <button type="button" class="agent-bar-btn" id="agent-new" title="New chat" aria-label="New chat">
          ${agentBarIcon('plus')}
        </button>
        <button type="button" class="agent-bar-btn agent-bar-stop" id="agent-stop" title="Stop agent run" aria-label="Stop agent run" hidden>
          ${agentBarIcon('stop')}
        </button>
        <button type="button" class="agent-bar-btn" id="agent-copy-chat" title="Copy entire chat" aria-label="Copy entire chat">
          ${agentBarIcon('copy')}
        </button>
        <div class="agent-toolbar-anchor">
          <button type="button" class="agent-bar-btn" id="agent-history" title="Past chats" aria-expanded="${state.agentHistoryOpen}">
            ${agentBarIcon('history')}
          </button>
          <div class="agent-toolbar-pop agent-history-pop" id="agent-history-pop" ${state.agentHistoryOpen ? '' : 'hidden'}>
            ${state.agentHistoryOpen ? renderAgentHistoryPopHtml() : ''}
          </div>
        </div>
        <div class="agent-toolbar-anchor">
          <button type="button" class="agent-bar-btn" id="agent-more" title="More actions" aria-expanded="${state.agentMoreOpen}">
            ${agentBarIcon('more')}
          </button>
          <div class="agent-toolbar-pop agent-more-pop" id="agent-more-pop" ${state.agentMoreOpen ? '' : 'hidden'}>
            ${state.agentMoreOpen ? renderAgentMoreMenuHtml() : ''}
          </div>
        </div>
        <button type="button" class="agent-bar-btn" id="agent-panel-toggle" title="Hide agent panel">
          ${agentBarIcon('panel')}
        </button>
      </div>
    </header>
    <div class="agent-user-pin" id="agent-user-pin" hidden aria-live="polite"></div>
    <div class="agent-scroll" id="agent-thread"></div>
    <div class="agent-run-bar" id="agent-run-bar" hidden>
      <span class="agent-run-pulse" aria-hidden="true"></span>
      <div class="agent-run-text">
        <span id="agent-run-label">Agent working…</span>
        <span class="agent-run-detail" id="agent-run-detail"></span>
      </div>
      <button type="button" class="agent-run-stop" id="agent-run-stop" title="Stop agent">Stop</button>
    </div>
    <div class="agent-bottom-dock">
      <div class="agent-composer-trays" id="agent-composer-trays" hidden>
        <div class="agent-dock-row agent-dock-canvas" id="agent-canvas-tray" hidden>
          <span class="agent-dock-canvas-icon" aria-hidden="true">${agentBarIcon('canvas')}</span>
          <span class="agent-dock-label" id="agent-canvas-label">Canvas</span>
          <button type="button" class="agent-dock-open" id="agent-canvas-open">Open</button>
        </div>
        <details class="agent-dock-row agent-dock-terminals" id="agent-bg-terminals" hidden>
          <summary class="agent-dock-summary">
            <span class="agent-dock-chevron" aria-hidden="true"></span>
            <span class="agent-dock-label" id="agent-bg-terminals-label">Background terminals</span>
          </summary>
          <ul class="agent-dock-expand agent-bg-terminals-list" id="agent-bg-terminals-list"></ul>
        </details>
        <details class="agent-dock-row agent-dock-review" id="agent-review-tray" hidden>
          <summary class="agent-dock-summary agent-dock-summary-review">
            <span class="agent-dock-chevron" aria-hidden="true"></span>
            <span class="agent-dock-label" id="agent-review-label">0 Files</span>
            <span class="agent-dock-actions">
              <button type="button" class="agent-dock-link" id="agent-review-undo">Undo All</button>
              <button type="button" class="agent-dock-link" id="agent-review-keep">Keep All</button>
              <button type="button" class="agent-dock-pill" id="agent-review-open">Review</button>
            </span>
          </summary>
          <ul class="agent-dock-expand agent-review-files" id="agent-review-files"></ul>
        </details>
      </div>
      <div class="agent-queue-row" id="agent-queue-row" hidden aria-label="Queued messages"></div>
      <div class="agent-composer">
      <div class="agent-attach-row" id="agent-attach-row">${renderAgentAttachChips()}</div>
      ${agentVoiceSheetHtml()}
      <textarea id="agent-input" rows="1" placeholder="${state.agentBusy ? 'Type while agent works — Send adds to queue · Send now interrupts' : 'Describe a task or ask a question…'}"></textarea>
      <div class="agent-composer-foot">
        <div class="agent-foot-left">
          <div class="agent-mode-anchor">
            <button type="button" class="agent-mode-pill" id="agent-mode-btn" title="Mode" ${state.agentBusy ? 'disabled' : ''}>
              <span class="agent-pill-icon" aria-hidden="true">∞</span>
              <span id="agent-mode-label">${escapeHtml(agentModeLabel())}</span>
              <svg class="agent-mode-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 6l4 4 4-4"/></svg>
            </button>
            <div class="agent-mode-pop agent-mode-desc-pop" id="agent-mode-pop" ${state.agentModePicker ? '' : 'hidden'}>
              <button type="button" class="agent-mode-item ${state.agentMode === 'agent' ? 'on' : ''}" data-mode="agent"><strong>Agent</strong><span>Full tools — edit, terminal, search, browser</span></button>
              <button type="button" class="agent-mode-item ${state.agentMode === 'ask' ? 'on' : ''}" data-mode="ask"><strong>Ask</strong><span>Read-only answers — no file edits</span></button>
              <button type="button" class="agent-mode-item ${state.agentMode === 'plan' ? 'on' : ''}" data-mode="plan"><strong>Plan</strong><span>Design first — edits blocked until you switch to Agent</span></button>
              <button type="button" class="agent-mode-item ${state.agentMode === 'debug' ? 'on' : ''}" data-mode="debug"><strong>Debug</strong><span>Evidence-first — logs, repro steps, minimal changes</span></button>
            </div>
          </div>
          <div class="agent-mode-anchor">
            <button type="button" class="agent-mode-pill" id="agent-intel-btn" title="Agent intelligence" ${state.agentBusy ? 'disabled' : ''}>
              <span id="agent-intel-label">${escapeHtml(agentIntelligenceLabel())}</span>
              <svg class="agent-mode-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 6l4 4 4-4"/></svg>
            </button>
            <div class="agent-mode-pop agent-intel-pop" id="agent-intel-pop" ${state.agentIntelPicker ? '' : 'hidden'}>
              <button type="button" class="agent-mode-item ${(!state.agentPrefs?.intelligence || state.agentPrefs.intelligence === 'max') ? 'on' : ''}" data-intel="max">
                <strong>Max</strong><span>Deepest loop — think, search, browser, skills</span>
              </button>
              <button type="button" class="agent-mode-item ${state.agentPrefs?.intelligence === 'balanced' ? 'on' : ''}" data-intel="balanced">
                <strong>Balanced</strong><span>Think and verify without extra retries</span>
              </button>
              <button type="button" class="agent-mode-item ${state.agentPrefs?.intelligence === 'fast' ? 'on' : ''}" data-intel="fast">
                <strong>Fast</strong><span>Fewer rounds, skip think-first and browser</span>
              </button>
            </div>
          </div>
          <div class="agent-model-anchor">
            <button type="button" class="agent-model-trigger" id="agent-model-btn" title="Choose model" ${state.agentBusy ? 'disabled' : ''}>
              <span class="agent-model-trigger-label" id="agent-model-btn-label">${escapeHtml(agentModelTriggerLabel())}</span>
              <svg class="agent-model-trigger-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 6l4 4 4-4"/></svg>
            </button>
            ${renderModelPickerPopHtml()}
          </div>
        </div>
        <div class="agent-foot-right">
          <input type="file" id="agent-file-input" accept="*/*" multiple hidden />
          <button type="button" class="agent-icon-btn agent-voice-btn" id="agent-voice-btn" title="Voice input" aria-label="Voice input" aria-pressed="false">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z"/><path d="M19 11v1a7 7 0 0 1-14 0v-1M12 18v3"/></svg>
          </button>
          <div class="agent-skills-anchor-wrap">
            <button type="button" class="agent-icon-btn" id="agent-skills-btn" title="Load skills">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8M8 11h6"/></svg>
            </button>
            <div class="agent-skills-anchor" id="agent-skills-anchor" hidden></div>
          </div>
          <button type="button" class="agent-icon-btn" id="agent-attach" title="Attach files">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8l-6.5 6.5a2.5 2.5 0 003.5 3.5l7-7a4 4 0 00-5.5-5.5l-7.5 7.5a6 6 0 008.5 8.5l8-8"/></svg>
          </button>
          <button type="button" class="agent-send-now-btn" id="agent-send-now" title="Stop current run and send this now" ${state.agentBusy ? '' : 'hidden'}>Send now</button>
          <button type="button" class="agent-send" id="agent-go" title="${state.agentBusy ? 'Add to wait line (runs after current task)' : 'Send message'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
          </button>
        </div>
      </div>
    </div>
    </div>
  </div>`
}

async function renderAgentPanel() {
  const panel = $('agent-panel')
  if (!panel || !document.body.classList.contains('mode-project')) return
  try {
    await withTimeout(syncAgentRunStateFromMain(), 2500, 'Agent status')
  } catch {
    /* keep panel responsive if main is busy */
  }
  if (state.agentBusy && $('agent-thread')) {
    renderAgentTabs()
    paintAgentThread()
    bindAgentThreadActions()
    bindAgentChatContextMenu()
    syncAgentReviewLive()
    paintAgentReviewTray()
    paintAgentBgTerminals()
    paintAgentCanvasTray()
    renderAgentQueueStrip()
    updateAgentBusyUi()
    mountAgentAvatarIfNeeded()
    syncAgentAvatarUi()
    return
  }
  void loadLocalAgentSkills()
  if (state.user) {
    refreshModelReadiness()
    void Promise.all([loadUserSkills(), loadPlugins()])
  }
  ensureThreads()
  const thread = activeThread()
  state.agentMode = thread.mode || state.agentMode
  thread.driver = state.agentDriver || thread.driver || 'ide'
  const pickerOpen = state.agentModelPicker
  const botMode = state.agentDriver === 'bot'
  if (botMode && !document.body.classList.contains('driver-bot')) {
    document.body.classList.add('driver-bot')
  }
  if (!botMode && document.body.classList.contains('driver-bot')) {
    document.body.classList.remove('driver-bot')
  }
  panel.innerHTML = botMode
    ? `<div class="bot-desktop-root">${botSidebarHtml()}<div class="bot-desktop-main">${renderBotAgentShell()}</div></div>`
    : renderIdeAgentShell(pickerOpen)
  paintAgentThread()
  bindAgentThreadActions()
  bindAgentChatContextMenu()
  bindAgentReviewTray()
  if (botMode) bindBotSidebar()
  else {
    renderAgentTabs()
    bindAgentToolbar()
    bindAgentModePicker()
    bindAgentMentionInput()
    bindAgentIntelPicker()
    bindModelPicker()
    if (pickerOpen) openModelPicker(pickerOpen)
  }
  $('agent-go').onclick = () => {
    if (state.agentBusy) void sendAgent(undefined, { queueOnly: true })
    else void sendAgent()
  }
  $('agent-send-now')?.addEventListener('click', () => void sendAgent(undefined, { interrupt: true }))
  $('agent-run-stop')?.addEventListener('click', () => {
    setAgentLiveStatus('Stopping…')
    void api.agentCancel()
  })
  updateAgentBusyUi()
  const inputEl = $('agent-input')
  if (inputEl) {
    inputEl.oninput = () => growAgentInput()
    growAgentInput()
    inputEl.onkeydown = (event) => {
      if (event.key !== 'Enter') return
      if (state.agentBusy) {
        event.preventDefault()
        if (event.ctrlKey || event.metaKey) void sendAgent(undefined, { steerNow: true })
        else void sendAgent(undefined, { queueOnly: true })
        return
      }
      if (state.agentCtrlEnter) {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault()
          sendAgent()
        }
        return
      }
      if (!event.shiftKey) {
        event.preventDefault()
        sendAgent()
      }
    }
  }
  bindAgentAttachments()
  bindAgentSkillsButton()
  bindAgentDragDrop()
  paintAgentSkillsPicker()
  if (!document.body.dataset.skillsPickerBound) {
    document.body.dataset.skillsPickerBound = '1'
    document.addEventListener('mousedown', (event) => {
      if (!state.agentSkillsPickerOpen) return
      if (event.target.closest?.('#agent-skills-anchor, #agent-skills-btn, #agent-attach')) return
      state.agentSkillsPickerOpen = false
      paintAgentSkillsPicker()
    })
  }
  mountAgentAvatarIfNeeded()
}

let agentDragDepth = 0

function dropHasFiles(data) {
  if (!data) return false
  if ([...data.types].includes('Files')) return true
  return Array.from(data.items || []).some((item) => item.kind === 'file')
}

function filesFromDrop(data) {
  if (!data) return []
  const listed = Array.from(data.files || [])
  if (listed.length) return listed
  const picked = []
  for (const item of Array.from(data.items || [])) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file) picked.push(file)
  }
  return picked
}

function setAgentDragHosts(active) {
  for (const el of document.querySelectorAll('.agent-composer, .bot-composer-bar, .bot-composer-wrap')) {
    el.classList.toggle('agent-drag-over', active)
  }
}

function bindAgentDragDrop() {
  const hosts = () => document.querySelectorAll('.agent-composer, .bot-composer-bar, .bot-composer-wrap')
  for (const host of hosts()) {
    if (host.dataset.dragBound) continue
    host.dataset.dragBound = '1'
    host.addEventListener('dragenter', (event) => {
      if (!dropHasFiles(event.dataTransfer)) return
      event.preventDefault()
      agentDragDepth += 1
      setAgentDragHosts(true)
    })
    host.addEventListener('dragover', (event) => {
      if (!dropHasFiles(event.dataTransfer)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    })
    host.addEventListener('dragleave', (event) => {
      if (!dropHasFiles(event.dataTransfer)) return
      agentDragDepth -= 1
      if (agentDragDepth <= 0) {
        agentDragDepth = 0
        setAgentDragHosts(false)
      }
    })
    host.addEventListener('drop', (event) => {
      if (!dropHasFiles(event.dataTransfer)) return
      event.preventDefault()
      event.stopPropagation()
      agentDragDepth = 0
      setAgentDragHosts(false)
      if (state.agentBusy) return
      void addAgentFiles(filesFromDrop(event.dataTransfer))
    })
  }
}

function renderAgentAttachChips() {
  const thread = activeThread()
  const soumtokChipLogo = `<span class="agent-skill-chip-logo">${soumtokSkillLogoHtml()}</span>`
  const manualChips = (thread.attachedManualSkills || [])
    .map(
      (skill) => `<div class="agent-attach-item agent-skill-chip agent-manual-skill-chip">
        ${soumtokChipLogo}
        <span class="agent-attach-filename" title="${escapeAttr(skill.description || skill.fileName || '')}">${escapeHtml(skill.name || 'Skill')}</span>
        <button type="button" class="agent-attach-rm" data-manual-skill-rm="${escapeAttr(skill.name)}" data-manual-skill-file="${escapeAttr(skill.fileName || '')}" aria-label="Remove skill">×</button>
      </div>`,
    )
    .join('')
  const localChips = (thread.attachedLocalSkills || [])
    .map(
      (skill) => `<div class="agent-attach-item agent-skill-chip agent-local-skill-chip">
        ${soumtokChipLogo}
        <span class="agent-attach-filename" title="${escapeAttr(skill.description || '')}">${escapeHtml(skill.name || 'Skill')}</span>
        <button type="button" class="agent-attach-rm" data-local-skill-rm="${escapeAttr(skill.name)}" aria-label="Remove skill">×</button>
      </div>`,
    )
    .join('')
  const pluginChips = (thread.attachedPluginSkills || [])
    .map(
      (skill) => `<div class="agent-attach-item agent-skill-chip agent-plugin-skill-chip">
        <span class="agent-skill-chip-logo">${connectorLogoHtml(skill.pluginId, skill.pluginName)}</span>
        <span class="agent-attach-filename" title="${escapeAttr(skill.pluginName || '')}">${escapeHtml(skill.label || skill.id)}</span>
        <button type="button" class="agent-attach-rm" data-plugin-skill-rm="${escapeAttr(skill.id)}" aria-label="Remove skill">×</button>
      </div>`,
    )
    .join('')
  const skillChips = (thread.attachedSkills || [])
    .map(
      (skill) => `<div class="agent-attach-item agent-skill-chip">
        ${soumtokChipLogo}
        <span class="agent-attach-filename" title="${escapeAttr(skill.name || '')}">${escapeHtml(skill.name || 'Skill')}</span>
        <button type="button" class="agent-attach-rm" data-skill-rm="${escapeAttr(skill.id)}" aria-label="Remove skill">×</button>
      </div>`,
    )
    .join('')
  if (!state.agentAttachments.length && !skillChips && !pluginChips && !localChips && !manualChips) return ''
  const fileChips = state.agentAttachments
    .map((f, i) => {
      const name = escapeHtml(f.name || 'attachment')
      const mime = f.mime || ''
      const src = f.thumbUrl || f.dataUrl || ''
      const isImage = mime.startsWith('image/') && src
      const isVideo = mime.startsWith('video/') && (f.dataUrl || src)
      const preview = isImage
        ? `<button type="button" class="agent-attach-preview" data-full="${escapeAttr(f.dataUrl || src)}" title="Open image"><img class="agent-attach-preview-img" src="${escapeAttr(src)}" alt="" /></button>`
        : isVideo
          ? `<video class="agent-attach-preview-img" src="${escapeAttr(f.dataUrl || src)}" muted playsinline></video>`
          : `<span class="agent-attach-preview-doc" aria-hidden="true">${escapeHtml((f.name || 'doc').split('.').pop() || 'file')}</span>`
      return `<div class="agent-attach-item ${isImage ? 'is-image' : ''}">
        ${isImage ? preview : `<div class="agent-attach-preview">${preview}</div>
        <span class="agent-attach-filename" title="${name}">${name}</span>`}
        <button type="button" class="agent-attach-rm" data-rm="${i}" aria-label="Remove">×</button>
      </div>`
    })
    .join('')
  return manualChips + localChips + pluginChips + skillChips + fileChips
}

function agentSkillCardHtml({ title, desc, attached, pickAttr, pickVal, logoHtml, actionHtml }) {
  return `<button type="button" class="agent-skill-card${attached ? ' on' : ''}" ${pickAttr}="${escapeAttr(pickVal)}" title="${escapeAttr(desc || title)}">
    ${logoHtml || '<span class="agent-skill-card-icon" aria-hidden="true">◆</span>'}
    <span class="agent-skill-card-body">
      <span class="agent-skill-card-title">${escapeHtml(title)}</span>
      ${desc ? `<span class="agent-skill-card-desc">${escapeHtml(desc)}</span>` : ''}
    </span>
    ${actionHtml || (attached ? '<span class="agent-skill-card-check" aria-hidden="true">✓</span>' : '')}
  </button>`
}

function renderAgentSkillsPickerHtml() {
  const q = state.agentSkillsPickerSearch.trim().toLowerCase()
  const thread = activeThread()
  const match = (text) => !q || String(text || '').toLowerCase().includes(q)
  const localSkills = (state.localAgentSkills || []).filter((skill) => match(`${skill.name} ${skill.description} ${skill.source}`))
  const pluginSkills = flattenPluginSkills().filter((skill) => match(`${skill.label} ${skill.pluginName} ${skill.description}`))
  const userSkills = (state.userSkills || []).filter((skill) => match(`${skill.name} ${skill.file_name}`))
  const installedIds = installedPluginIdsSet()
  const marketRows = skillsCatalogOnly(state.pluginsCatalog || [])
    .filter((row) => !installedIds.has(row.id) && (row.featured || row.suggested))
    .filter((row) => match(`${row.name} ${row.description}`))
    .slice(0, 6)

  const localBlock = localSkills.length
    ? `<p class="agent-skills-pop-label">Built-in skills</p><div class="agent-skill-cards">${localSkills
        .map((skill) => {
          const attached = (thread.attachedLocalSkills || []).some((row) => row.name === skill.name)
          return agentSkillCardHtml({
            title: skill.name,
            desc: String(skill.description || '').slice(0, 72),
            attached,
            pickAttr: 'data-local-skill-pick',
            pickVal: skill.name,
            logoHtml: `<span class="agent-skill-card-logo">${soumtokSkillLogoHtml()}</span>`,
          })
        })
        .join('')}</div>`
    : state.localAgentSkillsLoading
      ? `<p class="agent-skills-pop-empty">Loading skills…</p>`
      : ''

  const pluginBlock = pluginSkills.length
    ? `<p class="agent-skills-pop-label">Installed skill packs</p><div class="agent-skill-cards">${pluginSkills
        .slice(0, 16)
        .map((skill) => {
          const attached = (thread.attachedPluginSkills || []).some((row) => row.id === skill.id)
          const logo = connectorLogoHtml(skill.pluginId, skill.pluginName)
          return agentSkillCardHtml({
            title: skill.label,
            desc: skill.pluginName,
            attached,
            pickAttr: 'data-plugin-skill-pick',
            pickVal: skill.id,
            logoHtml: `<span class="agent-skill-card-logo">${logo}</span>`,
          })
        })
        .join('')}</div>`
    : ''

  const customBlock = userSkills.length
    ? `<p class="agent-skills-pop-label">Your account</p><div class="agent-skill-cards">${userSkills
        .map((skill) => {
          const attached = (thread.attachedSkills || []).some((row) => row.id === skill.id)
          return agentSkillCardHtml({
            title: skill.name || skill.file_name,
            desc: 'Cloud skill',
            attached,
            pickAttr: 'data-skill-pick',
            pickVal: skill.id,
            logoHtml: `<span class="agent-skill-card-logo">${soumtokSkillLogoHtml()}</span>`,
          })
        })
        .join('')}</div>`
    : ''

  const marketBlock = marketRows.length
    ? `<p class="agent-skills-pop-label">Add from marketplace</p><div class="agent-skill-cards">${marketRows
        .map((row) => {
          const busy = state.pluginInstallBusy === row.id
          return `<div class="agent-skill-card agent-skill-card-market">
            <span class="agent-skill-card-logo">${marketLogoHtml({ ...row, pluginId: row.id })}</span>
            <span class="agent-skill-card-body">
              <span class="agent-skill-card-title">${escapeHtml(row.name)}</span>
              <span class="agent-skill-card-desc">${escapeHtml(String(row.description || '').slice(0, 64))}</span>
            </span>
            <button type="button" class="agent-skill-card-action" data-plugin-install-pop="${escapeAttr(row.id)}" ${busy ? 'disabled' : ''}>${busy ? '…' : 'Add'}</button>
          </div>`
        })
        .join('')}</div>`
    : ''

  const signInNote = !state.user
    ? `<p class="agent-skills-pop-empty">Sign in to sync cloud skills and install marketplace plugins. Built-in skills work offline.</p>`
    : state.settingsSkillsError
      ? `<p class="agent-skills-pop-empty">${escapeHtml(state.settingsSkillsError)}</p>`
      : !localBlock && !pluginBlock && !customBlock && !marketBlock
        ? `<p class="agent-skills-pop-empty">Attach a built-in skill or open Marketplace to add Notion, Slack, Stripe, and more.</p>`
        : ''

  return `<div class="agent-skills-pop" id="agent-skills-pop">
    <input type="search" class="agent-skills-pop-search" id="agent-skills-pop-search" placeholder="Search skills…" value="${escapeAttr(state.agentSkillsPickerSearch)}" />
    <button type="button" class="agent-skills-pop-item agent-skills-pop-files" id="agent-skills-pick-files">Attach files…</button>
    ${localBlock}
    ${pluginBlock}
    ${customBlock}
    ${marketBlock}
    ${signInNote}
    <button type="button" class="agent-skills-pop-link" id="agent-skills-manage">Skills marketplace…</button>
    <button type="button" class="agent-skills-pop-link" id="agent-skills-connectors">Connectors…</button>
  </div>`
}

function paintAgentSkillsPicker() {
  const anchor = $('agent-skills-anchor')
  if (!anchor) return
  if (!state.agentSkillsPickerOpen) {
    anchor.innerHTML = ''
    anchor.hidden = true
    return
  }
  anchor.hidden = false
  anchor.innerHTML = renderAgentSkillsPickerHtml()
  bindAgentSkillsPicker()
  bindLogoFallback(anchor)
}

function makeAttachThumb(dataUrl, size = 28) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const canvas = document.createElement('canvas')
        canvas.width = size * dpr
        canvas.height = size * dpr
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(dataUrl)
          return
        }
        ctx.fillStyle = '#161616'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        const pad = 2 * dpr
        const box = size * dpr - pad * 2
        const scale = Math.min(box / img.width, box / img.height)
        const dw = Math.max(1, img.width * scale)
        const dh = Math.max(1, img.height * scale)
        ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh)
        resolve(canvas.toDataURL('image/jpeg', 0.88))
      } catch {
        resolve(dataUrl)
      }
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

function bindAgentSkillsPicker() {
  $('agent-skills-pop-search')?.addEventListener('input', (e) => {
    state.agentSkillsPickerSearch = e.target.value
    paintAgentSkillsPicker()
  })
  $('agent-skills-pick-files')?.addEventListener('click', () => {
    state.agentSkillsPickerOpen = false
    paintAgentSkillsPicker()
    $('agent-file-input')?.click()
  })
  $('agent-skills-manage')?.addEventListener('click', () => {
    state.agentSkillsPickerOpen = false
    paintAgentSkillsPicker()
    openSettingsSkills()
  })
  $('agent-skills-connectors')?.addEventListener('click', () => {
    state.agentSkillsPickerOpen = false
    paintAgentSkillsPicker()
    openSettingsConnectors()
  })
  document.querySelectorAll('[data-local-skill-pick]').forEach((btn) => {
    btn.onclick = () => {
      const name = btn.getAttribute('data-local-skill-pick')
      const skill = (state.localAgentSkills || []).find((row) => row.name === name)
      if (skill) toggleLocalSkillAttachment(skill)
    }
  })
  document.querySelectorAll('[data-plugin-install-pop]').forEach((btn) => {
    btn.onclick = () => {
      void installMarketplacePlugin(btn.getAttribute('data-plugin-install-pop')).then(() => paintAgentSkillsPicker())
    }
  })
  document.querySelectorAll('[data-skill-pick]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-skill-pick')
      const skill = state.userSkills.find((row) => row.id === id)
      if (skill) toggleSkillAttachment(skill)
    }
  })
  document.querySelectorAll('[data-plugin-skill-pick]').forEach((btn) => {
    btn.onclick = () => {
      const skill = flattenPluginSkills().find((row) => row.id === btn.getAttribute('data-plugin-skill-pick'))
      if (skill) togglePluginSkillAttachment(skill)
    }
  })
}

async function openAgentSkillsPicker() {
  if (state.agentBusy) return
  state.agentSkillsPickerOpen = !state.agentSkillsPickerOpen
  if (!state.agentSkillsPickerOpen) {
    paintAgentSkillsPicker()
    return
  }
  paintAgentSkillsPicker()
  await loadLocalAgentSkills()
  if (state.user) await Promise.all([loadUserSkills(), loadPlugins()])
  paintAgentSkillsPicker()
}

function bindAgentSkillsButton() {
  $('agent-skills-btn')?.addEventListener('click', () => void openAgentSkillsPicker())
}

function bindAgentAttachments() {
  const input = $('agent-file-input')
  const pick = $('agent-attach')
  if (pick) {
    pick.onclick = () => void openAgentSkillsPicker()
  }
  if (input) {
    input.onchange = () => {
      void addAgentFiles([...input.files])
      input.value = ''
    }
  }
  $('agent-attach-row')?.querySelectorAll('[data-rm]').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.rm)
      state.agentAttachments.splice(idx, 1)
      refreshAgentAttachRow()
    }
  })
  $('agent-attach-row')?.querySelectorAll('[data-skill-rm]').forEach((btn) => {
    btn.onclick = () => {
      detachSkillFromThread(btn.getAttribute('data-skill-rm'))
    }
  })
  $('agent-attach-row')?.querySelectorAll('[data-plugin-skill-rm]').forEach((btn) => {
    btn.onclick = () => {
      detachPluginSkillFromThread(btn.getAttribute('data-plugin-skill-rm'))
    }
  })
  $('agent-attach-row')?.querySelectorAll('[data-local-skill-rm]').forEach((btn) => {
    btn.onclick = () => {
      detachLocalSkillFromThread(btn.getAttribute('data-local-skill-rm'))
    }
  })
  $('agent-attach-row')?.querySelectorAll('[data-manual-skill-rm]').forEach((btn) => {
    btn.onclick = () => {
      detachManualSkillFromThread(
        btn.getAttribute('data-manual-skill-rm'),
        btn.getAttribute('data-manual-skill-file') || '',
      )
    }
  })
  $('agent-attach-row')?.querySelectorAll('[data-full]').forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      openAgentImageLightbox(btn.dataset.full)
    }
  })
  const box = $('agent-input')
  if (box && !box.dataset.pasteBound) {
    box.dataset.pasteBound = '1'
    box.addEventListener('paste', (event) => {
      const files = []
      const items = event.clipboardData?.items
      if (items) {
        for (const item of items) {
          if (item.kind === 'file') {
            const file = item.getAsFile()
            if (file) files.push(file)
          }
        }
      }
      if (!files.length && event.clipboardData?.files?.length) {
        files.push(...event.clipboardData.files)
      }
      if (files.length) {
        event.preventDefault()
        void addAgentFiles(files.filter(Boolean))
      }
    })
  }
}

function refreshAgentAttachRow() {
  const row = $('agent-attach-row')
  if (!row) return
  row.innerHTML = renderAgentAttachChips()
  bindAgentAttachments()
  bindLogoFallback(row)
}

function clearAgentComposerAttachments() {
  state.agentAttachments = []
  const fi = $('agent-file-input')
  if (fi) fi.value = ''
  refreshAgentAttachRow()
}

function agentFileSizeCap(file) {
  const mime = file.type || ''
  const name = file.name || ''
  if (mime.startsWith('image/')) return 8_000_000
  if (mime.startsWith('video/')) return 8_000_000
  if (/\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|epub|rtf|zip)$/i.test(name)) return 8_000_000
  if (mime.startsWith('text/') || /\.(md|txt|json|csv|ts|tsx|js|jsx|py|html|css|xml|yaml|yml|skill|rtf|log|ini)$/i.test(name)) {
    return 400_000
  }
  return 2_000_000
}

function isAgentTextFile(file) {
  const mime = file.type || ''
  const name = file.name || ''
  return (
    mime.startsWith('text/') ||
    /\.(md|txt|json|csv|ts|tsx|js|jsx|py|html|css|xml|yaml|yml|skill|rtf|log|ini|cfg|conf|toml|vue|svelte|astro)$/i.test(name)
  )
}

async function addAgentFiles(fileList) {
  for (const file of fileList) {
    if (!file) continue
    if (state.agentAttachments.length >= 6) break
    const cap = agentFileSizeCap(file)
    if (file.size > cap) continue
    const name = file.name || 'attachment'
    const mime = file.type || 'application/octet-stream'
    const entry = { name, mime, size: file.size }
    if (isAgentTextFile(file)) {
      try {
        entry.text = (await file.text()).slice(0, 200_000)
        const skillMeta = skillMetaFromAgentText(name, entry.text)
        if (skillMeta) {
          attachManualSkillToThread(skillMeta)
          continue
        }
      } catch {
        continue
      }
    } else {
      entry.dataUrl = await readBlobAsDataUrl(file)
      if (!mime.startsWith('image/') && !mime.startsWith('video/')) {
        try {
          const extracted = await api.extractDocument?.({ name, mime, dataUrl: entry.dataUrl })
          if (extracted?.text) entry.text = extracted.text.slice(0, 200_000)
          if (extracted?.analysis) entry.analysis = extracted.analysis
        } catch {
          /* agent harness extracts again on send */
        }
      }
      if (mime.startsWith('image/')) {
        try {
          entry.dataUrl = await compressAgentImage(entry.dataUrl)
          entry.mime = /^data:([^;]+)/.exec(entry.dataUrl)?.[1] || mime
          entry.size = Math.round((entry.dataUrl.length * 3) / 4)
        } catch {
          /* keep original bytes */
        }
        try {
          entry.thumbUrl = await makeAttachThumb(entry.dataUrl)
        } catch {
          entry.thumbUrl = entry.dataUrl
        }
      }
    }
    state.agentAttachments.push(entry)
  }
  state.agentAttachments = state.agentAttachments.slice(0, 6)
  refreshAgentAttachRow()
}

function readBlobAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Downscale screenshots so the model always gets the pixels (IPC/HTTP stay small). */
function compressAgentImage(dataUrl, maxEdge = 1600) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      const scale = Math.min(1, maxEdge / Math.max(w, h, 1))
      if (scale >= 1 && String(dataUrl || '').length < 700_000) {
        resolve(dataUrl)
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(w * scale))
      canvas.height = Math.max(1, Math.round(h * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.84))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

function threadForAgentEvent() {
  const id = state.agentRunThreadId || state.activeThreadId
  return state.threads.find((th) => th.id === id) || activeThread()
}

function agentLiveStatusFromState() {
  if (!activeThreadIsRunning()) return ''
  if (state.agentLiveStatus) return state.agentLiveStatus
  if (state.agentLiveFile?.detail) return state.agentLiveFile.detail
  if (state.agentLiveFile?.rel) {
    const action = state.agentLiveFile.action || 'Reading'
    return `${action} ${state.agentLiveFile.rel}`
  }
  const t = threadForAgentEvent()
  const act = t.items.find((i) => i.role === 'activity' && i.open)
  if (act?.status) return act.status
  if (act?.steps?.length) {
    for (let i = act.steps.length - 1; i >= 0; i--) {
      const step = act.steps[i]
      if (step.kind === 'tool' && step.state === 'running') {
        return agentToolLiveLabel(step.name, step.args, 'start')
      }
    }
  }
  return 'Agent working…'
}

function setAgentLiveStatus(text) {
  state.agentLiveStatus = String(text || '').trim()
  refreshAgentRunBar()
  const t = activeThread()
  if (t?.items?.length) {
    const { pin } = agentThreadScrollItems(t.items)
    if (pin) paintAgentUserPin(pin, t)
  }
}

function refreshAgentRunBar() {
  const runBar = $('agent-run-bar')
  const runLabel = $('agent-run-label')
  const runDetail = $('agent-run-detail')
  const activeRunning = activeThreadIsRunning()
  if (runBar) {
    runBar.hidden = !activeRunning
    runBar.classList.toggle('is-active', activeRunning)
    runBar.style.display = activeRunning ? '' : 'none'
    if (!activeRunning) {
      if (runLabel) runLabel.textContent = ''
      if (runDetail) runDetail.textContent = ''
    }
  }
  if (!activeRunning) {
    updateStatus()
    return
  }
  const main = agentLiveStatusFromState()
  if (runLabel) runLabel.textContent = main
  updateStatus()
  if (runDetail) {
    const line =
      state.agentLiveFile?.line && state.agentLiveFile?.lineTotal
        ? `Line ${state.agentLiveFile.line} / ${state.agentLiveFile.lineTotal}`
        : ''
    const file = state.agentLiveFile?.rel || ''
    runDetail.textContent = line || (file && !main.includes(file) ? file : '')
  }
}

function renderAgentQueueStrip() {
  const row = $('agent-queue-row')
  if (!row) return
  const tid = state.activeThreadId
  const items = state.agentOutbox
    .map((q, idx) => ({ q, idx }))
    .filter(({ q }) => !q.threadId || q.threadId === tid)
  if (!items.length) {
    row.hidden = true
    row.innerHTML = ''
    return
  }
  row.hidden = false
  row.innerHTML = `<div class="agent-queue-head">Wait line (${items.length}) — runs after current task · Send now skips the queue</div>${items
    .map(
      ({ q, idx }, display) => `<div class="agent-queue-item" data-outbox-idx="${idx}">
        <span class="agent-queue-num">${display + 1}</span>
        <span class="agent-queue-text">${escapeHtml((q.text || (q.attach?.length ? 'Attachment' : '')).slice(0, 160))}</span>
        <button type="button" class="agent-queue-send-now" data-outbox-idx="${idx}">Send now</button>
        <button type="button" class="agent-queue-remove" data-outbox-idx="${idx}" aria-label="Remove">×</button>
      </div>`,
    )
    .join('')}`
  row.querySelectorAll('.agent-queue-remove').forEach((btn) => {
    btn.onclick = () => {
      const i = Number(btn.dataset.outboxIdx)
      if (i >= 0 && i < state.agentOutbox.length) state.agentOutbox.splice(i, 1)
      renderAgentQueueStrip()
    }
  })
  row.querySelectorAll('.agent-queue-send-now').forEach((btn) => {
    btn.onclick = () => {
      const i = Number(btn.dataset.outboxIdx)
      const item = state.agentOutbox[i]
      if (!item) return
      state.agentOutbox.splice(i, 1)
      renderAgentQueueStrip()
      state.agentInterruptAfterCancel = composeInterruptPayload(
        item.text || '',
        item.attach || [],
        item.threadId || state.activeThreadId,
      )
      setAgentLiveStatus('Stopping to run queued message…')
      void api.agentCancel()
    }
  })
}

function updateAgentBusyUi() {
  void syncAgentRunStateFromMain().then(() => {
    refreshAgentRunBar()
    renderAgentTabs()
  })
  if (!state.agentBusy) {
    state.agentLiveStatus = ''
    document.body.classList.remove('agent-busy')
  } else {
    document.body.classList.add('agent-busy')
    window.SoumtokAgentVoice?.stop?.()
  }
  const stop = $('agent-stop')
  const go = $('agent-go')
  const queueBtn = $('agent-queue')
  const input = $('agent-input')
  const activeRunning = activeThreadIsRunning()
  if (stop) stop.hidden = !state.agentBusy
  const runStop = $('agent-run-stop')
  if (runStop) runStop.hidden = !activeRunning
  if (go) {
    go.disabled = false
    go.title = activeRunning ? 'Add to wait line (runs after current task)' : 'Send message'
  }
  const sendNow = $('agent-send-now')
  if (sendNow) sendNow.hidden = !activeRunning
  if (queueBtn) queueBtn.hidden = true
  if (input) {
    input.disabled = false
    input.placeholder = activeRunning
      ? 'Type while agent works — Send = queue · Send now = interrupt · Ctrl+Enter = steer'
      : state.agentDriver === 'bot'
        ? 'Message New Bot'
        : 'Describe a task or ask a question…'
  }
  $('agent-attach')?.removeAttribute('disabled')
  $('agent-voice-btn')?.removeAttribute('disabled')
  if (activeRunning) {
    void refreshTerminalTrayState().then(() => paintAgentBgTerminals())
    syncAgentReviewLive()
    paintAgentReviewTray()
  }
  refreshAgentRunBar()
  renderAgentQueueStrip()
  updateAgentEditorTrack()
  if (activeRunning) closeModelPicker()
  renderAgentTabs()
  syncAgentAvatarUi()
  updateStatus()
}

function syncAgentReviewLive() {
  const t = activeThread()
  const act = t.items.find((i) => i.role === 'activity' && (i.open || state.agentBusy))
  if (act?.steps?.length) updateAgentReviewFromActivity(act)
}

function interruptHandoffForThread(threadId) {
  const t = state.threads.find((row) => row.id === threadId) || activeThread()
  const act = t.items.find((i) => i.role === 'activity' && (i.open || i.steps?.length))
  const edited = [
    ...new Set(
      (act?.steps || [])
        .filter(
          (s) =>
            s.kind === 'tool' &&
            /^(write|diff|edit|str_replace|apply_patch)$/i.test(String(s.name || '')) &&
            s.state === 'done' &&
            s.path,
        )
        .map((s) => s.path),
    ),
  ]
  if (edited.length) return `interrupted after editing ${edited.slice(0, 8).join(', ')}`
  if (act?.status) return `interrupted during: ${act.status}`
  return 'interrupted mid-task'
}

function composeInterruptPayload(text, attach, threadId) {
  return {
    text: text || '',
    attach: attach || [],
    threadId: threadId || state.activeThreadId,
    handoff: interruptHandoffForThread(threadId || state.activeThreadId),
  }
}

function updateAgentReviewFromActivity(act) {
  const fileMap = new Map()
  let checkpointId = ''
  for (const step of act?.steps || []) {
    if (step.kind === 'checkpoint' && step.id) checkpointId = step.id
    const n = String(step.name || '').toLowerCase()
    if (step.kind === 'tool' && /^(write|diff|edit|str_replace|apply_patch)$/.test(n) && step.path) {
      fileMap.set(step.path, {
        path: step.path,
        added: step.linesAdded || 0,
        removed: step.linesRemoved || 0,
      })
    }
  }
  const files = [...fileMap.values()]
  state.agentReview = files.length
    ? {
        paths: files.map((f) => f.path),
        files,
        checkpointId: checkpointId || state.agentReview?.checkpointId || '',
        hidden: false,
      }
    : state.agentBusy
      ? state.agentReview
      : null
  paintAgentReviewTray()
}

function updateComposerTraysDock() {
  const dock = $('agent-composer-trays')
  if (!dock) return
  const canvas = $('agent-canvas-tray')
  const terms = $('agent-bg-terminals')
  const review = $('agent-review-tray')
  const any =
    (canvas && !canvas.hidden) || (terms && !terms.hidden) || (review && !review.hidden)
  dock.hidden = !any
}

function paintAgentReviewTray() {
  const tray = $('agent-review-tray')
  if (!tray) return
  const rev = state.agentReview
  if (!rev || rev.hidden || !rev.paths?.length) {
    tray.hidden = true
    updateComposerTraysDock()
    return
  }
  tray.hidden = false
  if (!tray.open) tray.open = true
  const label = $('agent-review-label')
  if (label) label.textContent = `${rev.paths.length} File${rev.paths.length === 1 ? '' : 's'}`
  const list = $('agent-review-files')
  if (list) {
    list.innerHTML = (rev.files || rev.paths.map((p) => ({ path: p, added: 0, removed: 0 })))
      .map(
        (f) =>
          `<li class="agent-review-file">
            <button type="button" class="agent-review-file-btn" data-agent-path="${escapeAttr(f.path)}" title="${escapeAttr(f.path)}">
              <span class="agent-review-file-name">${escapeHtml(agentFileLeaf(f.path))}</span>
              ${f.added || f.removed ? agentDiffStatHtml(f.added, f.removed) : ''}
            </button>
            <button type="button" class="agent-review-file-undo" data-review-undo="${escapeAttr(f.path)}" title="Restore this file">Restore</button>
          </li>`,
      )
      .join('')
    list.querySelectorAll('[data-agent-path]').forEach((btn) => {
      btn.onclick = () => void openFile(joinWorkspacePath(btn.dataset.agentPath))
    })
    list.querySelectorAll('[data-review-undo]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation()
        const rel = btn.dataset.reviewUndo
        const id = state.agentReview?.checkpointId
        if (!id || !rel) return
        void api.checkpointRestore(id, [rel]).then((res) => {
          appendPanelOutput(`[review] ${res.ok ? res.text : res.error || 'Restore failed'}\n`)
          if (state.agentReview?.files) {
            state.agentReview.files = state.agentReview.files.filter((f) => f.path !== rel)
            state.agentReview.paths = state.agentReview.files.map((f) => f.path)
            if (!state.agentReview.paths.length) state.agentReview.hidden = true
          }
          paintAgentReviewTray()
          void refreshTree()
        })
      }
    })
  }
  updateComposerTraysDock()
}

async function refreshTerminalTrayState() {
  if (!state.folder || typeof api.terminalState !== 'function') return
  try {
    const ts = await api.terminalState()
    state.agentTerminalLive = ts.devServerUp && ts.urls?.length ? ts.urls[ts.urls.length - 1] : ''
    if (ts.devServerUp && ts.urls?.length) {
      const url = ts.urls[ts.urls.length - 1]
      const exists = state.agentBgTerminals.some((r) => r.command.includes(url))
      if (!exists) {
        state.agentBgTerminals.unshift({ command: `Dev server ${url}`, label: url, at: Date.now(), live: true })
        state.agentBgTerminals = state.agentBgTerminals.slice(0, 8)
      }
    }
  } catch {
    /* optional */
  }
}

function paintAgentBgTerminals() {
  const tray = $('agent-bg-terminals')
  const list = $('agent-bg-terminals-list')
  const label = $('agent-bg-terminals-label')
  const rows = state.agentBgTerminals || []
  if (!tray || !list) return
  if (!rows.length && !state.agentTerminalLive) {
    tray.hidden = true
    updateComposerTraysDock()
    return
  }
  tray.hidden = false
  if (label) {
    const count = rows.length || (state.agentTerminalLive ? 1 : 0)
    const base = count
      ? `${count} background terminal${count === 1 ? '' : 's'}`
      : 'Dev server running'
    const live = state.agentTerminalLive
    label.innerHTML =
      live && count <= 1
        ? `${escapeHtml(base)}<span class="agent-dock-meta"> · ${escapeHtml(live.replace(/^https?:\/\//, ''))}</span>`
        : escapeHtml(base)
  }
  const listRows = rows.slice()
  if (state.agentTerminalLive && !listRows.some((r) => r.label.includes(state.agentTerminalLive))) {
    listRows.unshift({
      label: state.agentTerminalLive,
      live: true,
    })
  }
  list.innerHTML = listRows
    .map(
      (r) =>
        `<li class="agent-bg-term-row${r.live ? ' is-live' : ''}"><span class="agent-bg-term-icon" aria-hidden="true">›_</span><span class="agent-bg-term-cmd">${escapeHtml(r.label)}</span></li>`,
    )
    .join('')
  updateComposerTraysDock()
}

function paintAgentCanvasTray() {
  const tray = $('agent-canvas-tray')
  const label = $('agent-canvas-label')
  const c = state.agentCanvas
  if (!tray) return
  if (!c || c.hidden) {
    tray.hidden = true
    updateComposerTraysDock()
    return
  }
  tray.hidden = false
  if (label) label.textContent = `Canvas: ${c.title || c.path || 'Design'}`
  updateComposerTraysDock()
}

function bindAgentReviewTray() {
  document.querySelectorAll('.agent-dock-summary-review .agent-dock-actions').forEach((el) => {
    el.onmousedown = (e) => e.preventDefault()
  })
  const keep = $('agent-review-keep')
  if (keep) {
    keep.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (state.agentReview) state.agentReview.hidden = true
      paintAgentReviewTray()
    }
  }
  const undo = $('agent-review-undo')
  if (undo) {
    undo.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const id = state.agentReview?.checkpointId
      if (!id) return
      void api.checkpointRestore(id).then((res) => {
        appendPanelOutput(`[review] ${res.ok ? res.text : res.error || 'Restore failed'}\n`)
        if (state.agentReview) state.agentReview.hidden = true
        paintAgentReviewTray()
        void refreshTree()
        for (const tab of state.tabs) {
          if (tab.path) delete tab.beforeAgentEdit
        }
        renderEditor()
      })
    }
  }
  const reviewOpen = $('agent-review-open')
  if (reviewOpen) {
    reviewOpen.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const rev = state.agentReview
      if (!rev?.paths?.length) return
      void (async () => {
        for (const rel of rev.paths.slice(0, 12)) {
          await openFile(joinWorkspacePath(rel))
        }
      })()
    }
  }
  const canvasOpen = $('agent-canvas-open')
  if (canvasOpen) {
    canvasOpen.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const p = state.agentCanvas?.path || 'CANVAS.md'
      void openFile(joinWorkspacePath(p))
    }
  }
  paintAgentBgTerminals()
  paintAgentCanvasTray()
}

function userWantsPlanFirstLocal(text) {
  const t = String(text || '')
  if (/\b(what can you do|what can u do|what do you do|what can you do with|capabilities)\b/i.test(t)) return false
  if (/\bbuild\b/i.test(t) && !/\bplan first\b/i.test(t)) return false
  return /\b(plan first|make a plan|create a plan|plan mode|let'?s plan|we plan|plan before|write a plan|need a plan|plan it first|plan this first|plan out)\b/i.test(t)
}

function userWantsBuildPlanLocal(text) {
  const t = String(text || '').trim()
  if (/^build\.?$/i.test(t)) return true
  return /\b(execute plan|go ahead and build|build it now|start building|approve plan|run the plan|implement plan)\b/i.test(t)
}

function getOrCreateActivity(t) {
  const open = t.items.find((i) => i.role === 'activity' && i.open)
  if (open) return open
  const last = t.items[t.items.length - 1]
  if (last?.role === 'activity') {
    last.open = true
    return last
  }
  const act = { role: 'activity', open: true, steps: [], status: '', startedAt: Date.now() }
  t.items.push(act)
  return act
}

function closeActivity(t) {
  for (const item of t.items) {
    if (item.role === 'activity' && item.open) item.open = false
  }
}

function removeClosedActivities(t) {
  t.items = t.items.filter((item) => {
    if (item.role !== 'activity') return true
    if (item.open) return true
    return Boolean(item.status || (item.steps && item.steps.length))
  })
}

function appendAgentReply(t, text, modelId) {
  let safe = scrubDsmlForDisplay(text)
  if (
    /\[Soumtok harness\]/i.test(safe) ||
    /\bharness blocked\b/i.test(safe) ||
    /\bwant me to proceed\b/i.test(safe)
  ) {
    return
  }
  const { prose, digest } = splitAgentReplySections(safe)
  if (
    digest &&
    t.items.some(
      (i) =>
        i.role === 'activity' &&
        (i.steps || []).some((s) => s.kind === 'tool' && (s.state === 'done' || s.result)),
    )
  ) {
    safe = prose
  }
  if (!safe) return
  const last = [...t.items].reverse().find((i) => i.role === 'agent')
  if (last && last.text === safe) return
  const requested = t.model || state.agentModel || modelId
  const foot = modelDisplayNameForId(requested)
  const parsed = parseAgentChoices(safe)
  const row = {
    role: 'agent',
    text: safe,
    model: foot,
    modelId: requested,
  }
  applyParsedChoices(row, parsed)
  t.items.push(row)
}

function ensureAgentChoicesFromText(t, text, modelId) {
  const parsed = parseAgentChoices(text)
  if (!parsed?.items?.length) return false
  const lastAgent = [...t.items].reverse().find((i) => i.role === 'agent')
  if (lastAgent && !lastAgent.choicePicked) {
    const existing = lastAgent.choices?.length || 0
    if (!existing || parsed.items.length > existing) {
      applyParsedChoices(lastAgent, parsed)
      if (String(text || '').length > String(lastAgent.text || '').length) lastAgent.text = text
    }
    return true
  }
  appendAgentReply(t, text, modelId)
  return true
}

function finishOpenActivity(t, label) {
  let act = t.items.find((i) => i.role === 'activity' && i.open)
  if (!act) act = [...t.items].reverse().find((i) => i.role === 'activity')
  if (!act) return
  act.open = false
  act.thoughtMs = Date.now() - (Number(act.startedAt) || Date.now())
  act.status = label || agentActivitySummary(act)
  updateAgentReviewFromActivity(act)
}

/** One Agent card per user turn — drop stray duplicates from racey UI sync. */
function collapseRunActivities(t) {
  const acts = t.items.filter((i) => i.role === 'activity')
  if (acts.length <= 1) return
  const keep = acts[acts.length - 1]
  t.items = t.items.filter((i) => i.role !== 'activity' || i === keep)
}

function stripTrailingStatus(t) {
  while (t.items.length) {
    const last = t.items[t.items.length - 1]
    if (last?.role === 'status' || (last?.role === 'activity' && !last.open && !last.steps?.length)) t.items.pop()
    else break
  }
}

function handleAgentStreamEvent(ev) {
  const jobId = String(ev.jobId || '')
  const seq = Number(ev.seq)
  if (jobId && Number.isFinite(seq) && seq > 0) {
    const last = agentEventCursor.get(jobId) || 0
    if (seq <= last) return
    agentEventCursor.set(jobId, seq)
  }
  const t = threadForAgentEvent()
  if (ev.type === 'status') {
    setAgentAvatarState('thinking')
    const act = getOrCreateActivity(t)
    const short = agentStatusDisplayText(ev.text)
    act.status = short
    if (!(act.steps || []).length) act.thought = short
    setAgentLiveStatus(short)
    if (state.agentLiveFile) {
      state.agentLiveFile.detail = ev.text
      updateAgentEditorTrack()
    }
  } else if (ev.type === 'assistant') {
    t.lastModelUsed = ev.model || t.lastModelUsed
    if (ev.text) appendAgentReply(t, ev.text, t.model || state.agentModel || ev.requestedModel)
    if (!state.agentBusy) {
      finishOpenActivity(t)
      stripPendingAgent(t)
    }
  } else if (ev.type === 'file') {
    const p = String(ev.path || '')
    if (p && !/assets[/\\]generated[/\\]/i.test(p)) {
      void revealAgentFile(p, { action: 'Reading', scan: false })
    }
  } else if (ev.type === 'tool') {
    setAgentAvatarState('working')
    const act = getOrCreateActivity(t)
    const n = String(ev.name || '').toLowerCase()
    const lastStep = act.steps[act.steps.length - 1]
    if (
      n === 'generate_image' &&
      lastStep?.kind === 'tool' &&
      String(lastStep.name || '').toLowerCase() === 'generate_image' &&
      lastStep.state === 'running'
    ) {
      lastStep.args = { ...(lastStep.args || {}), ...(ev.args || {}) }
    } else {
      const step = { kind: 'tool', name: ev.name, args: ev.args || {}, state: 'running' }
      if (ev.contentPreview) {
        step.contentPreview = ev.contentPreview
        step.path = ev.path || ev.args?.path || ev.args?.file || ''
      }
      act.steps.push(step)
    }
    act.status = agentToolLiveLabel(ev.name, ev.args, 'start')
    setAgentLiveStatus(act.status)
    if (n !== 'generate_image') agentFollowToolStart(ev.name, ev.args)
  } else if (ev.type === 'checkpoint') {
    const act = getOrCreateActivity(t)
    act.steps.push({ kind: 'checkpoint', id: ev.id, paths: ev.paths || [] })
  } else if (ev.type === 'todo') {
    const act = getOrCreateActivity(t)
    const incoming = Array.isArray(ev.todos) ? ev.todos : []
    if (ev.merge && act.todos?.length) {
      const map = new Map(act.todos.map((row) => [row.id, row]))
      for (const row of incoming) map.set(row.id, { ...map.get(row.id), ...row })
      act.todos = [...map.values()]
    } else act.todos = incoming
  } else if (ev.type === 'ask') {
    t.items.push({
      role: 'ask',
      id: ev.id,
      title: ev.title || 'Question',
      intro: ev.intro || '',
      questions: ev.questions || [],
      pending: true,
      _picked: {},
    })
  } else if (ev.type === 'mode_switch') {
    const raw = String(ev.target || 'agent').toLowerCase()
    const target = ['plan', 'ask', 'debug'].includes(raw) ? raw : 'agent'
    state.agentMode = target
    t.mode = target
    $('agent-mode-label').textContent = agentModeLabel()
    setAgentLiveStatus(ev.explanation ? `Mode → ${target}: ${ev.explanation}` : `Mode → ${target}`)
  } else if (ev.type === 'plan_file') {
    state.agentCanvas = null
    paintAgentCanvasTray()
    const rel = ev.path || 'PLAN.md'
    void openFile(joinWorkspacePath(rel))
    setAgentLiveStatus('Plan saved — review PLAN.md, then send BUILD')
  } else if (ev.type === 'canvas') {
    state.agentCanvas = { path: ev.path || 'CANVAS.md', title: ev.title || 'Design', hidden: false }
    paintAgentCanvasTray()
    void openFile(joinWorkspacePath(state.agentCanvas.path))
  } else if (ev.type === 'workspace_refresh') {
    void refreshTree()
  } else if (ev.type === 'result') {
    if (ev.ok && /^attempt_completion$/i.test(String(ev.name || '')) && ev.text) {
      ensureAgentChoicesFromText(t, ev.text, t.model || state.agentModel)
    }
    const act = t.items.find((i) => i.role === 'activity' && i.open)
    if (act) {
      for (let i = act.steps.length - 1; i >= 0; i--) {
        const step = act.steps[i]
        if (step.kind === 'tool' && step.name === ev.name && step.state === 'running') {
          step.state = ev.ok ? 'done' : 'error'
          step.result = ev.text || '(empty)'
          step.path = ev.path || ''
          step.linesAdded = ev.linesAdded
          step.linesRemoved = ev.linesRemoved
          step.diffPreview = ev.diffPreview
          step.image = ev.image || ''
          step.aspect = ev.aspect || step.args?.aspect || step.aspect || ''
          act.status = agentToolLiveLabel(ev.name, step.args, ev.ok ? 'done' : 'start')
          setAgentLiveStatus(act.status)
          agentFollowToolResult(ev.name, ev.ok, ev.text, ev.path)
          if (
            ev.ok &&
            /^(write|diff|edit|str_replace|apply_patch|delete|wipe_workspace|clear_workspace)$/i.test(n)
          ) {
            void refreshTree()
          }
          if (act && ev.ok && /^(write|diff|edit|str_replace|apply_patch)$/i.test(n) && ev.path) {
            updateAgentReviewFromActivity(act)
          }
          break
        }
      }
    }
  }
  if (t.id === state.activeThreadId) {
    syncAgentReviewLive()
    paintAgentReviewTray()
    paintAgentBgTerminals()
    schedulePaintAgentThread()
  }
}

function stripPendingAgent(t) {
  const idx = t.items.findIndex((i) => i.role === 'agent' && i.pending)
  if (idx >= 0) t.items.splice(idx, 1)
}

function accountHtml() {
  const who = state.user?.email || state.user?.name || 'Not signed in'
  return `<div class="side-head">Account</div><div class="side-body">
    <p class="msg">${escapeHtml(who)}</p>
    ${state.user ? '<button class="ghost" id="logout-btn">Sign out</button> <button class="primary" id="billing-btn">Billing</button>' : '<button class="primary" id="login-btn">Sign in</button>'}
    <p class="msg">Plans and invoices open in your account. This IDE edits files on this computer.</p>
  </div>`
}

function stopLoginPoll() {
  if (loginPollTimer) {
    clearInterval(loginPollTimer)
    loginPollTimer = null
  }
}

async function tryPollLogin() {
  if (!pendingLoginId) return false
  const data = await api.pollLogin(pendingLoginId)
  if (data.expired) {
    stopLoginPoll()
    pendingLoginId = ''
    try {
      sessionStorage.removeItem('soumtok-desktop-pending')
    } catch {
      /* ignore */
    }
    setAuthBootLoading(false)
    updateAuthContinueUi()
    mountAuthGateAvatar()
    const note = $('auth-note')
    if (note) {
      note.textContent = 'Sign-in timed out. Click Sign in again.'
    }
    return false
  }
  if (data.pending) {
    setAuthBootLoading(true, 'Finishing sign-in…')
    const note = $('auth-note')
    if (note) note.textContent = 'Almost there — click Continue in app or wait a moment.'
    updateAuthContinueUi()
    return false
  }
  if (data.user) {
    stopLoginPoll()
    pendingLoginId = ''
    try {
      sessionStorage.removeItem('soumtok-desktop-pending')
    } catch {
      /* ignore */
    }
    state.user = data.user
    const note = $('auth-note')
    if (note) note.textContent = ''
    updateAuthContinueUi()
    await completeSignedInEntry()
    await syncModelCatalogForSession()
    if (state.side === 'agent' || state.side === 'account') renderSide()
    return true
  }
  return false
}

function startLoginPoll(id) {
  pendingLoginId = id
  stopLoginPoll()
  try {
    sessionStorage.setItem('soumtok-desktop-pending', id)
  } catch {
    /* ignore */
  }
  void tryPollLogin()
  loginPollTimer = setInterval(() => {
    void tryPollLogin()
  }, 1500)
}

async function login(mode = 'in') {
  const note = $('auth-note')
  setAuthBootLoading(true, 'Opening sign-in in your browser…')
  if (note) note.textContent = ''
  $('st-user').textContent = 'Waiting for browser…'
  const data = await api.login(mode)
  if (data.error) {
    setAuthBootLoading(false)
    setMode('auth')
    mountAuthGateAvatar()
    $('st-user').textContent = 'Not signed in'
    if (note) note.textContent = data.error
    return
  }
  if (data.user) {
    state.user = data.user
    await completeSignedInEntry()
    await syncModelCatalogForSession()
    return
  }
  if (data.pendingId) {
    const bootMsg = $('auth-boot-msg')
    if (bootMsg) {
      bootMsg.textContent =
        'Finish sign-in in the browser, then click Continue in app (we also detect it automatically).'
    }
    setAuthBootLoading(true, 'Waiting for you to sign in in the browser…')
    if (note) {
      note.textContent =
        'When the browser shows “You can return to the app”, click Continue in app below (or we will detect it automatically).'
    }
    startLoginPoll(data.pendingId)
    updateAuthContinueUi()
    return
  }
  setAuthBootLoading(false)
  setMode('auth')
  mountAuthGateAvatar()
  $('st-user').textContent = 'Not signed in'
  if (note) note.textContent = 'Sign in or create an account to continue'
}

async function logout() {
  stopLoginPoll()
  pendingLoginId = ''
  try {
    sessionStorage.removeItem('soumtok-desktop-pending')
  } catch {
    /* ignore */
  }
  flushWorkspaceSaveSync()
  await api.logout()
  setAuthBootLoading(false)
  state.user = null
  state.accountSummary = null
  state.tabs = []
  state.active = null
  state.threads = []
  state.activeThreadId = null
  setMode('auth')
  $('st-user').textContent = 'Not signed in'
  $('st-branch').textContent = ''
  updateStatus()
  const note = $('auth-note')
  if (note) note.textContent = 'Signed out. Sign in to continue.'
}

async function refreshSession() {
  const data = await api.session()
  state.user = data.user
  if (data?.api) state.appInfo = { ...(state.appInfo || {}), api: data.api }
  $('st-user').textContent = state.user?.email || state.user?.name || 'Not signed in'
  if (state.user) {
    void syncModelCatalogForSession()
    void loadUserProfile()
  } else {
    state.profile = null
    state.avatarDataUrl = ''
    if (state.settingsOpen) renderSettingsScreen()
    if (data?.error) {
      const note = $('auth-note')
      if (note) note.textContent = data.error
    }
  }
}

function agentMessageNeedsProjectFolder(text, attach, thread) {
  const raw = String(text || '').trim()
  const files = Array.isArray(attach) ? attach : []
  const codingAttach = files.some((f) => {
    const n = String(f?.name || '').toLowerCase()
    return /\.(ts|tsx|js|jsx|py|go|rs|java|css|html|vue|svelte|json|yaml|toml)$/.test(n) && !/skill\.md$/i.test(n)
  })
  if (codingAttach) return true
  if (!raw && !files.length) return false
  const t = raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (/^(hi|hello|hey|thanks|thank you|yo)$/.test(t)) return false
  if (/\b(what can you do|what do you do|how can you help|explain|what is|who is|why|tell me about|help me understand)\b/.test(t)) {
    return false
  }
  if (/\b(build|fix|implement|refactor|scaffold|write|edit|grep|read my|deploy|npm|terminal|wipe|list_dir|run my|localhost)\b/.test(t)) {
    return true
  }
  if (/\b(build|create|make)\b/.test(t) && /\b(app|website|site|landing|dashboard)\b/.test(t)) return true
  return false
}

async function sendAgent(queued, options) {
  if (!requireUser()) return
  const input = $('agent-input')
  const text = queued?.text ?? input?.value.trim()
  let attach = queued?.attach ?? state.agentAttachments.slice()
  const sendThread = queued?.threadId ? state.threads.find((row) => row.id === queued.threadId) || activeThread() : activeThread()
  if (!state.folder && agentMessageNeedsProjectFolder(text, attach, sendThread)) {
    paintAgentThread()
    activeThread().items.push({
      role: 'agent',
      text: 'Open a project folder first (File → Open Folder) for code and file tasks. For general questions, just ask — no folder needed.',
    })
    paintAgentThread()
    return
  }
  if (!text && !attach.length) return
  if (options?.steerNow && state.agentBusy && (text || attach.length)) {
    if (input && !queued) input.value = ''
    clearAgentComposerAttachments()
    const steerText = text || (attach.length ? 'See attached files in my follow-up.' : '')
    if (steerText) await api.agentSteer(steerText)
    setAgentLiveStatus('Steering agent at next tool step…')
    return
  }
  if (state.agentBusy && !queued) {
    if (options?.interrupt && (text || attach.length)) {
      state.agentInterruptAfterCancel = composeInterruptPayload(text || '', attach.slice(), state.activeThreadId)
      if (input) input.value = ''
      clearAgentComposerAttachments()
      setAgentLiveStatus('Stopping current run…')
      await api.agentCancel()
      return
    }
    if (options?.queueOnly && (text || attach.length)) {
      state.agentOutbox.push({
        text: text || '',
        attach: attach.slice(),
        threadId: state.activeThreadId,
      })
      if (input) input.value = ''
      clearAgentComposerAttachments()
      renderAgentQueueStrip()
      return
    }
    const onOtherTab = state.agentRunThreadId && state.agentRunThreadId !== state.activeThreadId
    if (onOtherTab && (text || attach.length)) {
      state.agentOutbox.push({ text: text || '', attach: attach.slice(), threadId: state.activeThreadId })
      if (input) input.value = ''
      clearAgentComposerAttachments()
      renderAgentQueueStrip()
      return
    }
    if (text || attach.length) {
      void sendAgent(undefined, { queueOnly: true })
      return
    }
    return
  }
  if (input && !queued) input.value = ''
  const t = queued?.threadId ? state.threads.find((row) => row.id === queued.threadId) || activeThread() : activeThread()
  if (queued?.threadId && t.id !== state.activeThreadId) {
    state.activeThreadId = t.id
  }
  if (text && userWantsPlanFirstLocal(text)) {
    state.agentMode = 'plan'
    $('agent-mode-label').textContent = agentModeLabel()
  } else if (text && userWantsBuildPlanLocal(text)) {
    state.agentMode = 'agent'
    $('agent-mode-label').textContent = agentModeLabel()
  }
  t.mode = state.agentMode
  t.model = state.agentModel
  const label = text || (attach[0]?.name ? `Image: ${attach[0].name}` : 'Attachment')
  if (t.title === 'New Agent' || t.title === 'New Bot') t.title = label.length > 40 ? `${label.slice(0, 38)}…` : label
  touchThreadActivity(t)
  const handoffPrefix = queued?.handoff
    ? `[Soumtok: Previous run ${queued.handoff}. Start the NEW request below — do not resume the old task unless the user asks.]\n\n`
    : ''
  const userLine = stripAttachCaptions(text) || (attach.length ? '' : '')
  t.items.push({
    role: 'user',
    text: userLine,
    attachPreview: attach
      .filter((f) => f.mime?.startsWith('image/') && f.dataUrl)
      .map((f) => ({ name: f.name, dataUrl: f.dataUrl, thumbUrl: f.thumbUrl })),
  })
  t.items = t.items.filter((item) => item.role !== 'activity')
  clearAgentComposerAttachments()
  state.agentBusy = true
  state.agentRunThreadId = t.id
  state.agentLiveStatus = ''
  cancelExtensionHostIdleStop()
  setAgentAvatarState('thinking')
  setAgentLiveStatus('Sending to Soumtok…')
  t.items.push({ role: 'activity', open: true, steps: [], status: 'Sending to Soumtok…' })
  const runStartCount = t.items.filter((i) => i.role === 'agent').length
  if (!$('agent-thread')) renderAgentPanel()
  else {
    paintAgentThread()
    updateAgentBusyUi()
    renderAgentTabs()
    bindAgentThreadActions()
  }
  const prefs = effectiveAgentPrefs()
  const openFiles =
    prefs.includeOpenFiles === false
      ? []
      : state.tabs
          .filter((tab) => tab.path && !isBrowserTab(tab) && !isExtensionTab(tab))
          .map((tab) => tab.path)
  const runThreadId = t.id
  let res
  try {
    res = await api.agentRun({
      model: state.agentModel,
      mode: state.agentMode,
      driver: state.agentDriver,
      messages: t.modelMessages,
      userMessage:
        handoffPrefix + (stripAttachCaptions(text) || 'See attached image and help with my project.'),
      threadTitle: t.title || '',
      threadId: t.id,
      openFiles,
      files: attach,
      attachedSkills: (t.attachedSkills || []).map((skill) => ({
        id: skill.id,
        name: skill.name,
        file_name: skill.file_name,
        excerpt: skill.excerpt,
      })),
      attachedPluginSkills: (t.attachedPluginSkills || []).map((skill) => ({
        id: skill.id,
        skillId: skill.skillId,
        label: skill.label,
        pluginName: skill.pluginName,
        pluginId: skill.pluginId,
        description: skill.description,
        insert: skill.insert,
        sourceUrl: skill.sourceUrl,
      })),
      attachedLocalSkills: (t.attachedLocalSkills || []).map((skill) => ({
        name: skill.name,
        description: skill.description,
        source: skill.source,
      })),
      attachedManualSkills: (t.attachedManualSkills || []).map((skill) => ({
        name: skill.name,
        description: skill.description,
        source: skill.source,
        fileName: skill.fileName,
        body: skill.body,
      })),
      agentPrefs: prefs,
      subagentModel: state.subagentModel,
    })
  } finally {
    if (state.agentRunThreadId === runThreadId) {
      state.agentBusy = false
      state.agentRunThreadId = null
      state.agentLiveStatus = ''
      state.agentTerminalLive = ''
      setAgentAvatarState('idle')
      clearAgentReadVisuals()
    }
  }
  let activityLabel = 'Done'
  if (res.error) activityLabel = 'Stopped'
  else if (res.incomplete || (res.note && /incomplete|continue/i.test(String(res.note)))) {
    activityLabel = 'Incomplete — say continue'
  }
  finishOpenActivity(t, activityLabel)
  collapseRunActivities(t)
  removeClosedActivities(t)
  stripPendingAgent(t)
  updateAgentBusyUi()
  const interruptNext = state.agentInterruptAfterCancel
  if (interruptNext) {
    state.agentInterruptAfterCancel = null
    renderAgentPanel()
    updateStatus()
    await sendAgent(interruptNext)
    return
  }
  const agentRepliesDuringRun = t.items.filter((i) => i.role === 'agent').length - runStartCount
  const streamedReply = Boolean(res?.repliedViaEvent) || agentRepliesDuringRun > 0
  if (!res.error && res.text) {
    const lastAgent = [...t.items].reverse().find((i) => i.role === 'agent')
    const preamble =
      lastAgent &&
      lastAgent.text.length < 420 &&
      /^(i['']ll|let me|reading|looking)/i.test(String(lastAgent.text || '').trim())
    if (preamble && res.text.length > lastAgent.text.length + 40) {
      lastAgent.text = res.text
      lastAgent.model = modelDisplayNameForId(t.model || state.agentModel)
    } else if (!streamedReply) {
      appendAgentReply(t, res.text, t.model)
    }
  } else if (!res.error && !streamedReply) {
    const hadWrite = t.items.some((i) => {
      if (i.role === 'activity') {
        return (i.steps || []).some(
          (s) => /^(write|diff|edit)/i.test(String(s.name || '')) && s.state === 'done',
        )
      }
      return i.role === 'result' && /^(write|diff|edit)/i.test(String(i.name || i.toolName || ''))
    })
    const hadAnyTool = t.items.some((i) => {
      if (i.role === 'activity') return (i.steps || []).some((s) => s.state === 'done' || s.state === 'error')
      return i.role === 'result'
    })
    if (hadWrite) {
      appendAgentReply(t, 'Updated the files on disk. Reload the running page to see the change.', t.model)
    } else if (hadAnyTool) {
      appendAgentReply(
        t,
        'I looked at the project. Say continue if you want me to keep going — I will start localhost or apply the change next.',
        t.model,
      )
    }
  }
  if (res.error && res.error !== 'Cancelled') {
    removeClosedActivities(t)
    const lastAgent = [...t.items].reverse().find((i) => i.role === 'agent')
    if (!lastAgent || lastAgent.text !== res.error) {
      t.items.push({ role: 'agent', text: res.error })
    }
  }
  if (res.messages) {
    t.modelMessages = res.messages.filter((m) => m.role !== 'system')
  }
  if (res.note) t.items.push({ role: 'status', text: res.note })
  renderAgentPanel()
  updateStatus()
  scheduleWorkspaceSave()
  while (state.agentOutbox.length && !state.agentBusy) {
    const next = state.agentOutbox.shift()
    if (!next || (!next.text && !next.attach?.length)) continue
    if (next.threadId && next.threadId !== state.activeThreadId) {
      state.activeThreadId = next.threadId
      const th = activeThread()
      state.agentMode = th.mode || state.agentMode
      loadPersistedAgentModel()
      syncThreadModelFromGlobal()
      renderAgentPanel()
    }
    await sendAgent(next)
  }
}

function closePalette() {
  $('palette').hidden = true
  paletteMode = 'command'
  palettePick = 0
  quickOpenHits = []
}

function onPaletteKeydown(e) {
  const box = $('palette')
  if (e.key === 'Escape') {
    closePalette()
    return
  }
  const items = box.querySelectorAll('.pal-item')
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    palettePick = Math.min(palettePick + 1, Math.max(0, items.length - 1))
    syncPalettePick(items)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    palettePick = Math.max(palettePick - 1, 0)
    syncPalettePick(items)
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    const picked = items[palettePick]
    if (paletteMode === 'file') {
      const node = quickOpenHits[palettePick]
      closePalette()
      if (node) void openFile(node)
      return
    }
    closePalette()
    if (picked?.dataset.id) COMMANDS.find((c) => c.id === picked.dataset.id)?.run()
    else {
      const q = $('palette-input').value.toLowerCase()
      COMMANDS.find((c) => c.label.toLowerCase().includes(q))?.run()
    }
  }
}

function syncPalettePick(items) {
  items.forEach((row, i) => row.classList.toggle('on', i === palettePick))
  items[palettePick]?.scrollIntoView({ block: 'nearest' })
}

function openPalette() {
  const box = $('palette')
  paletteMode = 'command'
  palettePick = 0
  box.hidden = false
  const input = $('palette-input')
  input.placeholder = 'Type a command…'
  input.value = ''
  drawPalette('')
  input.focus()
  input.oninput = (e) => drawPalette(e.target.value)
  input.onkeydown = onPaletteKeydown
}

function openQuickOpen() {
  if (!requireUser()) return
  if (!state.folder) {
    void askPrompt('Open a folder first to search files.', '', true)
    return
  }
  const box = $('palette')
  paletteMode = 'file'
  palettePick = 0
  box.hidden = false
  const input = $('palette-input')
  input.placeholder = 'Search files by name…'
  input.value = ''
  drawQuickOpen('')
  input.focus()
  input.oninput = (e) => drawQuickOpen(e.target.value)
  input.onkeydown = onPaletteKeydown
}

function scoreQuickOpenFile(node, q) {
  const name = String(node.name || '').toLowerCase()
  const path = String(node.path || '').toLowerCase()
  if (!q) return name.length
  if (name === q) return 0
  if (name.startsWith(q)) return 1
  if (name.includes(q)) return 2
  if (path.includes(q)) return 3
  return 99
}

function drawQuickOpen(q) {
  const query = q.trim().toLowerCase()
  const files = flatten(state.tree).filter((n) => n.type === 'file')
  quickOpenHits = files
    .filter((n) => !query || n.name.toLowerCase().includes(query) || String(n.path || '').toLowerCase().includes(query))
    .sort((a, b) => scoreQuickOpenFile(a, query) - scoreQuickOpenFile(b, query) || a.name.localeCompare(b.name))
    .slice(0, 80)
  palettePick = 0
  $('palette-list').innerHTML = quickOpenHits.length
    ? quickOpenHits
        .map(
          (n, i) =>
            `<div class="pal-item${i === 0 ? ' on' : ''}" data-idx="${i}"><span>${escapeHtml(n.name)}</span><span class="pal-path">${escapeHtml(relativeProjectPath(n.path))}</span></div>`,
        )
        .join('')
    : `<div class="pal-item pal-empty">No files match.</div>`
  $('palette-list').querySelectorAll('.pal-item[data-idx]').forEach((row) => {
    row.onclick = () => {
      const node = quickOpenHits[Number(row.dataset.idx)]
      closePalette()
      if (node) void openFile(node)
    }
  })
}

function relativeProjectPath(fullPath) {
  const root = normPath(state.folder || '')
  const p = normPath(fullPath || '')
  if (root && p.startsWith(root)) return p.slice(root.length).replace(/^\//, '')
  return p
}

function drawPalette(q) {
  const hits = COMMANDS.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()))
  palettePick = 0
  $('palette-list').innerHTML = hits.length
    ? hits
        .map((c, i) => `<div class="pal-item${i === 0 ? ' on' : ''}" data-id="${c.id}">${escapeHtml(c.label)}</div>`)
        .join('')
    : `<div class="pal-item pal-empty">No matching commands.</div>`
  $('palette-list').querySelectorAll('.pal-item[data-id]').forEach((row) => {
    row.onclick = () => {
      closePalette()
      COMMANDS.find((c) => c.id === row.dataset.id)?.run()
    }
  })
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;')
}

boot().catch((error) => {
  console.error(error)
  finishAuthBoot()
  ensureAppShellVisible()
  const home = $('home-recents')
  if (home) home.textContent = error.message || String(error)
})
