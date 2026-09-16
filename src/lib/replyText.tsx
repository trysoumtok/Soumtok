import type { ReactNode } from 'react'
import { classifyLink, splitTextWithLinks, type ClassifiedLink } from '../../shared/connectLinks'
import { parseReplyBlocks, type ReplyBlock } from '../../shared/replyFormat'

/** Light markdown for assistant replies: headings, lists, tables, paragraphs, bold, code, links. */
export function ReplyMarkdown({ text }: { text: string }) {
  const blocks = parseReplyBlocks(text)
  return (
    <div className="space-y-4 text-[14px] leading-7 text-white/80">
      {blocks.map((block, index) => (
        <ReplyBlockView key={index} block={block} first={index === 0} />
      ))}
    </div>
  )
}

function ReplyBlockView({ block, first }: { block: ReplyBlock; first: boolean }) {
  if (block.type === 'h') {
    const size = block.level === 1 ? 'text-[18px]' : block.level === 2 ? 'text-[16px]' : 'text-[15px]'
    return (
      <h2 className={`${size} font-medium tracking-tight text-white ${first ? '' : 'pt-2'}`}>
        {inline(block.text)}
      </h2>
    )
  }
  if (block.type === 'table') return <RecordTable headers={block.headers} rows={block.rows} />
  if (block.type === 'ul' || block.type === 'ol') {
    const Tag = block.type === 'ol' ? 'ol' : 'ul'
    return (
      <Tag className={`space-y-3.5 ${block.type === 'ol' ? 'list-decimal' : 'list-disc'} pl-5 marker:text-white/35`}>
        {block.items.map((item, itemIndex) => (
          <Point key={itemIndex} text={item} />
        ))}
      </Tag>
    )
  }
  return <p className="whitespace-pre-wrap">{inline(block.text)}</p>
}

function RecordTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  const cols = Math.max(headers.length, ...rows.map((row) => row.length), 1)
  const labels = Array.from({ length: cols }, (_, index) => headers[index] || '')
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[320px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03]">
            {labels.map((header, index) => (
              <th key={index} className="px-3 py-2 font-medium text-white/45">
                {inline(header || ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-white/[0.07]">
              {labels.map((_, col) => (
                <td key={col} className="px-3 py-2 align-top text-white/80">
                  {cell(row[col] || '', col, labels)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function cell(text: string, col: number, headers: string[]) {
  const header = (headers[col] || '').toLowerCase()
  const codeish = /type|name|host|value|target|data|content/.test(header) || col > 0
  const body = stripWrap(text)
  if (!codeish) return inline(text)
  return (
    <code className="whitespace-pre-wrap break-all font-mono text-[12px] text-white/90">{body}</code>
  )
}

function stripWrap(text: string) {
  return text.trim().replace(/^`+|`+$/g, '')
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

export function ChatLinkChip({ link }: { link: ClassifiedLink }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className="break-all text-[#9ec4ff] underline decoration-white/25 underline-offset-2 hover:text-white"
    >
      {link.label}
    </a>
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
