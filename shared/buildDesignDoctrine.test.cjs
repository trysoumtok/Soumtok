#!/usr/bin/env node
const assert = require('node:assert/strict')
const {
  composeDesignDoctrineBrief,
  composeUniversalBuildStandards,
  detectGenericMarkers,
  detectBuildKindGaps,
  resolveDoctrineKey,
} = require('./buildDesignDoctrine.cjs')

assert.equal(resolveDoctrineKey({ templateId: 'saas-dashboard' }), 'dashboard')
assert.equal(resolveDoctrineKey({ category: 'backend', templateId: 'node-rest-api' }), 'backend')
assert.equal(resolveDoctrineKey({ userText: 'build a snake game' }), 'game')
assert.equal(resolveDoctrineKey({ userText: 'express rest api for users' }), 'backend')
assert.equal(resolveDoctrineKey({ userText: 'python cli tool' }), 'cli')
assert.equal(resolveDoctrineKey({ templateId: 'multi-page-static-site' }), 'multipage')
assert.equal(resolveDoctrineKey({ userText: 'build a multi page website with about and contact' }), 'multipage')

const brief = composeDesignDoctrineBrief('website')
assert.match(brief, /DESIGN DOCTRINE/)
assert.match(brief, /Universal:/)

const apiBrief = composeDesignDoctrineBrief('backend', { userText: 'build an api' })
assert.match(apiBrief, /GET \/health/)

const standards = composeUniversalBuildStandards()
assert.match(standards, /every build/)

const generic = detectGenericMarkers('Elevate your workflow with our seamless cutting-edge platform.')
assert.ok(generic.length >= 2)

assert.ok(detectBuildKindGaps('app.get("/", (req,res)=>res.send("Hello World"))', 'backend').length > 0)
assert.ok(detectBuildKindGaps('function main() { console.log("hi") }', 'cli').length > 0)

const lib = require('./buildTemplateLibrary.cjs')
const fallback = lib.composeFallbackBuildBrief('build something cool')
assert.match(fallback, /BUILD STANDARDS/)
assert.match(fallback, /DESIGN DOCTRINE/)

const apiTpl = lib.composeTemplateBrief('create express rest api')
assert.match(apiTpl, /curl/)
assert.match(apiTpl, /\/health/)

console.log('OK buildDesignDoctrine (all kinds)')
