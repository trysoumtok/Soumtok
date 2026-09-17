import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { resolveAttachments } from './attachments.mjs'
import { createApiClient } from './api.mjs'
import { loadConfig } from './config.mjs'
import { effectiveAgentPrefs } from './desktop-parity.mjs'
import { createEventPrinter, promptAsk } from './events.mjs'
import { recordTurn } from './history.mjs'
import { createIntegratedTerminalRunner } from './terminal-run.mjs'
import { fetchAccountUsage } from './usage.mjs'

const require = createRequire(import.meta.url)
const { runAgentHarness, resolveAskReply, pushAgentSteer } = require('../../desktop/src/main/agentHarness.js')

function gitBranch(cwd) {
  try {
    const git = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
    })
    if (git.status === 0) return (git.stdout || '').trim()
  } catch {
    /* ignore */
  }
  return ''
}

function wrapBillingApi(client) {
  let lastRound = {}
  const api = async (method, pathname, body, timeoutMs) => {
    const res = await client.api(method, pathname, body, timeoutMs)
    if (method === 'POST' && /\/agent\/round/.test(pathname) && res.status === 200 && res.data) {
      lastRound = {
        model: res.data.model,
        billedTo: res.data.billedTo,
        provider: res.data.provider,
      }
    }
    return res
  }
  return {
    api,
    getBuffer: client.getBuffer.bind(client),
    base: client.base,
    lastRound: () => lastRound,
  }
}

export { pushAgentSteer, resolveAskReply }

export async function runAgentPrompt({
  prompt,
  cwd,
  model,
  mode,
  driver,
  messages = [],
  openFiles = [],
  files = [],
  threadTitle = '',
  subagentModel,
  apiOverride,
  onEvent: externalOnEvent,
  signal,
  config: configOverride,
  showAccountUsage = false,
  jsonMode = false,
  stream = true,
}) {
  const config = { ...loadConfig(), ...configOverride }
  const folder = cwd
  const client = wrapBillingApi(createApiClient(apiOverride))
  const terminal = createIntegratedTerminalRunner(folder)
  const attached = resolveAttachments(prompt, folder)
  const mergedOpen = [...new Set([...openFiles, ...attached.openFiles])]
  const mergedFiles = [...files, ...attached.files]
  const agentPrefs = effectiveAgentPrefs(config)
  const requestedModel = model || config.model || 'auto'

  const printer = createEventPrinter({
    cwd: folder,
    usageSummary: config.usageSummary || 'auto',
    stream,
    jsonMode,
    onAsk: (ev) => {
      if (jsonMode) resolveAskReply(ev.id, {})
      else promptAsk(ev, resolveAskReply).catch(() => resolveAskReply(ev.id, {}))
    },
  })

  const abort = signal || new AbortController().signal
  printer.reset()

  const result = await runAgentHarness({
    api: client.api,
    getBuffer: client.getBuffer,
    apiHost: client.base,
    folder,
    model: requestedModel,
    mode: mode || config.mode || 'agent',
    driver: driver || config.driver || 'ide',
    messages,
    userMessage: attached.prompt,
    threadTitle,
    openFiles: agentPrefs.includeOpenFiles ? mergedOpen : [],
    branch: gitBranch(folder),
    files: mergedFiles,
    agentPrefs,
    subagentModel: subagentModel || config.subagentModel,
    signal: abort,
    onEvent: (ev) => {
      printer.handle(ev)
      externalOnEvent?.(ev)
    },
    onIntegratedTerminalRun: terminal.onIntegratedTerminalRun,
    onTerminalMirror: terminal.onTerminalMirror,
  })

  const roundMeta = client.lastRound()
  const enriched = {
    ...result,
    model: roundMeta.model || requestedModel,
    requestedModel,
    billedTo: roundMeta.billedTo,
    provider: roundMeta.provider,
    events: printer.events(),
    attachments: {
      openFiles: mergedOpen.length,
      images: mergedFiles.filter((f) => f.mime?.startsWith('image/')).length,
      folders: attached.folders?.length || 0,
    },
  }

  if (!jsonMode) printer.footer(enriched)

  if (showAccountUsage || config.usageSummary === 'always') {
    try {
      const summary = await fetchAccountUsage(createApiClient(apiOverride))
      const { printAccountUsage } = await import('./usage.mjs')
      if (!jsonMode) printAccountUsage(summary)
    } catch {
      /* optional */
    }
  }

  terminal.killAll()
  return enriched
}

export async function runChatTurn(opts) {
  const { prompt, thread, cwd, model, mode, driver, apiOverride, signal, config, jsonMode, stream } = opts
  const messages = Array.isArray(thread.messages) ? [...thread.messages] : []
  const result = await runAgentPrompt({
    prompt,
    cwd,
    model: model || thread.model,
    mode: mode || thread.mode,
    driver: driver || thread.driver,
    messages,
    threadTitle: thread.title || '',
    apiOverride,
    signal,
    config,
    jsonMode,
    stream,
  })
  if (result.error && result.error !== 'Cancelled' && !result.text && !jsonMode) {
    throw new Error(result.error)
  }
  const nextMessages = result.messages || messages
  const nextThread = recordTurn(
    {
      ...thread,
      model: model || thread.model,
      mode: mode || thread.mode,
      driver: driver || thread.driver,
      messages: nextMessages,
      cwd,
      title:
        thread.title === 'New chat' || thread.title === 'New Agent'
          ? String(prompt).slice(0, 48)
          : thread.title,
    },
    { prompt, cwd, result, events: result.events },
  )
  return { ...result, thread: nextThread }
}

export function newThreadId() {
  return randomUUID().replace(/-/g, '').slice(0, 12)
}

export function formatJsonOutput(result) {
  return {
    ok: !result.error || Boolean(result.text),
    error: result.error || null,
    text: result.text || '',
    model: result.model,
    requestedModel: result.requestedModel,
    billedTo: result.billedTo,
    promptTokens: result.promptTokens || 0,
    completionTokens: result.completionTokens || 0,
    incomplete: Boolean(result.incomplete),
    attachments: result.attachments,
    images: (result.events || [])
      .filter((e) => e.type === 'result' && e.name === 'generate_image' && e.path)
      .map((e) => e.path),
    files: (result.events || [])
      .filter((e) => e.type === 'file' || (e.type === 'result' && e.path))
      .map((e) => e.path)
      .filter(Boolean),
    tools: (result.events || [])
      .filter((e) => e.type === 'tool')
      .map((e) => ({ name: e.name, args: e.args || e.arguments })),
  }
}
