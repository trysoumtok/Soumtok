/** Stay signed in until Log Out, or until this many hours after sign-in. */
export const SESSION_MAX_HOURS = 48
export const SESSION_MAX_SECONDS = SESSION_MAX_HOURS * 60 * 60
export const SESSION_MAX_MS = SESSION_MAX_SECONDS * 1000

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
