import fs from 'node:fs'
import path from 'node:path'

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.svg') return 'image/svg+xml'
  return 'application/octet-stream'
}

function fileToChatAttachment(abs) {
  const buf = fs.readFileSync(abs)
  const mime = mimeFor(abs)
  const base64 = buf.toString('base64')
  return {
    name: path.basename(abs),
    mime,
    dataUrl: `data:${mime};base64,${base64}`,
    size: buf.length,
  }
}

function walkDir(dir, limit = 24) {
  const out = []
  const stack = [dir]
  while (stack.length && out.length < limit) {
    const cur = stack.pop()
    let entries = []
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      if (ent.name.startsWith('.') || ent.name === 'node_modules') continue
      const abs = path.join(cur, ent.name)
      if (ent.isDirectory()) stack.push(abs)
      else if (ent.isFile()) {
        out.push(abs)
        if (out.length >= limit) break
      }
    }
  }
  return out
}

/** Resolve @file @folder and image paths into openFiles + vision attachments (Desktop parity). */
export function resolveAttachments(prompt, cwd) {
  const openFiles = []
  const files = []
  const folders = []
  const parts = []
  const re = /@([^\s@]+)/g
  let last = 0
  let m

  while ((m = re.exec(prompt))) {
    parts.push(prompt.slice(last, m.index))
    const rel = m[1].replace(/^["']|["']$/g, '')
    const abs = path.isAbsolute(rel) ? rel : path.resolve(cwd, rel)
    if (fs.existsSync(abs)) {
      const stat = fs.statSync(abs)
      if (stat.isFile()) {
        openFiles.push(abs)
        if (IMAGE_EXT.has(path.extname(abs).toLowerCase())) {
          try {
            files.push(fileToChatAttachment(abs))
          } catch {
            /* skip unreadable */
          }
        }
        parts.push(`@${rel}`)
      } else if (stat.isDirectory()) {
        folders.push(abs)
        const listed = walkDir(abs, 20)
        for (const f of listed) {
          openFiles.push(f)
          if (IMAGE_EXT.has(path.extname(f).toLowerCase()) && files.length < 4) {
            try {
              files.push(fileToChatAttachment(f))
            } catch {
              /* skip */
            }
          }
        }
        parts.push(`@${rel}/`)
      } else {
        parts.push(`@${rel}`)
      }
    } else {
      parts.push(`@${rel}`)
    }
    last = m.index + m[0].length
  }
  parts.push(prompt.slice(last))

  return {
    prompt: parts.join(''),
    openFiles: [...new Set(openFiles)],
    files,
    folders,
  }
}
