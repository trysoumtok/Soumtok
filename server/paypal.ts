import { env } from './env.ts'
import { paidPlan, planTotalUsd, type PaidPlanId } from '../shared/plans.ts'
import { pool } from './db.ts'

function paypalHost() {
  return env.paypalMode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
}

async function paypalToken() {
  const res = await fetch(`${paypalHost()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.paypalClientId}:${env.paypalClientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  const data = (await res.json()) as { access_token?: string; error_description?: string }
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || 'PayPal auth failed')
  }
  return data.access_token
}

async function paypalFetch(path: string, init: RequestInit = {}) {
  const token = await paypalToken()
  const res = await fetch(`${paypalHost()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const details = data.details as { description?: string }[] | undefined
    const message =
      (data.message as string) ||
      details?.map((item) => item.description).filter(Boolean).join(' ') ||
      `PayPal request failed (${res.status})`
    throw new Error(message)
  }
  return data
}

export async function ensurePaypalPlan(planId: PaidPlanId, cycle: 'monthly' | 'annual' = 'monthly') {
  const catalogId = cycle === 'annual' ? `${planId}_annual` : planId
  const existing = await pool!.query(
    `SELECT paypal_plan_id, amount FROM billing_catalog WHERE plan_id = $1`,
    [catalogId],
  )
  const stored = existing.rows[0] as { paypal_plan_id?: string; amount?: string } | undefined
  const plan = paidPlan(planId)
  if (!plan) throw new Error('Unknown plan')
  const charge = planTotalUsd(plan, cycle).toFixed(2)
  if (stored?.paypal_plan_id && stored.amount === charge) return stored.paypal_plan_id

  const product = await paypalFetch('/v1/catalogs/products', {
    method: 'POST',
    body: JSON.stringify({
      name: `Soumtok ${plan.name}`,
      description: plan.detail,
      type: 'SERVICE',
      category: 'SOFTWARE',
    }),
  })

  const created = await paypalFetch('/v1/billing/plans', {
    method: 'POST',
    body: JSON.stringify({
      product_id: product.id,
      name: `Soumtok ${plan.name} ${cycle}`,
      description: `${plan.name} · ${plan.detail}`,
      status: 'ACTIVE',
      billing_cycles: [
        {
          frequency:
            cycle === 'annual'
              ? { interval_unit: 'YEAR', interval_count: 1 }
              : { interval_unit: 'MONTH', interval_count: 1 },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: { fixed_price: { value: charge, currency_code: 'USD' } },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 3,
      },
    }),
  })

  await pool!.query(
    `INSERT INTO billing_catalog (plan_id, paypal_product_id, paypal_plan_id, amount, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (plan_id) DO UPDATE SET
       paypal_product_id = EXCLUDED.paypal_product_id,
       paypal_plan_id = EXCLUDED.paypal_plan_id,
       amount = EXCLUDED.amount,
       updated_at = NOW()`,
    [catalogId, product.id, created.id, charge],
  )

  return String(created.id)
}

export async function createPaypalSubscription(
  planId: PaidPlanId,
  userId: string,
  cycle: 'monthly' | 'annual' = 'monthly',
) {
  const paypalPlanId = await ensurePaypalPlan(planId, cycle)
  const returnUrl = `${env.betterAuthUrl}/api/billing/paypal/return`
  const cancelUrl = `${env.betterAuthUrl}/checkout?plan=${planId}&cycle=${cycle}&paypal=cancel`
  const created = await paypalFetch('/v1/billing/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: paypalPlanId,
      custom_id: userId,
      application_context: {
        brand_name: 'Soumtok',
        locale: 'en-US',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'SUBSCRIBE_NOW',
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }),
  })

  const links = (created.links as { rel?: string; href?: string }[]) || []
  const approve = links.find((link) => link.rel === 'approve')?.href
  if (!approve) throw new Error('PayPal did not return a checkout link')

  return {
    subscriptionId: String(created.id),
    approveUrl: approve,
    status: String(created.status || 'APPROVAL_PENDING'),
  }
}

export async function getPaypalSubscription(subscriptionId: string) {
  return paypalFetch(`/v1/billing/subscriptions/${subscriptionId}`)
}

const PAYPAL_ACTIVE = new Set(['ACTIVE', 'APPROVED'])
const PAYPAL_TERMINAL_BAD = new Set(['CANCELLED', 'SUSPENDED', 'EXPIRED', 'CANCELED'])

/** PayPal may still show APPROVAL_PENDING on the return URL — poll until ACTIVE or timeout. */
export async function waitForActivePaypalSubscription(subscriptionId: string, timeoutMs = 45_000) {
  const started = Date.now()
  let last: Record<string, unknown> = {}
  while (Date.now() - started < timeoutMs) {
    last = await getPaypalSubscription(subscriptionId)
    const status = String(last.status || '').toUpperCase()
    if (PAYPAL_ACTIVE.has(status)) return { ok: true as const, status, sub: last }
    if (PAYPAL_TERMINAL_BAD.has(status)) return { ok: false as const, status, sub: last }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  const status = String(last.status || '').toUpperCase()
  // User finished PayPal UI; webhook may activate a moment later — still fulfill once.
  if (status === 'APPROVAL_PENDING') return { ok: true as const, status, sub: last, pending: true }
  return { ok: PAYPAL_ACTIVE.has(status), status, sub: last }
}

export async function verifyPaypalWebhook(headers: Headers, event: Record<string, unknown>) {
  if (!env.paypalWebhookId) return true

  const body = {
    auth_algo: headers.get('paypal-auth-algo'),
    cert_url: headers.get('paypal-cert-url'),
    transmission_id: headers.get('paypal-transmission-id'),
    transmission_sig: headers.get('paypal-transmission-sig'),
    transmission_time: headers.get('paypal-transmission-time'),
    webhook_id: env.paypalWebhookId,
    webhook_event: event,
  }

  if (!body.transmission_id || !body.transmission_sig) return false

  const result = await paypalFetch('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return result.verification_status === 'SUCCESS'
}
