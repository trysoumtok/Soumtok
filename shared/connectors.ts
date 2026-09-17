import { catalogPlugin, PLUGIN_CATALOG } from './plugins.ts'

export type ConnectorAuthMode = 'always' | 'when_asked' | 'none'
export type ConnectorOAuthClient = 'hosted' | 'dcr' | 'own'

export type CatalogConnector = {
  id: string
  name: string
  pluginId: string
  mcpUrl: string
  loginUrl: string
  popular?: boolean
}

const LOGIN_URL: Record<string, string> = {
  gmail: 'https://accounts.google.com/AccountChooser?continue=https://mail.google.com/',
  'google-drive': 'https://accounts.google.com/AccountChooser?continue=https://drive.google.com/',
  'google-calendar': 'https://accounts.google.com/AccountChooser?continue=https://calendar.google.com/',
  slack: 'https://slack.com/signin',
  notion: 'https://www.notion.so/login',
  figma: 'https://www.figma.com/login',
  github: 'https://github.com/login',
  linear: 'https://linear.app/login',
  sentry: 'https://sentry.io/auth/login/',
  stripe: 'https://dashboard.stripe.com/login',
  postman: 'https://identity.getpostman.com/login',
  granola: 'https://notes.granola.ai',
  datadog: 'https://app.datadoghq.com/account/login',
  firebase: 'https://accounts.google.com/AccountChooser?continue=https://console.firebase.google.com/',
  neon: 'https://console.neon.tech/login',
  supabase: 'https://supabase.com/dashboard/sign-in',
  cloudflare: 'https://dash.cloudflare.com/login',
  vercel: 'https://vercel.com/login',
  huggingface: 'https://huggingface.co/login',
  higgsfield: 'https://higgsfield.ai/mcp',
  canva: 'https://www.canva.com/login',
  atlassian: 'https://id.atlassian.com/login',
  gitlab: 'https://gitlab.com/users/sign_in',
  hubspot: 'https://app.hubspot.com/login',
  asana: 'https://app.asana.com/-/login',
  context7: 'https://context7.com',
  salesforce: 'https://login.salesforce.com',
}

export function connectorLoginUrl(pluginId: string) {
  return LOGIN_URL[pluginId] || catalogPlugin(pluginId)?.signupUrl || ''
}

export const POPULAR_CONNECTOR_IDS = ['gmail', 'google-drive', 'slack'] as const
export const FREE_CONNECTOR_LIMIT = 1

export const CONNECTOR_CATALOG: CatalogConnector[] = PLUGIN_CATALOG.filter((item) => item.mcps.length > 0).map((item) => ({
  id: item.id,
  name: item.name,
  pluginId: item.id,
  mcpUrl: item.mcps[0].url,
  loginUrl: connectorLoginUrl(item.id),
  popular: (POPULAR_CONNECTOR_IDS as readonly string[]).includes(item.id),
}))

export function catalogConnector(id: string) {
  return CONNECTOR_CATALOG.find((item) => item.id === id) || null
}

export function connectorConnectPath(slug: string) {
  return `/dashboard/connectors/${slug}`
}

export function defaultAuthMode(needsAuth: boolean): ConnectorAuthMode {
  return needsAuth ? 'always' : 'none'
}

export function connectorSignupUrl(pluginId: string) {
  return catalogPlugin(pluginId)?.signupUrl || ''
}

export type McpConnectorRef = {
  id?: string
  name?: string
  plugin_id?: string | null
  pluginId?: string | null
  slug?: string | null
  connected?: boolean
  mcpUrl?: string | null
  tools?: { name?: string; description?: string }[]
}

export function normalizeConnectorKey(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function connectorKeys(c: McpConnectorRef) {
  return [c.id, c.name, c.plugin_id, c.pluginId, c.slug]
    .map((k) => normalizeConnectorKey(String(k || '')))
    .filter(Boolean)
}

function scoreConnectorMatch(c: McpConnectorRef, want: string) {
  const keys = connectorKeys(c)
  if (!keys.length || !want) return 0
  let score = 0
  for (const key of keys) {
    if (key === want) score = Math.max(score, 100)
    else if (key.includes(want) || want.includes(key)) score = Math.max(score, 70)
    else {
      const parts = want.split(/[\s/_-]+/).filter((p) => p.length > 2)
      if (parts.some((part) => key.includes(part))) score = Math.max(score, 45)
    }
  }
  return score
}

/** Match mcp({ server }) by id, display name, or catalog plugin_id (e.g. "figma" → Figma). */
export function resolveMcpConnector(
  connectors: McpConnectorRef[] | null | undefined,
  server: string,
): McpConnectorRef | null {
  const want = normalizeConnectorKey(server)
  if (!want || !Array.isArray(connectors)) return null
  const ranked = connectors
    .map((c) => ({ c, score: scoreConnectorMatch(c, want) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
  return ranked[0]?.c || null
}
