import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto'
import { env } from './env.ts'

function keyBytes() {
  return scryptSync(env.betterAuthSecret, 'soumtok-provider-keys', 32)
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyBytes(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`
}

export function decryptSecret(payload: string) {
  const [iv, tag, data] = payload.split('.')
  if (!iv || !tag || !data) throw new Error('Invalid secret')
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}

export function last4(value: string) {
  return value.slice(-4)
}

export function hashSecret(value: string) {
  return createHash('sha256').update(value).digest('hex')
}
