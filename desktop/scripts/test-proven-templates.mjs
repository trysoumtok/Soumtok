#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const lib = require('../../shared/buildTemplateLibrary.cjs')
const { loadStarterTemplate, starterExists, templatesRoot } = require('../../shared/templateLoader.cjs')
const { contentsForPlan, applyGreenfieldScaffold } = require('../src/main/buildDirector.js')

assert.ok(fs.existsSync(templatesRoot()), 'templates/ directory missing')

const starters = [
  'vite-vanilla-ts',
  'landing-marketing',
  'multi-page-site',
  'cafe-restaurant',
  'vite-react-ts',
  'todo-app',
  'calculator',
  'saas-dashboard',
  'node-express-api',
  'hono-api',
  'python-cli',
  'node-cli',
  'console-game',
]
for (const s of starters) {
  assert.ok(starterExists(s), `missing starter ${s}`)
  const files = loadStarterTemplate(s, { title: 'Test', brand: 'Test', initial: 'T' })
  assert.ok(files?.length, `empty starter ${s}`)
}

const coffee = lib.detectBuildTemplate('make me a coffee landing page')
assert.equal(lib.resolveStarterPath(coffee), 'cafe-restaurant')

const multi = lib.detectBuildTemplate('build a multi page website with about and contact pages')
assert.equal(multi?.id, 'multi-page-static-site')
assert.equal(lib.resolveStarterPath(multi), 'multi-page-site')
const multiBrief = lib.composeTemplateBrief('multi page static site with about.html')
assert.match(multiBrief, /templates\/multi-page-site/)
assert.match(multiBrief, /vite\.config\.ts/)

const brief = lib.composeTemplateBrief('coffee shop website')
assert.match(brief, /Proven starter: templates\/cafe-restaurant/)
assert.match(brief, /Proven starter: templates\/cafe-restaurant/)

const landingFiles = contentsForPlan({ kind: 'web-vite', raw: 'landing page for my startup', title: 'Acme' })
assert.ok(landingFiles.some((f) => f.path === 'src/sections/hero.ts'), 'landing should include hero section')

const cafeTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-cafe-'))
const cafeSc = applyGreenfieldScaffold(cafeTmp, 'make me a coffee landing page')
assert.ok(cafeSc.wrote.includes('src/sections/menu.ts'), 'cafe scaffold should write menu')
assert.ok(fs.existsSync(path.join(cafeTmp, 'src/sections/menu.ts')))
assert.ok(fs.existsSync(path.join(cafeTmp, 'src/motion.ts')), 'cafe scaffold should include motion.ts')
assert.ok(fs.existsSync(path.join(cafeTmp, 'src/cart.ts')), 'cafe scaffold should include cart.ts')

const briefCoffee = lib.composeTemplateBrief('make me a coffee landing page')
assert.match(briefCoffee, /DESIGN DOCTRINE/)
assert.match(briefCoffee, /Section order/)
fs.rmSync(cafeTmp, { recursive: true, force: true })

const calcFiles = contentsForPlan({ kind: 'web-vite', raw: 'build a calculator', title: 'Calc' })
assert.ok(calcFiles.some((f) => f.path === 'src/utils/calc.ts'))

const apiFiles = contentsForPlan({ kind: 'node-api', raw: 'express rest api', title: 'API' })
assert.ok(apiFiles.some((f) => f.path === 'src/routes/items.js'))

console.log(`OK proven templates (${starters.length} starters, templates root: ${templatesRoot()})`)
