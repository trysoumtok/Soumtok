import {
  BILLING_PLANS,
  PRICING_PLAN_IDS,
  formatUsd,
  planChargeUsd,
  planDiscountUsd,
  planMonthlyEquivalentUsd,
  type PaidPlanId,
} from '../../shared/plans'

const FEATURE_INTRO: Record<(typeof PRICING_PLAN_IDS)[number], string> = {
  start: 'Includes',
  pro: 'Everything in Start, plus',
  pro_plus: 'Everything in Pro, plus',
}

export function CycleToggle({
  cycle,
  onChange,
}: {
  cycle: 'monthly' | 'annual'
  onChange: (cycle: 'monthly' | 'annual') => void
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="inline-flex rounded-full border border-white/10 bg-[#1b1b19] p-1">
        <button
          type="button"
          onClick={() => onChange('monthly')}
          className={`rounded-full px-5 py-1.5 text-[13px] font-medium transition-colors ${
            cycle === 'monthly' ? 'bg-white text-black' : 'text-white/55 hover:text-white/80'
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => onChange('annual')}
          className={`rounded-full px-5 py-1.5 text-[13px] font-medium transition-colors ${
            cycle === 'annual' ? 'bg-white text-black' : 'text-white/55 hover:text-white/80'
          }`}
        >
          Yearly
          <span className="ml-1.5 text-[11px] font-normal text-emerald-500">−20%</span>
        </button>
      </div>
      {cycle === 'annual' && (
        <p className="text-[13px] text-emerald-400">Pay yearly — 2 months free on every plan</p>
      )}
    </div>
  )
}

export function PlanGrid({
  cycle,
  currentId,
  busy,
  onChoose,
}: {
  cycle: 'monthly' | 'annual'
  currentId?: string
  busy?: PaidPlanId | null
  onChoose: (id: PaidPlanId) => void
}) {
  const paid = BILLING_PLANS.filter((item) => PRICING_PLAN_IDS.includes(item.id as (typeof PRICING_PLAN_IDS)[number]))

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {paid.map((item) => {
        const planId = item.id as (typeof PRICING_PLAN_IDS)[number]
        const mine = currentId === item.id
        const featured = item.featured
        const monthlyPay = planMonthlyEquivalentUsd(item, cycle)
        const yearlyTotal = planChargeUsd(item, 'annual')
        const yearlySave = planDiscountUsd(item, 'annual')
        const cta =
          planId === 'start' ? 'Get Start' : planId === 'pro' ? 'Get Pro' : 'Get Pro Plus'

        return (
          <article
            key={item.id}
            className={`flex flex-col rounded-2xl border p-6 ${
              featured
                ? 'border-[#f54e00]/35 bg-[#161614] shadow-[0_0_48px_rgba(245,78,0,0.06)]'
                : 'border-white/10 bg-[#121211]'
            }`}
          >
            <div>
              <p className="text-[16px] font-semibold tracking-[-0.02em]">{item.name}</p>
              <p className="mt-1 text-[13px] text-white/45">{item.tagline}</p>
            </div>

            <div className="mt-6">
              <p className="text-[36px] font-semibold leading-none tracking-[-0.04em]">
                {formatUsd(monthlyPay)}
                <span className="ml-1 text-[15px] font-normal text-white/40">/ mo</span>
              </p>
              {cycle === 'annual' ? (
                <div className="mt-2 space-y-0.5">
                  <p className="text-[12px] text-white/45">
                    {formatUsd(yearlyTotal)} billed yearly
                    <span className="ml-2 line-through decoration-white/30">{formatUsd(Number(item.amount) * 12)}</span>
                  </p>
                  <p className="text-[12px] font-medium text-emerald-400">
                    Save {formatUsd(yearlySave)}/yr
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-[12px] text-white/35">Billed monthly</p>
              )}
            </div>

            <p className="mt-5 text-[13px] leading-6 text-white/55">{item.explain}</p>

            <div className="mt-6 flex-1">
              <p className="text-[12px] font-medium text-white/70">{FEATURE_INTRO[planId]}</p>
              <ul className="mt-3 space-y-2.5">
                {item.points.map((point) => (
                  <li key={point} className="flex gap-2.5 text-[13px] leading-5 text-white/80">
                    <span className="mt-0.5 shrink-0 text-white/50" aria-hidden>
                      ✓
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              disabled={mine || busy != null}
              onClick={() => onChoose(item.id as PaidPlanId)}
              className={`mt-8 w-full rounded-lg px-4 py-2.5 text-[14px] font-medium transition-colors disabled:opacity-50 ${
                mine
                  ? 'border border-white/10 text-white/45'
                  : featured
                    ? 'bg-white text-black hover:bg-white/90'
                    : 'border border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]'
              }`}
            >
              {mine ? 'Current plan' : busy === item.id ? 'Opening checkout…' : cta}
            </button>
          </article>
        )
      })}
    </div>
  )
}
