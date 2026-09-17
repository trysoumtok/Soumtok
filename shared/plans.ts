export const PAID_PLAN_IDS = ['start', 'pro', 'pro_plus', 'team', 'team_plus'] as const

export const PRICING_PLAN_IDS = ['start', 'pro', 'pro_plus'] as const

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



/** Legacy id after cancel or before first payment — not a product tier. */

export const UNPAID_PLAN: BillingPlan = {

  id: 'hobby',

  name: 'No active plan',

  price: '$5',

  amount: '0.00',

  tagline: 'Subscribe to start coding',

  explain: 'Soumtok is paid-only. Pick Start ($5/mo) to open Studio on Everyday models, or Pro for dual pools.',

  detail: 'Subscribe to Start',

  points: [

    'Start at $5/mo — Everyday models included',

    'Pro $20 — $10 Everyday + $10 Additional',

    'Pro ($20) unlocks bring-your-own API keys',

  ],

}



export const BILLING_PLANS: BillingPlan[] = [

  {

    id: 'start',

    name: 'Start',

    price: '$5',

    amount: '5.00',

    tagline: 'For everyday coding',

    explain: 'One Everyday pool on DeepSeek and GPT mini — enough for real Studio and Desktop work.',

    detail: 'Everyday models only',

    points: [

      'Soumtok Agent included free',

      '$5/mo Everyday pool — Flash, Pro, Mini',

      'Studio + Desktop, one account',

      'Image generation from the same pool',

    ],

  },

  {

    id: 'pro',

    name: 'Pro',

    price: '$20',

    amount: '20.00',

    tagline: 'For daily shipping',

    explain: 'Two pools — Everyday for cheap models, Additional for Opus and GPT-6.',

    detail: 'Best for daily Studio + Agent',

    points: [

      '$10 Everyday + $10 Additional pools',

      'Opus, GPT-6, Sonnet, Grok on Additional',

      'Pools tracked separately',

      'Automations, MCP, and Test Hub',

      'Bring your own API keys (BYOK) — code at vendor cost',

      'Higher context and Agent limits',

    ],

    featured: true,

  },

  {

    id: 'pro_plus',

    name: 'Pro Plus',

    price: '$48',

    amount: '48.00',

    tagline: 'For power users',

    explain: '3× Pro capacity — same dual pools, scaled for heavy Agent use.',

    detail: 'When Pro feels tight',

    points: [

      '$24 Everyday + $24 Additional pools',

      'Highest Agent throughput',

      'Frontier models on Additional',

      'Everything in Pro',

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



/** @deprecated Token quotas replaced by USD pools — kept for legacy analytics only. */

export const TRIAL_TOKEN_QUOTA = 0



export const PLAN_CREDIT: Record<string, number> = {

  hobby: 0,

  start: 5,

  pro: 20,

  pro_plus: 48,

  team: 32,

  teams: 32,

  team_plus: 96,

}



export function isUnpaidPlan(id?: string | null) {

  const resolved = id === 'teams' ? 'team' : id || 'hobby'

  return resolved === 'hobby' || resolved === 'trial'

}



export function paidPlan(id: string) {

  const resolved = id === 'teams' ? 'team' : id

  return BILLING_PLANS.find((plan) => plan.id === resolved && PAID_PLAN_IDS.includes(plan.id as PaidPlanId))

}



export function planById(id?: string | null): BillingPlan {

  if (isUnpaidPlan(id)) return UNPAID_PLAN

  const resolved = id === 'teams' ? 'team' : id || 'hobby'

  return BILLING_PLANS.find((plan) => plan.id === resolved) || UNPAID_PLAN

}



export function hasPaidPlan(id?: string | null) {

  const resolved = id === 'teams' ? 'team' : id || 'hobby'

  return PAID_PLAN_IDS.includes(resolved as PaidPlanId)

}



export function planLabel(id?: string | null) {

  if (isUnpaidPlan(id)) return 'Free — no plan'

  if (id === 'teams') return 'Team'

  return BILLING_PLANS.find((plan) => plan.id === id)?.name || 'Free — no plan'

}



/** BYOK (bring your own provider keys) — Pro and above only. */

export function canUseByok(id?: string | null) {

  const resolved = id === 'teams' ? 'team' : id || 'hobby'

  return resolved === 'pro' || resolved === 'pro_plus' || resolved === 'team' || resolved === 'team_plus'

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

