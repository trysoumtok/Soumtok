import { useEffect, useRef, useState, type ReactNode } from 'react'
import { GITHUB_APP_INSTALL_URL } from '../../../shared/githubApp.ts'
import {
  completeStudio,
  createAutomation,
  fetchAutomationRuns,
  fetchAutomations,
  fetchConnectors,
  fetchGithubRepos,
  fetchModels,
  fetchPlugins,
  saveAutomation,
  testAutomation,
  type AutomationItem,
  type AutomationRow,
  type AutomationRun,
  type ConnectorRow,
  type GithubRepo,
  type InstalledPlugin,
} from '../../lib/api'
import { signInSocial } from '../../lib/auth-client'
import { navigate } from '../../lib/nav'
import { GithubIcon, SearchIcon } from './icons'
import { PluginLogo } from './PluginLogos'

type StudioModel = {
  id: string
  name: string
  cost: string
  ready: boolean
}

const DEFAULT_TOOLS: AutomationItem[] = [{ id: 'memories', type: 'memories', label: 'Memories' }]

const TRIGGER_KINDS = [
  { type: 'scheduled', label: 'Scheduled', chevron: true },
  { type: 'webhook', label: 'Webhook Triggered', chevron: false },
] as const

const TRIGGER_OPTIONS: Record<string, { label: string; value: string }[]> = {
  scheduled: [
    { label: 'Every hour', value: 'hourly' },
    { label: 'Every day at 09:00', value: 'daily' },
    { label: 'Every Monday', value: 'weekly' },
  ],
}

function modelCaps(item: Pick<StudioModel, 'id' | 'name' | 'cost'>): string[] {
  const hay = `${item.id} ${item.name}`.toLowerCase()
  const fast = /flash|nano|mini|lite|fast|haiku/.test(hay)
  const high = /pro|opus|fable|astra|o1|o3|codex|reasoning/.test(hay)
  if (item.id === 'grok-4.6' || (high && fast)) return ['High', 'Fast']
  if (high || item.cost === 'Highest' || item.cost === 'High' || item.cost === 'Higher') return ['High']
  if (fast || item.cost === 'Cheap' || item.cost === 'Cheapest' || item.cost === 'Low' || item.cost === 'Free') {
    return ['Fast']
  }
  return ['Medium']
}

function modelLabel(item: StudioModel | undefined, fallback: string) {
  if (!item) return fallback
  const cap = modelCaps(item)[0]
  return cap ? `${item.name} ${cap}` : item.name
}

function uid() {
  return crypto.randomUUID()
}

export function AutomationsEditor({ authorName }: { authorName: string }) {
  const [id, setId] = useState<string | null>(null)
  const [title, setTitle] = useState('Untitled')
  const [active, setActive] = useState(false)
  const [repoId, setRepoId] = useState<string | null>(null)
  const [repoName, setRepoName] = useState<string | null>(null)
  const [instructions, setInstructions] = useState('')
  const [model, setModel] = useState<string | null>(null)
  const [triggers, setTriggers] = useState<AutomationItem[]>([])
  const [tools, setTools] = useState<AutomationItem[]>(DEFAULT_TOOLS)
  const [tab, setTab] = useState<'settings' | 'history'>('settings')
  const [models, setModels] = useState<StudioModel[]>([])
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [githubConnected, setGithubConnected] = useState(false)
  const [installUrl, setInstallUrl] = useState(GITHUB_APP_INSTALL_URL)
  const [runs, setRuns] = useState<AutomationRun[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<null | 'repo' | 'trigger' | 'tool' | 'model'>(null)
  const [flyout, setFlyout] = useState<string | null>(null)
  const [mcpName, setMcpName] = useState('')
  const [mcpUrl, setMcpUrl] = useState('')
  const [manageMemories, setManageMemories] = useState(false)
  const [repoQuery, setRepoQuery] = useState('')
  const [triggerQuery, setTriggerQuery] = useState('')
  const [toolQuery, setToolQuery] = useState('')
  const [modelQuery, setModelQuery] = useState('')
  const [connectors, setConnectors] = useState<ConnectorRow[]>([])
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([])

  const selected = models.find((item) => item.id === model)

  function applyRow(row: AutomationRow) {
    setId(row.id)
    setTitle(row.title || 'Untitled')
    setActive(row.active)
    setRepoId(row.repo_id)
    setRepoName(row.repo_name)
    setInstructions(row.instructions || '')
    if (row.model) setModel(row.model)
    setTriggers(row.triggers || [])
    setTools(row.tools?.length ? row.tools : DEFAULT_TOOLS)
  }

  function refreshRepos() {
    return fetchGithubRepos()
      .then((data) => {
        setRepos(data.repos)
        setGithubConnected(data.connected)
        setInstallUrl(data.installUrl)
      })
      .catch(() => undefined)
  }

  function refreshConnected() {
    return Promise.all([
      fetchConnectors()
        .then((data) => setConnectors(data.connectors || []))
        .catch(() => undefined),
      fetchPlugins()
        .then((data) => setPlugins((data.installed || []).filter((item) => item.enabled !== false)))
        .catch(() => undefined),
    ])
  }

  useEffect(() => {
    fetchModels()
      .then((data) => {
        setModels(data.models)
        const firstReady = data.models.find((item) => item.ready)
        setModel((current) => current || firstReady?.id || data.models[0]?.id || null)
      })
      .catch(() => undefined)
    refreshRepos()
    refreshConnected()
    fetchAutomations()
      .then((list) => {
        const row = list[0]
        if (!row) return
        applyRow(row)
        return fetchAutomationRuns(row.id).then(setRuns)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    function onFocus() {
      refreshRepos()
      refreshConnected()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  useEffect(() => {
    if (!open) {
      setFlyout(null)
      setRepoQuery('')
      setTriggerQuery('')
      setModelQuery('')
      setMcpName('')
      setMcpUrl('')
    }
  }, [open])

  function payload() {
    return {
      title: title.trim() || 'Untitled',
      active,
      repoId,
      repoName,
      instructions,
      model,
      triggers,
      tools,
    }
  }

  async function persist() {
    if (triggers.length === 0) {
      setStatus('Add a trigger before saving.')
      return null
    }
    setBusy(true)
    setStatus('')
    try {
      let nextId = id
      if (!nextId) {
        const created = await createAutomation()
        nextId = created.id
        setId(created.id)
      }
      const saved = await saveAutomation(nextId, payload())
      applyRow(saved)
      const parts = [
        saved.repo_name || 'No repository',
        `${saved.triggers.length} trigger${saved.triggers.length === 1 ? '' : 's'}`,
        `${saved.tools.length} tool${saved.tools.length === 1 ? '' : 's'}`,
      ]
      setStatus(`Saved · ${parts.join(' · ')}`)
      return saved.id
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function onTest() {
    const savedId = await persist()
    if (!savedId) return
    setBusy(true)
    try {
      const connected = [
        repoName || 'No repository',
        triggers.map((item) => item.label).join(', ') || 'No trigger',
        tools.map((item) => item.label).join(', ') || 'No tools',
        selected ? modelLabel(selected, selected.name) : model || 'Default model',
      ].join(' · ')
      let detail = `Connected · ${connected}`
      if (model) {
        try {
          const result = await completeStudio(model, [
            {
              role: 'system',
              content: `You are a Soumtok automation named "${title || 'Untitled'}". Repository: ${repoName || 'none'}. Triggers: ${triggers.map((item) => item.label).join(', ') || 'none'}. Tools: ${tools.map((item) => item.label).join(', ') || 'none'}. Follow the saved instructions and confirm the setup is connected.`,
            },
            {
              role: 'user',
              content:
                instructions.trim() ||
                'Confirm this automation is connected and summarize what you will do on the next trigger.',
            },
          ])
          if (result.text) detail = `${detail}\n${result.text}`
        } catch (error) {
          detail = `${detail}\n${error instanceof Error ? error.message : 'Model test skipped'}`
        }
      }
      const run = await testAutomation(savedId, detail)
      setRuns((current) => [run, ...current])
      setTab('history')
      setStatus('Connected · test queued')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not test')
    } finally {
      setBusy(false)
    }
  }

  function addTrigger(type: string, label: string, value?: string, extra?: Record<string, string>) {
    const config: Record<string, string> = { ...extra }
    if (value) config.value = value
    if (type === 'webhook') config.token = uid()
    setTriggers((current) => [
      ...current,
      { id: uid(), type, label, config: Object.keys(config).length ? config : undefined },
    ])
    setOpen(null)
    setStatus('')
  }

  function toolAlreadyIn(extra?: Record<string, string>) {
    return tools.some((item) => {
      if (extra?.connectorId && item.config?.connectorId === extra.connectorId) return true
      if (extra?.url && item.config?.url === extra.url) return true
      return false
    })
  }

  function addTool(type: string, label: string, extra?: Record<string, string>) {
    if (type === 'memories' && tools.some((item) => item.type === 'memories')) return
    if (toolAlreadyIn(extra)) return
    setTools((current) => [...current, { id: uid(), type, label, config: extra }])
    setOpen(null)
    setFlyout(null)
    setMcpName('')
    setMcpUrl('')
  }

  async function connectGithub() {
    await signInSocial({ provider: 'github', callbackURL: '/dashboard/studio/automations' })
  }

  useEffect(() => {
    if (open !== 'tool' && open !== 'trigger') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(null)
        setFlyout(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const qTool = toolQuery.trim().toLowerCase()
  const visibleTriggers = [
    ...TRIGGER_KINDS,
    ...connectors.map((item) => ({
      type: `connector:${item.id}`,
      label: item.name,
      chevron: false,
      connector: item,
    })),
  ].filter((item) => item.label.toLowerCase().includes(triggerQuery.trim().toLowerCase()))
  const connectedMcps = [
    ...connectors.map((item) => {
      const mcp = item.last_check && 'mcp' in item.last_check ? item.last_check.mcp : null
      return {
        key: `connector:${item.id}`,
        group: 'Connectors' as const,
        type: 'mcp',
        label: item.name,
        url: item.mcp_url,
        pluginId: item.plugin_id,
        connectorId: item.id,
        hint: mcp?.tools.length ? `${mcp.tools.length} tools` : item.connected ? 'Connected' : item.mcp_url,
        extra: { url: item.mcp_url, connectorId: item.id, pluginId: item.plugin_id || '' },
      }
    }),
    ...plugins.flatMap((item) => {
      const servers = item.mcps?.length ? item.mcps : item.mcp_url ? [{ id: item.id, label: item.name, url: item.mcp_url, sourceUrl: '' }] : []
      return servers
        .filter((server) => !connectors.some((row) => row.mcp_url === server.url))
        .map((server) => ({
          key: `plugin:${item.id}:${server.id}`,
          group: 'MCP' as const,
          type: 'mcp',
          label: server.label || item.name,
          url: server.url,
          pluginId: item.plugin_id,
          connectorId: '',
          hint: 'From plugins',
          extra: { url: server.url, pluginId: item.plugin_id },
        }))
    }),
  ].filter((item) => {
    if (!qTool) return true
    return `${item.group} ${item.label} ${item.url} ${item.hint}`.toLowerCase().includes(qTool)
  })
  const showMemories = !qTool || 'memories built-in'.includes(qTool)
  const visibleRepos = repos.filter((repo) => {
    const q = repoQuery.trim().toLowerCase()
    if (!q) return true
    return `${repo.fullName} ${repo.name}`.toLowerCase().includes(q)
  })
  const recents = visibleRepos.slice(0, 6)
  const visibleModels = models.filter((item) => {
    const q = modelQuery.trim().toLowerCase()
    if (!q) return true
    return `${item.name} ${item.id}`.toLowerCase().includes(q)
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[720px] px-4 pb-20 pt-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-white/40">
              Automations <span className="mx-1 text-white/25">›</span> {title || 'Untitled'}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => persist()}
                className="rounded-lg px-3 py-1.5 text-[13px] text-white/80 hover:bg-white/[0.06]"
              >
                Save
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onTest}
                className="rounded-lg px-3 py-1.5 text-[13px] text-white/80 hover:bg-white/[0.06]"
              >
                Test
              </button>
            </div>
          </div>

          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-4 w-full bg-transparent text-[24px] font-medium tracking-[-0.04em] text-white outline-none placeholder:text-white/25 sm:text-[32px]"
            placeholder="Untitled"
          />

        <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px]">
          <button
            type="button"
            role="switch"
            aria-checked={active}
            onClick={() => setActive((value) => !value)}
            className="inline-flex items-center gap-2 text-white/70"
          >
            <span
              className={`relative h-[18px] w-[32px] rounded-full transition-colors ${
                active ? 'bg-[#f54e00]' : 'bg-white/15'
              }`}
            >
              <span
                className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-transform ${
                  active ? 'left-[16px]' : 'left-[2px]'
                }`}
              />
            </span>
            {active ? 'Active' : 'Inactive'}
          </button>

          <Menu
            open={open === 'repo'}
            onToggle={() => {
              const next = open === 'repo' ? null : 'repo'
              setOpen(next)
              if (next === 'repo') refreshRepos()
            }}
            onClose={() => setOpen(null)}
            width={320}
            trigger={
              <span className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-white/80 hover:bg-white/[0.05]">
                {repoName || 'Select repository'}
                <Chevron />
              </span>
            }
          >
            <SearchField value={repoQuery} onChange={setRepoQuery} placeholder="Search repositories..." />
            <p className="px-3 pb-1 pt-2 text-[11px] text-white/40">Recents</p>
            <button
              type="button"
              onClick={() => {
                setRepoId(null)
                setRepoName(null)
                setOpen(null)
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-white/[0.05]"
            >
              <HomeGlyph />
              No Repository
            </button>
            {recents.map((repo) => (
              <button
                key={repo.id}
                type="button"
                onClick={() => {
                  setRepoId(String(repo.id))
                  setRepoName(repo.fullName)
                  setOpen(null)
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-white/[0.05]"
              >
                <span className="truncate">{repo.fullName}</span>
                {repoId === String(repo.id) && <CheckGlyph />}
              </button>
            ))}
            {!githubConnected && recents.length === 0 && (
              <p className="px-3 py-2 text-[12px] text-white/40">No repositories yet.</p>
            )}
            <div className="mt-1 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => {
                  if (githubConnected) window.location.href = installUrl
                  else connectGithub()
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] hover:bg-white/[0.05]"
              >
                <GithubIcon />
                Connect GitHub
              </button>
            </div>
          </Menu>

          <span className="h-4 w-px bg-white/10" />
          <span className="text-white/40">By {authorName}</span>
        </div>

        <div className="mt-6 flex items-center gap-5 border-b border-white/[0.06]">
          <button
            type="button"
            onClick={() => setTab('settings')}
            className={`-mb-px border-b-2 pb-2 text-[13px] ${
              tab === 'settings' ? 'border-[#f54e00] text-white' : 'border-transparent text-white/45 hover:text-white/70'
            }`}
          >
            Settings
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`-mb-px border-b-2 pb-2 text-[13px] ${
              tab === 'history' ? 'border-[#f54e00] text-white' : 'border-transparent text-white/45 hover:text-white/70'
            }`}
          >
            Run History
          </button>
        </div>

        {tab === 'settings' ? (
          <div className="mt-8 space-y-8">
            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[13px] text-white/45">Triggers</p>
                <button
                  type="button"
                  onClick={() => {
                    setTriggerQuery('')
                    setFlyout(null)
                    setOpen('trigger')
                    refreshConnected()
                  }}
                  className="text-[13px] text-white/70 hover:text-white"
                >
                  + Add
                </button>
              </div>
              <div className="space-y-2">
                {triggers.map((item) => (
                  <RowCard
                    key={item.id}
                    icon={<ToolGlyph type={item.type} pluginId={item.config?.pluginId} />}
                    label={item.label}
                    hint={
                      item.type === 'webhook' && item.config?.token
                        ? `${window.location.origin}/api/automations/hook/${item.config.token}`
                        : item.config?.url
                    }
                    onRemove={() => setTriggers((current) => current.filter((row) => row.id !== item.id))}
                  />
                ))}
                {triggers.length === 0 && (
                  <p className="text-[13px] text-white/35">No triggers yet.</p>
                )}
              </div>
            </section>

            <section>
              <p className="mb-2 text-[13px] text-white/45">Agent Instructions</p>
              <div className="rounded-xl border border-white/10 bg-[#141413] px-4 pb-3 pt-3">
                <textarea
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  rows={7}
                  placeholder="Type @ for tools, / for commands..."
                  className="min-h-[140px] w-full resize-none bg-transparent text-[14px] leading-6 outline-none placeholder:text-white/32"
                />
                <Menu
                  open={open === 'model'}
                  onToggle={() => setOpen(open === 'model' ? null : 'model')}
                  onClose={() => setOpen(null)}
                  width={280}
                  trigger={
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/80">
                      {modelLabel(selected, 'Choose model')}
                      <Chevron />
                    </span>
                  }
                >
                  <SearchField value={modelQuery} onChange={setModelQuery} placeholder="Search models" />
                  <div className="thin-scroll max-h-[240px] overflow-y-auto py-1">
                    {visibleModels.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={!item.ready}
                        onClick={() => {
                          setModel(item.id)
                          setOpen(null)
                        }}
                        className="flex w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-white/[0.05] disabled:opacity-35"
                      >
                        <span className="truncate text-[13px]">{item.name}</span>
                        <span className="text-[12px] text-white/35">{modelCaps(item).join(' ')}</span>
                      </button>
                    ))}
                  </div>
                </Menu>
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[13px] text-white/45">Tools</p>
                <button
                  type="button"
                  onClick={() => {
                    setToolQuery('')
                    setFlyout(null)
                    setOpen('tool')
                    refreshConnected()
                  }}
                  className="text-[13px] text-white/70 hover:text-white"
                >
                  + Add
                </button>
              </div>
              <div className="space-y-2">
                {tools.map((item) => (
                  <RowCard
                    key={item.id}
                    icon={<ToolGlyph type={item.type} pluginId={item.config?.pluginId} />}
                    label={item.label}
                    hint={item.config?.url}
                    action={
                      item.type === 'memories' ? (
                        <button
                          type="button"
                          onClick={() => setManageMemories(true)}
                          className="rounded-lg bg-white/[0.08] px-2.5 py-1 text-[12px] text-white/80"
                        >
                          Manage
                        </button>
                      ) : undefined
                    }
                    onRemove={() => setTools((current) => current.filter((row) => row.id !== item.id))}
                  />
                ))}
                {tools.length === 0 && <p className="text-[13px] text-white/35">No tools yet.</p>}
              </div>
            </section>
          </div>
        ) : (
          <div className="mt-8">
            {runs.length === 0 ? (
              <p className="text-[14px] text-white/40">No runs yet. Save with a trigger, then press Test.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-white/10">
                {runs.map((run) => (
                  <div key={run.id} className="flex items-start justify-between gap-4 border-t border-white/[0.06] px-4 py-3 first:border-t-0">
                    <div className="min-w-0">
                      <p className="whitespace-pre-wrap text-[13px] leading-5">{run.detail || 'Run'}</p>
                      <p className="text-[12px] text-white/40">{new Date(run.created_at).toLocaleString()}</p>
                    </div>
                    <span className="text-[12px] capitalize text-white/50">{run.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {triggers.length === 0 && tab === 'settings' && (
          <p className="mt-10 text-[13px] text-[#f5a524]">⚠ Add a trigger before saving.</p>
        )}
        {status && triggers.length > 0 && <p className="mt-8 text-[13px] text-white/45">{status}</p>}
        {status && triggers.length === 0 && status !== 'Add a trigger before saving.' && (
          <p className="mt-3 text-[13px] text-white/45">{status}</p>
        )}
        </div>
      </div>

      {open === 'trigger' && (
        <PickerModal
          title="Add trigger"
          onClose={() => {
            setOpen(null)
            setFlyout(null)
          }}
        >
          <SearchField value={triggerQuery} onChange={setTriggerQuery} placeholder="Search triggers" />
          <div className="thin-scroll max-h-[360px] overflow-y-auto py-1">
            {visibleTriggers.map((item) => (
              <div key={item.type}>
                <button
                  type="button"
                  onClick={() => {
                    if ('connector' in item && item.connector) {
                      addTrigger(item.type, item.label, undefined, {
                        connectorId: item.connector.id,
                        url: item.connector.mcp_url,
                        pluginId: item.connector.plugin_id || '',
                      })
                      return
                    }
                    if (!item.chevron) addTrigger(item.type, item.label)
                    else setFlyout(flyout === item.type ? null : item.type)
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-white/[0.05]"
                >
                  <ToolGlyph
                    type={item.type}
                    pluginId={'connector' in item ? item.connector?.plugin_id || undefined : undefined}
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.chevron && <RightChevron />}
                </button>
                {flyout === item.type && TRIGGER_OPTIONS[item.type] && (
                  <div className="mb-1 ml-8 mr-2 rounded-lg bg-white/[0.04] py-1">
                    {TRIGGER_OPTIONS[item.type].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => addTrigger(item.type, `${item.label} - ${option.label}`, option.value)}
                        className="block w-full px-3 py-2 text-left text-[13px] text-white/80 hover:bg-white/[0.05]"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </PickerModal>
      )}

      {open === 'tool' && (
        <PickerModal
          title="Add tool"
          onClose={() => {
            setOpen(null)
            setFlyout(null)
          }}
        >
          <SearchField value={toolQuery} onChange={setToolQuery} placeholder="Search tools" />
          <div className="thin-scroll max-h-[360px] overflow-y-auto py-1">
            {showMemories && (
              <div className="py-1">
                <p className="px-3 pb-1 pt-1.5 text-[11px] text-white/40">Built-in</p>
                <button
                  type="button"
                  onClick={() => {
                    if (!tools.some((tool) => tool.type === 'memories')) addTool('memories', 'Memories')
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-white/[0.05]"
                >
                  <ToolGlyph type="memories" />
                  <span className="flex-1">Memories</span>
                  {tools.some((tool) => tool.type === 'memories') && (
                    <span className="text-[12px] text-white/35">Added</span>
                  )}
                </button>
              </div>
            )}
            {(['Connectors', 'MCP'] as const).map((group) => {
              const rows = connectedMcps.filter((item) => item.group === group)
              if (rows.length === 0 && qTool) return null
              return (
                <div key={group} className="py-1">
                  <p className="px-3 pb-1 pt-1.5 text-[11px] text-white/40">{group}</p>
                  {rows.length === 0 && (
                    <p className="px-3 py-2 text-[13px] leading-5 text-white/40">
                      {group === 'Connectors'
                        ? 'None connected yet. Open Connectors to add one.'
                        : 'No MCP from plugins yet.'}
                    </p>
                  )}
                  {rows.map((item) => {
                    const added = toolAlreadyIn(item.extra)
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          if (!added) addTool('mcp', item.label, item.extra)
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-white/[0.05]"
                      >
                        <ToolGlyph type="mcp" pluginId={item.pluginId || undefined} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{item.label}</span>
                          <span className="block truncate text-[11px] text-white/35">{item.hint}</span>
                        </span>
                        {added ? (
                          <span className="text-[12px] text-white/35">Added</span>
                        ) : (
                          <span className="text-[12px] text-white/35">Connected</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
            <div className="py-1">
              <p className="px-3 pb-1 pt-1.5 text-[11px] text-white/40">Custom MCP</p>
              <button
                type="button"
                onClick={() => setFlyout(flyout === 'mcp' ? null : 'mcp')}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-white/[0.05]"
              >
                <ToolGlyph type="mcp" />
                <span className="flex-1">MCP Server</span>
                <RightChevron />
              </button>
              {flyout === 'mcp' && (
                <div className="mx-3 mb-2 rounded-lg bg-white/[0.04] p-3">
                  <input
                    value={mcpName}
                    onChange={(event) => setMcpName(event.target.value)}
                    placeholder="Server name"
                    className="mb-2 w-full rounded-lg bg-white/[0.06] px-2.5 py-2 text-[13px] outline-none placeholder:text-white/35"
                  />
                  <input
                    value={mcpUrl}
                    onChange={(event) => setMcpUrl(event.target.value)}
                    placeholder="https://mcp.example.com"
                    className="mb-3 w-full rounded-lg bg-white/[0.06] px-2.5 py-2 text-[13px] outline-none placeholder:text-white/35"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const name = mcpName.trim() || 'MCP Server'
                      const url = mcpUrl.trim()
                      if (!url) return
                      addTool('mcp', name, { url })
                    }}
                    className="w-full rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-black"
                  >
                    Add server
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(null)
                navigate('/dashboard/connectors')
              }}
              className="mx-3 mb-2 mt-1 w-[calc(100%-24px)] rounded-lg border border-white/10 px-3 py-1.5 text-[13px] text-white/70 hover:bg-white/[0.05]"
            >
              Open Connectors
            </button>
          </div>
        </PickerModal>
      )}

      {manageMemories && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4" onClick={() => setManageMemories(false)}>
          <div
            className="w-full max-w-[400px] rounded-xl border border-white/10 bg-[#1b1b19] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[16px] font-medium">Memories</p>
            <p className="mt-2 text-[13px] leading-6 text-white/55">
              This automation can remember facts from earlier runs and use them the next time it works on your repo.
            </p>
            <button
              type="button"
              onClick={() => setManageMemories(false)}
              className="mt-5 rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-black"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PickerModal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="relative w-full max-w-[420px] overflow-hidden rounded-2xl border border-white/10 bg-[#141413] py-2 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center text-[20px] leading-none text-white/45 hover:text-white"
        >
          ×
        </button>
        <p className="px-4 pb-1 pt-3 text-[16px] font-medium">{title}</p>
        {children}
      </div>
    </div>
  )
}

function Menu({
  open,
  onToggle,
  onClose,
  trigger,
  children,
  width,
  align,
}: {
  open: boolean
  onToggle: () => void
  onClose: () => void
  trigger: ReactNode
  children: ReactNode
  width: number
  align?: 'stretch'
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <div ref={ref} className={`relative ${align === 'stretch' ? 'block w-full' : 'inline-block'}`}>
      <button type="button" onClick={onToggle} className={align === 'stretch' ? 'block w-full' : ''}>
        {trigger}
      </button>
      {open && (
        <div
          className="account-menu absolute top-[calc(100%+8px)] left-0 z-40 overflow-visible rounded-xl border border-white/10 bg-[#1b1b19] py-2 shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
          style={{ width }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="mx-2 mb-1 flex items-center gap-2 rounded-lg bg-white/[0.06] px-2.5 py-2">
      <span className="text-white/40">
        <SearchIcon />
      </span>
      <input
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-[13px] outline-none placeholder:text-white/40"
      />
    </label>
  )
}

function RowCard({
  icon,
  label,
  hint,
  action,
  onRemove,
}: {
  icon: ReactNode
  label: string
  hint?: string
  action?: ReactNode
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#141413] px-3 py-2.5">
      <span className="text-white/70">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px]">{label}</span>
        {hint && <span className="block truncate text-[11px] text-white/35">{hint}</span>}
      </span>
      {action}
      <button type="button" aria-label="Remove" onClick={onRemove} className="grid h-8 w-8 place-items-center text-white/40 hover:text-white">
        <TrashGlyph />
      </button>
    </div>
  )
}

function Chevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden className="text-white/45">
      <path d="M2 3.6 5 6.6 8 3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RightChevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden className="text-white/35">
      <path d="M3.4 2 6.4 5 3.4 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 7.2 5.7 10 11 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function HomeGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2.6 7.2 8 2.8l5.4 4.4V13a1 1 0 0 1-1 1H3.6a1 1 0 0 1-1-1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

function TrashGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3.4 4.4h9.2M6.2 4.4V3.2h3.6v1.2M4.6 4.4l.5 8.2h5.8l.5-8.2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

function TriggerGlyph({ type }: { type: string }) {
  if (type === 'scheduled') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="5.4" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 5.2V8l2 1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }
  if (type === 'slack' || type === 'slack-send' || type === 'slack-read') return <SlackGlyph />
  if (type === 'teams' || type === 'teams-send' || type === 'teams-read') return <TeamsGlyph />
  if (type === 'sentry') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M3 12.2 8 3.6l5 8.6H3Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === 'linear') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="5.2" stroke="currentColor" strokeWidth="1.3" />
        <path d="M4.4 8h7.2M8 4.4v7.2" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    )
  }
  if (type === 'webhook') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M5.2 7.2h5.6M6.4 5V3.6h3.2V5M6.4 11v1.4h3.2V11M4 7.2v1.6a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }
  if (type === 'pagerduty') {
    return (
      <span className="grid h-4 w-4 place-items-center rounded-[3px] bg-white/15 text-[10px] font-semibold">P</span>
    )
  }
  return <span className="grid h-4 w-4 place-items-center text-[11px]">+</span>
}

function ToolGlyph({ type, pluginId }: { type: string; pluginId?: string }) {
  if (pluginId) return <PluginLogo id={pluginId} className="h-4 w-4" />
  if (type === 'memories') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="5" cy="6.2" r="1.6" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="11" cy="6.2" r="1.6" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="8" cy="10.4" r="1.6" stroke="currentColor" strokeWidth="1.2" />
        <path d="M6.2 7 7 9.2M9.8 7 9 9.2" stroke="currentColor" strokeWidth="1.1" />
      </svg>
    )
  }
  if (type === 'mcp') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M8 2.4 13.2 8 8 13.6 2.8 8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    )
  }
  return <TriggerGlyph type={type} />
}

function SlackGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect x="6.1" y="1.6" width="2.1" height="4.4" rx="1" fill="#E01E5A" />
      <rect x="10" y="6.1" width="4.4" height="2.1" rx="1" fill="#36C5F0" />
      <rect x="7.8" y="10" width="2.1" height="4.4" rx="1" fill="#2EB67D" />
      <rect x="1.6" y="7.8" width="4.4" height="2.1" rx="1" fill="#ECB22E" />
    </svg>
  )
}

function TeamsGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect x="2.2" y="4.2" width="7.4" height="7.6" rx="1.4" fill="#5B5FC7" />
      <circle cx="12" cy="5.4" r="1.6" fill="#7B83EB" />
      <rect x="10.4" y="7.4" width="3.4" height="4.2" rx="1.2" fill="#7B83EB" />
    </svg>
  )
}
