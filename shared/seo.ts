export const SITE_URL = 'https://soumtok.com'
export const SITE_NAME = 'Soumtok'
export const SITE_TAGLINE = "Africa's #1 AI coding platform"
export const SITE_TITLE = "Africa's #1 AI Coding Platform from $13.99 | Soumtok"
export const SITE_DESCRIPTION =
  "The most affordable powerful AI coding platform in Africa. Start coding from $13.99 a month — agents, GitHub, frontier models. Built in Nairobi."
export const SITE_IMAGE = '/og.jpg'
export const SITE_IMAGE_ALT = "Soumtok — Africa's #1 AI coding platform. Start from $13.99."
export const SITE_EMAIL = 'support@soumtok.com'
export const SITE_GITHUB = 'https://github.com/Soumtok'
export const SITE_LOCALE = 'en_KE'
export const SITE_THEME = '#0b0b0a'

export const FAQ = [
  {
    q: 'What is the cheapest AI coding platform in Africa?',
    a: 'Soumtok. Trial is free. Pro starts at $13.99 a month — less than the $20 desks — with frontier models, GitHub, and a coding agent that ships. Built in Nairobi.',
  },
  {
    q: 'Is Soumtok Africa’s #1 coding platform?',
    a: 'Soumtok is Africa’s #1 AI coding platform: Studio in the browser, cloud agents that open pull requests, and pricing built for builders here.',
  },
  {
    q: 'How much does it cost to start coding with an AI agent?',
    a: 'Open Studio free on Trial. Upgrade to Pro at $13.99 a month when you want daily coding, premium models, and cloud agents.',
  },
  {
    q: 'Is there a cheaper alternative to Cursor?',
    a: 'Soumtok is a full coding agent at $13.99 a month. Same job — attach a repo, pick a model, hand the work over — without the $20 bill.',
  },
  {
    q: 'Best AI coding agent for Kenya and African developers?',
    a: 'Soumtok. Nairobi-built, M-Pesa and PayPal at checkout, GitHub as the source of truth, and an agent that writes against your repos.',
  },
] as const

export type SeoPage = {
  title: string
  description: string
  path: string
  image?: string
  imageAlt?: string
  type?: 'website' | 'article' | 'profile'
  noindex?: boolean
}

const DOC_PAGES: { id: string; title: string; description: string }[] = [
  {
    id: 'overview',
    title: 'Docs',
    description: "Africa's #1 AI coding platform. Studio, GitHub, models, and how the desk works.",
  },
  {
    id: 'quick-start',
    title: 'Quick start',
    description: 'Create an account, finish onboarding, open Studio, and ship your first chat on Soumtok.',
  },
  {
    id: 'accounts',
    title: 'Accounts',
    description: 'Sign up with Google, GitHub, or email. Sessions, verification, and how Soumtok accounts work.',
  },
  {
    id: 'profile',
    title: 'Handle & public profile',
    description: 'Claim a handle people can find. Public profiles, reserved paths, and privacy on Soumtok.',
  },
  {
    id: 'studio',
    title: 'Studio chat',
    description: 'Studio is the desk. Attach GitHub, pick a model, add skills, and hand the work to the agent.',
  },
  {
    id: 'models',
    title: 'Models',
    description: 'DeepSeek, Gemini, Claude, Grok, and GPT in one picker. Bring your own keys when you want.',
  },
  {
    id: 'codebase',
    title: 'Codebase',
    description: 'Grant GitHub repos, attach a project to chat, and keep GitHub as the source of truth.',
  },
  {
    id: 'automations',
    title: 'Automations',
    description: 'Recurring Studio jobs on a repo — triggers, tools, and spend, without leaving Soumtok.',
  },
  {
    id: 'agents',
    title: 'Cloud agents',
    description: 'Cloud agents open a branch and a pull request on GitHub. The contract is a PR, not a zip.',
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Overview, usage, members, billing, and the rest of the workspace around Studio.',
  },
  {
    id: 'github',
    title: 'GitHub',
    description: 'Connect the Soumtok GitHub App, grant repos, and let agents open pull requests.',
  },
  {
    id: 'plugins',
    title: 'Plugins',
    description: 'Install MCP plugins so Studio can talk to the tools you already use.',
  },
  {
    id: 'connectors',
    title: 'Connectors',
    description: 'Link Slack, Linear, Figma, and the rest. Soumtok talks to the stack you already pay for.',
  },
  {
    id: 'skills',
    title: 'Skills',
    description: 'Packaged instructions the agent can load. Built-in skills plus the ones you upload.',
  },
  {
    id: 'keys',
    title: 'API keys',
    description: 'Platform keys and bring-your-own keys for OpenAI, Anthropic, Google, DeepSeek, and xAI.',
  },
  {
    id: 'billing',
    title: 'Billing',
    description: 'Plans, usage, included tokens, and how billing works on Soumtok.'
  },
  {
    id: 'settings',
    title: 'Settings & security',
    description: 'Profile, appearance, two-factor, sessions, and how Soumtok handles your account.',
  },
  {
    id: 'api',
    title: 'API',
    description: 'Auth, Studio, GitHub, and billing endpoints for the Soumtok HTTP API.',
  },
  {
    id: 'cli',
    title: 'CLI',
    description: 'Run Soumtok locally with Vite, Neon, and the same Studio desk you use in production.',
  },
  {
    id: 'plans',
    title: 'Plans',
    description: 'Pro from $13.99 a month. Trial is free. What is included and how to upgrade.',
  },
  {
    id: 'company',
    title: 'Company',
    description: 'Soumtok is built in Nairobi. Contact, GitHub org, and how we talk about the product.',
  },
]

const PAGES: Record<string, SeoPage> = {
  '/': {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    path: '/',
    type: 'website',
  },
  '/agents': {
    title: `Cloud Agents | ${SITE_NAME}`,
    description: "Cloud agents on Africa's most affordable coding platform. Open a branch, review the PR, ship.",
    path: '/agents',
  },
  '/docs': {
    title: `Docs | ${SITE_NAME}`,
    description: DOC_PAGES[0].description,
    path: '/docs',
    type: 'article',
  },
  '/help': {
    title: `Help | ${SITE_NAME}`,
    description: 'Guides for Studio, models, GitHub, billing, and security.',
    path: '/help',
  },
  '/contact': {
    title: `Contact | ${SITE_NAME}`,
    description: 'Talk to the Soumtok team about Studio, teams, or a bug.',
    path: '/contact',
  },
  '/download': {
    title: `Download Soumtok Desktop | ${SITE_NAME}`,
    description:
      'Download Soumtok for Windows, macOS, and Linux. Agent-first IDE with Tab, terminal, and your Soumtok account.',
    path: '/download',
  },
  '/login': {
    title: `Sign in | ${SITE_NAME}`,
    description: 'Sign in to Soumtok.',
    path: '/login',
    noindex: true,
  },
  '/signup': {
    title: `Create account | ${SITE_NAME}`,
    description: 'Open Studio, attach GitHub, and start coding. Trial is free. Pro is $13.99 a month.',
    path: '/signup',
    noindex: true,
  },
}

const NOINDEX_PREFIXES = ['/dashboard', '/checkout', '/onboarding', '/connect', '/team']

const RESERVED = new Set([
  '',
  'login',
  'signup',
  'onboarding',
  'dashboard',
  'docs',
  'privacy',
  'terms',
  'api',
  'images',
  'assets',
  'checkout',
  'team',
  '404',
  'help',
  'contact',
  'agents',
  'connect',
  'sitemap.xml',
  'sitemap_index.xml',
  'robots.txt',
  'llms.txt',
  'og.jpg',
  'og.png',
  'manifest.webmanifest',
])

export function canonicalPath(path: string) {
  const clean = path.split('?')[0].split('#')[0] || '/'
  if (clean.length > 1 && clean.endsWith('/')) return clean.slice(0, -1)
  return clean || '/'
}

export function absoluteUrl(path: string, origin = SITE_URL) {
  const base = origin.replace(/\/$/, '')
  if (path.startsWith('http')) return path
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

export function seoForPath(rawPath: string): SeoPage {
  const path = canonicalPath(rawPath)
  if (PAGES[path]) return PAGES[path]

  if (path.startsWith('/docs/')) {
    const id = path.slice('/docs/'.length).split('/')[0] || 'overview'
    const doc = DOC_PAGES.find((page) => page.id === id)
    if (doc) {
      return {
        title: `${doc.title} | ${SITE_NAME}`,
        description: doc.description,
        path: id === 'overview' ? '/docs' : `/docs/${id}`,
        type: 'article',
      }
    }
  }

  if (NOINDEX_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return {
      title: `${SITE_NAME}`,
      description: SITE_DESCRIPTION,
      path,
      noindex: true,
    }
  }

  const parts = path.split('/').filter(Boolean)
  if (parts.length === 1 && !RESERVED.has(parts[0].toLowerCase())) {
    const handle = parts[0]
    return {
      title: `@${handle} · ${SITE_NAME}`,
      description: `@${handle} on Soumtok.`,
      path,
      type: 'profile',
    }
  }

  return {
    title: `Page not found | ${SITE_NAME}`,
    description: 'This address is not a Soumtok page.',
    path,
    noindex: true,
  }
}

type SitemapEntry = { loc: string; changefreq: string; priority: string; lastmod: string }

const SITEMAP_LASTMOD = '2026-09-08'

export function marketingSitemapEntries(): SitemapEntry[] {
  return [
    { loc: '/', changefreq: 'daily', priority: '1.0', lastmod: SITEMAP_LASTMOD },
    { loc: '/agents', changefreq: 'weekly', priority: '0.9', lastmod: SITEMAP_LASTMOD },
    { loc: '/help', changefreq: 'weekly', priority: '0.7', lastmod: SITEMAP_LASTMOD },
    { loc: '/download', changefreq: 'weekly', priority: '0.8', lastmod: SITEMAP_LASTMOD },
    { loc: '/contact', changefreq: 'weekly', priority: '0.6', lastmod: SITEMAP_LASTMOD },
  ]
}

export function docsSitemapEntries(): SitemapEntry[] {
  return [
    { loc: '/docs', changefreq: 'weekly', priority: '0.9', lastmod: SITEMAP_LASTMOD },
    ...DOC_PAGES.filter((doc) => doc.id !== 'overview').map((doc) => ({
      loc: `/docs/${doc.id}`,
      changefreq: 'weekly',
      priority: '0.8',
      lastmod: SITEMAP_LASTMOD,
    })),
  ]
}

export function sitemapEntries() {
  return [...marketingSitemapEntries(), ...docsSitemapEntries()]
}

function urlsetXml(entries: SitemapEntry[], origin = SITE_URL) {
  const urls = entries
    .map(
      (entry) => `  <url>
    <loc>${escapeXml(absoluteUrl(entry.loc, origin))}</loc>
    <lastmod>${entry.lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
}

export function sitemapXml(origin = SITE_URL) {
  return urlsetXml(marketingSitemapEntries(), origin)
}

export function docsSitemapXml(origin = SITE_URL) {
  return urlsetXml(docsSitemapEntries(), origin)
}

export function sitemapIndexXml(origin = SITE_URL) {
  const lastmod = SITEMAP_LASTMOD
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${escapeXml(absoluteUrl('/sitemap.xml', origin))}</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${escapeXml(absoluteUrl('/docs/sitemap.xml', origin))}</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>
</sitemapindex>
`
}

export function robotsTxt(origin = SITE_URL) {
  return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /dashboard
Disallow: /checkout
Disallow: /onboarding
Disallow: /connect
Disallow: /login
Disallow: /signup
Disallow: /team

Host: ${origin}

Sitemap: ${absoluteUrl('/sitemap_index.xml', origin)}
`
}

export function llmsTxt() {
  const docs = DOC_PAGES.map((doc) => {
    const href = doc.id === 'overview' ? '/docs' : `/docs/${doc.id}`
    return `- [${doc.title}](${absoluteUrl(href)}): ${doc.description}`
  }).join('\n')
  return `# Soumtok

> ${SITE_TAGLINE}.

Soumtok is Africa's #1 AI coding platform. The most affordable powerful coding agent — start from $13.99 a month. Open Studio, attach a repo, pick a model, and ship.

## Product

- Studio chat with frontier models
- GitHub as the source of truth — agents open branches and pull requests
- Plugins, connectors, and skills
- Cloud agents that ship as pull requests

## Links

- Home: ${SITE_URL}
- Docs: ${absoluteUrl('/docs')}
- Help: ${absoluteUrl('/help')}
- Contact: ${absoluteUrl('/contact')}
- GitHub: ${SITE_GITHUB}
- Email: ${SITE_EMAIL}

## Docs

${docs}
`
}

export function jsonLd(page: SeoPage, origin = SITE_URL) {
  const url = absoluteUrl(page.path, origin)
  const logo = absoluteUrl('/images/soumtok-mark.png', origin)
  const image = absoluteUrl(page.image || SITE_IMAGE, origin)
  const orgId = `${origin}/#organization`
  const appId = `${origin}/#app`
  const siteId = `${origin}/#website`

  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Organization',
      '@id': orgId,
      name: SITE_NAME,
      legalName: 'Soumtok',
      url: origin,
      logo: {
        '@type': 'ImageObject',
        url: logo,
      },
      image,
      email: SITE_EMAIL,
      sameAs: [SITE_GITHUB],
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Nairobi',
        addressCountry: 'KE',
      },
      areaServed: 'Africa',
      slogan: SITE_TAGLINE,
    },
    {
      '@type': 'SoftwareApplication',
      '@id': appId,
      name: SITE_NAME,
      url: origin,
      image,
      description: SITE_DESCRIPTION,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web',
      offers: {
        '@type': 'AggregateOffer',
        lowPrice: '0',
        highPrice: '13.99',
        priceCurrency: 'USD',
        offerCount: '2',
        offers: [
          {
            '@type': 'Offer',
            name: 'Trial',
            price: '0',
            priceCurrency: 'USD',
            description: 'Start coding free.',
          },
          {
            '@type': 'Offer',
            name: 'Pro',
            price: '13.99',
            priceCurrency: 'USD',
            description: 'Daily coding on Africa’s #1 AI coding platform.',
          },
        ],
      },
      publisher: { '@id': orgId },
      featureList: [
        'Studio coding agent',
        'GitHub attach and pull requests',
        'Frontier models in one picker',
        'Cloud agents',
        'Plugins, connectors, and skills',
      ],
    },
    {
      '@type': 'WebSite',
      '@id': siteId,
      url: origin,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: 'en',
      publisher: { '@id': orgId },
    },
    {
      '@type': page.type === 'profile' ? 'ProfilePage' : page.type === 'article' ? 'TechArticle' : 'WebPage',
      '@id': `${url}#page`,
      url,
      name: page.title,
      description: page.description,
      isPartOf: { '@id': siteId },
      about: { '@id': appId },
      primaryImageOfPage: image,
      inLanguage: 'en',
    },
  ]

  if (page.path === '/') {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: FAQ.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.a,
        },
      })),
    })
  }

  if (page.path === '/docs' || page.path.startsWith('/docs/')) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: origin },
        { '@type': 'ListItem', position: 2, name: 'Docs', item: absoluteUrl('/docs', origin) },
        ...(page.path !== '/docs'
          ? [
              {
                '@type': 'ListItem',
                position: 3,
                name: page.title.replace(` | ${SITE_NAME}`, ''),
                item: url,
              },
            ]
          : []),
      ],
    })
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  }
}

export function injectSeo(html: string, page: SeoPage, origin = SITE_URL) {
  const url = absoluteUrl(page.path, origin)
  const image = absoluteUrl(page.image || SITE_IMAGE, origin)
  const imageAlt = page.imageAlt || SITE_IMAGE_ALT
  const robots = page.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'
  const json = JSON.stringify(jsonLd(page, origin))

  let out = html
  out = replaceTag(out, /<title>[^<]*<\/title>/i, `<title>${escapeHtml(page.title)}</title>`)
  out = setMeta(out, 'name', 'description', page.description)
  out = setMeta(out, 'name', 'robots', robots)
  out = setLink(out, 'canonical', url)
  out = setMeta(out, 'property', 'og:title', page.title)
  out = setMeta(out, 'property', 'og:description', page.description)
  out = setMeta(out, 'property', 'og:url', url)
  out = setMeta(out, 'property', 'og:image', image)
  out = setMeta(out, 'property', 'og:image:alt', imageAlt)
  out = setMeta(out, 'property', 'og:type', page.type === 'article' ? 'article' : 'website')
  out = setMeta(out, 'name', 'twitter:title', page.title)
  out = setMeta(out, 'name', 'twitter:description', page.description)
  out = setMeta(out, 'name', 'twitter:image', image)
  out = setMeta(out, 'name', 'twitter:image:alt', imageAlt)
  out = replaceTag(
    out,
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/i,
    `<script type="application/ld+json">${json}</script>`,
  )
  return out
}

export function applySeo(page: SeoPage, origin = SITE_URL) {
  if (typeof document === 'undefined') return
  const url = absoluteUrl(page.path, origin)
  const image = absoluteUrl(page.image || SITE_IMAGE, origin)
  const imageAlt = page.imageAlt || SITE_IMAGE_ALT
  const robots = page.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'

  document.title = page.title
  setDomMeta('name', 'description', page.description)
  setDomMeta('name', 'robots', robots)
  setDomLink('canonical', url)
  setDomMeta('property', 'og:title', page.title)
  setDomMeta('property', 'og:description', page.description)
  setDomMeta('property', 'og:url', url)
  setDomMeta('property', 'og:image', image)
  setDomMeta('property', 'og:image:alt', imageAlt)
  setDomMeta('property', 'og:type', page.type === 'article' ? 'article' : 'website')
  setDomMeta('name', 'twitter:title', page.title)
  setDomMeta('name', 'twitter:description', page.description)
  setDomMeta('name', 'twitter:image', image)
  setDomMeta('name', 'twitter:image:alt', imageAlt)

  let script = document.head.querySelector('script[type="application/ld+json"]')
  if (!script) {
    script = document.createElement('script')
    script.setAttribute('type', 'application/ld+json')
    document.head.appendChild(script)
  }
  script.textContent = JSON.stringify(jsonLd(page, origin))
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeXml(value: string) {
  return escapeHtml(value).replace(/'/g, '&apos;')
}

function replaceTag(html: string, pattern: RegExp, next: string) {
  return pattern.test(html) ? html.replace(pattern, next) : html.replace('</head>', `  ${next}\n</head>`)
}

function setMeta(html: string, attr: 'name' | 'property', key: string, content: string) {
  const pattern = new RegExp(
    `<meta[^>]*${attr}="${key}"[^>]*\\/?>`,
    'i',
  )
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`
  return replaceTag(html, pattern, tag)
}

function setLink(html: string, rel: string, href: string) {
  const pattern = new RegExp(`<link\\s+rel="${rel}"\\s+href="[^"]*"\\s*\\/?>`, 'i')
  const tag = `<link rel="${rel}" href="${escapeHtml(href)}" />`
  return replaceTag(html, pattern, tag)
}

function setDomMeta(attr: 'name' | 'property', key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setDomLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}
