import type { Hono } from 'hono'
import {
  kesFromUsd,
  paidPlan,
  planTotalUsd,
  planLabel,
  type BillingCycle,
  type PaidPlanId,
} from '../shared/plans.ts'
import { pool } from './db.ts'
import { env, hasPayhero, hasPaypal } from './env.ts'
import { receiptEmail, sendMail } from './mail.ts'
import {
  findRecentPayheroSuccess,
  mpesaCallbackPaid,
  mpesaCallbackReference,
  payheroStatus,
  startPayheroStk,
  type PayheroLookup,
} from './payhero.ts'
import { receiptPdf } from './receipt-pdf.ts'
import {
  createPaypalSubscription,
  getPaypalSubscription,
  verifyPaypalWebhook,
} from './paypal.ts'

type ReadyFn = (c: { req: { raw: Request } }) => Promise<{
  session: { user: { id: string; email?: string | null } } | null
  ready: boolean
}>

type OrderRow = {
  id: string
  user_id: string
  plan: string
  status: string
  amount: string
  currency: string
  provider: string
  cycle: string | null
  paypal_subscription_id: string | null
  paid_at: Date | string | null
  period_start: Date | string | null
  period_end: Date | string | null
  receipt_number: string | null
  receipt_sent_at: Date | string | null
}

function resourceId(resource: Record<string, unknown>) {
  return String(resource.id || resource.subscription_id || '')
}

function resourceUser(resource: Record<string, unknown>) {
  return String(resource.custom_id || '') || null
}

function asCycle(value: string | null | undefined): BillingCycle {
  return value === 'annual' ? 'annual' : 'monthly'
}

function addBillingPeriod(from: Date, cycle: BillingCycle) {
  const end = new Date(from.getTime())
  if (cycle === 'annual') end.setFullYear(end.getFullYear() + 1)
  else end.setMonth(end.getMonth() + 1)
  return end
}

function receiptNumber(orderId: string, paidAt: Date) {
  const y = paidAt.getUTCFullYear()
  const m = String(paidAt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(paidAt.getUTCDate()).padStart(2, '0')
  const tail = orderId.replace(/-/g, '').slice(0, 6).toUpperCase()
  return `STK-${y}${m}${d}-${tail}`
}

function asDate(value: Date | string | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function registerBilling(app: Hono, requireReadyUser: ReadyFn) {
  app.get('/api/billing/status', (c) =>
    c.json({
      paypal: hasPaypal(),
      payhero: hasPayhero(),
      mode: env.paypalMode,
      webhook: Boolean(env.paypalWebhookId),
      usdToKes: env.mpesaKesPerUsd,
    }),
  )

  app.get('/api/billing/me', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const profile = await pool.query(
      `SELECT plan, plan_status, paypal_subscription_id, plan_cycle, plan_started_at, plan_renews_at
       FROM profiles WHERE user_id = $1`,
      [session.user.id],
    )
    const orders = await pool.query(
      `SELECT id, plan, status, amount, currency, provider, cycle, created_at, paid_at,
              period_start, period_end, receipt_number
       FROM billing_orders
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 12`,
      [session.user.id],
    )
    const row = profile.rows[0] || {}
    return c.json({
      plan: row.plan || 'hobby',
      planStatus: row.plan_status || 'active',
      planCycle: asCycle(row.plan_cycle),
      planStartedAt: row.plan_started_at || null,
      planRenewsAt: row.plan_renews_at || null,
      subscriptionId: row.paypal_subscription_id || null,
      paypal: hasPaypal(),
      payhero: hasPayhero(),
      usdToKes: env.mpesaKesPerUsd,
      orders: orders.rows,
    })
  })

  app.post('/api/billing/checkout', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    if (!hasPaypal()) return c.json({ error: 'PayPal is not connected' }, 503)

    const body = await c.req.json<{ plan?: string; cycle?: BillingCycle }>()
    const plan = paidPlan(body.plan || '')
    const cycle: BillingCycle = body.cycle === 'annual' ? 'annual' : 'monthly'
    if (!plan) return c.json({ error: 'Choose a paid plan' }, 400)

    const checkout = await createPaypalSubscription(plan.id as PaidPlanId, session.user.id, cycle)
    const charge = planTotalUsd(plan, cycle).toFixed(2)
    await pool.query(
      `INSERT INTO billing_orders (id, user_id, plan, provider, paypal_subscription_id, status, amount, currency, cycle)
       VALUES ($1, $2, $3, 'paypal', $4, $5, $6, 'USD', $7)`,
      [
        crypto.randomUUID(),
        session.user.id,
        plan.id,
        checkout.subscriptionId,
        checkout.status.toLowerCase(),
        charge,
        cycle,
      ],
    )
    return c.json({ url: checkout.approveUrl, subscriptionId: checkout.subscriptionId })
  })

  app.post('/api/billing/mpesa', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)
    if (!hasPayhero()) return c.json({ error: 'Mobile money is not connected' }, 503)

    const body = await c.req.json<{ plan?: string; cycle?: BillingCycle; phone?: string }>()
    const plan = paidPlan(body.plan || '')
    const cycle: BillingCycle = body.cycle === 'annual' ? 'annual' : 'monthly'
    if (!plan) return c.json({ error: 'Choose a paid plan' }, 400)

    const chargeUsd = planTotalUsd(plan, cycle)
    const amountKes = Math.max(1, Math.round(kesFromUsd(chargeUsd, env.mpesaKesPerUsd)))
    const orderId = crypto.randomUUID()
    await pool.query(
      `INSERT INTO billing_orders (id, user_id, plan, provider, status, amount, currency, cycle, reference)
       VALUES ($1, $2, $3, 'payhero', 'pending', $4, 'KES', $5, $1)`,
      [orderId, session.user.id, plan.id, String(amountKes), cycle],
    )

    try {
      const stk = await startPayheroStk({
        amountKes,
        phone: body.phone || '',
        reference: orderId,
        customerName: session.user.email || 'Soumtok',
      })
      await pool.query(
        `UPDATE billing_orders SET reference = $2, checkout_id = $3, updated_at = NOW() WHERE id = $1`,
        [orderId, stk.reference || orderId, stk.checkoutId || null],
      )
      return c.json({
        orderId,
        checkoutId: stk.checkoutId,
        amountKes,
        status: 'pending',
        message: 'Check your phone and enter your M-Pesa PIN.',
      })
    } catch (error) {
      await pool.query(`UPDATE billing_orders SET status = 'failed', updated_at = NOW() WHERE id = $1`, [
        orderId,
      ])
      return c.json(
        { error: error instanceof Error ? error.message : 'Could not start M-Pesa' },
        502,
      )
    }
  })

  app.get('/api/billing/mpesa/:id', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const id = c.req.param('id')
    const row = await pool.query(
      `SELECT id, plan, status, amount, currency, cycle, reference, checkout_id,
              receipt_number, paid_at, period_start, period_end
       FROM billing_orders WHERE id = $1 AND user_id = $2`,
      [id, session.user.id],
    )
    const order = row.rows[0] as
      | {
          id: string
          plan: string
          status: string
          amount: string
          currency: string
          cycle: string
          reference: string | null
          checkout_id: string | null
          receipt_number: string | null
          paid_at: Date | string | null
          period_start: Date | string | null
          period_end: Date | string | null
        }
      | undefined
    if (!order) return c.json({ error: 'Order not found' }, 404)

    if (order.status === 'pending') {
      const refs = [order.reference, order.checkout_id, order.id].filter(Boolean) as string[]
      let remote: PayheroLookup = { status: 'unknown' }
      for (const ref of refs) {
        remote = await payheroStatus(ref)
        if (remote.status === 'success' || remote.status === 'failed') break
      }
      if (remote.status !== 'success' && remote.status !== 'failed') {
        const found = await findRecentPayheroSuccess(Math.round(Number(order.amount) || 0))
        if (found?.status === 'success') remote = found
      }
      if (remote.status === 'success') {
        const fulfilled = await fulfillPaidOrder({ expectedUserId: session.user.id, orderId: id })
        if (fulfilled.ok) {
          const fresh = await pool.query(
            `SELECT receipt_number, paid_at, period_start, period_end FROM billing_orders WHERE id = $1`,
            [id],
          )
          order.status = 'paid'
          order.receipt_number = fresh.rows[0]?.receipt_number || order.receipt_number
          order.paid_at = fresh.rows[0]?.paid_at || order.paid_at
          order.period_start = fresh.rows[0]?.period_start || order.period_start
          order.period_end = fresh.rows[0]?.period_end || order.period_end
        }
      } else if (remote.status === 'failed') {
        await pool.query(`UPDATE billing_orders SET status = 'failed', updated_at = NOW() WHERE id = $1`, [
          id,
        ])
        order.status = 'failed'
      }
    }

    return c.json({
      orderId: order.id,
      plan: order.plan,
      status: order.status,
      amount: order.amount,
      currency: order.currency,
      cycle: order.cycle,
      receiptNumber: order.receipt_number,
      paidAt: order.paid_at,
      periodStart: order.period_start,
      periodEnd: order.period_end,
      receiptUrl: order.status === 'paid' ? `/api/billing/receipt/${order.id}` : null,
    })
  })

  app.get('/api/billing/receipt/:id', async (c) => {
    const { session, ready } = await requireReadyUser(c)
    if (!session || !pool) return c.json({ error: 'Unauthorized' }, 401)
    if (!ready) return c.json({ error: 'Finish account setup first' }, 403)

    const id = c.req.param('id')
    const row = await pool.query(
      `SELECT o.id, o.plan, o.amount, o.currency, o.cycle, o.provider, o.receipt_number,
              o.paid_at, o.period_start, o.period_end, u.email
       FROM billing_orders o
       LEFT JOIN "user" u ON u.id = o.user_id
       WHERE o.id = $1 AND o.user_id = $2 AND o.status = 'paid'`,
      [id, session.user.id],
    )
    const order = row.rows[0]
    if (!order) return c.json({ error: 'Receipt not found' }, 404)

    const paidAt = asDate(order.paid_at) || new Date()
    const start = asDate(order.period_start) || paidAt
    const end = asDate(order.period_end) || addBillingPeriod(paidAt, asCycle(order.cycle))
    const pdf = receiptPdf({
      receiptNumber: order.receipt_number || receiptNumber(order.id, paidAt),
      planName: planLabel(order.plan),
      cycle: asCycle(order.cycle),
      amount: String(order.amount),
      currency: order.currency === 'KES' ? 'KES' : 'USD',
      method: order.provider === 'payhero' ? 'M-Pesa' : 'PayPal or card',
      paidAt: paidAt.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }),
      periodStart: start.toLocaleDateString('en-US', { dateStyle: 'long' }),
      periodEnd: end.toLocaleDateString('en-US', { dateStyle: 'long' }),
      email: order.email || undefined,
    })
    return new Response(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${order.receipt_number || 'soumtok-receipt'}.pdf"`,
      },
    })
  })

  app.post('/api/billing/mpesa/callback', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    if (!pool) return c.json({ ok: true })
    const reference = mpesaCallbackReference(body)
    if (reference) {
      await pool.query(
        `INSERT INTO billing_events (id, user_id, provider, event_type, paypal_id, payload)
         VALUES ($1, (SELECT user_id FROM billing_orders WHERE id = $2 LIMIT 1), 'payhero', $3, $2, $4::jsonb)`,
        [crypto.randomUUID(), reference, mpesaCallbackPaid(body) ? 'paid' : 'callback', JSON.stringify(body)],
      )
    }
    if (reference && mpesaCallbackPaid(body)) {
      const found = await pool.query(`SELECT user_id FROM billing_orders WHERE id = $1`, [reference])
      const owner = found.rows[0]?.user_id as string | undefined
      if (owner) await fulfillPaidOrder({ expectedUserId: owner, orderId: reference })
    }
    return c.json({ ok: true })
  })

  app.get('/api/billing/paypal/return', async (c) => {
    const subscriptionId = c.req.query('subscription_id') || c.req.query('ba_token') || ''
    const { session } = await requireReadyUser(c)
    if (!session || !pool) return c.redirect('/login')
    if (!subscriptionId) return c.redirect('/dashboard/billing?paypal=cancel')

    try {
      const sub = await getPaypalSubscription(subscriptionId)
      const status = String(sub.status || '').toUpperCase()
      const paypalUser = String(sub.custom_id || '')
      const order = await loadOrder({ subscriptionId })
      const owner = order?.user_id || paypalUser
      if (!owner || owner !== session.user.id) {
        return c.redirect('/dashboard/billing?paypal=error')
      }
      if (paypalUser && paypalUser !== session.user.id) {
        return c.redirect('/dashboard/billing?paypal=error')
      }
      if (status !== 'ACTIVE' && status !== 'APPROVED') {
        return c.redirect('/dashboard/billing?paypal=error')
      }
      const fulfilled = await fulfillPaidOrder({
        expectedUserId: session.user.id,
        subscriptionId,
      })
      if (!fulfilled.ok) return c.redirect('/dashboard/billing?paypal=error')
      return c.redirect('/dashboard/billing?paypal=success')
    } catch {
      return c.redirect('/dashboard/billing?paypal=error')
    }
  })

  app.post('/api/paypal/webhook', async (c) => {
    if (!pool) return c.json({ error: 'Database is not connected' }, 503)
    const event = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const verified = await verifyPaypalWebhook(c.req.raw.headers, event)
    if (!verified) return c.json({ error: 'Invalid webhook signature' }, 400)

    const type = String(event.event_type || '')
    const resource = (event.resource || {}) as Record<string, unknown>
    const subscriptionId = resourceId(resource)
    const customUser = resourceUser(resource)
    const order = await loadOrder({ subscriptionId })
    const userId = order?.user_id || customUser || (await userFromSubscription(subscriptionId))

    await pool.query(
      `INSERT INTO billing_events (id, user_id, provider, event_type, paypal_id, payload)
       VALUES ($1, $2, 'paypal', $3, $4, $5::jsonb)`,
      [crypto.randomUUID(), userId, type, subscriptionId || null, JSON.stringify(event)],
    )

    if (!userId) return c.json({ ok: true, ignored: true })

    if (
      type === 'BILLING.SUBSCRIPTION.ACTIVATED' ||
      type === 'BILLING.SUBSCRIPTION.CREATED' ||
      type === 'BILLING.SUBSCRIPTION.RE-ACTIVATED' ||
      type === 'CHECKOUT.ORDER.APPROVED' ||
      type === 'CHECKOUT.ORDER.COMPLETED' ||
      type === 'PAYMENT.CAPTURE.COMPLETED' ||
      type === 'PAYMENT.SALE.COMPLETED'
    ) {
      await fulfillPaidOrder({ expectedUserId: userId, subscriptionId })
    }

    if (
      type === 'BILLING.SUBSCRIPTION.CANCELLED' ||
      type === 'BILLING.SUBSCRIPTION.EXPIRED' ||
      type === 'BILLING.SUBSCRIPTION.SUSPENDED'
    ) {
      await pool.query(
        `UPDATE profiles
         SET plan = 'hobby',
             plan_status = $2,
             plan_cycle = 'monthly',
             plan_started_at = NULL,
             plan_renews_at = NULL,
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId, type.toLowerCase()],
      )
      await pool.query(
        `UPDATE billing_orders SET status = $2, updated_at = NOW()
         WHERE paypal_subscription_id = $1`,
        [subscriptionId, type.toLowerCase()],
      )
    }

    return c.json({ ok: true })
  })
}

async function loadOrder(opts: { orderId?: string; subscriptionId?: string }) {
  if (!pool) return null
  if (opts.orderId) {
    const result = await pool.query(`SELECT * FROM billing_orders WHERE id = $1`, [opts.orderId])
    return (result.rows[0] as OrderRow | undefined) || null
  }
  if (opts.subscriptionId) {
    const result = await pool.query(
      `SELECT * FROM billing_orders WHERE paypal_subscription_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [opts.subscriptionId],
    )
    return (result.rows[0] as OrderRow | undefined) || null
  }
  return null
}

async function userFromSubscription(subscriptionId: string) {
  if (!subscriptionId || !pool) return null
  const result = await pool.query(
    `SELECT user_id FROM billing_orders WHERE paypal_subscription_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [subscriptionId],
  )
  return (result.rows[0]?.user_id as string | undefined) || null
}

async function fulfillPaidOrder(opts: {
  expectedUserId: string
  orderId?: string
  subscriptionId?: string
}) {
  if (!pool) return { ok: false as const, reason: 'no-db' }
  const order = await loadOrder(opts)
  if (!order) return { ok: false as const, reason: 'missing' }
  if (order.user_id !== opts.expectedUserId) return { ok: false as const, reason: 'user-mismatch' }

  const cycle = asCycle(order.cycle)
  const existingPaidAt = asDate(order.paid_at)
  const existingStart = asDate(order.period_start)
  const existingEnd = asDate(order.period_end)
  const alreadyStarted = Boolean(existingPaidAt && existingStart && existingEnd)
  const paidAt = alreadyStarted ? existingPaidAt! : new Date()
  const periodStart = alreadyStarted ? existingStart! : paidAt
  const periodEnd = alreadyStarted ? existingEnd! : addBillingPeriod(paidAt, cycle)
  const number = order.receipt_number || receiptNumber(order.id, paidAt)

  await pool.query(
    `UPDATE profiles
     SET plan = $2,
         plan_status = 'active',
         plan_cycle = $3,
         plan_started_at = $4,
         plan_renews_at = $5,
         paypal_subscription_id = COALESCE($6, paypal_subscription_id),
         updated_at = NOW()
     WHERE user_id = $1`,
    [
      order.user_id,
      order.plan,
      cycle,
      periodStart,
      periodEnd,
      opts.subscriptionId || order.paypal_subscription_id || null,
    ],
  )

  await pool.query(
    `UPDATE billing_orders
     SET status = 'paid',
         paid_at = COALESCE(paid_at, $2),
         period_start = COALESCE(period_start, $3),
         period_end = COALESCE(period_end, $4),
         receipt_number = COALESCE(receipt_number, $5),
         updated_at = NOW()
     WHERE id = $1`,
    [order.id, paidAt, periodStart, periodEnd, number],
  )

  await sendReceiptOnce({
    id: order.id,
    user_id: order.user_id,
    plan: order.plan,
    amount: order.amount,
    currency: order.currency,
    provider: order.provider,
    cycle,
    receipt_number: number,
    paid_at: paidAt,
    period_start: periodStart,
    period_end: periodEnd,
  })

  return { ok: true as const, plan: order.plan }
}

async function sendReceiptOnce(order: {
  id: string
  user_id: string
  plan: string
  amount: string
  currency: string
  provider: string
  cycle: BillingCycle
  receipt_number: string
  paid_at: Date
  period_start: Date
  period_end: Date
}) {
  if (!pool) return
  const claimed = await pool.query(
    `UPDATE billing_orders
     SET receipt_sent_at = NOW()
     WHERE id = $1 AND receipt_sent_at IS NULL
     RETURNING id`,
    [order.id],
  )
  if (!claimed.rows[0]) return

  const user = await pool.query(`SELECT email FROM "user" WHERE id = $1`, [order.user_id])
  const email = user.rows[0]?.email as string | undefined
  if (!email) {
    await pool.query(`UPDATE billing_orders SET receipt_sent_at = NULL WHERE id = $1`, [order.id])
    return
  }

  const amount = Number(order.amount)
  const formatted = Number.isFinite(amount)
    ? amount.toLocaleString(order.currency === 'KES' ? 'en-KE' : 'en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : order.amount

  const mail = receiptEmail({
    receiptNumber: order.receipt_number,
    planName: planLabel(order.plan),
    cycle: order.cycle,
    amount: formatted,
    currency: order.currency === 'KES' ? 'KES' : 'USD',
    provider: order.provider,
    paidAt: order.paid_at,
    periodStart: order.period_start,
    periodEnd: order.period_end,
    invoiceUrl: `${env.betterAuthUrl.replace(/\/$/, '')}/dashboard/billing`,
  })

  try {
    await sendMail(email, mail.subject, mail.text, mail.html)
  } catch (error) {
    await pool.query(`UPDATE billing_orders SET receipt_sent_at = NULL WHERE id = $1`, [order.id])
    console.error('[billing] receipt email failed', error)
  }
}
