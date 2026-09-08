import {
  BILLING_PLANS,
  PRICING_PLAN_IDS,
  formatUsd,
  monthlyUnit,
  planMonthlyEquivalentUsd,
  planMonthlySavedUsd,
  type PaidPlanId,
} from '../../shared/plans'

export function CycleToggle({
  cycle,
  onChange,
}: {
  cycle: 'monthly' | 'annual'
  onChange: (cycle: 'monthly' | 'annual') => void
}) {
  return (
    <div className="text-center">
      <div className="inline-flex rounded-full border border-white/10 bg-[#1b1b19] p-1">
        <button
          type="button"
          onClick={() => onChange('monthly')}
          className={`rounded-full px-4 py-1.5 text-[13px] ${
            cycle === 'monthly' ? 'bg-white text-black' : 'text-white/55'
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => onChange('annual')}
          className={`rounded-full px-4 py-1.5 text-[13px] ${
            cycle === 'annual' ? 'bg-white text-black' : 'text-white/55'
          }`}
        >
          Annual
        </button>
      </div>
      <p className="mt-3 text-[12px] text-emerald-400">Save 20% when billed annually</p>
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
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {paid.map((item) => {
        const mine = currentId === item.id
        const team = item.id === 'team'
        const monthlyPay = planMonthlyEquivalentUsd(item, cycle)
        const monthlyCut = planMonthlySavedUsd(item)
        return (
          <article
            key={item.id}
            className={`flex flex-col rounded-xl border p-5 ${
              item.featured ? 'border-white/16 bg-[#161614]' : 'border-white/10 bg-[#121211]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[15px] font-medium">{item.name}</p>
              {mine && (
                <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] text-white/70">Current plan</span>
              )}
            </div>
            <p className="mt-4 text-[28px] font-semibold tracking-[-0.03em]">
              {formatUsd(monthlyPay)}
              <span className="ml-1 text-[13px] font-normal text-white/45">{monthlyUnit(item.id)}</span>
            </p>
            {cycle === 'annual' ? (
              <p className="mt-1.5 text-[12px] text-white/45">
                <span className="mr-2 line-through decoration-white/35">{item.price}</span>
                <span className="text-emerald-400">Save {formatUsd(monthlyCut)} / mo</span>
              </p>
            ) : (
              <p className="mt-1.5 text-[12px] text-white/35">Billed monthly</p>
            )}
            <p className="mt-3 text-[13px] leading-6 text-white/65">{item.explain}</p>
            <ul className="mt-5 flex-1 space-y-2.5 text-[13px] leading-5 text-white/85">
              {item.points.map((point) => (
                <li key={point} className="flex gap-2">
                  <span className="mt-0.5 text-white/70">✓</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={mine || busy != null}
              onClick={() => onChoose(item.id as PaidPlanId)}
              className={`mt-6 w-full rounded-md px-3 py-2 text-[13px] font-medium disabled:opacity-50 ${
                mine
                  ? 'border border-white/10 text-white/45'
                  : team
                    ? 'border border-white/18 text-white hover:bg-white/[0.04]'
                    : 'bg-white text-black'
              }`}
            >
              {mine
                ? 'Your current plan'
                : busy === item.id
                  ? 'Opening checkout...'
                  : team
                    ? 'Get Team'
                    : 'Choose plan'}
            </button>
          </article>
        )
      })}
    </div>
  )
}
