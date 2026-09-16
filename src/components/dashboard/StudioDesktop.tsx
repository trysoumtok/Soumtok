import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode, type RefObject } from 'react'
import type { AgentEvent } from '../../../shared/agent'
import { previewStamp } from '../../../shared/preview'
import { filesFromClipboard } from '../../lib/chatFiles'
import { Bone } from '../Loaders'
import { CodeEditor } from './CodeEditor'

export type DeskApp = 'browser' | 'files' | 'terminal'

type WinKind = DeskApp
type Win = {
  id: string
  kind: WinKind
  x: number
  y: number
  w: number
  h: number
  z: number
  min?: boolean
  placed?: boolean
}

export function StudioDesktop({
  html,
  files,
  title,
  url,
  control,
  onControl,
  busy,
  commands,
  launch,
  onLaunch,
  onSaveFile,
  openFile,
  onRunCommand,
  onPasteFiles,
}: {
  html: string
  files: Record<string, string>
  title: string
  url: string
  control: boolean
  onControl: (value: boolean) => void
  busy?: boolean
  commands: Extract<AgentEvent, { kind: 'command' }>[]
  launch?: DeskApp | null
  onLaunch?: () => void
  onSaveFile: (path: string, content: string) => void
  openFile?: string
  onRunCommand?: (command: string) => Promise<string>
  onPasteFiles?: (files: File[]) => void
}) {
  const desk = useRef<HTMLDivElement>(null)
  const seq = useRef(1)
  const [wins, setWins] = useState<Win[]>([{ id: 'browser-1', kind: 'browser', x: 20, y: 10, w: 900, h: 580, z: 1 }])
  const [top, setTop] = useState(1)
  const [clock, setClock] = useState(() => deskClock())
  const [editPath, setEditPath] = useState('')
  const [draft, setDraft] = useState('')

  useEffect(() => {
    const tick = window.setInterval(() => setClock(deskClock()), 30_000)
    return () => window.clearInterval(tick)
  }, [])

  useEffect(() => {
    const box = desk.current
    if (!box) return
    function fit() {
      const w = box.clientWidth
      const h = box.clientHeight
      if (w < 80 || h < 80) return
      setWins((current) =>
        current.map((item) => {
          if (!item.placed) return item
          return {
            ...item,
            w: Math.min(item.w, Math.max(360, w - 24)),
            h: Math.min(item.h, Math.max(240, h - 56)),
            x: Math.min(item.x, Math.max(8, w - 96)),
            y: Math.min(item.y, Math.max(8, h - 96)),
          }
        }),
      )
    }
    fit()
    const obs = new ResizeObserver(fit)
    obs.observe(box)
    return () => obs.disconnect()
  }, [])

  function nextZ() {
    const z = top + 1
    setTop(z)
    return z
  }

  function spawn(kind: WinKind) {
    if (!control) onControl(true)
    const box = desk.current
    const n = seq.current++
    const extra = (n % 4) * 28
    const w = box?.clientWidth || 960
    const h = box?.clientHeight || 640
    const rect =
      kind === 'browser'
        ? {
            placed: true as const,
            x: 28 + extra,
            y: 16 + extra * 0.35,
            w: Math.max(640, w - 56 - extra),
            h: Math.max(420, h - 84 - extra * 0.35),
          }
        : {
            placed: true as const,
            x: 80 + extra,
            y: 56 + extra,
            w: Math.min(720, Math.max(460, w * 0.56)),
            h: Math.min(480, Math.max(300, h * 0.56)),
          }
    setWins((current) => {
      if (kind !== 'browser') {
        const found = current.find((item) => item.kind === kind)
        if (found) {
          const z = nextZ()
          return current.map((item) => (item.id === found.id ? { ...item, z, min: false } : item))
        }
      }
      return [...current, { id: `${kind}-${n}`, kind, z: nextZ(), ...rect }]
    })
  }

  useEffect(() => {
    if (!launch) return
    spawn(launch)
    onLaunch?.()
  }, [launch])

  useEffect(() => {
    if (!openFile) return
    setEditPath(openFile)
    setDraft(files[openFile] || '')
    spawn('files')
  }, [openFile])

  function focus(id: string) {
    const z = nextZ()
    setWins((current) => current.map((item) => (item.id === id ? { ...item, z, min: false } : item)))
  }

  function closeWin(id: string) {
    setWins((current) => current.filter((item) => item.id !== id))
  }

  function patch(id: string, next: Partial<Win>) {
    setWins((current) => current.map((item) => (item.id === id ? { ...item, ...next } : item)))
  }

  function onOpenFile(path: string) {
    setEditPath(path)
    setDraft(files[path] || '')
    spawn('files')
  }

  return (
    <div ref={desk} className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#1a2a18]">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/images/studio-hills.svg)' }}
      />

      <div className="absolute inset-x-0 top-0 z-40 flex h-8 items-center justify-between bg-black/40 px-3 text-[11px] text-white/90 backdrop-blur-md">
        <button
          type="button"
          onClick={() => onControl(!control)}
          className="rounded px-1.5 py-0.5 text-[11px] text-white/80 hover:bg-white/10"
        >
          {control ? 'Leave computer' : 'Use this computer'}
        </button>
        <span className="tabular-nums tracking-wide">{clock}</span>
      </div>

      <div className="absolute inset-x-0 bottom-0 top-8">
        {wins
          .filter((item) => !item.min)
          .sort((a, b) => a.z - b.z)
          .map((win) => (
            <DeskWindow
              key={win.id}
              win={win}
              host={desk}
              control={control}
              onFocus={() => focus(win.id)}
              onClose={() => closeWin(win.id)}
              onPatch={(next) => patch(win.id, next)}
            >
              {win.kind === 'browser' && (
                <BrowserChrome
                  siteTitle={title}
                  origin={url}
                  html={html}
                  files={files}
                  busy={busy}
                  control={control}
                  onPasteFiles={onPasteFiles}
                />
              )}
              {win.kind === 'files' && (
                <FilesChrome
                  files={files}
                  openPath={editPath}
                  draft={draft}
                  onOpen={onOpenFile}
                  onDraft={setDraft}
                  onSave={() => editPath && onSaveFile(editPath, draft)}
                  onMkdir={(path) => onSaveFile(`${path.replace(/^\/+|\/+$/g, '')}/.keep`, '')}
                />
              )}
              {win.kind === 'terminal' && (
                <TerminalChrome commands={commands} files={files} busy={busy} onRunCommand={onRunCommand} />
              )}
            </DeskWindow>
          ))}
      </div>

      <div className="absolute bottom-2.5 left-1/2 z-50 flex -translate-x-1/2 items-end rounded-[22px] border border-white/12 bg-black/50 px-3 py-2 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <DockIcon label="Chrome" active={wins.some((item) => item.kind === 'browser' && !item.min)} onClick={() => spawn('browser')}>
          <ChromeMark />
        </DockIcon>
      </div>
    </div>
  )
}

function DeskWindow({
  win,
  host,
  control,
  onFocus,
  onClose,
  onPatch,
  children,
}: {
  win: Win
  host: RefObject<HTMLDivElement | null>
  control: boolean
  onFocus: () => void
  onClose: () => void
  onPatch: (next: Partial<Win>) => void
  children: ReactNode
}) {
  const chrome = win.kind === 'browser'
  const root = useRef<HTMLDivElement>(null)
  const fill = chrome && !win.placed

  function bounds() {
    const box = host.current
    const node = root.current
    if (!box || !node) return { x: win.x, y: win.y, w: win.w, h: win.h }
    const wr = node.getBoundingClientRect()
    const br = box.getBoundingClientRect()
    return {
      x: wr.left - br.left,
      y: wr.top - br.top,
      w: wr.width,
      h: wr.height,
    }
  }

  function drag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!control) return
    const box = host.current
    if (!box) return
    event.preventDefault()
    event.stopPropagation()
    onFocus()
    const startX = event.clientX
    const startY = event.clientY
    const snapped = bounds()
    const origX = snapped.x
    const origY = snapped.y
    if (!win.placed) onPatch({ placed: true, ...snapped })
    const node = event.currentTarget
    node.setPointerCapture(event.pointerId)
    function move(next: PointerEvent) {
      const boxRect = box.getBoundingClientRect()
      onPatch({
        placed: true,
        x: Math.max(8, Math.min(boxRect.width - 80, origX + next.clientX - startX)),
        y: Math.max(4, Math.min(boxRect.height - 80, origY + next.clientY - startY)),
      })
    }
    function up(next: PointerEvent) {
      node.releasePointerCapture(next.pointerId)
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerup', up)
    }
    node.addEventListener('pointermove', move)
    node.addEventListener('pointerup', up)
  }

  function resize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!control) return
    event.preventDefault()
    event.stopPropagation()
    onFocus()
    const startX = event.clientX
    const startY = event.clientY
    const snapped = bounds()
    const origW = snapped.w
    const origH = snapped.h
    if (!win.placed) onPatch({ placed: true, ...snapped })
    const node = event.currentTarget
    node.setPointerCapture(event.pointerId)
    function move(next: PointerEvent) {
      onPatch({
        placed: true,
        w: Math.max(480, origW + next.clientX - startX),
        h: Math.max(300, origH + next.clientY - startY),
      })
    }
    function up(next: PointerEvent) {
      node.releasePointerCapture(next.pointerId)
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerup', up)
    }
    node.addEventListener('pointermove', move)
    node.addEventListener('pointerup', up)
  }

  function maximize() {
    onPatch({ placed: false })
  }

  return (
    <div
      ref={root}
      onPointerDown={onFocus}
      className={`absolute flex flex-col overflow-hidden ${
        chrome
          ? 'soum-chrome-win rounded-[10px] border border-black/15 bg-[#dee1e6] shadow-[0_24px_70px_rgba(0,0,0,0.4),0_2px_8px_rgba(0,0,0,0.2)]'
          : 'rounded-lg border border-black/20 bg-[#ececec] shadow-[0_28px_80px_rgba(0,0,0,0.42)]'
      }`}
      style={
        fill
          ? { top: 8, right: 14, bottom: 62, left: 14, width: 'auto', height: 'auto', zIndex: win.z }
          : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }
      }
    >
      {chrome ? null : (
        <div
          onPointerDown={drag}
          className="flex h-8 shrink-0 cursor-grab items-center gap-2 bg-[#d9d9d9] px-2 active:cursor-grabbing"
        >
          <WinDots onClose={onClose} onMin={() => onPatch({ min: true })} onMax={maximize} />
          <span className="min-w-0 flex-1 truncate text-center text-[11px] text-black/70">
            {win.kind === 'files' ? 'workspace — Files' : 'Terminal'}
          </span>
        </div>
      )}
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {chrome && isValidElement(children)
          ? cloneElement(children as ReactElement<{
              onMoveWindow?: typeof drag
              onClose?: () => void
              onMin?: () => void
              onMax?: () => void
            }>, {
              onMoveWindow: drag,
              onClose,
              onMin: () => onPatch({ min: true }),
              onMax: maximize,
            })
          : children}
      </div>
      {control && (
        <div onPointerDown={resize} className="absolute bottom-0 right-0 z-20 h-4 w-4 cursor-nwse-resize" aria-hidden />
      )}
    </div>
  )
}

function WinDots({ onClose, onMin, onMax }: { onClose: () => void; onMin: () => void; onMax?: () => void }) {
  return (
    <>
      <button type="button" aria-label="Close" onClick={onClose} className="h-3 w-3 rounded-full bg-[#ff5f57]" />
      <button type="button" aria-label="Minimize" onClick={onMin} className="h-3 w-3 rounded-full bg-[#febc2e]" />
      <button type="button" aria-label="Maximize" onClick={onMax} className="h-3 w-3 rounded-full bg-[#28c840]" />
    </>
  )
}

function BrowserChrome({
  siteTitle,
  html,
  files,
  onMoveWindow,
  onClose,
  onMin,
  onMax,
  onPasteFiles,
}: {
  siteTitle?: string
  origin?: string
  html?: string
  files?: Record<string, string>
  busy?: boolean
  control: boolean
  onMoveWindow?: (event: ReactPointerEvent<HTMLDivElement>) => void
  onClose?: () => void
  onMin?: () => void
  onMax?: () => void
  onPasteFiles?: (files: File[]) => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const stamp = previewStamp(html || '', files || {})
  const seq = useRef(0)
  const [path, setPath] = useState('')
  const [served, setServed] = useState('')
  const [bust, setBust] = useState(0)
  const href = path && served ? `${window.location.origin}${path}${path.includes('?') ? '&' : '?'}v=${served}.${bust}` : ''
  const label = siteTitle || 'Preview'
  const refreshing = Boolean(stamp) && served !== stamp
  const showSkeleton = !href

  useEffect(() => {
    if (!html && !Object.keys(files || {}).length) {
      setPath('')
      setServed('')
      return
    }
    const next = ++seq.current
    const ac = new AbortController()
    const timer = window.setTimeout(() => {
      void fetch('/api/studio/site', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        signal: ac.signal,
        body: JSON.stringify({ html: html || '', files: files || {}, seq: next }),
      })
        .then((res) => res.json())
        .then((data: { path?: string }) => {
          if (next !== seq.current || !data.path) return
          setPath(data.path)
          setServed(stamp)
        })
        .catch(() => undefined)
    }, 80)
    return () => {
      ac.abort()
      window.clearTimeout(timer)
    }
    // stamp already covers html + files bodies
  }, [stamp])

  useEffect(() => {
    const node = frame.current
    if (!node || !onPasteFiles) return undefined
    let doc: Document | null = null
    const onPaste = (event: ClipboardEvent) => {
      const files = filesFromClipboard(event.clipboardData)
      if (!files.length) return
      event.preventDefault()
      event.stopPropagation()
      onPasteFiles(files)
    }
    function attach() {
      try {
        doc?.removeEventListener('paste', onPaste)
        doc = node.contentDocument
        doc?.addEventListener('paste', onPaste)
      } catch {
        doc = null
      }
    }
    node.addEventListener('load', attach)
    attach()
    return () => {
      node.removeEventListener('load', attach)
      try {
        doc?.removeEventListener('paste', onPaste)
      } catch {
        /* ignore */
      }
    }
  }, [href, onPasteFiles])

  function openOutside() {
    if (!href) return
    window.open(href, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div
        className="relative flex h-9 shrink-0 cursor-grab items-end bg-[#dee1e6] pr-2 active:cursor-grabbing"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest('button')) return
          onMoveWindow?.(event)
        }}
        onDoubleClick={() => onMax?.()}
      >
        <div className="absolute left-3 top-1/2 z-20 flex -translate-y-1/2 items-center gap-2.5">
          <button type="button" aria-label="Close" onClick={onClose} className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <button type="button" aria-label="Minimize" onClick={onMin} className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <button type="button" aria-label="Maximize" onClick={onMax} className="h-3 w-3 rounded-full bg-[#28c840]" />
          <span className="ml-1 grid h-5 w-5 place-items-center">
            <ChromeMark small />
          </span>
        </div>
        <div className="flex min-w-0 flex-1 items-end pl-[108px]">
          <div className="soum-chrome-tab is-on relative mb-0 flex h-[34px] min-w-[140px] max-w-[240px] items-center gap-1.5 rounded-t-[10px] bg-white px-3 text-[12px] text-[#202124]">
            <span className="grid h-4 w-4 shrink-0 place-items-center text-[10px]">🌐</span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
          </div>
        </div>
      </div>
      <div className="flex h-[40px] shrink-0 items-center gap-1 bg-white px-1.5">
        <button
          type="button"
          aria-label="Reload"
          className="grid h-8 w-8 place-items-center rounded-full text-[#5f6368] hover:bg-[#f1f3f4]"
          onClick={() => setBust((value) => value + 1)}
        >
          ↻
        </button>
        <div className="mx-1 flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full bg-[#f1f3f4] px-3">
          <span className="text-[11px] text-[#5f6368]">ⓘ</span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-[#202124]">{href.replace(/^https?:\/\//, '') || 'Preview'}</span>
        </div>
        <button
          type="button"
          disabled={!href}
          onClick={openOutside}
          className="mr-1 shrink-0 rounded-full bg-[#1a73e8] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
        >
          Open in Chrome
        </button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-white" aria-busy={showSkeleton}>
        {href ? (
          <iframe
            key={`${path}-${served}-${bust}`}
            ref={frame}
            title={label}
            src={href}
            className={`h-full w-full border-0 bg-white ${showSkeleton ? 'opacity-0' : 'opacity-100'}`}
          />
        ) : null}
        {showSkeleton || !href ? <PreviewPageSkeleton /> : null}
        {refreshing && href ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-[#1a73e8]/20">
            <div className="h-full w-1/3 animate-pulse bg-[#1a73e8]" />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function PreviewPageSkeleton() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-white" role="status" aria-live="polite">
      <span className="sr-only">Loading preview</span>
      <div className="flex h-12 items-center justify-between border-b border-black/[0.06] px-6">
        <Bone light className="h-5 w-24 rounded-md" />
        <div className="hidden items-center gap-4 sm:flex">
          <Bone light className="h-2.5 w-12 rounded-full" />
          <Bone light className="h-2.5 w-14 rounded-full" />
          <Bone light className="h-2.5 w-10 rounded-full" />
        </div>
        <Bone light className="h-8 w-20 rounded-full" />
      </div>
      <div className="px-8 py-10 sm:px-12">
        <Bone light className="h-8 w-[min(72%,420px)] rounded-md" />
        <Bone light className="mt-3 h-8 w-[min(52%,280px)] rounded-md" />
        <Bone light className="mt-5 h-3 w-[min(68%,360px)] rounded-full" />
        <Bone light className="mt-2 h-3 w-[min(48%,240px)] rounded-full" />
        <div className="mt-7 flex gap-3">
          <Bone light className="h-9 w-28 rounded-full" />
          <Bone light className="h-9 w-20 rounded-full" />
        </div>
        <Bone light className="mt-10 h-40 w-full rounded-xl sm:h-52" />
        <div className="mt-8 grid grid-cols-3 gap-4">
          <Bone light className="h-24 rounded-xl" />
          <Bone light className="h-24 rounded-xl" />
          <Bone light className="h-24 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

function deskClock() {
  const now = new Date()
  const day = now.toLocaleDateString('en-US', { weekday: 'short' })
  const mon = now.toLocaleDateString('en-US', { month: 'short' })
  const date = now.getDate().toString().padStart(2, '0')
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${day} ${mon} ${date} ${time}`
}

function FilesChrome({
  files,
  openPath,
  draft,
  onOpen,
  onDraft,
  onSave,
  onMkdir,
}: {
  files: Record<string, string>
  openPath: string
  draft: string
  onOpen: (path: string) => void
  onDraft: (value: string) => void
  onSave: () => void
  onMkdir?: (path: string) => void
}) {
  const [folder, setFolder] = useState('')
  const entries = useMemo(() => listFolder(files, folder), [files, folder])
  const dirty = openPath ? draft !== (files[openPath] || '') : false
  const folders = entries.filter((item) => item.dir).length
  const count = entries.filter((item) => !item.dir).length
  const bytes = Object.values(files).reduce((sum, text) => sum + text.length, 0)

  return (
    <div className="flex h-full min-h-0 bg-[#f6f6f6] text-[#222]">
      <aside className="w-[148px] shrink-0 border-r border-black/10 bg-[#ececec] p-2 text-[12px]">
        <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-black/40">Places</p>
        <button
          type="button"
          onClick={() => setFolder('')}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left ${folder === '' ? 'bg-white' : 'hover:bg-white/60'}`}
        >
          <span className="text-[#e8b84a]">⌂</span>
          workspace
        </button>
        <p className="mt-3 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-black/40">Devices</p>
        <p className="flex items-center gap-2 px-2 py-1 text-black/55">
          <span>⬤</span> File System
        </p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-black/10 bg-[#e8e8e8] px-3 py-1.5 text-[12px] text-black/60">
          <button type="button" disabled={!folder} onClick={() => setFolder(parentOf(folder))} className="disabled:opacity-30">
            ←
          </button>
          <span className="rounded-md bg-white px-2 py-0.5 font-mono text-[11px]">/workspace/{folder}</span>
          <button
            type="button"
            onClick={() => {
              const name = window.prompt('Folder name')
              const path = [folder, name?.trim()].filter(Boolean).join('/')
              if (!path) return
              onMkdir?.(path)
            }}
            className="ml-auto rounded bg-white px-2 py-0.5 text-[11px] font-medium text-black"
          >
            New folder
          </button>
        </div>
        <div className="thin-scroll min-h-0 flex-1 overflow-auto p-2">
          {entries.map((item) => (
            <button
              key={item.path}
              type="button"
              onDoubleClick={() => (item.dir ? setFolder(item.path) : onOpen(item.path))}
              onClick={() => !item.dir && onOpen(item.path)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] ${
                openPath === item.path ? 'bg-[#cfe3ff]' : 'hover:bg-black/5'
              }`}
            >
              <span className="w-5 text-center">{item.dir ? '📁' : fileGlyph(item.name)}</span>
              <span className="truncate">{item.name}</span>
            </button>
          ))}
          {entries.length === 0 && <p className="px-2 py-6 text-center text-[12px] text-black/35">This folder is empty.</p>}
        </div>
        {openPath && (
          <div className="flex min-h-[140px] flex-col border-t border-black/10 bg-[#0c0c0b]">
            <div className="flex items-center justify-between px-3 py-1">
              <p className="truncate font-mono text-[11px] text-white/55">{openPath}</p>
              <button
                type="button"
                disabled={!dirty}
                onClick={onSave}
                className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-black disabled:opacity-40"
              >
                Save
              </button>
            </div>
            <div className="thin-scroll min-h-[120px] flex-1 overflow-auto">
              <CodeEditor path={openPath} value={draft} onChange={onDraft} />
            </div>
          </div>
        )}
        <div className="border-t border-black/10 px-3 py-1 text-[11px] text-black/45">
          {folders} folders · {count} files · {Math.max(1, Math.round(bytes / 1024))} KiB
        </div>
      </div>
    </div>
  )
}

function TerminalChrome({
  commands,
  files,
  busy,
  onRunCommand,
}: {
  commands: Extract<AgentEvent, { kind: 'command' }>[]
  files: Record<string, string>
  busy?: boolean
  onRunCommand?: (command: string) => Promise<string>
}) {
  const [cwd, setCwd] = useState('')
  const [value, setValue] = useState('')
  const [lines, setLines] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const prompt = `guest@computer:${cwd ? `~/${cwd}` : '~'}$`

  useEffect(() => {
    setLines([
      'Welcome to Computer.',
      'Open Chrome from the dock to preview. Allowed sandbox: node, python, npm test, npx tsc, git status/log/diff.',
      ...commands.map((item) => `guest@computer:~$ ${item.command}`),
    ])
  }, [commands.length])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [lines, busy, running])

  async function run(raw: string) {
    const input = raw.trim()
    const next = [...lines, `${prompt} ${input}`]
    if (!input) {
      setLines(next)
      return
    }
    const [cmd, ...rest] = input.split(/\s+/)
    const arg = rest.join(' ')
    if (cmd === 'clear') {
      setLines([])
      return
    }
    if (cmd === 'help') next.push('ls  cd  pwd  cat  echo  whoami  date  clear  help  · sandbox: node  python  npm test  npx tsc  git status')
    else if (cmd === 'whoami') next.push('guest')
    else if (cmd === 'date') next.push(new Date().toString())
    else if (cmd === 'echo') next.push(arg)
    else if (cmd === 'pwd') next.push(cwd ? `/home/guest/${cwd}` : '/home/guest')
    else if (cmd === 'ls' || cmd === 'dir') {
      const folder = arg && arg !== '.' ? (cwd ? `${cwd}/${arg}` : arg) : cwd
      const names = listFolder(files, folder).map((item) => (item.dir ? `${item.name}/` : item.name))
      next.push(names.join('  ') || '')
    } else if (cmd === 'cd') {
      if (!arg || arg === '~' || arg === '/') setCwd('')
      else if (arg === '..') setCwd(parentOf(cwd))
      else {
        const target = arg.startsWith('/') ? arg.replace(/^\/home\/guest\/?/, '') : cwd ? `${cwd}/${arg}` : arg
        const clean = target.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '')
        const exists = !clean || Object.keys(files).some((path) => path === clean || path.startsWith(`${clean}/`))
        if (exists) setCwd(clean)
        else next.push(`cd: ${arg}: No such file or directory`)
      }
    } else if (cmd === 'cat' || cmd === 'type') {
      const path = arg.startsWith('/') ? arg.replace(/^\/home\/guest\/?/, '') : cwd ? `${cwd}/${arg}` : arg
      next.push(files[path] || `cat: ${arg || 'filename'}: No such file or directory`)
    } else if (onRunCommand) {
      setRunning(true)
      setLines([...next, 'running…'])
      try {
        const text = await onRunCommand(input)
        setLines([...next, text || '(no output)'])
      } catch (error) {
        setLines([...next, error instanceof Error ? error.message : 'Command failed'])
      } finally {
        setRunning(false)
      }
      return
    } else next.push(`${cmd}: command not found`)
    setLines(next)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#1d1d1d] text-[#f5f5f5]">
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#2a2a2a] px-3 py-1 text-[11px] text-white/55">
        <span>Terminal</span>
        <span className="truncate text-white/35">guest — {cwd ? `~/${cwd}` : '~'}</span>
      </div>
      <div className="thin-scroll min-h-0 flex-1 overflow-auto p-3 font-mono text-[12px] leading-5">
        {lines.map((line, index) => (
          <p key={index} className="whitespace-pre-wrap break-all">
            {line}
          </p>
        ))}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (running) return
            const typed = value
            setValue('')
            void run(typed)
          }}
          className="flex items-center gap-1"
        >
          <span className="shrink-0 text-[#7ee787]">{prompt}</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={running}
            className="min-w-0 flex-1 bg-transparent outline-none disabled:opacity-40"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {(busy || running) && !value && <span className="inline-block h-3.5 w-2 animate-pulse bg-[#7ee787]" />}
        </form>
        <div ref={end} />
      </div>
    </div>
  )
}

function listFolder(files: Record<string, string>, folder: string) {
  const prefix = folder ? `${folder}/` : ''
  const dirs = new Set<string>()
  const rows: { name: string; path: string; dir: boolean }[] = []
  for (const path of Object.keys(files).sort()) {
    if (prefix && !path.startsWith(prefix)) continue
    const rest = prefix ? path.slice(prefix.length) : path
    if (!rest) continue
    const cut = rest.indexOf('/')
    if (cut >= 0) {
      const name = rest.slice(0, cut)
      if (dirs.has(name)) continue
      dirs.add(name)
      rows.push({ name, path: prefix + name, dir: true })
    } else {
      rows.push({ name: rest, path, dir: false })
    }
  }
  return rows.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
}

function parentOf(folder: string) {
  const parts = folder.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

function fileGlyph(name: string) {
  if (/\.(html?|tsx?|jsx?)$/i.test(name)) return '🌐'
  if (/\.css$/i.test(name)) return '🎨'
  if (/\.md$/i.test(name)) return '📄'
  if (/\.json$/i.test(name)) return '{}'
  return '📝'
}

function DockIcon({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="flex w-11 flex-col items-center rounded-xl py-0.5 hover:bg-white/10">
      {children}
      <span className={`mt-0.5 h-1 w-1 rounded-full ${active ? 'bg-white' : 'bg-transparent'}`} />
    </button>
  )
}

function ChromeMark({ small }: { small?: boolean }) {
  const s = small ? 16 : 32
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" aria-hidden>
      <circle cx="24" cy="24" r="24" fill="#fff" />
      <path fill="#EA4335" d="M24 24V2a22 22 0 0 1 19.053 33Z" />
      <path fill="#FBBC05" d="M24 24 43.053 35A22 22 0 0 1 4.947 35Z" />
      <path fill="#34A853" d="M24 24 4.947 35A22 22 0 0 1 24 2Z" />
      <circle cx="24" cy="24" r="9" fill="#fff" />
      <circle cx="24" cy="24" r="7" fill="#4285F4" />
    </svg>
  )
}
