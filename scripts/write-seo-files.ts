import { mkdirSync, writeFileSync } from 'node:fs'
import { docsSitemapXml, llmsTxt, robotsTxt, sitemapIndexXml, sitemapXml } from '../shared/seo.ts'

mkdirSync('public/docs', { recursive: true })
writeFileSync('public/sitemap_index.xml', sitemapIndexXml())
writeFileSync('public/sitemap.xml', sitemapXml())
writeFileSync('public/docs/sitemap.xml', docsSitemapXml())
writeFileSync('public/robots.txt', robotsTxt())
writeFileSync('public/llms.txt', llmsTxt())
console.log('wrote public sitemap index, sitemaps, robots, llms')
