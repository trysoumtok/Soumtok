/**
 * Per-model harness — Cursor pattern: same tools for every model the user picks.
 * Family add-ons are extra steering, not extra capability. Claude, GPT, Grok, Gemini, DeepSeek all get write/terminal.
 */

export type ModelFamily = 'anthropic' | 'openai' | 'google' | 'xai' | 'deepseek' | 'generic'

const FORCE_TOOL_KINDS = new Set(['build', 'edit', 'fix', 'wipe', 'theme', 'rename', 'execute', 'run', 'image'])

export function modelFamilyFromId(model?: string): ModelFamily {
  const id = String(model || '').toLowerCase()
  if (/claude|anthropic|sonnet|opus|haiku/.test(id)) return 'anthropic'
  if (/gpt|openai|o3|o4|codex/.test(id)) return 'openai'
  if (/gemini|google/.test(id)) return 'google'
  if (/grok|xai/.test(id)) return 'xai'
  if (/deepseek/.test(id)) return 'deepseek'
  return 'generic'
}

const UNIVERSAL_CONTRACT = `MODEL CONTRACT (every model Soumtok routes — Claude, GPT, Grok, Gemini, DeepSeek, Auto):
- Function tools are the only way to change files or run commands. Markdown fences, XML <write>, and "I'll do X" are not writes.
- "go" / "yes" / "continue" after a plan = execute write() + terminal() now. Tools are ON. This is not a question.
- Build/create: write() files immediately (one list_dir max). Never stop at "I'll create the files". Then terminal(npm install) → start → read_terminal → URL.
- Browser/web/3d app: Vite + TypeScript under src/. Root is only package.json, tsconfig, vite.config, index.html, README. Do not scatter cube.js, server.js, or web/ at the repo root.
- On Windows PowerShell use ; between commands, not &&.
- Commands run via terminal() — results show in chat. Do not ask the user to open a terminal.
- Work loop: think (intent) → plan (todo_write if multi-step) → execute tools → verify → short conclusion for the user.
- Real repo: codebase_search(query) then read() hits. Do not list_dir the whole tree.
- After localhost is up: browser({ action: "snapshot" }) to see the page. Logs are not a screenshot.
- Git: git({ action: "status"|"diff"|"commit" }). Commit only if asked. read_skill("git-workflow") when needed.
- Never say tools are disabled or the terminal is sandboxed. Stay in the open folder.`

export function modelHarnessAddon(model?: string) {
  const family = modelFamilyFromId(model)
  const extra =
    family === 'deepseek'
      ? `\n- DeepSeek: never emit <write> XML. First BUILD round must be write(), not ls.`
      : family === 'openai'
        ? `\n- OpenAI: tight diff old_string/new_string. First build round is write(), not a plan.`
        : family === 'anthropic'
          ? `\n- Claude: keep calling tools until files exist, server is up, and browser snapshot is done.`
          : family === 'xai'
            ? `\n- Grok: use write/diff/terminal/browser; do not dump a spec as the only reply.`
            : family === 'google'
              ? `\n- Gemini: JSON tool calls only; chat code is not a file.`
              : ''
  return UNIVERSAL_CONTRACT + extra
}

/** Cursor pattern: user request is the last thing the model reads in system. */
export function appendLiveUserRequest(system: string, userText?: string) {
  const pin = String(userText || '').trim()
  const base = String(system || '')
    .replace(/\n*LIVE USER REQUEST \(highest priority[\s\S]*$/i, '')
    .trim()
  if (!pin) return base
  return `${base}\n\nLIVE USER REQUEST (highest priority — do this now):\n${pin}`
}

export function isHarnessUserText(text?: string) {
  return /^\[Soumtok harness\]/i.test(String(text || '').trim())
}

export function shouldForceToolChoice(input: {
  toolsEnabled?: boolean
  intent?: string
  model?: string
  hasToolMessages?: boolean
  hasWrites?: boolean
}) {
  if (!input.toolsEnabled) return false
  if (!FORCE_TOOL_KINDS.has(String(input.intent || ''))) return false
  if (input.hasWrites) return false
  return true
}
