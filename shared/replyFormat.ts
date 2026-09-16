export type ReplyBlock =
  | { type: 'h'; level: number; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][]; caption?: string }

const DNS_TYPE = /^(A|AAAA|CNAME|ALIAS|ANAME|TXT|MX|NS|SRV|CAA)$/i

export function isDnsType(value: string) {
  return DNS_TYPE.test(value.trim())
}

function stripTicks(value: string) {
  return value.trim().replace(/^`+|`+$/g, '').replace(/^\*+|\*+$/g, '').trim()
}

function looksLikeDnsName(name: string) {
  const n = stripTicks(name)
  if (!n || n.length > 80 || /[,\s]/.test(n)) return false
  if (n === '@' || n === '*') return true
  return /^(?:\*\.)?(?:_?[a-z0-9-]+(?:[._][a-z0-9-]+)*)\.?$/i.test(n)
}

function looksLikeHost(value: string) {
  const v = stripTicks(value)
  if (!v || v.length > 253) return false
  if (v === '@') return true
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(v)) return true
  if (/^[0-9a-f:]+$/i.test(v) && v.includes(':')) return true
  return /^(?:\*\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}\.?$/i.test(v)
}

function looksLikeDnsValue(type: string, value: string) {
  const v = stripTicks(value)
  if (!v) return false
  if (/\b(calculator|website|landing page|plain html|no build|dark-on-cream)\b/i.test(v)) return false
  const words = v.split(/\s+/).length
  if (type === 'A') return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(v)
  if (type === 'AAAA') return /^[0-9a-f:]+$/i.test(v) && v.includes(':')
  if (type === 'MX') return (/^\d+\s+\S+/.test(v) || looksLikeHost(v)) && words <= 4
  if (type === 'TXT' || type === 'CAA') return v.length <= 512 && words <= 12
  return looksLikeHost(v)
}

export function isDnsRecordRow(type: string, name: string, value: string) {
  return isDnsType(type) && looksLikeDnsName(name) && looksLikeDnsValue(type, value)
}

/** Pull a Type / Name / Value row out of a loose DNS line. */
export function parseDnsRow(raw: string): { type: string; name: string; value: string } | null {
  const line = stripTicks(raw.replace(/^\s*[-*]\s+/, '').replace(/^\s*\d+\.\s+/, '')).replace(/\s+/g, ' ').trim()
  if (!line) return null

  const labeled =
    /(?:type|record)\s*[:=]\s*`?([A-Z]+)`?\s*(?:[,|—–-]\s*)?(?:name|host)\s*[:=]\s*`?([^,|]+?)`?\s*(?:[,|—–-]\s*)?(?:value|target|data|content)\s*[:=]\s*`?(.+?)`?\s*$/i.exec(
      line,
    )
  if (labeled && isDnsRecordRow(labeled[1], labeled[2], labeled[3])) {
    return { type: labeled[1].toUpperCase(), name: stripTicks(labeled[2]), value: stripTicks(labeled[3]) }
  }

  const parts = line.split(/\s+/)
  const typeAt = parts.findIndex((part) => isDnsType(stripTicks(part)))
  if (typeAt < 0 || typeAt > 2) return null
  const type = stripTicks(parts[typeAt]).toUpperCase()
  const rest = parts.slice(typeAt + 1)
  if (rest.length < 2) return null
  const name = stripTicks(rest[0])
  if (!name || /^(record|type|add|set)$/i.test(name)) return null
  const value = stripTicks(rest.slice(1).join(' '))
  if (!isDnsRecordRow(type, name, value)) return null
  return { type, name, value }
}

function tableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isTableRow(line: string) {
  const trimmed = line.trim()
  return trimmed.startsWith('|') && trimmed.includes('|', 1)
}

function isTableSep(line: string) {
  return /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line)
}

function looksDnsHeaders(headers: string[]) {
  const joined = headers.map((item) => item.toLowerCase()).join(' ')
  return /type/.test(joined) && /name|host/.test(joined) && /value|target|data|content/.test(joined)
}

function rowsFromItems(items: string[]) {
  const rows: string[][] = []
  const leftover: string[] = []
  for (const item of items) {
    const dns = parseDnsRow(item)
    if (dns) rows.push([dns.type, dns.name, dns.value])
    else leftover.push(item)
  }
  return { rows, leftover }
}

function rowsFromParagraph(text: string) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  return rowsFromItems(lines)
}

/** Markdown tables plus DNS records that arrived as lists or loose lines. */
export function parseReplyBlocks(raw: string): ReplyBlock[] {
  const lines = raw.replace(/\r\n/g, '\n').trim().split('\n')
  const blocks: ReplyBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i += 1
      continue
    }

    const heading = /^(#{1,3})\s+(.+)\s*$/.exec(line)
    if (heading) {
      blocks.push({ type: 'h', level: heading[1].length, text: heading[2].trim() })
      i += 1
      continue
    }

    if (isTableRow(line)) {
      const headers = tableCells(line)
      let j = i + 1
      if (j < lines.length && isTableSep(lines[j])) j += 1
      const rows: string[][] = []
      while (j < lines.length && isTableRow(lines[j]) && !isTableSep(lines[j])) {
        rows.push(tableCells(lines[j]))
        j += 1
      }
      if (rows.length || looksDnsHeaders(headers)) {
        if (looksDnsHeaders(headers)) {
          const dnsRows = rows.filter((row) => isDnsRecordRow(row[0] || '', row[1] || '', row.slice(2).join(' ')))
          if (dnsRows.length && dnsRows.length >= rows.length) {
            blocks.push({ type: 'table', headers: ['Type', 'Name', 'Value'], rows: dnsRows })
          } else {
            const prose = rows.map((row) => row.filter(Boolean).join(' ')).join('\n\n').trim()
            if (prose) blocks.push({ type: 'p', text: prose })
          }
        } else {
          blocks.push({ type: 'table', headers, rows })
        }
        i = j
        continue
      }
    }

    const bullet = /^\s*[-*]\s+(.+)/.exec(line)
    const numbered = /^\s*\d+\.\s+(.+)/.exec(line)
    if (bullet || numbered) {
      const ordered = Boolean(numbered)
      const items: string[] = []
      while (i < lines.length) {
        const cur = lines[i]
        if (!cur.trim()) {
          const next = nextFilled(lines, i + 1)
          if (!next || isHeading(next)) break
          if (isListItem(next, true) || isListItem(next, false)) {
            i = skipBlanks(lines, i)
            continue
          }
          items[items.length - 1] += `\n\n${next.trim()}`
          i = skipBlanks(lines, i) + 1
          continue
        }
        const item = ordered ? /^\s*\d+\.\s+(.+)/.exec(cur) : /^\s*[-*]\s+(.+)/.exec(cur)
        if (item) {
          items.push(item[1])
          i += 1
          continue
        }
        if (isHeading(cur) || isListItem(cur, !ordered) || isTableRow(cur)) break
        if (items.length) {
          items[items.length - 1] += ` ${cur.trim()}`
          i += 1
          continue
        }
        break
      }
      if (items.length) {
        const dns = rowsFromItems(items)
        if (dns.rows.length >= 1 && dns.rows.length >= items.length - 1) {
          if (dns.leftover.length) {
            blocks.push({ type: ordered ? 'ol' : 'ul', items: dns.leftover })
          }
          blocks.push({ type: 'table', headers: ['Type', 'Name', 'Value'], rows: dns.rows })
        } else {
          blocks.push({ type: ordered ? 'ol' : 'ul', items })
        }
      }
      continue
    }

    const chunk = [line]
    i += 1
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isHeading(lines[i]) &&
      !isListItem(lines[i], false) &&
      !isListItem(lines[i], true) &&
      !isTableRow(lines[i])
    ) {
      chunk.push(lines[i])
      i += 1
    }
    const text = chunk.join('\n')
    const dns = rowsFromParagraph(text)
    if (dns.rows.length >= 2 || (dns.rows.length === 1 && dns.leftover.length === 0 && parseDnsRow(text.split('\n')[0] || ''))) {
      if (dns.leftover.length) blocks.push({ type: 'p', text: dns.leftover.join('\n') })
      blocks.push({ type: 'table', headers: ['Type', 'Name', 'Value'], rows: dns.rows })
    } else {
      blocks.push({ type: 'p', text })
    }
  }

  return blocks
}

function isHeading(line: string) {
  return /^#{1,3}\s+\S/.test(line)
}

function isListItem(line: string, ordered: boolean) {
  return ordered ? /^\s*\d+\.\s+\S/.test(line) : /^\s*[-*]\s+\S/.test(line)
}

function nextFilled(lines: string[], from: number) {
  for (let i = from; i < lines.length; i += 1) {
    if (lines[i].trim()) return lines[i]
  }
  return ''
}

function skipBlanks(lines: string[], from: number) {
  let i = from
  while (i < lines.length && !lines[i].trim()) i += 1
  return i
}
