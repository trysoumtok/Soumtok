import type { ReactNode } from 'react'
import { classifyLink, linkChipClass, splitTextWithLinks, type ClassifiedLink } from '../../shared/connectLinks'

type Block =
  | { type: 'h'; level: number; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }

/** Light markdown for assistant replies: headings, point-form lists, paragraphs, bold, code, links. */
export function ReplyMarkdown({ text }: { text: string }) {
  const blocks = parseBlocks(text)
  return (
    <div className="space-y-4 text-[14px] leading-7 text-white/80">
      {blocks.map((block, index) => {
        if (block.type === 'h') {
          const size = block.level === 1 ? 'text-[18px]' : block.level === 2 ? 'text-[16px]' : 'text-[15px]'
          return (
            <h2 key={index} className={`${size} font-medium tracking-tight text-white ${index === 0 ? '' : 'pt-2'}`}>
              {inline(block.text)}
            </h2>
          )
        }
        if (block.type === 'ul' || block.type === 'ol') {
          const Tag = block.type === 'ol' ? 'ol' : 'ul'
          return (
            <Tag key={index} className={`space-y-3.5 ${block.type === 'ol' ? 'list-decimal' : 'list-disc'} pl-5 marker:text-white/35`}>
              {block.items.map((item, itemIndex) => (
                <Point key={itemIndex} text={item} />
              ))}
            </Tag>
          )
        }
        return (
          <p key={index} className="whitespace-pre-wrap">
            {inline(block.text)}
          </p>
        )
      })}
    </div>
  )
}

function Point({ text }: { text: string }) {
  const parts = text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean)
  const first = parts[0] || text
  const titled = /^\*\*(.+?)\*\*\s*([.—:-])?\s*([\s\S]*)$/.exec(first)
  const title = titled?.[1]?.trim()
  const lead = titled?.[3]?.trim()
  const rest = parts.slice(1)

  return (
    <li className="pl-1">
      {title ? (
        <>
          <p className="font-medium leading-6 text-white">{inline(title)}</p>
          {lead ? <p className="mt-1 leading-7 text-white/70">{inline(lead)}</p> : null}
        </>
      ) : (
        <p className="leading-7 text-white/80">{inline(first)}</p>
      )}
      {rest.map((para, index) => (
        <p key={index} className="mt-2 leading-7 text-white/70">
          {inline(para)}
        </p>
      ))}
    </li>
  )
}

function parseBlocks(raw: string): Block[] {
  const lines = raw.replace(/\r\n/g, '\n').trim().split('\n')
  const blocks: Block[] = []
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
        if (isHeading(cur) || isListItem(cur, !ordered)) break
        if (items.length) {
          items[items.length - 1] += ` ${cur.trim()}`
          i += 1
          continue
        }
        break
      }
      if (items.length) blocks.push({ type: ordered ? 'ol' : 'ul', items })
      continue
    }

    const chunk = [line]
    i += 1
    while (i < lines.length && lines[i].trim() && !isHeading(lines[i]) && !isListItem(lines[i], false) && !isListItem(lines[i], true)) {
      chunk.push(lines[i])
      i += 1
    }
    blocks.push({ type: 'p', text: chunk.join('\n') })
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

export function ChatLinkChip({ link }: { link: ClassifiedLink }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className={`my-0.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] no-underline ${linkChipClass(link.kind)}`}
    >
      <LinkGlyph kind={link.kind} />
      <span className="max-w-[240px] truncate">{link.label}</span>
    </a>
  )
}

function LinkGlyph({ kind }: { kind: ClassifiedLink['kind'] }) {
  if (kind === 'github') {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8" />
      </svg>
    )
  }
  if (kind === 'auth') {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <rect x="3" y="7" width="10" height="7" rx="1.5" />
        <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
      </svg>
    )
  }
  if (kind === 'share') {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <circle cx="4" cy="8" r="2" />
        <circle cx="12" cy="4" r="2" />
        <circle cx="12" cy="12" r="2" />
        <path d="M6 7.2 10 4.8M6 8.8 10 11.2" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M6.5 9.5 4.2 7.2a2.4 2.4 0 0 1 3.4-3.4L10 6.2M9.5 6.5l2.3 2.3a2.4 2.4 0 0 1-3.4 3.4L6 9.8" />
    </svg>
  )
}

function inline(text: string): ReactNode {
  const chunks = splitTextWithLinks(text)
  return chunks.map((chunk, index) => {
    if (chunk.type === 'link') return <ChatLinkChip key={`l-${index}`} link={chunk.link} />
    return mark(chunk.text, index)
  })
}

function mark(text: string, key: number): ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code key={`${key}-${index}`} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[12px] text-white/90">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={`${key}-${index}`} className="font-medium text-white">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <span key={`${key}-${index}`}>{part}</span>
  })
}

export { classifyLink }
