import { useState } from 'react'
import { decodeSource, type AgentEvent } from '../../../shared/agent'
import { isImageDataUrl, isImageFilePath } from '../../../shared/preview'
import { highlight } from '../../lib/highlight'
import { AskCard, PlanCard, PromptChips, CapabilityLine, SecurityCard, ConnectCard, TodoList } from './AskCards'
import { shortenAgentStatus, toolFeedLabel, toolFeedLine } from '../../../shared/toolFeed'

export function AgentTimeline({
  events,
  files = {},
  collapsed = false,
  live = false,
  interactive = false,
  onPreview,
  onReview: _onReview,
  onOpenFile,
  onAsk,
  onSkipAsk,
  onApprovePlan,
  onChangePlan,
  onPrompt,
  onOpenKeys,
  onAcceptDiff,
  onRejectDiff,
  onConnectDone,
  messages,
}: {
  events: AgentEvent[]
  files?: Record<string, string>
  collapsed?: boolean
  live?: boolean
  interactive?: boolean
  onPreview?: () => void
  onReview?: () => void
  onOpenFile?: (path: string) => void
  onAsk?: (answers: Record<string, string[]>) => void
  onSkipAsk?: () => void
  onApprovePlan?: () => void
  onChangePlan?: () => void
  onPrompt?: (text: string) => void
  onOpenKeys?: () => void
  onAcceptDiff?: (path: string) => void
  onRejectDiff?: (path: string) => void
  onConnectDone?: (event: Extract<AgentEvent, { kind: 'connect' }>) => void
  messages?: { content?: string }[]
}) {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({})
  const lastThought = live
    ? events.reduce((found, event, index) => (event.kind === 'thought' ? index : found), -1)
    : -1
  const firstThought = events.findIndex((event) => event.kind === 'thought')
  return (
    <div className="space-y-3">
      {events.map((event, index) => {
        const key = event.kind === 'diff' ? `diff:${event.path}` : `${event.kind}-${index}`
        return (
          <AgentEventRow
            key={key}
            event={event}
            files={files}
            collapsed={collapsed}
            live={live && (event.kind === 'thought' ? index === lastThought : true)}
            lead={event.kind === 'thought' && index === firstThought}
            open={event.kind === 'diff' ? openMap[key] : undefined}
            onToggle={() =>
              setOpenMap((current) => {
                const size = event.kind === 'diff' ? event.added || event.lines.length : 0
                const fallback = collapsed ? false : size <= 40
                const was = key in current ? current[key] : fallback
                return { ...current, [key]: !was }
              })
            }
            onPreview={onPreview}
            onOpenFile={onOpenFile}
            interactive={interactive}
            onAsk={onAsk}
            onSkipAsk={onSkipAsk}
            onApprovePlan={onApprovePlan}
            onChangePlan={onChangePlan}
            onPrompt={onPrompt}
            onOpenKeys={onOpenKeys}
            onAcceptDiff={onAcceptDiff}
            onRejectDiff={onRejectDiff}
            onConnectDone={onConnectDone}
            messages={messages}
          />
        )
      })}
    </div>
  )
}

function AgentEventRow({
  event,
  files,
  collapsed,
  live,
  lead,
  open,
  onToggle,
  onPreview,
  onOpenFile,
  interactive,
  onAsk,
  onSkipAsk,
  onApprovePlan,
  onChangePlan,
  onPrompt,
  onOpenKeys,
  onAcceptDiff,
  onRejectDiff,
  onConnectDone,
  messages,
}: {
  event: AgentEvent
  files: Record<string, string>
  collapsed?: boolean
  live?: boolean
  lead?: boolean
  open?: boolean
  onToggle?: () => void
  onPreview?: () => void
  onOpenFile?: (path: string) => void
  interactive?: boolean
  onAsk?: (answers: Record<string, string[]>) => void
  onSkipAsk?: () => void
  onApprovePlan?: () => void
  onChangePlan?: () => void
  onPrompt?: (text: string) => void
  onOpenKeys?: () => void
  onAcceptDiff?: (path: string) => void
  onRejectDiff?: (path: string) => void
  onConnectDone?: (event: Extract<AgentEvent, { kind: 'connect' }>) => void
  messages?: { content?: string }[]
}) {
  if (event.kind === 'thought') return <ThoughtBlock seconds={event.seconds} text={event.text} live={live} lead={lead} />
  if (event.kind === 'explore') return <ExploreBlock items={event.items} startOpen={!collapsed} />
  if (event.kind === 'note') return <NoteBlock title={event.title} text={event.text} startOpen={!collapsed} />
  if (event.kind === 'ask') {
    if (event.answers) return null
    return (
      <AskCard event={event} locked={!interactive} onSubmit={onAsk} onSkip={onSkipAsk} />
    )
  }
  if (event.kind === 'plan') {
    return (
      <PlanCard
        event={event}
        locked={!interactive}
        onApprove={onApprovePlan}
        onChange={onChangePlan}
        files={files}
        messages={messages}
      />
    )
  }
  if (event.kind === 'todo') return <TodoList event={event} />
  if (event.kind === 'fetch') {
    return <CapabilityLine label={event.ok === false ? 'Fetch failed' : 'Fetched'} text={event.title || event.url} />
  }
  if (event.kind === 'document') {
    return <CapabilityLine label="Document" text={event.folder ? `${event.folder} / ${event.title}` : event.title} />
  }
  if (event.kind === 'folder') return null
  if (event.kind === 'mcp') {
    return <CapabilityLine label="MCP" text={`${event.server} · ${event.tool}${event.detail ? ` — ${event.detail}` : ''}`} />
  }
  if (event.kind === 'tool') {
    const path = event.args?.path || event.args?.file
    const text = toolFeedLine(event.name, event.args)
    const verb =
      event.name === 'read'
        ? 'Reading'
        : event.name === 'write'
          ? 'Writing'
          : event.name === 'diff' || event.name === 'edit'
            ? 'Editing'
            : event.name === 'grep'
              ? 'Searching'
              : event.name === 'terminal'
                ? 'Running'
                : toolFeedLabel(event.name)
    const line = (
      <p className="max-w-[560px] truncate text-[13px] text-white/70">
        {verb} <span className="font-mono text-white/50">{text}</span>
      </p>
    )
    if (path && onOpenFile) {
      return (
        <button type="button" onClick={() => onOpenFile(path)} className="block max-w-full text-left hover:text-white">
          {line}
        </button>
      )
    }
    return line
  }
  if (event.kind === 'result') {
    if (event.name === 'generate_image' && event.ok) {
      const path = event.text.match(/Saved still to ([^\s(]+)/i)?.[1] || event.text.match(/assets\/[^\s,)]+/)?.[0] || ''
      const fileBody = path ? files[path] : ''
      const src =
        fileBody && (fileBody.startsWith('data:') || fileBody.startsWith('/api/studio/images/'))
          ? fileBody.startsWith('/api/studio/images/')
            ? `${typeof window !== 'undefined' ? window.location.origin : ''}${fileBody}`
            : fileBody
          : null
      if (src && path) {
        return (
          <div className="max-w-[320px] overflow-hidden rounded-xl border border-white/10 bg-[#141413]">
            <img src={src} alt="" className="block max-h-56 w-full object-cover object-top" />
            <p className="px-3 py-2 font-mono text-[11px] text-white/45">{path}</p>
          </div>
        )
      }
    }
    const verb =
      event.name === 'read'
        ? 'Read'
        : event.name === 'write'
          ? 'Wrote'
          : event.name === 'diff'
            ? 'Edited'
            : event.name === 'generate_image'
              ? 'Generated'
              : event.ok
                ? 'Done'
                : 'Failed'
    return (
      <p className="max-w-[560px] truncate text-[13px] text-white/40">
        {event.ok ? verb : 'Failed'} <span className="font-mono">{event.text}</span>
      </p>
    )
  }
  if (event.kind === 'skill') return <CapabilityLine label="Skill" text={event.name} />
  if (event.kind === 'prompt') return <PromptChips items={event.items} onPick={onPrompt} />
  if (event.kind === 'security') {
    return (
      <SecurityCard
        event={event}
        onOpenEnv={() => onOpenFile?.(event.path || '.env')}
        onOpenKeys={onOpenKeys}
      />
    )
  }
  if (event.kind === 'connect') {
    return <ConnectCard event={event} onDone={() => onConnectDone?.(event)} />
  }
  if (event.kind === 'action') return <p className="text-[13px] text-white/45">{event.text}</p>
  if (event.kind === 'artifact') {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#161615] px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] text-white">{event.title}</p>
          <p className="truncate text-[12px] text-white/40">{event.description || event.path}</p>
        </div>
        <button
          type="button"
          onClick={() => onOpenFile?.(event.path)}
          className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-[#111110] hover:bg-white/90"
        >
          Open
        </button>
      </div>
    )
  }
  if (event.kind === 'diff') {
    return (
      <DiffBlock
        event={event}
        source={files[event.path] || ''}
        collapsed={collapsed}
        live={live}
        open={open}
        onToggle={onToggle}
        interactive={interactive}
        onAccept={() => onAcceptDiff?.(event.path)}
        onReject={() => onRejectDiff?.(event.path)}
      />
    )
  }
  if (event.kind === 'command') return <CommandBlock command={event.command} output={event.output} ok={event.ok} />
  if (event.kind === 'preview') {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#161615] px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.06] text-white/70">
          <GlobeIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] text-white">{event.title}</p>
          {event.description && <p className="truncate text-[12px] text-white/40">{event.description}</p>}
        </div>
        <button
          type="button"
          onClick={onPreview}
          className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-[#111110] hover:bg-white/90"
        >
          Preview
        </button>
      </div>
    )
  }
  return <p className="whitespace-pre-wrap text-[14px] leading-6 text-white/85">{event.text}</p>
}

function CommandBlock({ command, output, ok }: { command: string; output?: string; ok?: boolean }) {
  const [open, setOpen] = useState(Boolean(output))
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#161615]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left font-mono text-[13px] text-white/80 hover:bg-white/[0.03]"
      >
        <span className="shrink-0 text-white/35">$</span>
        <span className={open ? 'min-w-0 whitespace-pre-wrap break-words' : 'min-w-0 truncate'}>{command}</span>
        {ok === true && <span className="ml-auto shrink-0 text-[11px] text-[#3fb950]">ok</span>}
        {ok === false && <span className="ml-auto shrink-0 text-[11px] text-[#f85149]">fail</span>}
      </button>
      {open && output && (
        <pre className="max-h-56 overflow-auto border-t border-white/[0.07] px-3 py-2 font-mono text-[12px] leading-5 text-white/55">
          {output}
        </pre>
      )}
    </div>
  )
}

function ThoughtBlock({ seconds, text, live, lead }: { seconds: number; text: string; live?: boolean; lead?: boolean }) {
  const [touched, setTouched] = useState(false)
  const [open, setOpen] = useState(false)
  const short = shortenAgentStatus(text)
  const hideBody = /→|GROUND TRUTH|CODE SHAPE|VERIFY:/i.test(text) || text.length > 120
  if (lead) {
    if (hideBody) return null
    return <p className="whitespace-pre-wrap text-[14px] leading-6 text-white/80">{short}</p>
  }
  const shown = touched ? open : Boolean(live)
  const label = live ? 'Thinking' : seconds === 1 ? 'Thought for 1 second' : `Thought for ${seconds} seconds`
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (hideBody) return
          setTouched(true)
          setOpen(!shown)
        }}
        className="text-[13px] text-white/38 hover:text-white/60"
      >
        {label} {!hideBody && (shown ? '⌄' : '>')}
      </button>
      {shown && short && !hideBody && <p className="mt-1.5 text-[13px] leading-5 text-white/55">{short}</p>}
    </div>
  )
}

function NoteBlock({ title, text, startOpen = true }: { title: string; text: string; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen)
  return (
    <div>
      <button type="button" onClick={() => setOpen((value) => !value)} className="text-[13px] text-white/38">
        {title} {open ? '⌄' : '>'}
      </button>
      {open && <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-5 text-white/65">{text}</p>}
    </div>
  )
}

function ExploreBlock({ items, startOpen = true }: { items: { action: string; path: string }[]; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen)
  return (
    <div>
      <button type="button" onClick={() => setOpen((value) => !value)} className="text-[13px] text-white/38">
        Exploring {open ? '⌄' : '>'}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 pl-4">
          {items.map((item, index) => (
            <p key={`${item.path}-${index}`} className="text-[13px] text-white/45">
              {item.action} {item.path}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function DiffBlock({
  event,
  source,
  collapsed,
  live,
  open: openProp,
  onToggle,
  interactive,
  onAccept,
  onReject,
}: {
  event: Extract<AgentEvent, { kind: 'diff' }>
  source: string
  collapsed?: boolean
  live?: boolean
  open?: boolean
  onToggle?: () => void
  interactive?: boolean
  onAccept?: () => void
  onReject?: () => void
}) {
  const [full, setFull] = useState(false)
  const hidden = event.hidden || 0
  const size = event.added || event.lines.length
  const open = openProp ?? (collapsed ? false : live || event.removed > 0 || Boolean(event.previous) || size <= 40)
  const raw = full && source ? source.split('\n').map((text) => ({ kind: 'add' as const, text })) : event.lines
  const lines = raw.flatMap((line) =>
    decodeSource(line.text)
      .split('\n')
      .map((text) => ({ kind: line.kind, text })),
  )
  const canExpand = hidden > 0 && Boolean(source)
  const peeking = !open && !collapsed && lines.length > 0
  const visible = open ? lines : peeking ? lines.slice(0, 12) : []
  const blobFromLines = event.lines.find((line) => isImageDataUrl(line.text))?.text
  const imageSrc = isImageDataUrl(source)
    ? source
    : blobFromLines
      ? blobFromLines
      : isImageFilePath(event.path) && source.startsWith('/api/studio/images/')
        ? `${typeof window !== 'undefined' ? window.location.origin : ''}${source}`
        : ''

  if (imageSrc) {
    return (
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0d0d0c]">
        <img src={imageSrc} alt="" className="block max-h-64 w-full bg-[#0a0a0a] object-contain object-center" />
        <p className="truncate px-3 py-2 font-mono text-[11px] text-white/45">{event.path}</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0d0d0c]">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? `Collapse ${event.path}` : `Expand ${event.path}`}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.stopPropagation()
          onToggle?.()
        }}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-white/[0.03]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={`text-[10px] text-white/30 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
          <span className="truncate font-mono text-[12px] text-white/75">{event.path}</span>
        </span>
        <span className="shrink-0 font-mono text-[11px]">
          {event.added > 0 && <span className="text-[#3fb950]">+{event.added}</span>}
          {event.added > 0 && event.removed > 0 && <span> </span>}
          {event.removed > 0 && <span className="text-[#f85149]">-{event.removed}</span>}
        </span>
      </button>
      {visible.length > 0 && (
        <div className="border-t border-white/[0.07] font-mono text-[12px] leading-5">
          {hidden > 0 && open && (
            <button
              type="button"
              disabled={!canExpand}
              onClick={() => setFull((value) => !value)}
              className="flex w-full items-center justify-center gap-1.5 border-b border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-[11px] text-white/35 enabled:hover:bg-white/[0.05] enabled:hover:text-white/60"
            >
              {full ? 'Collapse' : `${hidden} unmodified lines`}
              <span className={`transition-transform ${full ? 'rotate-180' : ''}`}>⌄</span>
            </button>
          )}
          <div>
            {visible.map((line, index) => (
              <div
                key={`${line.kind}-${index}`}
                className={`flex gap-3 px-3 ${
                  line.kind === 'add'
                    ? 'bg-[#0f2417]'
                    : line.kind === 'del'
                      ? 'bg-[#2a1214]'
                      : ''
                }`}
              >
                <span
                  className={`w-3 shrink-0 select-none ${
                    line.kind === 'add' ? 'text-[#3fb950]' : line.kind === 'del' ? 'text-[#f85149]' : 'text-white/20'
                  }`}
                >
                  {line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '}
                </span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-all text-white/80">
                  {line.kind === 'del' ? (
                    <span className="text-[#ffb1af]">
                      {isImageDataUrl(line.text) || (isImageFilePath(event.path) && line.text.length > 800)
                        ? `Generated image · ~${Math.max(1, Math.round((line.text.length * 0.75) / 1024))} KB`
                        : line.text}
                    </span>
                  ) : isImageDataUrl(line.text) || (isImageFilePath(event.path) && line.text.length > 800) ? (
                    `Generated image · ~${Math.max(1, Math.round((line.text.length * 0.75) / 1024))} KB`
                  ) : (
                    highlight(line.text, event.path)
                  )}
                </span>
              </div>
            ))}
          </div>
          {peeking && lines.length > 12 && (
            <button
              type="button"
              onPointerDown={(event) => {
                if (event.button !== 0) return
                event.preventDefault()
                onToggle?.()
              }}
              className="flex w-full items-center justify-center border-t border-white/[0.07] px-3 py-1.5 text-[11px] text-white/35 hover:bg-white/[0.05] hover:text-white/60"
            >
              Show more
            </button>
          )}
        </div>
      )}
      {interactive && event.accepted === undefined && (
        <div className="flex items-center justify-end gap-2 border-t border-white/[0.07] px-3 py-2">
          <button type="button" onClick={onReject} className="rounded-lg px-2.5 py-1 text-[12px] text-white/40 hover:text-white">
            Discard
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="rounded-lg bg-white px-2.5 py-1 text-[12px] font-medium text-[#111110]"
          >
            Keep
          </button>
        </div>
      )}
      {event.accepted === true && <p className="px-3 py-1.5 text-[11px] text-white/35">Kept</p>}
      {event.accepted === false && <p className="px-3 py-1.5 text-[11px] text-white/35">Discarded</p>}
    </div>
  )
}

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.4" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.6 8h10.8M8 2.6c1.6 1.7 2.4 3.5 2.4 5.4S9.6 11.7 8 13.4C6.4 11.7 5.6 9.9 5.6 8S6.4 4.3 8 2.6Z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}
