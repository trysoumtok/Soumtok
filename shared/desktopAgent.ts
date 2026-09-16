/**
 * Soumtok Desktop — platform agent layer (Cursor / Codex pattern):
 * interpret the user message, set the job, inject platform context, then call the model.
 */

import {
  inferPlan,
  outputBudget,
  promptWithAttachments,
  runTemperature,
  type AgentPlan,
  type AgentRunMode,
} from './agent.ts'
import { applySlash } from './capabilities.ts'
import { analyzeUserRequest, repairUserText, type RequestAnalysis } from './requestAnalyze.ts'
import { type ChatFile } from './chatMedia.ts'
import { stampAttachmentMeta } from './modelWrap.ts'
import { type DesktopAgentMode } from './desktopHarness.ts'
import { isHarnessUserText } from './modelHarness.ts'
import {
  applyRunModeToPrefs,
  desktopAgentToolNames,
  mergeDesktopAgentPrefs,
  openFilesForAgent,
  type DesktopAgentPrefs,
} from './desktopAgentPrefs.ts'
import { parseAgentDriver, type AgentDriver } from './soumtokBot.ts'
import { compactControlSystem, toolsForIntent } from './agentControlLayer.ts'

const DESKTOP_READ_ONLY_TOOLS = new Set([
  'read',
  'grep',
  'glob',
  'list_dir',
  'fetch',
  'read_lints',
  'task',
  'codebase_search',
  'read_skill',
  'git',
  'examine_media',
])

export function desktopToolsForTurn(input: {
  uiMode: DesktopAgentMode
  planMode: AgentRunMode
  toolNames: string[]
  localToolsEnabled: boolean
}) {
  if (!input.localToolsEnabled || !input.toolNames.length) {
    return { toolsEnabled: false, toolNames: [] as string[] }
  }
  if (input.planMode === 'chat') {
    if (input.uiMode === 'agent') {
      return { toolsEnabled: true, toolNames: input.toolNames }
    }
    return { toolsEnabled: false, toolNames: [] }
  }
  const readOnly =
    input.uiMode === 'ask' ||
    input.uiMode === 'plan' ||
    input.planMode === 'ask' ||
    input.planMode === 'plan'
  if (readOnly) {
    const names = input.toolNames.filter((n) => DESKTOP_READ_ONLY_TOOLS.has(n))
    return { toolsEnabled: names.length > 0, toolNames: names }
  }
  if (input.uiMode === 'agent') {
    return { toolsEnabled: true, toolNames: input.toolNames }
  }
  return { toolsEnabled: false, toolNames: [] }
}

export function desktopPlatformBrief() {
  return `PLATFORM: Soumtok harness classifies first. Follow CONTROL. Tools until the job is finished. Never say sandboxed.`
}

export function assembleDesktopAgentSystemPrompt(input: {
  workspaceRoot?: string
  openFiles?: string[]
  branch?: string
  mode?: DesktopAgentMode
  driver?: AgentDriver
  files?: ChatFile[]
  plan: AgentPlan
  analysis: RequestAnalysis
  enabledTools?: string[]
  model?: string
  userText?: string
  gitSnapshot?: string
}) {
  return compactControlSystem(input)
}

export type DesktopAgentTurn = {
  userText: string
  analysis: RequestAnalysis
  plan: AgentPlan
  systemPrompt: string
  temperature: number
  maxTokens: number
  toolsEnabled: boolean
  toolNames: string[]
  agentPrefs: DesktopAgentPrefs
}

export function prepareDesktopAgentTurn(input: {
  messages?: { role: string; content?: string; name?: string }[]
  userMessage?: string
  workspaceRoot?: string
  openFiles?: string[]
  branch?: string
  mode?: DesktopAgentMode
  driver?: AgentDriver
  files?: ChatFile[]
  agentPrefs?: Partial<DesktopAgentPrefs>
  model?: string
  analysisKind?: string
}): DesktopAgentTurn {
  const agentPrefs = applyRunModeToPrefs(mergeDesktopAgentPrefs(input.agentPrefs))
  const openFiles = openFilesForAgent(input.openFiles, agentPrefs)
  const fromHistory = [...(input.messages || [])]
    .reverse()
    .find((item) => item.role === 'user' && !isHarnessUserText(typeof item.content === 'string' ? item.content : ''))
  const raw =
    (input.userMessage && !isHarnessUserText(input.userMessage)
      ? input.userMessage
      : typeof fromHistory?.content === 'string'
        ? fromHistory.content
        : input.userMessage || '')
      .trim()
  const hasProject = Boolean(input.workspaceRoot)
  const files = stampAttachmentMeta(input.files || [])
  const hasImage = files.some((f) => f.mime?.startsWith('image/'))
  const userText = applySlash(
    promptWithAttachments(repairUserText(raw), {
      hasProject,
      hasImage,
      hasAttach: files.length > 0,
    }),
  )
  const priorImage = (input.messages || []).some(
    (item) =>
      (item.role === 'tool' && /^generate_image$/i.test(String(item.name || ''))) ||
      /assets\/generated\//i.test(String(item.content || '')),
  )
  const analysis = analyzeUserRequest(userText, {
    hasFiles: hasProject,
    hasImage,
    attachments: files.length > 0,
    priorImage,
    lastKind: input.analysisKind,
  })
  if (input.analysisKind === 'image' && analysis.kind !== 'image') {
    analysis.kind = 'image'
    analysis.do = ['Call generate_image({ prompt }) NOW', 'Do not list_dir or read the project']
    analysis.dont = ['Explore the repo', 'Say the image tool is missing']
    analysis.thought = 'Standalone still — generate_image only.'
  } else if (
    input.analysisKind &&
    input.analysisKind !== analysis.kind &&
    analysis.kind !== 'image'
  ) {
    analysis.kind = input.analysisKind
  }
  const workEvidence = (input.messages || []).some(
    (item) =>
      item.role === 'tool' &&
      /^(write|diff|edit|terminal)$/i.test(String(item.name || '')),
  )
  const kind =
    input.mode === 'agent' &&
    (analysis.kind === 'chat' || analysis.kind === 'question') &&
    workEvidence &&
    /^(go|yes|y|ok|okay|sure|do it|please|yep|yeah|go ahead|continue|build it|do that)[!.?\s]*$/i.test(userText)
      ? 'execute'
      : analysis.kind
  const analysisForTurn = kind === analysis.kind ? analysis : { ...analysis, kind }
  const runMode: AgentRunMode = input.mode || 'agent'
  const plan = inferPlan(userText, hasProject, {
    runMode,
    analysis: {
      kind: analysisForTurn.kind,
      meaning: analysisForTurn.meaning,
      do: analysisForTurn.do,
      dont: analysisForTurn.dont,
    },
  })
  const uiMode = input.mode || 'agent'
  const allToolNames = desktopAgentToolNames(agentPrefs)
  const intentNames = new Set(toolsForIntent({ kind: analysisForTurn.kind, uiMode, prefs: agentPrefs }))
  const pruned = allToolNames.filter((n) => intentNames.has(n))
  const { toolsEnabled, toolNames } = desktopToolsForTurn({
    uiMode,
    planMode: plan.mode,
    toolNames: pruned.length ? pruned : allToolNames,
    localToolsEnabled: agentPrefs.localToolsEnabled,
  })
  const driver = parseAgentDriver(input.driver)
  const systemPrompt = assembleDesktopAgentSystemPrompt({
    workspaceRoot: input.workspaceRoot,
    openFiles,
    branch: input.branch,
    mode: uiMode,
    driver,
    files,
    plan,
    analysis: analysisForTurn,
    enabledTools: toolsEnabled ? toolNames : allToolNames,
    model: input.model,
    userText,
  })
  return {
    userText,
    analysis: analysisForTurn,
    plan,
    systemPrompt,
    temperature: runTemperature(plan),
    maxTokens: outputBudget(plan),
    toolsEnabled,
    toolNames,
    agentPrefs,
  }
}
