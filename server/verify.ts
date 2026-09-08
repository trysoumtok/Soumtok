import { createHash, randomInt } from 'node:crypto'
import { pool } from './db.ts'
import { env } from './env.ts'

export function hashCode(code: string) {
  return createHash('sha256').update(`${env.betterAuthSecret}:${code}`).digest('hex')
}

export function makeCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function normalizePhone(value: string) {
  const trimmed = value.trim().replace(/[\s()-]/g, '')
  if (!trimmed.startsWith('+')) return `+${trimmed.replace(/^\+/, '')}`
  return trimmed
}

export function phoneError(phone: string) {
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    return 'Enter a phone number with country code, e.g. +2348012345678'
  }
  return ''
}

export async function issueCode(userId: string, channel: 'email' | 'phone' | 'security', destination: string) {
  if (!pool) throw new Error('Database is not connected')
  const code = makeCode()
  await pool.query(
    `INSERT INTO verification_codes (id, user_id, channel, destination, code_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '5 minutes')`,
    [crypto.randomUUID(), userId, channel, destination, hashCode(code)],
  )
  return code
}

export async function consumeCode(
  userId: string,
  channel: 'email' | 'phone' | 'security',
  destination: string,
  code: string,
) {
  if (!pool) throw new Error('Database is not connected')
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM verification_codes
     WHERE user_id = $1 AND channel = $2 AND destination = $3
       AND code_hash = $4 AND consumed_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, channel, destination, hashCode(code.trim())],
  )
  const row = result.rows[0]
  if (!row) return false
  await pool.query(`UPDATE verification_codes SET consumed_at = NOW() WHERE id = $1`, [row.id])
  return true
}
