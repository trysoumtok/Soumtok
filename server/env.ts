import { config } from 'dotenv'

config()

export const env = {
  databaseUrl: process.env.DATABASE_URL?.trim() ?? '',
  betterAuthSecret: process.env.BETTER_AUTH_SECRET?.trim() ?? '',
  betterAuthUrl: (process.env.BETTER_AUTH_URL?.trim() || 'http://localhost:5173').replace(/\/$/, ''),
  googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '',
  githubClientId: process.env.GITHUB_CLIENT_ID?.trim() ?? '',
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET?.trim() ?? '',
  bunnyZone: process.env.BUNNY_STORAGE_ZONE?.trim() ?? '',
  bunnyAccessKey: process.env.BUNNY_ACCESS_KEY?.trim() ?? '',
  bunnyEndpoint: process.env.BUNNY_STORAGE_HOST?.trim() || 'storage.bunnycdn.com',
  smtpHost: process.env.SMTP_HOST?.trim() || 'smtp.purelymail.com',
  smtpPort: Number(process.env.SMTP_PORT) || 465,
  smtpUser: process.env.SMTP_USER?.trim() ?? '',
  smtpPass: process.env.SMTP_PASS?.trim() ?? '',
  smtpFrom: process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || 'Soumtok <info@soumtok.com>',
  twilioSid: process.env.TWILIO_ACCOUNT_SID?.trim() ?? '',
  twilioToken: process.env.TWILIO_AUTH_TOKEN?.trim() ?? '',
  twilioFrom: process.env.TWILIO_FROM?.trim() ?? '',
  falKey: process.env.FAL_KEY?.trim() ?? '',
  replicateToken: (process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY)?.trim() ?? '',
  openaiKey: process.env.OPENAI_API_KEY?.trim() ?? '',
  anthropicKey: process.env.ANTHROPIC_API_KEY?.trim() ?? '',
  googleAiKey: process.env.GOOGLE_AI_API_KEY?.trim() ?? '',
  deepseekKey: process.env.DEEPSEEK_API_KEY?.trim() ?? '',
  xaiKey: process.env.XAI_API_KEY?.trim() ?? '',
  paypalClientId: process.env.PAYPAL_CLIENT_ID?.trim() ?? '',
  paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET?.trim() ?? '',
  paypalMode: process.env.PAYPAL_MODE?.trim() || 'sandbox',
  paypalWebhookId: process.env.PAYPAL_WEBHOOK_ID?.trim() ?? '',
  payheroUsername: process.env.PAYHERO_USERNAME?.trim() ?? '',
  payheroPassword: process.env.PAYHERO_PASSWORD?.trim() ?? '',
  payheroAccountId: process.env.PAYHERO_ACCOUNT_ID?.trim() ?? '',
  payheroChannelId: process.env.PAYHERO_CHANNEL_ID?.trim() ?? '',
  payheroCallbackUrl: process.env.PAYHERO_CALLBACK_URL?.trim() ?? '',
  payheroBasicToken: process.env.PAYHERO_BASIC_TOKEN?.trim() ?? '',
  payheroLipwaUrl: process.env.PAYHERO_LIPWA_URL?.trim() ?? '',
  mpesaKesPerUsd: Number(process.env.MPESA_KES_PER_USD) || 130,
  port: Number(process.env.PORT) || 3000,
  /** While building Soumtok: any model + no trial token cap (set on Railway/local). */
  openAccess: process.env.SOUMTOK_OPEN_ACCESS === '1',
}

/** Local dev or explicit flag — skip trial model list and trial token quota. */
export function openAccessForBuilding() {
  if (env.openAccess) return true
  try {
    return isLocalHost(new URL(env.betterAuthUrl).hostname)
  } catch {
    return false
  }
}

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

export function isAllowedOrigin(origin: string) {
  try {
    const url = new URL(origin)
    if (isLocalHost(url.hostname)) return true
    if (url.hostname === 'soumtok.com' || url.hostname === 'www.soumtok.com') return true
    return origin === env.betterAuthUrl
  } catch {
    return false
  }
}

export function isProductionHost(hostname: string) {
  return hostname === 'soumtok.com' || hostname === 'www.soumtok.com'
}

/** Canonical public site host — OAuth cookies and redirects must stay on one origin. */
export function canonicalAuthHost() {
  try {
    const hostname = new URL(env.betterAuthUrl).hostname
    if (isProductionHost(hostname)) return 'soumtok.com'
    return hostname
  } catch {
    return 'localhost'
  }
}

export function authBaseURLConfig():
  | string
  | { allowedHosts: string[]; fallback: string; protocol?: 'http' | 'https' } {
  try {
    const hostname = new URL(env.betterAuthUrl).hostname
    if (isLocalHost(hostname)) return env.betterAuthUrl
    return {
      allowedHosts: ['soumtok.com', 'www.soumtok.com', 'localhost', '127.0.0.1'],
      fallback: env.betterAuthUrl.replace('www.soumtok.com', 'soumtok.com'),
      protocol: 'https',
    }
  } catch {
    return env.betterAuthUrl
  }
}

export function authCrossSubDomainCookies() {
  try {
    const hostname = new URL(env.betterAuthUrl).hostname
    if (isProductionHost(hostname)) {
      return { enabled: true as const, domain: 'soumtok.com' }
    }
  } catch {
    /* ignore */
  }
  return undefined
}

export const trustedOrigins = [
  env.betterAuthUrl,
  'http://localhost:*',
  'http://127.0.0.1:*',
  'http://[::1]:*',
  'https://soumtok.com',
  'https://www.soumtok.com',
]

export function oauthRedirectUris() {
  const base = env.betterAuthUrl.replace(/\/$/, '')
  return {
    baseUrl: base,
    google: `${base}/api/auth/callback/google`,
    github: `${base}/api/auth/callback/github`,
  }
}

export function hasDatabase() {
  return env.databaseUrl.startsWith('postgres')
}

export function hasGoogle() {
  return Boolean(env.googleClientId && env.googleClientSecret)
}

export function hasGithub() {
  return Boolean(env.githubClientId && env.githubClientSecret)
}

export function hasBunny() {
  return Boolean(env.bunnyZone && env.bunnyAccessKey)
}

export function hasSmtp() {
  return Boolean(env.smtpUser && env.smtpPass)
}

export function hasTwilio() {
  return Boolean(env.twilioSid && env.twilioToken && env.twilioFrom)
}

export function hasFal() {
  return Boolean(env.falKey)
}

export function hasReplicate() {
  return Boolean(env.replicateToken)
}

/** Still-image generation: Replicate (Flux 2 Max) or Fal Schnell fallback. */
export function hasImageGen() {
  return hasReplicate() || hasFal()
}

export function platformKey(provider: string) {
  if (provider === 'openai') return env.openaiKey
  if (provider === 'anthropic') return env.anthropicKey
  if (provider === 'google') return env.googleAiKey
  if (provider === 'deepseek') return env.deepseekKey
  if (provider === 'xai') return env.xaiKey
  return ''
}

export function hasPaypal() {
  return Boolean(env.paypalClientId && env.paypalClientSecret)
}

export function hasPayhero() {
  return Boolean((env.payheroBasicToken || (env.payheroUsername && env.payheroPassword)) && env.payheroChannelId)
}
