export const PAID_PLAN_IDS = ['pro', 'pro_plus', 'ultra', 'team', 'team_plus'] as const
export const PRICING_PLAN_IDS = ['pro', 'pro_plus', 'ultra', 'team'] as const
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number]

export type BillingPlan = {
  id: 'hobby' | PaidPlanId
  name: string
  price: string
  amount: string
  tagline: string
  explain: string
  detail: string
  points: string[]
  featured?: boolean
}

export const BILLING_PLANS: BillingPlan[] = [
  {
    id: 'hobby',
    name: 'Trial',
    price: 'Free',
    amount: '0.00',
    tagline: 'For students and weekend builders',
    explain:
      'Try Studio, a few cloud runs, and community models before you pay. Enough for school work and weekend projects.',
    detail: 'Free while you try Studio',
    points: [
      'A short Studio try on two cheap models',
      'DeepSeek V4 Flash only',
      'When the free trial ends, coding stops until you upgrade',
      'One GitHub project',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$13.99',
    amount: '13.99',
    tagline: 'Daily coding',
    explain:
      'Entry plan for daily coding. Premium models, unlimited tab completions, and cloud agents when you need them.',
    detail: 'Best for everyday Studio work',
    points: [
      'Extended limits on Studio and cloud agents',
      'Unlimited tab and inline edit',
      'Priority access to ready models',
      'Automations, memories, and MCP tools',
      'Maximum context windows on supported models',
    ],
  },
  {
    id: 'pro_plus',
    name: 'Pro Plus',
    price: '$48',
    amount: '48.00',
    tagline: '3x usage, frontier models',
    explain: 'Get 3x more usage than Pro and unlock higher limits on Agent and frontier models.',
    detail: 'When Pro starts to feel tight',
    points: [
      'Everything in Pro',
      '3x usage on Studio and agents',
      'Higher limits on Agent and premium models',
      'GPT-6, Opus, and other frontier models',
      'Priority access to premium capacity',
    ],
    featured: true,
  },
  {
    id: 'ultra',
    name: 'Ultra',
    price: '$149',
    amount: '149.00',
    tagline: 'Maximum Agent capacity',
    explain: 'Maximum value for heavy Agent work. About 10x Pro usage, earliest access, and the highest throughput.',
    detail: 'For people who live in Studio',
    points: [
      'Everything in Pro Plus',
      '10x usage on Studio and agents',
      'Highest limits on Agent and frontier models',
      'Priority access to new features',
      'Highest throughput and capacity',
    ],
  },
  {
    id: 'team',
    name: 'Team',
    price: '$32',
    amount: '32.00',
    tagline: 'Shared workspace, per seat',
    explain: 'Everything on Pro Plus, plus shared rules, analytics, and seats for a team that ships together.',
    detail: 'Per user / month',
    points: [
      'Cloud agents with shared team context',
      'Team-wide rules, skills, and automations',
      'SSO ready and workspace privacy',
      'Usage analytics',
      'Centralized team billing',
    ],
  },
  {
    id: 'team_plus',
    name: 'Team Premium',
    price: '$96',
    amount: '96.00',
    tagline: '5x Team usage',
    explain: 'Team seats with about 5x usage and the highest Agent limits for the workspace.',
    detail: 'Per user / month',
    points: [
      'Everything on Team',
      '5x usage on Studio and agents',
      'Highest Agent limits for the workspace',
      'Shared rules, skills, and automations',
      'Centralized team billing',
    ],
  },
]

export const TOKENS_PER_CREDIT = 8000

/** Enough for a few short Trial replies. Not sold as credits in the UI. */
export const TRIAL_TOKEN_QUOTA = 12_000

export const PLAN_CREDIT: Record<string, number> = {
  hobby: 1,
  pro: 40,
  pro_plus: 120,
  ultra: 400,
  team: 200,
  teams: 200,
  team_plus: 1000,
}

export function paidPlan(id: string) {
  const resolved = id === 'teams' ? 'team' : id
  return BILLING_PLANS.find((plan) => plan.id === resolved && PAID_PLAN_IDS.includes(plan.id as PaidPlanId))
}

export function hasPaidPlan(id?: string | null) {
  const resolved = id === 'teams' ? 'team' : id || 'hobby'
  return PAID_PLAN_IDS.includes(resolved as PaidPlanId)
}

export function planLabel(id?: string | null) {
  if (id === 'teams') return 'Team'
  return BILLING_PLANS.find((plan) => plan.id === id)?.name || 'Trial'
}

export function isTeamPlan(id?: string | null) {
  return id === 'team' || id === 'teams' || id === 'team_plus'
}

export function planPriceLine(plan: BillingPlan) {
  return plan.id === 'team' || plan.id === 'team_plus' ? `${plan.price} / user / mo.` : `${plan.price} / mo.`
}

export const PLAN_VAT_RATE = 0.08

export function annualPrice(amount: string) {
  const monthly = Number(amount)
  if (!Number.isFinite(monthly) || monthly <= 0) return 'Free'
  const yearly = monthly * 12 * 0.8
  return `$${yearly % 1 === 0 ? yearly.toFixed(0) : yearly.toFixed(2)}`
}

export function planUnit(id: string, cycle: 'monthly' | 'annual' = 'monthly') {
  if (id === 'team' || id === 'team_plus') return cycle === 'annual' ? '/ user / yr' : '/ user / mo'
  return cycle === 'annual' ? '/ yr' : '/ mo'
}

export function monthlyUnit(id: string) {
  return id === 'team' || id === 'team_plus' ? '/ user / mo' : '/ mo'
}

export type BillingCycle = 'monthly' | 'annual'

export function planChargeUsd(plan: BillingPlan, cycle: BillingCycle) {
  const monthly = Number(plan.amount)
  if (!Number.isFinite(monthly) || monthly <= 0) return 0
  return cycle === 'annual' ? Number((monthly * 12 * 0.8).toFixed(2)) : monthly
}

export function planListUsd(plan: BillingPlan, cycle: BillingCycle) {
  const monthly = Number(plan.amount)
  if (!Number.isFinite(monthly) || monthly <= 0) return 0
  return cycle === 'annual' ? Number((monthly * 12).toFixed(2)) : monthly
}

export function planDiscountUsd(plan: BillingPlan, cycle: BillingCycle) {
  if (cycle !== 'annual') return 0
  return Number((planListUsd(plan, cycle) - planChargeUsd(plan, cycle)).toFixed(2))
}

export function planVatUsd(subtotal: number) {
  return Number((Math.max(0, subtotal) * PLAN_VAT_RATE).toFixed(2))
}

export function planTotalUsd(plan: BillingPlan, cycle: BillingCycle) {
  const subtotal = planChargeUsd(plan, cycle)
  return Number((subtotal + planVatUsd(subtotal)).toFixed(2))
}

export function planMonthlyEquivalentUsd(plan: BillingPlan, cycle: BillingCycle) {
  const monthly = Number(plan.amount)
  if (!Number.isFinite(monthly) || monthly <= 0) return 0
  return cycle === 'annual' ? Number((monthly * 0.8).toFixed(2)) : monthly
}

export function planMonthlySavedUsd(plan: BillingPlan) {
  const monthly = Number(plan.amount)
  if (!Number.isFinite(monthly) || monthly <= 0) return 0
  return Number((monthly * 0.2).toFixed(2))
}

export function kesFromUsd(usd: number, rate: number) {
  return Number((usd * rate).toFixed(2))
}

export function formatKes(amount: number) {
  return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatUsd(amount: number) {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function checkoutPath(plan: string, cycle: BillingCycle = 'monthly') {
  return `/checkout?plan=${encodeURIComponent(plan)}&cycle=${cycle}`
}

export function teamSetupPath() {
  return '/team/new'
}

export function teamCheckoutPath(plan: 'team' | 'team_plus', cycle: BillingCycle, teamName: string) {
  const params = new URLSearchParams({
    plan,
    cycle,
    team: teamName,
  })
  return `/checkout?${params.toString()}`
}
