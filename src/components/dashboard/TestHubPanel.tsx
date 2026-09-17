import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ChatFile } from '../../../shared/chatMedia'
import {
  CODING_MODELS,
  hubTierTagClass,
  partitionHubPickerModels,
  type CodingModel,
} from '../../../shared/models'
import { resolveModelPricing } from '../../../shared/modelPricing'
import { ModelBriefSheet } from './ModelBriefSheet'
import { SoumtokGlobeAvatar } from '../SoumtokGlobeAvatar'
import {
  formatShareDuration,
  normalizeTestHubSlug,
  SHARE_TTL_DEFAULT_MINUTES,
  SHARE_TTL_OPTIONS,
  suggestTestHubSlug,
  testHubSharePath,
  testHubSlugError,
} from '../../../shared/testHubDeploy'
import { TestHubShareLinksPanel } from './TestHubShareLinksPanel'
import {
  buildPreviewHtml,
  buildTestHubApiMessages,
  extractBuildArtifacts,
  mergeArtifactFiles,
  workspaceDisplayFiles,
  listArtifactPaths,
  fileGlyph,
  formatProseHtml,
  highlightCode,
  parseSegments,
} from '../../../shared/testHub'
import { looksLikeViteProject } from '../../../shared/testHubBenchmark'
import { previewStamp } from '../../../shared/preview'
import { fetchDocuments, fetchModels, streamTestHub } from '../../lib/api'
import { filesFromDrop, readChatFiles } from '../../lib/chatFiles'
import { modelsForPlan, planPoolSummary } from '../../../shared/usagePools'
import { sortModelsByPower } from '../../../shared/models'

type PreviewLogRow = {
  level: string
  message: string
  source: string
  line: number
}

type BenchmarkRunRow = {
  streamId: string
  model: string
  modelName: string
  text: string
  status: 'running' | 'done' | 'error'
  ms: number
  error: string
  previewErrors?: number
  viteBuildOk?: boolean | null
}

type BenchmarkSummaryRow = {
  model?: string
  model_name?: string
  avg_score?: number
  runs?: number
  avg_ms?: number
  avg_files?: number
}

type HubModel = {
  id: string
  name: string
  cost: string
  ready: boolean
  tags?: string[]
  provider?: string
  strength?: string
}

function hubAutoPriceLine(planId: string) {
  const pools = planPoolSummary(planId)
  if (pools.cheapOnly) {
    return `Everyday models · $${pools.cheapDisplayUsd.toFixed(2)}/mo included · $2.00/1M on-demand after`
  }
  return `$${pools.cheapDisplayUsd.toFixed(2)} everyday + $${pools.premiumDisplayUsd.toFixed(2)} additional/mo · $2.00/1M on-demand after`
}

function hubModelPriceLine(m: HubModel, planId = 'hobby') {
  if (m.id === 'auto') return hubAutoPriceLine(planId)
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
  return !m.ready || isGoogleHubModel(m)
}

function enrichHubModel(m: HubModel): HubModel {
  const catalog = CODING_MODELS.find((row) => row.id === m.id)
  return {
    id: m.id,
    name: catalog?.name || m.name || m.id,
    cost: catalog?.cost || m.cost || '',
    tags: catalog?.tags ?? m.tags,
    provider: catalog?.provider ?? m.provider,
    strength: catalog?.strength || m.strength,
    ready: Boolean(m.ready) && !isGoogleHubModel({ id: m.id, provider: catalog?.provider ?? m.provider }),
  }
}

function hubModelsForPlan(apiModels: HubModel[], planId: string) {
  const enriched = apiModels.map(enrichHubModel)
  return sortModelsByPower(modelsForPlan(enriched, planId).filter((m) => m.ready))
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

const LIVE_LINKS_KEY = 'soumtok-test-hub-live-links'

type LiveDeployRow = {
  id?: string
  url: string
  slug?: string
  expires_at: string
  created_at?: string
  expired?: boolean
  project_id?: string
  project_title?: string
  title?: string
}

function deployIsLive(row: LiveDeployRow | null | undefined) {
  if (!row?.url || row.expired) return false
  if (!row.expires_at) return true
  return new Date(row.expires_at).getTime() > Date.now()
}

function readLiveLinkStore(): Record<string, LiveDeployRow> {
  try {
    return JSON.parse(localStorage.getItem(LIVE_LINKS_KEY) || '{}') as Record<string, LiveDeployRow>
  } catch {
    return {}
  }
}

function cacheLiveDeploy(projectId: string, deploy: LiveDeployRow) {
  if (!projectId || !deploy.url) return
  const store = readLiveLinkStore()
  store[projectId] = deploy
  if (deploy.slug) store[`slug:${deploy.slug}`] = deploy
  try {
    localStorage.setItem(LIVE_LINKS_KEY, JSON.stringify(store))
  } catch {
    /* ignore */
  }
}

function pickCachedLiveDeploy(projectId: string, projectLabel: string) {
  const store = readLiveLinkStore()
  if (deployIsLive(store[projectId])) return store[projectId]
  const label = projectLabel.trim().toLowerCase()
  for (const row of Object.values(store)) {
    if (!deployIsLive(row)) continue
    if (row.project_id === projectId) return row
    const rowLabel = String(row.project_title || row.title || '').trim().toLowerCase()
    if (label && rowLabel === label) return row
  }
  const guessSlug = suggestTestHubSlug(projectLabel)
  if (guessSlug && deployIsLive(store[`slug:${guessSlug}`])) return store[`slug:${guessSlug}`]
  return (
    Object.values(store)
      .filter((row) => deployIsLive(row))
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0] || null
  )
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
  const chunks: string[] = []
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.content?.trim()) chunks.push(msg.content)
  }
  if (live?.trim()) chunks.push(live)
  if (!chunks.length) return {}
  return mergeArtifactFiles(chunks)
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

export function TestHubPanel({ plan }: { plan?: string }) {
  const billingPlan = plan || 'hobby'
  const initialId = useMemo(() => uid(), [])
  const [models, setModels] = useState<HubModel[]>([])
  const [model, setModel] = useState('auto')
  const [modelOpen, setModelOpen] = useState(false)
  const [messages, setMessages] = useState<HubMsg[]>([])
  const [prompt, setPrompt] = useState('')
  const [pending, setPending] = useState<ChatFile[]>([])
  const [busy, setBusy] = useState(false)
  const [hubPhase, setHubPhase] = useState<'idle' | 'connecting' | 'model' | 'streaming'>('idle')
  const [error, setError] = useState('')
  const [live, setLive] = useState('')
  const [outputTab, setOutputTab] = useState<'preview' | 'code'>('preview')
  const [mobilePane, setMobilePane] = useState<'chat' | 'preview' | 'code'>('chat')
  const pickOutputTab = useCallback((tab: 'preview' | 'code') => {
    setOutputTab(tab)
    setMobilePane(tab)
  }, [])
  const showMobilePane = useCallback((pane: 'chat' | 'preview' | 'code') => {
    setMobilePane(pane)
    if (pane !== 'chat') setOutputTab(pane)
  }, [])
  const [previewLogs, setPreviewLogs] = useState<PreviewLogRow[]>([])
  const [scoresOpen, setScoresOpen] = useState(false)
  const [scoreRows, setScoreRows] = useState<BenchmarkSummaryRow[]>([])
  const [scoresLoading, setScoresLoading] = useState(false)
  const [activeFile, setActiveFile] = useState('')
  const [archivesOpen, setArchivesOpen] = useState(false)
  const [archives, setArchives] = useState<{ id: string; title: string; updatedAt: string; fileCount: number }[]>([])
  const [status, setStatus] = useState('')
  const [shareBusy, setShareBusy] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareTitle, setShareTitle] = useState('')
  const [shareSlug, setShareSlug] = useState('')
  const [shareSlugTouched, setShareSlugTouched] = useState(false)
  const [shareError, setShareError] = useState('')
  const [sharePublishedUrl, setSharePublishedUrl] = useState('')
  const [sharePublishedTtl, setSharePublishedTtl] = useState(SHARE_TTL_DEFAULT_MINUTES)
  const [shareTtlMinutes, setShareTtlMinutes] = useState(SHARE_TTL_DEFAULT_MINUTES)
  const [shareCopyLabel, setShareCopyLabel] = useState('Copy link')
  const [linksOpen, setLinksOpen] = useState(false)
  const [linksRefreshKey, setLinksRefreshKey] = useState(0)
  const [activeLiveDeploy, setActiveLiveDeploy] = useState<LiveDeployRow | null>(null)
  const [shareExisting, setShareExisting] = useState(false)
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
  const previewFrameRef = useRef<HTMLIFrameElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const bootRef = useRef(false)
  const baseArtifactsRef = useRef<Record<string, string>>({})

  const baseArtifacts = useMemo(() => workspaceDisplayFiles(mergeArtifacts(messages, live)), [messages, live])
  const artifacts = useMemo(
    () => (busy ? baseArtifacts : { ...baseArtifacts, ...fileEdits }),
    [baseArtifacts, fileEdits, busy],
  )
  const previewHtml = useMemo(() => buildPreviewHtml(artifacts), [artifacts])
  const previewFrameKey = useMemo(() => previewStamp(previewHtml, artifacts), [previewHtml, artifacts])
  const artifactPaths = useMemo(() => listArtifactPaths(artifacts), [artifacts])

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
    if (!busy || !artifactPaths.length) return
    const label = artifactPaths.slice(0, 5).join(', ') + (artifactPaths.length > 5 ? '…' : '')
    setStatus(`Building · ${artifactPaths.length} file${artifactPaths.length === 1 ? '' : 's'} (${label})`)
  }, [artifactPaths, busy])

  useEffect(() => {
    if (busy && artifactPaths.length) setOutputTab('code')
  }, [busy, artifactPaths.length, outputTab])

  const hubRunBusy = useRef(false)
  useEffect(() => {
    if (busy) {
      hubRunBusy.current = true
      return
    }
    if (!hubRunBusy.current || !previewHtml) return
    hubRunBusy.current = false
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 1023px)').matches) return
    setMobilePane((pane) => (pane === 'chat' ? 'preview' : pane))
  }, [busy, previewHtml])

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'soumtok-preview-log') return
      const frame = previewFrameRef.current
      if (!frame?.contentWindow || event.source !== frame.contentWindow) return
      setPreviewLogs((rows) =>
        [
          ...rows,
          {
            level: event.data.level || 'error',
            message: String(event.data.message || ''),
            source: event.data.source || '',
            line: event.data.line || 0,
          },
        ].slice(-48),
      )
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  useEffect(() => {
    setPreviewLogs([])
  }, [activeId])

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
        setWorkspaces(
          saved.workspaces.map((w) => ({
            ...w,
            outputTab: w.outputTab === 'code' ? 'code' : 'preview',
          })),
        )
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
        if (saved.outputTab === 'code') setOutputTab('code')
        else setOutputTab('preview')
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
      .then((rows) => {
        const eligible = hubModelsForPlan(rows.models, billingPlan)
        setModels(eligible)
        setModel((current) => {
          if (current === 'auto') return current
          return eligible.some((item) => item.id === current) ? current : 'auto'
        })
      })
      .catch(() => setError('Could not load models'))
    void fetchDocuments()
      .then((rows) => setDocs(rows.map((d) => ({ id: d.id, title: d.title || 'Untitled' }))))
      .catch(() => {})
  }, [billingPlan])

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, live])

  const selected = models.find((m) => m.id === model)
  const enabledModels = useMemo(() => models.filter((m) => !isHubModelDisabled(m)), [models])
  const modelNameById = useCallback(
    (id: string) => models.find((m) => m.id === id)?.name || id,
    [models],
  )

  const lastUserPrompt = useCallback(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'user') return String(messages[i].content || '')
    }
    return ''
  }, [messages])

  const saveBenchmarkRuns = useCallback(
    async (runs: BenchmarkRunRow[], opts: { viteEnabled?: boolean }) => {
      if (!runs.length) return
      try {
        const res = await fetch('/api/test-hub/benchmarks', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: lastUserPrompt(),
            compareMode: false,
            viteEnabled: Boolean(opts.viteEnabled),
            runs: runs.map((run) => ({
              model: run.model,
              modelName: run.modelName,
              text: run.text,
              ms: run.ms,
              status: run.status,
              error: run.error,
              previewErrors: run.previewErrors || previewLogs.length,
              viteBuildOk: run.viteBuildOk ?? null,
            })),
          }),
        })
        const data = (await res.json()) as { winnerModel?: string; winnerScore?: number; error?: string }
        if (data.winnerModel && data.winnerScore != null) {
          setStatus(`Benchmark saved · ${modelNameById(data.winnerModel)} ${Math.round(data.winnerScore)}/100`)
        } else if (res.ok) {
          setStatus('Benchmark saved')
        }
      } catch {
        /* optional when signed out */
      }
    },
    [lastUserPrompt, modelNameById, previewLogs.length],
  )

  const loadBenchmarkScores = useCallback(async () => {
    setScoresLoading(true)
    try {
      const res = await fetch('/api/test-hub/benchmarks/summary', { credentials: 'include' })
      const data = (await res.json()) as { rows?: BenchmarkSummaryRow[] }
      setScoreRows(data.rows || [])
    } catch {
      setScoreRows([])
    } finally {
      setScoresLoading(false)
    }
  }, [])

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

  async function onSendSingle() {
    const text = prompt.trim()
    if (busy || (!text && !pending.length)) return
    setError('')
    const userMsg: HubMsg = { id: uid(), role: 'user', content: text, files: pending.length ? pending : undefined }
    const next = [...messages, userMsg]
    setMessages(next)
    setPrompt('')
    setPending([])
    setBusy(true)
    setHubPhase('connecting')
    setLive('')
    setPreviewLogs([])
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const t0 = performance.now()
    let toolFiles = { ...artifacts }
    try {
      const apiMessages = buildTestHubApiMessages(next, { files: toolFiles })
      let assistant = ''
      const run = await streamTestHub(
        model,
        apiMessages,
        (chunk) => {
          assistant = chunk
          if (chunk) setHubPhase('streaming')
          setLive(chunk)
        },
        abortRef.current.signal,
        {
          onPing: () => setHubPhase('model'),
          onConnected: () => setHubPhase('model'),
        },
      )
      assistant = run.text || assistant
      const parsed = extractBuildArtifacts(assistant)
      toolFiles = { ...toolFiles, ...(run.files || {}), ...parsed }
      if (Object.keys(toolFiles).length) {
        setFileEdits({})
        setOutputTab('preview')
        setActiveFile((cur) => {
          const paths = listArtifactPaths(toolFiles)
          if (!paths.length) return cur
          return cur && toolFiles[cur] ? cur : paths[0]
        })
      }
      const tokens = (run.promptTokens || 0) + (run.completionTokens || 0)
      setMessages((cur) => [...cur, { id: uid(), role: 'assistant', content: assistant || 'Done.' }])
      setLive('')
      const bench: BenchmarkRunRow = {
        streamId: uid(),
        model,
        modelName: modelNameById(model),
        text: assistant,
        status: 'done',
        ms: Math.round(performance.now() - t0),
        error: '',
        previewErrors: previewLogs.length,
        viteBuildOk: looksLikeViteProject(toolFiles) ? null : undefined,
      }
      await saveBenchmarkRuns([bench], {
        viteEnabled: looksLikeViteProject(toolFiles),
      })
      if (tokens > 0) {
        setStatus(`Used ${tokens.toLocaleString()} tokens · counts toward your plan usage`)
      }
    } catch (err) {
      if (abortRef.current?.signal.aborted) return
      const msg = err instanceof Error ? err.message : 'Request failed'
      setError(msg)
      setMessages((cur) => [...cur, { id: uid(), role: 'assistant', content: `Error: ${msg}` }])
      setLive('')
    } finally {
      setBusy(false)
      setHubPhase('idle')
    }
  }

  function onSend() {
    void onSendSingle()
  }

  function fixPreviewErrors() {
    if (!previewLogs.length) return
    const summary = previewLogs
      .map((row) => {
        const where = row.source ? ` (${row.source}${row.line ? `:${row.line}` : ''})` : ''
        return `[${row.level}] ${row.message}${where}`
      })
      .join('\n')
    setPrompt(
      `The live preview threw these runtime errors:\n\n${summary}\n\nFix the project files so the preview runs without errors.`,
    )
  }

  const canShare = Boolean(previewHtml && artifactPaths.length)
  const hasLiveLink = deployIsLive(activeLiveDeploy)

  useEffect(() => {
    const projectLabel = workspaceTitle(messages, workspaces.find((w) => w.id === activeId)?.title || 'Project')
    const cached = pickCachedLiveDeploy(activeId, projectLabel)
    if (cached) setActiveLiveDeploy(cached)

    let cancelled = false
    async function load() {
      try {
        const fetchRows = async (project?: string) => {
          const q = project ? `?limit=10&project=${encodeURIComponent(project)}` : '?limit=30'
          const r = await fetch(`/api/test-hub/deploys${q}`, { credentials: 'include' })
          const data = (await r.json()) as { rows?: LiveDeployRow[] }
          return (data.rows || []).filter((row) => deployIsLive(row))
        }
        let rows = await fetchRows(activeId)
        if (!rows.length) {
          const all = await fetchRows()
          const label = projectLabel.trim().toLowerCase()
          rows =
            all.filter(
              (row) =>
                row.project_id === activeId ||
                String(row.project_title || row.title || '')
                  .trim()
                  .toLowerCase() === label,
            ) || []
          if (!rows.length && all.length) rows = [all[0]]
        }
        const live = rows[0] || pickCachedLiveDeploy(activeId, projectLabel)
        if (!cancelled) {
          setActiveLiveDeploy(live)
          if (live) cacheLiveDeploy(activeId, live)
        }
      } catch {
        if (!cancelled) setActiveLiveDeploy(pickCachedLiveDeploy(activeId, projectLabel))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [activeId, linksRefreshKey, messages, workspaces])

  const openSharePublishForm = useCallback(() => {
    if (!canShare) return
    const title = messages.find((m) => m.role === 'user')?.content.trim().slice(0, 120) || 'Test Hub preview'
    setShareTitle(title)
    setShareSlug(suggestTestHubSlug(title))
    setShareSlugTouched(false)
    setShareError('')
    setSharePublishedUrl('')
    setShareExisting(false)
    setShareCopyLabel('Copy link')
    setShareTtlMinutes(SHARE_TTL_DEFAULT_MINUTES)
    setShareOpen(true)
  }, [canShare, messages])

  const handleShareClick = useCallback(() => {
    if (!canShare) return
    if (activeLiveDeploy?.url) {
      const expires = new Date(activeLiveDeploy.expires_at).getTime()
      const created = activeLiveDeploy.created_at ? new Date(activeLiveDeploy.created_at).getTime() : Date.now()
      setSharePublishedUrl(activeLiveDeploy.url)
      setSharePublishedTtl(Math.max(30, Math.round((expires - created) / 60_000)))
      setShareExisting(true)
      setShareCopyLabel('Copy link')
      setShareOpen(true)
      return
    }
    openSharePublishForm()
  }, [canShare, activeLiveDeploy, openSharePublishForm])

  const publishShareLink = useCallback(async () => {
    if (shareBusy || !canShare) return
    const slugErr = testHubSlugError(shareSlug)
    if (slugErr) {
      setShareError(slugErr)
      return
    }
    const slug = normalizeTestHubSlug(shareSlug)
    const title = shareTitle.trim().slice(0, 120) || 'Test Hub preview'
    setShareBusy(true)
    setShareError('')
    try {
      const res = await fetch('/api/test-hub/publish', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: artifacts,
          title,
          slug,
          projectId: activeId,
          projectTitle: workspaceTitle(messages, workspaces.find((w) => w.id === activeId)?.title || 'Project'),
          ttlMinutes: shareTtlMinutes,
        }),
      })
      const data = (await res.json()) as {
        url?: string
        error?: string
        ttlMinutes?: number
        expiresAt?: string
        id?: string
        slug?: string
      }
      if (!res.ok) {
        setShareError(data.error || `Publish failed (${res.status})`)
        return
      }
      if (data.url) {
        try {
          await navigator.clipboard.writeText(data.url)
        } catch {
          /* success UI still shows the link */
        }
        setSharePublishedUrl(data.url)
        setSharePublishedTtl(data.ttlMinutes || shareTtlMinutes)
        setShareExisting(false)
        setShareCopyLabel('Copy link')
        const live: LiveDeployRow = {
          id: data.id,
          url: data.url,
          slug: data.slug,
          expires_at: data.expiresAt || '',
          created_at: new Date().toISOString(),
          expired: false,
          project_id: activeId,
          project_title: workspaceTitle(messages, workspaces.find((w) => w.id === activeId)?.title || 'Project'),
          title,
        }
        setActiveLiveDeploy(live)
        cacheLiveDeploy(activeId, live)
        setStatus(`Published · link copied · live ${formatShareDuration(data.ttlMinutes || shareTtlMinutes)}`)
        setLinksOpen(true)
        setLinksRefreshKey((n) => n + 1)
      }
    } catch {
      setShareError('Could not publish share link')
    } finally {
      setShareBusy(false)
    }
  }, [shareBusy, canShare, artifacts, shareSlug, shareTitle, shareTtlMinutes, activeId, messages, workspaces])

  return (
    <div className="test-hub-panel flex min-h-0 flex-1 flex-col">
      <header className="th-chrome-header flex shrink-0 flex-wrap items-center gap-0 border-b border-white/[0.08]">
        <div className="th-chrome-title-row flex min-w-0 flex-1 items-center gap-2.5 px-4 py-3 md:px-5">
          <SoumtokGlobeAvatar color="#2f6fed" size={30} state={busy ? 'working' : 'idle'} />
          <div className="min-w-0">
            <h1 className="th-chrome-title text-[14px] font-semibold tracking-[-0.01em]">Test Hub</h1>
            <p className="th-subtitle hidden truncate text-[11px] text-white/40 sm:block">
              Direct model chat — preview updates live as the model builds.
            </p>
          </div>
        </div>
        <div className="mx-0 hidden h-8 w-px self-center bg-white/10 sm:block" aria-hidden="true" />
        <div className="th-project-actions flex items-center gap-2 px-3 py-2">
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
            <span className="hidden sm:inline">Clear project</span>
            <span className="sm:hidden">Clear</span>
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
            <span className="hidden sm:inline">New project</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
        <div className="mx-0 hidden h-8 w-px self-center bg-white/10 lg:block" aria-hidden="true" />
        <div className="hidden items-center gap-2 px-3 py-2 lg:flex">
          <div className="inline-flex rounded-[10px] border border-white/[0.08] bg-black/30 p-1">
            <OutTab active={outputTab === 'preview'} onClick={() => pickOutputTab('preview')}>
              Preview
            </OutTab>
            <OutTab active={outputTab === 'code'} onClick={() => pickOutputTab('code')}>
              Code
            </OutTab>
          </div>
          <div className="h-8 w-px bg-white/10" aria-hidden="true" />
          <ModelPicker
            model={model}
            selected={selected}
            models={models}
            planId={billingPlan}
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
              planId={billingPlan}
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
      <div className="th-workspace-tabs flex shrink-0 items-center gap-2 overflow-x-auto border-b border-white/[0.08] px-3 py-1.5">
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
      <div className="th-mobile-view-tabs flex shrink-0 items-center gap-1 border-b border-white/[0.08] px-3 py-2 lg:hidden">
        <OutTab active={mobilePane === 'chat'} onClick={() => showMobilePane('chat')}>
          Chat
        </OutTab>
        <OutTab active={mobilePane === 'preview'} onClick={() => showMobilePane('preview')}>
          Preview
        </OutTab>
        <OutTab active={mobilePane === 'code'} onClick={() => showMobilePane('code')}>
          Code
        </OutTab>
      </div>
      {briefModel && <ModelBriefSheet model={briefModel} onClose={() => setBriefModel(null)} />}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,42%)]">
        <section
          className={`th-chat-pane flex min-h-0 min-w-0 flex-col border-white/[0.06] lg:border-r ${
            mobilePane === 'chat' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <div ref={feedRef} className="thin-scroll min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
            <div className="mx-auto max-w-[720px] space-y-4">
              {messages.length === 0 && !live && !busy && (
                <div className="rounded-xl border border-white/[0.08] bg-[#141413] px-4 py-8 text-center">
                  <p className="text-[14px] text-white/75">
                    Ask the agent to build or explain — it writes files with tools; preview updates live on the right.
                  </p>
                  <p className="mt-2 text-[12px] text-white/40">
                    Attach files, folders, or docs — preview and code appear on the right.
                  </p>
                </div>
              )}
              {messages.map((msg) => (
                <Bubble key={msg.id} role={msg.role} files={msg.files} content={msg.content} />
              ))}
              {live && <Bubble role="assistant" content={live} />}
              {busy && !live && (
                <p className="text-[12px] text-white/40">
                  {hubPhase === 'connecting' ? 'Connecting…' : hubPhase === 'model' ? 'Waiting for model…' : 'Streaming…'}
                </p>
              )}
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
                    {busy
                      ? hubPhase === 'connecting'
                        ? 'Connecting…'
                        : hubPhase === 'model'
                          ? 'Waiting…'
                          : 'Streaming…'
                      : 'Send'}
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

        <aside
          className={`flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0c0c0b] ${
            mobilePane === 'chat' ? 'hidden lg:flex' : 'flex'
          } lg:flex`}
        >
          {outputTab === 'preview' ? (
            <div className="relative flex min-h-0 flex-1 flex-col bg-white">
              {canShare ? (
                <div className="shrink-0 border-b border-black/10 bg-[#eef0f3] px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10.5px] text-black/45">
                        {hasLiveLink ? 'Static preview · share link is live' : 'Live preview · publish a share link'}
                      </p>
                      {hasLiveLink && activeLiveDeploy?.url ? (
                        <PreviewLiveLinkBar url={activeLiveDeploy.url} onCopied={() => setStatus('Copied')} />
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={shareBusy}
                      title={hasLiveLink ? activeLiveDeploy?.url : 'Publish a live share link'}
                      className={`shrink-0 self-end rounded-md border px-3 py-1.5 text-[10.5px] font-medium disabled:opacity-45 ${
                        hasLiveLink ? 'mt-5' : ''
                      } ${
                        hasLiveLink
                          ? 'border-black/12 bg-white text-black/70 hover:bg-black/[0.03]'
                          : 'border-[#007acc]/30 bg-[#007acc]/10 text-[#007acc] hover:bg-[#007acc]/15'
                      }`}
                      onClick={handleShareClick}
                    >
                      {shareBusy ? 'Publishing…' : hasLiveLink ? 'Manage' : 'Share link'}
                    </button>
                  </div>
                </div>
              ) : null}
              {!previewHtml ? (
                <p className="absolute inset-0 flex items-center justify-center bg-[#0c0c0b] px-6 text-center text-[13px] text-white/35">
                  Build something — live preview appears here as the model replies.
                </p>
              ) : (
                <iframe
                  key={previewFrameKey}
                  ref={previewFrameRef}
                  title="Test Hub preview"
                  sandbox="allow-scripts allow-same-origin"
                  srcDoc={previewHtml}
                  className="min-h-0 flex-1 w-full border-0 bg-white"
                />
              )}
              {previewLogs.length > 0 && (
                <div className="shrink-0 border-t border-black/10 bg-[#1e1e1e] text-[#d4d4d4]">
                  <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-white/45">Preview console</span>
                    <div className="flex gap-2">
                      <button type="button" className="text-[10px] text-[#007acc] hover:underline" onClick={fixPreviewErrors}>
                        Fix errors
                      </button>
                      <button
                        type="button"
                        className="text-[10px] text-white/45 hover:text-white/70"
                        onClick={() => setPreviewLogs([])}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <pre className="thin-scroll max-h-[120px] overflow-auto px-3 pb-2 font-mono text-[10px] leading-relaxed text-[#f48771]">
                    {previewLogs
                      .map((row) => {
                        const where = row.source ? ` (${row.source}${row.line ? `:${row.line}` : ''})` : ''
                        return `[${row.level}] ${row.message}${where}`
                      })
                      .join('\n')}
                  </pre>
                </div>
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
              onToggleArchives={() => {
                setArchivesOpen((o) => !o)
                setLinksOpen(false)
              }}
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
              onShareLink={handleShareClick}
              shareLinkLabel={shareBusy ? 'Publishing…' : hasLiveLink ? 'Link live' : 'Share link'}
              shareBusy={shareBusy}
              canShare={canShare}
              linksOpen={linksOpen}
              linksRefreshKey={linksRefreshKey}
              onToggleLinks={() => {
                setLinksOpen((open) => {
                  const next = !open
                  if (next) setArchivesOpen(false)
                  return next
                })
              }}
              projectId={activeId}
              projectTitle={workspaceTitle(messages, workspaces.find((w) => w.id === activeId)?.title || 'Project')}
              onCloseLinks={() => setLinksOpen(false)}
              onDownloadFiles={() => {
                for (const path of artifactPaths) {
                  downloadBlob(path.replace(/\//g, '-'), new Blob([artifacts[path]], { type: 'text/plain' }))
                }
                setStatus(`Downloaded ${artifactPaths.length} files`)
              }}
              scoresOpen={scoresOpen}
              scoreRows={scoreRows}
              scoresLoading={scoresLoading}
              onToggleScores={() => {
                setScoresOpen((open) => {
                  const next = !open
                  if (next) {
                    setArchivesOpen(false)
                    setLinksOpen(false)
                    void loadBenchmarkScores()
                  }
                  return next
                })
              }}
              onCloseScores={() => setScoresOpen(false)}
            />
          )}
        </aside>
      </div>
      {shareOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="test-hub-share-title"
        >
          <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#252526] p-4 text-white shadow-xl">
            {sharePublishedUrl ? (
              <>
                <h2 id="test-hub-share-title" className="text-[15px] font-semibold text-emerald-400">
                  {shareExisting ? 'Link is live' : 'Published successfully'}
                </h2>
                <p className="mt-1 text-[12px] text-white/70">
                  {shareExisting && activeLiveDeploy?.expires_at
                    ? `Your link is still live — expires ${new Date(activeLiveDeploy.expires_at).toLocaleString()}.`
                    : `Your link is live for ${formatShareDuration(sharePublishedTtl)} — copied to clipboard.`}
                </p>
                <p className="mt-3 break-all rounded-md border border-[#007acc]/25 bg-[#007acc]/10 px-3 py-2 font-mono text-[12px] text-[#5b8ef5]">
                  {sharePublishedUrl}
                </p>
                <p className="mt-2 text-[11px] text-white/40">It also appears in Links below and in Settings → Test Hub.</p>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {shareExisting ? (
                    <button
                      type="button"
                      className="rounded-md px-3 py-1.5 text-[12px] text-white/60 hover:text-white/85"
                      onClick={() => openSharePublishForm()}
                    >
                      New link
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-md px-3 py-1.5 text-[12px] text-white/60 hover:text-white/85"
                    onClick={() => {
                      void navigator.clipboard.writeText(sharePublishedUrl).then(
                        () => {
                          setShareCopyLabel('Copied')
                          setStatus('Copied')
                          window.setTimeout(() => setShareCopyLabel('Copy link'), 2000)
                        },
                        () => setStatus(sharePublishedUrl),
                      )
                    }}
                  >
                    {shareCopyLabel}
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-[#007acc] px-3 py-1.5 text-[12px] font-semibold text-white"
                    onClick={() => {
                      setShareOpen(false)
                      setSharePublishedUrl('')
                      setShareExisting(false)
                    }}
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="test-hub-share-title" className="text-[14px] font-semibold text-white/95">
                  Publish share link
                </h2>
                <p className="mt-1 text-[12px] text-white/45">Pick a slug and duration (max 30 days — then auto-deleted).</p>
                <label className="mt-4 block text-[11px] text-white/50">
                  Title
                  <input
                    value={shareTitle}
                    onChange={(e) => {
                      const next = e.target.value
                      setShareTitle(next)
                      if (!shareSlugTouched) setShareSlug(suggestTestHubSlug(next))
                    }}
                    className="mt-1 w-full rounded-md border border-white/10 bg-[#1e1e1e] px-2.5 py-2 text-[13px] text-white/90"
                  />
                </label>
                <label className="mt-3 block text-[11px] text-white/50">
                  Test slug
                  <input
                    value={shareSlug}
                    onChange={(e) => {
                      setShareSlugTouched(true)
                      setShareSlug(e.target.value)
                    }}
                    className="mt-1 w-full rounded-md border border-white/10 bg-[#1e1e1e] px-2.5 py-2 font-mono text-[13px] text-white/90"
                    placeholder="my-demo"
                    spellCheck={false}
                  />
                </label>
                <p className="mt-3 break-all font-mono text-[11px] text-[#5b8ef5]">
                  {typeof window !== 'undefined'
                    ? `${window.location.origin}${testHubSharePath(normalizeTestHubSlug(shareSlug) || 'your-slug')}`
                    : ''}
                </p>
                <label className="mt-3 block text-[11px] text-white/50">
                  How long live
                  <select
                    value={shareTtlMinutes}
                    onChange={(e) => setShareTtlMinutes(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-white/10 bg-[#1e1e1e] px-2.5 py-2 text-[13px] text-white/90"
                  >
                    {SHARE_TTL_OPTIONS.map((opt) => (
                      <option key={opt.minutes} value={opt.minutes}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                {shareError ? <p className="mt-2 text-[12px] text-[#e06c75]">{shareError}</p> : null}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-md px-3 py-1.5 text-[12px] text-white/60 hover:text-white/85"
                    onClick={() => setShareOpen(false)}
                    disabled={shareBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-[#007acc] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-45"
                    onClick={() => void publishShareLink()}
                    disabled={shareBusy}
                  >
                    {shareBusy ? 'Publishing…' : 'Publish'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

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
  onShareLink,
  shareLinkLabel,
  shareBusy,
  canShare,
  linksOpen,
  linksRefreshKey,
  onToggleLinks,
  onCloseLinks,
  projectId,
  projectTitle,
  scoresOpen,
  scoreRows,
  scoresLoading,
  onToggleScores,
  onCloseScores,
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
  onShareLink: () => void
  shareLinkLabel: string
  shareBusy: boolean
  canShare: boolean
  linksOpen: boolean
  linksRefreshKey: number
  onToggleLinks: () => void
  onCloseLinks: () => void
  projectId: string
  projectTitle: string
  scoresOpen: boolean
  scoreRows: BenchmarkSummaryRow[]
  scoresLoading: boolean
  onToggleScores: () => void
  onCloseScores: () => void
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
    <div className="th-code-pane keep-dark flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#333] bg-[#252526] px-3 py-2">
        <div className="min-w-0">
          <span className="text-[12px] font-medium text-white/90">Project files</span>
          <span className="ml-2 text-[11px] text-white/40">
            {status || `${paths.length} file${paths.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {canShare ? (
            <CodeAction primary disabled={shareBusy} onClick={onShareLink}>
              {shareLinkLabel}
            </CodeAction>
          ) : null}
          <CodeAction onClick={onToggleScores}>Scores</CodeAction>
          <CodeAction onClick={onToggleLinks}>Links</CodeAction>
          <CodeAction onClick={onToggleArchives}>Builds</CodeAction>
          <CodeAction onClick={onSaveArchive}>Save</CodeAction>
          <CodeAction onClick={onSaveToFolder}>Save to folder</CodeAction>
          <CodeAction onClick={onDownloadFiles}>Download files</CodeAction>
          <CodeAction onClick={onDownload}>Download</CodeAction>
        </div>
      </div>
      {scoresOpen && (
        <div className="shrink-0 border-b border-[#333] bg-[#1a1a18]">
          <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-white/45">
            <span>Model scores</span>
            <button type="button" className="text-white/50 hover:text-white/80" onClick={onCloseScores}>
              ×
            </button>
          </div>
          <div className="max-h-[180px] overflow-auto px-3 pb-2">
            {scoresLoading ? (
              <p className="py-2 text-[11px] text-white/35">Loading scores…</p>
            ) : !scoreRows.length ? (
              <p className="py-2 text-[11px] text-white/35">
                No benchmark runs yet. Send a build — scores save when you are signed in.
              </p>
            ) : (
              <table className="w-full text-left text-[11px] text-white/75">
                <thead>
                  <tr className="text-white/40">
                    <th className="pb-1 pr-2 font-medium">Model</th>
                    <th className="pb-1 pr-2 font-medium">Avg</th>
                    <th className="pb-1 pr-2 font-medium">Runs</th>
                    <th className="pb-1 pr-2 font-medium">Time</th>
                    <th className="pb-1 font-medium">Files</th>
                  </tr>
                </thead>
                <tbody>
                  {scoreRows.map((row) => (
                    <tr key={row.model} className="border-t border-white/[0.06]">
                      <td className="py-1 pr-2">{row.model_name || row.model || '—'}</td>
                      <td className="py-1 pr-2 font-semibold text-white">{row.avg_score ?? '—'}</td>
                      <td className="py-1 pr-2">{row.runs ?? 0}</td>
                      <td className="py-1 pr-2">
                        {row.avg_ms ? `${(Number(row.avg_ms) / 1000).toFixed(1)}s` : '—'}
                      </td>
                      <td className="py-1">{row.avg_files ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      {linksOpen && (
        <div className="shrink-0 border-b border-[#333] bg-[#1a1a18] px-3 py-2">
          <div className="mb-2 flex items-center justify-between text-[11px] text-white/45">
            <span>Share links · {projectTitle}</span>
            <button type="button" className="text-white/50 hover:text-white/80" onClick={onCloseLinks}>
              ×
            </button>
          </div>
          <TestHubShareLinksPanel compact refreshKey={linksRefreshKey} projectId={projectId} projectTitle={projectTitle} />
        </div>
      )}
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
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(120px,34%)_minmax(0,1fr)]">
        <nav className="thin-scroll max-h-[38vh] overflow-y-auto border-b border-[#333] bg-[#252526] p-2 md:max-h-none md:border-b-0 md:border-r">
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
      className={`min-w-[56px] rounded-[7px] px-2.5 py-1.5 text-[11px] font-medium sm:min-w-[72px] sm:px-3.5 sm:text-[12px] ${
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
  planId = 'hobby',
  open,
  onToggle,
  onClose,
  onPick,
  onBrief,
}: {
  model: string
  selected?: HubModel
  models: HubModel[]
  planId?: string
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
    if (!m.ready) return false
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
                <span className="mt-1 block font-mono text-[10px] tabular-nums text-white/40">{hubAutoPriceLine(planId)}</span>
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
                      <HubModelRow key={m.id} m={m} model={model} planId={planId} onPick={onPick} onBrief={onBrief} />
                    ))}
                  </>
                )}
                {grouped.rest.length > 0 && (
                  <>
                    <p className="border-t border-white/[0.06] px-3 pb-1 pt-2.5 text-[11px] font-semibold text-white/40">
                      All models
                    </p>
                    {grouped.rest.map((m) => (
                      <HubModelRow key={m.id} m={m} model={model} planId={planId} onPick={onPick} onBrief={onBrief} />
                    ))}
                  </>
                )}
              </>
            ) : (
              visible.map((m) => <HubModelRow key={m.id} m={m} model={model} planId={planId} onPick={onPick} onBrief={onBrief} />)
            )}
            {!showAuto && !visible.length && (
              <p className="px-3 py-3 text-[12px] leading-5 text-white/40">
                {query.trim()
                  ? `No models match “${query.trim()}”.`
                  : 'No models on your plan are ready. Upgrade in Billing or add API keys.'}
              </p>
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
  planId = 'hobby',
  onPick,
  onBrief,
}: {
  m: HubModel
  model: string
  planId?: string
  onPick: (id: string) => void
  onBrief: (model: HubModel) => void
}) {
  const price = hubModelPriceLine(m, planId)
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

function PreviewLiveLinkBar({ url, onCopied }: { url: string; onCopied?: () => void }) {
  const [copyLabel, setCopyLabel] = useState('Copy')
  return (
    <div className="mt-1.5 flex min-w-0 items-stretch overflow-hidden rounded-md border border-black/10 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
      <span className="inline-flex shrink-0 items-center gap-1.5 border-r border-black/8 bg-[#f7f8fa] px-2.5 text-[10px] font-medium text-black/50">
        <span className="h-1.5 w-1.5 rounded-full bg-[#3fb950] shadow-[0_0_0_2px_rgba(63,185,80,0.15)]" aria-hidden="true" />
        Live
      </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={url}
        className="min-w-0 flex-1 truncate px-2.5 py-1.5 font-mono text-[11px] leading-none text-[#0066b8] hover:text-[#004f8f]"
      >
        {url}
      </a>
      <button
        type="button"
        className="shrink-0 border-l border-black/8 bg-[#f7f8fa] px-3 py-1.5 text-[10.5px] font-medium text-black/65 hover:bg-[#eef0f3] hover:text-black/85"
        onClick={() => {
          void navigator.clipboard.writeText(url).then(
            () => {
              setCopyLabel('Copied')
              onCopied?.()
              window.setTimeout(() => setCopyLabel('Copy'), 2000)
            },
            () => onCopied?.(),
          )
        }}
      >
        {copyLabel}
      </button>
    </div>
  )
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
