/**
 * Per-turn agent run state — goals, file hashes, tool failures, verification.
 * Progress is evidence (what changed), not English in the model's reply.
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const { workspaceKey } = require('./checkpoints')

function hashText(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex').slice(0, 12)
}

function kbLabel(text) {
  const n = String(text ?? '').length
  if (n < 1024) return `${n} chars`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

function acceptanceFor(kind, goal) {
  const g = String(goal || '').trim().slice(0, 180)
  switch (kind) {
    case 'wipe':
      return ['Workspace files removed', 'list_dir shows empty (except .git)']
    case 'run':
      return ['Dev server started or localhost URL in tool output']
    case 'build':
      return ['Files written for the user request', 'App running or tests/typecheck verified']
    case 'fix':
      return ['A write/diff actually changed a file', 'Verification did not fail']
    case 'image':
      return ['generate_image saved a still']
    case 'execute':
      return ['Mutating tool succeeded', g ? `Matches: ${g}` : 'User request done']
    case 'analyze':
    case 'chat':
      return ['Answer the user']
    default:
      return ['User request satisfied with tool evidence']
  }
}

function createAgentState({ goal, taskKind } = {}) {
  const kind = String(taskKind || 'execute')
  const state = {
    goal: String(goal || '').slice(0, 500),
    taskKind: kind,
    acceptanceCriteria: acceptanceFor(kind, goal),
    filesTouched: {},
    toolsAttempted: {},
    verification: { passed: null, output: '', command: '' },
    progress: 'in_progress',
    lastEvidenceKey: '',
    roundsWithoutProgress: 0,
    lastCheckpointId: '',
    successfulMutations: 0,
  }
  state.lastEvidenceKey = evidenceKey(state, [])
  return state
}

function toolSignature(name, args) {
  const a = args && typeof args === 'object' ? args : {}
  const focus = a.path || a.file || a.command || a.pattern || a.url || ''
  return `${String(name || '').toLowerCase()}:${String(focus).slice(0, 160)}:${JSON.stringify(a).slice(0, 140)}`
}

function recordToolAttempt(state, { name, args, ok, content } = {}) {
  if (!state) return null
  const sig = toolSignature(name, args)
  const prev = state.toolsAttempted[sig] || {
    name: String(name || ''),
    callCount: 0,
    failCount: 0,
    lastError: '',
    disabled: false,
  }
  prev.callCount += 1
  if (ok === false) {
    prev.failCount += 1
    prev.lastError = String(content || '').slice(0, 400)
    if (prev.failCount >= 3) prev.disabled = true
  } else {
    prev.failCount = 0
    prev.lastError = ''
  }
  state.toolsAttempted[sig] = prev
  return prev
}

function isToolDisabled(state, name, args) {
  if (!state) return false
  return Boolean(state.toolsAttempted[toolSignature(name, args)]?.disabled)
}

function disabledToolNames(state) {
  if (!state) return []
  const names = []
  for (const row of Object.values(state.toolsAttempted)) {
    if (row.disabled && row.name && !names.includes(row.name)) names.push(row.name)
  }
  return names
}

function recordFileChange(state, rel, before, after) {
  if (!state || !rel) return false
  const key = String(rel).replace(/\\/g, '/')
  const beforeHash = hashText(before || '')
  const afterHash = hashText(after || '')
  const changed = beforeHash !== afterHash
  state.filesTouched[key] = { before: beforeHash, after: afterHash, changed }
  if (changed) state.successfulMutations += 1
  return changed
}

function filesChanged(state) {
  if (!state) return []
  return Object.entries(state.filesTouched)
    .filter(([, row]) => row.changed)
    .map(([p]) => p)
}

function evidenceKey(state, work) {
  const files = filesChanged(state)
    .map((p) => `${p}:${state.filesTouched[p].after}`)
    .sort()
    .join('|')
  const tools = (work || [])
    .filter((m) => m.role === 'tool')
    .slice(-6)
    .map((m) => `${m.name}:${m.ok === false ? 'fail' : 'ok'}:${hashText(String(m.content || '').slice(0, 240))}`)
    .join(',')
  const verify = state?.verification?.passed
  return `${files}#${tools}#v${verify}`
}

function noteRoundProgress(state, work) {
  if (!state) return { progressed: false, stuck: false }
  const key = evidenceKey(state, work)
  if (key !== state.lastEvidenceKey) {
    state.lastEvidenceKey = key
    state.roundsWithoutProgress = 0
    if (state.progress === 'stuck') state.progress = 'in_progress'
    return { progressed: true, stuck: false }
  }
  state.roundsWithoutProgress += 1
  if (state.roundsWithoutProgress >= 2) {
    state.progress = 'stuck'
    return { progressed: false, stuck: true }
  }
  return { progressed: false, stuck: false }
}

function setVerification(state, { passed, output, command } = {}) {
  if (!state) return
  state.verification = {
    passed: passed == null ? null : Boolean(passed),
    output: String(output || '').slice(0, 4000),
    command: String(command || ''),
  }
}

function markProgress(state, value) {
  if (!state) return
  if (value === 'success' || value === 'failed' || value === 'stuck' || value === 'in_progress') {
    state.progress = value
  }
}

function composeRunStateBlock(state) {
  if (!state) return ''
  const changed = filesChanged(state)
  const disabled = disabledToolNames(state)
  const verify =
    state.verification.passed == null
      ? 'not run'
      : state.verification.passed
        ? `passed${state.verification.command ? ` (${state.verification.command})` : ''}`
        : `FAILED${state.verification.command ? ` (${state.verification.command})` : ''} — fix before claiming done`
  const checkpoint = state.lastCheckpointId
    ? `available (${changed.length || '?'} file(s) — rollback on verify failure)`
    : 'none yet'
  const lines = [
    'SOUMTOK RUN STATE:',
    `Goal: ${state.goal || '(none)'}`,
    `Kind: ${state.taskKind}`,
    `Progress: ${state.progress}`,
    `Acceptance: ${state.acceptanceCriteria.join(' | ')}`,
    changed.length ? `Files changed: ${changed.slice(0, 14).join(', ')}` : 'Files changed: (none yet)',
    `Checkpoint: ${checkpoint}`,
    `Verify: ${verify}`,
  ]
  if (disabled.length) {
    lines.push(`Disabled (same call failed 3x — change path/old_string/command): ${disabled.join(', ')}`)
  }
  if (state.progress === 'stuck') {
    lines.push('Stuck: last rounds produced no new file hashes or tool evidence. Change approach.')
  }
  return lines.join('\n')
}

function summarizeToolResult(name, content) {
  const n = String(name || 'tool').toLowerCase()
  const c = String(content || '')
  const h = hashText(c)
  const size = kbLabel(c)
  const first = c.split('\n')[0].trim().slice(0, 180)
  if (/KNOWN FILES \(harness already searched|SCAFFOLD ON DISK/i.test(c)) {
    return c.length <= 8000 ? c : `${c.slice(0, 8000)}\n…(atlas truncated)`
  }
  if (/^(write|diff|edit|str_replace|apply_patch|delete|wipe_workspace)$/.test(n)) {
    return `${n}: ${first || c.slice(0, 200)} (hash ${h})`
  }
  if (n === 'read' || n === 'read_file') {
    const tokens = (c.match(/\b[A-Za-z_][A-Za-z0-9_]{3,24}\b/g) || []).slice(0, 8)
    const found = [...new Set(tokens)].slice(0, 6).join(', ')
    return `Read ${first || 'file'} (${size}, hash ${h})${found ? ` → ${found}` : ''}. Call read({ path, start_line, end_line }) for a range — do not re-read the whole file.`
  }
  if (n === 'grep' || n === 'glob' || n === 'codebase_search' || n === 'list_dir') {
    const lines = c.split('\n').filter((line) => line.trim())
    return `${n}: ${lines.length} line(s) (${size}, hash ${h}). First: ${(lines[0] || '(none)').slice(0, 160)}`
  }
  if (n === 'terminal' || n === 'read_terminal' || n === 'read_lints') {
    const tail = c.slice(-360).replace(/\s+/g, ' ').trim()
    return `${n} (${size}, hash ${h}): …${tail}`
  }
  if (n === 'generate_image') return `generate_image (${size}, hash ${h}): ${c.slice(0, 240)}`
  if (n === 'todo_write' || n === 'attempt_completion') return `${n}: ${c.slice(0, 400)}`
  return `${n} (${size}, hash ${h}): ${c.slice(0, 280)}`
}

function threadScopeId(threadId) {
  return String(threadId || 'legacy').replace(/[^\w-]/g, '_').slice(0, 64)
}

function todosPath(root, threadId) {
  const id = threadScopeId(threadId)
  return path.join(os.homedir(), '.soumtok', 'workspaces', workspaceKey(root), `todos-${id}.json`)
}

function loadTodos(root, threadId) {
  if (!root) return []
  try {
    const raw = fs.readFileSync(todosPath(root, threadId), 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.todos) ? parsed.todos : []
  } catch {
    return []
  }
}

function saveTodos(root, todos, threadId) {
  if (!root) return
  const list = Array.isArray(todos) ? todos : []
  const file = todosPath(root, threadId)
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ todos: list, threadId: threadScopeId(threadId), at: new Date().toISOString() }, null, 2), 'utf8')
}

const DYNAMIC_SYSTEM_MARKERS = ['SOUMTOK STEER', 'TASK LEDGER', 'SOUMTOK RUN STATE', 'LIVE USER REQUEST']

function stripDynamicSystem(src) {
  let out = String(src || '')
  for (const marker of DYNAMIC_SYSTEM_MARKERS) {
    const i = out.indexOf(marker)
    if (i < 0) continue
    let end = out.length
    for (const other of DYNAMIC_SYSTEM_MARKERS) {
      if (other === marker) continue
      const j = out.indexOf(other, i + marker.length)
      if (j > i && j < end) end = j
    }
    out = `${out.slice(0, i).trim()}\n\n${out.slice(end).trim()}`
  }
  return out.replace(/\n{3,}/g, '\n\n').trim()
}

module.exports = {
  hashText,
  createAgentState,
  toolSignature,
  recordToolAttempt,
  isToolDisabled,
  disabledToolNames,
  recordFileChange,
  filesChanged,
  evidenceKey,
  noteRoundProgress,
  setVerification,
  markProgress,
  composeRunStateBlock,
  summarizeToolResult,
  loadTodos,
  saveTodos,
  todosPath,
  stripDynamicSystem,
  DYNAMIC_SYSTEM_MARKERS,
  acceptanceFor,
}
