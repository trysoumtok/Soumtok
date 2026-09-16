#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  parseBuildIntent,
  filesPlanForIntent,
  composeBuildDirectorBrief,
  contentsForPlan,
  applyGreenfieldScaffold,
  workspaceIsGreenfield,
} = require('../src/main/buildDirector.js')

const cube = parseBuildIntent('hi make me a 3d rubis cube simulation app')
assert.equal(cube.kind, 'web-vite')
assert.equal(cube.wantsBrowser3d, true)
assert.match(cube.features.join('\n'), /three/i)

const paths = filesPlanForIntent(cube, true).map((f) => f.path)
assert.deepEqual(
  paths.filter((p) => !p.startsWith('src/') && !['package.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'README.md'].includes(p)),
  [],
)
assert.ok(paths.includes('package.json'))
assert.ok(paths.includes('src/main.ts'))
assert.ok(paths.includes('src/cube.ts'))
assert.ok(paths.includes('src/cube3d.ts'))
assert.ok(!paths.includes('cube.js'))
assert.ok(!paths.includes('server.js'))
assert.ok(!paths.some((p) => p.startsWith('web/')))

const brief = composeBuildDirectorBrief('hi make me a 3d rubis cube simulation app', '', 'GREENFIELD (empty)')
assert.match(brief, /src\/main\.ts/)
assert.match(brief, /INSPECT ONCE THEN WRITE/)
assert.doesNotMatch(brief, /write\("cube\.js"\)/)
assert.doesNotMatch(brief, /write\("server\.js"\)/)
assert.match(brief, /Never cube\.js/)

const landing = parseBuildIntent('make a landing page with vite')
assert.equal(landing.kind, 'web-vite')
assert.equal(landing.wantsBrowser3d, false)

const cli = parseBuildIntent('make a node cli that greets stdin')
assert.equal(cli.kind, 'node-cli')

const cubeFiles = contentsForPlan(cube)
const pkg = cubeFiles.find((f) => f.path === 'package.json')
assert.ok(pkg)
JSON.parse(pkg.content)
assert.match(pkg.content, /"three"/)
assert.ok(cubeFiles.some((f) => f.path === 'src/cube3d.ts'))
assert.ok(cubeFiles.some((f) => f.path === 'src/main.ts'))
assert.match(cubeFiles.find((f) => f.path === 'src/cube3d.ts').content, /MeshStandardMaterial/)
assert.ok(!cubeFiles.some((f) => f.path === 'cube.js'))

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-scaffold-'))
assert.equal(workspaceIsGreenfield(tmp), true)
const sc = applyGreenfieldScaffold(tmp, 'hi make me a 3d rubis cube simulation app')
assert.ok(sc.wrote.includes('src/cube3d.ts'))
assert.ok(sc.wrote.includes('package.json'))
assert.ok(fs.existsSync(path.join(tmp, 'src/main.ts')))
assert.ok(!fs.existsSync(path.join(tmp, 'cube.js')))
assert.equal(workspaceIsGreenfield(tmp), false)
const again = applyGreenfieldScaffold(tmp, 'hi make me a 3d rubis cube simulation app')
assert.equal(again.skipped, true)
fs.rmSync(tmp, { recursive: true, force: true })

const pyTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soumtok-py-'))
const py = applyGreenfieldScaffold(pyTmp, 'make a python cli that greets stdin')
assert.ok(py.wrote.includes('main.py'))
assert.ok(!py.wrote.includes('src/cube3d.ts'))
assert.ok(fs.existsSync(path.join(pyTmp, 'main.py')))
fs.rmSync(pyTmp, { recursive: true, force: true })

const apiFiles = contentsForPlan({ kind: 'node-api', title: 'Health', raw: 'express api' })
assert.ok(apiFiles.some((f) => f.path === 'src/index.js'))
JSON.parse(apiFiles.find((f) => f.path === 'package.json').content)

console.log('test-build-director: ok')
