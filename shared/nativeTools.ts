import type { StudioTool } from './tools.ts'

export type NativeToolCall = {
  id: string
  name: string
  arguments: string
}

const STR = { type: 'string' as const }

const parameters = (properties: Record<string, { type: string; description: string }>, required: string[] = []) => ({
  type: 'object' as const,
  properties,
  required,
  additionalProperties: true,
})

export const STUDIO_FUNCTIONS = [
  {
    name: 'read',
    description:
      'Read a file from the current Studio workspace. Misspelled paths still resolve when the match is unique. For a long file, pass start_line/end_line to page through it instead of re-reading the whole thing.',
    parameters: parameters(
      {
        path: { ...STR, description: 'Workspace path, e.g. src/App.tsx' },
        start_line: { ...STR, description: 'Optional 1-based first line to return' },
        end_line: { ...STR, description: 'Optional 1-based last line to return' },
      },
      ['path'],
    ),
  },
  {
    name: 'grep',
    description: 'Search workspace files for a pattern.',
    parameters: parameters({
      pattern: { ...STR, description: 'Regex or text to find' },
      glob: { ...STR, description: 'Optional path fragment to limit the search' },
    }, ['pattern']),
  },
  {
    name: 'glob',
    description: 'Find workspace paths matching a glob (e.g. **/*.tsx, src/**/*.ts).',
    parameters: parameters({
      pattern: { ...STR, description: 'Glob pattern relative to workspace root' },
    }, ['pattern']),
  },
  {
    name: 'list_dir',
    description: 'List files and folders at a path relative to the workspace root.',
    parameters: parameters({
      path: { ...STR, description: 'Relative directory path, e.g. src or apps/web (default .)' },
    }),
  },
  {
    name: 'write',
    description:
      'Create or replace a file on disk. Required for new files. Chat XML, markdown fences, and <write> tags do not create files — you must call this tool.',
    parameters: parameters({
      path: { ...STR, description: 'Workspace path' },
      content: { ...STR, description: 'Full file contents' },
    }, ['path', 'content']),
  },
  {
    name: 'diff',
    description:
      'Edit an existing workspace file. Pass old_string and new_string, or content for a full replacement. Do not call diff with only added/removed counts. New files must use write. Chat {"kind":"diff"} events do not change files.',
    parameters: parameters({
      path: { ...STR, description: 'Workspace path' },
      old_string: { ...STR, description: 'Exact text to find in the file' },
      new_string: { ...STR, description: 'Replacement text' },
      content: { ...STR, description: 'Optional full file contents instead of search/replace' },
    }, ['path']),
  },
  {
    name: 'terminal',
    description:
      'Run a shell command in the workspace (Studio sandbox: node, python, npm test, git, etc.). On Soumtok Desktop IDE this runs on the user\'s real machine — see read_terminal in tool list for integrated Terminal.',
    parameters: parameters(
      {
        command: { ...STR, description: 'The exact command' },
        cwd: { ...STR, description: 'Optional subdirectory relative to the workspace (use instead of cd)' },
        timeout: { ...STR, description: 'Optional timeout in milliseconds' },
      },
      ['command'],
    ),
  },
  {
    name: 'read_terminal',
    description:
      'Read captured output from Soumtok integrated Terminal on the user PC (ANSI stripped; includes URL/Ready summary). Use after terminal() starts dev servers; wait_ms 15000–25000 for Next.js. Do not read *-run.log or probe.txt instead.',
    parameters: parameters({
      wait_ms: { ...STR, description: 'Optional milliseconds to wait for new output (max 45000)' },
      tail: { ...STR, description: 'Optional max characters of log tail' },
    }),
  },
  {
    name: 'read_lints',
    description: 'Run lint or TypeScript check on paths (eslint/npm run lint or tsc --noEmit).',
    parameters: parameters({
      paths: { ...STR, description: 'Optional comma-separated paths or files to check' },
    }),
  },
  {
    name: 'task',
    description:
      'Launch a Soumtok subagent (like Cursor Task). subagent_type: explore (read-only codebase search) or generalPurpose (full tools). Returns a report for you to continue.',
    parameters: parameters({
      description: { ...STR, description: 'Short title (3–5 words)' },
      prompt: { ...STR, description: 'Detailed task — subagent does not see prior chat' },
      subagent_type: { ...STR, description: 'explore or generalPurpose' },
    }, ['prompt', 'description']),
  },
  {
    name: 'github',
    description: 'Clone the attached GitHub repository (or args.repo) into the workspace.',
    parameters: parameters({
      action: { ...STR, description: 'Use clone' },
      repo: { ...STR, description: 'owner/name if not already attached' },
    }),
  },
  {
    name: 'fetch',
    description:
      'Fetch a public https page, SVG, or look up a query. For brand logos use https://cdn.simpleicons.org/{slug} or https://cdn.jsdelivr.net/npm/simple-icons/icons/{slug}.svg — keep the raw SVG markup.',
    parameters: parameters({
      url: { ...STR, description: 'https URL' },
      query: { ...STR, description: 'Search query if no URL' },
    }),
  },
  {
    name: 'mcp',
    description:
      'Call a connected MCP server tool (GitHub, Figma, Neon, Slack, …). Results are saved under mcp-exports/ in the project. Connect services in the Connectors side bar (company logo → Connect).',
    parameters: parameters({
      server: { ...STR, description: 'Connector name, e.g. GitHub or Neon' },
      tool: { ...STR, description: 'MCP tool name' },
    }, ['server', 'tool']),
  },
  {
    name: 'generate_image',
    description:
      'Generate a still image with Flux 2 Max (no video, no music) and save it into the project. Use when they asked to generate/create/draw an image even if that is misspelled (genera, iamge, egale). Default path assets/generated/. Default aspect 1:1; pass aspect if they asked 16:9, 9:16, 4:3.',
    parameters: parameters(
      {
        prompt: { ...STR, description: 'What to draw. Do not include the ratio in this string — put that in aspect.' },
        aspect: { ...STR, description: 'Aspect ratio. Default 1:1. Allowed: 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3.' },
        path: { ...STR, description: 'Optional workspace path ending in .png .jpg or .webp' },
      },
      ['prompt'],
    ),
  },
  {
    name: 'examine_media',
    description:
      'Look at an image or video already on disk (workspace path) or a data URL. Returns a detailed description the coding model can use. Does not generate video or music.',
    parameters: parameters(
      {
        path: { ...STR, description: 'Workspace path to a .png .jpg .webp .gif .mp4 .webm .mov' },
        prompt: { ...STR, description: 'Optional question, e.g. what is broken in this screenshot' },
      },
      ['path'],
    ),
  },
  {
    name: 'delete',
    description: 'Delete a file or folder in the workspace (recursive for directories).',
    parameters: parameters({ path: { ...STR, description: 'Workspace-relative path' } }, ['path']),
  },
  {
    name: 'wipe_workspace',
    description:
      'Remove ALL files and folders in the workspace root when the user asked to delete/clear the whole project. Keeps .git by default.',
    parameters: parameters({
      keep_git: { ...STR, description: 'true to keep .git (default true)' },
    }),
  },
  {
    name: 'ask_question',
    description:
      'Ask the user clarifying questions with multiple-choice options. Execution pauses until they answer. Use when requirements are ambiguous.',
    parameters: parameters({
      title: { ...STR, description: 'Short title for the question card' },
      intro: { ...STR, description: 'Optional intro sentence' },
      questions: {
        ...STR,
        description:
          'JSON array of { id, prompt, options: [{ id, label }], allowMultiple?: boolean, allowCustom?: boolean }',
      },
    }, ['questions']),
  },
  {
    name: 'switch_mode',
    description: 'Request switching agent mode (plan or agent). User may approve in UI.',
    parameters: parameters({
      target_mode_id: { ...STR, description: 'plan or agent' },
      explanation: { ...STR, description: 'Why switch' },
    }, ['target_mode_id']),
  },
  {
    name: 'todo_write',
    description: 'Update structured todos shown in the agent UI (Cursor-style task list).',
    parameters: parameters({
      merge: { ...STR, description: 'true to merge by id, false to replace' },
      todos: { ...STR, description: 'JSON array of {id, content, status}' },
    }, ['todos']),
  },
  {
    name: 'git',
    description:
      'Git in the open folder: status (default), diff, log, branch, show, commit. Prefer this over terminal("git …"). commit only when the user asked to commit.',
    parameters: parameters({
      action: { ...STR, description: 'status | diff | log | branch | show | commit' },
      path: { ...STR, description: 'Optional path for diff' },
      message: { ...STR, description: 'Commit message (commit action)' },
      staged: { ...STR, description: 'true for staged diff' },
      max: { ...STR, description: 'Max log entries' },
      rev: { ...STR, description: 'Rev for show' },
    }),
  },
  {
    name: 'codebase_search',
    description:
      'Search the repo by meaning (identifiers, paths, comments) — not only exact grep. Use on real codebases before scattering new files.',
    parameters: parameters({
      query: { ...STR, description: 'What you are looking for, in words' },
    }, ['query']),
  },
  {
    name: 'browser',
    description:
      'Open localhost or https, snapshot the page (visible text + screenshot + console + failed network), click or type. Use after npm run dev to SEE the UI — terminal logs are not a screenshot.',
    parameters: parameters({
      action: { ...STR, description: 'snapshot (default) | navigate | click | type' },
      url: { ...STR, description: 'http://localhost:PORT or https URL' },
      selector: { ...STR, description: 'CSS selector for click/type' },
      text: { ...STR, description: 'Text to type into selector' },
    }),
  },
  {
    name: 'read_skill',
    description: 'Load the full SKILL.md body for a named skill from the catalog (git-workflow, verify-ui, codebase-search, plugins-mcp, or project skills).',
    parameters: parameters({
      name: { ...STR, description: 'Skill name from the SKILLS catalog' },
    }, ['name']),
  },
  {
    name: 'attempt_completion',
    description:
      'Call when the user request is actually done, with a short result. Requires tool evidence already in this turn (successful write/diff, tests, or localhost). A correct "nothing to change" also uses this instead of saying done in prose.',
    parameters: parameters({
      result: { ...STR, description: 'What was verified on disk or why nothing needed changing' },
    }, ['result']),
  },
] as const

const DESKTOP_TERMINAL_DESCRIPTION =
  'Run a command in Soumtok integrated Terminal on the user\'s real PC (full local shell in the project folder: npm, node, npx, git, installs, dev servers, port cleanup scripts). Output is captured automatically — use read_terminal(wait_ms) after npm run dev or slow commands. You MUST use this yourself; never tell the user to open cmd/PowerShell unless the tool returns "Command blocked".'

export function studioFunctionsForNames(names?: string[]) {
  const set = new Set(names || [])
  const desktop = set.has('read_terminal')
  let list = !names?.length ? [...STUDIO_FUNCTIONS] : STUDIO_FUNCTIONS.filter((item) => set.has(item.name))
  if (desktop) {
    if (!list.some((item) => item.name === 'read_terminal')) {
      list = [...list, STUDIO_FUNCTIONS.find((item) => item.name === 'read_terminal')!]
    }
    list = list.map((item) =>
      item.name === 'terminal' ? { ...item, description: DESKTOP_TERMINAL_DESCRIPTION } : item,
    )
  }
  return list
}

export function openaiStudioTools(names?: string[]) {
  return studioFunctionsForNames(names).map((item) => ({ type: 'function' as const, function: item }))
}

export function responsesStudioTools(names?: string[]) {
  return studioFunctionsForNames(names).map((item) => ({
    type: 'function' as const,
    name: item.name,
    description: item.description,
    parameters: item.parameters,
  }))
}

export function anthropicStudioTools(names?: string[]) {
  return studioFunctionsForNames(names).map((item) => ({
    name: item.name,
    description: item.description,
    input_schema: item.parameters,
  }))
}

export function argsFromToolJson(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw || '{}') as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { input: raw }
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]),
    )
  } catch {
    return { input: raw }
  }
}

export function studioToolsFromNative(calls: NativeToolCall[]): StudioTool[] {
  return calls
    .filter((item) => item.name)
    .slice(0, 12)
    .map((item) => ({
      kind: 'tool' as const,
      name: item.name,
      args: argsFromToolJson(item.arguments),
      id: item.id,
    }))
}

export function openaiToolCalls(calls: NativeToolCall[]) {
  return calls.map((item) => ({
    id: item.id,
    type: 'function' as const,
    function: { name: item.name, arguments: item.arguments || '{}' },
  }))
}
