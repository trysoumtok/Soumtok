/**
 * Harness task intent + completion gates — stop "I'm done" before work is actually done.
 */

const { repairIntentText } = require('../shared/typoIntent.js')
const { parseStillRequest } = require('../shared/stillAspect.js')

function userIsBareConfirm(text) {
  const t = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[!?.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t || t.length > 80) return false
  if (
    /^(go|go on|go ahead|yes|y|ok|okay|sure|do it|do that|please|yep|yeah|continue|keep going|proceed|apply|apply it|apply that|apply this|apply now|build it)$/i.test(
      t,
    )
  ) {
    return true
  }
  return /^(go on|go ahead|go|yes|ok|okay|sure|please|continue|keep going)(\s+(and\s+)?(apply|do it|proceed|continue|ahead|now))+$/i.test(
    t,
  )
}

function assistantAskedPermission(text) {
  const t = String(text || '')
  if (!t.trim()) return false
  if (
    /\b(want me to|do you want me to|should i|shall i|can i|could i|may i|ready for me to|would you like me to)\b/i.test(
      t,
    )
  ) {
    return true
  }
  if (/\b(if you want me to|let me know if|just say|say\s+go|when you'?re ready|reply ["']go["'])\b/i.test(t)) {
    return true
  }
  return /\bapply (that|this|the) (change|fix|edit|patch|update)\b/i.test(t)
}

function assistantOfferedApplyEdit(text) {
  return assistantAskedPermission(text)
}

function looksLikeRunApp(text) {
  const t = repairIntentText(text).toLowerCase()
  if (!t.trim()) return false
  if (/localhost|127\.0\.0\.1|local\s*host/.test(t)) return true
  if (/runmy/.test(t) && /local|host|app|server|dev|site/.test(t)) return true
  if (/run\s*my\s*(app|server|dev|local|site|project|web)/.test(t)) return true
  if (
    /\b(start (the )?(server|app|dev)|run (the )?(app|server|dev|web)|npm run (dev|start|web|serve|preview)|launch (the )?app)\b/.test(
      t,
    )
  ) {
    return true
  }
  if (/:\d{4}\b/.test(t) && /\b(run|start|open|go to|see)\b/.test(t)) return true
  return false
}

function normalizeImageTypos(text) {
  return repairIntentText(text).toLowerCase()
}

function hasGenerateLikeVerb(t) {
  return (
    /\b(generate|create|make|draw|paint|render|imagine)\b/.test(t) ||
    /\bgener(?!al\b|ic\b|ous\b|ation\b|ator\b)[a-z]{0,12}\b/.test(t)
  )
}

function hasStillImageNoun(t) {
  return /\b(image|picture|photo|illustration|artwork|wallpaper|png|jpe?g|webp)\b/.test(t)
}

function userAskedToPlaceImageInProject(text) {
  const t = String(text || '').toLowerCase()
  return (
    /\b(add|put|place|insert|replace|wire|use)\b/.test(t) &&
    /\b(hero|header|nav|footer|html|css|component|page|site|app|website|landing|in (the|this) (project|folder|repo|code))\b/.test(
      t,
    )
  )
}

function looksLikeCodeOrAppJob(t) {
  return /\b(app|application|website|webapp|web app|component|gallery|slider|carousel|library|folder|repo|codebase|workspace|package\.json|\.tsx|\.jsx|html|css|function|class|hook|endpoint)\b/.test(
    t,
  )
}

function looksLikeVisualScene(t) {
  return (
    /\b(danc\w*|posing|flying|sitting|standing|jumping|walking|man|woman|person|people|guy|girl|boy|child|car|supercar|truck|bike|motorcycle|eagle|bird|cat|dog|horse|lion|wolf|city|street|sunset|sunrise|mountain|ocean|beach|forest|portrait|landscape|skyline|neon|night)\b/.test(
      t,
    ) || /\bwith a (man|woman|person|car|dog|cat|bird|eagle)\b/.test(t)
  )
}

function isImageFollowUp(t, hint) {
  if (!/\b(a new one|another one|another|one more|again|new still|new picture|new photo)\b/.test(t)) return false
  if (hint?.lastKind === 'image' || hint?.priorImage) return true
  return looksLikeVisualScene(t)
}

/** Standalone still — generate_image, do not scan the repo. */
function userAskedToGenerateImage(text, hint) {
  const raw = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim()
  const t = normalizeImageTypos(text).replace(/\s+/g, ' ').trim()
  if (!t) return false
  if (userAskedToPlaceImageInProject(t) || userAskedToPlaceImageInProject(raw)) return false
  if (/\b(image|picture|photo|illustration)s?\s+(gallery|app|page|component|library|slider|carousel)\b/.test(t)) {
    return false
  }
  if (/\b(explain|describe|analyze|analyse|what is|what'?s|tell me about)\b/.test(t) && !hasGenerateLikeVerb(t)) {
    return false
  }
  if (/\b(an?\s+)?(image|picture|photo|illustration)s?\s+of\b/.test(t) || /\b(an?\s+)?(image|picture|photo|illustration)s?\s+of\b/.test(raw)) {
    return true
  }
  if (hasStillImageNoun(t) && hasGenerateLikeVerb(t)) return true
  if (hasStillImageNoun(raw) && hasGenerateLikeVerb(raw)) return true
  if (/\ban?\s+[a-z][a-z-]{1,24}\s+(image|picture|photo)\b/.test(t) || /\ban?\s+[a-z][a-z-]{1,24}\s+(image|picture|photo)\b/.test(raw)) {
    return true
  }
  if (hasGenerateLikeVerb(t) && isImageFollowUp(t, hint) && !looksLikeCodeOrAppJob(t)) return true
  if (hasGenerateLikeVerb(t) && looksLikeVisualScene(t) && !looksLikeCodeOrAppJob(t)) return true
  if (
    (hint?.lastKind === 'image' || hint?.priorImage) &&
    looksLikeVisualScene(t) &&
    !looksLikeCodeOrAppJob(t) &&
    !/\b(explain|what is|fix|edit|implement)\b/.test(t)
  ) {
    return true
  }
  return hasStillImageNoun(t) && /\b(for me|please)\b/.test(t) && !/\b(fix|edit|change|update|add)\b/.test(t)
}

function stillRequestFromUser(text) {
  const t = normalizeImageTypos(text).replace(/\s+/g, ' ').trim()
  const parsed = parseStillRequest(t)
  const stripped = parsed.prompt
    .replace(/^(please\s+|can you\s+|could you\s+|would you\s+)?/i, '')
    .replace(/\b(generate|create|make|draw|paint|render)\s+(me\s+)?(an?\s+|the\s+)?/i, '')
    .replace(/\b(a\s+)?new one\b/gi, '')
    .replace(/\banother(\s+one)?\b/gi, '')
    .replace(/\b(image|picture|photo|illustration)s?\b/gi, '')
    .replace(/\bfor me\b/gi, '')
    .replace(/^\s*with\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return { prompt: stripped || parsed.prompt || 'image', aspect: parsed.aspect }
}

function imagePromptFromUser(text) {
  return stillRequestFromUser(text).prompt
}

function workHasPriorGeneratedImage(work) {
  for (const m of work || []) {
    const name = String(m.name || '')
    const content = String(m.content || '')
    if (m.role === 'tool' && /^generate_image$/i.test(name)) return true
    if (/assets\/generated\//i.test(content)) return true
  }
  return false
}

function imageIntentHintFromWork(work, extra) {
  return {
    lastKind: extra?.lastKind,
    priorImage: Boolean(extra?.priorImage || workHasPriorGeneratedImage(work)),
    lastAssistant: extra?.lastAssistant,
  }
}

function classifyUserTask(text, hint) {
  const t = repairIntentText(String(text || '')).toLowerCase()
  if (userIsBareConfirm(t)) {
    const prior = String(hint?.lastAssistant || '')
    const asked =
      assistantAskedPermission(prior) || /\b(apply|diff|write\(|patch|commit)\b/i.test(prior)
    if (asked) {
      if (
        /\b(run|start|launch|preview|dev server|localhost)\b/i.test(prior) &&
        !/\b(apply|diff|write|edit|patch)\b/i.test(prior)
      ) {
        return 'run'
      }
      if (/\b(apply|edit|patch|diff|write|fix)\b/i.test(prior)) return 'fix'
      if (hint?.lastKind && hint.lastKind !== 'chat') return hint.lastKind
      return 'execute'
    }
    if (hint?.lastKind && hint.lastKind !== 'chat') return hint.lastKind
    return 'execute'
  }
  if (userAskedToGenerateImage(t, hint) || userAskedToGenerateImage(text, hint)) {
    return 'image'
  }
  if (
    /\b(fix|black spots?|looks? (false|wrong|fake|bad)|make it (look|looks|real|clean|3d))\b/.test(t) &&
    !/\b(from scratch|new app|greenfield)\b/.test(t)
  ) {
    return 'fix'
  }
  if (
    /\b(delete|remove|wipe|clear|trash|nuke|empty|delet)\b[\s\S]{0,48}\b(everything|everthing|every file|all files|all of it|whole project|this project|this folder)\b/.test(
      t,
    ) ||
    /\bdelete\s+(every|all|this|it)\b/.test(t) ||
    /\bclear\s+(this|the)\s+(folder|fl|project)\b/.test(t)
  ) {
    return 'wipe'
  }
  if (
    (/\b(build|create|make|scaffold|from scratch|greenfield|new app|website|web app|landing|homepage|web site|cli|command line)\b/.test(t) &&
      !/\b(explain|what is|describe)\b/.test(t)) ||
    /\b(landing ?page|webapp)\b/.test(t)
  ) {
    return 'build'
  }
  if (
    /\b(git |commit |push |pull |branch |stash |merge )\b/.test(t) ||
    /\b(write tests?|add tests?|unit test|refactor|rename this|implement)\b/.test(t)
  ) {
    return 'execute'
  }
  if (looksLikeRunApp(t) || /\b(localhost|127\.0\.0\.1|:\d{4})\b/.test(t)) {
    return 'run'
  }
  if (/\b(fix|make it work|get it working|broken|not working|messy|clean up)\b/.test(t)) {
    return 'fix'
  }
  if (
    /\b(what can you do|what can u do|what do you do|what are you able|how can you help|what can you help|what can you do with|capabilities)\b/.test(
      t,
    )
  ) {
    return 'chat'
  }
  if (
    (/\b(what|how|why|explain|describe|summarize|overview|tell me about)\b/.test(t) &&
      !/\b(fix|build|run|delete|implement|change)\b/.test(t) &&
      /\b(project|repo|codebase|workspace|folder|this app|my code)\b/.test(t)) ||
    /\b(is this|what kind of project)\b/.test(t)
  ) {
    return 'analyze'
  }
  if (/\b(read|open|show)\b/.test(t) && /\b(file|json|package|readme|src|code|\.ts|\.js)\b/.test(t)) {
    return 'analyze'
  }
  if (/\b(implement|add|change|update|edit|create|install|test|deploy|refactor)\b/.test(t)) {
    return 'execute'
  }
  return 'chat'
}

function taskKindLabel(kind) {
  const map = {
    wipe: 'Clear project',
    run: 'Run / localhost',
    build: 'Build app',
    fix: 'Fix project',
    execute: 'Do task',
    analyze: 'Explain / analyze',
    chat: 'Chat',
    image: 'Generate image',
  }
  return map[kind] || 'Task'
}

function composeTaskContract(userMessage, kind) {
  const q = String(userMessage || '')
    .trim()
    .slice(0, 220)
  const accept = {
    wipe: 'ACCEPTANCE: wipe_workspace() or delete paths until list_dir(".") is empty ( .git optional ).',
    run: 'ACCEPTANCE: terminal(dev/start) in integrated Terminal → read_terminal(20000) → reply with http://localhost:PORT from tool output.',
    build: 'ACCEPTANCE: write files matching USER request → npm install → start easiest localhost (Vite 5173 or static server 3030) → read_terminal → URL. Required for website/app/landing page.',
    fix: 'ACCEPTANCE: write/diff/terminal until issue fixed — verified in tool output, not claimed in chat.',
    execute: 'ACCEPTANCE: request completed using tools; show evidence (paths, command output).',
    analyze: 'ACCEPTANCE: answer from read/grep/list_dir — no fake "I cannot see your files".',
    chat: 'ACCEPTANCE: answer the question. Do NOT scan the workspace unless they asked about this project.',
    image: 'ACCEPTANCE: generate_image({ prompt }) saved a still under assets/generated/. No list_dir/read first.',
  }[kind]
  if (!accept) return ''
  return `SOUMTOK TASK INTENT (harness — read before acting):
USER: "${q.replace(/"/g, "'")}"
TYPE: ${kind} (${taskKindLabel(kind)})
${accept}
Forbidden: ending with "done / all set / open localhost yourself" before acceptance passes.`
}

function toolOutputShowsLocalhost(work) {
  for (const m of work || []) {
    if (m.role !== 'tool') continue
    const n = String(m.name || '').toLowerCase()
    if (!/^(terminal|read_terminal|browser|web_fetch|fetch)$/.test(n)) continue
    if (
      /https?:\/\/(?:localhost|127\.0\.0\.1):\d+|running at http|dev server looks READY|Likely URLs:/i.test(
        String(m.content || ''),
      )
    ) {
      return true
    }
  }
  return false
}

function workHasReadTerminal(work) {
  return (work || []).some((m) => m.role === 'tool' && String(m.name || '').toLowerCase() === 'read_terminal')
}

function lastHumanUserIndex(work) {
  for (let i = (work || []).length - 1; i >= 0; i--) {
    const m = work[i]
    if (m.role !== 'user') continue
    if (/^\[Soumtok harness\]/i.test(String(m.content || '').trim())) continue
    return i
  }
  return -1
}

function workAfterLastHuman(work) {
  const idx = lastHumanUserIndex(work)
  if (idx < 0) return work || []
  return (work || []).slice(idx)
}

function workHasMutatingTools(work) {
  return (work || []).some((m) => {
    if (m.role !== 'tool') return false
    if (toolRowFailed(m)) return false
    const n = String(m.name || '').toLowerCase()
    return /^(write|diff|edit|delete|wipe_workspace|clear_workspace|terminal|generate_image)$/.test(n)
  })
}

function toolRowFailed(m) {
  if (!m || m.role !== 'tool') return false
  if (m.ok === false) return true
  const c = String(m.content || '').trim()
  return /^(Could not apply edit|Could not find that text|Unknown tool:|old_string not found|Command blocked|needs (path|command|pattern)|File deletion blocked|File missing)/i.test(
    c,
  )
}

function workHasSuccessfulWrites(work) {
  return (work || []).some((m) => {
    if (m.role !== 'tool') return false
    if (toolRowFailed(m)) return false
    if (!/^(write|diff|edit|str_replace|apply_patch)$/i.test(String(m.name || ''))) return false
    const c = String(m.content || '')
    if (/^(Could not|old_string not found|File missing)/i.test(c.trim())) return false
    return /\b(Updated |Wrote |Edited )/i.test(c)
  })
}

function workHasGenerateImage(work) {
  return (work || []).some(
    (m) => m.role === 'tool' && /^generate_image$/i.test(String(m.name || '')) && !toolRowFailed(m),
  )
}

function workHasAttemptCompletion(work) {
  return (work || []).some((m) => m.role === 'tool' && /^attempt_completion$/i.test(String(m.name || '')))
}

function workHasSuccessfulDelete(work) {
  return (work || []).some(
    (m) => m.role === 'tool' && /\bDeleted\b|Wiped workspace|removed \d+ item/i.test(String(m.content || '')),
  )
}

function tscErrorKeys(text) {
  const keys = new Set()
  const src = String(text || '')
  const re = /([^\s:(]+\.tsx?)\((\d+),(\d+)\):\s+error (TS\d+)/gi
  let m
  while ((m = re.exec(src))) keys.add(`${m[1]}:${m[2]}:${m[4]}`)
  const re2 = /error (TS\d+)/gi
  if (!keys.size) {
    while ((m = re2.exec(src))) keys.add(m[1])
  }
  return keys
}

function verifyIntroducedNewErrors(baseline, after) {
  const before = tscErrorKeys(baseline)
  const next = tscErrorKeys(after)
  if (!next.size) return false
  for (const k of next) {
    if (!before.has(k)) return true
  }
  return next.size > before.size
}

function workHasDevServerTerminal(work) {
  return (work || []).some((m) => {
    if (m.role !== 'tool' || String(m.name || '').toLowerCase() !== 'terminal') return false
    const c = String(m.content || '')
    return /\b(npm run|npm start|node server|node index|integrated Terminal)\b/i.test(c)
  })
}

function taskCompletionMet(kind, work, state) {
  const scope = workAfterLastHuman(work)
  const wrote = workHasSuccessfulWrites(scope)
  const localhost = toolOutputShowsLocalhost(scope)
  const readTerm = workHasReadTerminal(scope)
  const ranServer = workHasDevServerTerminal(scope)
  const deleted = workHasSuccessfulDelete(scope)
  const finished = workHasAttemptCompletion(scope)
  const changed = state
    ? Object.entries(state.filesTouched || {})
        .filter(([, row]) => row.changed)
        .map(([p]) => p)
    : []
  const verifyFailed = state?.verification?.passed === false

  switch (kind) {
    case 'wipe':
      return deleted
    case 'run':
      return localhost
    case 'build':
      if (verifyFailed) return false
      return wrote && localhost
    case 'fix':
      if (verifyFailed) return false
      if (state && Object.keys(state.filesTouched || {}).length) return wrote && changed.length > 0
      return wrote
    case 'execute':
      if (verifyFailed) return false
      if (finished && wrote) return true
      if (finished && !scope.some((m) => m.role === 'tool' && toolRowFailed(m))) {
        return workHasMutatingTools(scope) && (wrote || deleted || ranServer || readTerm)
      }
      return workHasMutatingTools(scope) && (wrote || deleted || ranServer || readTerm)
    case 'image':
      return workHasGenerateImage(scope)
    case 'analyze':
    case 'chat':
      return true
    default:
      return true
  }
}

function classifyFromEvidence(userText, hint, work, currentKind) {
  let kind = classifyUserTask(userText, hint)
  const scope = workAfterLastHuman(work)
  const names = new Set(
    scope.filter((m) => m.role === 'tool').map((m) => String(m.name || '').toLowerCase()),
  )
  const wrote = workHasSuccessfulWrites(scope)
  const sticky = new Set(['build', 'fix', 'run', 'image', 'wipe', 'execute'])

  if ((kind === 'chat' || kind === 'analyze') && wrote) kind = 'fix'
  if ((kind === 'chat' || kind === 'analyze') && (names.has('write') || names.has('diff') || names.has('edit'))) {
    kind = 'fix'
  }
  if ((kind === 'chat' || kind === 'analyze') && names.has('generate_image')) kind = 'image'
  if (
    (kind === 'chat' || kind === 'analyze') &&
    (toolOutputShowsLocalhost(scope) || workHasDevServerTerminal(scope))
  ) {
    kind = currentKind === 'build' ? 'build' : 'run'
  }
  if (sticky.has(currentKind) && (kind === 'chat' || kind === 'analyze') && currentKind !== 'analyze') {
    kind = currentKind
  }
  return kind
}

function assistantClaimsTaskDone(text) {
  return /\b(you'?re (all set|good to go|done)|that should (do|work|be)|i'?ve (finished|completed|done)|job('s| is) done|everything (is )?(ready|set)|go ahead and (open|try|run)|should (work|be good) now|all done)\b/i.test(
    String(text || ''),
  )
}

function shouldContinueAgentTask({ mode, folder, kind, work, text, round, maxRounds, state }) {
  if (mode !== 'agent' || !folder) return false
  if (round >= maxRounds - 1) return false
  if (kind === 'chat') return false
  if (kind === 'analyze') return false
  if (state?.progress === 'success') return false
  if (kind === 'image') return !taskCompletionMet('image', work, state)
  if (taskCompletionMet(kind, work, state)) return false
  if (state?.verification?.passed === false) return true
  if (state?.progress === 'stuck') return true
  if (!workHasMutatingTools(workAfterLastHuman(work))) return true
  return false
}

function stuckSteerNudge(kind) {
  const base = '[Soumtok harness] Stuck — no file hash or tool progress this round. '
  switch (kind) {
    case 'fix':
      return `${base}Try grep for the symbol, read({ path, start_line, end_line }) on a smaller range, run npx tsc or npm test, or change old_string/path in diff — do not repeat the same call.`
    case 'build':
      return `${base}Try write() one file, terminal("npm install"), terminal("npm run dev"), read_terminal({ wait_ms: 20000 }) — do not recreate files that already exist.`
    case 'run':
      return `${base}Try read package.json scripts, terminal with the correct npm script, read_terminal({ wait_ms: 20000 }) for the URL — logs alone are not enough.`
    case 'chat':
    case 'question':
      return `${base}Answer from what you already read — stop scanning the repo unless a specific file is missing.`
    case 'image':
      return `${base}Call generate_image({ prompt }) with a tighter subject/ratio — do not list_dir or read the project.`
    default:
      return `${base}Change approach: different file, grep pattern, or command.`
  }
}

function signalIntent(kind, goal) {
  const signals = {
    fix: 'Fix task — locating the issue in relevant files first.',
    build: 'Build task — checking setup, then writing project files.',
    run: 'Run task — starting the dev server and confirming localhost.',
    chat: 'Answering from project context.',
    question: 'Looking up what you asked about.',
    image: 'Generating the still you requested.',
    execute: 'Continuing the pending work with tools.',
    analyze: 'Searching the codebase for what you need.',
    wipe: 'Wiping workspace files as requested.',
  }
  return signals[kind] || `Starting: ${String(goal || '').slice(0, 100)}`
}

function needsVagueEditClarification(text, hasProject) {
  const t = String(text || '').trim()
  if (!hasProject || !t || userIsBareConfirm(t)) return false
  if (/\?/.test(t)) return false
  if (!/^(fix|improve|clean|refactor|update|change|add|make it better|polish)\b/i.test(t)) return false
  if (/\b(header|footer|nav|login|button|page|component|\.tsx|\.ts|\.jsx|\.js|\.css|\.html)\b/i.test(t)) {
    return false
  }
  if (/\b[a-z0-9_/-]+\.(tsx?|jsx?|css|html|vue|svelte)\b/i.test(t)) return false
  return t.split(/\s+/).filter(Boolean).length <= 6
}

function buildEditClarificationAsk(userText) {
  const snippet = String(userText || '').trim().slice(0, 60)
  return {
    title: 'What should I change?',
    intro: snippet ? `Your request "${snippet}" is open-ended. Help me focus:` : 'Help me focus:',
    questions: [
      {
        id: 'scope',
        prompt: 'What are you trying to do?',
        allowCustom: true,
        options: [
          { id: 'fix-bug', label: 'Fix a specific bug' },
          { id: 'feature', label: 'Add a feature' },
          { id: 'style', label: 'Change layout or styling' },
          { id: 'refactor', label: 'Refactor or clean up code' },
          { id: 'understand', label: 'Explain how something works' },
        ],
      },
    ],
  }
}

const IMAGE_COUNT_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
}

/** How many stills the user asked for this turn (default 1). */
function imageCountFromUser(text) {
  const t = String(text || '').toLowerCase().replace(/\s+/g, ' ')
  const digit = t.match(/\b(\d+)\s+(?:images?|pictures?|photos?|stills?)\b/)
  if (digit) return Math.min(6, Math.max(1, Number(digit[1]) || 1))
  const word = t.match(/\b(one|two|three|four|five|six)\s+(?:images?|pictures?|photos?|stills?)\b/)
  if (word) return IMAGE_COUNT_WORDS[word[1]] || 1
  const gen = t.match(/\bgenerate\s+(\d+)\b/)
  if (gen && /\b(image|picture|photo|still)\b/.test(t)) return Math.min(6, Math.max(1, Number(gen[1]) || 1))
  return 1
}

function countGeneratedImagesInScope(scope) {
  return (scope || []).filter(
    (m) => m.role === 'tool' && /^generate_image$/i.test(String(m.name || '')) && m.ok !== false,
  ).length
}

function adaptiveSteering(taskKind, work, runState) {
  if (runState?.progress !== 'stuck') return null
  const scope = workAfterLastHuman(work)
  const recentReads = scope.filter((m) => m.role === 'tool' && /^read/i.test(String(m.name || ''))).length
  const recentEdits = scope.filter((m) => m.role === 'tool' && /^(write|diff|edit|str_replace|apply_patch)$/i.test(String(m.name || ''))).length
  const recentTerm = scope.filter((m) => m.role === 'tool' && /^(terminal|read_terminal)$/i.test(String(m.name || ''))).length

  switch (taskKind) {
    case 'fix':
      if (recentEdits >= 3 && recentTerm === 0) {
        return '[Soumtok harness] Stuck — run npx tsc or npm test in terminal to see the actual error before another diff.'
      }
      if (recentEdits >= 2 && recentReads === 0) {
        return '[Soumtok harness] Stuck — grep or read the file around the error before editing again.'
      }
      break
    case 'build':
      if (!toolOutputShowsLocalhost(scope) && recentTerm > 0) {
        return '[Soumtok harness] Stuck — read terminal errors carefully (npm install? port in use? syntax?). Do not recreate existing files.'
      }
      break
    case 'run':
      if (!toolOutputShowsLocalhost(scope) && recentTerm > 0) {
        return '[Soumtok harness] Stuck — check package.json scripts, npm install, and read_terminal({ wait_ms: 20000 }) for the URL.'
      }
      break
    case 'chat':
    case 'question':
      return '[Soumtok harness] Stuck — answer from what you already read, or ask_question if the request is still ambiguous.'
    default:
      break
  }
  return stuckSteerNudge(taskKind)
}

function taskIncompleteNudge(kind) {
  const base = '[Soumtok harness] Task NOT complete — user request not satisfied yet. '
  switch (kind) {
    case 'wipe':
      return `${base}Call wipe_workspace() or delete() now — then list_dir("."). No PowerShell instructions.`
    case 'run':
      return `${base}terminal(npm run dev/start or node server.js) → read_terminal({ wait_ms: 20000 }) → reply with URL from tool output. Do not say done without read_terminal.`
    case 'build':
      return `${base}write() files → terminal("npm install") → terminal("npm run dev" or npm start) → read_terminal({ wait_ms: 20000 }) → give localhost URL. Website/app/landing MUST be running.`
    case 'chat':
      return `${base}Understand the question first, then answer from knowledge. Do not list_dir unless they asked about this project.`
    case 'image':
      return `${base}Understand the subject first, then generate_image({ prompt }) NOW. Do not list_dir or read files. Do not say you need tool access.`
    case 'fix':
      return `${base}Apply write/diff/terminal until fixed; verify with read_terminal or tests. No "I'm done" without tool proof.`
    default:
      return `${base}Use tools until done — then short summary with evidence.`
  }
}

module.exports = {
  classifyUserTask,
  userAskedToGenerateImage,
  imagePromptFromUser,
  stillRequestFromUser,
  workHasPriorGeneratedImage,
  imageIntentHintFromWork,
  looksLikeRunApp,
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
  imageCountFromUser,
  countGeneratedImagesInScope,
  toolOutputShowsLocalhost,
  workHasReadTerminal,
  workHasDevServerTerminal,
  workAfterLastHuman,
  workHasMutatingTools,
  workHasSuccessfulWrites,
  classifyFromEvidence,
  verifyIntroducedNewErrors,
}
