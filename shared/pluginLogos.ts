/** Plugin / MCP logo URLs — same resolution order as Soumtok Desktop. */
import { catalogPlugin } from './plugins.ts'

export const PLUGIN_LOGO_SKIP_SIMPLE = new Set([
  'neon',
  'canva',
  'salesforce',
  'context7',
  'huggingface',
  'higgsfield',
])

export const PLUGIN_LOGO_FILL = new Set(['canva', 'context7', 'neon', 'higgsfield', 'huggingface'])

/** Colorful brand marks — show full tile on white (Figma, Notion, …). */
export const PLUGIN_LOGO_COLOR_BRAND = new Set([
  'figma',
  'notion',
  'slack',
  'stripe',
  'github',
  'linear',
  'sentry',
  'postman',
  'granola',
  'datadog',
  'gmail',
  'google-drive',
  'google-calendar',
])

export const OFFICIAL_COMPANY_LOGOS: Record<string, string> = {
  datadog: 'https://cdn.simpleicons.org/datadog/632CA6',
  linear: 'https://cdn.simpleicons.org/linear/5E6AD2',
  higgsfield: 'https://higgsfield.ai/icon.png',
  canva: 'https://static.canva.com/static/images/android-192x192-2.png',
  huggingface: 'https://huggingface.co/front/assets/huggingface_logo-noborder.svg',
  context7: 'https://context7.com/brand/context7-icon-dark.svg',
  salesforce: 'https://a.sfdcstatic.com/shared/images/c360-nav/salesforce-no-type-logo.svg',
  neon: 'https://neon.com/brand/neon-logomark-dark-color.svg',
  hubspot: 'https://www.hubspot.com/hubfs/HubSpot_Logos/HubSpot-Inversed-Favicon.png',
}

/** Dark marks on dark UI need invert or a white tile. */
export function platformIconNeedsMono(url: string) {
  const u = String(url || '').toLowerCase()
  if (!u) return false
  if (/\/logos\/plugins\//.test(u)) return false
  if (/simpleicons\.org|logo-dark|icon-dark|noborder\.svg|inversed|inverse|monochrome|\/dark[\./-]/.test(u)) {
    return true
  }
  if (/\.svg(\?|$)/.test(u) && !/color|brand|favicon|\.png|higgsfield|canva|hubspot|figma|notion|slack/.test(u)) {
    return true
  }
  return false
}

export function pluginLogoCandidates(id: string, catalogLogo?: string | null) {
  const slug = String(id || 'custom').trim()
  const chain: string[] = []
  const logo = catalogLogo?.trim() || ''
  if (/^https?:\/\//i.test(logo)) chain.push(logo)
  const official = OFFICIAL_COMPANY_LOGOS[slug]
  if (official) chain.push(official)
  if (logo && !/^https?:\/\//i.test(logo)) chain.push(logo)
  chain.push(`/logos/plugins/${encodeURIComponent(slug)}.svg`)
  chain.push(`/logos/plugins/${encodeURIComponent(slug)}.png`)
  if (!PLUGIN_LOGO_SKIP_SIMPLE.has(slug)) {
    chain.push(`https://cdn.simpleicons.org/${encodeURIComponent(slug)}`)
  }
  return [...new Set(chain.filter(Boolean))]
}

export function pluginLogoCandidatesForId(id: string) {
  return pluginLogoCandidates(id, catalogPlugin(id)?.logo)
}

export function resolvePluginLogoUrls(id: string, baseOrigin: string, catalogLogo?: string | null) {
  const origin = String(baseOrigin || '').replace(/\/$/, '')
  return pluginLogoCandidates(id, catalogLogo ?? catalogPlugin(id)?.logo).map((url) =>
    /^https?:\/\//i.test(url) ? url : `${origin}${url.startsWith('/') ? url : `/${url}`}`,
  )
}

export function primaryPluginLogoUrl(id: string, baseOrigin: string) {
  return resolvePluginLogoUrls(id, baseOrigin)[0] || null
}
