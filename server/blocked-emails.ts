import { pool } from './db.ts'

export const BLOCKED_EMAIL_MESSAGE =
  'This email was used on a deleted Soumtok account. It is flagged and cannot be used to create an account again.'

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

export async function isBlockedEmail(email?: string | null) {
  if (!email || !pool) return false
  const result = await pool.query(`SELECT 1 FROM blocked_emails WHERE email = $1 LIMIT 1`, [normalizeEmail(email)])
  return Boolean(result.rowCount)
}

export async function flagDeletedEmail(email: string, userId?: string | null) {
  if (!pool) return
  await pool.query(
    `INSERT INTO blocked_emails (email, user_id, reason)
     VALUES ($1, $2, 'account_deleted')
     ON CONFLICT (email) DO UPDATE SET flagged_at = NOW(), user_id = COALESCE(EXCLUDED.user_id, blocked_emails.user_id)`,
    [normalizeEmail(email), userId || null],
  )
}
