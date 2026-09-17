import type { AgentPlan } from './agent.ts'
import {
  BUILD_TEMPLATES,
  detectBuildTemplate,
  patternDeliverables,
  composeTemplateBrief,
  listTemplates,
} from './buildTemplateLibrary.cjs'

export type BuildTemplate = (typeof BUILD_TEMPLATES)[number]
export type BuildPatternId = BuildTemplate['id']

/** @deprecated use detectBuildTemplate */
export function detectBuildPattern(userText: string) {
  return detectBuildTemplate(userText)
}

export function enrichAgentPlan(plan: AgentPlan, userText: string): AgentPlan {
  const tpl = detectBuildTemplate(userText)
  if (!tpl) return plan
  if (plan.mode !== 'build' && plan.mode !== 'app' && plan.mode !== 'code') return plan
  const deliverables = [...new Set([...(tpl.deliverables || []), ...(plan.deliverables || [])])]
  const mustHave = [...new Set([...(tpl.mustHave || []), ...(plan.mustHave || [])])]
  const steps = tpl.steps?.length ? tpl.steps : plan.steps
  const instructions = [
    ...(plan.instructions || []),
    ...(tpl.guidelines || []).map((g) => `GUIDE: ${g}`),
    ...(tpl.antiPatterns || []).map((a) => `FORBIDDEN: ${a}`),
  ]
  return {
    ...plan,
    goal: plan.goal || tpl.title,
    steps,
    deliverables,
    mustHave,
    instructions,
  }
}

export function composeKnowledgeBrief(userText: string): string {
  return composeTemplateBrief(userText)
}

export { BUILD_TEMPLATES as BUILD_PATTERNS, patternDeliverables, listTemplates, detectBuildTemplate }
