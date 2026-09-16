import assert from 'node:assert/strict'
import test from 'node:test'
import {
  brandFromPrompt,
  brandLogoContext,
  brandLogoFetchUrls,
  brandLogoSlug,
  isRawFetchBody,
  visibleHeaderMarks,
  wantsBrandAsset,
} from './brandLogo.ts'
import { needsWeb } from './capabilities.ts'
import { analyzeUserRequest } from './requestAnalyze.ts'

test('logo and svg asks are brand-asset jobs', () => {
  assert.equal(wantsBrandAsset('can you ad tehreal svg real logo of kfc and ad any page inmy webioste'), true)
  assert.equal(wantsBrandAsset('add the real SVG logo of kfc'), true)
  assert.equal(wantsBrandAsset('add the real logoof kfc please'), true)
  assert.equal(wantsBrandAsset('find the mcdonalds wordmark and put it in the header'), true)
  assert.equal(wantsBrandAsset('add an icon to the nav'), false)
  assert.equal(wantsBrandAsset('make the header sticky'), false)
})

test('slug and fetch urls point at Simple Icons for the named brand', () => {
  const raw = 'can you ad tehreal svg real logo of kfc and ad any page inmy webioste'
  assert.equal(brandFromPrompt(raw).toLowerCase().includes('kfc'), true)
  assert.equal(brandLogoSlug('KFC'), 'kfc')
  const urls = brandLogoFetchUrls(raw)
  assert.ok(urls.some((url) => url.includes('simpleicons.org/kfc')))
  assert.ok(urls.some((url) => url.includes('simple-icons/icons/kfc.svg')))
})

test('SVG fetch bodies keep tags instead of being stripped to text', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 2"/></svg>'
  assert.equal(isRawFetchBody('image/svg+xml; charset=utf-8', 'https://cdn.simpleicons.org/kfc', svg), true)
  assert.equal(isRawFetchBody('text/html', 'https://example.com/kfc.svg', svg), true)
  assert.equal(isRawFetchBody('text/html', 'https://example.com', '<html><title>Hi</title></html>'), false)
})

test('a logo-only follow-up does not add pages or rewrite the site', async () => {
  const files = {
    'index.html': '<header><a class="logo" href="index.html">VIAI</a></header><h1>The Original Recipe</h1>',
    'about.html': '<header><a class="logo" href="index.html">VIAI</a></header><h1>About</h1>',
    'styles/main.css': '.logo{font-weight:800}.logo::before{content:"VIAI"}',
  }
  const analysis = analyzeUserRequest('add the real logoof kfc please', { hasFiles: true, files })
  assert.equal(analysis.kind, 'edit')
  assert.match(analysis.meaning, /svg logo/i)
  assert.doesNotMatch(analysis.meaning, /more pages/i)
  assert.match(analysis.meaning, /VIAI/)
  assert.equal(analysis.where, 'header')
  assert.ok(analysis.dont.some((item) => /add pages|rewrite/i.test(item)))
  assert.ok(!analysis.do.some((item) => /new HTML page/i.test(item)))
  const { inferPlan } = await import('./agent.ts')
  const plan = inferPlan('add the real logo of kfc please', true, { hasPreview: true, analysis })
  const instructions = plan.instructions.join('\n')
  assert.match(instructions, /ONLY the header logo/i)
  assert.doesNotMatch(instructions, /Add at least one new HTML page/)
})

test('visible header letters are the logo to replace', () => {
  const marks = visibleHeaderMarks({
    'index.html': '<header><a class="logo" href="/">VIAI</a></header>',
    'styles.css': '.brand::after{content:"VIAI"}',
  })
  assert.ok(marks.includes('VIAI'))
})

test('logo asks need the web and inject the installed skill', () => {
  const ask = 'add the real svg logo of kfc'
  assert.equal(needsWeb(ask), true)
  const skill = brandLogoContext(ask)
  assert.match(skill, /already installed/i)
  assert.match(skill, /simpleicons\.org\/kfc/)
  assert.match(skill, /images\/kfc\.svg/)
  const analysis = analyzeUserRequest(ask, {
    hasFiles: true,
    files: { 'index.html': '<div class="logo">KFC</div>' },
  })
  assert.equal(analysis.kind, 'edit')
  assert.ok(analysis.do.some((item) => /simple icons|images\/\{slug\}|svg/i.test(item)))
})

test('applyBrandLogo writes the SVG and replaces VIAI in the header', async () => {
  const { applyBrandLogo, extractSvgFromFetch, isLogoOnlyAsk, svgFromFetchedPages } = await import('./brandLogo.ts')
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 2"/></svg>'
  assert.equal(isLogoOnlyAsk('add the real logo of kfc please'), true)
  assert.equal(isLogoOnlyAsk('add the real svg logo of kfc and ad any page'), false)
  assert.equal(extractSvgFromFetch(`cdn\nhttps://x\n${svg}`), svg)
  assert.equal(svgFromFetchedPages([{ ok: true, text: svg }]).includes('<svg'), true)
  const files = {
    'index.html': '<header><a class="logo" href="index.html">VIAI</a></header><h1>The Original Recipe</h1>',
    'about.html': '<header><a class="logo" href="index.html">VIAI</a></header><h1>About</h1>',
    'styles/main.css': '.logo{font-weight:800}.logo::before{content:"VIAI"}',
  }
  const applied = applyBrandLogo(files, { text: 'add the real logo of kfc please', svg, name: 'kfc' })
  assert.ok(applied)
  assert.equal(applied?.slug, 'kfc')
  assert.match(applied?.files['images/kfc.svg'] || '', /<svg/)
  assert.match(applied?.files['index.html'] || '', /images\/kfc\.svg/)
  assert.doesNotMatch(applied?.files['index.html'] || '', />VIAI</)
  assert.doesNotMatch(applied?.files['about.html'] || '', />VIAI</)
  assert.match(applied?.files['index.html'] || '', /The Original Recipe/)
  assert.doesNotMatch(applied?.files['styles/main.css'] || '', /content:\s*"VIAI"/)
})
