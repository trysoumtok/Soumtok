/**
 * Soumtok Desktop — agent settings persisted on device and sent with each round.
 */

export type TerminalSandbox = 'strict' | 'standard' | 'permissive'
export type AgentTextSize = 'small' | 'default' | 'large'
export type AgentRunMode = 'ask' | 'auto-review' | 'run-everything'
export type UsageSummaryMode = 'auto' | 'always' | 'never'
export type QueuedMessageMode = 'queue' | 'send-immediately'
export type AgentIntelligence = 'fast' | 'balanced' | 'max'

export type DesktopAgentPrefs = {
  includeOpenFiles: boolean
  localToolsEnabled: boolean
  workspaceBoundary: boolean
  terminalSandbox: TerminalSandbox
  fileDeletionProtection: boolean
  webSearchTool: boolean
  webFetchTool: boolean
  waitForMcpAuth: boolean
  thirdPartyImports: boolean
  mcpConnectors: boolean
  agentTextSize: AgentTextSize
  codeBlockWordWrap: boolean
  queueWhileBusy: QueuedMessageMode
  usageSummary: UsageSummaryMode
  agentAutocomplete: boolean
  autoApproveModeSwitch: boolean
  runMode: AgentRunMode
  inlineDiffs: boolean
  jumpNextDiffOnAccept: boolean
  autoFormatOnFinish: boolean
  legacyTerminal: boolean
  toolbarOnSelection: boolean
  intelligence: AgentIntelligence
  thinkFirst: boolean
  browserVerify: boolean
  skillsEnabled: boolean
  codebaseSearch: boolean
  maxToolRounds?: number
}

export function normalizeIntelligence(raw: unknown): AgentIntelligence {
  if (raw === 'fast' || raw === 'balanced') return raw
  return 'max'
}

export function intelligenceBundle(intelligence: AgentIntelligence): Pick<
  DesktopAgentPrefs,
  'intelligence' | 'thinkFirst' | 'browserVerify' | 'skillsEnabled' | 'codebaseSearch'
> {
  if (intelligence === 'fast') {
    return {
      intelligence: 'fast',
      thinkFirst: false,
      browserVerify: false,
      skillsEnabled: false,
      codebaseSearch: true,
    }
  }
  if (intelligence === 'balanced') {
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

export const DEFAULT_DESKTOP_AGENT_PREFS: DesktopAgentPrefs = {
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
  inlineDiffs: false,
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

const DESKTOP_CORE_TOOLS = [
  'read',
  'grep',
  'glob',
  'list_dir',
  'write',
  'diff',
  'delete',
  'wipe_workspace',
  'terminal',
  'read_terminal',
  'read_lints',
  'task',
  'switch_mode',
  'todo_write',
  'git',
  'attempt_completion',
  'generate_image',
  'examine_media',
] as const

export function mergeDesktopAgentPrefs(raw?: Partial<DesktopAgentPrefs> | null): DesktopAgentPrefs {
  const incoming = raw && typeof raw === 'object' ? raw : {}
  const merged: DesktopAgentPrefs = { ...DEFAULT_DESKTOP_AGENT_PREFS, ...incoming }
  const bundle = intelligenceBundle(normalizeIntelligence(merged.intelligence))
  merged.intelligence = bundle.intelligence
  if (!('thinkFirst' in incoming)) merged.thinkFirst = bundle.thinkFirst
  if (!('browserVerify' in incoming)) merged.browserVerify = bundle.browserVerify
  if (!('skillsEnabled' in incoming)) merged.skillsEnabled = bundle.skillsEnabled
  if (!('codebaseSearch' in incoming)) merged.codebaseSearch = bundle.codebaseSearch
  return merged
}

/** Map Cursor-style run mode onto sandbox + protections. */
export function applyRunModeToPrefs(prefs: DesktopAgentPrefs): DesktopAgentPrefs {
  const next = { ...prefs }
  if (prefs.runMode === 'ask') {
    next.terminalSandbox = 'strict'
    next.fileDeletionProtection = true
    next.workspaceBoundary = true
  } else if (prefs.runMode === 'auto-review') {
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

export function maxToolRoundsForPrefs(driver: 'ide' | 'bot', prefs?: Partial<DesktopAgentPrefs> | null): number {
  const custom = Number(prefs?.maxToolRounds)
  if (Number.isFinite(custom) && custom > 0) return Math.min(64, Math.max(4, Math.floor(custom)))
  const intel = normalizeIntelligence(prefs?.intelligence)
  if (intel === 'fast') return driver === 'bot' ? 18 : 12
  if (intel === 'balanced') return driver === 'bot' ? 36 : 24
  return driver === 'bot' ? 52 : 42
}

export function desktopAgentToolNames(prefs: DesktopAgentPrefs): string[] {
  const names = new Set<string>()
  if (!prefs.localToolsEnabled) return []
  for (const n of DESKTOP_CORE_TOOLS) names.add(n)
  if (prefs.codebaseSearch !== false) names.add('codebase_search')
  if (prefs.browserVerify !== false) names.add('browser')
  if (prefs.skillsEnabled !== false) names.add('read_skill')
  if (prefs.webFetchTool || prefs.webSearchTool) names.add('fetch')
  if (prefs.mcpConnectors) names.add('mcp')
  return [...names]
}

export function openFilesForAgent(openFiles: string[] | undefined, prefs: DesktopAgentPrefs): string[] | undefined {
  if (!prefs.includeOpenFiles) return undefined
  return openFiles?.length ? openFiles : undefined
}
