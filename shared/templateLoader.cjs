/**
 * Load vendored proven starter templates from /templates.
 * Each folder includes SOURCE.md (provenance) and LICENSE.
 */
const fs = require('fs')
const path = require('path')

const TEMPLATES_ROOT = path.resolve(__dirname, '..', 'templates')

/** @param {string} dir @param {string} [base] */
function walkTemplateDir(dir, base = '') {
  /** @type {{ path: string, full: string }[]} */
  const files = []
  if (!fs.existsSync(dir)) return files
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const rel = base ? `${base}/${name}` : name
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      files.push(...walkTemplateDir(full, rel))
    } else {
      files.push({ path: rel.replace(/\\/g, '/'), full })
    }
  }
  return files
}

/** @param {string} content @param {Record<string, string>} vars */
function applyTemplateVars(content, vars) {
  let out = content
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(String(value ?? ''))
  }
  return out
}

/** @param {string} starterPath @param {Record<string, string>} [vars] */
function loadStarterTemplate(starterPath, vars = {}) {
  const root = path.join(TEMPLATES_ROOT, starterPath)
  if (!fs.existsSync(root)) return null
  const walked = walkTemplateDir(root)
  /** @type {{ path: string, content: string }[]} */
  const files = []
  for (const { path: rel, full } of walked) {
    if (rel === 'SOURCE.md') continue
    files.push({
      path: rel,
      content: applyTemplateVars(fs.readFileSync(full, 'utf8'), vars),
    })
  }
  files.sort((a, b) => a.path.localeCompare(b.path))
  return files.length ? files : null
}

/** @param {string} starterPath */
function templateProvenance(starterPath) {
  const sourceMd = path.join(TEMPLATES_ROOT, starterPath, 'SOURCE.md')
  if (!fs.existsSync(sourceMd)) return null
  const text = fs.readFileSync(sourceMd, 'utf8')
  const url = text.match(/(?:Source|Base):\s*(https?:\/\/\S+)/i)?.[1] || ''
  const license = text.match(/License:\s*(\S+)/i)?.[1] || 'MIT'
  const name = text.match(/^#\s*(.+)$/m)?.[1]?.trim() || starterPath
  return { name, sourceUrl: url, license, starterPath }
}

function templatesRoot() {
  return TEMPLATES_ROOT
}

/** @param {string} starterPath */
function starterExists(starterPath) {
  return Boolean(starterPath && fs.existsSync(path.join(TEMPLATES_ROOT, starterPath)))
}

module.exports = {
  TEMPLATES_ROOT,
  loadStarterTemplate,
  applyTemplateVars,
  templateProvenance,
  templatesRoot,
  starterExists,
}
