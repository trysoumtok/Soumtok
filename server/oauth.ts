import { createHash, randomBytes } from 'node:crypto'

export function pkceChallenge() {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(18).toString('base64url')
  return { verifier, challenge, state }
}

export function authorizeUrl(endpoint: string, params: Record<string, string>) {
  const url = new URL(endpoint)
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}

export type OauthServerMeta = {
  issuer?: string
  authorization_endpoint?: string
  token_endpoint?: string
  registration_endpoint?: string
  code_challenge_methods_supported?: string[]
}

export function oauthRedirect(origin: string) {
  return `${origin.replace(/\/$/, '')}/api/connectors/oauth/callback`
}
