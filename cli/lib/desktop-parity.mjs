import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { applyIntelligenceToPrefs, applyRunModeToPrefs } = require(
  '../../desktop/src/shared/agentPrefsRuntime.js',
)

/** Same defaults as workbench DEFAULT_AGENT_PREFS + shared/desktopAgentPrefs.ts */
export const DEFAULT_AGENT_PREFS = {
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
  jumpNextDiffOnAccept: true,
  autoFormatOnFinish: true,
  legacyTerminal: false,
  toolbarOnSelection: true,
  intelligence: 'balanced',
  thinkFirst: true,
  browserVerify: true,
  skillsEnabled: true,
  codebaseSearch: true,
  _prefsV5: true,
}

export function effectiveAgentPrefs(config = {}) {
  const merged = {
    ...DEFAULT_AGENT_PREFS,
    intelligence: config.intelligence || DEFAULT_AGENT_PREFS.intelligence,
    runMode: config.runMode || DEFAULT_AGENT_PREFS.runMode,
    terminalSandbox: config.terminalSandbox,
    includeOpenFiles: config.includeOpenFiles !== false,
    localToolsEnabled: config.localToolsEnabled !== false,
    mcpConnectors: config.mcpConnectors !== false,
    webSearchTool: config.webSearchTool !== false,
    webFetchTool: config.webFetchTool !== false,
    skillsEnabled: config.skillsEnabled !== false,
    codebaseSearch: config.codebaseSearch !== false,
    thinkFirst: config.thinkFirst !== false,
    browserVerify: config.browserVerify !== false,
  }
  return applyIntelligenceToPrefs(applyRunModeToPrefs(merged))
}

/** Expand @path tokens into prompt context + openFiles list (Desktop includeOpenFiles). */
export function expandAtFiles(prompt, cwd) {
  const openFiles = []
  const parts = []
  const re = /@([^\s@]+)/g
  let last = 0
  let m
  while ((m = re.exec(prompt))) {
    parts.push(prompt.slice(last, m.index))
    const rel = m[1].replace(/^["']|["']$/g, '')
    const abs = path.isAbsolute(rel) ? rel : path.resolve(cwd, rel)
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      openFiles.push(abs)
      parts.push(`@${rel}`)
    } else {
      parts.push(`@${rel}`)
    }
    last = m.index + m[0].length
  }
  parts.push(prompt.slice(last))
  return { prompt: parts.join(''), openFiles: [...new Set(openFiles)] }
}

export function modeLabel(mode) {
  const m = String(mode || 'agent').toLowerCase()
  if (m === 'plan') return 'Plan'
  if (m === 'ask') return 'Ask'
  if (m === 'debug') return 'Debug'
  return 'Agent'
}

export function driverLabel(driver) {
  return driver === 'bot' ? 'Soumtok Bot' : 'IDE Agent'
}
