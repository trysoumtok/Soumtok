/**
 * Quality gates before claiming any build is done — websites, apps, APIs, CLI, games, data.
 */
const fs = require('fs')
const path = require('path')
const { detectBuildTemplate } = require('../../../shared/buildTemplateLibrary.cjs')
const {
  detectGenericMarkers,
  detectBuildKindGaps,
  resolveDoctrineKey,
} = require('../../../shared/buildDesignDoctrine.cjs')

function walkSourceFiles(folder, out = [], depth = 0) {
  if (depth > 4 || out.length > 50) return out
  let entries = []
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue
    const full = path.join(folder, e.name)
    if (e.isDirectory()) walkSourceFiles(full, out, depth + 1)
    else if (/\.(tsx?|jsx?|css|html|py|mjs|cjs)$/i.test(e.name)) out.push(full)
  }
  return out
}

function isBuildRequest(userText) {
  return /\b(build|make|create|scaffold|landing|website|app|api|dashboard|cli|game|todo|calc|coffee|cafe|shop|portfolio|docs|fullstack|data)\b/i.test(
    String(userText || ''),
  )
}

function runQualityGates(folder, { userText = '' } = {}) {
  const failures = []
  if (!folder) return { ok: true, failures }

  const files = walkSourceFiles(folder)
  if (!files.length) return { ok: true, failures }

  const tpl = detectBuildTemplate(userText)
  const doctrineKey = resolveDoctrineKey({
    templateId: tpl?.id,
    category: tpl?.category,
    userText,
  })

  let html = ''
  let css = ''
  let js = ''
  let py = ''
  for (const f of files) {
    try {
      const body = fs.readFileSync(f, 'utf8')
      if (/\.html$/i.test(f)) html += body + '\n'
      if (/\.css$/i.test(f)) css += body
      if (/\.(tsx?|jsx?|mjs|cjs)$/i.test(f)) js += body + '\n'
      if (/\.py$/i.test(f)) py += body + '\n'
    } catch {
      /* ignore */
    }
  }

  const combined = `${html}\n${css}\n${js}\n${py}`
  const visualKind = ['website', 'multipage', 'ecommerce', 'portfolio', 'docs', 'web-app', 'dashboard'].includes(
    doctrineKey,
  )

  if (visualKind || html.length > 200) {
    if (html && !/<meta[^>]+viewport/i.test(html)) failures.push('Missing viewport meta tag')
    if (html && !/<title>[^<]{2,}/i.test(html)) failures.push('Missing or empty <title>')
    if (css && css.length > 120 && !/:root|--/i.test(css)) failures.push('CSS missing :root design tokens')
    if (html && /<img[^>]+src=["']["']/i.test(html)) failures.push('Image with empty src')
    if (html && /<img(?![^>]*alt=)/gi.test(html)) failures.push('Image missing alt text')
    if (html.length > 8000 && !js.includes('sections/') && !js.includes('components/')) {
      failures.push('Monolithic index.html — use src/sections/* or src/components/*')
    }
  }

  if (js.split('\n').length > 400 && !js.includes('export ')) {
    failures.push('Large single file — split into modules')
  }

  if (doctrineKey === 'multipage') {
    const htmlPages = files.filter((f) => /\.html$/i.test(f))
    if (htmlPages.length < 3) failures.push('Multi-page site needs 3+ HTML pages (home + about + contact minimum)')
    if (!js.includes('layout.ts') && !js.includes('shared/layout')) {
      failures.push('Multi-page site missing shared layout module')
    }
    if (!js.includes('motion.ts') && !/data-reveal|prefers-reduced-motion/i.test(combined)) {
      failures.push('Multi-page site missing motion.ts or data-reveal animations')
    }
  }

  if (isBuildRequest(userText)) {
    failures.push(...detectGenericMarkers(combined))
  }

  if (doctrineKey === 'backend') {
    failures.push(...detectBuildKindGaps(combined, 'backend'))
  } else if (doctrineKey === 'cli') {
    failures.push(...detectBuildKindGaps(`${js}\n${py}`, 'cli'))
  } else if (doctrineKey === 'web-app' || doctrineKey === 'dashboard') {
    failures.push(...detectBuildKindGaps(combined, 'web-app'))
  } else if (doctrineKey === 'game') {
    failures.push(...detectBuildKindGaps(combined, 'game'))
  }

  try {
    if (fs.existsSync(path.join(folder, 'README.md'))) {
      const readme = fs.readFileSync(path.join(folder, 'README.md'), 'utf8')
      if (readme.trim().length < 40) failures.push('README too short — add install + run commands')
    } else if (isBuildRequest(userText) && files.some((f) => /package\.json$/i.test(f))) {
      failures.push('Missing README.md with run instructions')
    }
  } catch {
    /* ignore */
  }

  const unique = [...new Set(failures)]
  return { ok: unique.length === 0, failures: unique.slice(0, 10) }
}

module.exports = { runQualityGates, walkSourceFiles, isBuildRequest }
