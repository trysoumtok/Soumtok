import nodemailer from 'nodemailer'

const secret = process.env.MAIL_FUNCTION_SECRET?.trim() ?? ''
const smtpHost = process.env.SMTP_HOST?.trim() || 'smtp.purelymail.com'
const smtpPort = Number(process.env.SMTP_PORT) || 465
const smtpUser = process.env.SMTP_USER?.trim() ?? ''
const smtpPass = (process.env.SMTP_PASS ?? '').replace(/^["']|["']$/g, '')
const smtpFrom = process.env.SMTP_FROM?.trim() || smtpUser || 'Soumtok <info@soumtok.com>'

const MAIL_TIMEOUT_MS = 20_000

function transport() {
  const try587 = smtpPort === 587
  return nodemailer.createTransport({
    host: smtpHost,
    port: try587 ? 587 : smtpPort,
    secure: !try587 && smtpPort === 465,
    requireTLS: try587,
    auth: { user: smtpUser, pass: smtpPass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: MAIL_TIMEOUT_MS,
  })
}

function unauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, content-type',
        },
      })
    }

    const url = new URL(request.url)
    if (request.method !== 'POST' || (url.pathname !== '/send' && url.pathname !== '/')) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    if (!secret) {
      return Response.json({ error: 'Mail relay is not configured' }, { status: 503 })
    }

    const auth = request.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${secret}`) return unauthorized()

    let body: { to?: string; subject?: string; text?: string; html?: string; replyTo?: string }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const to = body.to?.trim()
    const subject = body.subject?.trim()
    const text = body.text?.trim()
    if (!to || !subject || !text) {
      return Response.json({ error: 'to, subject, and text are required' }, { status: 400 })
    }

    try {
      await Promise.race([
        transport().sendMail({
          from: smtpFrom,
          to,
          replyTo: body.replyTo?.trim() || undefined,
          subject,
          text,
          html: body.html,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('SMTP timed out')), MAIL_TIMEOUT_MS)
        }),
      ])
      return Response.json({ ok: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Send failed'
      console.error('[neon-mail]', message)
      return Response.json({ error: message }, { status: 502 })
    }
  },
}
