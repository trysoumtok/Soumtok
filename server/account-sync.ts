import { pool } from './db.ts'

/** Ensure every auth user has a Soumtok profile row. */
export async function ensureProfile(userId: string) {
  if (!pool) return
  await pool.query(
    `INSERT INTO profiles (user_id, updated_at) VALUES ($1, NOW())
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  )
}

/** Mirror linked OAuth accounts and trusted provider email verification into profiles. */
export async function syncLinkedAccounts(userId: string) {
  if (!pool) return

  await ensureProfile(userId)

  await pool.query(
    `UPDATE profiles p
     SET github_id = a."accountId",
         updated_at = NOW()
     FROM account a
     WHERE p.user_id = $1
       AND a."userId" = p.user_id
       AND a."providerId" = 'github'`,
    [userId],
  )

  await pool.query(
    `UPDATE profiles p
     SET email_verified_at = COALESCE(p.email_verified_at, NOW()),
         updated_at = NOW()
     FROM "user" u
     WHERE p.user_id = $1
       AND u.id = p.user_id
       AND COALESCE(u."emailVerified", false) = true`,
    [userId],
  )
}
