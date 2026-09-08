import { useEffect, useState } from 'react'
import {
  BILLING_PLANS,
  formatUsd,
  paidPlan,
  planChargeUsd,
  planMonthlyEquivalentUsd,
  teamCheckoutPath,
  type BillingCycle,
} from '../../shared/plans'
import { fetchBilling } from '../lib/api'
import { useSession } from '../lib/auth-client'
import { navigate } from '../lib/nav'

type SeatId = 'team' | 'team_plus'

const SEATS: { id: SeatId; title: string; price: string; note?: string }[] = [
  { id: 'team', title: 'Standard', price: '$32/user/mo.' },
  { id: 'team_plus', title: 'Premium · 5x usage', price: '$96/user/mo.', note: 'Highest Agent limits for the workspace' },
]

function teamNameFrom(display?: string | null) {
  const base = (display || 'My').trim().split(/\s+/)[0] || 'My'
  return base.endsWith('s') ? `${base}' Team` : `${base}'s Team`
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3.4 8.2 6.3 11l6.3-6.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function unusedCredit(data: {
  plan: string
  planCycle?: 'monthly' | 'annual'
  planStartedAt?: string | null
  planRenewsAt?: string | null
}) {
  if (data.plan === 'hobby' || data.plan === 'team' || data.plan === 'team_plus' || data.plan === 'teams') {
    return { usd: 0, days: 0, name: '' }
  }
  const plan = paidPlan(data.plan)
  const start = data.planStartedAt ? new Date(data.planStartedAt) : null
  const end = data.planRenewsAt ? new Date(data.planRenewsAt) : null
  if (!plan || !start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { usd: 0, days: 0, name: '' }
  }
  const span = end.getTime() - start.getTime()
  const left = end.getTime() - Date.now()
  if (span <= 0 || left <= 0) return { usd: 0, days: 0, name: '' }
  const paid = planChargeUsd(plan, data.planCycle === 'annual' ? 'annual' : 'monthly')
  return {
    usd: Number((paid * (left / span)).toFixed(2)),
    days: Math.max(1, Math.round(left / 86_400_000)),
    name: plan.name,
  }
}

export function NewTeamPage() {
  const { data: session } = useSession()
  const [name, setName] = useState(teamNameFrom(session?.user.name))
  const [seat, setSeat] = useState<SeatId>('team')
  const [cycle, setCycle] = useState<BillingCycle>('annual')
  const [share, setShare] = useState(true)
  const [credit, setCredit] = useState({ usd: 0, days: 0, name: '' })

  useEffect(() => {
    if (session?.user.name && name === teamNameFrom(undefined)) setName(teamNameFrom(session.user.name))
  }, [session?.user.name, name])

  useEffect(() => {
    fetchBilling()
      .then((data) => setCredit(unusedCredit(data)))
      .catch(() => undefined)
  }, [])

  const plan = BILLING_PLANS.find((item) => item.id === seat) || paidPlan('team')!
  const monthUsd = planMonthlyEquivalentUsd(plan, cycle)

  const summary = `1 seat, ${formatUsd(monthUsd)}/user/mo`

  function continueToPay() {
    const team = name.trim() || teamNameFrom(session?.user.name)
    sessionStorage.setItem(
      'soumtok-team-setup',
      JSON.stringify({ name: team, seat, cycle, shareAnalytics: share }),
    )
    navigate(teamCheckoutPath(seat, cycle, team))
  }

  return (
    <div className="theme-app min-h-svh bg-[#0b0b0a] text-white">
      <div className="mx-auto w-full max-w-[560px] px-5 py-8 md:py-12">
        <button
          type="button"
          onClick={() => navigate('/dashboard/members')}
          className="text-[13px] text-white/50 hover:text-white"
        >
          ← Back
        </button>

        <div className="mt-8 rounded-2xl border border-white/[0.06] bg-[#141413] px-5 py-7 md:px-8 md:py-8">
          <h1 className="text-[26px] font-medium tracking-[-0.03em] md:text-[30px]">Tell us about your team</h1>

          <label className="mt-8 block text-[13px] text-white/55">Team name</label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-[#0c0c0b] px-3 py-2.5 text-[14px] outline-none focus:border-white/22"
          />

          <p className="mt-7 text-[13px] text-white/55">Seat Type</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {SEATS.map((item) => {
              const on = seat === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSeat(item.id)}
                  className={`rounded-xl border px-4 py-3 text-left ${
                    on ? 'border-white/25 bg-white/[0.04]' : 'border-white/10 hover:border-white/16'
                  }`}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span>
                      <span className="block text-[14px] font-medium">{item.title}</span>
                      <span className="mt-1 block text-[13px] text-white/50">{item.price}</span>
                      {item.note && <span className="mt-1 block text-[12px] text-white/35">{item.note}</span>}
                    </span>
                    {on && (
                      <span className="text-white">
                        <Check />
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>

          <p className="mt-7 text-[13px] text-white/55">Billing Preference</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(
              [
                { id: 'annual', label: 'Yearly', badge: 'Save 20%' },
                { id: 'monthly', label: 'Monthly' },
              ] as const
            ).map((item) => {
              const on = cycle === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCycle(item.id)}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left ${
                    on ? 'border-white/25 bg-white/[0.04]' : 'border-white/10 hover:border-white/16'
                  }`}
                >
                  <span className="flex items-center gap-2 text-[14px]">
                    {item.label}
                    {'badge' in item && item.badge && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-400">
                        {item.badge}
                      </span>
                    )}
                  </span>
                  {on && <Check />}
                </button>
              )
            })}
          </div>

          <label className="mt-7 flex items-start gap-3 text-[14px]">
            <input
              type="checkbox"
              checked={share}
              onChange={(event) => setShare(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              Share Soumtok Analytics
              <span className="mt-1 block text-[12px] leading-5 text-white/40">
                My team&apos;s data may be used to improve Soumtok for all users.
              </span>
            </span>
          </label>

          <div className="mt-7 rounded-xl border border-white/[0.06] bg-[#10100f] px-4 py-4 text-[13px]">
            {credit.usd > 0 && (
              <div className="mb-3 flex items-start justify-between gap-3">
                <span>
                  <span className="block text-white/70">Prorated credit</span>
                  <span className="mt-0.5 block text-[12px] text-white/35">
                    For {credit.days} unused days on {credit.name}
                  </span>
                </span>
                <span className="text-emerald-400">−{formatUsd(credit.usd)}</span>
              </div>
            )}
            <div className="flex items-start justify-between gap-3 border-t border-white/[0.06] pt-3">
              <span>
                <span className="block text-white/70">Due today</span>
                <span className="mt-0.5 block text-[12px] text-white/35">{summary}</span>
              </span>
              <span className="text-[15px] font-medium">{formatUsd(monthUsd)}</span>
            </div>
            <p className="mt-3 text-[12px] leading-5 text-white/35">
              Monthly rate shown here. The full period and VAT are collected on checkout.
            </p>
          </div>

          <button
            type="button"
            onClick={continueToPay}
            className="mt-6 w-full rounded-lg bg-white py-3 text-[15px] font-medium text-black hover:bg-[#f2f2f0]"
          >
            Continue
          </button>
          <p className="mt-4 text-center text-[12px] leading-5 text-white/40">
            Continue to enter your payment info and start a new {cycle === 'annual' ? 'yearly' : 'monthly'} Team
            subscription. You can add teammates after you pay.
          </p>
        </div>
      </div>
    </div>
  )
}
