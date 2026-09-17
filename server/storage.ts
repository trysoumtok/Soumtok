import { env, hasBunny } from './env.ts'

function storageUrl(path: string) {
  return `https://${env.bunnyEndpoint}/${env.bunnyZone}/${path}`
}

export async function uploadToBunny(path: string, body: Uint8Array, contentType: string) {
  if (!hasBunny()) throw new Error('Bunny storage is not configured')

  const res = await fetch(storageUrl(path), {
    method: 'PUT',
    headers: {
      AccessKey: env.bunnyAccessKey,
      'Content-Type': contentType || 'application/octet-stream',
    },
    body,
  })

  if (!res.ok) {
    throw new Error(`Bunny upload failed (${res.status})`)
  }
}

export async function existsOnBunny(path: string) {
  if (!hasBunny()) return false

  const res = await fetch(storageUrl(path), {
    method: 'HEAD',
    headers: { AccessKey: env.bunnyAccessKey },
  })

  return res.ok
}

export async function downloadFromBunny(path: string) {
  if (!hasBunny()) throw new Error('Bunny storage is not configured')

  const res = await fetch(storageUrl(path), {
    headers: { AccessKey: env.bunnyAccessKey },
  })

  if (!res.ok) {
    throw new Error(`Bunny download failed (${res.status})`)
  }

  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') || 'application/octet-stream',
  }
}

export async function deleteFromBunny(path: string) {
  if (!hasBunny()) throw new Error('Bunny storage is not configured')

  const res = await fetch(storageUrl(path), {
    method: 'DELETE',
    headers: { AccessKey: env.bunnyAccessKey },
  })

  if (!res.ok && res.status !== 404) {
    throw new Error(`Bunny delete failed (${res.status})`)
  }
}

export function safeFileName(name: string) {
  return name.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 120) || 'file'
}
