/**
 * MCP marketplace: official remote servers people actually connect today.
 * One card per MCP URL. Tools appear after Connect.
 */

const HIGGSFIELD_MCP = 'https://mcp.higgsfield.ai/mcp'
const HIGGSFIELD_LOGIN = 'https://higgsfield.ai/mcp'
const HIGGSFIELD_LOGO = 'https://higgsfield.ai/icon.png'

/** Company-hosted marks — same pattern as Higgsfield's own icon.png. */
const OFFICIAL_LOGOS = {
  higgsfield: HIGGSFIELD_LOGO,
  canva: 'https://static.canva.com/static/images/android-192x192-2.png',
  huggingface: 'https://huggingface.co/front/assets/huggingface_logo-noborder.svg',
  context7: 'https://context7.com/brand/context7-icon-dark.svg',
  salesforce: 'https://a.sfdcstatic.com/shared/images/c360-nav/salesforce-no-type-logo.svg',
  neon: 'https://neon.com/brand/neon-logomark-dark-color.svg',
  hubspot: 'https://www.hubspot.com/hubfs/HubSpot_Logos/HubSpot-Inversed-Favicon.png',
}

/** Remote MCPs in heavy use in 2026 (Cursor, Claude, ChatGPT, VS Code). */
const TRENDING_REMOTE = [
  { id: 'github', name: 'GitHub', mcpUrl: 'https://api.githubcopilot.com/mcp/', loginUrl: 'https://github.com/login', pluginId: 'github' },
  { id: 'figma', name: 'Figma', mcpUrl: 'https://mcp.figma.com/mcp', loginUrl: 'https://www.figma.com/login', pluginId: 'figma' },
  { id: 'notion', name: 'Notion', mcpUrl: 'https://mcp.notion.com/mcp', loginUrl: 'https://www.notion.so/login', pluginId: 'notion' },
  { id: 'linear', name: 'Linear', mcpUrl: 'https://mcp.linear.app/mcp', loginUrl: 'https://linear.app/login', pluginId: 'linear' },
  { id: 'stripe', name: 'Stripe', mcpUrl: 'https://mcp.stripe.com', loginUrl: 'https://dashboard.stripe.com/login', pluginId: 'stripe' },
  { id: 'supabase', name: 'Supabase', mcpUrl: 'https://mcp.supabase.com/mcp', loginUrl: 'https://supabase.com/dashboard/sign-in', pluginId: 'supabase' },
  { id: 'vercel', name: 'Vercel', mcpUrl: 'https://mcp.vercel.com', loginUrl: 'https://vercel.com/login', pluginId: 'vercel' },
  { id: 'cloudflare', name: 'Cloudflare', mcpUrl: 'https://mcp.cloudflare.com/mcp', loginUrl: 'https://dash.cloudflare.com/login', pluginId: 'cloudflare' },
  { id: 'sentry', name: 'Sentry', mcpUrl: 'https://mcp.sentry.dev/mcp', loginUrl: 'https://sentry.io/auth/login/', pluginId: 'sentry' },
  { id: 'huggingface', name: 'Hugging Face', mcpUrl: 'https://huggingface.co/mcp', loginUrl: 'https://huggingface.co/login', pluginId: 'huggingface' },
  { id: 'canva', name: 'Canva', mcpUrl: 'https://mcp.canva.com/mcp', loginUrl: 'https://www.canva.com/login', pluginId: 'canva' },
  { id: 'atlassian', name: 'Atlassian', mcpUrl: 'https://mcp.atlassian.com/v2/mcp', loginUrl: 'https://id.atlassian.com/login', pluginId: 'atlassian' },
  { id: 'gitlab', name: 'GitLab', mcpUrl: 'https://gitlab.com/api/v4/mcp', loginUrl: 'https://gitlab.com/users/sign_in', pluginId: 'gitlab' },
  { id: 'hubspot', name: 'HubSpot', mcpUrl: 'https://mcp.hubspot.com', loginUrl: 'https://app.hubspot.com/login', pluginId: 'hubspot' },
  { id: 'asana', name: 'Asana', mcpUrl: 'https://mcp.asana.com/v2/mcp', loginUrl: 'https://app.asana.com/-/login', pluginId: 'asana' },
  { id: 'context7', name: 'Context7', mcpUrl: 'https://mcp.context7.com/mcp', loginUrl: 'https://context7.com', pluginId: 'context7' },
  { id: 'salesforce', name: 'Salesforce', mcpUrl: 'https://mcp.salesforce.com/mcp', loginUrl: 'https://login.salesforce.com', pluginId: 'salesforce' },
  { id: 'neon', name: 'Neon', mcpUrl: 'https://mcp.neon.tech/mcp', loginUrl: 'https://console.neon.tech/login', pluginId: 'neon' },
]

function card({
  id,
  name,
  mcpUrl,
  loginUrl = '',
  description = '',
  logo = '',
  source = 'catalog',
  likes = 0,
  badge = '',
  pluginId = '',
  kind = '',
}) {
  return {
    id: String(id || ''),
    name: String(name || id || 'MCP'),
    mcpUrl: String(mcpUrl || ''),
    loginUrl: String(loginUrl || ''),
    description: String(description || ''),
    logo: String(logo || ''),
    source,
    likes: Number(likes) || 0,
    badge: String(badge || ''),
    pluginId: String(pluginId || ''),
    kind: String(kind || ''),
  }
}

function logoFor(pluginId) {
  const id = String(pluginId || '')
  if (OFFICIAL_LOGOS[id]) return OFFICIAL_LOGOS[id]
  return `/logos/plugins/${id}.svg`
}

function higgsfieldOfficial() {
  return card({
    id: 'higgsfield',
    name: 'Higgsfield',
    mcpUrl: HIGGSFIELD_MCP,
    loginUrl: HIGGSFIELD_LOGIN,
    description: '',
    logo: HIGGSFIELD_LOGO,
    source: 'catalog',
    pluginId: 'higgsfield',
  })
}

function trendingCard(item) {
  return card({
    id: item.id,
    name: item.name,
    mcpUrl: item.mcpUrl,
    loginUrl: item.loginUrl || '',
    description: '',
    logo: logoFor(item.pluginId || item.id),
    source: 'catalog',
    pluginId: item.pluginId || item.id,
    badge: 'Trending',
  })
}

function catalogCards(catalogFromApi) {
  const rows = Array.isArray(catalogFromApi) ? catalogFromApi : []
  return rows
    .filter((item) => item.id !== 'higgsfield' && item.pluginId !== 'higgsfield')
    .map((item) =>
      card({
        id: item.id,
        name: item.name,
        mcpUrl: item.mcpUrl,
        loginUrl: item.loginUrl || '',
        description: '',
        logo: logoFor(item.pluginId || item.id),
        source: 'catalog',
        likes: item.popular ? 10_000 : 100,
        badge: item.popular ? 'Popular' : 'Catalog',
        pluginId: item.pluginId || item.id,
      }),
    )
}

function matchQuery(row, q) {
  if (!q) return true
  const blob = `${row.name} ${row.id} ${row.mcpUrl} ${row.pluginId}`.toLowerCase()
  return blob.includes(q)
}

function mergeTrending(catalog) {
  const byId = new Map()
  for (const item of TRENDING_REMOTE) byId.set(item.id, trendingCard(item))
  for (const row of catalog) {
    if (byId.has(row.id)) byId.set(row.id, { ...byId.get(row.id), ...row, description: '', badge: 'Trending' })
  }
  return [...byId.values()]
}

async function loadMcpMarketplace(query = '', catalogFromApi = []) {
  const q = String(query || '').trim().toLowerCase()
  const catalog = catalogCards(catalogFromApi).filter((row) => matchQuery(row, q))
  const official = higgsfieldOfficial()
  const trending = mergeTrending(catalogCards(catalogFromApi)).filter((row) => matchQuery(row, q))
  const trendingIds = new Set(trending.map((row) => row.id))
  const rest = catalog.filter((row) => !trendingIds.has(row.id))
  return {
    catalog: rest,
    trending,
    higgsfield: !q || matchQuery(official, q) ? official : null,
    query: q,
  }
}

module.exports = {
  HIGGSFIELD_MCP,
  HIGGSFIELD_LOGO,
  OFFICIAL_LOGOS,
  TRENDING_REMOTE,
  higgsfieldOfficial,
  loadMcpMarketplace,
}
