/** Detect choice lists in agent replies for clickable pickers. */

const PICK_CUE =
  /pick (a )?number|choose (one|a|from|your)|select (one|a|the)|reply with \d|type \d|waiting on your pick|which (one|number|length|duration)|your pick|pick one|make your choice|waiting on you|or describe a different|or type your own/i

const DURATION_LINE =
  /^\s*(\d{1,2})\s*(?:[\.)]\s*)?(\d+\s*seconds?|\d+\s*minutes?|half\s*minute|one\s*minute)\b/i

function cleanLabel(raw) {
  return String(raw || '')
    .replace(/\*\*/g, '')
    .replace(/^[-*•]\s+/, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;]+$/, '')
    .trim()
}

function parseNumberedLines(text) {
  const items = []
  for (const line of String(text || '').split('\n')) {
    let m = /^\s*(\d{1,2})[\.)]\s+(.+?)\s*$/.exec(line)
    if (!m) m = /^\s*\*\*(\d{1,2})[\.)]\*\*\s+(.+?)\s*$/.exec(line)
    if (!m) m = /^\s*[-*•]\s+(.+?)\s*$/.exec(line)
    if (!m) {
      const dm = DURATION_LINE.exec(line)
      if (dm) {
        items.push({ num: Number(dm[1]), label: cleanLabel(dm[2]) })
        continue
      }
      continue
    }
    if (m[1] != null && m[2] != null) {
      const num = Number(m[1])
      const label = cleanLabel(m[2])
      if (label.length >= 2 && label.length <= 500) items.push({ num, label })
      continue
    }
    const label = cleanLabel(m[1])
    if (label.length >= 2 && label.length <= 500) {
      items.push({ num: items.length + 1, label })
    }
  }
  return dedupeByNum(items)
}

function dedupeByNum(items) {
  const byNum = new Map()
  for (const row of items) byNum.set(row.num, row)
  return [...byNum.values()].sort((a, b) => a.num - b.num)
}

function splitCommaPhrase(phrase) {
  const raw = String(phrase || '')
    .replace(/\*\*/g, '')
    .trim()
  if (!raw.includes(',')) return []
  const parts = raw
    .split(/,\s*(?:and\s+)?|,\s+|\s+and\s+/i)
    .map((s) => cleanLabel(s.replace(/^and\s+/i, '')))
    .filter((s) => s.length >= 3 && s.length <= 160)
  return parts.length >= 3 ? parts : []
}

function parseCommaList(text) {
  const raw = String(text || '')
  const cues = [
    /(?:ideas|options|topics|territories|niches|choices|lengths|durations)(?:\s+across|\s+include|\s+are|\s*:|\s+—|\s+-)\s*([^\n.]+)/i,
    /\bacross\s+([^\n.]+)/i,
    /\b(?:ten|nine|eight|seven|six|five|\d+)\s+(?:crime|documentary|video)?\s*ideas[^:\n]*[:\s—-]+([^\n.]+)/i,
  ]
  for (const re of cues) {
    const m = re.exec(raw)
    if (!m) continue
    const parts = splitCommaPhrase(m[1])
    if (parts.length >= 3) {
      return parts.map((label, i) => ({ num: i + 1, label }))
    }
  }
  for (const line of raw.split('\n')) {
    if (!/,/.test(line) || line.length > 420) continue
    const parts = splitCommaPhrase(line)
    if (parts.length >= 4) return parts.map((label, i) => ({ num: i + 1, label }))
  }
  return []
}

function parseDurationOptions(text) {
  const items = []
  for (const line of String(text || '').split('\n')) {
    const m = /^\s*(\d{1,2})[\.)]?\s*(\d+\s*(?:seconds?|minutes?)|half\s*minute|one\s*minute)\b/i.exec(line)
    if (!m) continue
    items.push({ num: Number(m[1]), label: cleanLabel(m[2]) })
  }
  return dedupeByNum(items)
}

function extractChoicePrompt(text) {
  const raw = String(text || '')
  const lines = raw
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean)
  const pickLines = lines.filter((row) => PICK_CUE.test(row))
  const line =
    pickLines.find((row) => row.length <= 120) ||
    pickLines.find((row) => /^pick\b|^choose\b|^select\b|^which\b/i.test(row)) ||
    pickLines[0]
  if (line) {
    const short = line.replace(/\*\*/g, '')
    const afterPick = short.match(/\b(pick (?:a )?number[^.]*|choose[^.]*|select[^.]*)\.?$/i)
    if (afterPick) return afterPick[1].trim()
    return short.slice(0, 200)
  }
  if (/STATE \d/i.test(raw)) return 'Pick one to continue'
  if (/video length|how long/i.test(raw)) return 'Choose a video length'
  return 'Choose an option'
}

function parseAgentChoices(text) {
  const raw = String(text || '')
  let items = parseNumberedLines(raw)
  if (items.length < 2) items = parseDurationOptions(raw)
  if (items.length < 2) items = parseCommaList(raw)
  if (items.length < 2) return null

  const wantsPick = PICK_CUE.test(raw)
  const stateFlow = /STATE \d/i.test(raw)
  if (!wantsPick && !stateFlow && items.length < 3) return null
  if (!wantsPick && !stateFlow && items[0].num > 2 && items.length < 4) return null

  return {
    title: stateFlow ? 'Your turn' : /length|duration|minute|second/i.test(raw) ? 'Video length' : 'Choose one',
    prompt: extractChoicePrompt(raw),
    items,
  }
}

function stripChoiceListLines(text, choices) {
  if (!choices?.items?.length) return text
  const labels = new Set(choices.items.map((c) => c.label.toLowerCase()))
  const out = []
  for (const line of String(text || '').split('\n')) {
    if (/^\s*(\d{1,2}[\.)]|[-*•]\s+|\*\*\d{1,2})/.test(line)) continue
    const lower = line.toLowerCase()
    if (labels.size >= 3 && /,\s*/.test(line) && [...labels].filter((l) => lower.includes(l)).length >= 3) continue
    out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function stripNumberedListForChoices(text, choices) {
  return stripChoiceListLines(text, choices)
}

module.exports = {
  parseAgentChoices,
  stripNumberedListForChoices,
  stripChoiceListLines,
}
