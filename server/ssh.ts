import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { createHash } from 'node:crypto'

function u32(n: number) {
  const buf = Buffer.alloc(4)
  buf.writeUInt32BE(n)
  return buf
}

function sshString(buf: Buffer) {
  return Buffer.concat([u32(buf.length), buf])
}

function fingerprint(blob: Buffer) {
  return `SHA256:${createHash('sha256').update(blob).digest('base64').replace(/=+$/, '')}`
}

function opensshPrivate(pub32: Buffer, seed32: Buffer, comment: string) {
  const check = randomBytes(4)
  let priv = Buffer.concat([
    check,
    check,
    sshString(Buffer.from('ssh-ed25519')),
    sshString(pub32),
    sshString(Buffer.concat([seed32, pub32])),
    sshString(Buffer.from(comment)),
  ])
  const padLen = (8 - (priv.length % 8)) % 8
  priv = Buffer.concat([priv, Buffer.from(Array.from({ length: padLen }, (_, i) => i + 1))])
  const body = Buffer.concat([
    Buffer.from('openssh-key-v1\0'),
    sshString(Buffer.from('none')),
    sshString(Buffer.from('none')),
    sshString(Buffer.alloc(0)),
    u32(1),
    sshString(Buffer.concat([sshString(Buffer.from('ssh-ed25519')), sshString(pub32)])),
    sshString(priv),
  ])
  const lines = body.toString('base64').match(/.{1,70}/g)?.join('\n') || body.toString('base64')
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${lines}\n-----END OPENSSH PRIVATE KEY-----\n`
}

export function generateSshKey(comment: string) {
  const pair = generateKeyPairSync('ed25519')
  const jwk = pair.privateKey.export({ format: 'jwk' })
  const seed = Buffer.from(jwk.d || '', 'base64url')
  const pub = Buffer.from(jwk.x || '', 'base64url')
  const blob = Buffer.concat([sshString(Buffer.from('ssh-ed25519')), sshString(pub)])
  return {
    publicKey: `ssh-ed25519 ${blob.toString('base64')} ${comment}`,
    privateKey: opensshPrivate(pub, seed, comment),
    fingerprint: fingerprint(blob),
  }
}

export function fingerprintPublicKey(publicKey: string) {
  const parts = publicKey.trim().split(/\s+/)
  if (parts.length < 2) return ''
  try {
    return fingerprint(Buffer.from(parts[1], 'base64'))
  } catch {
    return ''
  }
}

export function validPublicKey(value: string) {
  return /^(ssh-(ed25519|rsa)|ecdsa-sha2-nistp256)\s+[A-Za-z0-9+/=]+/.test(value.trim())
}
