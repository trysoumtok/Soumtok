import fs from 'node:fs'
import path from 'node:path'
import { THREADS_DIR, loadThread, saveThread, threadPath } from './config.mjs'

export function listThreads() {
  try {
    return fs
      .readdirSync(THREADS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const t = JSON.parse(fs.readFileSync(path.join(THREADS_DIR, f), 'utf8'))
          return {
            id: t.id || f.replace(/\.json$/, ''),
            title: t.title || 'Chat',
            updatedAt: t.updatedAt || 0,
            turns: Array.isArray(t.turns) ? t.turns.length : 0,
            cwd: t.cwd || '',
          }
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

export function recordTurn(thread, { prompt, cwd, result, events = [] }) {
  const turns = Array.isArray(thread.turns) ? [...thread.turns] : []
  const images = []
  const files = []
  for (const ev of events) {
    if (ev.type === 'result' && ev.name === 'generate_image' && ev.path) images.push(ev.path)
    if (ev.type === 'file' && ev.path) files.push(ev.path)
    if (ev.type === 'result' && ev.path && /write|diff|edit/i.test(String(ev.name))) files.push(ev.path)
  }
  turns.push({
    at: Date.now(),
    prompt: String(prompt || '').slice(0, 2000),
    cwd: cwd || thread.cwd || '',
    model: result?.model,
    requestedModel: result?.requestedModel,
    promptTokens: result?.promptTokens || 0,
    completionTokens: result?.completionTokens || 0,
    text: String(result?.text || '').slice(0, 8000),
    error: result?.error || null,
    images: [...new Set(images)],
    files: [...new Set(files)],
  })
  if (turns.length > 200) turns.splice(0, turns.length - 200)
  return { ...thread, turns, cwd: cwd || thread.cwd, updatedAt: Date.now() }
}

export function printThreadHistory(thread, limit = 12) {
  const turns = (thread.turns || []).slice(-limit)
  if (!turns.length) return false
  for (const t of turns) {
    const when = new Date(t.at).toLocaleString()
    const tok = (t.promptTokens || 0) + (t.completionTokens || 0)
    console.log(`  [${when}] ${t.model || 'auto'} · ${tok} tok`)
    console.log(`    Q: ${String(t.prompt).slice(0, 120)}${t.prompt.length > 120 ? '…' : ''}`)
    if (t.text) console.log(`    A: ${String(t.text).slice(0, 160)}${t.text.length > 160 ? '…' : ''}`)
    if (t.images?.length) console.log(`    🖼 ${t.images.join(', ')}`)
    if (t.files?.length) console.log(`    ✎ ${t.files.slice(0, 5).join(', ')}`)
  }
  return true
}

export function loadThreadById(id) {
  return loadThread(id)
}

export { saveThread, threadPath }
