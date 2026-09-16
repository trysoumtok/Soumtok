/**
 * Think-first router — Cursor / Codex / Claude class: classify before touching the repo.
 */

const { repairIntentText } = require('../shared/typoIntent.js')

function compact(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isGeneralKnowledgeQuestion(text) {
  const t = compact(repairIntentText(text))
  if (!t) return true
  if (/^(go|go on|yes|y|ok|okay|sure|do it|please|yep|yeah|go ahead|continue|keep going|proceed|apply it|build it)$/.test(t)) return false
  if (/\b(generate|draw|paint|render)\b/.test(t) && /\b(image|picture|photo|danc|man|woman|person|car|eagle|bird)\b/.test(t)) {
    return false
  }
  if (/^(hi|hello|hey|thanks|thank you|no|yo)$/.test(t)) return true
  if (/\b(what is|who is|how does|explain|define|why do|tell me about)\b/.test(t) &&
      !/\b(my |this |the )?(project|repo|codebase|workspace|folder|app|file|bug|code)\b/.test(t)) {
    return true
  }
  if (/\b(soumtok|dashboard|billing|api key|sign in|open folder)\b/.test(t) &&
      !/\b(apps |src |fix this|implement|my repo)\b/.test(t)) {
    return true
  }
  return false
}

function userAskedToBuildSomething(text) {
  const t = repairIntentText(text).toLowerCase()
  if (
    /\b(generate|create|make|draw|paint|render)\b/.test(t) &&
    /\b(image|picture|photo|illustration|iamge|danc\w*|man|woman|person|car|eagle|bird|supercar)\b/.test(t) &&
    !/\b(app|website|gallery|page|component|hero)\b/.test(t)
  ) {
    return false
  }
  return (
    /\b(build|create|make|scaffold|generate|from scratch)\b/.test(t) &&
    /\b(app|website|web site|webapp|landing|page|site|dashboard|portfolio|store|shop|blog|game|api|saas|cli)\b/.test(t)
  ) || /\b(landing ?page|web ?app|website|homepage)\b/.test(t)
}

function userAskedForLocalhost(text) {
  const t = repairIntentText(text).toLowerCase()
  if (/localhost|127\.0\.0\.1|local\s*host/.test(t)) return true
  if (/runmy/.test(t) && /local|host|app|server|dev|site/.test(t)) return true
  if (/run\s*my\s*(app|server|dev|local|site|project|web)/.test(t)) return true
  return /\b(start (the )?(server|app|dev)|run (the )?(app|server|dev|web)|npm run (dev|start|web|serve|preview)|launch)\b/.test(
    t,
  )
}

function composeThinkFirstBrief(userMessage, kind) {
  const raw = String(userMessage || '').trim().slice(0, 280).replace(/"/g, "'")
  const meant = repairIntentText(raw).slice(0, 280).replace(/"/g, "'")
  const meantLine = meant && meant.toLowerCase() !== raw.toLowerCase() ? `USER MEANT: "${meant}"\n` : ''
  const imageNow =
    kind === 'image'
      ? `THIS TURN IS IMAGE: understand their subject, then call generate_image({ prompt }) NOW. Do not list_dir, read, grep, or explore. Do not say you need tool access — generate_image is already on.`
      : `3. Do I need the workspace? Chat / world knowledge / standalone image → no list_dir. Code / build / run / fix / wipe / "put this in the hero" → tools.`
  return `SOUMTOK THINK FIRST (harness — understand the user, then tools):

USER SAID: "${raw}"
${meantLine}CLASSIFIED: ${kind}

UNDERSTAND FIRST:
Restate the job in their words. Then execute only that job.

ROUTE (pick one — do not mix):
- generate / draw a still image → generate_image only. Zero repo reads.
- world knowledge, Soumtok how-to, hello → answer. No list_dir.
- run localhost → terminal + read_terminal. Do not rewrite the app.
- fix / edit this project → read the files that matter, then write.
- new app → understand what they asked (their product, not a generic template). todo_write, then write those files one by one. Do not list_dir an empty folder first.
- wipe folder → wipe_workspace first.

PAUSE AND ANSWER INTERNALLY (do not dump this as the user reply):
1. What did they actually ask for — in their words? Misspellings still count as that job.
2. What is required of me this turn?
${imageNow}
4. BUILD: write the product they named. Empty folder ≠ dump a canned Vite/cube tree.
5. FIX/visual: todo_write, then diff/write the TOUCH THESE / FILE BODIES paths — never README or list_dir first.
6. Never paste fake <write> XML or markdown-only code as the only action — call write() / terminal().
7. Never claim you are sandboxed. You have the user's real PC terminal in this IDE.
8. Never ask permission. Any folder, any file, any task — tools NOW. "Want me to apply?" is forbidden; do it.`
}

function composeWorkLoopBrief(kind) {
  if (kind === 'chat') return ''
  if (kind === 'image') {
    return `SOUMTOK LOOP (image — do not skip to chat):
1. THINK — understand their request (subject, "a new one", ratio) internally.
2. EXECUTE — generate_image({ prompt }) NOW. No list_dir, read, or grep.
3. CONCLUSION — path under assets/generated/. Still images only. Never "I need tool access".`
  }
  return `SOUMTOK LOOP (do this sequence — do not skip to chat):
1. THINK — restated job in their words (internal).
2. PLAN — todo_write 2–5 steps for THIS request.
3. EXECUTE — JSON tools on SCAFFOLD / KNOWN FILES. Chat code is not a file.
4. RESULTS — terminal / read_terminal / browser / tests with evidence in tool output.
5. CONCLUSION — user-facing: what changed, paths, URL if any, what is left. Never "I'll do X" without a tool call.
This loop is for EVERY request in EVERY open folder — not one app, not one file.`
}

module.exports = {
  compact,
  isGeneralKnowledgeQuestion,
  userAskedToBuildSomething,
  userAskedForLocalhost,
  composeThinkFirstBrief,
  composeWorkLoopBrief,
}
