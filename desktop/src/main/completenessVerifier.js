/**
 * Check workspace against plan deliverables before marking a build done.
 */
const fs = require('fs')
const path = require('path')
const { detectBuildTemplate } = require('./knowledgeBase')

function fileExists(folder, rel) {
  try {
    return fs.existsSync(path.join(folder, rel.replace(/\\/g, '/')))
  } catch {
    return false
  }
}

function readText(folder, rel) {
  try {
    return fs.readFileSync(path.join(folder, rel.replace(/\\/g, '/')), 'utf8')
  } catch {
    return ''
  }
}

/** @param {string[]} deliverables from inferPlan / knowledge base */
function verifyDeliverablesOnDisk(folder, deliverables) {
  const missing = []
  const empty = []
  if (!folder || !deliverables?.length) return { ok: true, missing, empty, gaps: [] }

  for (const raw of deliverables) {
    const rel = String(raw).split(/\s+[—–-]\s+/)[0].trim().replace(/^["']|["']$/g, '')
    if (!rel || rel.includes('*') || rel.includes('localhost')) continue
    const normalized = rel.replace(/\\/g, '/')
    if (!fileExists(folder, normalized)) {
      missing.push(normalized)
      continue
    }
    const body = readText(folder, normalized)
    if (body.trim().length < 8) empty.push(normalized)
  }
  const gaps = [...missing.map((f) => `Missing file: ${f}`), ...empty.map((f) => `Empty file: ${f}`)]
  return { ok: gaps.length === 0, missing, empty, gaps }
}

function verifyLandingContent(folder, userText = '') {
  const gaps = []
  const tpl = detectBuildTemplate(userText)
  const html = [
    readText(folder, 'index.html'),
    readText(folder, 'src/App.tsx'),
    readText(folder, 'src/main.ts'),
  ].join('\n')
  const css = readText(folder, 'src/style.css') + readText(folder, 'styles/main.css')
  const isWeb =
    tpl?.category === 'website' ||
    tpl?.category === 'web-app' ||
    /\b(landing|website|coffee|cafe|page)\b/i.test(userText)
  if (!isWeb) return gaps
  if (html && !/<h1[\s>]/i.test(html)) gaps.push('No h1 heading found')
  if (html && /lorem ipsum/i.test(html)) gaps.push('Placeholder lorem ipsum in HTML/TS')
  if (css && !/@media/i.test(css) && html.length > 200) gaps.push('No @media responsive rules in CSS')
  if (tpl?.components?.includes('Footer') && html && !/footer|copyright/i.test(html)) {
    gaps.push('No footer/copyright section')
  }
  if (tpl?.components?.includes('Hero') && html && !/hero|cta|button|btn/i.test(html)) {
    gaps.push('No hero/CTA/button found')
  }
  if (tpl?.id === 'cafe-restaurant-site' && html && !/menu|price|\$\d/i.test(html)) {
    gaps.push('Menu section missing (items with prices)')
  }
  return gaps
}

function runCompletenessCheck(folder, { deliverables = [], userText = '', taskKind = 'execute' } = {}) {
  if (!folder) return { ok: true, gaps: [] }
  if (!['build', 'execute', 'fix', 'run'].includes(String(taskKind))) {
    return { ok: true, gaps: [] }
  }
  const hasPkg = fileExists(folder, 'package.json')
  const isWeb = hasPkg || fileExists(folder, 'index.html')
  if (!isWeb) return { ok: true, gaps: [] }

  const fromPlan = verifyDeliverablesOnDisk(folder, deliverables)
  const contentGaps = detectBuildTemplate(userText) ? verifyLandingContent(folder, userText) : []
  const gaps = [...fromPlan.gaps, ...contentGaps]
  return { ok: gaps.length === 0, gaps, missing: fromPlan.missing, empty: fromPlan.empty }
}

module.exports = {
  verifyDeliverablesOnDisk,
  verifyLandingContent,
  runCompletenessCheck,
}
