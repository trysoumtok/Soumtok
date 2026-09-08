import { env, hasTwilio } from './env.ts'
import { phoneCodeEmail, sendMail } from './mail.ts'

export async function sendPhoneCode(phone: string, code: string, fallbackEmail?: string) {
  if (hasTwilio()) {
    const auth = Buffer.from(`${env.twilioSid}:${env.twilioToken}`).toString('base64')
    const body = new URLSearchParams({
      To: phone,
      From: env.twilioFrom,
      Body: `Your Soumtok code is ${code}. It expires in 5 minutes.`,
    })
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    )
    if (!res.ok) {
      const detail = await res.text()
      throw new Error(detail || 'Could not send SMS')
    }
    return 'sms' as const
  }

  if (fallbackEmail) {
    const mail = phoneCodeEmail(phone, code)
    await sendMail(fallbackEmail, mail.subject, mail.text, mail.html)
    return 'email' as const
  }

  console.warn(`[sms] No Twilio and no fallback email. Code for ${phone}: ${code}`)
  return 'log' as const
}
