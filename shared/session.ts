/** Stay signed in until Log Out, or until this many hours after sign-in. */
export const SESSION_MAX_HOURS = 48
export const SESSION_MAX_SECONDS = SESSION_MAX_HOURS * 60 * 60
export const SESSION_MAX_MS = SESSION_MAX_SECONDS * 1000

/** better-auth session cookies (cookiePrefix: soumtok). Legacy better-auth.* kept for old sessions. */
export const SESSION_COOKIE_NAMES = [
  '__Secure-soumtok.session_token',
  'soumtok.session_token',
  '__Secure-better-auth.session_token',
  'better-auth.session_token',
] as const

export function readSessionCookie(get: (name: string) => string | undefined) {
  for (const name of SESSION_COOKIE_NAMES) {
    const value = get(name)
    if (value) return value
  }
  return ''
}

export function sessionTimedOut(createdAt?: Date | string | null, expiresAt?: Date | string | null) {
  const now = Date.now()
  if (createdAt) {
    const start = new Date(createdAt).getTime()
    if (!Number.isNaN(start) && now - start >= SESSION_MAX_MS) return true
  }
  if (expiresAt) {
    const end = new Date(expiresAt).getTime()
    if (!Number.isNaN(end) && now >= end) return true
  }
  return false
}
