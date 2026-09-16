import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fetchAnalytics, fetchBilling } from '../../lib/api'
import { navigate, openTab } from '../../lib/nav'
import {
  BILLING_PLANS,
  PLAN_CREDIT,
  TOKENS_PER_CREDIT,
  TRIAL_TOKEN_QUOTA,
  checkoutPath,
  planLabel,
  planPriceLine,
  type PaidPlanId,
} from '../../../shared/plans'
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
  const fill = tone === 'accent' ? 'bg-[#f54e00]' : tone === 'soft' ? 'bg-white/35' : 'bg-white/75'
  return (
    <div className="h-1.5 w-full bg-white/10">
      <div className={`h-full ${fill}`} style={{ width: `${pct}%` }} />
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
  const cls = `flex h-full flex-col rounded-xl border border-white/12 bg-[#141413] text-left ${
    compact ? 'p-4' : 'min-h-[168px] p-5'
  } ${onClick ? 'transition hover:bg-white/[0.03]' : ''}`

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {children}
      </button>
    )
  }

  return <div className={cls}>{children}</div>
}

export function SpendingPanel({ plan }: { plan?: string }) {
  const [currentId, setCurrentId] = useState(plan === 'teams' ? 'team' : plan || 'hobby')
  const isTrial = currentId === 'hobby'
  const credit = PLAN_CREDIT[currentId] || PLAN_CREDIT.hobby
  const currentPlan = BILLING_PLANS.find((item) => item.id === currentId) || BILLING_PLANS[0]
  const [cycleStart, setCycleStart] = useState<Date | null>(null)
  const [cycleEnd, setCycleEnd] = useState<Date>(() => monthEnd())
  const reset = cycleEnd
  const left = daysLeft(reset)
  const [includedTokens, setIncludedTokens] = useState(0)
  const [byokTokens, setByokTokens] = useState(0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [limitMode, setLimitMode] = useState<'fixed' | 'unlimited'>(() => {
    return localStorage.getItem('soumtok-spend-mode') === 'unlimited' ? 'unlimited' : 'fixed'
  })
  const [limit, setLimit] = useState(() => Number(localStorage.getItem('soumtok-spend-limit') || 50))

  useEffect(() => {
    setCurrentId(plan === 'teams' ? 'team' : plan || 'hobby')
    let cancelled = false
    fetchBilling()
      .then((data) => {
        if (cancelled) return
        const nextId = data.plan === 'teams' ? 'team' : data.plan || 'hobby'
        setCurrentId(nextId)
        const paid = (data.orders || []).find((order) => order.status === 'paid')
        const started = data.planStartedAt || paid?.paid_at || paid?.period_start || null
        const renews = data.planRenewsAt || paid?.period_end || null
        const startDate = started ? new Date(started) : nextId === 'hobby' ? new Date(new Date().getFullYear(), new Date().getMonth(), 1) : new Date()
        const endDate = renews
          ? new Date(renews)
          : nextId === 'hobby'
            ? monthEnd()
            : new Date(startDate.getTime())
        if (!renews && nextId !== 'hobby') endDate.setMonth(endDate.getMonth() + 1)
        setCycleStart(startDate)
        setCycleEnd(endDate)
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
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [plan])

  const quota = isTrial ? TRIAL_TOKEN_QUOTA : credit * TOKENS_PER_CREDIT
  const usedPct = Math.min(100, Math.round((includedTokens / Math.max(quota, 1)) * 100))
  const byokPct = Math.min(100, Math.round((byokTokens / Math.max(quota, 1)) * 100))
  const overTokens = Math.max(0, includedTokens + byokTokens - quota)
  const onDemand = (overTokens / 1_000_000) * 2
  const resetLabel = reset.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  function upgrade(next: PaidPlanId) {
    navigate(checkoutPath(next))
  }

  function saveLimit() {
    localStorage.setItem('soumtok-spend-mode', limitMode)
    localStorage.setItem('soumtok-spend-limit', String(limit))
    setStatus('Monthly limit saved.')
  }

  const upgradeId: PaidPlanId | null =
    currentId === 'hobby'
      ? 'pro'
      : currentId === 'pro'
        ? 'pro_plus'
        : currentId === 'pro_plus'
          ? 'ultra'
          : currentId === 'ultra'
            ? 'team'
            : null
  const upgradePlan = upgradeId ? BILLING_PLANS.find((item) => item.id === upgradeId) : null

  return (
    <div className="space-y-8">
      {isTrial ? (
        <div className="grid gap-3 md:grid-cols-2">
          <SpendCard compact onClick={() => upgrade('pro')}>
            <p className="text-[11px] text-white/40">Usage</p>
            <p className="mt-1.5 text-[16px] font-medium">{usedPct}% used</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full ${usedPct >= 100 ? 'bg-[#f54e00]' : 'bg-white/75'}`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            {usedPct >= 100 && (
              <p className="mt-2 text-[12px] text-[#f54e00]">Free trial ended — upgrade to keep coding.</p>
            )}
            <p className="mt-2 text-[11px] text-white/35">Resets monthly · {resetLabel}</p>
          </SpendCard>
          <SpendCard compact>
            <p className="text-[14px] font-medium">Pro {planPriceLine(BILLING_PLANS.find((item) => item.id === 'pro')!)}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => upgrade('pro')}
              className="mt-3 self-start rounded-md bg-white px-3 py-1.5 text-[12px] font-medium text-black disabled:opacity-50"
            >
              {busy ? 'Opening…' : 'Upgrade to Pro'}
            </button>
          </SpendCard>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <SpendCard>
            <p className="text-[11px] uppercase tracking-[0.08em] text-white/35">Current plan</p>
            <p className="mt-2 text-[20px] font-medium">
              {currentPlan.name} {currentId === 'hobby' ? '' : planPriceLine(currentPlan)}
            </p>
            <p className="mt-2 text-[13px] text-white/45">
              {cycleStart
                ? `Started ${cycleStart.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                : 'New plan'}
            </p>
            <p className="mt-1 text-[13px] text-white/45">
              Expires {reset.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ({left}{' '}
              {left === 1 ? 'day' : 'days'} left)
            </p>
            <button
              type="button"
              onClick={() => navigate('/dashboard/billing')}
              className="mt-auto self-start rounded-lg border border-white/18 px-3 py-1.5 text-[13px] text-white/80 hover:bg-white/[0.04]"
            >
              Adjust Plan
            </button>
          </SpendCard>
          {upgradePlan && upgradeId && (
            <SpendCard>
              <p className="text-[11px] uppercase tracking-[0.08em] text-white/35">Upgrade available</p>
              <p className="mt-2 text-[20px] font-medium">
                {upgradePlan.name} {planPriceLine(upgradePlan)}
              </p>
              <p className="mt-2 text-[13px] text-white/45">
                {upgradeId === 'pro_plus'
                  ? 'Unlock more usage on Agent and frontier models.'
                  : upgradeId === 'ultra'
                    ? '10x Pro usage, highest throughput, and earliest access.'
                    : 'Shared rules, usage analytics, and Team seats.'}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => upgrade(upgradeId)}
                className="mt-auto self-start rounded-lg bg-white px-4 py-2 text-[13px] font-medium text-black disabled:opacity-50"
              >
                {busy ? 'Opening…' : 'Upgrade'}
              </button>
            </SpendCard>
          )}
        </div>
      )}

      {!isTrial && (
        <>
          <div>
            <p className="mb-3 text-[13px] text-white/40">Included in {currentPlan.name}</p>
            <div className="space-y-6">
              <div>
                <div className="mb-2 flex items-center justify-between text-[13px]">
                  <span>Soumtok models · DeepSeek, Gemini, Claude, Grok, and GPT</span>
                  <span className="text-white/40">{usedPct}% used</span>
                </div>
                <SharpBar value={usedPct} />
                <p className="mt-2 text-[12px] text-white/35">
                  Additional usage beyond limits consumes Other models quota or on-demand spend.{' '}
                  <button type="button" className="text-white/55 underline" onClick={() => openTab('/docs/billing')}>
                    Learn more
                  </button>
                </p>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-[13px]">
                  <span>Other models</span>
                  <span className="text-white/40">{byokPct}% used</span>
                </div>
                <SharpBar value={byokPct} tone="soft" />
                <p className="mt-2 text-[12px] text-white/35">
                  Your own keys. Additional usage beyond limits consumes on-demand spend.
                </p>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-3 text-[13px] text-white/40">On-demand</p>
            <div className="mb-2 flex items-center justify-between text-[13px]">
              <span>On-demand</span>
              <span className="text-white/40">
                ${onDemand.toFixed(2)} / {limitMode === 'unlimited' ? '∞' : `$${limit}`}
              </span>
            </div>
            <SharpBar value={onDemand} max={limitMode === 'unlimited' ? Math.max(onDemand, 1) : limit} tone="soft" />
            <p className="mt-2 text-[12px] text-white/35">Usage past your limit is billed later as on-demand.</p>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[13px]">Monthly limit</p>
                <p className="text-[12px] text-white/40">Set a fixed amount or make it unlimited.</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={limitMode}
                  onChange={(event) => setLimitMode(event.target.value as 'fixed' | 'unlimited')}
                  className="rounded-none border border-white/15 bg-[#0c0c0b] px-2 py-1.5 text-[13px]"
                >
                  <option value="fixed">Fixed</option>
                  <option value="unlimited">Unlimited</option>
                </select>
                {limitMode === 'fixed' && (
                  <input
                    type="number"
                    min={0}
                    value={limit}
                    onChange={(event) => setLimit(Number(event.target.value))}
                    className="w-16 rounded-none border border-white/15 bg-[#0c0c0b] px-2 py-1.5 text-[13px]"
                  />
                )}
                <button
                  type="button"
                  onClick={saveLimit}
                  className="rounded-none border border-white/15 px-3 py-1.5 text-[13px] text-white/70 hover:bg-white/[0.04]"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      {status && <p className="text-[13px] text-[#f54e00]">{status}</p>}
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
      setStatus('Payment confirmed. A receipt was sent to your email.')
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
          setStatus(`You're on ${planLabel(data.plan)}. A receipt was sent to your email.`)
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

  const currentPlan = BILLING_PLANS.find((item) => item.id === current) || BILLING_PLANS[0]
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
  const cycleLabel = selectedWindow?.label || cycleStartingLabel(started)
  const credit = PLAN_CREDIT[current] || PLAN_CREDIT.hobby
  const quota = credit * TOKENS_PER_CREDIT
  const overTokens = Math.max(0, tokenTotal - quota)
  const onDemand = (overTokens / 1_000_000) * 2
  const spendLimit = Number(localStorage.getItem('soumtok-spend-limit') || 50)
  const renewAmount = current === 'hobby' ? '' : currentPlan.price

  return (
    <div className="space-y-3">
      {current === 'hobby' && (
        <div className="save-banner flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3">
          <p className="text-[13px] font-medium">Switch to annual billing and save 20%</p>
          <button
            type="button"
            onClick={() => {
              setCycle('annual')
              setPlansOpen(true)
            }}
            className="save-banner-btn"
          >
            Upgrade now
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
                {current === 'hobby' ? 'Free' : planPriceLine(currentPlan)}
              </span>
            </p>
            <p className="mt-3 text-[13px] leading-6 text-white/70">{currentPlan.explain}</p>
            {current !== 'hobby' && (
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] font-medium">On-demand usage</p>
          <span className="text-[12px] text-white/40">{cycleLabel}</span>
        </div>
        <p className="mt-4 text-[22px] font-medium tracking-[-0.03em]">
          ${onDemand.toFixed(2)} <span className="text-[14px] font-normal text-white/40">/ ${spendLimit.toFixed(2)}</span>
        </p>
        <p className="mt-2 text-[13px] text-white/45">
          Usage past your included limit is billed here as on-demand.
        </p>
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
