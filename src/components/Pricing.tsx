import { useState } from 'react'
import { navigate } from '../lib/nav'
import { CycleToggle, PlanGrid } from './PlanPicker'
import { checkoutPath, type PaidPlanId } from '../../shared/plans'

export function Pricing() {
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly')

  return (
    <section id="pricing" className="py-20">
      <div className="wide-wrap">
        <h2 className="text-center text-[28px] font-semibold tracking-[-0.03em] sm:text-[36px] md:text-[44px]">
          Start coding from $13.99
        </h2>
        <p className="mx-auto mt-4 max-w-[480px] text-center text-[15px] text-white/50">
          The cheapest powerful AI coding platform in Africa. Trial is free. Annual saves 20%.
        </p>
        <div className="mt-8">
          <CycleToggle cycle={cycle} onChange={setCycle} />
        </div>
        <div className="mt-8">
          <PlanGrid
            cycle={cycle}
            onChoose={(id: PaidPlanId) => navigate(checkoutPath(id, cycle))}
          />
        </div>
        <p className="mt-8 text-center text-[13px] text-white/40">
          Need Team seats?{' '}
          <a href="/contact" className="text-white/70 underline">
            Write the desk
          </a>
        </p>
      </div>
    </section>
  )
}
