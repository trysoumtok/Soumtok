/**
 * PLAN.md — persisted plan artifact for Plan mode (review → BUILD to execute).
 */
const fs = require('fs')
const path = require('path')

const PLAN_FILENAME = 'PLAN.md'
const CANVAS_FILENAME = 'CANVAS.md'

function planPath(root) {
  return path.join(root, PLAN_FILENAME)
}

function canvasPath(root) {
  return path.join(root, CANVAS_FILENAME)
}

function readPlanDocument(root) {
  try {
    const p = planPath(root)
    if (!fs.existsSync(p)) return null
    return fs.readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

/**
 * @param {string} root
 * @param {{ title?: string, goal?: string, steps?: { content?: string, status?: string }[], status?: string }} opts
 */
function writePlanDocument(root, opts = {}) {
  if (!root) return null
  const steps = Array.isArray(opts.steps) ? opts.steps : []
  const status = opts.status || 'draft'
  const goal = String(opts.goal || '').trim()
  const title = String(opts.title || '').trim()
  const lines = [
    title ? `# Plan: ${title}` : '# Plan',
    '',
    `> **Status:** ${status} — review this file, edit if needed, then type **BUILD** in the agent to execute.`,
    '',
  ]
  if (goal) {
    lines.push('## Goal', '', goal, '')
  }
  lines.push('## Steps', '')
  if (steps.length) {
    for (const s of steps) {
      const done = String(s.status || '').toLowerCase() === 'completed'
      const mark = done ? 'x' : ' '
      lines.push(`- [${mark}] ${String(s.content || s.id || '').trim()}`)
    }
  } else {
    lines.push('- [ ] (steps will appear here)')
  }
  lines.push(
    '',
    '## Acceptance',
    '',
    '- [ ] Files on disk match this plan',
    '- [ ] Dev server or terminal demo verified before done',
    '',
    '---',
    '*Soumtok Plan mode — send **BUILD** when ready.*',
    '',
  )
  const body = lines.join('\n')
  fs.writeFileSync(planPath(root), body, 'utf8')
  return { path: PLAN_FILENAME, body }
}

function writeCanvasDocument(root, opts = {}) {
  if (!root) return null
  const title = String(opts.title || 'Design canvas').trim()
  const content = String(opts.content || opts.body || '').trim()
  const body = [
    `# Canvas: ${title}`,
    '',
    '> Visual / docs design reference — open beside the editor while building.',
    '',
    content || '## Overview\n\n(Describe layout, sections, and flow here.)',
    '',
    '---',
    '*Soumtok Canvas — edit freely.*',
    '',
  ].join('\n')
  fs.writeFileSync(canvasPath(root), body, 'utf8')
  return { path: CANVAS_FILENAME, body }
}

function userAskingAboutCapabilities(text) {
  const t = String(text || '').toLowerCase()
  return /\b(what can you do|what can u do|what do you do|what are you able|what can you help|how can you help|what can i ask|what can you do with|capabilities)\b/.test(
    t,
  )
}

function userWantsPlanFirst(text) {
  const t = String(text || '')
  if (userAskingAboutCapabilities(t)) return false
  if (/\bbuild\b/i.test(t) && !/\bplan first\b/i.test(t)) return false
  return /\b(plan first|make a plan|create a plan|plan mode|let'?s plan|we plan|plan before|write a plan|need a plan|plan it first|plan this first|plan out)\b/i.test(
    t,
  )
}

/** PLAN.md + plan todos only when user chose Plan mode or explicitly asked to plan before building. */
function shouldWritePlanArtifact({ mode, userMessage, roundCtx }) {
  if (userAskingAboutCapabilities(userMessage)) return false
  if (String(mode || '').toLowerCase() === 'plan') return true
  if (roundCtx?._userAskedPlanFirst) return true
  return false
}

function userWantsBuildPlan(text) {
  const t = String(text || '').trim()
  if (/^build\.?$/i.test(t)) return true
  return /\b(execute plan|go ahead and build|build it now|start building|approve plan|run the plan|implement plan)\b/i.test(
    t,
  )
}

function userWantsCanvas(text) {
  return /\b(canvas|wireframe|mockup|design doc|visual design|layout design|docs design)\b/i.test(String(text || ''))
}

function isPlanPath(rel) {
  const n = String(rel || '')
    .replace(/^[/\\]+/, '')
    .replace(/\\/g, '/')
    .toLowerCase()
  return n === 'plan.md' || n.endsWith('/plan.md')
}

function isCanvasPath(rel) {
  const n = String(rel || '')
    .replace(/^[/\\]+/, '')
    .replace(/\\/g, '/')
    .toLowerCase()
  return n === 'canvas.md' || n.endsWith('/canvas.md')
}

module.exports = {
  PLAN_FILENAME,
  CANVAS_FILENAME,
  planPath,
  canvasPath,
  readPlanDocument,
  writePlanDocument,
  writeCanvasDocument,
  userAskingAboutCapabilities,
  userWantsPlanFirst,
  shouldWritePlanArtifact,
  userWantsBuildPlan,
  userWantsCanvas,
  isPlanPath,
  isCanvasPath,
}
