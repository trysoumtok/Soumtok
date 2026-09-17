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
import { enrichAgentPlan } from './knowledgeBase.ts'
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
import { parseAgentRuntime, studioWebToolNames } from './studioWeb.ts'

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
  runtime?: ReturnType<typeof parseAgentRuntime>
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
  runtime?: string
  hasWorkspaceFiles?: boolean
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
  const hasProject = Boolean(input.hasWorkspaceFiles ?? input.workspaceRoot)
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
    const imgN = (() => {
      const t = userText.toLowerCase()
      const d = t.match(/\b(\d+)\s+(?:images?|pictures?|photos?|stills?)\b/)
      if (d) return Math.min(6, Math.max(1, Number(d[1]) || 1))
      const w = t.match(/\b(two|three|four|five|six)\s+(?:images?|pictures?|photos?|stills?)\b/)
      if (w) return { two: 2, three: 3, four: 4, five: 5, six: 6 }[w[1]] || 1
      return 1
    })()
    analysis.do =
      imgN > 1
        ? [
            `Call generate_image ${imgN} times — different paths (assets/generated/…-1, …-2, etc.)`,
            'Do not list_dir or read the project',
          ]
        : ['Call generate_image({ prompt }) NOW', 'Do not list_dir or read the project']
    analysis.dont = ['Explore the repo', 'Say the image tool is missing', 'Stop after one image if they asked for more']
    analysis.thought = imgN > 1 ? `Generate ${imgN} stills.` : 'Standalone still — generate_image only.'
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
  const plan = enrichAgentPlan(
    inferPlan(userText, hasProject, {
      runMode,
      analysis: {
        kind: analysisForTurn.kind,
        meaning: analysisForTurn.meaning,
        do: analysisForTurn.do,
        dont: analysisForTurn.dont,
      },
    }),
    userText,
  )
  const uiMode = input.mode || 'agent'
  const allToolNames = desktopAgentToolNames(agentPrefs)
  const intentNames = new Set(toolsForIntent({ kind: analysisForTurn.kind, uiMode, prefs: agentPrefs }))
  const pruned = allToolNames.filter((n) => intentNames.has(n))
  let { toolsEnabled, toolNames } = desktopToolsForTurn({
    uiMode,
    planMode: plan.mode,
    toolNames: pruned.length ? pruned : allToolNames,
    localToolsEnabled: agentPrefs.localToolsEnabled,
  })
  const runtime = parseAgentRuntime(input.runtime, input.workspaceRoot)
  if (runtime === 'studio-web') {
    toolNames = studioWebToolNames(toolNames)
    if (!toolNames.length) toolsEnabled = false
  }
  const driver = parseAgentDriver(input.driver)
  const systemPrompt = assembleDesktopAgentSystemPrompt({
    workspaceRoot: input.workspaceRoot,
    openFiles,
    branch: input.branch,
    mode: uiMode,
    driver,
    runtime,
    files,
    plan,
    analysis: analysisForTurn,
    enabledTools: toolsEnabled ? toolNames : studioWebToolNames(allToolNames),
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
