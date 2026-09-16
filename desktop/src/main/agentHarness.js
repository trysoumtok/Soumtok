const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { runDesktopTool, parseFileReadViaShell, saveMcpArtifacts } = require('./desktopTools')
const { maxToolRounds } = require('../shared/harnessLimits')
const { applyRunModeToPrefs, applyIntelligenceToPrefs } = require('../shared/agentPrefsRuntime')
const {
  messagesForProvider,
  storageSafeModelMessages,
  flattenToolTurnsForProvider,
} = require('../shared/chatMessagesRuntime')
const { compactConversation, compactGitSnapshot } = require('../shared/tokenGuard')
const { stripDsmlFromText, parseDsmlInvokes, textLooksLikeDsml, sanitizeAssistantText } = require('./dsmlTools')
const { generateStillViaReplicate } = require('./replicateImage')
const { parseStillRequest, normalizeStillAspect } = require('../shared/stillAspect.js')
const { createCheckpoint, restoreCheckpoint } = require('./checkpoints')
const {
  classifyUserTask,
  userAskedToGenerateImage,
  imagePromptFromUser,
  stillRequestFromUser,
  workHasPriorGeneratedImage,
  imageIntentHintFromWork,
  userIsBareConfirm,
  assistantOfferedApplyEdit,
  assistantAskedPermission,
  taskKindLabel,
  composeTaskContract,
  taskCompletionMet,
  shouldContinueAgentTask,
  taskIncompleteNudge,
  stuckSteerNudge,
  adaptiveSteering,
  signalIntent,
  needsVagueEditClarification,
  buildEditClarificationAsk,
  workHasReadTerminal,
  workHasDevServerTerminal,
  workAfterLastHuman,
  classifyFromEvidence,
  verifyIntroducedNewErrors,
} = require('./agentTaskGate')
const {
  createAgentState,
  recordToolAttempt,
  isToolDisabled,
  recordFileChange,
  filesChanged,
  noteRoundProgress,
  setVerification,
  markProgress,
  composeRunStateBlock,
  loadTodos,
  saveTodos,
  stripDynamicSystem,
  acceptanceFor,
} = require('./agentState')
const {
  isGeneralKnowledgeQuestion,
  userAskedToBuildSomething,
  userAskedForLocalhost,
  composeThinkFirstBrief,
  composeWorkLoopBrief,
} = require('./agentThinkFirst')
const { loadProjectRules } = require('./projectRules')
const { skillsCatalogBlock } = require('./agentSkills')
const { gitSnapshot } = require('./gitTools')
const { buildWorkspaceAtlas } = require('./workspaceAtlas')
const { refreshProjectMemory, composeProjectBrief } = require('./projectMemory')
const {
  composeBuildDirectorBrief,
  parseBuildIntent,
  inferIntentForFolder,
  isPreviewableBuildKind,
  isRunnableInTerminalKind,
  workspaceLooksMessy,
  pickRunCommandFromFolder,
  projectDeliversInBrowser,
  applyGreenfieldScaffold,
  workspaceIsGreenfield,
} = require('./buildDirector')

const agentSteerQueue = []
const askWaiters = new Map()

function resolveAskReply(askId, answers) {
  const id = String(askId || '')
  const resolve = askWaiters.get(id)
  if (!resolve) return false
  askWaiters.delete(id)
  resolve(answers && typeof answers === 'object' ? answers : {})
  return true
}

function waitForAskReply(askId, signal) {
  return new Promise((resolve, reject) => {
    const id = String(askId || '')
    if (!id) {
      reject(new Error('Missing ask id'))
      return
    }
    if (signal?.aborted) {
      reject(new Error('Cancelled'))
      return
    }
    askWaiters.set(id, resolve)
    const onAbort = () => {
      askWaiters.delete(id)
      reject(new Error('Cancelled'))
    }
    signal?.addEventListener?.('abort', onAbort, { once: true })
  })
}

function formatAskReply(questions, answers) {
  const lines = ['User answers:']
  for (const q of questions || []) {
    const picked = answers?.[q.id] || []
    lines.push(`Q: ${q.prompt}`)
    lines.push(`A: ${Array.isArray(picked) ? picked.join(', ') : picked || '(skipped)'}`)
  }
  return lines.join('\n')
}

function pushAgentSteer(text) {
  const msg = String(text || '').trim()
  if (msg) agentSteerQueue.push({ role: 'user', content: `[Soumtok steer — at next tool step]\n${msg}` })
}

function persistWork(work) {
  return flattenToolTurnsForProvider((work || []).filter((m) => m && m.role !== 'system'))
}

function steerWithNudge(work, text, ctx) {
  const body = String(text || '')
    .trim()
    .replace(/^\[Soumtok (?:harness|steer — at next tool step)\]\s*/i, '')
  if (!body || !Array.isArray(work)) return
  if (ctx) ctx._steerText = body
  replaceSystemChunk(
    work,
    'SOUMTOK STEER',
    `SOUMTOK STEER (one live instruction — do this next):\n${body}`,
  )
}

function drainAgentSteer(work, ctx) {
  if (!agentSteerQueue.length || !Array.isArray(work)) return
  const last = work[work.length - 1]
  if (last?.role === 'assistant' && last.tool_calls?.length) return
  const parts = []
  while (agentSteerQueue.length) {
    const item = agentSteerQueue.shift()
    const c = String(item?.content || '')
      .replace(/^\[Soumtok steer — at next tool step\]\s*/i, '')
      .trim()
    if (c) parts.push(c)
  }
  if (parts.length) steerWithNudge(work, parts.join('\n'), ctx)
}

async function maybeVerifyAfterEdits(folder, prefs, calls, onEvent, work, ctx) {
  if (!folder) return null
  const edited = (calls || []).some((c) => {
    const n = String(c.name || '').toLowerCase()
    return n === 'write' || n === 'diff' || n === 'edit' || n === 'str_replace' || n === 'apply_patch'
  })
  if (!edited) return null
  const tsconfig = path.join(folder, 'tsconfig.json')
  const pkgPath = path.join(folder, 'package.json')
  let scripts = {}
  try {
    scripts = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts || {}
  } catch {
    scripts = {}
  }
  const chunks = []
  let command = ''
  if (fs.existsSync(tsconfig)) {
    onEvent?.({ type: 'status', text: 'Verifying TypeScript…' })
    const out = await runDesktopTool(folder, 'terminal', { command: 'npx tsc --noEmit' }, prefs)
    command = 'npx tsc --noEmit'
    chunks.push(`npx tsc --noEmit (ok=${out.ok !== false})\n${(out.text || '').slice(0, 6000)}`)
  } else if (scripts.test && /node |tsx |\.js/.test(String(scripts.test))) {
    onEvent?.({ type: 'status', text: 'Verifying tests…' })
    const out = await runDesktopTool(folder, 'terminal', { command: 'npm test --silent' }, prefs)
    command = 'npm test'
    chunks.push(`npm test (ok=${out.ok !== false})\n${(out.text || '').slice(0, 6000)}`)
  } else if (scripts.lint) {
    onEvent?.({ type: 'status', text: 'Verifying lint…' })
    const out = await runDesktopTool(folder, 'read_lints', {}, prefs)
    command = 'read_lints'
    chunks.push(`read_lints (ok=${out.ok !== false})\n${(out.text || '').slice(0, 6000)}`)
  }
  if (!chunks.length) return null
  const text = chunks.join('\n\n').slice(0, 8000)
  const baseline = ctx?._verifyBaseline || ''
  const hasTs = /error TS\d+/i.test(text)
  const ok = hasTs ? !verifyIntroducedNewErrors(baseline, text) : !/\(ok=false\)|error  |failed|FAIL\b/i.test(text)
  onEvent?.({
    type: 'result',
    name: 'read_lints',
    ok,
    text,
    path: 'verify',
  })
  if (ctx?._runState) setVerification(ctx._runState, { passed: ok, output: text, command })
  if (work) {
    steerWithNudge(
      work,
      ok
        ? `[Soumtok harness] VERIFY passed (${command}). Continue or conclude with evidence.`
        : `[Soumtok harness] VERIFY failed (${command}) — new errors vs baseline. Read the errors. diff/write a real fix — do not claim done.\n${text.slice(0, 2500)}`,
      ctx,
    )
  }
  const batchChanged = Boolean(ctx?._batchChanged)
  if (!ok && ctx?._runState?.lastCheckpointId && batchChanged) {
    try {
      const restored = restoreCheckpoint(folder, ctx._runState.lastCheckpointId)
      if (restored.ok) {
        onEvent?.({
          type: 'status',
          text: `Reverted ${(restored.paths || []).length} file(s) — ${command} introduced new errors`,
        })
        if (ctx._runState) {
          for (const p of restored.paths || []) {
            const row = ctx._runState.filesTouched?.[p]
            if (row) {
              row.after = row.before
              row.changed = false
            }
          }
          setVerification(ctx._runState, { passed: false, output: text, command, rolledBack: true })
        }
        steerWithNudge(
          work,
          `[Soumtok harness] Last edit was reverted (${command} introduced new errors). Files restored to pre-edit snapshot. Read the errors and apply a smaller correct patch.`,
          ctx,
        )
      }
    } catch {
      /* restore optional */
    }
  }
  return { ok, text, command }
}

const DESKTOP_ROUND_PATHS = ['/api/studio/desktop/agent/round', '/api/desktop/agent/round']

function openaiToolCalls(calls) {
  return (calls || []).map((item) => ({
    id: item.id,
    type: 'function',
    function: { name: item.name, arguments: item.arguments || '{}' },
  }))
}

function userWantedAgentWork(work, userMessage) {
  const t = lastUserTextFromWork(work, userMessage)
  if (userIsBareConfirm(t)) return true
  if (userAskedToGenerateImage(t, { priorImage: workHasPriorGeneratedImage(work) })) return true
  return (
    userWantsGreenfieldBuild(t) ||
    /\b(run|start|dev|localhost|port|5170|npm|install|fix|implement|build|deploy|test|debug|change|add|create|refactor|apply|commit|update|edit|generate|draw)\b/i.test(
      t,
    )
  )
}

function userWantsVisualPolish(text) {
  const t = String(text || '').toLowerCase()
  if (/\b(from scratch|new app|greenfield|scaffold)\b/.test(t)) return false
  return (
    /\b(spot|spots|looks?|design|real|clean|ugly|visual|texture|lighting|3d|screenshot|cube|rubik|scrambl)\b/.test(t) &&
    /\b(fix|fixed|false|wrong|fake|make it|black|balck|polish|better)\b/.test(t)
  )
}

function userWantsGreenfieldBuild(text) {
  if (isGeneralOrSoumtokChat(text)) return false
  if (userWantsWipeWorkspace(text)) return false
  if (userAskedToGenerateImage(text)) return false
  if (userWantsVisualPolish(text)) return false
  if (userAskedToBuildSomething(text)) return true
  const t = String(text || '').toLowerCase()
  if (userWantsMessyFolderFixed(text)) return true
  return /\b(build a|create a|make a|make me|scaffold|from scratch|greenfield|new app|console app|cli app|website|web app|landing page)\b/.test(
    t,
  )
}

function userWantsMessyFolderFixed(text) {
  const t = String(text || '').toLowerCase()
  if (userWantsWipeWorkspace(text)) return false
  if (userWantsVisualPolish(text)) return false
  return /\b(make it work|get it working|start the server|messy|clean up|clean this|run the app|why doesn'?t (it|the app|the server)|not working|still broken)\b/.test(
    t,
  )
}

function userWantsWipeWorkspace(text) {
  const t = String(text || '').toLowerCase()
  return (
    /\b(delete|remove|wipe|clear|trash|nuke|empty|delet)\b[\s\S]{0,48}\b(everything|everthing|every thing|every file|all files|all of it|whole project|entire project|this project|this folder|the folder|the project|all pro)\b/.test(
      t,
    ) ||
    /\bdelete\s+(every|all|this|it)\b/.test(t) ||
    /\b(get rid of|throw away)\s+(everything|all of it)\b/.test(t) ||
    /\bclear\s+(this|the)\s+(folder|fl|project|repo)\b/.test(t) ||
    /\b(delete|wipe)\s+(this|the)\s+(folder|project|repo)\b/.test(t) ||
    /^delete everything/.test(t.trim())
  )
}

function userPlainFromWorkMessage(m) {
  const c = typeof m?.content === 'string' ? m.content : m?.text || ''
  return String(c).replace(/📎[\s\S]*$/u, '').trim()
}

function threadWantsWipeWorkspace(work, userMessage, threadTitle) {
  if (userWantsWipeWorkspace(userMessage)) return true
  if (userWantsWipeWorkspace(threadTitle)) return true
  for (const m of work || []) {
    if (m.role === 'user' && userWantsWipeWorkspace(userPlainFromWorkMessage(m))) return true
  }
  return false
}

function userConfirmedWipeAction(text) {
  const t = String(text || '').trim()
  if (!t) return false
  if (/^(yes|y|ok|okay|sure|go|do it|confirm|confirmed|yea|yeah|yep|please)[!.?\s]*$/i.test(t)) return true
  return /\b(yes,? (please )?(do|delete|wipe|clear)|go ahead|do it now|confirm)\b/i.test(t)
}

function shouldRunAutoWipe(work, userMessage, threadTitle) {
  if (userWantsWipeWorkspace(userMessage)) return true
  if (userWantsWipeWorkspace(threadTitle) && (!String(userMessage || '').trim() || userConfirmedWipeAction(userMessage))) {
    return true
  }
  if (userConfirmedWipeAction(userMessage) && threadWantsWipeWorkspace(work, null, threadTitle)) return true
  return false
}

function workspaceHasUserProjectFiles(folder) {
  if (!folder) return false
  try {
    const skip = new Set(['.git', '.soumtok'])
    return fs.readdirSync(folder).some((n) => n && !skip.has(n))
  } catch {
    return false
  }
}

function prefsForAgentTools(prefs, userMessage, work, threadTitle) {
  const p = { ...prefs }
  if (threadWantsWipeWorkspace(work, userMessage, threadTitle)) {
    p.fileDeletionProtection = false
    p.wipeWorkspaceAllowed = true
    p.activeTaskKind = 'wipe'
  } else {
    p.activeTaskKind = classifyUserTask(userMessage || lastUserTextFromWork(work), {
      lastAssistant: lastAssistantTextFromWork(work),
      priorImage: workHasPriorGeneratedImage(work),
    })
  }
  return p
}

/** User ordered wipe — harness deletes on disk immediately (no model required). */
async function tryAutoWipeWorkspace({ folder, userMessage, work, prefs, onEvent, mode, runMeta, threadTitle }) {
  if (mode !== 'agent' || !folder || !shouldRunAutoWipe(work, userMessage, threadTitle)) return null
  if (!workspaceHasUserProjectFiles(folder)) {
    const reply = 'Project folder is already empty (nothing to delete).'
    if (runMeta) runMeta.repliedViaEvent = true
    onEvent?.({ type: 'assistant', text: reply, model: 'Soumtok harness', requestedModel: 'Soumtok harness' })
    return { done: true, text: reply, messages: persistWork(work), repliedViaEvent: true }
  }

  const text = lastUserTextFromWork(work, userMessage)

  const keepGit = !/\b(delete|remove|wipe)\s.*\.git\b/i.test(text)
  onEvent?.({ type: 'status', text: 'Deleting all project files…' })
  onEvent?.({ type: 'tool', name: 'wipe_workspace', args: { keep_git: keepGit } })
  const wipe = await runDesktopTool(folder, 'wipe_workspace', { keep_git: keepGit }, prefs, {})
  onEvent?.({
    type: 'result',
    name: 'wipe_workspace',
    ok: wipe.ok,
    text: (wipe.text || '').slice(0, 12_000),
    path: '.',
  })
  if (!wipe.ok) return null

  const list = await runDesktopTool(folder, 'list_dir', { path: '.' }, prefs, {})
  const remaining = String(list.text || '').trim() || '(empty)'
  const reply = `Done — removed all project files in this folder.\n\nStill in the root:\n${remaining}\n\n(Soumtok ran \`wipe_workspace\` on your PC; .git was ${keepGit ? 'kept' : 'removed'}.)`
  if (runMeta) runMeta.repliedViaEvent = true
  onEvent?.({ type: 'assistant', text: reply, model: 'Soumtok harness', requestedModel: 'Soumtok harness' })
  onEvent?.({ type: 'workspace_refresh' })
  work.push({ role: 'assistant', content: reply })
  return {
    done: true,
    text: reply,
    messages: persistWork(work),
    promptTokens: 0,
    completionTokens: 0,
    repliedViaEvent: true,
  }
}

function workHasGenerateImageThisTurn(work) {
  return workAfterLastHuman(work).some(
    (m) => m.role === 'tool' && /^generate_image$/i.test(String(m.name || '')) && m.ok !== false,
  )
}

function finishImageJob({ work, onEvent, runMeta, text, error }) {
  const reply = String(text || error || 'Could not generate the image.').trim()
  if (runMeta) runMeta.repliedViaEvent = true
  onEvent?.({ type: 'assistant', text: reply, model: 'Soumtok', requestedModel: 'Soumtok' })
  work.push({ role: 'assistant', content: reply })
  return {
    done: true,
    text: reply,
    messages: persistWork(work),
    promptTokens: 0,
    completionTokens: 0,
    repliedViaEvent: true,
  }
}

async function generateImageViaApi(api, args, getBuffer) {
  const prompt = String(args?.prompt || '').trim()
  if (!prompt) return { ok: false, error: 'Write a prompt' }
  const parsed = parseStillRequest(prompt)
  const aspect = normalizeStillAspect(args?.aspect || args?.aspect_ratio || args?.ratio || parsed.aspect)
  const clean = parsed.prompt
  const local = await generateStillViaReplicate(clean, aspect)
  if (local) return { ...local, aspect: local.aspect || aspect }
  const body = { prompt: clean, aspect }
  const model = String(args?.model || '').trim()
  if (/^(fal-ai\/|black-forest-labs\/|google\/imagen)/i.test(model)) body.model = model
  const res = await api('POST', '/api/studio/image', body, 120_000)
  if (res.status === 401) return { ok: false, error: 'Sign in to generate images.' }
  if (res.status !== 200) {
    return { ok: false, error: res.data?.error || 'Image generation failed' }
  }
  const data = imageFieldsFromResponse(res.data)
  let base64 = String(data.base64 || '')
  const ext = String(data.ext || 'jpg').replace(/^\./, '')
  let contentType = String(data.contentType || 'image/jpeg')
  if (!base64 && data.url && typeof getBuffer === 'function') {
    const pathName = String(data.url).startsWith('http')
      ? new URL(data.url).pathname + (new URL(data.url).search || '')
      : String(data.url)
    const bin = await getBuffer('GET', pathName, 60_000)
    if (bin?.status === 401) return { ok: false, error: 'Sign in to generate images.' }
    if (bin?.status === 200 && bin.buffer?.length) {
      base64 = Buffer.from(bin.buffer).toString('base64')
      if (bin.contentType && /^image\//i.test(bin.contentType)) contentType = bin.contentType
    }
  }
  if (!base64) {
    const keys = Object.keys(res.data || {}).filter((k) => k !== 'raw')
    const rawHead = String(res.data?.raw || '').replace(/\s+/g, ' ').slice(0, 80)
    return {
      ok: false,
      error: rawHead
        ? `No image bytes returned (response was not JSON). ${rawHead}`
        : `No image bytes returned. ${keys.length ? `API sent: ${keys.join(', ')}.` : 'Sign in and retry.'}`,
    }
  }
  return { ok: true, base64, ext, contentType, model: data.model, aspect: data.aspect || aspect }
}

function imageFieldsFromResponse(data) {
  const row = data && typeof data === 'object' ? data : {}
  if (row.base64 || row.url) return row
  const raw = String(row.raw || '')
  if (!raw) return row
  return {
    ...row,
    url: /"url"\s*:\s*"(\/api\/studio\/images\/[^"]+)"/.exec(raw)?.[1] || '',
    ext: /"ext"\s*:\s*"([^"]+)"/.exec(raw)?.[1] || '',
    contentType: /"contentType"\s*:\s*"([^"]+)"/.exec(raw)?.[1] || '',
    model: /"model"\s*:\s*"([^"]+)"/.exec(raw)?.[1] || '',
    aspect: /"aspect"\s*:\s*"([^"]+)"/.exec(raw)?.[1] || '',
  }
}

/** User asked for a still image — harness generates it (no repo scan, no coding model). */
async function tryAutoGenerateImage({ folder, userMessage, work, prefs, onEvent, mode, runMeta, toolCtx }) {
  if (mode !== 'agent') return null
  const text = lastUserTextFromWork(work, userMessage)
  const hint = imageIntentHintFromWork(work)
  if (!userAskedToGenerateImage(text, hint)) return null
  if (workHasGenerateImageThisTurn(work)) {
    return finishImageJob({
      work,
      onEvent,
      runMeta,
      text: 'The still is already saved this turn. Check assets/generated/.',
    })
  }
  if (!folder) {
    return finishImageJob({
      work,
      onEvent,
      runMeta,
      error: 'Open a project folder (File → Open Folder) so Soumtok can save the image to assets/generated/.',
    })
  }
  const parsed = stillRequestFromUser(text)
  const prompt = parsed.prompt
  const aspect = parsed.aspect
  onEvent?.({ type: 'status', text: `Understood — generating ${aspect} still…` })
  onEvent?.({ type: 'tool', name: 'generate_image', args: { prompt, aspect } })
  const got = await runDesktopTool(folder, 'generate_image', { prompt, aspect }, prefs, toolCtx || {})
  onEvent?.({
    type: 'result',
    name: 'generate_image',
    ok: got.ok,
    text: (got.text || '').slice(0, 12_000),
    path: got.rel || '',
    image: got.image?.dataUrl || '',
    aspect: got.aspect || aspect,
  })
  if (got.rel) onEvent?.({ type: 'file', path: got.rel })
  work.push({
    role: 'tool',
    name: 'generate_image',
    content: (got.text || (got.ok ? 'Generated still image.' : 'Image generation failed')).slice(0, 12_000),
    ok: got.ok !== false,
  })
  if (!got.ok) {
    return finishImageJob({
      work,
      onEvent,
      runMeta,
      error: got.text || 'Could not generate the image. Sign in and check that the server has REPLICATE_API_TOKEN.',
    })
  }
  const ratio = got.aspect || aspect
  const reply = got.rel
    ? `Done — generated a ${ratio} still at ${got.rel}.`
    : String(got.text || `Generated a ${ratio} still.`)
  if (runMeta) runMeta.repliedViaEvent = true
  onEvent?.({ type: 'assistant', text: reply, model: 'Soumtok', requestedModel: 'Soumtok' })
  onEvent?.({ type: 'workspace_refresh' })
  work.push({ role: 'assistant', content: reply })
  return {
    done: true,
    text: reply,
    messages: persistWork(work),
    promptTokens: 0,
    completionTokens: 0,
    repliedViaEvent: true,
  }
}

const WIPE_WORKSPACE_BRIEF = `SOUMTOK WORKSPACE WIPE (user explicitly asked to delete/clear the project):

- Call wipe_workspace() NOW — it removes every file/folder in the workspace root (keeps .git unless user said delete .git too).
- Or call delete(path) repeatedly for each path from list_dir(".").
- Do NOT tell the user to run PowerShell/cmd manually — you have delete and wipe_workspace tools.
- Do NOT read README/package.json "first" — wipe first, then list_dir to confirm empty.
- After wipe: list_dir(".") and report what remains.`

const IMAGE_NOW_BRIEF = `SOUMTOK IMAGE NOW (harness classified a standalone still-image request):

- Understand their request first (subject, follow-up like "a new one", ratio). Then generate.
- Call generate_image({ prompt }) NOW with their subject. Still images only.
- Do NOT list_dir, read, grep, glob, or explore the project.
- Do NOT say you need tool access — generate_image is already enabled this turn.
- Save under assets/generated/ and tell them the path.`

function workHasDeletes(work) {
  return (work || []).some((m) => {
    const c = String(m.content || '')
    if (m.role === 'tool' && /\bDeleted\b|Wiped workspace|removed \d+ item/i.test(c)) return true
    return /"name"\s*:\s*"(delete|wipe_workspace|clear_workspace)"/i.test(c)
  })
}

function assistantRefusesDeleteOrManualWipe(text) {
  const t = String(text || '')
  return (
    /\b(can'?t|cannot|won'?t|unable to)\b[\s\S]{0,80}\b(delete|remove|wipe)\b/i.test(t) ||
    /\bRemove-Item\b|\brm\s+-rf\b|\brm -r\b/i.test(t) ||
    /\btool path that will actually work\b|\bmine isn'?t landing\b|\bharness re-?runs\b/i.test(t) ||
    /\bopen (the )?integrated terminal\b[\s\S]{0,80}\b(delete|remove|wipe)\b/i.test(t)
  )
}

function rootListLooksEmpty(names) {
  const meaningful = (names || []).filter((n) => {
    const base = String(n || '')
      .trim()
      .replace(/\/$/, '')
    if (!base || base === '.' || base === '..') return false
    if (/^\.(git|soumtok|vscode|cursor|idea)/i.test(base)) return false
    if (/^node_modules$/i.test(base)) return false
    return true
  })
  return meaningful.length === 0
}

function workspaceScanLooksGreenfield(scan) {
  if (!scan) return false
  if (/STATUS:\s*GREENFIELD|GREENFIELD WORKSPACE/i.test(scan)) return true
  const m = String(scan).match(/Workspace root[^:]*:\n([\s\S]*?)(?:\n\nFile:|$)/)
  if (!m) return false
  const lines = m[1]
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  if (lines.length === 1 && /^\(empty\)$/i.test(lines[0])) return true
  return rootListLooksEmpty(lines)
}

function workHasFileWrites(work) {
  return (work || []).some((m) => {
    if (/SCAFFOLD ON DISK/i.test(String(m.content || '')) && (m.role === 'system' || m.role === 'user')) return true
    if (m.role !== 'tool') return false
    if (m.ok === false) return false
    if (!/^(write|diff|edit|str_replace|apply_patch)$/i.test(String(m.name || ''))) return false
    const c = String(m.content || '').trim()
    if (/^(Could not apply edit|Could not find that text|old_string not found|Unknown tool:)/i.test(c)) return false
    return true
  })
}

function workHasFileWritesThisTurn(work) {
  return workHasFileWrites(workAfterLastHuman(work))
}

async function applyGreenfieldScaffoldIfStalled({ folder, userMessage, work, onEvent, ctx }) {
  if (!folder || !workspaceIsGreenfield(folder)) return false
  if (workHasFileWritesThisTurn(work) || ctx._scaffoldWrote?.length) return false
  const text = lastUserTextFromWork(work, userMessage)
  if (!userWantsGreenfieldBuild(text) && !userAskedToBuildSomething(text)) return false
  const sc = applyGreenfieldScaffold(folder, text)
  if (!sc.wrote?.length) return false
  ctx._scaffoldWrote = sc.wrote
  ctx._workspaceProbed = true
  ctx._buildDirectorInjected = true
  try {
    require('./semanticIndex').invalidateIndex(folder)
  } catch {
    /* optional */
  }
  for (const rel of sc.wrote) {
    onEvent?.({ type: 'tool', name: 'write', args: { path: rel } })
    onEvent?.({ type: 'result', name: 'write', ok: true, text: `Wrote ${rel}`, path: rel })
  }
  injectHarnessFact(
    work,
    `SCAFFOLD ON DISK (harness wrote starter files after the model stalled — tighten these to the USER request, do not recreate a second tree):\n${sc.wrote.join('\n')}`,
    'SCAFFOLD ON DISK',
  )
  return true
}

function concludeWrittenWork({ work, onEvent, runMeta, lastText, usedModel, requestedModel }) {
  const text =
    lastText && isUserFacingConclusion(lastText, work) ? lastText : composeLocalConclusion(work, { run: false })
  if (!text) return lastText
  if (runMeta) runMeta.repliedViaEvent = true
  onEvent?.({
    type: 'assistant',
    text,
    model: usedModel || 'Soumtok',
    requestedModel: requestedModel || usedModel || 'Soumtok',
  })
  return text
}

function assistantShowsCodeWithoutWriting(text) {
  const t = String(text || '')
  if (!t.trim()) return false
  const hasFence = /```[\s\S]{30,}```/.test(t)
  const hasFakeWriteXml = /<write\s+path=["'][^"']+["']\s*>/i.test(t)
  const promisesFiles =
    /\b(let me create|I'll create|I will create|create the file|writing the file|here's what I'll build|I'll build|I will build|I'll implement|let me create all the files|here's what you're getting|next I'll write|I need to actually execute|hasn't happened yet in this turn)\b/i.test(
      t,
    )
  const describesOnly =
    /\b(workspace is empty|greenfield|no files|nothing to build on|empty folder)\b/i.test(t) &&
    (hasFence || hasFakeWriteXml || promisesFiles) &&
    !/\b(already (created|wrote|saved)|created on disk|file is at)\b/i.test(t)
  return promisesFiles || hasFakeWriteXml || describesOnly || (hasFence && promisesFiles)
}

const GREENFIELD_BUILD_NUDGE =
  '[Soumtok harness] Empty folder. Understand their product first (their words). todo_write 2–5 steps, then write() those files. Do not list_dir. Do not dump a generic cube/Vite demo if they asked for something else. Windows: ; not &&.'

const MESSY_IN_PLACE_NUDGE =
  '[Soumtok harness] Work IN THIS workspace folder only — never tell the user to create or switch to a new folder. Follow SOUMTOK MESSY WORKSPACE RECOVERY: delete/consolidate _*.js scratch scripts, fix server.js + test.js, terminal(npm test / npm start), read_terminal() → give localhost URL. No option menus.'

function assistantSuggestedNewFolder(text) {
  return /\b(new folder|different folder|clean folder|start fresh|fresh folder|elsewhere|another folder|new directory|create a folder elsewhere|move to a new)\b/i.test(
    String(text || ''),
  )
}

function assistantPuntedToUser(text) {
  const t = String(text || '')
  if (!t.trim()) return false
  if (
    /\b(I can'?t|I cannot|I'm unable|I am unable|unable to|don't have (direct )?access|cannot directly|not able to)\b/i.test(
      t,
    )
  ) {
    return true
  }
  if (
    /\b(you (can|should|need to) run|try running|open a terminal|run this command|manually run|in your terminal|run these in your terminal|run these (two|commands)|in the integrated terminal|each in its own terminal|to actually start your ports)\b/i.test(
      t,
    )
  ) {
    return true
  }
  if (/\bneed (tool|file) access\b/i.test(t) || /\bin this chat turn\b/i.test(t)) {
    return true
  }
  if (/\bwant me to kick off\b/i.test(t) && /\bnpm run dev/i.test(t)) {
    return true
  }
  if (
    /\b(my terminal is )?sandboxed\b|\bterminal is sandboxed\b|\brestricted sandbox\b|\bpipe was blocked\b|\bsandboxed terminal kills\b|\bcan'?t hold a long-running server\b|\blimitation of my environment\b/i.test(
      t,
    )
  ) {
    return true
  }
  return /\bI can'?t,? (use |run )?(the )?terminal\b/i.test(t)
}

/** Model stopped mid-job and asked permission instead of calling tools. */
function assistantOffersPreviewAfterBuild(text) {
  return /\b(want me to|should I|can I|ready for me to)\b[\s\S]{0,80}\b(run|start|launch)\b[\s\S]{0,80}\b(preview|see how|look|dev server|browser|terminal|try it)/i.test(
    String(text || ''),
  )
}

function userConfirmedRunPreview(text) {
  const t = String(text || '').trim()
  if (!t) return false
  if (/^(go|yes|y|ok|okay|sure|run|start|do it|please|yep|yeah|continue|build it)[!.?\s]*$/i.test(t)) return true
  return /\b(yes,? (please )?run|go ahead|start (the )?(dev )?server|run it|show me|let'?s see|build it)\b/i.test(t)
}

function priorAssistantOfferedPreview(work) {
  for (let i = (work || []).length - 1; i >= 0; i--) {
    const m = work[i]
    if (m.role === 'assistant') {
      const c = String(m.content || '')
      return (
        assistantOffersPreviewAfterBuild(c) ||
        /\b(see how it looks|how it looks|start the dev server|run it (for you|in the terminal)|open.*localhost|say \*\*go\*\*|reply "go"|say \*\*go\*\*)\b/i.test(
          c,
        ) ||
        /\breply ["']go["']|say ["']go["']|when you send.*build/i.test(c)
      )
    }
    if (m.role === 'user' && !userConfirmedRunPreview(m.content)) return false
  }
  return false
}

function assistantDeferredAction(text) {
  const t = String(text || '')
  if (!t.trim()) return false
  if (assistantOffersPreviewAfterBuild(t)) return false
  if (/\bsay\s+go\b|\bsay\s+when\b|\bjust say\b|\blet me know if\b|\bwhen you'?re ready\b|\bshall i\b/i.test(t)) {
    if (/\b(preview|see how|look|dev server|browser)\b/i.test(t)) return false
    return true
  }
  if (/\bif you want me to\b|\bdo you want me to\b/i.test(t)) {
    if (/\b(run|start|preview|see|look)\b/i.test(t)) return false
    return true
  }
  if (
    /\bI'?ll (run|check|confirm|verify|hit|probe|curl|test)\b/i.test(t) &&
    /\b(health|netstat|port|localhost|listening|\/health)\b/i.test(t)
  ) {
    return true
  }
  if (/\b(next,? I'?ll|I will (run|check|verify)|about to (run|check))\b/i.test(t) && /\b(netstat|health|confirm|verify|port)\b/i.test(t)) {
    return true
  }
  return false
}

const AGENT_FINISH_VERIFY_NUDGE =
  '[Soumtok harness] Do NOT ask the user to say "go" or wait for permission. You said you would verify — call tools NOW: read_terminal({ wait_ms: 15000 }) then terminal("netstat -ano | findstr LISTENING | findstr :5170") (and API port), and/or web_fetch on http://localhost:PORT/health. Reply only after tool output with URLs and pass/fail.'

const PREVIEW_RUN_NOW_NUDGE =
  '[Soumtok harness] User said go — execute NOW with tools: write() every planned file (no XML in chat), terminal("npm install"), terminal("npm start" or npm run dev), read_terminal({ wait_ms: 20000 }), reply with localhost URL. Tools ARE allowed. Intent is BUILD not question.'

const APPLY_EDIT_NOW_NUDGE =
  '[Soumtok harness] Guide: finish the user request with diff()/write()/terminal() on the files you have. You may read({ path, start_line, end_line }) if you still need a slice. Do not tell the user about the harness. Do not ask "want me to". Then a short summary with evidence.'

const DO_WORK_NOW_NUDGE = APPLY_EDIT_NOW_NUDGE

function composeRunNowNudge(folder) {
  const cmd = pickRunCommandFromFolder(folder)
  return `[Soumtok harness] User asked to RUN the app / localhost NOW. Prefer terminal("${cmd}") then read_terminal({ wait_ms: 20000 }). If the port is already in use, that app is already running — reply with that URL (do not fail). You may read files if you still need them. Do not tell the user about the harness.`
}

function composeBuildAutoRunNudge(folder, buildKind) {
  const cmd = pickRunCommandFromFolder(folder)
  const intent = buildKind ? { kind: buildKind } : inferIntentForFolder(folder, '')
  const web = projectDeliversInBrowser(intent, folder) || projectLooksLikeLocalWebApp(folder)
  if (web) {
    return `[Soumtok harness] Build phase done — verify and launch WITHOUT asking permission:
1. terminal("npm test" or node test.js) if the repo has tests — fix failures with write/diff.
2. terminal("${cmd}") → read_terminal({ wait_ms: 20000 }).
3. Reply with localhost URL + 1–2 sentences on what you built from the user's request. No "want me to run".`
  }
  return `[Soumtok harness] Run what you built: terminal("${cmd}") (or the correct npm script), read_terminal if needed, summarize output. No permission ask.`
}

function workHasDevServerRun(work) {
  return (work || []).some((m) => {
    const c = String(m.content || '')
    if (!/\bterminal\b/i.test(c) && m.role !== 'tool') return false
    return /\b(npm run (dev|start|serve|preview|web)|npm start|node server\.js|vite|next dev)\b/i.test(c)
  })
}

function workHasBrowser(work) {
  return (work || []).some((m) => {
    const n = String(m.name || '').toLowerCase()
    return m.role === 'tool' && /^(browser|browser_snapshot|screenshot)$/.test(n)
  })
}

const BROWSER_SEE_PAGE_NUDGE =
  '[Soumtok harness] Localhost is up. Call browser({ action: "snapshot", url: "http://localhost:PORT" }) NOW so you can see the page (errors, blank canvas, headings). Terminal logs are not a screenshot. Then conclude with the URL and what is on the page.'

const ANALYZE_THEN_BUILD_NUDGE =
  '[Soumtok harness] Scaffold is on disk or listed in KNOWN FILES. Do NOT list_dir. diff/write src/ if needed, then terminal("npm install"); terminal("npm run dev") — Windows: ; not &&. Then read_terminal({ wait_ms: 20000 }). Tools only.'

const AGENT_FOLLOW_THROUGH_NUDGE =
  '[Soumtok harness] You told the user you would fix/update/run/change something — do it NOW in this session using tools (read, grep, write, diff, terminal). Do not send another chat-only reply until the fix is applied and verified (e.g. npm test / node). Only stop if a tool returns a hard error.'

const AGENT_FINISH_APP_NUDGE =
  '[Soumtok harness] Stop asking the user to choose. Execute now with tools:\n1. Fix tests (write/diff) until npm test / node test.js passes if tests exist.\n2. terminal(start/dev script from package.json) — integrated Terminal.\n3. read_terminal({ wait_ms: 20000 }) — confirm URL or demo output.\nReply only after tools run. No menus.'

function projectLooksLikeLocalWebApp(folder) {
  if (!folder) return false
  try {
    return (
      fs.existsSync(path.join(folder, 'vite.config.ts')) ||
      fs.existsSync(path.join(folder, 'vite.config.js')) ||
      fs.existsSync(path.join(folder, 'server.js')) ||
      (fs.existsSync(path.join(folder, 'index.html')) && fs.existsSync(path.join(folder, 'src'))) ||
      (fs.existsSync(path.join(folder, 'web', 'index.html')) && fs.existsSync(path.join(folder, 'package.json')))
    )
  } catch {
    return false
  }
}

function assistantAsksUserToChoose(text) {
  const t = String(text || '')
  return (
    /\btell me which\b/i.test(t) ||
    /\bwhich (one|option|do you want)\b/i.test(t) ||
    /\b(what would you like|what do you want|pick one|choose (one|between)|your call)\b/i.test(t) ||
    (/\b1\.[\s\S]*\b2\.[\s\S]*\b3\./.test(t) && /\b(want|prefer|choose)\b/i.test(t))
  )
}

function assistantApologySpinWithoutAction(text) {
  const t = String(text || '')
  return (
    /\b(churning|wasting your time|blunt assessment|here'?s the truth|I'?ve been|does not work|not running|still fails)\b/i.test(
      t,
    ) && /\b(tell me|which|want me to|should I)\b/i.test(t)
  )
}

/** Assistant described future work but did not call tools this turn. */
function assistantPromisedFollowThrough(text) {
  const t = String(text || '').trim()
  if (!t) return false
  if (assistantOffersPreviewAfterBuild(t)) return false
  if (/\?\s*$/.test(t) && /\b(want me|should I|can I|shall I)\b/i.test(t)) return false
  if (
    /\b(let me|I'?ll|I will|going to|about to|now I'?ll|next,? I'?ll|I'm going to)\b[\s\S]{0,240}\b(fix|update|patch|edit|change|run|create|write|build|make|scaffold|adjust|correct|rerun|re-run|apply|implement|read|grep|list|install|start|delete|remove|consolidate|verify|check)\b/i.test(
      t,
    )
  ) {
    return true
  }
  if (
    /\b(let me fix it|let me fix that|I'll fix it|I will fix it|let me update|I'll update|let me correct|let me patch|I'll run the test|let me run)\b[.!\s]*$/i.test(
      t,
    )
  ) {
    return true
  }
  if (/\b(first|next|then),?\s+(I'?ll|let me|we'?ll)\b/i.test(t)) return true
  if (/\bhere'?s (what|how) I'?ll\b|\bmy plan is\b|\bplanned steps\b/i.test(t)) return true
  if (/(^|\n)\s*\d+\.\s*(I'?ll|Let me|First|Then|Next|We)/im.test(t)) return true
  if (/\b(I'?ll|I will)\s+(start by|begin by|need to)\b/i.test(t)) return true
  return false
}

const AGENT_ACT_NOW_NUDGE =
  '[Soumtok harness] You sent a plan without tool calls. STOP narrating. In your NEXT turn call tools only: read/grep/list_dir → write/diff → terminal → read_terminal. Do not reply with another bullet list or "I\'ll …" — execute on the user\'s machine now.'

const AGENT_WIPE_NOW_NUDGE =
  '[Soumtok harness] User ordered DELETE EVERYTHING in this project. Call wipe_workspace() immediately (or delete each path). Do NOT ask them to use PowerShell. Do NOT read more files first. Then list_dir(".") and confirm.'

function parseToolArgs(raw) {
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return {}
  }
}

function inspectPathFromCall(call) {
  const args = parseToolArgs(call.arguments || call.input)
  const n = String(call.name || '').toLowerCase()
  if (n === 'terminal' || n === 'shell') {
    const asRead = parseFileReadViaShell(String(args.command || args.cmd || ''))
    if (asRead?.path) return String(asRead.path).replace(/\\/g, '/').replace(/^\.\//, '')
    return ''
  }
  return String(args.path || args.file || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
}

function toolCallIsInspect(call) {
  const n = String(call.name || '').toLowerCase()
  if (/^(read|grep|list_dir|glob|codebase_search)$/i.test(n)) return true
  if (n === 'terminal' || n === 'shell') return Boolean(inspectPathFromCall(call))
  return false
}

function isHtmlSpaBody(data) {
  const raw = data?.raw
  if (typeof raw !== 'string') return false
  const head = raw.trimStart().slice(0, 64).toLowerCase()
  return head.startsWith('<!doctype') || head.startsWith('<html')
}

function shouldUseStudioCompleteFallback(res) {
  if (!res) return true
  if (res.status === 404 || res.status === 405) return true
  if (isHtmlSpaBody(res.data)) return true
  return false
}

function isTrialModelCapError(res) {
  return res?.status === 402 && String(res.data?.error || '').includes('Trial includes')
}

function shouldRetryTrialWithDeepSeek(model, res) {
  return isTrialModelCapError(res) && (model === 'auto' || !model)
}

function isToolChainApiError(message) {
  return /role ['"]tool['"]|tool_calls/i.test(String(message || ''))
}

function errorFromResponse(res, fallback) {
  if (res.status === 0) return res.data?.error || 'Could not reach Soumtok. Check your connection.'
  if (typeof res.data?.error === 'string' && res.data.error) return res.data.error
  if (typeof res.data?.message === 'string' && res.data.message) return res.data.message
  return fallback
}

function lastUserTextFromWork(work, userMessage) {
  if (userMessage && !/^\[Soumtok harness\]/i.test(String(userMessage).trim())) return String(userMessage)
  const last = [...(work || [])]
    .reverse()
    .find((m) => m.role === 'user' && !/^\[Soumtok harness\]/i.test(String(m.content || '').trim()))
  return typeof last?.content === 'string' ? last.content : String(userMessage || '')
}

function lastAssistantTextFromWork(work) {
  const last = [...(work || [])]
    .reverse()
    .find((m) => m.role === 'assistant' && String(m.content || '').trim())
  return typeof last?.content === 'string' ? last.content : ''
}

function workAlreadyHasAtlas(work) {
  return (work || []).some((m) => /KNOWN FILES \(harness already searched/i.test(String(m.content || '')))
}

function pathsNamedInText(text) {
  const out = []
  const seen = new Set()
  const re = /\b((?:[\w.-]+\/)*[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|css|html|py|json|md))\b/gi
  let m
  while ((m = re.exec(String(text || '')))) {
    const p = m[1].replace(/\\/g, '/')
    if (seen.has(p)) continue
    seen.add(p)
    out.push(p)
    if (out.length >= 8) break
  }
  return out
}

function userWantsProjectOverview(text) {
  const t = String(text || '').toLowerCase()
  const compact = t.replace(/[^a-z0-9]/g, '')
  if (
    compact.includes('whatmyproject') ||
    compact.includes('whatthisproject') ||
    compact.includes('projectisabout') ||
    compact.includes('aboutmyproject') ||
    compact.includes('aboutthisproject') ||
    compact.includes('tellmewhatmyproject')
  ) {
    return true
  }
  return (
    /\b(what('s|s| is)|tell me|explain|describe|summarize|can you tell).{0,48}(project|repo|codebase|app|folder|workspace|this)/.test(t) ||
    /\b(what|tell me).{0,20}(project|repo).{0,20}(about|for|do)/.test(t) ||
    /\bwhat (am i|are we) (building|working on|making)/.test(t) ||
    /\b(project|repo|codebase) (about|is for|does|is)/.test(t) ||
    /\bwhat is this (project|repo|app)/.test(t) ||
    (/\bproject\b/.test(t) && /\b(about|what|explain|describe|tell)\b/.test(t)) ||
    (/\bwhat\b/.test(t) && /\bproject\b/.test(t))
  )
}

async function probeWorkspaceOverview(folder, prefs, onEvent, opts = {}) {
  if (!folder) return ''
  const quiet = Boolean(opts.quiet)
  if (!quiet) onEvent?.({ type: 'status', text: 'Scanning your project…' })
  if (!quiet) onEvent?.({ type: 'tool', name: 'list_dir', args: { path: '.' } })
  const rootList = await runDesktopTool(folder, 'list_dir', { path: '.' }, prefs)
  if (!quiet) {
    onEvent?.({
      type: 'result',
      name: 'list_dir',
      ok: rootList.ok,
      text: rootList.text || '',
      path: '.',
    })
  }
  const names = (rootList.text || '').split('\n').map((s) => s.trim()).filter(Boolean)
  const readFirst = [
    'README.md',
    'package.json',
    'apps/web/package.json',
    'apps/api/package.json',
    'web/package.json',
    'api/package.json',
    'pyproject.toml',
    'Cargo.toml',
    'go.mod',
    'composer.json',
    'Soumtok.toml',
  ]
  const chunks = [`Workspace root (${folder}):\n${rootList.text || '(empty)'}`]
  try {
    const git = gitSnapshot(folder)
    if (git?.text) chunks.push(`GIT:\n${compactGitSnapshot(git.text)}`)
  } catch {
    /* optional */
  }
  if (rootListLooksEmpty(names)) {
    chunks.unshift(
      'STATUS: GREENFIELD WORKSPACE — root has no project files yet. Use write() to create the app on disk; chat-only code blocks do not create files.',
    )
  }
  for (const name of readFirst) {
    const hit =
      names.find((n) => n.toLowerCase() === name.toLowerCase()) ||
      (fs.existsSync(path.join(folder, name)) ? name : null)
    if (!hit) continue
    if (!quiet) onEvent?.({ type: 'tool', name: 'read', args: { path: hit } })
    const read = await runDesktopTool(folder, 'read', { path: hit }, prefs)
    if (!quiet) {
      onEvent?.({
        type: 'result',
        name: 'read',
        ok: read.ok,
        text: read.text || '',
        path: hit,
      })
      if (read.ok && read.rel) onEvent?.({ type: 'file', path: read.rel })
    }
    if (read.ok && read.text) {
      const cap = /package\.json$/i.test(hit) ? 3500 : 1800
      chunks.push(`File: ${hit}\n${read.text.slice(0, cap)}`)
    }
  }
  return chunks.join('\n\n')
}

const SOURCE_PROBE_PATHS = [
  'apps/api/src/index.ts',
  'apps/api/src/index.js',
  'apps/api/src/main.ts',
  'apps/api/src/server.ts',
  'apps/api/src/app.ts',
  'apps/api/src/routes/index.ts',
  'apps/web/src/app/page.tsx',
  'apps/web/src/app/layout.tsx',
  'apps/web/app/page.tsx',
  'apps/web/src/pages/index.tsx',
  'src/index.ts',
  'src/main.ts',
  'src/app.ts',
]

function likelyVisualEditTargets(folder, atlasPaths) {
  if (!folder) return []
  const exists = (rel) => {
    try {
      return fs.existsSync(path.join(folder, rel))
    } catch {
      return false
    }
  }
  const fromAtlas = [...new Set(atlasPaths || [])].filter(
    (p) => /\.(ts|tsx|js|jsx|css|html)$/i.test(p) && !/readme/i.test(p) && exists(p),
  )
  if (fromAtlas.length) return fromAtlas.slice(0, 6)
  const names = []
  try {
    const src = path.join(folder, 'src')
    if (fs.existsSync(src)) {
      for (const n of fs.readdirSync(src)) {
        if (/\.(ts|tsx|js|jsx|css)$/i.test(n)) names.push(`src/${n.replace(/\\/g, '/')}`)
      }
    }
  } catch {
    /* ignore */
  }
  for (const fallback of ['src/main.ts', 'src/style.css', 'src/index.ts', 'index.html', 'index.js']) {
    if (exists(fallback) && !names.includes(fallback)) names.push(fallback)
  }
  return names.slice(0, 6)
}

function composeVisualEditBrief(userText, folder, atlasPaths) {
  const files = likelyVisualEditTargets(folder, atlasPaths)
  const fileLines = files.length
    ? files.map((f) => `- read("${f}") — then diff() with EXACT text from that read, or write() the whole file`).join('\n')
    : '- Use FILE BODIES / TOUCH THESE from KNOWN FILES (not README)'
  const q = String(userText || '').trim().slice(0, 240).replace(/"/g, "'")
  return `SOUMTOK VISUAL EDIT (harness — think, plan, then patch the files that paint the UI):

USER: "${q}"

ORDER (do not skip):
1. THINK what is wrong from the user text (and screenshot if attached) — do not list_dir.
2. PLAN with todo_write (2–4 steps).
3. READ only these files (they already exist):
${fileLines}
4. diff() or write() those files. If diff fails, write() the full file.
5. browser snapshot of localhost if the server is already running.

FORBIDDEN: README.md, list_dir of ".", inventing a new unrelated app tree.`
}

function visualEditNowNudge(ctx) {
  const files = likelyVisualEditTargets(ctx?.folder, ctx?._atlasPaths).slice(0, 3)
  const pin = files.length
    ? files.map((f) => `diff() or write() "${f}"`).join(' then ')
    : 'diff() or write() the TOUCH THESE paths from KNOWN FILES'
  return `[Soumtok harness] Plan is done. ${pin} to fix the look. Do not list_dir. Do not read README.`
}

function isGeneralOrSoumtokChat(text) {
  return isGeneralKnowledgeQuestion(text)
}

function userWantsCodeInspection(text) {
  if (isGeneralOrSoumtokChat(text)) return false
  if (userWantsVisualPolish(text)) return false
  const t = String(text || '').toLowerCase()
  return (
    /\b(audit|sweep|investigate|code review|security|vuln|go deeper|scan the (repo|code|project))\b/.test(t) ||
    /\bgo (ahead|deeper)\b/.test(t)
  )
}

function workHasSourceReads(work) {
  for (const item of work || []) {
    if (item.role !== 'tool') continue
    const body = String(item.content || '')
    if (/\(\d+ lines\)\n/.test(body) || body.length > 800) return true
  }
  for (const item of work || []) {
    if (item.role !== 'user') continue
    const c = String(item.content || '')
    if (/\[Soumtok harness — read\(/.test(c) && c.length > 400) return true
  }
  return false
}

async function probeSourceEntryPoints(folder, prefs, onEvent, work, ctx) {
  if (!folder || ctx._sourceProbed) return ctx
  const previews = []
  let readCount = 0
  for (const rel of SOURCE_PROBE_PATHS) {
    if (readCount >= 8) break
    const full = path.join(folder, rel)
    if (!fs.existsSync(full)) continue
    onEvent?.({ type: 'tool', name: 'read', args: { path: rel } })
    const read = await runDesktopTool(folder, 'read', { path: rel }, prefs)
    onEvent?.({
      type: 'result',
      name: 'read',
      ok: read.ok,
      text: read.text || '',
      path: rel,
    })
    if (read.ok && read.rel) onEvent?.({ type: 'file', path: read.rel })
    if (read.ok && read.text) {
      readCount++
      previews.push(`File: ${rel}\n${read.text.slice(0, 1800)}`)
    }
  }
  if (previews.length) {
    ctx.workspaceScan = `${ctx.workspaceScan || ''}\n\nSOURCE FILES (auto-read by Soumtok Desktop — use this; do not claim you lack access):\n${previews.join('\n\n---\n\n')}`.slice(
      0,
      96_000,
    )
    injectWorkspaceScanIntoWork(work, ctx)
  }
  ctx._sourceProbed = true
  return ctx
}

function assistantRefusesSourceRead(text) {
  return /haven'?t actually (seen|opened|read)|only listed|map, not the code|can't honestly claim|need to read the source|haven'?t opened the source|scans so far only|not the code yet|before i (can )?find/i.test(
    String(text || ''),
  )
}

function pinLiveUserOnWork(work, userMessage) {
  const pin = String(userMessage || '').trim()
  if (!pin || !Array.isArray(work)) return
  const sysIdx = work.findIndex((m) => m.role === 'system')
  if (sysIdx < 0) return
  const cur = String(work[sysIdx].content || '')
  const base = cur.replace(/\n*LIVE USER REQUEST \(highest priority[\s\S]*$/i, '').trim()
  work[sysIdx].content = `${base}\n\nLIVE USER REQUEST (highest priority — do this now):\n${pin}`
}

function buildDesktopFallbackSystem({ folder, branch, openFiles, mode, driver, workspaceScan, modelLabel }) {
  const files = (openFiles || []).slice(0, 8).join(', ') || 'none'
  const scanBlock = workspaceScan
    ? `\nWORKSPACE SCAN:\n${workspaceScan}\n`
    : ''
  const modelLine = modelLabel ? `\nModel: ${modelLabel}\n` : ''
  return `You are Soumtok Agent (driver: ${driver || 'ide'}, mode: ${mode || 'agent'}).
Workspace: ${folder || 'unknown'}
Git: ${branch || 'n/a'}
Open tabs: ${files}${modelLine}${scanBlock}

Use JSON function tools (write/diff/terminal/read). Chat XML <write> does not create files.
"go"/"yes" after a plan = execute write + terminal now. Tools are on.
Real PC terminal via terminal() then read_terminal({ wait_ms: 20000 }). Never sandboxed.
Build: write files → npm install → npm start/dev → URL. Messy folder: fix in place.
Reply concisely after tools run.`
}

function injectWorkspaceScanIntoWork(work, ctx) {
  if (!ctx?.workspaceScan || ctx._scanInjected) return
  const marker = 'WORKSPACE SCAN (auto-collected by Soumtok Desktop)'
  const block = `${marker}:\n${ctx.workspaceScan}\n\nDo not ask the user to open README or tabs — use this scan.`
  const sysIdx = (work || []).findIndex((m) => m.role === 'system')
  if (sysIdx >= 0) {
    const cur = String(work[sysIdx].content || '')
    if (!cur.includes(marker)) work[sysIdx].content = `${cur}\n\n${block}`
  } else {
    work.unshift({ role: 'system', content: block })
  }
  ctx._scanInjected = true
}

function readPackageDevScriptsBlock(folder) {
  try {
    const raw = fs.readFileSync(path.join(folder, 'package.json'), 'utf8')
    const pkg = JSON.parse(raw)
    const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {}
    const lines = ['DEV SCRIPTS (run with terminal("npm run <name>") in integrated Terminal — cwd is repo root):']
    for (const [name, cmd] of Object.entries(scripts)) {
      if (!/dev|start|serve|preview|api|web|watch/i.test(name) && !/dev|watch|tsx|next|vite/i.test(String(cmd))) {
        continue
      }
      lines.push(`  npm run ${name}  →  ${String(cmd).slice(0, 120)}`)
    }
    return lines.length > 1 ? lines.join('\n') : ''
  } catch {
    return ''
  }
}

function spliceSystemBeforeLiveUser(cur, block) {
  const src = String(cur || '').trim()
  const add = String(block || '').trim()
  if (!add) return src
  const live = src.search(/\n*LIVE USER REQUEST \(highest priority/i)
  if (live < 0) return src ? `${src}\n\n${add}` : add
  return `${src.slice(0, live).trim()}\n\n${add}\n\n${src.slice(live).trim()}`
}

function injectSystemBlock(work, block, marker) {
  if (!block) return
  const tag = marker || String(block).slice(0, 48)
  const sysIdx = (work || []).findIndex((m) => m.role === 'system')
  if (sysIdx >= 0) {
    const cur = String(work[sysIdx].content || '')
    if (!cur.includes(tag)) work[sysIdx].content = spliceSystemBeforeLiveUser(cur, block)
  } else {
    work.unshift({ role: 'system', content: block })
  }
}

const HARNESS_CHUNK_MARKERS = [
  'PROJECT BRIEF',
  'PROJECT RULES (from this repo',
  'SOUMTOK PLATFORM CONTEXT',
  'SOUMTOK DO WORK NOW',
  'SOUMTOK CONTINUE NOW',
  'TASK LEDGER',
  'SCAFFOLD ON DISK',
  'KNOWN FILES (harness already searched',
  'SOUMTOK BUILD DIRECTOR',
  'SOUMTOK MESSY WORKSPACE RECOVERY',
  'SOUMTOK LOOP',
  'SOUMTOK THINK FIRST',
  'SOUMTOK TASK INTENT',
  'SOUMTOK VISUAL EDIT',
  'SOUMTOK WORKSPACE WIPE',
  'SOUMTOK IMAGE NOW',
  'SOUMTOK STEER',
  'SOUMTOK RUN STATE',
  'SOUMTOK PREVIEW RUN',
  'WORKSPACE SCAN',
  'DEV SCRIPTS (run with terminal',
  'SKILLS (read_skill',
  'LIVE USER REQUEST',
]

function replaceSystemChunk(work, marker, block) {
  if (!block) return
  const sysIdx = (work || []).findIndex((m) => m.role === 'system')
  if (sysIdx < 0) {
    work.unshift({ role: 'system', content: block })
    return
  }
  const cur = String(work[sysIdx].content || '')
  const i = cur.indexOf(marker)
  if (i < 0) {
    work[sysIdx].content = spliceSystemBeforeLiveUser(cur, block)
    return
  }
  let end = cur.length
  for (const other of HARNESS_CHUNK_MARKERS) {
    if (other === marker) continue
    const j = cur.indexOf(other, i + marker.length)
    if (j > i && j < end) end = j
  }
  work[sysIdx].content = `${cur.slice(0, i).trim()}\n\n${block}\n\n${cur.slice(end).trim()}`.trim()
}

function syncTaskKind(roundCtx, work, userMessage, prefs) {
  const live = lastUserTextFromWork(work, userMessage)
  const next = classifyFromEvidence(
    live,
    {
      lastAssistant: lastAssistantTextFromWork(work),
      lastKind: roundCtx._taskKind,
      priorImage: workHasPriorGeneratedImage(work),
    },
    work,
    roundCtx._taskKind,
  )
  roundCtx._taskKind = next
  if (prefs) prefs.activeTaskKind = next
  if (roundCtx._runState) {
    roundCtx._runState.taskKind = next
    roundCtx._runState.acceptanceCriteria = acceptanceFor(next, roundCtx._runState.goal)
  }
  return next
}

function freezeSystemBase(work, ctx) {
  if (!ctx || ctx._systemBase) return
  const sys = (work || []).find((m) => m.role === 'system')
  if (!sys) return
  ctx._systemBase = stripDynamicSystem(String(sys.content || ''))
}

function applyCachedSystem(work, ctx) {
  if (!ctx) return
  freezeSystemBase(work, ctx)
  if (!ctx._systemBase) return
  const parts = [ctx._systemBase]
  if (ctx._steerText) {
    parts.push(`SOUMTOK STEER (one live instruction — do this next):\n${ctx._steerText}`)
  }
  if (ctx._todos?.length) {
    const ledger = ctx._todos.map((t) => `- [${t.status || 'pending'}] ${t.content || t.id}`).join('\n')
    parts.push(
      `TASK LEDGER (complete these; update with todo_write; call attempt_completion when evidence is on disk):\n${ledger}`,
    )
  }
  if (ctx._runState) parts.push(composeRunStateBlock(ctx._runState))
  const sysIdx = (work || []).findIndex((m) => m.role === 'system')
  const next = parts.filter(Boolean).join('\n\n')
  if (sysIdx >= 0) work[sysIdx].content = next
  else work.unshift({ role: 'system', content: next })
}

function dropHarnessUser(work, marker) {
  for (let i = (work || []).length - 1; i >= 0; i--) {
    if (work[i].role === 'user' && String(work[i].content || '').includes(marker)) work.splice(i, 1)
  }
}

function injectHarnessFact(work, block, marker) {
  if (!block) return
  injectSystemBlock(work, block, marker)
}

function injectDevScriptsIntoWork(work, block) {
  injectSystemBlock(work, block, 'DEV SCRIPTS (run with terminal')
}

async function ensureWorkspaceContext({ folder, prefs, work, userMessage, onEvent, ctx, threadTitle }) {
  if (!folder) return ctx
  const text = lastUserTextFromWork(work, userMessage)
  const lastAsst = lastAssistantTextFromWork(work)
  const confirmFollowUp = userIsBareConfirm(text)
  const taskKind = threadWantsWipeWorkspace(work, userMessage, threadTitle)
    ? 'wipe'
    : classifyUserTask(text, {
        lastAssistant: lastAsst,
        lastKind: ctx._taskKind,
        priorImage: workHasPriorGeneratedImage(work),
      })
  ctx._taskKind = taskKind
  if (confirmFollowUp) {
    const named = pathsNamedInText(lastAsst)
    const pinPaths = named.length
      ? named
      : pathsNamedInText((work || []).map((m) => String(m.content || '')).join('\n'))
    const pin = pinPaths.length ? pinPaths.slice(0, 6).join(', ') : 'the files already discussed'
    injectSystemBlock(
      work,
      `[Soumtok harness] SOUMTOK CONTINUE NOW — prefer diff() or write() on: ${pin}. You may read a start_line/end_line range if a section is still missing. No list_dir of the whole tree. Do not ask the user.`,
      'SOUMTOK CONTINUE NOW',
    )
    if (!ctx._taskKind || ctx._taskKind === 'chat') ctx._taskKind = pinPaths.length ? 'fix' : 'execute'
    ctx._atlasInjected = true
    ctx._atlasPaths = pinPaths
    ctx._thinkFirstInjected = true
    ctx._taskContractInjected = true
    ctx._workspaceProbed = true
    ctx._skipThinkStatus = true
    onEvent?.({ type: 'status', text: 'Working — applying…' })
    try {
      const mem = refreshProjectMemory(folder, text)
      replaceSystemChunk(work, 'PROJECT BRIEF', composeProjectBrief(mem, ctx._taskKind))
    } catch {
      /* optional */
    }
    return ctx
  }
  if (!ctx._thinkFirstInjected) {
    ctx._thinkFirstInjected = true
    const understand =
      taskKind === 'image'
        ? 'Understood — generating image…'
        : taskKind === 'chat'
          ? 'Thinking…'
          : 'Understanding your request…'
    onEvent?.({ type: 'status', text: understand })
    if (taskKind === 'build' || taskKind === 'execute' || taskKind === 'fix') {
      await new Promise((r) => setTimeout(r, 600))
    }
    injectSystemBlock(work, composeThinkFirstBrief(text, taskKind), 'SOUMTOK THINK FIRST')
    const loop = composeWorkLoopBrief(taskKind)
    if (loop) injectSystemBlock(work, loop, 'SOUMTOK LOOP')
  }
  if (!ctx._taskContractInjected && taskKind !== 'chat') {
    const contract = composeTaskContract(text, taskKind)
    if (contract) {
      ctx._taskContractInjected = true
      onEvent?.({ type: 'status', text: `Planning · ${taskKindLabel(taskKind)}` })
      injectSystemBlock(work, contract, 'SOUMTOK TASK INTENT')
    }
  }
  if (taskKind === 'image' || userAskedToGenerateImage(text, { priorImage: workHasPriorGeneratedImage(work) })) {
    ctx._taskKind = 'image'
    injectSystemBlock(work, IMAGE_NOW_BRIEF, 'SOUMTOK IMAGE NOW')
    ctx._atlasInjected = true
    ctx._workspaceProbed = true
    ctx._buildDirectorInjected = true
    ctx._wipeBriefInjected = true
    onEvent?.({ type: 'status', text: 'Understood — generating image…' })
    return ctx
  }
  const userTurns = (work || []).filter((m) => m.role === 'user').length
  const t = String(text || '').toLowerCase()
  if (threadWantsWipeWorkspace(work, userMessage, threadTitle) && !ctx._wipeBriefInjected) {
    injectSystemBlock(work, WIPE_WORKSPACE_BRIEF, 'SOUMTOK WORKSPACE WIPE')
    ctx._wipeBriefInjected = true
    ctx._buildDirectorInjected = true
    onEvent?.({ type: 'status', text: 'Clearing project (delete tools enabled)…' })
    return ctx
  }
  const wantsBuild = userWantsGreenfieldBuild(text) || userAskedToBuildSomething(text)
  const wantsRun = userAskedForLocalhost(text) ||
    /\b(localhost|127\.0\.0\.1|:\d{4}|port\s*\d|5170|3001|dev server|run dev|npm run|pnpm|yarn dev|start the app|preview|see how it looks|launch|serve|start my port)\b/.test(
      t,
    )
  if (wantsRun) {
    const devBlock = readPackageDevScriptsBlock(folder)
    if (devBlock) injectDevScriptsIntoWork(work, devBlock)
  }
  const wantsFix = userWantsMessyFolderFixed(text)
  const wantsInspect = userWantsCodeInspection(text) || userWantsAnalysis(text)
  const visual = userWantsVisualPolish(text)
  const greenfieldBuild = wantsBuild && workspaceIsGreenfield(folder) && !visual
  if (greenfieldBuild && !ctx._scaffoldTried) {
    ctx._scaffoldTried = true
    ctx._buildKind = inferIntentForFolder(folder, text).kind
    ctx._workspaceProbed = true
    ctx._atlasInjected = true
    onEvent?.({ type: 'status', text: 'Planning the app from your request…' })
  }
  try {
    const mem = refreshProjectMemory(folder, text)
    replaceSystemChunk(work, 'PROJECT BRIEF', composeProjectBrief(mem, taskKind))
    ctx._projectMemory = mem
    if (mem.queryChanged) {
      dropHarnessUser(work, 'KNOWN FILES (harness already searched')
      ctx._atlasInjected = false
    }
  } catch {
    /* optional */
  }
  const skipAtlas =
    taskKind === 'chat' ||
    taskKind === 'wipe' ||
    taskKind === 'run' ||
    taskKind === 'image' ||
    userAskedToGenerateImage(text, { priorImage: workHasPriorGeneratedImage(work) }) ||
    isGeneralOrSoumtokChat(text)
  if (!ctx._atlasInjected && !skipAtlas && (ctx._projectMemory?.queryChanged || !workAlreadyHasAtlas(work))) {
    onEvent?.({ type: 'status', text: workAlreadyHasAtlas(work) ? 'Working…' : 'Finding the right files…' })
    const atlasQuery = String(text || '').trim().length < 12 ? lastAsst || text : text
    dropHarnessUser(work, 'KNOWN FILES (harness already searched')
    let atlas = { text: '', paths: [] }
    try {
      atlas = buildWorkspaceAtlas(folder, atlasQuery) || atlas
    } catch {
      atlas = { text: '', paths: [] }
    }
    if (atlas?.text) {
      replaceSystemChunk(work, 'KNOWN FILES (harness already searched', atlas.text)
      ctx._atlasInjected = true
      ctx._atlasPaths = [...new Set([...(atlas.paths || []), ...(ctx._scaffoldWrote || [])])]
      if (ctx._atlasPaths.length || ctx._scaffoldWrote?.length) ctx._workspaceProbed = true
      onEvent?.({ type: 'status', text: 'Working…' })
    }
  } else if (workAlreadyHasAtlas(work) || taskKind === 'run' || skipAtlas) {
    ctx._atlasInjected = true
    if (taskKind === 'run') ctx._workspaceProbed = true
  }
  if (visual && !ctx._visualBriefInjected) {
    onEvent?.({ type: 'status', text: 'Thinking about the look…' })
    injectSystemBlock(work, composeVisualEditBrief(text, folder, ctx._atlasPaths), 'SOUMTOK VISUAL EDIT')
    ctx._visualBriefInjected = true
    ctx._workspaceProbed = true
  }
  if (
    !ctx._workspaceProbed &&
    !isGeneralOrSoumtokChat(text) &&
    !visual &&
    taskKind !== 'image' &&
    !greenfieldBuild &&
    !userAskedToGenerateImage(text, { priorImage: workHasPriorGeneratedImage(work) })
  ) {
    const messyPre = workspaceLooksMessy(folder, ctx.workspaceScan || '')
    const probe =
      userWantsProjectOverview(text) ||
      wantsBuild ||
      wantsRun ||
      wantsFix ||
      (messyPre && projectLooksLikeLocalWebApp(folder)) ||
      wantsInspect ||
      (userTurns <= 1 &&
        /\b(what|explain|describe|tell|summarize)\b/.test(t) &&
        /\b(project|repo|codebase|workspace|folder|app|this|code)\b/.test(t))
    if (probe) {
      const scan = await probeWorkspaceOverview(folder, prefs, onEvent, { quiet: true })
      if (scan) {
        ctx.workspaceScan = scan
        ctx._workspaceProbed = true
        injectWorkspaceScanIntoWork(work, ctx)
      }
    }
  }
  const messy = workspaceLooksMessy(folder, ctx.workspaceScan || '')
  if (
    !visual &&
    (wantsBuild || wantsFix || (messy && projectLooksLikeLocalWebApp(folder))) &&
    !ctx._buildDirectorInjected
  ) {
    onEvent?.({ type: 'status', text: messy ? 'Recovery plan for messy folder…' : 'Planning build from your request…' })
    const brief = composeBuildDirectorBrief(text, folder, ctx.workspaceScan || '')
    injectSystemBlock(work, brief, messy ? 'SOUMTOK MESSY WORKSPACE RECOVERY' : 'SOUMTOK BUILD DIRECTOR')
    ctx._buildDirectorInjected = true
    ctx._buildKind = inferIntentForFolder(folder, text).kind
  }
  if (userIsBareConfirm(text) && (assistantAskedPermission(lastAsst) || assistantOfferedApplyEdit(lastAsst))) {
    if (priorAssistantOfferedPreview(work) && !/\b(apply|diff|write|edit|patch)\b/i.test(lastAsst)) {
      injectSystemBlock(work, PREVIEW_RUN_NOW_NUDGE, 'SOUMTOK PREVIEW RUN')
      ctx._buildDirectorInjected = true
      ctx._taskKind = ctx._taskKind === 'run' ? 'run' : 'build'
      onEvent?.({ type: 'status', text: 'Working — starting…' })
    } else {
      injectSystemBlock(work, DO_WORK_NOW_NUDGE, 'SOUMTOK DO WORK NOW')
      if (!ctx._taskKind || ctx._taskKind === 'chat') ctx._taskKind = 'execute'
      onEvent?.({ type: 'status', text: 'Working — doing the task…' })
    }
  } else if (userConfirmedRunPreview(text) && priorAssistantOfferedPreview(work)) {
    injectSystemBlock(work, PREVIEW_RUN_NOW_NUDGE, 'SOUMTOK PREVIEW RUN')
    ctx._buildDirectorInjected = true
    ctx._taskKind = 'build'
    onEvent?.({ type: 'status', text: 'Building and starting…' })
  } else if (userIsBareConfirm(text) && ctx._taskKind && ctx._taskKind !== 'chat') {
    injectSystemBlock(work, DO_WORK_NOW_NUDGE, 'SOUMTOK DO WORK NOW')
    onEvent?.({ type: 'status', text: 'Working — continuing…' })
  }
  if (wantsInspect && !ctx._sourceProbed && !visual) {
    await probeSourceEntryPoints(folder, prefs, onEvent, work, ctx)
  }
  return ctx
}

const AGENT_CONCLUSION_NUDGE =
  "[Soumtok harness] RESULTS are in the tool output. Write the CONCLUSION now for the user: (1) what you did, (2) file paths, (3) localhost URL if a server is up, (4) what is left. Markdown ok. Do not list_dir. Do not say you'll do it later."

function workHasToolResults(work) {
  return Boolean(toolResultsDigest(work))
}

function isUserFacingConclusion(text, work) {
  const t = String(text || '')
    .replace(/\[Soumtok harness\][^\n]*/gi, '')
    .trim()
  if (!t || textLooksLikeDsml(t)) return false
  if (
    /^(i['']ll|let me|i am going to|reading|looking|hang on|one moment|give me)\b/i.test(t) &&
    t.length < 280 &&
    !/\b(updated|fixed|changed|wrote|done)\b/i.test(t)
  ) {
    return false
  }
  if (assistantAskedPermission(t) || assistantOfferedApplyEdit(t)) return false
  if (/\bharness blocked|want me to proceed|if you say go\b/i.test(t)) return false
  if (workHasFileWritesThisTurn(work) && t.length >= 24) return true
  if (t.length >= 48 && /\b(updated|fixed|changed|wrote|patched|src\/|\.ts\b|\.js\b)\b/i.test(t)) return true
  return isSubstantiveAgentReply(t, work)
}

function composeLocalConclusion(work, opts = {}) {
  const scope = workAfterLastHuman(work)
  const paths = []
  const seen = new Set()
  let attemptedFail = false
  for (const m of scope) {
    if (m.role !== 'tool') continue
    if (!/^(write|diff|edit|str_replace|apply_patch)$/i.test(String(m.name || ''))) continue
    const c = String(m.content || '')
    if (m.ok === false || /^(Could not apply edit|Could not find that text|old_string not found)/i.test(c.trim())) {
      attemptedFail = true
      continue
    }
    if (!/\b(updated |wrote |edited )\b/i.test(c)) continue
    const fromContent = c.match(/\b([\w./\\-]+\.(?:ts|tsx|js|jsx|css|html|py|json|md))\b/gi) || []
    for (const p of fromContent) {
      const rel = p.replace(/\\/g, '/')
      if (seen.has(rel)) continue
      seen.add(rel)
      paths.push(rel)
    }
  }
  if (paths.length) {
    return `Updated ${paths.slice(0, 6).join(', ')}. Reload the running page to see the change.`
  }
  let url = ''
  for (const m of scope) {
    if (m.role !== 'tool') continue
    const n = String(m.name || '').toLowerCase()
    if (!/^(terminal|read_terminal|browser|web_fetch|fetch)$/.test(n)) continue
    const found = String(m.content || '').match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/)
    if (found) {
      url = found[0]
      break
    }
  }
  if (url) return `App is running at ${url}.`
  if (opts.run || workHasDevServerTerminal(work)) {
    if (workHasDevServerTerminal(work)) {
      return 'Started the dev server. Check the Integrated Terminal for the localhost URL.'
    }
    return 'Could not confirm a running localhost URL yet. Say continue and I will start the dev server.'
  }
  if (attemptedFail) return 'Edits were attempted but did not apply (unverified). Check the last tool error.'
  return 'No verified file updates this turn.'
}

function isSubstantiveAgentReply(text, work) {
  const t = String(text || '')
    .replace(/\[Soumtok harness\][^\n]*/gi, '')
    .trim()
  if (!t) return false
  if (textLooksLikeDsml(t)) return false
  if (t.length >= 280) return true
  if (/(^|\n)#{1,3}\s+\S/.test(t)) return true
  if (/(^|\n)\d+\.\s+\S/m.test(t) && t.length >= 120) {
    if (assistantPromisedFollowThrough(t)) return false
    return true
  }
  if (/\b(finding|risk|recommend|issue|bug|summary|conclusion|next step|should fix|critical|warning)\b/i.test(t) && t.length >= 100) {
    return true
  }
  if (
    workHasToolResults(work) &&
    /^(i['']ll|let me|i am|i'm|reading|looking|going to|one moment|give me|hang on|still)/i.test(t) &&
    t.length < 420
  ) {
    return false
  }
  if (workHasToolResults(work) && t.length < 160) return false
  return t.length >= 160
}

function userWantsAnalysis(text) {
  if (userWantsVisualPolish(text)) return false
  const t = String(text || '').toLowerCase()
  return (
    /deeper|dig (in|into)|go deeper|read (more|deeper)|audit|code review|investigate|what'?s wrong with (this|the) (project|repo)|scan the (repo|code)|analyze this (project|repo)|overview|architecture|security/.test(
      t,
    ) || userWantsProjectOverview(text)
  )
}

function toolResultsDigest(work, maxChars = 12_000) {
  const blocks = []
  for (const item of work || []) {
    if (item.role !== 'tool') continue
    const name = item.name || 'tool'
    const body = String(item.content || '').trim()
    if (!body) continue
    blocks.push(`[${name}]\n${body.slice(0, 12_000)}`)
  }
  if (!blocks.length) return ''
  let text = `[Soumtok harness] LOCAL TOOL OUTPUT (already ran on the user's machine — use this; do not say the scan was empty or that you have not seen their code):\n\n${blocks.join('\n\n---\n\n')}`
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}\n…(truncated)`
  return text
}

function assistantDeniesLocalTools(text, work, ctx) {
  const hasContext =
    (work || []).some((m) => m.role === 'tool' && String(m.content || '').trim()) ||
    Boolean(ctx?.workspaceScan) ||
    workHasSourceReads(work)
  if (!hasContext) return false
  return (
    assistantRefusesSourceRead(text) ||
    /haven'?t actually seen|no tool output|scan (?:didn't|did not|came back empty)|can't honestly|would be guessing|don't have any tool|workspace scan came back empty/i.test(
      String(text || ''),
    )
  )
}

function messagesForStudioComplete(work, ctx) {
  const out = []
  for (const item of work || []) {
    if (item.role === 'tool') continue
    if (item.role === 'assistant') {
      const text = typeof item.content === 'string' ? item.content.trim() : ''
      if (text) out.push({ role: 'assistant', content: text })
      continue
    }
    if (item.role === 'user' || item.role === 'system') {
      const text = typeof item.content === 'string' ? item.content : ''
      if (text.trim() && !text.startsWith('[Soumtok harness] LOCAL TOOL OUTPUT')) {
        out.push({ role: item.role, content: text })
      }
    }
  }
  const digest = toolResultsDigest(work)
  if (digest) {
    const lastUserIdx = [...out].reverse().findIndex((m) => m.role === 'user')
    if (lastUserIdx >= 0) {
      const idx = out.length - 1 - lastUserIdx
      out.splice(idx, 0, { role: 'user', content: digest })
    } else {
      out.push({ role: 'user', content: digest })
    }
  }
  const sys = buildDesktopFallbackSystem({
    ...ctx,
    workspaceScan: ctx?.workspaceScan || (digest ? digest.slice(0, 48_000) : ''),
  })
  const sysIdx = out.findIndex((m) => m.role === 'system')
  if (sysIdx >= 0) out[sysIdx].content = `${sys}\n\n${out[sysIdx].content}`
  else out.unshift({ role: 'system', content: sys })
  return out
}

async function postDesktopAgentRound(api, body) {
  let last = { status: 404, data: { error: 'Not found' } }
  for (const path of DESKTOP_ROUND_PATHS) {
    last = await api('POST', path, body)
    if (!shouldUseStudioCompleteFallback(last)) return last
  }
  return last
}

function formatPlatformContext(data) {
  if (!data || typeof data !== 'object') return ''
  const lines = ['SOUMTOK PLATFORM CONTEXT (account-wide — any project):']
  const skills = data.skills || []
  if (skills.length) {
    lines.push('Skills:')
    for (const row of skills.slice(0, 12)) {
      lines.push(`- ${row.name || row.file_name}: ${String(row.excerpt || '').slice(0, 200)}`)
    }
  }
  const plugins = data.plugins || []
  for (const plug of plugins.slice(0, 6)) {
    const skillLabels = (plug.skills || []).map((s) => s.label || s.id).filter(Boolean)
    if (skillLabels.length) lines.push(`Plugin ${plug.name}: skills ${skillLabels.join(', ')}`)
  }
  const connectors = data.connectors || []
  const live = connectors.filter((c) => c.connected)
  if (live.length) {
    lines.push('MCP connectors (use mcp(server, tool)):')
    for (const c of live.slice(0, 10)) {
      const tools = (c.tools || []).map((t) => t.name).filter(Boolean)
      lines.push(`- ${c.name} (${c.id})${c.mcpUrl ? ` ${c.mcpUrl}` : ''}${tools.length ? `: ${tools.slice(0, 8).join(', ')}` : ''}`)
    }
  } else {
    lines.push('MCP: none connected. User connects from Settings → Connectors (marketplace), which opens the system browser and saves the MCP URL.')
  }
  lines.push('Images: generate_image(prompt, aspect?) saves stills to assets/generated/. Default aspect 1:1. If they asked 16:9 / 9:16 / 4:3, pass aspect and keep that ratio out of the prompt. examine_media(path) describes images/videos. No video or music generation.')
  if (lines.length === 1) return ''
  lines.push('Use codebase_search for meaning, git() for SCM, browser() after localhost, read_skill() for SKILL.md, task() for exploration.')
  return lines.join('\n')
}

async function runSubagentTask(toolCtx, args) {
  const {
    api,
    folder,
    prefs,
    parentMode,
    model,
    subagentModel,
    onEvent,
    signal,
    openFiles,
    branch,
    driver,
  } = toolCtx
  const prompt = String(args.prompt || args.task || '').trim()
  const description = String(args.description || args.title || 'Subagent').trim()
  let type = String(args.subagent_type || args.type || 'explore').toLowerCase()
  if (parentMode === 'ask' || parentMode === 'plan' || parentMode === 'debug') type = 'explore'
  if (!prompt) return { ok: false, text: 'task needs prompt' }
  const subMode = type === 'explore' || type === 'explore-thorough' ? 'ask' : 'agent'
  const intel = String(prefs?.intelligence || 'max')
  const maxRounds =
    intel === 'fast'
      ? type === 'explore' ? 6 : 8
      : intel === 'balanced'
        ? type === 'explore' ? 10 : 14
        : type === 'explore' ? 14 : 20
  const usedModel =
    subagentModel && subagentModel !== 'auto' ? subagentModel : model === 'auto' ? 'auto' : model
  onEvent?.({ type: 'status', text: `Subagent · ${description}…` })
  const work = [
    {
      role: 'user',
      content: `[Soumtok subagent — ${type}]\n${prompt}\n\nReturn a concise report for the parent agent. Use tools; do not address the end user.`,
    },
  ]
  let lastText = ''
  for (let round = 0; round < maxRounds; round++) {
    if (signal?.aborted) return { ok: false, text: 'Cancelled' }
    const res = await postDesktopAgentRound(api, {
      model: usedModel,
      mode: subMode,
      driver: driver === 'bot' ? 'bot' : 'ide',
      messages: compactConversation(messagesForProvider(work)),
      workspaceRoot: folder,
      openFiles,
      branch,
      agentPrefs: prefs,
    })
    if (res.status !== 200 || !res.data) {
      return { ok: false, text: errorFromResponse(res, 'Subagent round failed') }
    }
    const { text, toolCalls, model: picked } = res.data
    lastText = text || lastText
    let calls = toolCalls || []
    const sanitized = sanitizeAssistantText(text || '')
    if (!calls.length && sanitized.calls.length) calls = sanitized.calls
    if (!calls.length) {
      return { ok: true, text: (lastText || '(no subagent output)').slice(0, 16_000) }
    }
    const ran = await executeToolCalls({
      calls,
      folder,
      prefs,
      work,
      onEvent,
      signal,
      assistantContent: stripDsmlFromText(text || '') || '',
      toolCtx,
    })
    if (ran?.error) return { ok: false, text: ran.error }
  }
  return { ok: true, text: (lastText || 'Subagent hit step limit — partial results above.').slice(0, 16_000) }
}

const PARALLEL_TOOLS = new Set(['read', 'grep', 'glob', 'list_dir', 'fetch', 'codebase_search', 'read_skill', 'task'])
const WRITE_TOOLS = /^(write|diff|edit|str_replace|apply_patch|delete|wipe_workspace|clear_workspace|generate_image)$/

async function runOneToolCall(call, folder, prefs, work, onEvent, signal, toolCtx) {
  if (signal?.aborted) return { error: 'Cancelled' }
  if (!call.id) call.id = `call_${crypto.randomUUID()}`
  const args = parseToolArgs(call.arguments)
  const n = String(call.name || '').toLowerCase()
  onEvent?.({ type: 'tool', name: call.name, args })

  const runState = toolCtx?.roundCtx?._runState
  if (isToolDisabled(runState, n, args)) {
    const text = `Disabled: ${n} with these arguments failed 3 times this turn. Change path, old_string, or command — do not repeat.`
    onEvent?.({ type: 'result', name: call.name, ok: false, text, path: args.path || '' })
    work.push({ role: 'tool', tool_call_id: call.id, name: call.name, content: text, ok: false })
    if (runState) markProgress(runState, 'stuck')
    return { ok: false, name: call.name, skippedRepeat: true }
  }

  if (n === 'read' && toolCtx?.roundCtx) {
    const p = String(args.path || args.file || '')
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
    const ranged = args.start_line != null || args.end_line != null || args.offset != null
    if (p) {
      toolCtx.roundCtx._readPaths = toolCtx.roundCtx._readPaths || {}
      const nReads = (toolCtx.roundCtx._readPaths[p] || 0) + 1
      toolCtx.roundCtx._readPaths[p] = nReads
      if (!ranged && nReads >= 3) {
        const text = `Already read ${p} ${nReads} times this turn. Use the text you have, or read({ path: "${p}", start_line, end_line }) for a missing range. Call diff/write or conclude.`
        onEvent?.({ type: 'result', name: call.name, ok: true, text, path: p })
        work.push({ role: 'tool', tool_call_id: call.id, name: call.name, content: text, ok: true })
        return { ok: true, name: call.name, skippedRepeat: true }
      }
    }
  }

  if (toolCtx?.roundCtx && /^(read|read_terminal|terminal_log|terminal_logs|grep|list_dir)$/.test(n)) {
    const sig = `${n}:${JSON.stringify(args).slice(0, 180)}`
    const count = (toolCtx.roundCtx._repeatSig && toolCtx.roundCtx._repeatSig[sig]) || 0
    if (count >= 2) {
      const text =
        n === 'read_terminal' || n === 'terminal_log' || n === 'terminal_logs'
          ? 'Terminal output did not change. Do not call read_terminal again. Use grep/read on source if you need current file text, then edit or conclude.'
          : `Already called ${n} with the same arguments ${count} times. Do not repeat it. Read a different range or apply the edit with diff/write.`
      onEvent?.({ type: 'result', name: call.name, ok: true, text, path: args.path || '' })
      work.push({ role: 'tool', tool_call_id: call.id, name: call.name, content: text, ok: true })
      return { ok: true, name: call.name, skippedRepeat: true }
    }
  }

  const uiMode = String(toolCtx?.parentMode || 'agent').toLowerCase()
  if ((uiMode === 'plan' || uiMode === 'ask') && WRITE_TOOLS.test(n)) {
    const text = `${n} is blocked in ${uiMode} mode. Use switch_mode(agent) after the user confirms, or ask_question to clarify first.`
    onEvent?.({ type: 'result', name: call.name, ok: false, text })
    work.push({ role: 'tool', tool_call_id: call.id, name: call.name, content: text, ok: false })
    return { ok: false, name: call.name, blocked: true }
  }

  if (n === 'ask_question' || n === 'askquestion') {
    let questions = []
    try {
      questions = typeof args.questions === 'string' ? JSON.parse(args.questions || '[]') : args.questions || []
    } catch {
      questions = []
    }
    if (!Array.isArray(questions) || !questions.length) {
      const text = 'ask_question needs questions: JSON array of {id, prompt, options:[{id,label}]}'
      onEvent?.({ type: 'result', name: call.name, ok: false, text })
      work.push({ role: 'tool', tool_call_id: call.id, name: call.name, content: text, ok: false })
      return { ok: false, name: call.name }
    }
    const askId = `ask_${crypto.randomUUID()}`
    onEvent?.({
      type: 'ask',
      id: askId,
      title: String(args.title || 'Quick question'),
      intro: String(args.intro || ''),
      questions,
    })
    let answers = {}
    try {
      answers = await waitForAskReply(askId, signal)
    } catch (err) {
      const text = err?.message === 'Cancelled' ? 'User cancelled the question.' : 'Question timed out or failed.'
      onEvent?.({ type: 'result', name: call.name, ok: false, text })
      work.push({ role: 'tool', tool_call_id: call.id, name: call.name, content: text, ok: false })
      return { ok: false, name: call.name, error: text }
    }
    const text = formatAskReply(questions, answers)
    onEvent?.({ type: 'result', name: call.name, ok: true, text })
    work.push({ role: 'tool', tool_call_id: call.id, name: call.name, content: text, ok: true })
    return { ok: true, name: call.name }
  }

  if (n === 'switch_mode') {
    const target = String(args.target_mode_id || args.mode || 'agent').toLowerCase()
    const mode = ['plan', 'ask', 'debug', 'agent'].includes(target) ? target : 'agent'
    onEvent?.({ type: 'mode_switch', target: mode, explanation: args.explanation || '' })
    const out = {
      ok: true,
      text: `Mode switch requested: ${mode}. UI updated; continue with ${mode === 'plan' || mode === 'ask' ? 'read-only' : mode === 'debug' ? 'debug/evidence' : 'full'} tools.`,
    }
    work.push({
      role: 'tool',
      tool_call_id: call.id,
      name: call.name,
      content: out.text,
    })
    return { ok: true, name: call.name }
  }

  if (n === 'todo_write') {
    let todos = []
    try {
      todos = typeof args.todos === 'string' ? JSON.parse(args.todos || '[]') : args.todos || []
    } catch {
      todos = []
    }
    if (!Array.isArray(todos)) todos = []
    const merge = args.merge !== 'false' && args.merge !== false
    if (toolCtx?.roundCtx) {
      const prev = Array.isArray(toolCtx.roundCtx._todos) ? toolCtx.roundCtx._todos : []
      if (merge && prev.length) {
        const byId = new Map(prev.map((t) => [String(t.id || t.content), t]))
        for (const t of todos) {
          const id = String(t.id || t.content)
          byId.set(id, { ...byId.get(id), ...t })
        }
        toolCtx.roundCtx._todos = [...byId.values()]
      } else {
        toolCtx.roundCtx._todos = todos
      }
      todos = toolCtx.roundCtx._todos
      if (folder) {
        try {
          saveTodos(folder, todos)
        } catch {
          /* persist optional */
        }
      }
    }
    onEvent?.({ type: 'todo', todos, merge })
    const summary = todos.map((t) => `- [${t.status || 'pending'}] ${t.content || t.id}`).join('\n')
    const text = summary || 'Todos updated'
    work.push({ role: 'tool', tool_call_id: call.id, name: call.name, content: text, ok: true })
    return { ok: true, name: call.name }
  }

  if (n === 'attempt_completion' || n === 'finish') {
    const summary = String(args.result || args.summary || args.text || args.evidence || '').trim()
    const kind = toolCtx?.roundCtx?._taskKind || 'execute'
    const met = taskCompletionMet(kind, work, toolCtx?.roundCtx?._runState)
    if (!met) {
      const text = `Not complete — acceptance not met.${summary ? ` (${summary.slice(0, 240)})` : ''} Keep using tools until files actually change and verification is not failed.`
      work.push({ role: 'tool', tool_call_id: call.id, name: 'attempt_completion', content: text, ok: false })
      return { ok: false, name: 'attempt_completion' }
    }
    const text = summary || 'Task marked complete.'
    if (toolCtx?.roundCtx) {
      toolCtx.roundCtx._attemptedCompletion = true
      markProgress(toolCtx.roundCtx._runState, 'success')
    }
    work.push({ role: 'tool', tool_call_id: call.id, name: 'attempt_completion', content: text, ok: true })
    return { ok: true, name: 'attempt_completion', completed: true }
  }

  const out = await runDesktopTool(folder, call.name, args, prefs, toolCtx)
  onEvent?.({
    type: 'result',
    name: call.name,
    ok: out.ok,
    text: (out.text || '').slice(0, 48_000),
    path: out.rel || args.path || args.file || args.command || args.url || '',
    linesAdded: out.linesAdded,
    linesRemoved: out.linesRemoved,
    diffPreview: out.diffPreview,
    image: out.image?.dataUrl || '',
    aspect: out.aspect || args.aspect || args.aspect_ratio || args.ratio || '',
  })
  if (out.rel) onEvent?.({ type: 'file', path: out.rel })
  work.push({
    role: 'tool',
    tool_call_id: call.id,
    name: call.name,
    content: (out.text || '').slice(0, 48_000),
    ok: out.ok !== false,
  })
  if (toolCtx?.roundCtx) {
    const sig = `${n}:${JSON.stringify(args).slice(0, 180)}`
    toolCtx.roundCtx._failSig = toolCtx.roundCtx._failSig || {}
    if (out.ok === false) toolCtx.roundCtx._failSig[sig] = (toolCtx.roundCtx._failSig[sig] || 0) + 1
    else delete toolCtx.roundCtx._failSig[sig]
    if (out.ok !== false && /^(read|read_terminal|terminal_log|terminal_logs|grep|list_dir)$/.test(n)) {
      toolCtx.roundCtx._repeatSig = toolCtx.roundCtx._repeatSig || {}
      toolCtx.roundCtx._repeatSig[sig] = (toolCtx.roundCtx._repeatSig[sig] || 0) + 1
    }
    recordToolAttempt(toolCtx.roundCtx._runState, {
      name: n,
      args,
      ok: out.ok !== false,
      content: out.text,
    })
    if (/^(write|diff|edit|str_replace|apply_patch)$/.test(n) && (out.rel || args.path || args.file)) {
      const rel = String(out.rel || args.path || args.file).replace(/\\/g, '/')
      let after = ''
      try {
        after = fs.readFileSync(path.join(folder, rel), 'utf8')
      } catch {
        after = ''
      }
      const beforeGuess = toolCtx.roundCtx._fileBefore?.[rel] ?? ''
      const changed = recordFileChange(toolCtx.roundCtx._runState, rel, beforeGuess, after)
      if (changed) toolCtx.roundCtx._batchChanged = true
      if (changed && (beforeGuess === '' || beforeGuess == null) && after) {
        toolCtx.roundCtx._newFilesThisBatch = true
      }
      if (out.ok === false && Object.prototype.hasOwnProperty.call(toolCtx.roundCtx._fileBefore || {}, rel)) {
        try {
          const full = path.join(folder, rel)
          const prev = toolCtx.roundCtx._fileBefore[rel]
          if (!prev) {
            if (fs.existsSync(full)) fs.unlinkSync(full)
          } else fs.writeFileSync(full, prev, 'utf8')
        } catch {
          /* sandbox restore optional */
        }
      }
    }
  }
  return { ok: out.ok !== false, name: call.name }
}

async function executeToolCalls({ calls, folder, prefs, work, onEvent, signal, assistantContent = '', toolCtx = {} }) {
  const list = (calls || []).map((call) => {
    if (!call.id) call.id = `call_${crypto.randomUUID()}`
    return call
  })
  if (!list.length) return { ok: true, failed: [] }
  const roundCtx = toolCtx?.roundCtx || {}
  if (folder) {
    const editPaths = []
    roundCtx._fileBefore = roundCtx._fileBefore || {}
    roundCtx._newFilesThisBatch = false
    roundCtx._batchChanged = false
    for (const call of list) {
      const cn = String(call.name || '').toLowerCase()
      if (!/^(write|diff|edit|delete|wipe_workspace|clear_workspace|str_replace|apply_patch)$/i.test(cn)) continue
      const a = parseToolArgs(call.arguments)
      const p = String(a.path || a.file || '').replace(/\\/g, '/')
      if (p) {
        editPaths.push(p)
        if (roundCtx._fileBefore[p] == null) {
          try {
            roundCtx._fileBefore[p] = fs.readFileSync(path.join(folder, p), 'utf8')
          } catch {
            roundCtx._fileBefore[p] = ''
          }
        }
      }
    }
    if (editPaths.length) {
      try {
        const cp = createCheckpoint(folder, editPaths)
        onEvent?.({ type: 'checkpoint', id: cp.id, paths: cp.paths })
        if (roundCtx._runState) roundCtx._runState.lastCheckpointId = cp.id
      } catch {
        /* checkpoint optional */
      }
      if (roundCtx._verifyBaseline == null && fs.existsSync(path.join(folder, 'tsconfig.json'))) {
        try {
          const base = await runDesktopTool(folder, 'terminal', { command: 'npx tsc --noEmit' }, prefs)
          roundCtx._verifyBaseline = base.text || ''
        } catch {
          roundCtx._verifyBaseline = ''
        }
      }
    }
  }
  work.push({
    role: 'assistant',
    content: assistantContent || null,
    tool_calls: openaiToolCalls(list),
  })
  const afterAssistant = work.length
  const parallel = []
  const sequential = []
  for (const call of list) {
    if (PARALLEL_TOOLS.has(String(call.name || '').toLowerCase())) parallel.push(call)
    else sequential.push(call)
  }
  const failed = []
  if (parallel.length) {
    const results = await Promise.all(
      parallel.map((call) => runOneToolCall(call, folder, prefs, work, onEvent, signal, toolCtx)),
    )
    for (const r of results) {
      if (r?.error) return { error: r.error }
      if (r && r.ok === false) failed.push(r.name)
    }
  }
  for (const call of sequential) {
    const r = await runOneToolCall(call, folder, prefs, work, onEvent, signal, toolCtx)
    if (r?.error) return { error: r.error }
    if (r && r.ok === false) failed.push(r.name)
  }
  const extra = work.splice(afterAssistant)
  const toolRows = extra.filter((m) => m.role === 'tool')
  const other = extra.filter((m) => m.role !== 'tool')
  const order = new Map(list.map((c, i) => [c.id, i]))
  toolRows.sort((a, b) => (order.get(a.tool_call_id) ?? 999) - (order.get(b.tool_call_id) ?? 999))
  work.push(...toolRows, ...other)
  await maybeVerifyAfterEdits(folder, prefs, list, onEvent, work, roundCtx)
  return { ok: true, failed }
}

function emitAssistantMessage(onEvent, rawText, usedModel, requestedModel, runMeta, work, forceEmit = false) {
  const { cleaned, calls } = sanitizeAssistantText(rawText)
  if (calls.length && !cleaned) return ''
  if (cleaned && !textLooksLikeDsml(cleaned)) {
    if (!forceEmit && work && workHasToolResults(work) && !isUserFacingConclusion(cleaned, work)) {
      return cleaned
    }
    if (runMeta) runMeta.repliedViaEvent = true
    onEvent?.({
      type: 'assistant',
      text: cleaned,
      model: usedModel,
      requestedModel: requestedModel || usedModel,
    })
    return cleaned
  }
  return cleaned
}

function modelStalledInsteadOfWorking(text, work, userMessage) {
  if (workHasFileWritesThisTurn(work)) return false
  const live = lastUserTextFromWork(work, userMessage)
  if (!userWantedAgentWork(work, userMessage) && !userIsBareConfirm(live)) return false
  return (
    assistantPromisedFollowThrough(text) ||
    assistantAskedPermission(text) ||
    assistantOfferedApplyEdit(text) ||
    assistantPuntedToUser(text) ||
    assistantShowsCodeWithoutWriting(text)
  )
}

async function runStudioCompleteFallback({
  api,
  model,
  work,
  ctx,
  onEvent,
  folder,
  agentPrefs,
  signal,
  runMeta = { repliedViaEvent: false },
  depth = 0,
}) {
  const prefs = applyIntelligenceToPrefs(
    applyRunModeToPrefs(agentPrefs && typeof agentPrefs === 'object' ? agentPrefs : {}),
  )
  if (depth === 0 && folder && !ctx._thinkFirstInjected && !ctx._atlasInjected) {
    await ensureWorkspaceContext({ folder, prefs, work, userMessage: lastUserTextFromWork(work), onEvent, ctx })
  }
  if (model === 'auto' && depth === 0) {
    onEvent?.({ type: 'status', text: 'Auto — picking the best model for this request…' })
  } else if (depth === 0 && model && model !== 'auto') {
    onEvent?.({ type: 'status', text: `Using ${model}…` })
  }
  onEvent?.({ type: 'status', text: depth ? 'Summarizing…' : 'Soumtok is thinking…' })
  const messages = messagesForStudioComplete(work, ctx)
  const res = await api('POST', '/api/studio/complete', {
    model,
    messages,
    mode: ctx.mode || 'agent',
    workspaceRoot: folder || undefined,
    temperature: 0.4,
    maxTokens: 4096,
  })
  if (res.status === 401) return { error: 'Sign in with your Soumtok account.' }
  if (res.status === 403) return { error: 'Finish account setup on soumtok.com.' }
  if (shouldRetryTrialWithDeepSeek(model, res)) {
    onEvent?.({ type: 'status', text: 'Using DeepSeek V4 Flash on your trial…' })
    return runStudioCompleteFallback({
      api,
      model: 'deepseek-v4-flash',
      work,
      ctx,
      onEvent,
      folder,
      agentPrefs,
      signal,
      runMeta,
      depth,
    })
  }
  if (isTrialModelCapError(res)) {
    const hint =
      ctx?.apiHost && !/127\.0\.0\.1|localhost/i.test(ctx.apiHost)
        ? ' Ask an admin to redeploy soumtok.com with the latest server and SOUMTOK_OPEN_ACCESS=1, or point Desktop at a local API (SOUMTOK_API=http://127.0.0.1:3000 in repo .env + npm start).'
        : ''
    return {
      error: errorFromResponse(res, 'That model is not on your trial plan. Pick another model or upgrade.') + hint,
    }
  }
  if (res.status !== 200 || !res.data?.text) {
    return { error: errorFromResponse(res, 'Could not reach Soumtok chat. Try again in a moment.') }
  }
  const raw = res.data.text
  if (model === 'auto' && res.data.model) {
    onEvent?.({ type: 'status', text: `Auto selected ${res.data.model}` })
    ctx.modelLabel = `Auto → ${res.data.model}`
  }
  const { cleaned, calls } = sanitizeAssistantText(raw)
  const requestedModel = ctx.requestedModel || model

  if (calls.length && folder && depth < 5) {
    onEvent?.({ type: 'status', text: 'Exploring your project…' })
    const ran = await executeToolCalls({
      calls,
      folder,
      prefs,
      work,
      onEvent,
      signal,
      assistantContent: stripDsmlFromText(raw),
      toolCtx: {
        onIntegratedTerminalRun: ctx.onIntegratedTerminalRun,
        onTerminalMirror: ctx.onTerminalMirror,
        runSubagent: ctx.runSubagent,
        callMcp: ctx.callMcp,
      },
    })
    if (ran.error) return ran
    work.push({
      role: 'user',
      content:
        'Use the tool output above. Answer the user in clear plain language about their project. Do not emit DSML or tool markup.',
    })
    return runStudioCompleteFallback({
      api,
      model,
      work,
      ctx,
      onEvent,
      folder,
      agentPrefs,
      signal,
      runMeta,
      depth: depth + 1,
    })
  }

  const finalText = cleaned || stripDsmlFromText(raw)
  if (finalText && !calls.length && !textLooksLikeDsml(finalText)) {
    emitAssistantMessage(onEvent, finalText, res.data.model, requestedModel, runMeta, work)
  }
  return {
    done: true,
    text: textLooksLikeDsml(finalText) ? '' : finalText,
    usedModel: res.data.model,
    requestedModel,
    messages: persistWork(work),
    promptTokens: res.data.promptTokens || 0,
    completionTokens: res.data.completionTokens || 0,
    repliedViaEvent: runMeta.repliedViaEvent,
  }
}

function collectImageFiles(files) {
  return Array.isArray(files) ? files.filter(Boolean) : []
}

function fileIsImage(file) {
  return Boolean(
    file &&
      String(file.mime || '').startsWith('image/') &&
      /^data:image\//i.test(String(file.dataUrl || '')),
  )
}

async function runAgentHarness({
  api,
  getBuffer,
  apiHost,
  folder,
  model,
  mode,
  driver,
  messages,
  userMessage,
  openFiles,
  branch,
  files,
  agentPrefs,
  subagentModel,
  signal,
  onEvent,
  onIntegratedTerminalRun,
  onTerminalMirror,
  threadTitle,
}) {
  let prefs = applyIntelligenceToPrefs(
    applyRunModeToPrefs(agentPrefs && typeof agentPrefs === 'object' ? agentPrefs : {}),
  )
  if (!folder && userMessage && (userWantsCodeInspection(userMessage) || userWantsAnalysis(userMessage))) {
    return {
      error: 'Open a project folder (File → Open Folder) so Soumtok can read source files on your PC.',
      text: '',
    }
  }
  if (folder && prefs.localToolsEnabled === false) {
    return {
      error: 'Local tools are disabled — enable Settings → Agents → Local tools to read and edit files on this machine.',
      text: '',
    }
  }
  const tabsForRound = prefs.includeOpenFiles === false ? [] : openFiles || []
  const work = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && m.role !== 'system')
    .map((m) => ({ ...m }))
  prefs = prefsForAgentTools(prefs, userMessage, work, threadTitle)
  const attach = collectImageFiles(files)
  const thisTurnHasImage = attach.some(fileIsImage)
  if (userMessage) {
    work.push({ role: 'user', content: userMessage, files: thisTurnHasImage ? attach : attach.length ? attach : undefined })
  }

  const runMeta = { repliedViaEvent: false }
  if (folder) {
    const autoWipeEarly = await tryAutoWipeWorkspace({
      folder,
      userMessage,
      work,
      prefs,
      onEvent,
      mode,
      runMeta,
      threadTitle,
    })
    if (autoWipeEarly) return autoWipeEarly
  }
  const roundCtx = {
    folder,
    branch,
    openFiles: tabsForRound,
    mode,
    driver,
    modelLabel: model === 'auto' ? 'Auto' : model,
    requestedModel: model,
    apiHost: apiHost || '',
    onIntegratedTerminalRun,
    onTerminalMirror,
    _runState: createAgentState({
      goal: userMessage || lastUserTextFromWork(work),
      taskKind: prefs.activeTaskKind || 'execute',
    }),
    _todos: [],
  }
  if (folder) {
    try {
      roundCtx._todos = loadTodos(folder)
    } catch {
      roundCtx._todos = []
    }
  }

  async function generateImage(args) {
    return generateImageViaApi(api, args, getBuffer)
  }

  const imageHint = imageIntentHintFromWork(work)
  const imageAsk =
    userAskedToGenerateImage(userMessage, imageHint) ||
    userAskedToGenerateImage(lastUserTextFromWork(work, userMessage), imageHint)
  if (imageAsk) {
    roundCtx._taskKind = 'image'
    const autoImage = await tryAutoGenerateImage({
      folder,
      userMessage,
      work,
      prefs,
      onEvent,
      mode,
      runMeta,
      toolCtx: { generateImage },
    })
    if (autoImage) return autoImage
  }

  if (folder) {
    await ensureWorkspaceContext({
      folder,
      prefs,
      work,
      userMessage,
      onEvent,
      ctx: roundCtx,
      threadTitle,
    })
    if (roundCtx._taskKind !== 'image') {
      const rules = loadProjectRules(folder)
      if (rules) {
        const sysIdx = work.findIndex((m) => m.role === 'system')
        if (sysIdx >= 0) work[sysIdx].content = `${work[sysIdx].content}\n\n${rules}`
        else work.unshift({ role: 'system', content: rules })
      }
      if (prefs.skillsEnabled !== false) {
        const skillCat = skillsCatalogBlock(folder, { thirdPartyImports: prefs.thirdPartyImports !== false })
        if (skillCat) injectSystemBlock(work, skillCat, 'SKILLS (read_skill')
      }
    }
  }

  let platformConnectors = []
  try {
    const ctxRes = await api('GET', '/api/studio/tools/context', null, 20_000)
    if (ctxRes.status === 200 && ctxRes.data) {
      platformConnectors = ctxRes.data.connectors || []
      if (roundCtx._taskKind !== 'image') {
        const block = formatPlatformContext(ctxRes.data)
        if (block) {
          const sysIdx = work.findIndex((m) => m.role === 'system')
          if (sysIdx >= 0) work[sysIdx].content = `${work[sysIdx].content}\n\n${block}`
          else work.unshift({ role: 'system', content: block })
        }
      }
    }
  } catch {
    /* platform context optional */
  }

  if (roundCtx._runState) {
    roundCtx._runState.goal = lastUserTextFromWork(work, userMessage) || roundCtx._runState.goal
    roundCtx._runState.taskKind = roundCtx._taskKind || roundCtx._runState.taskKind
    roundCtx._runState.acceptanceCriteria = acceptanceFor(roundCtx._runState.taskKind, roundCtx._runState.goal)
  }
  freezeSystemBase(work, roundCtx)

  if (
    folder &&
    mode === 'agent' &&
    needsVagueEditClarification(userMessage, true) &&
    !roundCtx._clarified
  ) {
    const askPayload = buildEditClarificationAsk(userMessage)
    const askId = `ask_${crypto.randomUUID()}`
    onEvent?.({ type: 'ask', id: askId, ...askPayload })
    try {
      const answers = await waitForAskReply(askId, signal)
      const clarification = formatAskReply(askPayload.questions, answers)
      roundCtx._liveUserMessage = `${String(userMessage || '').trim()}\n\n${clarification}`
      roundCtx._clarified = true
      for (let wi = work.length - 1; wi >= 0; wi -= 1) {
        if (work[wi].role === 'user') {
          work[wi].content = roundCtx._liveUserMessage
          break
        }
      }
      if (roundCtx._runState) roundCtx._runState.goal = roundCtx._liveUserMessage
    } catch {
      /* user skipped or cancelled */
    }
  }

  const toolCtx = {
    api,
    folder,
    prefs,
    parentMode: mode,
    waitForAskReply,
    model,
    subagentModel: subagentModel || 'auto',
    onEvent,
    signal,
    openFiles: tabsForRound,
    branch,
    driver,
    connectors: platformConnectors,
    async callMcp(args) {
      const server = String(args.server || args.connector || '').trim()
      const tool = String(args.tool || args.name || '').trim()
      if (!server || !tool) return { ok: false, text: 'mcp needs server and tool' }
      let list = toolCtx.connectors
      if (!list?.length) {
        const ctxRes = await api('GET', '/api/studio/tools/context', null, 20_000)
        list = ctxRes.data?.connectors || []
        toolCtx.connectors = list
      }
      const conn = list.find((c) => c.name === server || c.id === server)
      if (!conn) {
        return {
          ok: false,
          text: `No MCP connector "${server}". Open Settings → Connectors, search the marketplace, and tap Connect (browser sign-in).`,
        }
      }
      if (!conn.connected) {
        return { ok: false, text: `Connector "${conn.name}" is not connected — finish OAuth in Soumtok.` }
      }
      const mcpArgs = Object.fromEntries(
        Object.entries(args).filter(([key]) => !['server', 'connector', 'tool', 'name'].includes(key)),
      )
      const res = await api('POST', '/api/studio/tools/mcp', {
        connectorId: conn.id,
        tool,
        args: mcpArgs,
      })
      if (res.status !== 200) {
        return { ok: false, text: res.data?.error || 'MCP call failed' }
      }
      const payload = res.data?.result ?? res.data
      let saved = []
      try {
        saved = saveMcpArtifacts(folder, conn.name || server, tool, payload, prefs) || []
      } catch {
        saved = []
      }
      const body = JSON.stringify(payload ?? {}, null, 2).slice(0, 10_000)
      const note = saved.length ? `\nSaved in project:\n${saved.map((p) => `- ${p}`).join('\n')}` : ''
      return {
        ok: true,
        text: `${body}${note}`.slice(0, 12_000),
      }
    },
    async generateImage(args) {
      return generateImageViaApi(api, args, getBuffer)
    },
    async examineMedia(args) {
      const res = await api(
        'POST',
        '/api/studio/examine-media',
        { mime: args.mime, base64: args.base64, prompt: args.prompt },
        120_000,
      )
      if (res.status === 401) return { ok: false, error: 'Sign in to examine media.' }
      if (res.status !== 200) return { ok: false, error: res.data?.error || 'Could not examine media' }
      return { ok: true, analysis: res.data?.analysis || '', model: res.data?.model || '' }
    },
    runSubagent: (args) => runSubagentTask(toolCtx, args),
    onIntegratedTerminalRun,
    onTerminalMirror,
    roundCtx,
  }

  const autoImage = await tryAutoGenerateImage({
    folder,
    userMessage,
    work,
    prefs,
    onEvent,
    mode,
    runMeta,
    toolCtx,
  })
  if (autoImage) return autoImage

  let lastText = ''
  let totalPrompt = 0
  let totalCompletion = 0
  const maxRounds = maxToolRounds(driver === 'bot' ? 'bot' : 'ide', prefs)

  function ensureWriteHasUserConclusion() {
    if (runMeta.repliedViaEvent) return
    const askedRun =
      roundCtx._taskKind === 'run' ||
      userAskedForLocalhost(String(userMessage || lastUserTextFromWork(work, userMessage) || ''))
    if (!workHasFileWritesThisTurn(work) && !askedRun) return
    const text =
      lastText && isUserFacingConclusion(lastText, work) ? lastText : composeLocalConclusion(work, { run: askedRun })
    runMeta.repliedViaEvent = true
    onEvent?.({
      type: 'assistant',
      text,
      model: 'Soumtok',
      requestedModel: roundCtx.requestedModel || model,
    })
    lastText = text
  }

  for (let round = 0; round < maxRounds; round++) {
    if (signal?.aborted) return { error: 'Cancelled', text: lastText }
    drainAgentSteer(work, roundCtx)
    syncTaskKind(roundCtx, work, userMessage, prefs)
    applyCachedSystem(work, roundCtx)

    const liveUser = roundCtx._liveUserMessage || userMessage
    onEvent?.({
      type: 'status',
      text: roundCtx._skipThinkStatus
        ? 'Working — applying…'
        : round === 0
          ? signalIntent(roundCtx._taskKind || roundCtx._runState?.taskKind || 'execute', liveUser)
          : round === 1
            ? 'Planning…'
            : `Working · step ${round + 1}…`,
    })
    if (round === 0 && thisTurnHasImage) {
      onEvent?.({
        type: 'status',
        text: 'Sending image to Soumtok (vision analysis for your model)…',
      })
    }
    if (round === 0 && model === 'auto') {
      onEvent?.({ type: 'status', text: 'Auto — Soumtok will pick model for cost and task…' })
    }

    pinLiveUserOnWork(work, liveUser)
    const res = await postDesktopAgentRound(api, {
      model,
      mode,
      driver: driver === 'bot' ? 'bot' : 'ide',
      messages: compactConversation(messagesForProvider(work)),
      workspaceRoot: folder,
      openFiles: tabsForRound,
      branch,
      files: round === 0 && thisTurnHasImage ? attach : undefined,
      agentPrefs: prefs,
      analysisKind: roundCtx._taskKind,
    })

    if (shouldUseStudioCompleteFallback(res)) {
      if (round > 0) {
        return { error: 'Desktop agent API unavailable mid-run. Deploy latest soumtok.com or retry.', text: lastText }
      }
      onEvent?.({ type: 'status', text: 'Planning a reply…' })
      const fallback = await runStudioCompleteFallback({
        api,
        model,
        work,
        ctx: roundCtx,
        onEvent,
        folder,
        agentPrefs: prefs,
        signal,
        runMeta,
      })
      return { ...fallback, repliedViaEvent: runMeta.repliedViaEvent }
    }

    if (res.status === 401) return { error: 'Sign in with your Soumtok account.' }
    if (res.status === 403) return { error: 'Finish account setup on soumtok.com.' }
    if (shouldRetryTrialWithDeepSeek(model, res)) {
      onEvent?.({ type: 'status', text: 'Trial plan — switching to DeepSeek V4 Flash…' })
      return runStudioCompleteFallback({
        api,
        model: 'deepseek-v4-flash',
        work,
        ctx: roundCtx,
        onEvent,
        folder,
        agentPrefs: prefs,
        signal,
        runMeta,
      })
    }
    if (isTrialModelCapError(res)) {
      return { error: errorFromResponse(res, 'That model is not on your trial plan.'), text: lastText }
    }
    if (res.status !== 200 || !res.data) {
      const errMsg = errorFromResponse(res, 'Agent request failed.')
      if (isToolChainApiError(errMsg)) {
        const safe = storageSafeModelMessages(work)
        work.length = 0
        work.push(...safe)
        if (!roundCtx._toolChainFolded) {
          roundCtx._toolChainFolded = true
          onEvent?.({ type: 'status', text: 'Working — applying…' })
          round -= 1
          continue
        }
        onEvent?.({ type: 'status', text: 'Finishing your answer…' })
        const fb = await runStudioCompleteFallback({
          api,
          model,
          work,
          ctx: roundCtx,
          onEvent,
          folder,
          agentPrefs: prefs,
          signal,
          runMeta,
        })
        if (!fb.error) {
          return {
            ...fb,
            messages: persistWork(work),
            repliedViaEvent: runMeta.repliedViaEvent,
          }
        }
        if (workHasFileWritesThisTurn(work)) {
          lastText = concludeWrittenWork({
            work,
            onEvent,
            runMeta,
            lastText,
            requestedModel: roundCtx.requestedModel || model,
          })
          return { text: lastText, messages: persistWork(work), repliedViaEvent: true }
        }
        return {
          error: 'The model could not continue this tool round. Send the same request again.',
          text: lastText,
          messages: persistWork(work),
        }
      }
      if (round === 0 && !roundCtx._roundRetry) {
        roundCtx._roundRetry = true
        onEvent?.({ type: 'status', text: 'Retrying…' })
        round -= 1
        continue
      }
      if (workHasFileWritesThisTurn(work)) {
        lastText = concludeWrittenWork({
          work,
          onEvent,
          runMeta,
          lastText,
          requestedModel: roundCtx.requestedModel || model,
        })
        return { text: lastText, messages: persistWork(work), repliedViaEvent: true }
      }
      return { error: errMsg, text: lastText, messages: persistWork(work) }
    }

    const { text, toolCalls, model: usedModel, promptTokens, completionTokens, thought } = res.data
    lastText = text || lastText
    totalPrompt += promptTokens || 0
    totalCompletion += completionTokens || 0

    if (model === 'auto' && usedModel) {
      onEvent?.({ type: 'status', text: `Auto selected ${usedModel}` })
    }
    if (thought) onEvent?.({ type: 'status', text: thought })
    else if (res.data?.intent && round === 0) {
      onEvent?.({ type: 'status', text: `Intent: ${String(res.data.intent).replace(/_/g, ' ')}` })
    }
    if (res.data?.wrapNote && round === 0) onEvent?.({ type: 'status', text: res.data.wrapNote })

    let calls = toolCalls || []
    const sanitized = sanitizeAssistantText(text || '')
    if (!calls.length && sanitized.calls.length) calls = sanitized.calls

    if (!calls.length) {
      const progress = noteRoundProgress(roundCtx._runState, work)
      const wantsWork = userWantedAgentWork(work, userMessage)
      const noUsefulTools = !workAfterLastHuman(work).some((m) => m.role === 'tool' && m.ok !== false)
      const evidenceStall = wantsWork && (progress.stuck || noUsefulTools)
      if (
        mode === 'agent' &&
        folder &&
        round < maxRounds - 1 &&
        (roundCtx._steerCount || 0) < 2 &&
        evidenceStall
      ) {
        roundCtx._steerCount = (roundCtx._steerCount || 0) + 1
        if (String(text || '').trim()) work.push({ role: 'assistant', content: text })
        if (roundCtx._taskKind === 'image' || userAskedToGenerateImage(lastUserTextFromWork(work, userMessage), imageIntentHintFromWork(work))) {
          const autoImage = await tryAutoGenerateImage({
            folder,
            userMessage,
            work,
            prefs,
            onEvent,
            mode,
            runMeta,
            toolCtx,
          })
          if (autoImage) return autoImage
          steerWithNudge(work, taskIncompleteNudge('image'), roundCtx)
        } else {
          const stalledBuild = await applyGreenfieldScaffoldIfStalled({
            folder,
            userMessage,
            work,
            onEvent,
            ctx: roundCtx,
          })
          const kindNow = syncTaskKind(roundCtx, work, userMessage, prefs)
          steerWithNudge(
            work,
            stalledBuild
              ? '[Soumtok harness] Starter files are on disk (SCAFFOLD ON DISK). Tighten them to the USER request, then terminal("npm install"); terminal("npm run dev"). Windows: ; not &&. Do not recreate a second tree.'
              : progress.stuck
                ? adaptiveSteering(kindNow, work, roundCtx._runState) || stuckSteerNudge(kindNow)
                : APPLY_EDIT_NOW_NUDGE,
            roundCtx,
          )
        }
        onEvent?.({ type: 'status', text: 'Working — applying…' })
        continue
      }
      const taskKindNow = syncTaskKind(roundCtx, work, userMessage, prefs)
      if (
        mode === 'agent' &&
        folder &&
        round < maxRounds - 1 &&
        shouldContinueAgentTask({
          mode,
          folder,
          kind: taskKindNow,
          work,
          text: text || '',
          round,
          maxRounds,
          state: roundCtx._runState,
        })
      ) {
        if (taskKindNow === 'image') {
          const autoImage = await tryAutoGenerateImage({
            folder,
            userMessage,
            work,
            prefs,
            onEvent,
            mode,
            runMeta,
            toolCtx,
          })
          if (autoImage) return autoImage
        }
        if (String(text || '').trim()) work.push({ role: 'assistant', content: text })
        steerWithNudge(work, taskIncompleteNudge(taskKindNow), roundCtx)
        onEvent?.({ type: 'status', text: 'Working — applying…' })
        continue
      }
      const cleanedReply = emitAssistantMessage(
        onEvent,
        text || '',
        usedModel,
        roundCtx.requestedModel,
        runMeta,
        work,
        true,
      )
      if (cleanedReply) lastText = cleanedReply
      else if (sanitized.cleaned) lastText = sanitized.cleaned
      const outText = textLooksLikeDsml(lastText) ? stripDsmlFromText(lastText) : lastText
      const taskKind = syncTaskKind(roundCtx, work, userMessage, prefs)
      const incomplete =
        mode === 'agent' &&
        folder &&
        taskKind !== 'analyze' &&
        taskKind !== 'chat' &&
        !taskCompletionMet(taskKind, work, roundCtx._runState)
      ensureWriteHasUserConclusion()
      return {
        done: true,
        incomplete,
        text: outText,
        messages: persistWork(work),
        promptTokens: totalPrompt,
        completionTokens: totalCompletion,
        repliedViaEvent: runMeta.repliedViaEvent,
        note: incomplete ? 'Task may be incomplete — say "continue" or repeat what you need.' : undefined,
      }
    }

    const ran = await executeToolCalls({
      calls,
      folder,
      prefs,
      work,
      onEvent,
      signal,
      assistantContent: stripDsmlFromText(text || '') || '',
      toolCtx,
    })
    if (ran?.error) return { error: ran.error, text: lastText }
    drainAgentSteer(work, roundCtx)
    syncTaskKind(roundCtx, work, userMessage, prefs)
    noteRoundProgress(roundCtx._runState, work)
    if (ran?.failed?.length && round < maxRounds - 1 && !roundCtx._failNudge) {
      roundCtx._failNudge = true
      const stuckFails = Object.entries(roundCtx._failSig || {}).filter(([, n]) => n >= 3)
      const stuck = stuckFails.length
        ? ` Same call failed ${stuckFails[0][1]} times — do not repeat it; change old_string/path/command.`
        : ''
      steerWithNudge(
        work,
        `[Soumtok harness] Tool(s) failed (${ran.failed.join(', ')}). Read the error.${stuck} On Windows PowerShell use ; not &&. Fix with write/diff or a corrected terminal() — do not tell the user to run it. Then continue.`,
        roundCtx,
      )
    }
  }

  const needsFinalSummary =
    workHasToolResults(work) && (!runMeta.repliedViaEvent || !isUserFacingConclusion(lastText, work))
  if (needsFinalSummary) {
    onEvent?.({ type: 'status', text: 'Writing summary for you…' })
    const fb = await runStudioCompleteFallback({
      api,
      model,
      work,
      ctx: roundCtx,
      onEvent,
      folder,
      agentPrefs: prefs,
      signal,
      runMeta,
    })
    if (!fb.error && (fb.text || runMeta.repliedViaEvent)) {
      if (fb.text) lastText = fb.text
      ensureWriteHasUserConclusion()
      return {
        ...fb,
        promptTokens: totalPrompt + (fb.promptTokens || 0),
        completionTokens: totalCompletion + (fb.completionTokens || 0),
        repliedViaEvent: runMeta.repliedViaEvent,
      }
    }
  } else if (!runMeta.repliedViaEvent) {
    onEvent?.({ type: 'status', text: 'Wrapping up…' })
    const fb = await runStudioCompleteFallback({
      api,
      model,
      work,
      ctx: roundCtx,
      onEvent,
      folder,
      agentPrefs: prefs,
      signal,
      runMeta,
    })
    if (!fb.error && (fb.text || runMeta.repliedViaEvent)) {
      if (fb.text) lastText = fb.text
      ensureWriteHasUserConclusion()
      return {
        ...fb,
        promptTokens: totalPrompt + (fb.promptTokens || 0),
        completionTokens: totalCompletion + (fb.completionTokens || 0),
        repliedViaEvent: runMeta.repliedViaEvent,
      }
    }
  }

  ensureWriteHasUserConclusion()

  const taskKind = syncTaskKind(roundCtx, work, userMessage, prefs)
  const incomplete =
    mode === 'agent' &&
    folder &&
    taskKind !== 'analyze' &&
    taskKind !== 'chat' &&
    !taskCompletionMet(taskKind, work, roundCtx._runState)

  return {
    done: true,
    incomplete,
    text: lastText,
    messages: persistWork(work),
    promptTokens: totalPrompt,
    completionTokens: totalCompletion,
    note: incomplete
      ? 'Unmet acceptance — no verified successful edit/test/localhost yet. Say continue to keep going.'
      : lastText && isSubstantiveAgentReply(lastText, work)
        ? undefined
        : 'Stopped after max tool rounds without a verified conclusion — send continue to keep going.',
    repliedViaEvent: runMeta.repliedViaEvent,
  }
}

function isWriteBlockedInUiMode(uiMode, toolName) {
  const n = String(toolName || '').toLowerCase()
  const mode = String(uiMode || 'agent').toLowerCase()
  return (mode === 'plan' || mode === 'ask') && WRITE_TOOLS.test(n)
}

module.exports = {
  runAgentHarness,
  pushAgentSteer,
  resolveAskReply,
  formatAskReply,
  isWriteBlockedInUiMode,
  runOneToolCall,
  postDesktopAgentRound,
  shouldUseStudioCompleteFallback,
}
