import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ChatFile } from '../../../shared/chatMedia'
import {
  CODING_MODELS,
  DESKTOP_MODEL_PROVIDERS,
  hubTierTagClass,
  partitionHubPickerModels,
  type CodingModel,
} from '../../../shared/models'
import { resolveModelPricing } from '../../../shared/modelPricing'
import { ModelBriefSheet } from './ModelBriefSheet'
import { SoumtokGlobeAvatar } from '../SoumtokGlobeAvatar'
import {
  buildPreviewHtml,
  buildTestHubApiMessages,
  extractBuildArtifacts,
  fileGlyph,
  formatProseHtml,
  highlightCode,
  parseSegments,
} from '../../../shared/testHub'
import { fetchDocuments, fetchModels, streamStudio } from '../../lib/api'
import { filesFromDrop, readChatFiles } from '../../lib/chatFiles'

type HubModel = {
  id: string
  name: string
  cost: string
  ready: boolean
  tags?: string[]
  provider?: string
  strength?: string
}

function hubModelPriceLine(m: HubModel) {
  if (m.id === 'auto') return 'Included pool first · $2.00 / 1M on-demand'
  const catalog = CODING_MODELS.find((row) => row.id === m.id)
  const pricing = resolveModelPricing({
    id: m.id,
    name: m.name,
    provider: (m.provider || catalog?.provider || 'openai') as CodingModel['provider'],
    strength: m.strength || catalog?.strength || '',
    cost: m.cost || catalog?.cost || '',
    keys: catalog?.keys || '',
    tags: m.tags,
  })
  return pricing.headline
}

function isGoogleHubModel(m: { id?: string; provider?: string }) {
  return m.provider === 'google' || /^gemini|gemma/i.test(String(m.id || ''))
}

function isHubModelDisabled(m: HubModel) {
  return isGoogleHubModel(m)
}

function mergeHubModels(apiModels: HubModel[]) {
  const byId = new Map<string, HubModel>()
  for (const m of CODING_MODELS) {
    if (!DESKTOP_MODEL_PROVIDERS.includes(m.provider)) continue
    if (m.id === 'soumtok-agent') continue
    byId.set(m.id, {
      id: m.id,
      name: m.name,
      cost: m.cost,
      ready: true,
      tags: m.tags,
      provider: m.provider,
      strength: m.strength,
    })
  }
  for (const m of apiModels) {
    const base = byId.get(m.id)
    const merged: HubModel = {
      id: m.id,
      name: base?.name || m.name || m.id,
      cost: m.cost || base?.cost || '',
      tags: base?.tags ?? m.tags,
      provider: base?.provider ?? m.provider,
      strength: base?.strength,
      ready: !isGoogleHubModel({ id: m.id, provider: base?.provider ?? m.provider }),
    }
    byId.set(m.id, merged)
  }
  return [...byId.values()]
}

type HubMsg = {
  id: string
  role: 'user' | 'assistant'
  content: string
  files?: ChatFile[]
}

type HubWorkspace = {
  id: string
  title: string
  model: string
  messages: HubMsg[]
  activeFile: string
  outputTab: 'preview' | 'code'
  fileEdits?: Record<string, string>
}

function uid() {
  return crypto.randomUUID?.() || String(Date.now() + Math.random())
}

function workspaceTitle(messages: HubMsg[], fallback = 'New project') {
  const first = messages.find((m) => m.role === 'user' && m.content?.trim())
  if (!first) return fallback
  return (
    first.content
      .trim()
      .slice(0, 36)
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, ' ') || fallback
  )
}

const SESSION_KEY = 'soumtok-test-hub-session'
const ARCHIVES_KEY = 'soumtok-test-hub-archives'

function mergeArtifacts(messages: HubMsg[], live: string) {
  const files: Record<string, string> = {}
  for (const msg of messages) {
    if (msg.role === 'assistant') Object.assign(files, extractBuildArtifacts(msg.content))
  }
  if (live) Object.assign(files, extractBuildArtifacts(live))
  return files
}

function sortFilePaths(paths: string[]) {
  const rank = (p: string) => {
    if (p === 'index.html') return 0
    if (/\.html?$/i.test(p)) return 1
    if (/\.css$/i.test(p)) return 2
    if (/\.(js|jsx|ts|tsx)$/i.test(p)) return 3
    return 4
  }
  return [...paths].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function safeHubRelPath(rel: string) {
  return rel.replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[\\/]+/, '')
}

async function saveProjectToFolder(files: Record<string, string>) {
  const entries = Object.entries(files).filter(([rel]) => safeHubRelPath(rel))
  if (!entries.length) return { ok: false as const, error: 'No files to save' }
  if (typeof window.showDirectoryPicker !== 'function') {
    return { ok: false as const, error: 'Folder save needs Chrome or Edge — use Download files instead' }
  }
  try {
    const root = await window.showDirectoryPicker({ mode: 'readwrite' })
    for (const [rel, content] of entries) {
      const safe = safeHubRelPath(rel)
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

export function TestHubPanel() {
  const initialId = useMemo(() => uid(), [])
  const [models, setModels] = useState<HubModel[]>([])
  const [model, setModel] = useState('auto')
  const [modelOpen, setModelOpen] = useState(false)
  const [messages, setMessages] = useState<HubMsg[]>([])
  const [prompt, setPrompt] = useState('')
  const [pending, setPending] = useState<ChatFile[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [live, setLive] = useState('')
  const [outputTab, setOutputTab] = useState<'preview' | 'code'>('preview')
  const [activeFile, setActiveFile] = useState('')
  const [archivesOpen, setArchivesOpen] = useState(false)
  const [archives, setArchives] = useState<{ id: string; title: string; updatedAt: string; fileCount: number }[]>([])
  const [status, setStatus] = useState('')
  const [briefModel, setBriefModel] = useState<CodingModel | null>(null)
  const [docs, setDocs] = useState<{ id: string; title: string }[]>([])
  const [docsOpen, setDocsOpen] = useState(false)
  const [fileDrag, setFileDrag] = useState(false)
  const [workspaces, setWorkspaces] = useState<HubWorkspace[]>([
    { id: initialId, title: 'Project 1', model: 'auto', messages: [], activeFile: '', outputTab: 'preview', fileEdits: {} },
  ])
  const [activeId, setActiveId] = useState(initialId)
  const [fileEdits, setFileEdits] = useState<Record<string, string>>({})
  const abortRef = useRef<AbortController | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const bootRef = useRef(false)
  const baseArtifactsRef = useRef<Record<string, string>>({})

  const baseArtifacts = useMemo(() => mergeArtifacts(messages, live), [messages, live])
  const artifacts = useMemo(() => ({ ...baseArtifacts, ...fileEdits }), [baseArtifacts, fileEdits])
  const previewHtml = useMemo(() => buildPreviewHtml(artifacts), [artifacts])
  const artifactPaths = useMemo(() => sortFilePaths(Object.keys(artifacts)), [artifacts])

  useEffect(() => {
    const prev = baseArtifactsRef.current
    baseArtifactsRef.current = baseArtifacts
    setFileEdits((edits) => {
      let changed = false
      const next = { ...edits }
      for (const path of Object.keys(next)) {
        if (baseArtifacts[path] !== undefined && baseArtifacts[path] !== prev[path]) {
          delete next[path]
          changed = true
        }
      }
      return changed ? next : edits
    })
  }, [baseArtifacts])

  useEffect(() => {
    if (previewHtml) setOutputTab('preview')
  }, [previewHtml])

  useEffect(() => {
    if (!artifactPaths.length) return
    if (!activeFile || !artifacts[activeFile]) setActiveFile(artifactPaths[0])
  }, [artifactPaths, artifacts, activeFile])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (!raw) {
        bootRef.current = true
        return
      }
      const saved = JSON.parse(raw) as {
        activeId?: string
        workspaces?: HubWorkspace[]
        messages?: HubMsg[]
        model?: string
        outputTab?: 'preview' | 'code'
        activeFile?: string
        title?: string
      }
      if (Array.isArray(saved.workspaces) && saved.workspaces.length) {
        setWorkspaces(saved.workspaces)
        const active = saved.workspaces.find((w) => w.id === saved.activeId) || saved.workspaces[0]
        setActiveId(active.id)
        setMessages(active.messages || [])
        setModel(active.model || 'auto')
        setOutputTab(active.outputTab === 'code' ? 'code' : 'preview')
        setActiveFile(active.activeFile || '')
        setFileEdits(active.fileEdits && typeof active.fileEdits === 'object' ? active.fileEdits : {})
      } else {
        if (saved.messages?.length) setMessages(saved.messages)
        if (saved.model) setModel(saved.model)
        if (saved.outputTab) setOutputTab(saved.outputTab)
        if (saved.activeFile) setActiveFile(saved.activeFile)
        const id = uid()
        setWorkspaces([
          {
            id,
            title: saved.title || workspaceTitle(saved.messages || [], 'Project 1'),
            model: saved.model || 'auto',
            messages: saved.messages || [],
            activeFile: saved.activeFile || '',
            outputTab: saved.outputTab === 'code' ? 'code' : 'preview',
            fileEdits: {},
          },
        ])
        setActiveId(id)
      }
    } catch {
      /* ignore */
    }
    try {
      const raw = localStorage.getItem(ARCHIVES_KEY)
      if (raw) setArchives(JSON.parse(raw))
    } catch {
      /* ignore */
    }
    bootRef.current = true
  }, [])

  useEffect(() => {
    if (!bootRef.current) return
    const timer = window.setTimeout(() => {
      try {
        const next = workspaces.map((w) =>
          w.id === activeId
            ? {
                ...w,
                title: workspaceTitle(messages, w.title || 'New project'),
                model,
                messages,
                activeFile,
                outputTab,
                fileEdits,
              }
            : w,
        )
        localStorage.setItem(
          SESSION_KEY,
          JSON.stringify({
            version: 2,
            activeId,
            workspaces: next,
            messages,
            model,
            outputTab,
            activeFile,
            title: workspaceTitle(messages, 'New project'),
            updatedAt: Date.now(),
          }),
        )
      } catch {
        /* ignore */
      }
    }, 400)
    return () => window.clearTimeout(timer)
  }, [messages, model, outputTab, activeFile, activeId, workspaces, fileEdits])

  useEffect(() => {
    void fetchModels()
      .then((rows) => setModels(mergeHubModels(rows.models)))
      .catch(() => setError('Could not load models'))
    void fetchDocuments()
      .then((rows) => setDocs(rows.map((d) => ({ id: d.id, title: d.title || 'Untitled' }))))
      .catch(() => {})
  }, [])

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, live])

  const selected = models.find((m) => m.id === model)

  const attachFiles = useCallback(async (list: File[]) => {
    setError('')
    try {
      const { files, error } = await readChatFiles(list)
      if (error) setError(error)
      if (files.length) setPending((p) => [...p, ...files].slice(0, 6))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach files')
    }
  }, [])

  async function onSend() {
    const text = prompt.trim()
    if (busy || (!text && !pending.length)) return
    setError('')
    const userMsg: HubMsg = { id: uid(), role: 'user', content: text, files: pending.length ? pending : undefined }
    const next = [...messages, userMsg]
    setMessages(next)
    setPrompt('')
    setPending([])
    setBusy(true)
    setLive('')
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    try {
      const apiMessages = buildTestHubApiMessages(next, { files: artifacts })
      let assistant = ''
      await streamStudio(
        model,
        apiMessages,
        (chunk) => {
          assistant = chunk
          setLive(chunk)
        },
        abortRef.current.signal,
        { agent: false },
      )
      setMessages((cur) => [...cur, { id: uid(), role: 'assistant', content: assistant || live }])
      setLive('')
    } catch (err) {
      if (abortRef.current?.signal.aborted) return
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0e0e0d]">
      <header className="flex shrink-0 flex-wrap items-center gap-0 border-b border-white/[0.08] bg-[linear-gradient(180deg,#252526_0%,#1f1f1f_100%)]">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 px-4 py-3 md:px-5">
          <SoumtokGlobeAvatar color="#2f6fed" size={30} state={busy ? 'working' : 'idle'} />
          <div className="min-w-0">
            <h1 className="text-[14px] font-semibold tracking-[-0.01em] text-[#f3f3f3]">Test Hub</h1>
            <p className="truncate text-[11px] text-white/40">
              Direct model chat — preview updates live as the model builds.
            </p>
          </div>
        </div>
        <div className="mx-0 hidden h-8 w-px self-center bg-white/10 sm:block" aria-hidden="true" />
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-white/65 hover:bg-white/[0.08] hover:text-white"
            onClick={() => {
              const dirty = messages.length || Object.keys(artifacts).length || pending.length || live
              if (dirty && !window.confirm('Clear this workspace? Chat and files here will be removed. Other projects stay.')) return
              abortRef.current?.abort()
              setMessages([])
              setPending([])
              setLive('')
              setError('')
              setStatus('Workspace cleared')
              setActiveFile('')
              setOutputTab('preview')
              setArchivesOpen(false)
              setFileEdits({})
              setWorkspaces((list) =>
                list.map((w) =>
                  w.id === activeId
                    ? { ...w, title: 'New project', messages: [], activeFile: '', outputTab: 'preview', fileEdits: {} }
                    : w,
                ),
              )
            }}
          >
            Clear project
          </button>
          <button
            type="button"
            className="rounded-lg border border-[#007acc]/45 bg-[#007acc]/18 px-2.5 py-1.5 text-[11px] font-medium text-[#eaf4ff] hover:bg-[#007acc]/28"
            onClick={() => {
              if (busy) return
              abortRef.current?.abort()
              const snapshot: HubWorkspace = {
                id: activeId,
                title: workspaceTitle(messages, 'Project'),
                model,
                messages,
                activeFile,
                outputTab,
                fileEdits,
              }
              const nextId = uid()
              const fresh: HubWorkspace = {
                id: nextId,
                title: `Project ${workspaces.length + 1}`,
                model,
                messages: [],
                activeFile: '',
                outputTab: 'preview',
                fileEdits: {},
              }
              setWorkspaces((list) => [...list.map((w) => (w.id === activeId ? snapshot : w)), fresh])
              setActiveId(nextId)
              setMessages([])
              setPending([])
              setFileEdits({})
              setLive('')
              setError('')
              setStatus('New workspace')
              setActiveFile('')
              setOutputTab('preview')
              setArchivesOpen(false)
            }}
          >
            New project
          </button>
        </div>
        <div className="mx-0 hidden h-8 w-px self-center bg-white/10 lg:block" aria-hidden="true" />
        <div className="hidden items-center gap-2 px-3 py-2 lg:flex">
          <div className="inline-flex rounded-[10px] border border-white/[0.08] bg-black/30 p-1">
            <OutTab active={outputTab === 'preview'} onClick={() => setOutputTab('preview')}>
              Preview
            </OutTab>
            <OutTab active={outputTab === 'code'} onClick={() => setOutputTab('code')}>
              Code
            </OutTab>
          </div>
          <div className="h-8 w-px bg-white/10" aria-hidden="true" />
          <ModelPicker
            model={model}
            selected={selected}
            models={models}
            open={modelOpen}
            onToggle={() => setModelOpen((o) => !o)}
            onClose={() => setModelOpen(false)}
            onBrief={(m) => {
              setModelOpen(false)
              setBriefModel(CODING_MODELS.find((c) => c.id === m.id) ?? null)
            }}
            onPick={(id) => {
              setModel(id)
              setModelOpen(false)
            }}
          />
        </div>
        <div className="ml-auto flex items-center gap-2 px-3 py-2 lg:hidden">
          <div className="relative">
            <ModelPicker
              model={model}
              selected={selected}
              models={models}
              open={modelOpen}
              onToggle={() => setModelOpen((o) => !o)}
              onClose={() => setModelOpen(false)}
              onBrief={(m) => {
                setModelOpen(false)
                setBriefModel(CODING_MODELS.find((c) => c.id === m.id) ?? null)
              }}
              onPick={(id) => {
                setModel(id)
                setModelOpen(false)
              }}
            />
          </div>
        </div>
      </header>
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-white/[0.08] bg-[#1a1a1a] px-3 py-1.5">
        {workspaces.map((w) => {
          const title = w.id === activeId ? workspaceTitle(messages, w.title || 'Project') : w.title || 'Project'
          const on = w.id === activeId
          return (
            <div
              key={w.id}
              className={`inline-flex max-w-[180px] shrink-0 items-center rounded-[7px] border ${
                on ? 'border-[#007acc]/40 bg-[#007acc]/16' : 'border-transparent hover:bg-white/[0.05]'
              }`}
            >
              <button
                type="button"
                className={`max-w-[140px] truncate px-2.5 py-1.5 text-[11px] font-medium ${on ? 'text-[#f0f7ff]' : 'text-white/60'}`}
                onClick={() => {
                  if (busy || w.id === activeId) return
                  setWorkspaces((list) =>
                    list.map((item) =>
                      item.id === activeId
                        ? {
                            ...item,
                            title: workspaceTitle(messages, item.title || 'Project'),
                            model,
                            messages,
                            activeFile,
                            outputTab,
                            fileEdits,
                          }
                        : item,
                    ),
                  )
                  setActiveId(w.id)
                  setMessages(w.messages || [])
                  setModel(w.model || 'auto')
                  setActiveFile(w.activeFile || '')
                  setOutputTab(w.outputTab === 'code' ? 'code' : 'preview')
                  setFileEdits(w.fileEdits && typeof w.fileEdits === 'object' ? w.fileEdits : {})
                  setPending([])
                  setLive('')
                  setError('')
                  setArchivesOpen(false)
                }}
              >
                {title}
              </button>
              <button
                type="button"
                className="px-2 py-1 text-[13px] text-white/35 hover:text-white"
                title="Close workspace"
                onClick={() => {
                  if (busy) return
                  if (workspaces.length <= 1) {
                    setMessages([])
                    setPending([])
                    setLive('')
                    setActiveFile('')
                    setOutputTab('preview')
                    setFileEdits({})
                    setWorkspaces((list) =>
                      list.map((item) =>
                        item.id === activeId
                          ? { ...item, title: 'New project', messages: [], activeFile: '', outputTab: 'preview', fileEdits: {} }
                          : item,
                      ),
                    )
                    return
                  }
                  const idx = workspaces.findIndex((item) => item.id === w.id)
                  const nextList = workspaces.filter((item) => item.id !== w.id)
                  setWorkspaces(nextList)
                  if (w.id === activeId) {
                    const next = nextList[Math.max(0, idx - 1)] || nextList[0]
                    setActiveId(next.id)
                    setMessages(next.messages || [])
                    setModel(next.model || 'auto')
                    setActiveFile(next.activeFile || '')
                    setOutputTab(next.outputTab === 'code' ? 'code' : 'preview')
                    setFileEdits(next.fileEdits && typeof next.fileEdits === 'object' ? next.fileEdits : {})
                    setPending([])
                    setLive('')
                  }
                }}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
      {briefModel && <ModelBriefSheet model={briefModel} onClose={() => setBriefModel(null)} />}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,42%)]">
        <section className="flex min-h-0 min-w-0 flex-col border-white/[0.06] lg:border-r">
          <div ref={feedRef} className="thin-scroll min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
            <div className="mx-auto max-w-[720px] space-y-4">
              {messages.length === 0 && !live && !busy && (
                <div className="rounded-xl border border-white/[0.08] bg-[#141413] px-4 py-8 text-center">
                  <p className="text-[14px] text-white/75">Ask the model to build or explain anything.</p>
                  <p className="mt-2 text-[12px] text-white/40">
                    Attach files, folders, or docs — preview and code appear on the right.
                  </p>
                </div>
              )}
              {messages.map((msg) => (
                <Bubble key={msg.id} role={msg.role} files={msg.files} content={msg.content} />
              ))}
              {live && <Bubble role="assistant" content={live} />}
              {busy && !live && <p className="text-[12px] text-white/40">Thinking…</p>}
            </div>
          </div>

          <div className="shrink-0 border-t border-white/[0.06] px-4 py-3 md:px-6">
            <div className="mx-auto max-w-[720px]">
              {error && <p className="mb-2 text-[12px] text-[#f48771]">{error}</p>}
              {pending.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {pending.map((f) => (
                    <span key={f.name + f.mime} className="rounded-md bg-white/[0.06] px-2 py-1 text-[11px] text-white/70">
                      {f.name}
                    </span>
                  ))}
                </div>
              )}
              <div
                className={`rounded-xl border bg-[#141413] ${fileDrag ? 'border-[#007acc]' : 'border-white/12'}`}
                onDragEnter={(e) => {
                  if (filesFromDrop(e.dataTransfer).length) {
                    e.preventDefault()
                    setFileDrag(true)
                  }
                }}
                onDragLeave={() => setFileDrag(false)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  setFileDrag(false)
                  void attachFiles(filesFromDrop(e.dataTransfer))
                }}
              >
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Message the model directly…"
                  rows={2}
                  className="w-full resize-none bg-transparent px-3 py-3 text-[14px] text-white outline-none placeholder:text-white/30"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void onSend()
                    }
                  }}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-2 py-2">
                  <div className="flex flex-wrap gap-1">
                    <ToolBtn onClick={() => fileRef.current?.click()}>Files</ToolBtn>
                    <ToolBtn onClick={() => folderRef.current?.click()}>Folder</ToolBtn>
                    {docs.length > 0 && <ToolBtn onClick={() => setDocsOpen((o) => !o)}>Docs</ToolBtn>}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onSend()}
                    className="rounded-lg bg-[#007acc] px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
                  >
                    {busy ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
              {docsOpen && docs.length > 0 && (
                <div className="mt-2 max-h-[160px] overflow-y-auto rounded-lg border border-white/10 bg-[#141413] p-2">
                  {docs.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className="block w-full rounded px-2 py-1.5 text-left text-[12px] text-white/70 hover:bg-white/[0.05]"
                      onClick={() => {
                        void fetch(`/api/documents/${d.id}`, { credentials: 'include' })
                          .then((r) => r.json())
                          .then((row) => {
                            const content = String(row?.document?.content || row?.content || '')
                            setPending((p) => [
                              ...p,
                              { name: `${d.title}.md`, mime: 'text/markdown', text: content.slice(0, 120_000) },
                            ])
                            setDocsOpen(false)
                          })
                          .catch(() => setError('Could not load document'))
                      }}
                    >
                      {d.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="hidden min-h-0 flex-col overflow-hidden bg-[#0c0c0b] lg:flex">
          <div className="flex gap-1 border-b border-white/[0.06] px-3 py-2 lg:hidden">
            <OutTab active={outputTab === 'preview'} onClick={() => setOutputTab('preview')}>
              Preview
            </OutTab>
            <OutTab active={outputTab === 'code'} onClick={() => setOutputTab('code')}>
              Code
            </OutTab>
          </div>
          {outputTab === 'preview' ? (
            <div className="relative min-h-0 flex-1 bg-white">
              {!previewHtml ? (
                <p className="absolute inset-0 flex items-center justify-center bg-[#0c0c0b] px-6 text-center text-[13px] text-white/35">
                  Build something — live preview appears here as the model replies.
                </p>
              ) : (
                <iframe
                  title="Test Hub preview"
                  sandbox="allow-scripts allow-same-origin"
                  srcDoc={previewHtml}
                  className="absolute inset-0 h-full w-full border-0 bg-white"
                />
              )}
            </div>
          ) : (
            <CodeWorkspace
              paths={artifactPaths}
              files={artifacts}
              activeFile={activeFile}
              onSelectFile={setActiveFile}
              onChangeFile={(path, value) => {
                setFileEdits((prev) => ({ ...prev, [path]: value }))
              }}
              status={status}
              archivesOpen={archivesOpen}
              archives={archives}
              onToggleArchives={() => setArchivesOpen((o) => !o)}
              onCloseArchives={() => setArchivesOpen(false)}
              onSaveArchive={() => {
                const title =
                  messages.find((m) => m.role === 'user')?.content.trim().slice(0, 48) || 'Build'
                const entry = {
                  id: String(Date.now()),
                  title,
                  updatedAt: new Date().toISOString(),
                  fileCount: artifactPaths.length,
                  payload: { messages, model, files: artifacts, activeFile },
                }
                const next = [entry, ...archives].slice(0, 20)
                setArchives(next)
                localStorage.setItem(ARCHIVES_KEY, JSON.stringify(next))
                setArchivesOpen(true)
                setStatus(`Saved · ${title}`)
              }}
              onLoadArchive={(entry) => {
                const payload = (entry as { payload?: { messages: HubMsg[]; model: string; files: Record<string, string>; activeFile: string } }).payload
                if (!payload) return
                const msgs = payload.messages || []
                setMessages(msgs)
                setModel(payload.model || 'auto')
                setActiveFile(payload.activeFile || '')
                const fromMsg = mergeArtifacts(msgs, '')
                const edits: Record<string, string> = {}
                for (const [path, content] of Object.entries(payload.files || {})) {
                  if (fromMsg[path] !== content) edits[path] = content
                }
                setFileEdits(edits)
                setArchivesOpen(false)
                setStatus('Build restored')
              }}
              onDownload={() => {
                downloadBlob(
                  'test-hub-project.json',
                  new Blob([JSON.stringify({ version: 1, files: artifacts, messages, model }, null, 2)], {
                    type: 'application/json',
                  }),
                )
                setStatus('Downloaded project.json')
              }}
              onSaveToFolder={async () => {
                const res = await saveProjectToFolder(artifacts)
                if (res.ok) setStatus(`Saved ${res.count} file${res.count === 1 ? '' : 's'} to folder`)
                else if (res.error) setStatus(res.error)
              }}
              onDownloadFiles={() => {
                for (const path of artifactPaths) {
                  downloadBlob(path.replace(/\//g, '-'), new Blob([artifacts[path]], { type: 'text/plain' }))
                }
                setStatus(`Downloaded ${artifactPaths.length} files`)
              }}
            />
          )}
        </aside>
      </div>

      <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void attachFiles([...(e.target.files || [])])} />
      <input
        ref={folderRef}
        type="file"
        multiple
        className="hidden"
        {...({ webkitdirectory: '', directory: '' } as object)}
        onChange={(e) => void attachFiles([...(e.target.files || [])])}
      />
    </div>
  )
}

function CodeWorkspace({
  paths,
  files,
  activeFile,
  onSelectFile,
  onChangeFile,
  status,
  archivesOpen,
  archives,
  onToggleArchives,
  onCloseArchives,
  onSaveArchive,
  onLoadArchive,
  onDownload,
  onSaveToFolder,
  onDownloadFiles,
}: {
  paths: string[]
  files: Record<string, string>
  activeFile: string
  onSelectFile: (path: string) => void
  onChangeFile: (path: string, value: string) => void
  status: string
  archivesOpen: boolean
  archives: { id: string; title: string; updatedAt: string; fileCount: number; payload?: unknown }[]
  onToggleArchives: () => void
  onCloseArchives: () => void
  onSaveArchive: () => void
  onLoadArchive: (entry: { id: string; title: string; updatedAt: string; fileCount: number; payload?: unknown }) => void
  onDownload: () => void
  onSaveToFolder: () => void
  onDownloadFiles: () => void
}) {
  if (!paths.length) {
    return (
      <p className="flex flex-1 items-center justify-center px-6 text-center text-[13px] text-white/35">
        Ask the model to build something — files will appear here.
      </p>
    )
  }

  const body = activeFile ? files[activeFile] : ''

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#333] bg-[#252526] px-3 py-2">
        <div className="min-w-0">
          <span className="text-[12px] font-medium text-white/90">Project files</span>
          <span className="ml-2 text-[11px] text-white/40">
            {status || `${paths.length} file${paths.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <CodeAction onClick={onToggleArchives}>Builds</CodeAction>
          <CodeAction onClick={onSaveArchive}>Save</CodeAction>
          <CodeAction onClick={onSaveToFolder}>Save to folder</CodeAction>
          <CodeAction onClick={onDownloadFiles}>Download files</CodeAction>
          <CodeAction primary onClick={onDownload}>
            Download
          </CodeAction>
        </div>
      </div>
      {archivesOpen && (
        <div className="shrink-0 border-b border-[#333] bg-[#1a1a18]">
          <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-white/45">
            <span>Saved builds</span>
            <button type="button" className="text-white/50 hover:text-white/80" onClick={onCloseArchives}>
              ×
            </button>
          </div>
          <div className="max-h-[140px] overflow-y-auto px-1 pb-1">
            {!archives.length ? (
              <p className="px-2 py-2 text-[11px] text-white/35">No saved builds yet.</p>
            ) : (
              archives.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="block w-full rounded-md px-2 py-2 text-left hover:bg-white/[0.05]"
                  onClick={() => onLoadArchive(entry)}
                >
                  <span className="block text-[12px] text-white/85">{entry.title}</span>
                  <span className="text-[10px] text-white/35">
                    {entry.fileCount} files · {new Date(entry.updatedAt).toLocaleString()}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(120px,34%)_minmax(0,1fr)]">
        <nav className="thin-scroll overflow-y-auto border-r border-[#333] bg-[#252526] p-2">
          {paths.map((path) => {
            const glyph = fileGlyph(path)
            return (
              <button
                key={path}
                type="button"
                onClick={() => onSelectFile(path)}
                className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[12px] ${
                  path === activeFile ? 'bg-[#37373d] text-white' : 'text-[#ccc] hover:bg-[#2a2d2e]'
                }`}
              >
                <span
                  className="inline-grid h-3 min-w-4 shrink-0 place-items-center rounded-[2px] px-0.5 text-[7px] font-bold leading-none"
                  style={{ color: glyph.tone, background: `${glyph.tone}33` }}
                >
                  {glyph.label}
                </span>
                <span className="truncate">{path}</span>
              </button>
            )
          })}
        </nav>
        <div className="flex min-h-0 min-w-0 flex-col bg-[#1e1e1e]">
          <div className="flex shrink-0 items-center justify-between border-b border-[#333] bg-[#252526] px-3 py-2 text-[12px] text-[#ccc]">
            <span className="truncate">{activeFile || 'Select a file'}</span>
            <button
              type="button"
              className="rounded border border-[#444] px-2 py-0.5 text-[10px] text-[#ccc] hover:bg-[#333]"
              onClick={() => void navigator.clipboard.writeText(body)}
            >
              Copy
            </button>
          </div>
          <HubFileEditor path={activeFile || 'txt'} value={body} onChange={(next) => activeFile && onChangeFile(activeFile, next)} />
        </div>
      </div>
    </div>
  )
}

function HubFileEditor({
  path,
  value,
  onChange,
}: {
  path: string
  value: string
  onChange: (next: string) => void
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const hlRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const code = hlRef.current?.querySelector('code')
    if (code) code.innerHTML = highlightCode(value, path)
  }, [value, path])

  const syncScroll = () => {
    if (!taRef.current || !hlRef.current) return
    hlRef.current.scrollTop = taRef.current.scrollTop
    hlRef.current.scrollLeft = taRef.current.scrollLeft
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[#1e1e1e]">
      <pre
        ref={hlRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 m-0 overflow-auto p-4 font-mono text-[12px] leading-[1.55] text-[#d4d4d4] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_.hl-cmt]:italic [&_.hl-cmt]:text-[#6a9955] [&_.hl-kw]:text-[#569cd6] [&_.hl-num]:text-[#b5cea8] [&_.hl-sel]:text-[#d7ba7d] [&_.hl-str]:text-[#ce9178] [&_code]:block [&_code]:whitespace-pre"
      >
        <code dangerouslySetInnerHTML={{ __html: highlightCode(value, path) }} />
      </pre>
      <textarea
        ref={taRef}
        className="thin-scroll relative z-[1] h-full w-full resize-none border-0 bg-transparent p-4 font-mono text-[12px] leading-[1.55] text-transparent caret-[#d4d4d4] outline-none selection:bg-[#007acc]/35 selection:text-transparent"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        aria-label="File contents"
      />
    </div>
  )
}

function CodeAction({
  children,
  onClick,
  primary,
}: {
  children: ReactNode
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-[11px] ${
        primary
          ? 'bg-[#007acc]/25 text-white border border-[#007acc]/40'
          : 'border border-white/10 text-white/70 hover:bg-white/[0.05]'
      }`}
    >
      {children}
    </button>
  )
}

function OutTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-selected={active}
      className={`min-w-[72px] rounded-[7px] px-3.5 py-1.5 text-[12px] font-medium ${
        active
          ? 'bg-[#007acc]/28 text-white shadow-[inset_0_0_0_1px_rgba(0,122,204,0.35)]'
          : 'text-white/50 hover:bg-white/[0.04] hover:text-white/85'
      }`}
    >
      {children}
    </button>
  )
}

function ModelPicker({
  model,
  selected,
  models,
  open,
  onToggle,
  onClose,
  onPick,
  onBrief,
}: {
  model: string
  selected?: HubModel
  models: HubModel[]
  open: boolean
  onToggle: () => void
  onClose: () => void
  onPick: (id: string) => void
  onBrief: (model: HubModel) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 20)
    return () => window.clearTimeout(t)
  }, [open])

  const search = query.trim().toLowerCase()
  const showAuto = !search || 'auto'.includes(search)
  const visible = models.filter((m) => {
    if (!search) return true
    return `${m.name} ${m.id} ${m.cost} ${m.strength || ''} ${(m.tags || []).join(' ')}`.toLowerCase().includes(search)
  })
  const grouped = search ? null : partitionHubPickerModels(visible)

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointer)
    }
  }, [open, onClose])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="rounded-lg border border-white/12 bg-[#141413] px-3 py-1.5 text-[13px] text-white/80"
      >
        {selected?.name || (model === 'auto' ? 'Auto' : model)} ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 flex max-h-[min(420px,58vh)] w-[min(340px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#1a1a18] shadow-[0_8px_28px_rgba(0,0,0,0.38)]">
          <div className="shrink-0 border-b border-white/[0.06] p-2">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models…"
              className="w-full rounded-md border border-white/10 bg-[#141413] px-2.5 py-2 text-[13px] text-white outline-none placeholder:text-white/35 focus:border-[#007acc]/35"
            />
          </div>
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto py-0.5">
            {showAuto && (
              <button
                type="button"
                className={`block w-full border-l-2 px-3 py-2 text-left transition-colors ${
                  model === 'auto'
                    ? 'border-l-[#007acc] bg-[#007acc]/[0.07] text-white'
                    : 'border-l-transparent text-white/78 hover:bg-white/[0.04]'
                }`}
                onClick={() => onPick('auto')}
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-[12px] font-medium">Auto</span>
                  <HubTagGroup>
                    <HubTag label="Smart pick" kind={hubTierTagClass('Smart pick')} />
                  </HubTagGroup>
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-white/42">Routes to the best ready model for your prompt.</span>
                <span className="mt-1 block font-mono text-[10px] tabular-nums text-white/40">
                  Included pool first · $2.00 / 1M on-demand
                </span>
              </button>
            )}
            {grouped ? (
              <>
                {grouped.top.length > 0 && (
                  <>
                    <p className="border-t border-white/[0.06] px-3 pb-1 pt-2.5 text-[11px] font-semibold text-white/40 first:border-0 first:pt-1.5">
                      Top models
                    </p>
                    {grouped.top.map((m) => (
                      <HubModelRow key={m.id} m={m} model={model} onPick={onPick} onBrief={onBrief} />
                    ))}
                  </>
                )}
                {grouped.rest.length > 0 && (
                  <>
                    <p className="border-t border-white/[0.06] px-3 pb-1 pt-2.5 text-[11px] font-semibold text-white/40">
                      All models
                    </p>
                    {grouped.rest.map((m) => (
                      <HubModelRow key={m.id} m={m} model={model} onPick={onPick} onBrief={onBrief} />
                    ))}
                  </>
                )}
              </>
            ) : (
              visible.map((m) => <HubModelRow key={m.id} m={m} model={model} onPick={onPick} onBrief={onBrief} />)
            )}
            {!showAuto && !visible.length && (
              <p className="px-3 py-3 text-[12px] text-white/40">No models match “{query.trim()}”.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const HUB_TAG_STYLES: Record<string, string> = {
  'tag-new': 'text-[#7a9a84]',
  'tier-auto': 'text-[#007acc]/70',
  'tier-value': 'text-[#7a8f9c]',
  'tier-mid': 'text-[#9a9488]',
  'tier-high': 'text-[#a08884]',
  'tier-highest': 'text-[#a0807c]',
  'tier-neutral': 'text-white/40',
  'tag-soon': 'text-white/40',
  'tag-off': 'text-white/35',
}

function HubTag({ label, kind }: { label: string; kind: string }) {
  const style = HUB_TAG_STYLES[kind] || HUB_TAG_STYLES['tier-neutral']
  return <span className={`text-[10px] font-medium uppercase tracking-[0.03em] ${style}`}>{label}</span>
}

function HubTagGroup({ children }: { children: ReactNode }) {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean)
  return (
    <span className="inline-flex flex-wrap items-center [&>*+*]:before:mx-1.5 [&>*+*]:before:text-white/25 [&>*+*]:before:content-['·']">
      {items}
    </span>
  )
}

function HubModelRow({
  m,
  model,
  onPick,
  onBrief,
}: {
  m: HubModel
  model: string
  onPick: (id: string) => void
  onBrief: (model: HubModel) => void
}) {
  const price = hubModelPriceLine(m)
  const selected = model === m.id
  return (
    <div className="group flex items-stretch">
      <button
        type="button"
        disabled={isHubModelDisabled(m)}
        className={`min-w-0 flex-1 border-l-2 px-3 py-2 text-left transition-colors disabled:opacity-45 ${
          selected
            ? 'border-l-[#007acc] bg-[#007acc]/[0.07] text-white'
            : 'border-l-transparent text-white/78 hover:bg-white/[0.04]'
        }`}
        onClick={() => onPick(m.id)}
      >
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[12px] font-medium">{m.name}</span>
          <HubTagGroup>
            {m.tags?.includes('New') ? <HubTag label="New" kind="tag-new" /> : null}
            {m.cost ? <HubTag label={m.cost} kind={hubTierTagClass(m.cost)} /> : null}
            {isHubModelDisabled(m) ? <HubTag label="Soon" kind="tag-soon" /> : null}
          </HubTagGroup>
        </span>
        {m.strength ? <span className="mt-0.5 block text-[11px] leading-snug text-white/42">{m.strength}</span> : null}
        <span className="mt-1 block font-mono text-[10px] tabular-nums text-white/40">
          {price}
          {/\bin ·\b/.test(price) ? <span className="text-white/30"> / 1M tokens</span> : null}
        </span>
      </button>
      <button
        type="button"
        className="shrink-0 self-stretch border-l border-transparent px-3 text-[11px] font-medium text-white/38 transition-colors group-hover:border-white/[0.06] hover:text-[#007acc]"
        onClick={() => onBrief(m)}
      >
        Study
      </button>
    </div>
  )
}

function ToolBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-md px-2 py-1 text-[12px] text-white/50 hover:bg-white/[0.06] hover:text-white/80">
      {children}
    </button>
  )
}

function fileLangBadge(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    json: 'JSON',
    ts: 'TS',
    tsx: 'TS',
    js: 'JS',
    jsx: 'JS',
    mjs: 'JS',
    css: 'CSS',
    html: 'HTML',
    htm: 'HTML',
    md: 'MD',
    py: 'PY',
  }
  return map[ext] || ext.toUpperCase().slice(0, 4) || 'FILE'
}

function codeCardPath(seg: { file?: string; lang?: string }, index: number) {
  if (seg.file) return seg.file
  const lang = String(seg.lang || '').toLowerCase()
  if (lang === 'html' || lang === 'htm') return 'index.html'
  if (lang === 'css') return 'style.css'
  if (lang === 'js' || lang === 'javascript') return 'script.js'
  if (lang === 'ts' || lang === 'typescript') return 'script.ts'
  if (lang === 'tsx') return 'Component.tsx'
  if (lang && lang !== 'text') return `snippet.${lang}`
  return `snippet-${index + 1}`
}

function parseCodeRows(body: string) {
  let lines = String(body || '').replace(/\r\n/g, '\n').split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines = lines.slice(0, -1)
  const marked = lines.filter((l) => /^[+-]/.test(l) && !/^[+-]{3}/.test(l)).length
  const looksDiff = lines.length > 2 && marked >= Math.max(2, Math.floor(lines.length * 0.25))
  const rows: { type: 'add' | 'del' | ''; text: string }[] = []
  let added = 0
  let removed = 0
  if (looksDiff) {
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        added += 1
        rows.push({ type: 'add', text: line.slice(1) })
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        removed += 1
        rows.push({ type: 'del', text: line.slice(1) })
      } else {
        rows.push({ type: '', text: line.replace(/^ /, '') })
      }
    }
  } else {
    added = lines.length
    for (const line of lines) rows.push({ type: 'add', text: line })
  }
  return { rows, added, removed }
}

function Bubble({
  role,
  content,
  files,
}: {
  role: 'user' | 'assistant'
  content: string
  files?: ChatFile[]
}) {
  const user = role === 'user'
  if (user) {
    return (
      <div className="flex justify-start">
        <div className="w-full max-w-[92%]">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-white/40">You</div>
          <div className="rounded-xl border border-[#007acc]/40 bg-[linear-gradient(180deg,rgba(0,122,204,0.16),rgba(0,122,204,0.08))] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            {files?.length ? (
              <div className="mb-2 flex flex-wrap gap-1">
                {files.map((f) => (
                  <span key={f.name} className="rounded bg-black/20 px-1.5 py-0.5 text-[10px] text-white/60">
                    {f.name}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-[#f3f3f3]">{content}</div>
          </div>
        </div>
      </div>
    )
  }

  const segments = parseSegments(content)
  return (
    <div className="flex justify-start">
      <div className="flex w-full max-w-[92%] flex-col gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-white/40">Model</div>
        {segments.map((seg, i) => {
          if (seg.kind === 'text') {
            const t = seg.content.trim()
            if (!t) return null
            return (
              <div
                key={`t-${i}`}
                className="rounded-xl border border-white/[0.08] bg-[#181816] px-4 py-3.5 text-[13px] leading-[1.65] text-white/80 [&_code]:rounded [&_code]:bg-white/[0.06] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-[#e6c07b] [&_h3]:mb-2.5 [&_h3]:text-[14px] [&_h3]:font-semibold [&_h3]:text-[#f2f2f0] [&_li]:pl-0.5 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-[#f5f5f3] [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-2 [&_ul]:pl-4"
                dangerouslySetInnerHTML={{ __html: formatProseHtml(t) }}
              />
            )
          }
          const path = codeCardPath(seg, i)
          const nameOnly = path.split(/[/\\]/).pop() || path
          const glyph = fileGlyph(path)
          const badge = fileLangBadge(path)
          const { rows, added, removed } = parseCodeRows(seg.content)
          const shown = rows.slice(0, 120)
          return (
            <details
              key={`c-${i}`}
              open
              className="overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#141a16]"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 border-b border-[rgba(63,185,80,0.16)] bg-[#1a2420] px-3 py-2 [&::-webkit-details-marker]:hidden">
                <span
                  className="inline-grid h-3 min-w-4 shrink-0 place-items-center rounded-[2px] px-0.5 text-[7px] font-bold leading-none"
                  style={{ color: glyph.tone, background: `${glyph.tone}33` }}
                >
                  {glyph.label}
                </span>
                <span className="shrink-0 font-mono text-[10px] font-bold tracking-[0.04em] text-white/45">{badge}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-white/90" title={path}>
                  {nameOnly}
                </span>
                <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] font-medium">
                  <span className="text-[#3fb950]">+{added}</span>
                  <span className="text-[#f85149]">−{removed}</span>
                </span>
              </summary>
              <div className="bg-[#101612] py-1 font-mono text-[12px] leading-[1.5]">
                {shown.map((row, lineNo) => (
                  <div
                    key={lineNo}
                    className={`flex min-h-[18px] items-stretch whitespace-pre px-2 ${
                      row.type === 'add'
                        ? 'bg-[rgba(63,185,80,0.18)]'
                        : row.type === 'del'
                          ? 'bg-[rgba(248,81,73,0.16)]'
                          : ''
                    }`}
                  >
                    <span className="w-7 shrink-0 select-none pr-2 text-right text-[11px] text-white/35">{lineNo + 1}</span>
                    <span
                      className={`w-3.5 shrink-0 select-none text-center ${
                        row.type === 'add' ? 'text-[#3fb950]' : row.type === 'del' ? 'text-[#f85149]' : 'text-transparent'
                      }`}
                    >
                      {row.type === 'add' ? '+' : row.type === 'del' ? '−' : ''}
                    </span>
                    <code
                      className="min-w-0 flex-1 text-[#d4d4d4] [&_.hl-cmt]:italic [&_.hl-cmt]:text-[#6a9955] [&_.hl-kw]:text-[#569cd6] [&_.hl-num]:text-[#b5cea8] [&_.hl-sel]:text-[#d7ba7d] [&_.hl-str]:text-[#ce9178]"
                      dangerouslySetInnerHTML={{
                        __html: highlightCode(row.text, seg.lang || path),
                      }}
                    />
                  </div>
                ))}
                {rows.length > shown.length ? (
                  <div className="px-3 py-1 text-[11px] text-white/40">{rows.length - shown.length} more lines</div>
                ) : null}
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}
