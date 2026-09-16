/** Mirror shared/agentControlLayer.ts compactConversation for Electron main. */

const { summarizeToolResult } = require('../main/agentState')

const TOOL_RESULT_RECENT_CHARS = 48_000
const TOOL_RESULT_OLD_CHARS = 1_500
const TOOL_RESULT_RECENT_COUNT = 2
const GIT_SNAPSHOT_CHARS = 800

const RE_READ_TOOLS = new Set(['read', 'read_file'])

function compactGitSnapshot(text) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  if (raw.length <= GIT_SNAPSHOT_CHARS) return raw
  return `${raw.slice(0, GIT_SNAPSHOT_CHARS)}\n…(git truncated)`
}

function compactToolContent(text, fromEnd, name) {
  const s = String(text || '')
  if (/KNOWN FILES \(harness already searched|SCAFFOLD ON DISK/i.test(s)) {
    if (s.length <= 8000) return s
    return `${s.slice(0, 8000)}\n…(atlas truncated)`
  }
  if (fromEnd >= TOOL_RESULT_RECENT_COUNT) return summarizeToolResult(name, s)
  if (s.length <= TOOL_RESULT_RECENT_CHARS) return s
  const head = Math.max(240, Math.floor(TOOL_RESULT_RECENT_CHARS * 0.7))
  const tail = Math.max(160, TOOL_RESULT_RECENT_CHARS - head)
  return `${s.slice(0, head)}\n…(middle trimmed — call read({ path, start_line, end_line }) for a range)\n${s.slice(-tail)}`
}

function toolDumpKey(item) {
  if (!RE_READ_TOOLS.has(String(item.name || '').toLowerCase())) return ''
  const first = String(item.content || '').split('\n')[0].trim()
  if (!/\(\d+\s+lines\)/.test(first)) return ''
  return first
}

function supersededNote(header) {
  return `[${header.slice(0, 140)} — identical read repeated; the newer copy is below. Do not read this path again.]`
}

function looksLikeToolDump(item) {
  if (item.role === 'tool') return true
  const c = String(item.content || '')
  return (
    item.role === 'user' &&
    (/Tool results on the user's machine/i.test(c) || /^\[[a-z_][a-z0-9_]*\]\n/i.test(c))
  )
}

const ROUND_COLLAPSE_AFTER = 10
const ROUND_KEEP_RECENT = 4

function isHarnessUser(content) {
  return /^\[Soumtok (harness|steer)/i.test(content)
}

function isLiveUserTurn(item) {
  return item.role === 'user' && !isHarnessUser(String(item.content || ''))
}

function countLiveUserRounds(messages) {
  return messages.filter((m) => isLiveUserTurn(m)).length
}

function summarizeOldRoundsIfNeeded(messages) {
  const src = Array.isArray(messages) ? messages : []
  if (countLiveUserRounds(src) < ROUND_COLLAPSE_AFTER) return src.map((m) => ({ ...m }))

  const system = []
  let i = 0
  while (i < src.length && src[i].role === 'system') {
    system.push({ ...src[i] })
    i += 1
  }
  const body = src.slice(i).map((m) => ({ ...m }))
  const rounds = []
  let cur = []
  for (const m of body) {
    if (isLiveUserTurn(m) && cur.length) {
      rounds.push(cur)
      cur = [m]
    } else {
      cur.push(m)
    }
  }
  if (cur.length) rounds.push(cur)
  if (rounds.length < ROUND_COLLAPSE_AFTER) return src.map((m) => ({ ...m }))

  const old = rounds.slice(0, -ROUND_KEEP_RECENT)
  const recent = rounds.slice(-ROUND_KEEP_RECENT)
  const summaryLines = old.map((round, idx) => {
    const parts = [`--- Round ${idx + 1} ---`]
    for (const m of round) {
      if (m.role === 'user') parts.push(`User: ${String(m.content || '').slice(0, 180)}`)
      if (m.role === 'assistant') {
        const tc = Array.isArray(m.tool_calls) && m.tool_calls.length ? `[${m.tool_calls.length} tool call(s)]` : ''
        parts.push(`Assistant: ${String(m.content || tc).slice(0, 180)}`)
      }
      if (m.role === 'tool') parts.push(summarizeToolResult(m.name, String(m.content || '')))
    }
    return parts.join('\n')
  })
  const summary = {
    role: 'user',
    content: `[Soumtok harness] Earlier rounds (${old.length}) compressed — decision history only:\n${summaryLines.join('\n\n')}`,
  }
  return [...system, summary, ...recent.flat()]
}

function compactConversation(messages) {
  const list = summarizeOldRoundsIfNeeded(Array.isArray(messages) ? messages.map((m) => ({ ...m })) : [])
  let toolSeen = 0
  const seenRead = new Set()
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i]
    if (looksLikeToolDump(item)) {
      const key = toolDumpKey(item)
      if (key && seenRead.has(key)) {
        item.content = supersededNote(key)
        continue
      }
      if (key) seenRead.add(key)
      item.content = compactToolContent(String(item.content || ''), toolSeen, item.name)
      toolSeen += 1
      continue
    }
    if (item.role === 'assistant' && String(item.content || '').length > 2400 && i < list.length - 3) {
      item.content = `${String(item.content).slice(0, 1400)}\n…(older reply truncated)`
    }
  }
  const out = []
  const seenHarness = new Set()
  for (const item of list) {
    const c = String(item.content || '')
    if (item.role === 'user' && /^\[Soumtok harness\]/i.test(c)) {
      const key = c.slice(0, 120)
      if (seenHarness.has(key)) continue
      seenHarness.add(key)
    }
    out.push(item)
  }
  return out
}

function estimatePayloadChars(messages) {
  return (messages || []).reduce((n, m) => n + String(m.content || '').length, 0)
}

module.exports = {
  compactConversation,
  compactToolContent,
  compactGitSnapshot,
  estimatePayloadChars,
  TOOL_RESULT_RECENT_CHARS,
  TOOL_RESULT_OLD_CHARS,
  GIT_SNAPSHOT_CHARS,
}
