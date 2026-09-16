import type { Hono } from 'hono'
import { docsSitemapXml, llmsTxt, robotsTxt, sitemapIndexXml, sitemapXml } from '../shared/seo.ts'

function text(body: string, type: string) {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

export function registerSeo(app: Hono) {
  app.get('/sitemap_index.xml', () => text(sitemapIndexXml(), 'application/xml; charset=utf-8'))
  app.get('/sitemap.xml', () => text(sitemapXml(), 'application/xml; charset=utf-8'))
  app.get('/docs/sitemap.xml', () => text(docsSitemapXml(), 'application/xml; charset=utf-8'))
  app.get('/robots.txt', () => text(robotsTxt(), 'text/plain; charset=utf-8'))
  app.get('/llms.txt', () => text(llmsTxt(), 'text/plain; charset=utf-8'))
}
