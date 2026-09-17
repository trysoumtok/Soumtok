import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const lib = require('../../shared/buildTemplateLibrary.cjs')

const n = lib.BUILD_TEMPLATES.length
if (n < 15) {
  console.error('FAIL expected 15+ templates, got', n)
  process.exit(1)
}

const coffee = lib.detectBuildTemplate('make me a coffee landing page')
if (!coffee || coffee.id !== 'cafe-restaurant-site') {
  console.error('FAIL coffee should match cafe-restaurant-site', coffee?.id)
  process.exit(1)
}

const calc = lib.detectBuildTemplate('build a calculator')
if (!calc || calc.id !== 'calculator') {
  console.error('FAIL calculator template', calc?.id)
  process.exit(1)
}

const api = lib.detectBuildTemplate('express rest api with health check')
if (!api || !/node-rest|hono/.test(api.id)) {
  console.error('FAIL api template', api?.id)
  process.exit(1)
}

const brief = lib.composeTemplateBrief('coffee shop website')
if (!/SOUMTOK BUILD TEMPLATE|Must have|File tree|Proven starter/i.test(brief)) {
  console.error('FAIL brief missing sections')
  process.exit(1)
}

const starter = lib.resolveStarterPath(coffee)
if (!starter || !starter.includes('cafe')) {
  console.error('FAIL coffee starter path', starter)
  process.exit(1)
}

const cats = new Set(lib.BUILD_TEMPLATES.map((t) => t.category))
for (const c of ['website', 'web-app', 'backend', 'cli', 'game']) {
  if (!cats.has(c)) {
    console.error('FAIL missing category', c)
    process.exit(1)
  }
}

console.log(`OK template library (${n} templates, categories: ${[...cats].join(', ')})`)
