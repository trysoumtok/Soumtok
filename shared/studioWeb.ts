/** Web Studio agent runtime — browser sandbox, no integrated terminal. */

export type AgentRuntime = 'desktop' | 'studio-web'

export function parseAgentRuntime(raw: unknown, workspaceRoot?: string): AgentRuntime {
  if (raw === 'studio-web' || raw === 'studio') return 'studio-web'
  const root = String(workspaceRoot || '').trim().toLowerCase()
  if (root === 'studio-sandbox') return 'studio-web'
  return 'desktop'
}

export const STUDIO_WEB_EXCLUDED_TOOLS = new Set(['read_terminal', 'browser'])

export function studioWebToolNames(names: string[]) {
  return names.filter((name) => !STUDIO_WEB_EXCLUDED_TOOLS.has(name))
}

export const STUDIO_WEB_AGENT_RULES = `WEB STUDIO (browser — not Desktop IDE):
- Preview panel on the right updates automatically when you write index.html plus linked CSS/JS. The user sees it there — do NOT run python -m http.server, npm run dev, or start /b … to "serve" static HTML.
- read_terminal and browser are NOT available. Never call them.
- terminal() is only for one-shot checks: npm test, npx tsc, node -e "…", npm install. Dev servers time out in the sandbox and are unnecessary for static pages.
- After write() for index.html, style.css, script.js — call attempt_completion with a detailed result (what you built, main sections, assets). The Preview panel is the verification.
- Tell the user they can open Files → Save to folder to download the project to their PC.`
