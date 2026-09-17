import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fetchAnalytics, fetchBilling } from '../../lib/api'
import { navigate, openTab } from '../../lib/nav'
import {
  BILLING_PLANS,
  PLAN_CREDIT,
  TOKENS_PER_CREDIT,
  checkoutPath,
  isUnpaidPlan,
  planById,
  planLabel,
  planPriceLine,
  type PaidPlanId,
} from '../../../shared/plans'
import { ADDITIONAL_MODEL_ROWS, EVERYDAY_MODEL_ROWS } from '../../../shared/planAchievements'
import { modelById } from '../../../shared/models'
import { planPoolSummary, sumPoolUsageUsd } from '../../../shared/usagePools'
import { CycleToggle, PlanGrid } from '../PlanPicker'
import { PaymentPayouts } from '../pay/PaymentPayouts'
import { commitPendingPayMethod } from '../../lib/pay-wallet'

export { UsagePanel } from './UsagePanel'
export { KeysPanel } from './KeysPanel'

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-white/[0.06] bg-[#141413] p-6">{children}</div>
}

function monthEnd() {
  const date = new Date()
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function daysLeft(until: Date) {
  const ms = until.getTime() - new Date().setHours(0, 0, 0, 0)
  return Math.max(0, Math.ceil(ms / 86400000))
}

function SharpBar({ value, max = 100, tone = 'white' }: { value: number; max?: number; tone?: 'white' | 'soft' | 'accent' }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100))
  const fill = tone === 'accent' ? 'bg-[#f54e00]' : tone === 'soft' ? 'bg-white/40' : 'bg-white/80'
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.08]">
      <div className={`h-full rounded-full transition-[width] duration-300 ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function SpendCard({
  children,
  compact,
  onClick,
}: {
  children: ReactNode
  compact?: boolean
  onClick?: () => void
}) {
  const cls = `flex h-full flex-col gap-5 rounded-2xl border border-white/[0.07] bg-[#141413] text-left ${
    compact ? 'p-6' : 'p-7'
  } ${onClick ? 'transition hover:border-white/[0.12] hover:bg-[#171716]' : ''}`

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {children}
      </button>
    )
  }

  return <div className={cls}>{children}</div>
}

function ModelChip({ name, locked }: { name: string; locked?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] leading-none ${
        locked
          ? 'border-white/[0.08] bg-white/[0.02] text-white/40'
          : 'border-white/[0.12] bg-white/[0.05] text-white/85'
      }`}
    >
      {locked ? <span className="mr-1.5 text-[10px] uppercase tracking-wide text-white/30">Locked</span> : null}
      {name}
    </span>
  )
}

function ModelPoolBlock({
  title,
  subtitle,
  models,
  locked,
  usageLabel,
  usagePct,
  footnote,
  onUpgrade,
}: {
  title: string
  subtitle: string
  models: { id: string; tagline: string }[]
  locked?: boolean
  usageLabel?: string
  usagePct?: number
  footnote: string
  onUpgrade?: () => void
}) {
  return (
    <article
      className={`rounded-2xl border p-6 sm:p-7 ${
        locked
          ? 'border-dashed border-white/[0.09] bg-white/[0.012]'
          : 'border-white/[0.07] bg-[#141413]'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="min-w-0 space-y-1.5">
          <h3 className="text-[15px] font-medium tracking-[-0.01em] text-white/95">{title}</h3>
          <p className="max-w-md text-[13px] leading-relaxed text-white/42">{subtitle}</p>
        </div>
        {usageLabel ? (
          <p className="shrink-0 text-[12px] font-medium tabular-nums text-white/48 sm:pt-0.5 sm:text-right">{usageLabel}</p>
        ) : null}
      </div>

      {typeof usagePct === 'number' ? (
        <div className="mt-6">
          <SharpBar value={usagePct} tone={locked ? 'soft' : usagePct > 85 ? 'accent' : 'white'} />
        </div>
      ) : null}

      <ul className="mt-6 space-y-2.5">
        {models.map((row) => {
          const name = modelById(row.id).name
          return (
            <li
              key={row.id}
              className={`rounded-xl border px-4 py-3.5 ${
                locked
                  ? 'border-white/[0.05] bg-black/15'
                  : 'border-white/[0.05] bg-white/[0.02]'
              }`}
            >
              <p className={`text-[13px] font-medium ${locked ? 'text-white/42' : 'text-white/86'}`}>{name}</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-white/38">{row.tagline}</p>
            </li>
          )
        })}
      </ul>

      <p className="mt-6 text-[13px] leading-relaxed text-white/35">{footnote}</p>

      {locked && onUpgrade ? (
        <button
          type="button"
          onClick={onUpgrade}
          className="mt-6 rounded-lg bg-[#f54e00] px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-[#ff6420]"
        >
          Upgrade to Pro — unlock Additional models
        </button>
      ) : null}
    </article>
  )
}

export function SpendingPanel({ plan }: { plan?: string }) {
  const [currentId, setCurrentId] = useState(plan === 'teams' ? 'team' : plan || 'hobby')
  const isUnpaid = isUnpaidPlan(currentId)
  const credit = PLAN_CREDIT[currentId] || 0
  const currentPlan = planById(currentId)
  const [cycleStart, setCycleStart] = useState<Date | null>(null)
  const [cycleEnd, setCycleEnd] = useState<Date>(() => monthEnd())
  const reset = cycleEnd
  const left = daysLeft(reset)
  const [includedTokens, setIncludedTokens] = useState(0)
  const [byokTokens, setByokTokens] = useState(0)
  const [cheapUsedUsd, setCheapUsedUsd] = useState(0)
  const [premiumUsedUsd, setPremiumUsedUsd] = useState(0)
  const [busy, setBusy] = useState(false)
  const [usageReady, setUsageReady] = useState(false)
  const [status, setStatus] = useState('')
  useEffect(() => {
    if (plan) setCurrentId(plan === 'teams' ? 'team' : plan)
  }, [plan])

  useEffect(() => {
    const paidFlag = new URLSearchParams(window.location.search).get('paid')
    if (paidFlag === '1') {
      setStatus(
        'Payment confirmed. Your plan is active on web and Desktop — receipt emailed to you.',
      )
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setUsageReady(false)

    fetchBilling()
      .then((data) => {
        if (cancelled) return
        const nextId = data.plan === 'teams' ? 'team' : data.plan || 'hobby'
        setCurrentId(nextId)
        const paid = (data.orders || []).find((order) => order.status === 'paid')
        const started = data.planStartedAt || paid?.paid_at || paid?.period_start || null
        const renews = data.planRenewsAt || paid?.period_end || null
        const startDate = started
          ? new Date(started)
          : nextId === 'hobby'
            ? new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            : new Date()
        const endDate = renews
          ? new Date(renews)
          : nextId === 'hobby'
            ? monthEnd()
            : new Date(startDate.getTime())
        if (!renews && nextId !== 'hobby') endDate.setMonth(endDate.getMonth() + 1)
        setCycleStart(startDate)
        setCycleEnd(endDate)
        if (isUnpaidPlan(nextId)) {
          setUsageReady(true)
          return undefined
        }
        return fetchAnalytics({ from: startDate.toISOString(), to: new Date().toISOString() })
      })
      .then((data) => {
        if (cancelled || !data) return
        let included = 0
        let byok = 0
        for (const row of data.usage || []) {
          const n = (row.prompt_tokens || 0) + (row.completion_tokens || 0)
          if (row.billed_to === 'user') byok += n
          else included += n
        }
        setIncludedTokens(included)
        setByokTokens(byok)
        const pools = sumPoolUsageUsd(
          (data.usage || []).map((row) => ({
            model: row.model,
            prompt_tokens: row.prompt_tokens,
            completion_tokens: row.completion_tokens,
            billed_to: row.billed_to,
          })),
        )
        setCheapUsedUsd(pools.cheap)
        setPremiumUsedUsd(pools.premium)
        setUsageReady(true)
      })
      .catch(() => {
        if (!cancelled) setUsageReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [plan])

  const quota = credit * TOKENS_PER_CREDIT
  const byokPct = Math.min(100, Math.round((byokTokens / Math.max(quota, 1)) * 100))
  const poolMeta = planPoolSummary(currentId)
  const cheapPct = Math.min(100, Math.round((cheapUsedUsd / Math.max(poolMeta.cheapBudgetUsd, 0.0001)) * 100))
  const premiumPct = poolMeta.premiumBudgetUsd
    ? Math.min(100, Math.round((premiumUsedUsd / poolMeta.premiumBudgetUsd) * 100))
    : 0
  const resetLabel = reset.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  function upgrade(next: PaidPlanId) {
    navigate(checkoutPath(next))
  }

  const upgradeId: PaidPlanId | null =
    isUnpaidPlan(currentId)
      ? 'start'
      : currentId === 'start'
        ? 'pro'
        : currentId === 'pro'
          ? 'pro_plus'
          : null
  const upgradePlan = upgradeId ? BILLING_PLANS.find((item) => item.id === upgradeId) : null

  return (
    <div className="mx-auto w-full max-w-[880px] space-y-14">
      {isUnpaid ? (
        <div className="grid gap-5 md:grid-cols-2">
          <SpendCard compact>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/35">Current status</p>
              <p className="mt-2 text-[18px] font-medium tracking-[-0.02em]">No active plan</p>
              <p className="mt-2 text-[13px] leading-relaxed text-white/45">
                Subscribe to use Soumtok models in Studio and Desktop — or add your own API keys.
              </p>
            </div>
          </SpendCard>
          <SpendCard compact>
            <div>
              <p className="text-[18px] font-medium tracking-[-0.02em]">
                Start {planPriceLine(BILLING_PLANS.find((item) => item.id === 'start')!)}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-white/45">
                $5/mo Everyday pool — DeepSeek Flash, DeepSeek Pro, GPT-4.1 Mini
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => upgrade('start')}
              className="self-start rounded-lg bg-[#f54e00] px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-[#ff6420] disabled:opacity-50"
            >
              {busy ? 'Opening…' : 'Subscribe — $5/mo'}
            </button>
          </SpendCard>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <SpendCard>
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/35">Current plan</p>
              <p className="text-[22px] font-medium tracking-[-0.03em] text-white">
                {currentPlan.name} {currentId === 'hobby' ? '' : planPriceLine(currentPlan)}
              </p>
              <p className="text-[13px] leading-relaxed text-white/45">
                {cycleStart
                  ? `Started ${cycleStart.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                  : 'New plan'}
              </p>
              <p className="text-[13px] text-white/45">
                Renews {reset.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ·{' '}
                {left} {left === 1 ? 'day' : 'days'} left
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/dashboard/billing')}
              className="mt-auto self-start rounded-lg border border-white/[0.14] px-4 py-2 text-[13px] text-white/80 transition hover:border-white/25 hover:bg-white/[0.04]"
            >
              Adjust Plan
            </button>
          </SpendCard>
          {upgradePlan && upgradeId && (
            <SpendCard>
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/35">Upgrade available</p>
                <p className="text-[22px] font-medium tracking-[-0.03em] text-white">
                  {upgradePlan.name} {planPriceLine(upgradePlan)}
                </p>
                <p className="text-[13px] leading-relaxed text-white/45">
                  {upgradeId === 'pro_plus'
                    ? '3× Pro capacity — $24 Everyday + $24 Additional each month.'
                    : upgradeId === 'pro'
                      ? 'Unlock a second pool for frontier models — separate from Everyday.'
                      : '$5/mo Everyday models to start coding.'}
                </p>
              </div>
              {upgradeId === 'pro' && (
                <div className="flex flex-wrap gap-2">
                  {ADDITIONAL_MODEL_ROWS.map((row) => (
                    <ModelChip key={row.id} name={modelById(row.id).name} locked />
                  ))}
                </div>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => upgrade(upgradeId)}
                className="mt-auto self-start rounded-lg bg-[#f54e00] px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-[#ff6420] disabled:opacity-50"
              >
                {busy ? 'Opening…' : 'Upgrade'}
              </button>
            </SpendCard>
          )}
        </div>
      )}

      {!isUnpaid && (
        <section className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-[16px] font-medium tracking-[-0.02em] text-white/92">Models on your plan</h2>
            <p className="text-[13px] text-white/40">Pool usage resets on {resetLabel}.</p>
          </div>
          <div className="space-y-6">
            <ModelPoolBlock
              title="Everyday pool"
              subtitle={`Included on ${currentPlan.name} · $${poolMeta.cheapDisplayUsd.toFixed(0)}/mo budget`}
              models={[...EVERYDAY_MODEL_ROWS]}
              usageLabel={
                usageReady
                  ? `$${cheapUsedUsd.toFixed(2)} / $${poolMeta.cheapDisplayUsd.toFixed(2)} (${cheapPct}%)`
                  : 'Usage updating…'
              }
              usagePct={usageReady ? cheapPct : undefined}
              footnote="Fast, affordable models for daily coding. Does not touch your Additional budget."
            />
            {poolMeta.premiumDisplayUsd > 0 ? (
              <ModelPoolBlock
                title="Additional pool"
                subtitle={`Included on ${currentPlan.name} · $${poolMeta.premiumDisplayUsd.toFixed(0)}/mo budget`}
                models={[...ADDITIONAL_MODEL_ROWS]}
                usageLabel={
                  usageReady
                    ? `$${premiumUsedUsd.toFixed(2)} / $${poolMeta.premiumDisplayUsd.toFixed(2)} (${premiumPct}%)`
                    : 'Usage updating…'
                }
                usagePct={usageReady ? premiumPct : undefined}
                footnote="Frontier models on a separate pool — switch when you need Opus, GPT-6, or Sonnet."
              />
            ) : (
              <ModelPoolBlock
                title="Additional models"
                subtitle="Pro ($20/mo) — separate $10/mo pool, not shared with Everyday"
                models={[...ADDITIONAL_MODEL_ROWS]}
                locked
                footnote="Upgrade to Pro to use Claude Opus, GPT-6 Astra, Claude Sonnet, and Grok without BYOK."
                onUpgrade={() => upgrade('pro')}
              />
            )}
            <article className="rounded-2xl border border-white/[0.07] bg-[#141413] p-6 sm:p-7">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <h3 className="text-[15px] font-medium text-white/92">Other models</h3>
                  <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-white/42">
                    Your own API keys — billed by the provider, not Soumtok.
                  </p>
                </div>
                <span className="shrink-0 text-[12px] font-medium tabular-nums text-white/48">
                  {usageReady ? `${byokPct}% used` : 'Updating…'}
                </span>
              </div>
              {usageReady ? (
                <div className="mt-6">
                  <SharpBar value={byokPct} tone="soft" />
                </div>
              ) : null}
            </article>
          </div>
        </section>
      )}
      {status && (
        <p
          className={`text-[13px] ${
            /confirmed|saved|active/i.test(status) ? 'text-emerald-400' : 'text-[#f54e00]'
          }`}
        >
          {status}
        </p>
      )}
    </div>
  )
}


function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function cycleStartingLabel(date: Date) {
  return `Cycle Starting ${date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`
}

function monthLabel(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

type UsageWindow = { id: string; label: string; start: Date; end: Date }

function usageCycleWindows(
  planStartedAt: string | null,
  planRenewsAt: string | null,
  planCycle: 'monthly' | 'annual',
): UsageWindow[] {
  const now = new Date()
  const windows: UsageWindow[] = []
  if (planStartedAt) {
    const start = new Date(planStartedAt)
    const end = planRenewsAt
      ? new Date(planRenewsAt)
      : planCycle === 'annual'
        ? new Date(start.getFullYear() + 1, start.getMonth(), start.getDate(), start.getHours(), start.getMinutes())
        : new Date(start.getFullYear(), start.getMonth() + 1, start.getDate(), start.getHours(), start.getMinutes())
    windows.push({ id: 'cycle', label: cycleStartingLabel(start), start, end })
  }
  for (let i = 0; i < 3; i += 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    windows.push({
      id: `m-${start.getFullYear()}-${start.getMonth()}`,
      label: monthLabel(start),
      start,
      end,
    })
  }
  return windows
}

function CyclePicker({
  value,
  options,
  onChange,
}: {
  value: string
  options: UsageWindow[]
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const selected = options.find((item) => item.id === value) || options[0]

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((next) => !next)}
        className="inline-flex items-center gap-2 rounded-md border border-white/12 bg-transparent px-2.5 py-1 text-[12px] text-white/70 outline-none hover:border-white/20 hover:text-white"
      >
        {selected?.label}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden className="text-white/40">
          <path d="M2.2 3.6 5 6.4l2.8-2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-30 mt-1.5 min-w-[220px] overflow-hidden rounded-md border border-white/[0.1] bg-[#141413] py-1 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
        >
          {options.map((item) => {
            const active = item.id === selected?.id
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(item.id)
                  setOpen(false)
                }}
                className={`block w-full px-3 py-2 text-left text-[13px] ${
                  active ? 'bg-white/[0.08] text-white' : 'text-white/75 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function BillingPanel({ plan }: { plan?: string }) {
  const [current, setCurrent] = useState(plan || 'hobby')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState<PaidPlanId | null>(null)
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly')
  const [plansOpen, setPlansOpen] = useState(false)
  const [usageWindow, setUsageWindow] = useState(() => {
    const now = new Date()
    return `m-${now.getFullYear()}-${now.getMonth()}`
  })
  const [orders, setOrders] = useState<
    {
      id: string
      plan: string
      status: string
      amount: string
      currency?: string
      created_at: string
      paid_at?: string | null
      receipt_number?: string | null
    }[]
  >([])
  const [planCycle, setPlanCycle] = useState<'monthly' | 'annual'>('monthly')
  const [planStartedAt, setPlanStartedAt] = useState<string | null>(null)
  const [planRenewsAt, setPlanRenewsAt] = useState<string | null>(null)
  const [usage, setUsage] = useState<
    { model: string; billed_to: string; calls: number; prompt_tokens: number; completion_tokens: number }[]
  >([])

  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get('paypal')
    if (flag === 'success') {
      commitPendingPayMethod()
      setStatus('Payment confirmed. Your plan is active on web and Desktop — receipt emailed to you.')
    }
    if (flag === 'cancel') setStatus('Checkout was cancelled.')
    if (flag === 'error') setStatus('Checkout could not confirm the payment.')

    fetchBilling()
      .then((data) => {
        setCurrent(data.plan === 'teams' ? 'team' : data.plan)
        setOrders(data.orders)
        setPlanCycle(data.planCycle === 'annual' ? 'annual' : 'monthly')
        setPlanStartedAt(data.planStartedAt || null)
        setPlanRenewsAt(data.planRenewsAt || null)
        if (data.planStartedAt) setUsageWindow('cycle')
        if (flag === 'success' && data.plan && data.plan !== 'hobby') {
          setStatus(
            `You're on ${planLabel(data.plan)}. Plan active on web and Desktop — receipt emailed to you.`,
          )
        } else if (!data.paypal && flag !== 'success') {
          setStatus('Checkout is not connected on the server.')
        }
      })
      .catch(() => setStatus('Could not load billing'))
  }, [])

  const usageWindows = useMemo(
    () => usageCycleWindows(planStartedAt, planRenewsAt, planCycle),
    [planStartedAt, planRenewsAt, planCycle],
  )
  const selectedWindow = usageWindows.find((item) => item.id === usageWindow) || usageWindows[0]

  useEffect(() => {
    if (!usageWindows.some((item) => item.id === usageWindow)) {
      setUsageWindow(usageWindows[0].id)
    }
  }, [usageWindow, usageWindows])

  useEffect(() => {
    if (!selectedWindow) return
    let cancelled = false
    fetchAnalytics({ from: selectedWindow.start.toISOString(), to: selectedWindow.end.toISOString() })
      .then((data) => {
        if (!cancelled) setUsage(data.usage || [])
      })
      .catch(() => {
        if (!cancelled) setUsage([])
      })
    return () => {
      cancelled = true
    }
  }, [selectedWindow])

  useEffect(() => {
    if (!plansOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPlansOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [plansOpen])

  function checkout(next: PaidPlanId) {
    navigate(checkoutPath(next, cycle))
  }

  const currentPlan = planById(current)
  const unpaid = isUnpaidPlan(current)
  const tokenRows = usage.map((row) => ({
    ...row,
    tokens: row.prompt_tokens + row.completion_tokens,
  }))
  const included = tokenRows.filter((row) => row.billed_to !== 'user')
  const other = tokenRows.filter((row) => row.billed_to === 'user')
  const includedTotal = included.reduce((sum, row) => sum + row.tokens, 0)
  const otherTotal = other.reduce((sum, row) => sum + row.tokens, 0)
  const tokenTotal = includedTotal + otherTotal
  const now = new Date()
  const started = planStartedAt ? new Date(planStartedAt) : new Date(now.getFullYear(), now.getMonth(), 1)
  const renews = planRenewsAt
    ? new Date(planRenewsAt)
    : new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const renewAmount = unpaid ? '' : currentPlan.price

  return (
    <div className="space-y-3">
      {unpaid && (
        <div className="save-banner flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3">
          <p className="text-[13px] font-medium">Start at $5/mo — Everyday models included</p>
          <button
            type="button"
            onClick={() => checkout('start')}
            className="save-banner-btn"
          >
            Subscribe
          </button>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[680px]">
            <p className="text-[12px] text-white/40">Current plan</p>
            <p className="mt-1 text-[22px] font-medium tracking-[-0.03em]">
              {currentPlan.name}{' '}
              <span className="font-medium text-white/90">
                {unpaid ? 'Subscribe' : planPriceLine(currentPlan)}
              </span>
            </p>
            <p className="mt-3 text-[13px] leading-6 text-white/70">{currentPlan.explain}</p>
            {!unpaid && (
              <p className="mt-3 text-[13px] leading-6 text-white/45">
                Your {planCycle === 'annual' ? 'annual' : 'monthly'} cycle started{' '}
                {started.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                {planStartedAt
                  ? ` at ${started.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                  : ''}
                . It auto-renews on{' '}
                {renews.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. You will
                be charged {renewAmount} plus applicable taxes.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setPlansOpen(true)}
            className="rounded-md border border-white/15 px-3 py-1.5 text-[13px] text-white hover:bg-white/[0.05]"
          >
            Adjust plan
          </button>
        </div>
        {status && <p className="mt-4 text-[13px] text-[#f54e00]">{status}</p>}
      </Card>

      <PaymentPayouts />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] font-medium">Included usage</p>
          <CyclePicker
            value={selectedWindow?.id || usageWindows[0].id}
            options={usageWindows}
            onChange={setUsageWindow}
          />
        </div>
        <UsageGroup
          title="Soumtok models"
          rows={included}
          groupTotal={includedTotal}
          allTotal={tokenTotal}
        />
        <UsageGroup
          title="Other models"
          rows={other}
          groupTotal={otherTotal}
          allTotal={tokenTotal}
        />
      </Card>

      <Card>
        <p className="text-[15px] font-medium">Invoices</p>
        {orders.length === 0 ? (
          <p className="mt-3 text-[13px] text-white/45">No invoices yet. Paid plans show here after checkout.</p>
        ) : (
          <div className="mt-4 table-scroll overflow-hidden rounded-lg border border-white/[0.06]">
            <div className="min-w-[520px]">
            <div className="grid grid-cols-[1fr_1.4fr_auto_auto] gap-3 px-4 py-2 text-[12px] text-white/40">
              <span>Date</span>
              <span>Description</span>
              <span>Status</span>
              <span>Amount</span>
            </div>
            {orders.map((order) => {
              const paidStatus = /paid|active|success|approved/i.test(order.status)
              const when = order.paid_at || order.created_at
              const amount = order.currency === 'KES' ? `KES ${order.amount}` : `$${order.amount}`
              return (
                <div
                  key={order.id}
                  className="grid grid-cols-[1fr_1.4fr_auto_auto] gap-3 border-t border-white/[0.05] px-4 py-2.5 text-[13px]"
                >
                  <span>{new Date(when).toLocaleDateString()}</span>
                  <span>
                    {planLabel(order.plan)}
                    {order.receipt_number ? (
                      <span className="mt-0.5 block text-[11px] text-white/35">{order.receipt_number}</span>
                    ) : null}
                  </span>
                  <span className={paidStatus ? 'text-emerald-400' : 'text-white/55'}>
                    {paidStatus ? 'Paid' : order.status}
                  </span>
                  <span>{amount}</span>
                </div>
              )
            })}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[15px] font-medium">Cancel</p>
            <p className="mt-1 text-[13px] text-white/50">We'll be sad to see you go.</p>
          </div>
          <a
            href="https://www.paypal.com/myaccount/autopay/"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-white/15 px-3 py-1.5 text-[13px] text-white/80 hover:bg-white/[0.05]"
          >
            Cancel
          </a>
        </div>
      </Card>

      {plansOpen && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/75 px-4 py-8"
          onClick={() => setPlansOpen(false)}
        >
          <div
            role="dialog"
            aria-labelledby="adjust-plan-title"
            className="relative max-h-[90vh] w-full max-w-[1240px] overflow-y-auto rounded-2xl border border-white/10 bg-[#141413] px-6 py-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setPlansOpen(false)}
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center text-[22px] leading-none text-white/45 hover:text-white"
            >
              ×
            </button>
            <h2 id="adjust-plan-title" className="text-center text-[20px] font-medium">
              Adjust your plan
            </h2>
            <div className="mt-5">
              <CycleToggle cycle={cycle} onChange={setCycle} />
            </div>
            <div className="mt-7">
              <PlanGrid cycle={cycle} currentId={current} busy={busy} onChoose={checkout} />
            </div>
            <p className="mt-6 text-center text-[12px] text-white/40">
              Need more for your business?{' '}
              <a href="mailto:info@soumtok.com" className="text-white/70 underline">
                Learn more about our Enterprise plans
              </a>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function UsageGroup({
  title,
  rows,
  groupTotal,
  allTotal,
}: {
  title: string
  rows: { model: string; tokens: number }[]
  groupTotal: number
  allTotal: number
}) {
  return (
    <div className="mt-4 table-scroll">
      <div className="min-w-0 w-full max-w-full">
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-1 py-2 text-[13px] font-medium">
        <span>{title}</span>
        <span className="text-white/70">{formatTokens(groupTotal)} tokens</span>
        <span className="text-white/50">{allTotal ? `${((groupTotal / allTotal) * 100).toFixed(1)}%` : '0.0%'}</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-1 pb-1 text-[13px] text-white/35">No usage this cycle</p>
      ) : (
        rows
          .slice()
          .sort((a, b) => b.tokens - a.tokens)
          .map((row) => (
            <div key={row.model} className="grid grid-cols-[1fr_auto_auto] gap-3 px-1 py-1.5 text-[13px] text-white/55">
              <span className="truncate pl-4">{row.model}</span>
              <span>{formatTokens(row.tokens)} tokens</span>
              <span>{groupTotal ? `${((row.tokens / groupTotal) * 100).toFixed(1)}%` : '0.0%'}</span>
            </div>
          ))
      )}
      </div>
    </div>
  )
}
