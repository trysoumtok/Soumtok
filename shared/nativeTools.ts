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
    description: 'Read a file from the current Studio workspace.',
    parameters: parameters({ path: { ...STR, description: 'Workspace path, e.g. src/App.tsx' } }, ['path']),
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
    name: 'write',
    description: 'Write or replace a workspace file.',
    parameters: parameters({
      path: { ...STR, description: 'Workspace path' },
      content: { ...STR, description: 'Full file contents' },
    }, ['path', 'content']),
  },
  {
    name: 'terminal',
    description: 'Run an allowed sandbox command: node, python, npm install/ci/test, npx tsc, git status/log/diff/add/commit/push, ls, cat, echo.',
    parameters: parameters({ command: { ...STR, description: 'The exact command' } }, ['command']),
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
    description: 'Fetch a public https page or look up a query.',
    parameters: parameters({
      url: { ...STR, description: 'https URL' },
      query: { ...STR, description: 'Search query if no URL' },
    }),
  },
  {
    name: 'mcp',
    description: 'Call a connected MCP server tool.',
    parameters: parameters({
      server: { ...STR, description: 'Connector name, e.g. GitHub or Neon' },
      tool: { ...STR, description: 'MCP tool name' },
    }, ['server', 'tool']),
  },
] as const

export function openaiStudioTools() {
  return STUDIO_FUNCTIONS.map((item) => ({ type: 'function' as const, function: item }))
}

export function responsesStudioTools() {
  return STUDIO_FUNCTIONS.map((item) => ({
    type: 'function' as const,
    name: item.name,
    description: item.description,
    parameters: item.parameters,
  }))
}

export function anthropicStudioTools() {
  return STUDIO_FUNCTIONS.map((item) => ({
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
    .slice(0, 8)
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
