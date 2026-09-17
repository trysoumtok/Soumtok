/**
 * Soumtok Bot — automation driver inside Soumtok Desktop and Studio.
 * Users switch between IDE Agent (pair-programming) and Soumtok Bot (finish-the-work).
 */

export type AgentDriver = 'ide' | 'bot'

export const AGENT_DRIVER_LABELS: Record<AgentDriver, string> = {
  ide: 'IDE Agent',
  bot: 'Soumtok Bot',
}

export const SOUMTOK_BOT_RULES = `SOUMTOK BOT (active driver — you are the bot, not a passive chat assistant):
- You live inside Soumtok on the user's machine. Automate their work end-to-end: search the repo, edit files, run allowed commands, verify, then report what shipped.
- Default to action. Use read/grep/list_dir, then write/diff/terminal in the same turn flow. Do not stop after "I will…" or ask permission for normal edits they already requested.
- Ask at most one clarifying question only when a missing fact blocks all progress (e.g. no folder open, ambiguous destructive command). Otherwise pick sensible defaults and continue.
- Keep going across tool rounds until the task is done or you hit a hard blocker. Prefer npm test / npx tsc / git status when that proves the fix.
- Stay surgical: change only what the task needs. Do not rewrite unrelated files, rebrand the project, or refactor for style unless they asked.
- Summarize in past tense: which files changed and what the user can do next (run, refresh preview, commit).`

export function soumtokBotPlatformBrief(driver: AgentDriver) {
  if (driver !== 'bot') return ''
  return `DRIVER: Soumtok Bot — automation mode. The user switched from IDE Agent to the bot so you would finish work, not chat about it.`
}

export function soumtokBotStudioContext(driver: AgentDriver) {
  if (driver !== 'bot') return ''
  return [soumtokBotPlatformBrief('bot'), SOUMTOK_BOT_RULES].join('\n\n')
}

export function soumtokBotDesktopExtra(driver: AgentDriver) {
  if (driver !== 'bot') return ''
  return [soumtokBotPlatformBrief('bot'), SOUMTOK_BOT_RULES].join('\n\n')
}

export function botMaxToolRounds(driver: AgentDriver, defaultRounds = 42) {
  return driver === 'bot' ? Math.max(defaultRounds, 48) : defaultRounds
}

export function parseAgentDriver(_raw: unknown): AgentDriver {
  return 'ide'
}

export const AGENT_DRIVER_STORAGE_KEY = 'soumtok-agent-driver'

export function readStoredAgentDriver(): AgentDriver {
  try {
    return parseAgentDriver(localStorage.getItem(AGENT_DRIVER_STORAGE_KEY))
  } catch {
    return 'ide'
  }
}

export function writeStoredAgentDriver(_driver: AgentDriver) {
  try {
    localStorage.setItem(AGENT_DRIVER_STORAGE_KEY, 'ide')
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('soumtok-agent-driver', { detail: 'ide' }))
  }
}
