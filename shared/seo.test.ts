import assert from 'node:assert/strict'
import test from 'node:test'
import { FAQ, docsSitemapXml, injectSeo, jsonLd, seoForPath, sitemapIndexXml, sitemapXml } from './seo.ts'

test('home seo ranks cheap Africa coding platform from $5', () => {
  const page = seoForPath('/')
  assert.equal(page.noindex, undefined)
  assert.match(page.title, /Cheap AI Coding Platform from \$5/)
  assert.match(page.description, /\$5/)
  assert.match(page.description, /Africa/)
  assert.match(page.description, /Cursor/)
  assert.doesNotMatch(page.description, /M-Pesa|PayPal/)
  assert.ok(FAQ.length >= 6)
})

test('home json-ld includes FAQ and Start price', () => {
  const graph = jsonLd(seoForPath('/'))['@graph'] as { '@type'?: string; offers?: { lowPrice?: string } }[]
  assert.ok(graph.some((node) => node['@type'] === 'FAQPage'))
  const app = graph.find((node) => node['@type'] === 'SoftwareApplication') as {
    offers?: { lowPrice?: string; offers?: { price?: string }[] }
  }
  assert.equal(app.offers?.lowPrice, '5')
  assert.ok(app.offers?.offers?.some((offer) => offer.price === '20'))
})

test('docs routes resolve', () => {
  const page = seoForPath('/docs/studio')
  assert.equal(page.path, '/docs/studio')
  assert.match(page.title, /Studio/)
  assert.equal(page.type, 'article')
})

test('private app routes are noindex', () => {
  assert.equal(seoForPath('/dashboard').noindex, true)
  assert.equal(seoForPath('/login').noindex, true)
})

test('sitemap index splits marketing and docs', () => {
  const index = sitemapIndexXml()
  assert.match(index, /\/docs\/sitemap\.xml/)
  const marketing = sitemapXml()
  assert.match(marketing, /https:\/\/soumtok\.com\/<\/loc>/)
  assert.doesNotMatch(marketing, /\/docs\/studio/)
  const docs = docsSitemapXml()
  assert.match(docs, /https:\/\/soumtok\.com\/docs\/studio/)
})

test('injectSeo rewrites title, keywords, and og image', () => {
  const html = `<html><head><title>old</title><meta name="description" content="x" /></head></html>`
  const out = injectSeo(html, seoForPath('/'))
  assert.match(out, /<title>Cheap AI Coding Platform from \$5\/mo \| Soumtok — Africa's #1<\/title>/)
  assert.match(out, /name="keywords" content="[^"]*Cursor alternative/)
  assert.match(out, /property="og:image" content="https:\/\/soumtok.com\/og.jpg"/)
})

test('download page mentions desktop and terminal cli', () => {
  const page = seoForPath('/download')
  assert.match(page.title, /Download/)
  assert.match(page.description, /Terminal CLI/)
  assert.match(page.description, /Desktop/)
})
