export function safeProjectRelPath(rel: string) {
  return rel.replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[\\/]+/, '')
}

export async function saveProjectToFolder(files: Record<string, string>) {
  const entries = Object.entries(files).filter(([rel, body]) => safeProjectRelPath(rel) && typeof body === 'string')
  if (!entries.length) return { ok: false as const, error: 'No files to save' }
  if (typeof window.showDirectoryPicker !== 'function') {
    return { ok: false as const, error: 'Folder save needs Chrome or Edge — use Download all instead' }
  }
  try {
    const root = await window.showDirectoryPicker({ mode: 'readwrite' })
    for (const [rel, content] of entries) {
      const safe = safeProjectRelPath(rel)
      const parts = safe.split(/[/\\]/).filter(Boolean)
      if (!parts.length) continue
      let dir = root
      for (let i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: true })
      }
      const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true })
      const w = await fh.createWritable()
      await w.write(content)
      await w.close()
    }
    return { ok: true as const, count: entries.length }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return { ok: false as const }
    return { ok: false as const, error: err instanceof Error ? err.message : 'Could not save to folder' }
  }
}

export function downloadProjectZip(files: Record<string, string>, name = 'soumtok-project') {
  const entries = Object.entries(files).filter(([rel]) => safeProjectRelPath(rel))
  if (!entries.length) return
  const stamp = new Date().toISOString().slice(0, 10)
  if (entries.length === 1) {
    const [path, content] = entries[0]
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = path.split('/').pop() || `${name}.txt`
    a.click()
    URL.revokeObjectURL(url)
    return
  }
  const lines = entries.map(([path, content]) => `--- ${path} ---\n${content}`).join('\n\n')
  const blob = new Blob([lines], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}-${stamp}.txt`
  a.click()
  URL.revokeObjectURL(url)
}
