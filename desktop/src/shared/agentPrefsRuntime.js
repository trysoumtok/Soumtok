/** Mirror shared/desktopAgentPrefs.ts for Electron main + renderer. */

function normalizeIntelligence(raw) {
  if (raw === 'fast' || raw === 'balanced') return raw
  return 'max'
}

function intelligenceBundle(intelligence) {
  const intel = normalizeIntelligence(intelligence)
  if (intel === 'fast') {
    return {
      intelligence: 'fast',
      thinkFirst: false,
      browserVerify: false,
      skillsEnabled: false,
      codebaseSearch: true,
    }
  }
  if (intel === 'balanced') {
    return {
      intelligence: 'balanced',
      thinkFirst: true,
      browserVerify: true,
      skillsEnabled: true,
      codebaseSearch: true,
    }
  }
  return {
    intelligence: 'max',
    thinkFirst: true,
    browserVerify: true,
    skillsEnabled: true,
    codebaseSearch: true,
  }
}

function applyRunModeToPrefs(prefs) {
  const next = { ...(prefs && typeof prefs === 'object' ? prefs : {}) }
  const runMode = next.runMode || 'run-everything'
  if (runMode === 'ask') {
    next.terminalSandbox = 'strict'
    next.fileDeletionProtection = true
    next.workspaceBoundary = true
  } else if (runMode === 'auto-review') {
    next.terminalSandbox = 'standard'
    next.fileDeletionProtection = true
    next.workspaceBoundary = true
  } else {
    next.terminalSandbox = 'permissive'
    next.fileDeletionProtection = false
    next.workspaceBoundary = true
  }
  return next
}

function applyIntelligenceToPrefs(prefs) {
  const incoming = prefs && typeof prefs === 'object' ? prefs : {}
  const next = { ...incoming }
  const bundle = intelligenceBundle(next.intelligence)
  next.intelligence = bundle.intelligence
  if (!Object.prototype.hasOwnProperty.call(incoming, 'thinkFirst')) next.thinkFirst = bundle.thinkFirst
  if (!Object.prototype.hasOwnProperty.call(incoming, 'browserVerify')) next.browserVerify = bundle.browserVerify
  if (!Object.prototype.hasOwnProperty.call(incoming, 'skillsEnabled')) next.skillsEnabled = bundle.skillsEnabled
  if (!Object.prototype.hasOwnProperty.call(incoming, 'codebaseSearch')) next.codebaseSearch = bundle.codebaseSearch
  return next
}

function maxToolRoundsForPrefs(driver, prefs) {
  const custom = Number(prefs?.maxToolRounds)
  if (Number.isFinite(custom) && custom > 0) return Math.min(64, Math.max(4, Math.floor(custom)))
  const intel = normalizeIntelligence(prefs?.intelligence)
  if (intel === 'fast') return driver === 'bot' ? 14 : 10
  if (intel === 'balanced') return driver === 'bot' ? 28 : 18
  return driver === 'bot' ? 52 : 42
}

module.exports = {
  applyRunModeToPrefs,
  applyIntelligenceToPrefs,
  intelligenceBundle,
  normalizeIntelligence,
  maxToolRoundsForPrefs,
}
