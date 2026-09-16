import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import nodemailer from 'nodemailer'
import { env, hasResend, hasSmtp } from './env.ts'

const MAIL_TIMEOUT_MS = 20_000

function publicLogoUrl() {
  return `${env.betterAuthUrl.replace(/\/$/, '')}/images/soumtok-mark.png`
}

function htmlForDelivery(html?: string) {
  if (!html) return html
  return html.replace(/cid:soumtok-mark/g, publicLogoUrl())
}

function transport() {
  const pass = env.smtpPass.replace(/^["']|["']$/g, '')
  const try587 = env.smtpPort === 587
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: try587 ? 587 : env.smtpPort,
    secure: !try587 && env.smtpPort === 465,
    requireTLS: try587,
    auth: {
      user: env.smtpUser,
      pass,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: MAIL_TIMEOUT_MS,
  })
}

async function sendViaResend(
  to: string,
  subject: string,
  text: string,
  html?: string,
  replyTo?: string,
) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.smtpFrom,
      to: [to],
      subject,
      text,
      ...(html ? { html } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
    signal: AbortSignal.timeout(MAIL_TIMEOUT_MS),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 240)}`)
  }
}

async function sendViaSmtp(
  to: string,
  subject: string,
  text: string,
  html?: string,
  replyTo?: string,
) {
  const deliveryHtml = htmlForDelivery(html)
  const send = transport().sendMail({
    from: env.smtpFrom,
    to,
    replyTo,
    subject,
    text,
    html: deliveryHtml,
    attachments: deliveryHtml ? logoAttachment() : [],
  })

  await Promise.race([
    send,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('SMTP timed out')), MAIL_TIMEOUT_MS)
    }),
  ])
}

const markPath = join(process.cwd(), 'public/images/soumtok-mark.png')
const font = 'Inter,Segoe UI,Helvetica Neue,Arial,sans-serif'

function logoAttachment() {
  if (!existsSync(markPath)) return []
  return [
    {
      filename: 'soumtok-mark.png',
      content: readFileSync(markPath),
      cid: 'soumtok-mark',
    },
  ]
}

function brandedHtml(opts: {
  eyebrow: string
  title: string
  lead: string
  code?: string
  extraHtml?: string
  actionLabel?: string
  actionUrl?: string
  note: string
}) {
  const codeBlock = opts.code
    ? `<tr>
        <td style="padding:8px 0 24px;">
          <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#7a7a74;padding-bottom:8px;">Verification code</div>
          <div style="background:#0c0c0b;border:1px solid #2a2a28;border-radius:8px;padding:16px 18px;">
            <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:22px;letter-spacing:0.12em;font-weight:500;color:#ffffff;">
              ${opts.code}
            </div>
            <div style="margin-top:8px;font-size:12px;color:#8a8a84;">Valid for 5 minutes</div>
          </div>
        </td>
      </tr>`
    : ''

  const actionBlock = opts.actionUrl
    ? `<tr>
        <td style="padding:4px 0 24px;">
          <a href="${opts.actionUrl}" style="display:inline-block;background:#f54e00;color:#1a0900;text-decoration:none;font-size:13px;font-weight:600;border-radius:6px;padding:11px 18px;">
            ${opts.actionLabel || 'Continue'}
          </a>
        </td>
      </tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${opts.title}</title>
</head>
<body style="margin:0;padding:0;background:#141413;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#141413;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;background:#0b0b0a;border:1px solid #262624;">
          <tr>
            <td style="height:3px;background:#f54e00;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:22px 32px 18px;border-bottom:1px solid #1f1f1d;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <img src="cid:soumtok-mark" width="22" height="22" alt="" style="display:block;border:0;" />
                  </td>
                  <td style="vertical-align:middle;font-family:${font};font-size:15px;font-weight:600;letter-spacing:-0.02em;color:#ffffff;">
                    Soumtok
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-family:${font};font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#8a8a84;">
              ${opts.eyebrow}
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px;font-family:${font};font-size:22px;font-weight:600;letter-spacing:-0.03em;color:#ffffff;line-height:1.3;">
              ${opts.title}
            </td>
          </tr>
          <tr>
            <td style="padding:12px 32px 20px;font-family:${font};font-size:14px;line-height:22px;color:#a3a39c;">
              ${opts.lead}
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                ${codeBlock}
                ${opts.extraHtml || ''}
                ${actionBlock}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:4px 32px 8px;font-family:${font};font-size:13px;line-height:21px;color:#8a8a84;">
              ${opts.note}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;font-family:${font};font-size:14px;line-height:22px;color:#c8c8c2;">
              Kind regards,<br />
              <strong style="color:#ffffff;font-weight:600;">The Soumtok Team</strong><br />
              <a href="mailto:info@soumtok.com" style="color:#f54e00;text-decoration:none;">info@soumtok.com</a>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 22px;border-top:1px solid #1f1f1d;font-family:${font};font-size:11px;line-height:18px;color:#6b6b64;">
              Soumtok Inc. · Building software for Africa and the world<br />
              <a href="https://soumtok.com" style="color:#8a8a84;text-decoration:none;">soumtok.com</a>
              &nbsp;·&nbsp;
              <a href="https://soumtok.com/privacy" style="color:#8a8a84;text-decoration:none;">Privacy</a>
              &nbsp;·&nbsp;
              <a href="https://soumtok.com/terms" style="color:#8a8a84;text-decoration:none;">Terms</a><br />
              © ${new Date().getFullYear()} Soumtok. All rights reserved.<br />
              You received this email because a Soumtok account action was requested for this address.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendMail(
  to: string,
  subject: string,
  text: string,
  html?: string,
  replyTo?: string,
) {
  const deliveryHtml = htmlForDelivery(html)

  if (hasResend()) {
    try {
      await sendViaResend(to, subject, text, deliveryHtml, replyTo)
      return
    } catch (error) {
      console.error('[mail] Resend failed', error)
      if (!hasSmtp()) throw error
    }
  }

  if (hasSmtp()) {
    await sendViaSmtp(to, subject, text, html, replyTo)
    return
  }

  console.warn(`[mail] No mail transport configured. Would send to ${to}: ${subject}\n${text}`)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function contactInboxEmail(input: { email: string; topic: string; message: string }) {
  const text = `New Soumtok contact\nFrom: ${input.email}\nTopic: ${input.topic}\n\n${input.message}`
  return {
    subject: `Contact: ${input.topic} — ${input.email}`,
    text,
    html: brandedHtml({
      eyebrow: 'Inbox',
      title: input.topic,
      lead: `${input.email} wrote to the Soumtok team.`,
      extraHtml: `<div style="white-space:pre-wrap;font-size:14px;line-height:1.6;color:#d4d4d0;">${escapeHtml(input.message)}</div>`,
      note: 'Reply to this email to reach the person who sent it.',
    }),
  }
}

export function securityChangeEmail(code: string, action: string) {
  const text = `Your Soumtok security code is ${code}. Use it to ${action}. It expires in 5 minutes.\n\nIf you did not request this, ignore this email.`
  return {
    subject: 'Your Soumtok security code',
    text,
    html: brandedHtml({
      eyebrow: 'Account security',
      title: 'Confirm this security change',
      lead: `Enter this code in Soumtok to ${action}. Do not share it with anyone.`,
      code,
      note: 'If you did not ask to change security on this account, you can ignore this message.',
    }),
  }
}

export function verificationEmail(code: string) {
  const text = `Your Soumtok verification code is ${code}. It expires in 5 minutes.\n\nIf you did not request this, ignore this email.`
  return {
    subject: 'Your Soumtok email code',
    text,
    html: brandedHtml({
      eyebrow: 'Account security',
      title: 'Verify your email address',
      lead: 'Use the code below to confirm this inbox on Soumtok. Do not share it with anyone.',
      code,
      note: 'If you did not request this verification, no action is required. You can safely ignore this message.',
    }),
  }
}

export function phoneCodeEmail(phone: string, code: string) {
  const text = `Your Soumtok phone verification code for ${phone} is ${code}. It expires in 5 minutes.`
  return {
    subject: 'Your Soumtok phone code',
    text,
    html: brandedHtml({
      eyebrow: 'Account security',
      title: 'Verify your phone number',
      lead: `Use the code below to confirm ${phone} on your Soumtok account. Do not share it with anyone.`,
      code,
      note: 'If you did not request this verification, no action is required. You can safely ignore this message.',
    }),
  }
}

export function magicLinkEmail(url: string) {
  const text = `Sign in to Soumtok with this link (expires in 5 minutes):\n\n${url}\n\nIf you did not request this, ignore this email.`
  return {
    subject: 'Sign in to Soumtok',
    text,
    html: brandedHtml({
      eyebrow: 'Sign in',
      title: 'Your sign-in link is ready',
      lead: 'This secure link signs you in to Soumtok, or creates an account if you are new. It expires in 5 minutes.',
      actionLabel: 'Continue to Soumtok',
      actionUrl: url,
      note: `If the button does not work, paste this URL into your browser:<br /><span style="color:#a3a39c;word-break:break-all;">${url}</span>`,
    }),
  }
}

export function inviteEmail(orgName: string, url: string) {
  const text = `You were invited to join ${orgName} on Soumtok.\n\nAccept here:\n${url}\n`
  return {
    subject: `Join ${orgName} on Soumtok`,
    text,
    html: brandedHtml({
      eyebrow: 'Workspace invitation',
      title: `You have been invited to ${orgName}`,
      lead: 'Accept this invitation to join the workspace on Soumtok.',
      actionLabel: 'Accept invitation',
      actionUrl: url,
      note: 'If you were not expecting this invitation, you can ignore this email.',
    }),
  }
}

export function receiptEmail(input: {
  receiptNumber: string
  planName: string
  cycle: string
  amount: string
  currency: string
  provider: string
  paidAt: Date
  periodStart: Date
  periodEnd: Date
  invoiceUrl: string
}) {
  const when = input.paidAt.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })
  const start = input.periodStart.toLocaleDateString('en-US', { dateStyle: 'long' })
  const end = input.periodEnd.toLocaleDateString('en-US', { dateStyle: 'long' })
  const billed = input.cycle === 'annual' ? 'Annual' : 'Monthly'
  const method = input.provider === 'payhero' ? 'M-Pesa' : 'PayPal or card'
  const total = `${input.currency} ${input.amount}`
  const extraHtml = `<tr>
        <td style="padding:4px 0 20px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #2a2a28;border-radius:8px;overflow:hidden;font-family:Inter,Segoe UI,Helvetica Neue,Arial,sans-serif;">
            <tr>
              <td style="padding:12px 14px;font-size:12px;color:#8a8a84;border-bottom:1px solid #1f1f1d;">Receipt ${input.receiptNumber}</td>
              <td style="padding:12px 14px;font-size:12px;color:#8a8a84;border-bottom:1px solid #1f1f1d;text-align:right;">${when}</td>
            </tr>
            <tr>
              <td style="padding:14px;font-size:14px;color:#ffffff;">Soumtok ${input.planName} · ${billed}</td>
              <td style="padding:14px;font-size:14px;color:#ffffff;text-align:right;">${total}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding:0 14px 14px;font-size:13px;line-height:20px;color:#8a8a84;">
                Paid with ${method}<br />
                Period starts ${start}<br />
                Renews ${end}
              </td>
            </tr>
          </table>
        </td>
      </tr>`

  const text = [
    `Soumtok receipt ${input.receiptNumber}`,
    `Soumtok ${input.planName} (${billed}) · ${total}`,
    `Paid with ${method} on ${when}.`,
    `Your ${billed.toLowerCase()} period starts ${start} and renews ${end}.`,
    `View billing: ${input.invoiceUrl}`,
  ].join('\n')

  return {
    subject: `Soumtok receipt ${input.receiptNumber} · ${input.planName}`,
    text,
    html: brandedHtml({
      eyebrow: 'Payment receipt',
      title: 'Thank you for your payment',
      lead: `This receipt confirms Soumtok ${input.planName} is active on your account. Your ${billed.toLowerCase()} cycle starts from the time you paid.`,
      extraHtml,
      actionLabel: 'View invoices',
      actionUrl: input.invoiceUrl,
      note: 'Keep this email for your records. If this charge looks wrong, reply to info@soumtok.com.',
    }),
  }
}

function firstName(name?: string | null, email?: string) {
  const fromName = (name || '').trim().split(/\s+/)[0]
  if (fromName) return fromName
  const local = (email || '').split('@')[0]?.replace(/[._-]+/g, ' ').trim()
  return local || 'friend'
}

function welcomeHtml(name: string, startUrl: string) {
  const safe = escapeHtml(name)
  const step = (n: string, title: string, body: string, last = false) => `<tr>
              <td style="padding:14px 0;${last ? '' : 'border-bottom:1px solid #1f1f1d;'}vertical-align:top;width:36px;">
                <div style="width:26px;height:26px;border-radius:999px;background:#f54e00;color:#1a0900;font-family:${font};font-size:13px;font-weight:700;line-height:26px;text-align:center;">${n}</div>
              </td>
              <td style="padding:12px 0 14px 12px;${last ? '' : 'border-bottom:1px solid #1f1f1d;'}">
                <div style="font-family:${font};font-size:15px;font-weight:600;color:#ffffff;">${title}</div>
                <div style="margin-top:4px;font-family:${font};font-size:13px;line-height:20px;color:#9c9c95;">${body}</div>
              </td>
            </tr>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Welcome, ${safe}</title>
</head>
<body style="margin:0;padding:0;background:#141413;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#141413;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;background:#0b0b0a;border:1px solid #262624;">
          <tr>
            <td style="height:4px;background:#f54e00;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:26px 32px 8px;">
              <img src="cid:soumtok-mark" width="28" height="28" alt="Soumtok" style="display:block;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 0;font-family:${font};font-size:13px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#f54e00;">
              Welcome
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 0;font-family:${font};font-size:30px;font-weight:650;letter-spacing:-0.04em;color:#ffffff;line-height:1.15;">
              The desk is yours, ${safe}.
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px;font-family:${font};font-size:16px;line-height:26px;color:#d4d4ce;">
              We built Soumtok for people who ship from here. A coding agent that writes, tests, and opens pull requests with you — from the same desk.
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 10px;font-family:${font};font-size:16px;line-height:26px;color:#d4d4ce;">
              Your account is live. Here is what you can do with it.
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                ${step('1', 'Build in Studio', 'Describe the feature. Soumtok writes the code, runs the work, and shows you the diff before you ship.')}
                ${step('2', 'Claim your handle', 'Pick a public name. People can find you at soumtok.com/yourname.')}
                ${step('3', 'Connect GitHub', 'Grant the repos you care about. Soumtok works in your real codebase, not a sandbox.')}
                ${step('4', 'Use the best models', 'Claude, GPT, Gemini, Grok, DeepSeek — switch when the job needs it.')}
                ${step('5', 'Plug in your tools', 'Bring Slack, Linear, and the rest of your stack next to Studio.')}
                ${step('6', 'Invite a team', 'Share a workspace when you are ready. One billing home, one set of rules.', true)}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px 10px;">
              <a href="${startUrl}" style="display:inline-block;background:#f54e00;color:#1a0900;text-decoration:none;font-family:${font};font-size:15px;font-weight:700;border-radius:8px;padding:13px 22px;">
                Start building →
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 8px;font-family:${font};font-size:15px;line-height:24px;color:#c8c8c2;">
              I am glad you are here. Go make something.
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;font-family:${font};font-size:14px;line-height:22px;color:#c8c8c2;">
              Joseph<br />
              <span style="color:#8a8a84;">Founder, Soumtok</span><br />
              <a href="mailto:info@soumtok.com" style="color:#f54e00;text-decoration:none;">info@soumtok.com</a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 22px;border-top:1px solid #1f1f1d;font-family:${font};font-size:11px;line-height:18px;color:#6b6b64;">
              Soumtok · Built for Africa, open to the world<br />
              <a href="https://soumtok.com" style="color:#8a8a84;text-decoration:none;">soumtok.com</a>
              &nbsp;·&nbsp;
              <a href="https://soumtok.com/docs" style="color:#8a8a84;text-decoration:none;">Docs</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function welcomeEmail(input: { name?: string | null; email: string; appUrl: string }) {
  const name = firstName(input.name, input.email)
  const startUrl = `${input.appUrl.replace(/\/$/, '')}/dashboard`
  const text = [
    `Welcome, ${name}.`,
    '',
    'The desk is yours. We built Soumtok for people who ship from here — a coding agent that writes, tests, and opens pull requests with you.',
    '',
    'Your account is live. Here is what you can do with it:',
    '',
    '1. Build in Studio — describe the feature, review the diff, ship.',
    '2. Claim your handle — people can find you at soumtok.com/yourname.',
    '3. Connect GitHub — Soumtok works in your real repos.',
    '4. Use the best models — Claude, GPT, Gemini, Grok, DeepSeek.',
    '5. Plug in your tools — Slack, Linear, and the rest of your stack.',
    '6. Invite a team — one workspace when you are ready.',
    '',
    `Start building: ${startUrl}`,
    '',
    'I am glad you are here. Go make something.',
    'Joseph',
    'Founder, Soumtok',
  ].join('\n')

  return {
    subject: `Welcome, ${name} — the desk is yours`,
    text,
    html: welcomeHtml(name, startUrl),
  }
}

export function verifyLinkEmail(url: string) {
  const text = `Confirm this email for your Soumtok account:\n\n${url}\n`
  return {
    subject: 'Verify your Soumtok email',
    text,
    html: brandedHtml({
      eyebrow: 'Account security',
      title: 'Confirm your email address',
      lead: 'Please confirm this inbox to finish setting up your Soumtok account.',
      actionLabel: 'Verify email address',
      actionUrl: url,
      note: 'If you did not create a Soumtok account, no action is required.',
    }),
  }
}
