import { config } from 'dotenv'
import nodemailer from 'nodemailer'

config()

const pass = (process.env.SMTP_PASS || '').replace(/^["']|["']$/g, '')
const user = process.env.SMTP_USER
const host = process.env.SMTP_HOST || 'smtp.purelymail.com'

for (const cfg of [
  { label: '587 STARTTLS', port: 587, secure: false, requireTLS: true },
  { label: '465 SSL', port: 465, secure: true },
]) {
  const transport = nodemailer.createTransport({
    host,
    port: cfg.port,
    secure: cfg.secure,
    requireTLS: cfg.requireTLS,
    auth: { user, pass },
    connectionTimeout: 10_000,
  })
  try {
    await transport.verify()
    console.log(`${cfg.label}: OK`)
  } catch (error) {
    console.log(`${cfg.label}: FAIL —`, error instanceof Error ? error.message : error)
  }
}
