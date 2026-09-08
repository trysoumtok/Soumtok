import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PLAN_VAT_RATE,
  checkoutPath,
  formatKes,
  formatUsd,
  kesFromUsd,
  paidPlan,
  planChargeUsd,
  planDiscountUsd,
  planListUsd,
  planLabel,
  planMonthlyEquivalentUsd,
  planTotalUsd,
  planVatUsd,
  type BillingCycle,
  type PaidPlanId,
} from '../../shared/plans'
import { fetchBilling, fetchMpesaOrder, fetchProfile, startMpesaCheckout, startPaypalCheckout } from '../lib/api'
import {
  isMobileMethod,
  methodTitle,
  readPayWallet,
  rememberPayMethod,
  stashPendingPayMethod,
  walletDefault,
} from '../lib/pay-wallet'
import { useSession } from '../lib/auth-client'
import { navigate } from '../lib/nav'
import { Bone } from './Loaders'
import { AirtelMoneyLogo, MastercardLogo, MpesaLogo, PayPalLogo, VisaLogo } from './pay/PayLogos'

type Method = 'mpesa' | 'paypal'

type PaidReceipt = {
  orderId: string
  plan: string
  amount: string
  currency: string
  receiptNumber: string
  receiptUrl: string
}

function CheckoutSkeleton() {
  return (
    <div className="grid min-h-svh bg-white lg:grid-cols-2" role="status" aria-live="polite">
      <span className="sr-only">Loading checkout</span>
      <section className="bg-[#0a0a0a] px-6 py-6 md:px-12 md:py-8">
        <div className="mx-auto max-w-[480px]">
          <div className="flex items-center gap-3">
            <Bone className="h-8 w-8 rounded-full" />
            <Bone className="h-6 w-6 rounded-md" />
            <Bone className="h-4 w-48 rounded-full" />
          </div>
          <Bone className="mt-10 h-12 w-72 rounded-lg" />
          <Bone className="mt-3 h-4 w-40 rounded-full" />
          <Bone className="mt-8 h-36 w-full rounded-xl" />
          <Bone className="mt-8 h-4 w-full rounded-full" />
          <Bone className="mt-3 h-4 w-full rounded-full" />
          <Bone className="mt-5 h-6 w-full rounded-full" />
        </div>
      </section>
      <section className="px-6 py-8 md:px-12 md:py-10">
        <div className="mx-auto max-w-[440px]">
          <div className="grid grid-cols-2 gap-2">
            <Bone light className="h-24 rounded-md" />
            <Bone light className="h-24 rounded-md" />
          </div>
          <Bone light className="mt-8 h-4 w-36 rounded-full" />
          <Bone light className="mt-3 h-11 w-full rounded-md" />
          <Bone light className="mt-6 h-4 w-32 rounded-full" />
          <Bone light className="mt-3 h-24 w-full rounded-md" />
          <Bone light className="mt-6 h-12 w-full rounded-md" />
        </div>
      </section>
    </div>
  )
}

export function CheckoutPage() {
  const { data: session } = useSession()
  const params = new URLSearchParams(window.location.search)
  const requested = paidPlan(params.get('plan') || 'pro')
  const plan = requested || paidPlan('pro')!
  const planId = plan.id as PaidPlanId
  const teamName = params.get('team')?.trim() || ''
  const [cycle, setCycle] = useState<BillingCycle>(params.get('cycle') === 'annual' ? 'annual' : 'monthly')
  const [method, setMethod] = useState<Method>('paypal')
  const [savedLabel, setSavedLabel] = useState('')
  const [email, setEmail] = useState(session?.user.email || '')
  const [phone, setPhone] = useState('')
  const [rate, setRate] = useState(130)
  const [paypalOn, setPaypalOn] = useState(true)
  const [mpesaOn, setMpesaOn] = useState(true)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(params.get('paypal') === 'cancel' ? 'Checkout was cancelled.' : '')
  const [paid, setPaid] = useState<PaidReceipt | null>(null)
  const [homeIn, setHomeIn] = useState(8)
  const resumed = useRef(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchBilling()
        .then((data) => {
          if (cancelled) return
          if (data.usdToKes) setRate(data.usdToKes)
          setPaypalOn(Boolean(data.paypal))
          setMpesaOn(data.payhero !== false)
        })
        .catch(() => undefined),
      fetchProfile()
        .then((profile) => {
          if (cancelled) return
          const chosen = walletDefault(readPayWallet())
          if (chosen && isMobileMethod(chosen.kind)) {
            setMethod('mpesa')
            if (chosen.phone) setPhone(chosen.phone)
            else if (profile.phone) setPhone(profile.phone)
            setSavedLabel(methodTitle(chosen))
          } else {
            setMethod('paypal')
            if (chosen?.email) setEmail(chosen.email)
            else if (session?.user.email) setEmail(session.user.email)
            if (chosen) setSavedLabel(methodTitle(chosen))
            else if (profile.phone && !chosen) setPhone(profile.phone)
          }
        })
        .catch(() => undefined),
    ]).finally(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (session?.user.email && !email) setEmail(session.user.email)
  }, [session?.user.email, email])

  useEffect(() => {
    if (!paid) return
    setHomeIn(8)
    const tick = window.setInterval(() => {
      setHomeIn((value) => {
        if (value <= 1) {
          window.clearInterval(tick)
          navigate('/')
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => window.clearInterval(tick)
  }, [paid])

  const currency: 'KES' | 'USD' = method === 'mpesa' ? 'KES' : 'USD'
  const listUsd = planListUsd(plan, cycle)
  const discountUsd = planDiscountUsd(plan, cycle)
  const chargeUsd = planChargeUsd(plan, cycle)
  const vatUsd = planVatUsd(chargeUsd)
  const totalUsd = planTotalUsd(plan, cycle)
  const monthUsd = planMonthlyEquivalentUsd(plan, cycle)
  const money = (usd: number) => (currency === 'KES' ? formatKes(kesFromUsd(usd, rate)) : formatUsd(usd))
  const headline = money(monthUsd)
  const due = money(totalUsd)
  const vatPct = Math.round(PLAN_VAT_RATE * 100)
  const period = cycle === 'annual' ? 'year' : 'month'
  const unit = plan.id === 'team' || plan.id === 'team_plus' ? ' / user' : ''

  const points = useMemo(() => plan.points.slice(0, 3).join(' · '), [plan.points])

  function syncUrl(nextCycle: BillingCycle) {
    setCycle(nextCycle)
    const next = teamName
      ? `${checkoutPath(planId, nextCycle)}&team=${encodeURIComponent(teamName)}`
      : checkoutPath(planId, nextCycle)
    navigate(next)
  }

  async function goPaypal() {
    if (!paypalOn) throw new Error('PayPal is not connected.')
    window.location.href = await startPaypalCheckout(planId, cycle)
  }

  function showPaid(order: {
    orderId?: string
    plan?: string
    amount?: string
    currency?: string
    receiptNumber?: string | null
    receiptUrl?: string | null
  }) {
    if (!order.orderId) return
    rememberPayMethod({ kind: 'mpesa', phone: phone.trim() || undefined })
    setPaid({
      orderId: order.orderId,
      plan: order.plan || planId,
      amount: order.amount || String(Math.round(kesFromUsd(totalUsd, rate))),
      currency: order.currency || 'KES',
      receiptNumber: order.receiptNumber || 'Soumtok receipt',
      receiptUrl: order.receiptUrl || `/api/billing/receipt/${order.orderId}`,
    })
    setStatus('')
  }

  async function watchOrder(orderId: string) {
    setBusy(true)
    setStatus('Check your phone and enter your M-Pesa PIN.')
    const startedAt = Date.now()
    try {
      while (Date.now() - startedAt < 180_000) {
        const order = await fetchMpesaOrder(orderId)
        if (order.status === 'paid') {
          showPaid({ ...order, orderId })
          return
        }
        if (order.status === 'failed') throw new Error('M-Pesa payment failed. Try again.')
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
      setStatus('Still waiting for M-Pesa. Keep this page open, or try again.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Checkout failed')
    } finally {
      setBusy(false)
    }
  }

  async function subscribe() {
    setBusy(true)
    setStatus('')
    try {
      if (method === 'paypal') {
        stashPendingPayMethod({ kind: 'paypal', email: email.trim() || undefined })
        await goPaypal()
        return
      }
      if (!mpesaOn) throw new Error('Mobile money is not connected.')
      const started = await startMpesaCheckout(planId, cycle, phone)
      await watchOrder(started.orderId)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Checkout failed')
      setBusy(false)
    }
  }

  async function downloadReceipt() {
    if (!paid) return
    const res = await fetch(paid.receiptUrl, { credentials: 'include' })
    if (!res.ok) throw new Error('Could not download the receipt')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${paid.receiptNumber}.pdf`
    link.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    if (!ready || resumed.current || paid) return
    resumed.current = true
    fetchBilling()
      .then((data) => {
        const recent = (data.orders || []).find((order) => order.provider === 'payhero')
        if (!recent) return
        const age = Date.now() - new Date(recent.created_at).getTime()
        if (age > 45 * 60 * 1000) return
        if (recent.status === 'paid' && recent.receipt_number) {
          setPaid({
            orderId: recent.id,
            plan: recent.plan,
            amount: recent.amount,
            currency: recent.currency || 'KES',
            receiptNumber: recent.receipt_number,
            receiptUrl: `/api/billing/receipt/${recent.id}`,
          })
          return
        }
        if (recent.status === 'pending') void watchOrder(recent.id)
      })
      .catch(() => undefined)
  }, [ready, paid])

  if (!ready) return <CheckoutSkeleton />

  return (
    <div className="grid min-h-svh bg-white text-[#1a1a1a] lg:grid-cols-2">
      <section className="bg-[#0a0a0a] px-6 py-6 text-white md:px-12 md:py-8">
        <div className="mx-auto max-w-[480px]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="grid h-8 w-8 place-items-center text-white/55 hover:text-white"
              onClick={() => navigate(teamName ? '/team/new' : '/dashboard/spending')}
              aria-label="Back"
            >
              ←
            </button>
            <img src="/images/soumtok-logo-icon.png" alt="" className="h-6 w-6 object-contain" />
            <p className="min-w-0 truncate text-[14px] text-white/80 sm:text-[15px]">Subscribe to Soumtok {plan.name}</p>
          </div>

          <p className="mt-8 text-[32px] font-semibold leading-none tracking-[-0.04em] sm:mt-10 sm:text-[40px]">
            {headline}
            <span className="ml-1 text-[18px] font-normal text-white/45">
              per {cycle === 'annual' ? 'month' : 'month'}
              {unit}
            </span>
          </p>
          {cycle === 'annual' && (
            <p className="mt-2 text-[13px] text-white/40">
              Billed {due}
              {unit} per {period}
            </p>
          )}

          {method === 'mpesa' ? (
            <p className="mt-5 text-[13px] text-white/40">
              Charged in Kenyan shillings. 1 USD = {rate.toFixed(2)} KES. Rates can move.
            </p>
          ) : (
            <p className="mt-5 text-[13px] text-white/40">PayPal and cards are billed in USD.</p>
          )}

          <div className="mt-8 rounded-xl border border-white/12 bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <img src="/images/soumtok-logo-icon.png" alt="" className="h-8 w-8 shrink-0 object-contain" />
                <div className="min-w-0">
                  <p className="text-[14px] font-medium">Soumtok {plan.name}</p>
                  <p className="mt-1 text-[12px] leading-5 text-white/45">
                    {teamName ? `${teamName} · 1 seat` : points}
                  </p>
                </div>
              </div>
              <p className="shrink-0 text-[14px]">{money(monthUsd)}</p>
            </div>
            <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 border-t border-white/10 pt-4 text-[13px]">
              <span>Save 20% with annual billing</span>
              <button
                type="button"
                role="switch"
                aria-checked={cycle === 'annual'}
                onClick={() => syncUrl(cycle === 'annual' ? 'monthly' : 'annual')}
                className={`relative h-6 w-11 rounded-full ${cycle === 'annual' ? 'bg-[#635bff]' : 'bg-white/20'}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                    cycle === 'annual' ? 'left-5' : 'left-0.5'
                  }`}
                />
              </button>
            </label>
            {cycle === 'annual' && (
              <p className="mt-2 text-[12px] text-emerald-400">
                20% off · you save {money(discountUsd)} on the year
              </p>
            )}
          </div>

          <dl className="mt-8 space-y-2 text-[13px]">
            <div className="flex justify-between text-white/55">
              <dt>{cycle === 'annual' ? 'Subtotal · 12 months' : 'Subtotal'}</dt>
              <dd>{money(listUsd)}</dd>
            </div>
            {discountUsd > 0 && (
              <div className="flex justify-between text-emerald-400">
                <dt>Annual discount (20%)</dt>
                <dd>−{money(discountUsd)}</dd>
              </div>
            )}
            <div className="flex justify-between text-white/55">
              <dt>VAT ({vatPct}%)</dt>
              <dd>{money(vatUsd)}</dd>
            </div>
            <div className="flex justify-between border-t border-white/10 pt-3 text-[15px] font-medium">
              <dt>Total due today</dt>
              <dd>{due}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="px-6 py-8 md:px-12 md:py-10">
        <div className="mx-auto max-w-[440px]">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setMethod('mpesa')
                const chosen = walletDefault(readPayWallet())
                if (chosen && isMobileMethod(chosen.kind)) {
                  if (chosen.phone) setPhone(chosen.phone)
                  setSavedLabel(methodTitle(chosen))
                } else {
                  setSavedLabel('')
                }
              }}
              className={`rounded-md border bg-white px-3 py-3 text-left ${
                method === 'mpesa' ? 'border-[#111] ring-2 ring-[#111]/15' : 'border-[#d6d6d6]'
              }`}
            >
              <span className="flex h-8 items-center">
                <MpesaLogo className="h-7 w-auto max-w-[110px]" />
              </span>
              <span className="mt-2 flex h-8 items-center">
                <AirtelMoneyLogo className="h-8 w-auto max-w-[36px]" />
              </span>
              <span className="mt-2 block text-[12px] text-[#666]">Mobile money</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMethod('paypal')
                const chosen = walletDefault(readPayWallet())
                if (chosen && !isMobileMethod(chosen.kind)) {
                  if (chosen.email) setEmail(chosen.email)
                  setSavedLabel(methodTitle(chosen))
                } else {
                  setSavedLabel('')
                }
              }}
              className={`rounded-md border bg-white px-3 py-3 text-left ${
                method === 'paypal' ? 'border-[#111] ring-2 ring-[#111]/15' : 'border-[#d6d6d6]'
              }`}
            >
              <span className="flex h-8 items-center">
                <PayPalLogo className="h-6 w-auto max-w-[110px]" />
              </span>
              <span className="mt-2 flex h-8 items-center gap-2">
                <VisaLogo className="h-4 w-auto max-w-[52px]" />
                <MastercardLogo className="h-7 w-auto max-w-[40px]" />
              </span>
              <span className="mt-2 block text-[12px] text-[#666]">PayPal or card</span>
            </button>
          </div>
          <div className="my-6 flex items-center gap-3 text-[12px] text-[#888]">
            <span className="h-px flex-1 bg-[#e6e6e6]" />
            OR
            <span className="h-px flex-1 bg-[#e6e6e6]" />
          </div>

          <label className="block text-[14px] font-medium">Contact information</label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            className="mt-2 w-full rounded-md border border-[#d6d6d6] px-3 py-2.5 text-[14px] outline-none focus:border-[#635bff]"
          />

          <p className="mt-6 text-[14px] font-medium">Payment method</p>
          {savedLabel && <p className="mt-1 text-[13px] text-[#666]">Using {savedLabel}</p>}
          {method === 'mpesa' ? (
            <div className="mt-2 rounded-md border border-[#d6d6d6] p-3">
              <p className="text-[13px] text-[#555]">M-Pesa · charged in Kenyan shillings</p>
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="07XX XXX XXX"
                className="mt-2 w-full rounded-md border border-[#d6d6d6] px-3 py-2.5 text-[14px] outline-none focus:border-[#635bff]"
              />
              <p className="mt-2 text-[12px] text-[#888]">
                You will get an STK prompt on this number for {formatKes(kesFromUsd(totalUsd, rate))}.
              </p>
            </div>
          ) : (
            <div className="mt-2 rounded-md border border-[#d6d6d6] p-3 text-[13px] leading-6 text-[#555]">
              Continue on PayPal to pay with your PayPal balance or a Visa / Mastercard. PayPal bills in USD (
              {formatUsd(totalUsd)}
              {unit} per {period}).
            </div>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={subscribe}
            className="mt-6 w-full rounded-md bg-black py-3 text-[15px] font-medium text-white disabled:opacity-50"
          >
            {busy ? (method === 'mpesa' ? 'Waiting for M-Pesa…' : 'Opening PayPal…') : 'Subscribe'}
          </button>
          {status && (
            <p
              className={`mt-3 text-[13px] ${
                status.toLowerCase().includes('check your phone') ? 'text-[#555]' : 'text-[#c13515]'
              }`}
            >
              {status}
            </p>
          )}

          <p className="mt-6 text-[11px] leading-5 text-[#888]">
            By subscribing, you authorize Soumtok to charge you {due}
            {unit} {cycle === 'annual' ? 'each year' : 'each month'} until you cancel. Mobile money is collected
            through PayHero (M-Pesa). Cards and PayPal go through PayPal.
          </p>
          <p className="mt-4 flex gap-4 text-[11px] text-[#888]">
            <button type="button" className="hover:underline" onClick={() => navigate('/terms')}>
              Terms
            </button>
            <button type="button" className="hover:underline" onClick={() => navigate('/privacy')}>
              Privacy
            </button>
          </p>
        </div>
      </section>

      {paid ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 px-4">
          <div className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-[#141413] px-6 py-7 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <p className="text-[12px] tracking-[0.08em] text-[#f54e00]">PAYMENT CONFIRMED</p>
            <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.03em]">
              You are on Soumtok {planLabel(paid.plan)}
            </h2>
            <p className="mt-3 text-[14px] leading-6 text-white/55">
              {paid.currency} {paid.amount} · {paid.receiptNumber}
            </p>
            <button
              type="button"
              onClick={() => void downloadReceipt()}
              className="mt-6 w-full rounded-md bg-white py-2.5 text-[14px] font-medium text-black"
            >
              Download receipt PDF
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="mt-3 w-full rounded-md border border-white/15 py-2.5 text-[14px] text-white"
            >
              Back to home
            </button>
            <p className="mt-4 text-center text-[12px] text-white/40">Taking you home in {homeIn}s</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
