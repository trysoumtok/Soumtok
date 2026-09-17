import { env, hasPayhero } from './env.ts'

function payheroAuth() {
  if (env.payheroBasicToken) {
    return env.payheroBasicToken.startsWith('Basic ')
      ? env.payheroBasicToken
      : `Basic ${env.payheroBasicToken}`
  }
  return `Basic ${Buffer.from(`${env.payheroUsername}:${env.payheroPassword}`).toString('base64')}`
}

function payheroUrl(path: string) {
  return `https://backend.payhero.co.ke${path}`
}

function publicCallbackUrl() {
  const raw = env.payheroCallbackUrl || `${env.betterAuthUrl}/api/billing/mpesa/callback`
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return ''
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') return ''
    return raw
  } catch {
    return ''
  }
}

function payheroMessage(data: Record<string, unknown>, fallback: string) {
  const nested = (data.error || data.response || data.data || {}) as Record<string, unknown>
  const value =
    data.error_message ||
    data.message ||
    data.error ||
    data.detail ||
    nested.error_message ||
    nested.message ||
    nested.ResultDesc
  if (typeof value === 'string' && value.trim()) return value.trim()
  return fallback
}

async function readPayhero(res: Response) {
  const text = await res.text()
  try {
    return { data: JSON.parse(text) as Record<string, unknown>, text }
  } catch {
    return { data: {} as Record<string, unknown>, text }
  }
}

export function kenyaPhone(raw: string) {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('254') && digits.length === 12) return digits
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`
  if (digits.length === 9) return `254${digits}`
  return ''
}

function stkPhone(raw: string) {
  const intl = kenyaPhone(raw)
  if (!intl) return ''
  return `0${intl.slice(3)}`
}

export async function startPayheroStk(input: {
  amountKes: number
  phone: string
  reference: string
  customerName?: string
}) {
  if (!hasPayhero()) throw new Error('Mobile money is not connected')
  const phone = stkPhone(input.phone)
  if (!phone) throw new Error('Enter a Kenyan M-Pesa number')
  const amount = Math.max(1, Math.round(input.amountKes))
  const callback = publicCallbackUrl()
  const payload: Record<string, unknown> = {
    amount,
    phone_number: phone,
    channel_id: Number(env.payheroChannelId),
    provider: 'm-pesa',
    external_reference: input.reference,
    customer_name: input.customerName || 'Soumtok',
  }
  if (callback) payload.callback_url = callback

  const res = await fetch(payheroUrl('/api/v2/payments'), {
    method: 'POST',
    headers: {
      Authorization: payheroAuth(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const { data } = await readPayhero(res)
  if (!res.ok || data.success === false) {
    throw new Error(payheroMessage(data, 'Could not send the M-Pesa prompt'))
  }
  return {
    reference: String(data.reference || data.payment_reference || input.reference),
    checkoutId: String(data.CheckoutRequestID || data.checkout_id || ''),
    status: classifyPayheroStatus(data.status || data.Status),
  }
}

export type PayheroLookup = {
  status: 'success' | 'failed' | 'pending' | 'unknown'
  reference?: string
  checkoutId?: string
  providerRef?: string
}

function classifyPayheroStatus(raw: unknown): PayheroLookup['status'] {
  const status = String(raw || '').toLowerCase()
  const code = String(raw || '').trim()
  if (['success', 'successful', 'completed', 'complete', 'paid', '0'].includes(status)) return 'success'
  if (
    ['failed', 'fail', 'cancelled', 'canceled', 'expired', '1032', '2001', '17', '26'].includes(status) ||
    ['1032', '2001', '17', '26'].includes(code) ||
    ['failed', 'fail', 'cancelled', 'canceled', 'expired'].some((word) => code.includes(word))
  ) {
    return 'failed'
  }
  if (['queued', 'pending', 'processing', 'true'].includes(status)) return 'pending'
  return 'unknown'
}

function lookupFrom(data: Record<string, unknown>): PayheroLookup {
  const nested = (data.response || data.data || {}) as Record<string, unknown>
  const resultCode = String(nested.ResultCode ?? data.ResultCode ?? '')
  if (['1', '1032', '2001', '17', '26'].includes(resultCode)) {
    return {
      status: 'failed',
      reference: String(data.reference || nested.ExternalReference || nested.external_reference || ''),
      checkoutId: String(data.CheckoutRequestID || nested.CheckoutRequestID || ''),
    }
  }
  if (resultCode === '0') {
    return {
      status: 'success',
      reference: String(data.reference || nested.ExternalReference || nested.external_reference || ''),
      checkoutId: String(data.CheckoutRequestID || nested.CheckoutRequestID || ''),
      providerRef: String(
        data.provider_reference || data.third_party_reference || nested.MpesaReceiptNumber || '',
      ),
    }
  }
  return {
    status: classifyPayheroStatus(
      data.status || data.Status || nested.status || nested.Status || nested.ResultCode,
    ),
    reference: String(data.reference || nested.ExternalReference || nested.external_reference || ''),
    checkoutId: String(data.CheckoutRequestID || nested.CheckoutRequestID || ''),
    providerRef: String(
      data.provider_reference || data.third_party_reference || nested.MpesaReceiptNumber || '',
    ),
  }
}

async function payheroGet(path: string) {
  const res = await fetch(payheroUrl(path), {
    headers: {
      Authorization: payheroAuth(),
      Accept: 'application/json',
    },
  })
  const { data } = await readPayhero(res)
  return { ok: res.ok, data }
}

export async function payheroStatus(reference: string): Promise<PayheroLookup> {
  if (!hasPayhero() || !reference) return { status: 'unknown' }
  try {
    const { data } = await payheroGet(
      `/api/v2/transaction-status?reference=${encodeURIComponent(reference)}`,
    )
    return lookupFrom(data)
  } catch {
    return { status: 'pending' }
  }
}

export async function findRecentPayheroSuccess(amountKes: number): Promise<PayheroLookup | null> {
  if (!hasPayhero() || !amountKes) return null
  try {
    const { ok, data } = await payheroGet('/api/v2/transactions?page=1&per=20')
    if (!ok) return null
    const rows = Array.isArray(data.transactions) ? (data.transactions as Record<string, unknown>[]) : []
    const match = rows.find((row) => {
      const amount = Math.abs(Number(row.amount || 0))
      const created = Date.parse(String(row.created_at || row.updated_at || ''))
      const recent = !Number.isNaN(created) && Date.now() - created < 45 * 60 * 1000
      const desc = String(row.description || '')
      return recent && (amount === amountKes || desc.includes(String(amountKes)))
    })
    if (!match) return null
    return {
      status: 'success',
      reference: String(match.transaction_reference || match.provider_reference || ''),
      providerRef: String(match.provider_reference || match.transaction_reference || ''),
    }
  } catch {
    return null
  }
}

export function mpesaCallbackPaid(body: Record<string, unknown>) {
  const nested = (body.response || body.data || body) as Record<string, unknown>
  const status = String(
    nested.status || nested.Status || body.status || body.ResultCode || '',
  ).toLowerCase()
  const resultCode = String(nested.ResultCode ?? body.ResultCode ?? '')
  return (
    status === 'success' ||
    status === 'successful' ||
    status === 'completed' ||
    status === 'complete' ||
    resultCode === '0'
  )
}

export function mpesaCallbackReference(body: Record<string, unknown>) {
  const nested = (body.response || body.data || body) as Record<string, unknown>
  return String(
    nested.external_reference ||
      nested.ExternalReference ||
      nested.externalReference ||
      body.external_reference ||
      body.ExternalReference ||
      '',
  )
}
