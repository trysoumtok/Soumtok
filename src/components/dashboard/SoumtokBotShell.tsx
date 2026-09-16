import { useState, useRef, type FormEvent, type ReactNode, type RefObject } from 'react'
import type { Profile, StudioProject } from '../../lib/api'
import { navigate } from '../../lib/nav'
import { dropHasFiles, filesFromClipboard, filesFromDrop, readChatFiles } from '../../lib/chatFiles'
import type { ChatFile } from '../../../shared/chatMedia'
import type { AgentDriver } from '../../../shared/soumtokBot'
import { AccountMenu } from './AccountMenu'
import { SearchIcon, MicIcon } from './icons'

const THREAD_COLORS = ['#339af0', '#845ef7', '#51cf66', '#ff6b6b', '#fcc419']

function threadColor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return THREAD_COLORS[Math.abs(hash) % THREAD_COLORS.length]
}

function formatListTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function previewLine(title: string) {
  const t = title.trim()
  if (!t) return 'New conversation'
  return t.length > 42 ? `${t.slice(0, 42)}…` : t
}

export function SoumtokBotShell({
  displayName,
  profile,
  projects,
  projectsReady,
  chatId,
  onNewChat,
  onPickChat,
  onSearch,
  onDownload,
  onProfileSaved,
  agentDriver,
  onAgentDriverChange,
  children,
}: {
  displayName: string
  profile: Profile | null
  projects: StudioProject[]
  projectsReady: boolean
  chatId: string | null
  onNewChat: () => void
  onPickChat: (id: string) => void
  onSearch: () => void
  onDownload?: () => void
  onProfileSaved?: () => void
  agentDriver: AgentDriver
  onAgentDriverChange: (driver: AgentDriver) => void
  children: ReactNode
}) {
  const isNew = !chatId

  return (
    <div className="bot-shell flex h-svh overflow-hidden bg-[#050505] text-white">
      <aside className="bot-sidebar hidden w-[min(320px,38vw)] shrink-0 flex-col border-r border-white/[0.06] bg-[#050505] lg:flex">
        <div className="flex items-center gap-2 px-3 pt-3">
          <button
            type="button"
            onClick={onSearch}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/[0.08] bg-[#141414] px-3 py-2.5 text-left text-[14px] text-white/40 hover:border-white/14"
          >
            <SearchIcon />
            <span>Search</span>
          </button>
          <button
            type="button"
            onClick={onNewChat}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-[#141414] text-[20px] text-white/70 hover:border-white/14 hover:text-white"
            aria-label="New bot chat"
          >
            +
          </button>
        </div>

        <div className="thin-scroll mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {!projectsReady ? (
            <div className="grid place-items-center py-12" role="status">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-white/70" />
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={onNewChat}
                className={`mb-1 flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left ${
                  isNew ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                }`}
              >
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#2a1510] text-[#f54e00]">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                    <path d="M8 2 14 13H2L8 2z" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-medium text-white">New Bot</span>
                    {isNew && (
                      <span className="shrink-0 text-[12px] text-white/35">
                        {new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    )}
                  </span>
                </span>
              </button>
              {projects.map((item) => {
                const active = chatId === item.id
                const color = threadColor(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onPickChat(item.id)}
                    className={`mb-1 flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left ${
                      active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <span
                      className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[13px] font-semibold text-white"
                      style={{ backgroundColor: `${color}33`, color }}
                    >
                      {(item.title || 'S').slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[14px] text-white/90">{item.title || 'Soumtok'}</span>
                        <span className="shrink-0 text-[12px] text-white/35">{formatListTime(String(item.updatedAt))}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-white/40">{previewLine(item.title || '')}</span>
                    </span>
                  </button>
                )
              })}
            </>
          )}
        </div>

        <div className="border-t border-white/[0.06] px-2 py-2">
          <button
            type="button"
            onClick={() => navigate('/dashboard/plugins')}
            className="mb-2 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] text-white/55 hover:bg-white/[0.04] hover:text-white"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <rect x="2" y="2" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
              <rect x="10" y="2" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
              <rect x="2" y="10" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
              <rect x="10" y="10" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
            </svg>
            Marketplace
          </button>
          <AccountMenu
            name={displayName}
            plan={profile?.plan}
            username={profile?.username}
            hasAvatar={profile?.hasAvatar}
            onDownload={onDownload}
            onProfileSaved={onProfileSaved}
            agentDriver={agentDriver}
            onAgentDriverChange={onAgentDriverChange}
          />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}

export function SoumtokBotChatHeader({ title }: { title: string }) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#2a1510] text-[#f54e00]">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M8 2 14 13H2L8 2z" />
          </svg>
        </span>
        <h1 className="truncate text-[15px] font-medium text-white">{title}</h1>
      </div>
      <div className="flex items-center gap-1 text-white/40">
        <button type="button" className="rounded-lg p-2 hover:bg-white/[0.06] hover:text-white/70" aria-label="Share">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M8 2v8M5 5l3-3 3 3M3 11v2h10v-2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" className="rounded-lg p-2 hover:bg-white/[0.06] hover:text-white/70" aria-label="Open on desktop">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <rect x="2" y="3" width="12" height="9" rx="1" />
            <path d="M5 13h6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </header>
  )
}

const ONBOARDING = [
  {
    key: 'A',
    title: 'Day-to-day tasks',
    sub: 'Reminders, research, drafting, errands',
    prompt: 'I mainly want help with day-to-day tasks — reminders, research, drafting, and errands.',
  },
  {
    key: 'B',
    title: 'Work / projects',
    sub: 'Code, docs, ops, shipping',
    prompt: 'I mainly want help with work and projects — code, docs, ops, and shipping.',
  },
  {
    key: 'C',
    title: 'Life admin',
    sub: 'Calendar, shopping, travel, bookings',
    prompt: 'I mainly want help with life admin — calendar, shopping, travel, and bookings.',
  },
  {
    key: 'D',
    title: 'Something specific',
    sub: "I'll tell you what it is",
    prompt: 'I have something specific in mind — I will describe it in my own words.',
  },
] as const

export function SoumtokBotOnboarding({
  displayName,
  busy,
  onPick,
}: {
  displayName: string
  busy: boolean
  onPick: (text: string) => void
}) {
  const first = displayName.trim().split(/\s+/)[0] || 'there'
  const [custom, setCustom] = useState('')

  return (
    <div className="mx-auto mt-10 w-full max-w-[640px] px-4">
      <p className="text-center text-[13px] text-white/35">
        Today {new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </p>
      <p className="mt-10 text-center text-[22px] leading-snug text-white sm:text-[26px]">
        Hey {first} — glad you&apos;re here.
      </p>
      <div className="bot-onboard-card mt-10 rounded-2xl border border-white/[0.08] bg-[#141414] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[17px] font-medium text-white">What do you mainly want me for?</p>
            <p className="mt-1 text-[14px] text-white/45">Pick whatever hits best, or type your own.</p>
          </div>
        </div>
        <div className="mt-5 space-y-2">
          {ONBOARDING.map((row) => (
            <button
              key={row.key}
              type="button"
              disabled={busy}
              onClick={() => onPick(row.prompt)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-[#1a1a1a] px-4 py-3.5 text-left hover:border-white/12 hover:bg-[#222] disabled:opacity-50"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-[13px] font-medium text-white/70">
                {row.key}
              </span>
              <span>
                <span className="block text-[15px] text-white">{row.title}</span>
                <span className="block text-[13px] text-white/40">{row.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault()
            const text = custom.trim()
            if (!text || busy) return
            onPick(text)
            setCustom('')
          }}
        >
          <input
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            placeholder="Type your own answer"
            disabled={busy}
            className="w-full rounded-xl border border-white/[0.08] bg-[#0f0f0f] px-4 py-3 text-[14px] text-white outline-none placeholder:text-white/30 focus:border-white/16"
          />
        </form>
      </div>
    </div>
  )
}

function pendingFileSrc(file: ChatFile) {
  if (file.dataUrl) return file.dataUrl
  if (file.id) return `/api/files/${file.id}/download?inline=1`
  return ''
}

function PendingChips({ files, onRemove }: { files: ChatFile[]; onRemove: (index: number) => void }) {
  if (!files.length) return null
  return (
    <div className="mb-3 flex flex-col gap-2">
      {files.map((file, index) => {
        const src = pendingFileSrc(file)
        const image = file.mime.startsWith('image/') && src
        const video = file.mime.startsWith('video/') && src
        return (
          <div key={`${file.name}-${index}`} className="flex items-center gap-2">
            <div className="grid h-[52px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-black/30">
              {image ? (
                <img src={src} alt="" className="h-full w-full object-cover" />
              ) : video ? (
                <video src={src} className="h-full w-full object-cover" muted playsInline />
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                  {(file.name.split('.').pop() || 'doc').slice(0, 4)}
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-white/10 bg-[#1a1a1a] px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[12px] text-white/85">{file.name}</span>
              <button
                type="button"
                className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md text-white/45 hover:bg-white/10 hover:text-white"
                onClick={() => onRemove(index)}
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function SoumtokBotComposer({
  prompt,
  setPrompt,
  busy,
  listening,
  onSend,
  onVoice,
  inputRef,
  pendingFiles,
  onPendingFiles,
  onAttachFiles,
  fileError,
  onFileError,
  onStop,
  threadLabel = 'New Bot',
}: {
  prompt: string
  setPrompt: (value: string) => void
  busy: boolean
  listening: boolean
  onSend: (event?: FormEvent) => void
  onVoice: () => void
  inputRef: RefObject<HTMLTextAreaElement | null>
  pendingFiles: ChatFile[]
  onPendingFiles: (files: ChatFile[]) => void
  onAttachFiles?: (files: File[]) => Promise<void> | void
  fileError: string
  onFileError: (value: string) => void
  onStop: () => void
  threadLabel?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [fileDrag, setFileDrag] = useState(false)

  async function addFiles(list: File[]) {
    if (!list.length) return
    if (onAttachFiles) {
      await onAttachFiles(list)
      return
    }
    const result = await readChatFiles(list)
    onFileError(result.error || '')
    if (!result.files.length) return
    onPendingFiles([...pendingFiles, ...result.files].slice(0, 6))
  }

  const canSend = Boolean(prompt.trim() || pendingFiles.length)

  return (
    <form
      onSubmit={onSend}
      className="bot-composer-sticky mx-auto w-full max-w-[min(100%,52rem)] px-5 pb-8 pt-3 sm:px-8 sm:pb-10"
    >
      {fileError && <p className="mb-2 text-center font-sans text-[12px] text-[#f54e00]">{fileError}</p>}
      <PendingChips files={pendingFiles} onRemove={(index) => onPendingFiles(pendingFiles.filter((_, i) => i !== index))} />
      <input
        ref={fileRef}
        type="file"
        accept="*/*"
        multiple
        className="hidden"
        onChange={(event) => {
          void addFiles([...(event.target.files || [])])
          event.target.value = ''
        }}
      />
      <div
        data-chat-drop-zone
        className={`bot-composer-pill relative flex items-center gap-1 rounded-[999px] border border-[#333] bg-[#262626] py-1.5 pl-1.5 pr-2 shadow-[0_16px_48px_rgba(0,0,0,0.45)] ${canSend ? 'has-text' : ''} ${fileDrag ? 'ring-2 ring-[#f54e00]/60' : ''}`}
        onDragEnter={(event) => {
          if (!dropHasFiles(event.dataTransfer)) return
          event.preventDefault()
          dragDepth.current += 1
          setFileDrag(true)
        }}
        onDragOver={(event) => {
          if (!dropHasFiles(event.dataTransfer)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={(event) => {
          if (!dropHasFiles(event.dataTransfer)) return
          dragDepth.current -= 1
          if (dragDepth.current <= 0) {
            dragDepth.current = 0
            setFileDrag(false)
          }
        }}
        onDrop={(event) => {
          event.preventDefault()
          dragDepth.current = 0
          setFileDrag(false)
          void addFiles(filesFromDrop(event.dataTransfer))
        }}
      >
        {fileDrag && (
          <span className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-[999px] bg-[#0c0c0b]/75 text-[12px] text-white">
            Drop images, video, or docs
          </span>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="bot-composer-circle grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#404040] bg-[#1a1a1a] text-[22px] font-light leading-none text-[#b0b0b0] hover:border-[#555] hover:text-white disabled:opacity-40"
          aria-label="Attach"
        >
          +
        </button>
        <textarea
          ref={inputRef}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onPaste={(event) => {
            const files = filesFromClipboard(event.clipboardData)
            if (files.length) {
              event.preventDefault()
              void addFiles(files)
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              onSend()
            }
          }}
          rows={1}
          disabled={busy}
          placeholder={`Message ${threadLabel}`}
          className="font-sans max-h-32 min-h-[44px] flex-1 resize-none border-0 bg-transparent px-1 py-2.5 text-[16px] leading-snug text-[#f2f2f2] outline-none placeholder:text-[#737373]"
        />
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="bot-composer-circle grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#404040] bg-[#1a1a1a] text-[#e7e7e7] hover:border-[#555]"
            aria-label="Stop"
          >
            ■
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onVoice}
              className={`bot-composer-circle grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#404040] bg-[#1a1a1a] hover:border-[#555] ${
                listening ? 'text-[#f54e00]' : 'text-[#b0b0b0] hover:text-white'
              }`}
              aria-label="Voice input"
            >
              <MicIcon />
            </button>
            {canSend && (
              <button
                type="submit"
                className="bot-composer-circle grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[15px] text-black hover:bg-[#e8e8e8]"
                aria-label="Send"
              >
                ↑
              </button>
            )}
          </>
        )}
      </div>
    </form>
  )
}
