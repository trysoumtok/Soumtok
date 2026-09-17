import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { composeKnowledgeBrief, patternDeliverables } = require('../src/main/knowledgeBase.js')
const { runCompletenessCheck } = require('../src/main/completenessVerifier.js')
const { runQualityGates } = require('../src/main/qualityGates.js')

const brief = composeKnowledgeBrief('make me a coffee landing page')
if (!/landing-page|Hero|Footer/i.test(brief)) {
  console.error('FAIL knowledge brief', brief.slice(0, 200))
  process.exit(1)
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-brain-'))
fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}', 'utf8')
fs.writeFileSync(path.join(dir, 'index.html'), '<html><head><title>Coffee</title></head><body><h1>Hi</body></html>', 'utf8')
const check = runCompletenessCheck(dir, {
  deliverables: patternDeliverables('coffee landing page'),
  userText: 'coffee landing page',
  taskKind: 'build',
})
if (check.ok) {
  console.error('FAIL should report missing src/style.css etc', check)
  process.exit(1)
}
const q = runQualityGates(dir, { userText: 'coffee landing page' })
if (!q.failures.length) {
  console.error('FAIL quality should flag missing viewport', q)
  process.exit(1)
}
fs.rmSync(dir, { recursive: true, force: true })
console.log('OK brain layers')
