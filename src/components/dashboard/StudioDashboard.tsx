import { useEffect, useRef, useState, type DragEvent, type FormEvent, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  addConnector,
  addPlugin,
  connectConnector,
  fetchConnectors,
  startConnect,
  pollConnectDevice,
  fetchGithubRepos,
  fetchModels,
  fetchPlugins,
  fetchSkills,
  fetchStudioProject,
  fetchStudioProjects,
  saveStudioProject,
  streamStudio,
  studioCommitRepo,
  studioOpenPull,
  studioFetchPages,
  studioMcpCall,
  studioRunCommand,
  studioCloneRepo,
  studioToolContext,
  createDocument,
  uploadSkill,
  type ConnectorRow,
  type GithubRepo,
  type InstalledPlugin,
  type Profile,
  type StudioProject,
  type UserSkill,
} from '../../lib/api'
import { catalogPlugin, PLUGIN_CATALOG, skillTitle } from '../../../shared/plugins'
import { connectorLoginUrl } from '../../../shared/connectors'
import { catalogConnectTargets } from '../../../shared/connectLinks'
import {
  applyBrandLogo,
  brandLogoContext,
  brandLogoFetchUrls,
  brandFromPrompt,
  isLogoOnlyAsk,
  svgFromFetchedPages,
  wantsBrandAsset,
} from '../../../shared/brandLogo'
import { readStoredAgentDriver, soumtokBotStudioContext, writeStoredAgentDriver, type AgentDriver } from '../../../shared/soumtokBot'
import { DEFAULT_DESKTOP_AGENT_PREFS } from '../../../shared/desktopAgentPrefs'
import { analyzeUserRequest, formatAnalyzedRequest, repairUserText } from '../../../shared/requestAnalyze'
import {
  defaultWorkbenchTab,
  emptyWorkspace,
  executeSystemPrompt,
  classifyFollowUp,
  inferPlan,
  mergeWorkspace,
  normalizeWorkspace,
  parseAgentRun,
  kickoffEvents,
  liveWorkspaceFromStream,
  absorbFiles,
  attachChangeDiffs,
  previewFromFiles,
  withChangeDiffs,
  codeForRequest,
  isFollowUpTask,
  planUsesCodingAgent,
  eventsForMode,
  applyNameChangeFromThread,
  nameChangeIsOnlyAsk,
  workspaceDelivered,
  workspaceNeedsHeal,
  codeWritten,
  historyForModel,
  threadMemory,
  spokenRecap,
  chatReplyFromRun,
  finishChatReply,
  runTemperature,
  outputBudget,
  isAskReply,
  promptWithAttachments,
  formatAskReply,
  formatSkipAsk,
  formatApprovePlan,
  applyAskAnswers,
  applyPlanApproval,
  applyDiffDecision,
  followUpPrompts,
  latestOpenAsk,
  latestOpenPlan,
  looksLikeAskHandoff,
  restoreAskEvent,
  visibleWorkEvents,
  visibleWorkPaths,
  type AgentPlan,
  type AgentRunMode,
  type AgentWorkspace,
} from '../../../shared/agent'
import {
  applySlash,
  buildCapabilityAsk,
  ensureFolder,
  extractUrls,
  matchMcp,
  matchSkills,
  needsWeb,
  platformBrief,
  slashMatch,
  PROMPT_COMMANDS,
} from '../../../shared/capabilities'
import { liveStepLabel } from '../../../shared/toolFeed'
import { liveProgressStep, toolResultLine } from '../../../shared/tools'
import { friendlyStreamError, isTransientStreamError } from '../../../shared/streamDrop'
import { checkoutPath } from '../../../shared/plans'
import { AUTO_MODEL_ID, CODING_MODELS, isAutoModel, modelGuide, pickAutoModel, sortModelsByPower } from '../../../shared/models'
import { mediaGap, modelMedia, slimChatFiles, type ChatFile } from '../../../shared/chatMedia'
import {
  ensureEnvFiles,
  isSecretPath,
  redactChatFiles,
  redactSecrets,
  scanSecrets,
  securityEvent,
  securityReply,
} from '../../../shared/secretsGuard'
import { hydrateSecretFiles, splitSecretFiles, saveLocalSecrets } from '../../lib/studioSecrets'
import {
  dropHasFiles,
  filesFromDrop,
  forgetChatFile,
  filesFromClipboard,
  pasteBelongsToField,
  readChatFiles,
  settleChatFile,
  settleChatFiles,
  stageChatFile,
  takeChatFiles,
} from '../../lib/chatFiles'
import { runStudioAgentHarness } from '../../lib/studioAgentHarness'
import { ReplyMarkdown } from '../../lib/replyText'
import { signIn } from '../../lib/auth-client'
import { navigate, openTab } from '../../lib/nav'
import { BrandMark } from '../ui'
import { PluginLogo } from './PluginLogos'
import { AgentTimeline } from './AgentTimeline'
import { AgentLiveCard } from './AskCards'
import { AgentWorkbench, type BenchTab } from './AgentWorkbench'
import { AccountMenu } from './AccountMenu'
import { SoumtokBotChatHeader, SoumtokBotComposer, SoumtokBotOnboarding } from './SoumtokBotShell'
import { TestHubPanel } from './TestHubPanel'
import {
  AutomationsIcon,
  BookIcon,
  CodebaseIcon,
  ComposeIcon,
  HomeIcon,
  MicIcon,
  MultitaskIcon,
  NewChatIcon,
  PaperclipIcon,
  SearchIcon,
  SidebarIcon,
  StackIcon,
} from './icons'

type StudioMessage = {
  role: 'user' | 'assistant' | 'log'
  content: string
  files?: ChatFile[]
  elapsed?: number
  picked?: string
}

type StudioView = 'chat' | 'test-hub' | 'codebase'
type StudioModel = {
  id: string
  name: string
  strength: string
  cost: string
  keys: string
  tags?: string[]
  ready: boolean
  media?: { image: boolean; video: boolean; pdf: boolean }
}

function modelCaps(item: Pick<StudioModel, 'id' | 'name' | 'cost'>): string[] {
  const hay = `${item.id} ${item.name}`.toLowerCase()
  const fast = /flash|nano|mini|lite|fast|haiku/.test(hay)
  const high = /pro|opus|fable|astra|o1|o3|codex|reasoning/.test(hay)
  if (item.cost === 'Highest' || item.cost === 'High') return ['Premium']
  if (item.id === 'grok-4.6' || (high && fast)) return ['High', 'Fast']
  if (high || item.cost === 'Higher') return ['High']
  if (fast || item.cost === 'Cheap' || item.cost === 'Cheapest' || item.cost === 'Low' || item.cost === 'Free') {
    return ['Fast']
  }
  return ['Medium']
}

function waitMs(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const timer = window.setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

function modelTriggerLabel(item: Pick<StudioModel, 'id' | 'name' | 'cost'> | undefined, fallback: string) {
  if (!item) return fallback
  if (isAutoModel(item.id)) return 'Auto'
  const cap = modelCaps(item)[0]
  return cap ? `${item.name} ${cap}` : item.name
}

function studioView(path: string): StudioView {
  if (path.startsWith('/dashboard/studio/automations') || path.startsWith('/dashboard/studio/test-hub')) return 'test-hub'
  if (path.startsWith('/dashboard/studio/codebase')) return 'codebase'
  return 'chat'
}

function studioChatId(path: string) {
  const rest = path.replace(/^\/dashboard\/studio\/?/, '')
  const id = rest.split(/[/?#]/)[0]
  if (!id || id === 'automations' || id === 'test-hub' || id === 'codebase') return null
  return id
}

function projectGroup(iso: string) {
  const day = new Date(iso)
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const then = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()
  if (then === start) return 'Today'
  if (then === start - 86400000) return 'Yesterday'
  return 'Earlier'
}

export function StudioDashboard({
  profile,
  path,
  displayName,
  onDownload,
  onProfileSaved,
}: {
  profile: Profile | null
  path: string
  displayName: string
  onDownload?: () => void
  onProfileSaved?: () => void
}) {
  const view = studioView(path)
  const chatId = studioChatId(path)
  const [collapsed, setCollapsed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [chatNonce, setChatNonce] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [projects, setProjects] = useState<StudioProject[]>([])
  const [projectsReady, setProjectsReady] = useState(false)
  const [agentDriver, setAgentDriver] = useState<AgentDriver>(() => readStoredAgentDriver())
  const setStudioAgentDriver = (driver: AgentDriver) => {
    setAgentDriver(driver)
    writeStoredAgentDriver(driver)
  }

  function goChat(fresh = false) {
    if (fresh) setChatNonce((n) => n + 1)
    navigate('/dashboard/studio')
    setMobileOpen(false)
  }

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  useEffect(() => {
    const onDriver = (event: Event) => {
      const next = (event as CustomEvent<AgentDriver>).detail
      if (next === 'ide' || next === 'bot') setAgentDriver(next)
    }
    window.addEventListener('soumtok-agent-driver', onDriver)
    return () => window.removeEventListener('soumtok-agent-driver', onDriver)
  }, [])

  useEffect(() => {
    const giveUp = window.setTimeout(() => setProjectsReady(true), 5000)
    fetchStudioProjects()
      .then((data) => setProjects(data.projects))
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(giveUp)
        setProjectsReady(true)
      })
    return () => window.clearTimeout(giveUp)
  }, [])

  function upsertProject(row: StudioProject) {
    const listed = {
      ...row,
      codeLines: row.codeLines || codeWritten(row.workspace),
      workspace: undefined,
      messages: [],
    }
    setProjects((current) => [listed, ...current.filter((item) => item.id !== row.id)].sort((a, b) =>
      String(b.updatedAt).localeCompare(String(a.updatedAt)),
    ))
    if (!chatId && row.id) {
      window.history.replaceState({}, '', `/dashboard/studio/${row.id}`)
    }
  }

  return (
    <div className="theme-app flex h-svh overflow-hidden">
      <aside
        className={`sticky top-0 z-30 hidden h-svh shrink-0 flex-col border-r border-white/[0.05] py-3 lg:flex ${
          collapsed ? 'w-[64px] px-2' : 'w-[248px] px-3'
        }`}
      >
        <div className={`dash-aside-head mb-3 flex items-center gap-1 ${collapsed ? 'flex-col' : ''}`}>
          <button
            type="button"
            className={`min-w-0 ${collapsed ? '' : 'mr-auto px-1.5'}`}
            aria-label="Soumtok"
            onClick={() => navigate('/dashboard')}
          >
            {collapsed ? (
              <BrandMark className="h-7 w-auto" />
            ) : (
              <img
                src="/images/soumtok-lockup.png"
                alt="Soumtok"
                className="brand-logo h-8 w-auto max-w-[168px] select-none object-contain object-left"
                draggable={false}
              />
            )}
          </button>
          <button
            type="button"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-white/45 hover:bg-white/[0.06] hover:text-white"
            aria-label={collapsed ? 'Open sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed((value) => !value)}
          >
            <SidebarIcon />
          </button>
          <button
            type="button"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-white/45 hover:bg-white/[0.06] hover:text-white"
            aria-label="Search"
            onClick={() => setSearchOpen(true)}
          >
            <SearchIcon />
          </button>
        </div>

        <nav className="space-y-0.5">
          <StudioNavButton
            icon={<NewChatIcon />}
            label="New Chat"
            active={view === 'chat'}
            collapsed={collapsed}
            onClick={() => goChat(true)}
          />
          <StudioNavButton
            icon={<StackIcon />}
            label="Test Hub"
            active={view === 'test-hub'}
            collapsed={collapsed}
            onClick={() => {
              navigate('/dashboard/studio/test-hub')
              setMobileOpen(false)
            }}
          />
          <StudioNavButton
            icon={<CodebaseIcon />}
            label="Codebase"
            badge="Early Beta"
            active={view === 'codebase'}
            collapsed={collapsed}
            onClick={() => {
              navigate('/dashboard/studio/codebase')
              setMobileOpen(false)
            }}
          />
          <StudioNavButton
            icon={<HomeIcon />}
            label="Dashboard"
            collapsed={collapsed}
            onClick={() => navigate('/dashboard')}
          />
        </nav>

        {!collapsed && (
          <div className="mt-7 min-h-0 flex-1 overflow-y-auto">
            {!projectsReady ? (
              <div className="grid place-items-center py-10" role="status" aria-live="polite">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-white/70" />
                <span className="sr-only">Loading projects</span>
              </div>
            ) : (
              <>
            {(['Today', 'Yesterday', 'Earlier'] as const).map((group) => {
              const rows = projects.filter((item) => projectGroup(String(item.updatedAt)) === group)
              if (rows.length === 0) return null
              return (
                <div key={group} className="mb-4">
                  <p className="mb-1 px-2 text-[12px] text-white/35">{group}</p>
                  {rows.map((item) => {
                    const lines = item.codeLines || codeWritten(item.workspace)
                    return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        navigate(`/dashboard/studio/${item.id}`)
                        setMobileOpen(false)
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] ${
                        chatId === item.id ? 'bg-white/[0.08] text-white' : 'text-white/55 hover:bg-white/[0.04] hover:text-white'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{item.title || 'New chat'}</span>
                      {lines > 0 && (
                        <span className="shrink-0 font-mono text-[12px] text-[#3fb950]">+{lines}</span>
                      )}
                    </button>
                    )
                  })}
                </div>
              )
            })}
            {projects.length === 0 && <p className="px-2 text-[13px] text-white/30">No projects yet</p>}
              </>
            )}
          </div>
        )}
        {collapsed && <div className="flex-1" />}

        <AccountMenu
          name={displayName}
          plan={profile?.plan}
          username={profile?.username}
          hasAvatar={profile?.hasAvatar}
          collapsed={collapsed}
          onDownload={onDownload}
          onProfileSaved={onProfileSaved}
          agentDriver={agentDriver}
          onAgentDriverChange={setStudioAgentDriver}
        />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-white/[0.05] px-4 py-3 lg:hidden">
          <button type="button" aria-label="Soumtok" onClick={() => navigate('/dashboard')}>
            <img
              src="/images/soumtok-lockup.png"
              alt="Soumtok"
              className="brand-logo h-6 w-auto max-w-[140px] select-none object-contain"
              draggable={false}
            />
          </button>
          <div className="flex items-center gap-3">
            <button type="button" className="text-[13px] text-white/60" onClick={() => setMobileOpen((open) => !open)}>
              Menu
            </button>
            <button type="button" className="text-[13px] text-white/60" onClick={() => setSearchOpen(true)}>
              Search
            </button>
          </div>
        </header>
        {mobileOpen && (
          <div className="mobile-drawer lg:hidden">
            <button type="button" className="absolute inset-0 bg-black/55" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
            <div className="mobile-drawer-panel px-3">
              <p className="px-2.5 pb-3 text-[12px] text-white/35">Studio</p>
              <nav className="thin-scroll min-h-0 flex-1 overflow-y-auto">
                <button type="button" className="block w-full rounded-md px-2.5 py-2.5 text-left text-[14px] text-white/80" onClick={() => goChat(true)}>
                  New Chat
                </button>
                <button
                  type="button"
                  className="block w-full rounded-md px-2.5 py-2.5 text-left text-[14px] text-white/80"
                  onClick={() => {
                    navigate('/dashboard/studio/test-hub')
                    setMobileOpen(false)
                  }}
                >
                  Test Hub
                </button>
                <button
                  type="button"
                  className="block w-full rounded-md px-2.5 py-2.5 text-left text-[14px] text-white/80"
                  onClick={() => {
                    navigate('/dashboard/studio/codebase')
                    setMobileOpen(false)
                  }}
                >
                  Codebase
                </button>
                <button
                  type="button"
                  className="block w-full rounded-md px-2.5 py-2.5 text-left text-[14px] text-white/80"
                  onClick={() => navigate('/dashboard')}
                >
                  Dashboard
                </button>
              </nav>
              <div className="border-t border-white/[0.06] pt-2">
                <AccountMenu
                  name={displayName}
                  plan={profile?.plan}
                  username={profile?.username}
                  hasAvatar={profile?.hasAvatar}
                  onDownload={onDownload}
                  onProfileSaved={onProfileSaved}
                  agentDriver={agentDriver}
                  onAgentDriverChange={setStudioAgentDriver}
                />
              </div>
            </div>
          </div>
        )}

        {view === 'chat' && (
          <StudioChat
            key={chatId || `new-${chatNonce}`}
            initialId={chatId}
            onSaved={upsertProject}
            plan={profile?.plan}
            agentDriver={agentDriver}
          />
        )}
        {view === 'test-hub' && <TestHubPanel />}
        {view === 'codebase' && <StudioCodebase />}
      </div>

      {searchOpen && (
        <StudioSearch
          projects={projects}
          onClose={() => setSearchOpen(false)}
          onPick={(href) => {
            setSearchOpen(false)
            if (href === '/dashboard/studio') goChat(true)
            else navigate(href)
          }}
        />
      )}
    </div>
  )
}

function StudioNavButton({
  icon,
  label,
  badge,
  active,
  collapsed,
  onClick,
}: {
  icon: ReactNode
  label: string
  badge?: string
  active?: boolean
  collapsed: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`dash-nav-item flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] ${
        active ? 'is-active bg-white/[0.08] text-white' : 'text-white/55 hover:bg-white/[0.04] hover:text-white'
      } ${collapsed ? 'justify-center' : ''}`}
    >
      <span className={`dash-nav-icon ${active ? 'text-white' : 'text-white/40'}`}>{icon}</span>
      {!collapsed && (
        <span className="flex min-w-0 items-center gap-2">
          {label}
          {badge && <span className="text-[11px] text-white/30">{badge}</span>}
        </span>
      )}
    </button>
  )
}

function StudioCodebase() {
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [connected, setConnected] = useState(false)
  const [installUrl, setInstallUrl] = useState('https://github.com/apps/soumtok/installations/new')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchGithubRepos()
      .then((data) => {
        setRepos(data.repos)
        setConnected(data.connected)
        setInstallUrl(data.installUrl)
      })
      .catch(() => setStatus('Could not load GitHub projects.'))
  }, [])

  async function getStarted() {
    if (!connected) {
      setBusy(true)
      try {
        await signIn.social({ provider: 'github', callbackURL: '/dashboard/studio/codebase' })
      } catch {
        setBusy(false)
      }
      return
    }
    if (repos.length === 0) {
      window.location.href = installUrl
      return
    }
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function openRepo(repo: GithubRepo) {
    sessionStorage.setItem('soumtok-project', JSON.stringify(repo))
    navigate('/dashboard/studio')
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-10 md:px-12 md:py-14">
      <div className="mx-auto max-w-[1040px]">
        <h1 className="text-[32px] font-medium tracking-[-0.04em]">Codebase</h1>
        <p className="mt-2 text-[15px] text-white/45">Create and browse your Soumtok repositories.</p>

        <div className="mt-10 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141413] lg:grid lg:grid-cols-2">
          <div className="relative min-h-[340px] overflow-hidden bg-[#10100f] p-6 md:min-h-[400px] md:p-8">
            <div className="relative flex h-full items-center justify-center">
              <div className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-[#161614]/92 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-md">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#2ea043] px-2 py-0.5 text-[11px] font-medium text-white">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                    <path d="M3.2 7.2V2.8M3.2 2.8A1.4 1.4 0 1 0 3.2 0M6.8 2.8v4.4M6.8 7.2A1.4 1.4 0 1 0 6.8 10" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                  Open
                </span>
                <p className="mt-2 text-[14px] font-medium leading-5 text-white">
                  feat(soumtok): faster clones, cloud agents, and automations #206
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px] text-white/55">
                  <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-white/75">main</span>
                  <span>←</span>
                  <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-white/75">origin/get-started</span>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/8 text-white/60">···</span>
                  <span className="flex-1 rounded-lg bg-white/10 py-1.5 text-center text-[13px] text-white/80">Approve</span>
                  <span className="flex-1 rounded-lg bg-[#3fb950] py-1.5 text-center text-[13px] font-medium text-[#0b1f0e]">
                    Merge
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-white/[0.07] pt-3 text-[12px] text-white/45">
                  <span className="inline-flex items-center gap-1.5">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                      <path d="M2.2 2.8h8.6v6.2H6.2L3.8 11V9H2.2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                    </svg>
                    6
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                      <circle cx="6.5" cy="6.5" r="2" stroke="currentColor" strokeWidth="1.3" />
                      <path d="M6.5 1.6v2.2M6.5 9.2v2.2" stroke="currentColor" strokeWidth="1.3" />
                    </svg>
                    2
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[#e3b341]">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                      <path d="M6.5 2.2 11.4 11H1.6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                    </svg>
                    26/27
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                      <rect x="2.4" y="2.2" width="8.2" height="8.6" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
                    </svg>
                    1
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-center px-6 py-8 md:px-10">
            <h2 className="text-[22px] font-medium tracking-[-0.03em]">Browse your repos on Soumtok</h2>
            <ul className="mt-5 space-y-3 text-[14px] leading-6 text-white/70">
              {[
                'GitHub stays the source of truth for your data',
                'Faster clones, cloud agents, and automations',
                'Browse your repos and review PRs in Studio',
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#2ea043]" />
                  {item}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={getStarted}
              disabled={busy}
              className="mt-8 inline-flex w-fit items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-medium text-black hover:bg-[#f2f2f0] disabled:opacity-50"
            >
              {busy ? 'Connecting…' : 'Get Started'}
              <span aria-hidden>→</span>
            </button>
            <button
              type="button"
              onClick={() => openTab('/docs/codebase')}
              className="mt-3 w-fit text-[13px] text-white/40 hover:text-white"
            >
              Learn More
            </button>
          </div>
        </div>

        <div ref={listRef} className="mt-10">
          {status && <p className="text-[13px] text-white/40">{status}</p>}
          {repos.length > 0 && (
            <>
              <p className="mb-3 text-[12px] uppercase tracking-[0.06em] text-white/35">Your repositories</p>
              <div className="overflow-hidden rounded-xl border border-white/[0.06]">
                {repos.map((repo) => (
                  <button
                    key={repo.id}
                    type="button"
                    onClick={() => openRepo(repo)}
                    className="block w-full border-t border-white/[0.04] px-4 py-3 text-left first:border-t-0 hover:bg-white/[0.04]"
                  >
                    <span className="block text-[14px]">{repo.fullName}</span>
                    <span className="block text-[12px] text-white/40">
                      {repo.private ? 'Private' : 'Public'}
                      {repo.language ? ` · ${repo.language}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StudioSearch({
  projects,
  onClose,
  onPick,
}: {
  projects: StudioProject[]
  onClose: () => void
  onPick: (href: string) => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const q = query.trim().toLowerCase()
  const actions = [
    { href: '/dashboard/studio', label: 'New Chat', icon: <ComposeIcon /> },
    { href: '/dashboard/studio/test-hub', label: 'Test Hub', icon: <StackIcon /> },
    { href: '/dashboard/studio/codebase', label: 'Codebase', icon: <CodebaseIcon /> },
    { href: '/dashboard', label: 'Dashboard', icon: <HomeIcon /> },
    ...projects.map((item) => ({
      href: `/dashboard/studio/${item.id}`,
      label: item.title || 'New chat',
      icon: <ComposeIcon />,
    })),
  ].filter((item) => !q || item.label.toLowerCase().includes(q))

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive((index) => (actions.length ? (index + 1) % actions.length : 0))
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive((index) => (actions.length ? (index - 1 + actions.length) % actions.length : 0))
      }
      if (event.key === 'Enter' && actions[active]) {
        event.preventDefault()
        onPick(actions[active].href)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPick, actions, active])

  return (
    <div className="fixed inset-0 z-50 bg-black/40 px-4 pt-[18vh]" onClick={onClose}>
      <div
        className="mx-auto w-full max-w-[440px] overflow-hidden rounded-xl border border-white/12 bg-[#1a1a18] shadow-[0_24px_64px_rgba(0,0,0,0.55)]"
        onClick={(event) => event.stopPropagation()}
      >
        <label className="flex items-center gap-2.5 px-3.5 py-3">
          <span className="text-white/40">
            <SearchIcon />
          </span>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search agents..."
            className="w-full bg-transparent text-[14px] text-white outline-none placeholder:text-white/40"
          />
        </label>
        <div className="border-t border-white/[0.06] px-2 pb-2 pt-1.5">
          <p className="px-2 pb-1.5 text-[11px] text-white/35">Actions</p>
          {actions.length === 0 && <p className="px-2 py-2 text-[13px] text-white/40">No agents match.</p>}
          {actions.map((item, index) => (
            <button
              key={item.href}
              type="button"
              onMouseEnter={() => setActive(index)}
              onClick={() => onPick(item.href)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] ${
                index === active ? 'border border-white/10 bg-white/[0.07] text-white' : 'text-white/75'
              }`}
            >
              <span className={index === active ? 'text-white/70' : 'text-white/40'}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function buildTurns(messages: StudioMessage[], marks: number[], eventLen: number) {
  const turns: {
    user: string
    files?: ChatFile[]
    logs: string[]
    replies: string[]
    elapsed?: number
    picked?: string
    from: number
    to: number
  }[] = []
  let current: {
    user: string
    files?: ChatFile[]
    logs: string[]
    replies: string[]
    elapsed?: number
    picked?: string
  } | null = null
  for (const item of messages) {
    if (item.role === 'user') {
      if (current) turns.push({ ...current, from: 0, to: 0 })
      current = { user: item.content, files: item.files, logs: [], replies: [] }
    } else if (item.role === 'log' && current) {
      if (
        /^Auto picked /i.test(item.content) ||
        /^Worked for /i.test(item.content) ||
        /^Building with /i.test(item.content) ||
        /^Looking that up/i.test(item.content)
      ) {
        continue
      }
      current.logs.push(item.content)
    } else if (item.role === 'assistant' && current) {
      const body = item.content.trim()
      if (body && !body.startsWith('{')) current.replies.push(item.content)
      if (item.elapsed != null) current.elapsed = item.elapsed
      if (item.picked) current.picked = item.picked
    }
  }
  if (current) turns.push({ ...current, from: 0, to: 0 })
  const starts = marks.length ? [...marks] : [0]
  if (starts[0] !== 0) starts.unshift(0)
  while (starts.length < turns.length) starts.push(eventLen)
  return turns.map((turn, index) => ({
    ...turn,
    from: starts[index] ?? 0,
    to: index < turns.length - 1 ? (starts[index + 1] ?? eventLen) : eventLen,
  }))
}

function chatFileSrc(file: ChatFile) {
  if (file.dataUrl) return file.dataUrl
  if (file.id) return `/api/files/${file.id}/download?inline=1`
  return ''
}

function MediaLightbox({ file, onClose }: { file: ChatFile; onClose: () => void }) {
  const src = chatFileSrc(file)
  const video = file.mime.startsWith('video/')
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-[#141413] text-white/70 hover:text-white"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2 2l8 8M10 2 2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <div className="max-h-[88vh] w-full max-w-[min(920px,94vw)]" onClick={(event) => event.stopPropagation()}>
        {video ? (
          <video src={src} controls autoPlay className="mx-auto max-h-[80vh] w-auto max-w-full rounded-xl" />
        ) : (
          <img src={src} alt={file.name} className="mx-auto max-h-[80vh] w-auto max-w-full rounded-xl object-contain" />
        )}
        <p className="mt-3 truncate text-center text-[12px] text-white/45">{file.name}</p>
      </div>
    </div>,
    document.body,
  )
}

function FileThumbs({
  files,
  onRemove,
  onAccent,
}: {
  files: ChatFile[]
  onRemove?: (index: number) => void
  onAccent?: boolean
}) {
  const [open, setOpen] = useState<ChatFile | null>(null)
  if (files.length === 0) return null
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {files.map((file, index) => {
        const src = chatFileSrc(file)
        const image = file.mime.startsWith('image/') && Boolean(src)
        const video = file.mime.startsWith('video/') && Boolean(src)
        return (
          <div key={`${file.name}-${index}`} className="relative">
            {image || video ? (
              <button
                type="button"
                onClick={() => setOpen(file)}
                aria-label={`Open ${file.name}`}
                className="block overflow-hidden rounded-md"
              >
                {image ? (
                  <img
                    src={src}
                    alt=""
                    className={`h-14 w-14 object-cover transition hover:opacity-90 ${onAccent ? 'ring-1 ring-black/25' : ''}`}
                  />
                ) : (
                  <video src={src} className="h-14 w-14 object-cover" muted />
                )}
              </button>
            ) : (
              <div
                className={`flex h-14 max-w-[160px] items-center rounded-md px-2 text-[11px] ${
                  onAccent
                    ? 'border border-black/20 bg-black/15 text-[#111110]/80'
                    : 'border border-white/12 bg-white/[0.06] text-white/75'
                }`}
              >
                <span className="truncate">{file.name}</span>
              </div>
            )}
            {onRemove && (
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => onRemove(index)}
                className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-[#1a1a18] text-[10px] text-white/80"
              >
                ×
              </button>
            )}
          </div>
        )
      })}
      {open && <MediaLightbox file={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function UserBubble({ text, files }: { text: string; files?: ChatFile[] }) {
  const answered = isAskReply(text)
  const body = answered
    ? text
        .replace(/^(ANSWERS|YOU_DECIDE|APPROVE_PLAN)\s*/m, '')
        .replace(/\n\nBuild with these choices.*$/s, '')
        .replace(/\nPick strong[\s\S]*$/s, '')
        .replace(/\nBuild this plan[\s\S]*$/s, '')
        .trim()
    : text
  return (
    <div className="w-full rounded-xl border border-white/10 bg-[#161615] px-4 py-3">
      <FileThumbs files={files || []} />
      {answered && <p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-white/35">You answered</p>}
      {body ? <p className="whitespace-pre-wrap text-[14px] leading-6 text-white">{body}</p> : null}
    </div>
  )
}

function ReplyCard({
  replies,
  onRegenerate,
  regenerateLabel,
  onShowQuestions,
}: {
  replies: string[]
  onRegenerate?: () => void
  regenerateLabel?: string
  onShowQuestions?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const text = replies.join('\n\n').trim()

  function copyReply() {
    if (!text) return
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      },
      () => undefined,
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#161615]">
      {replies.length > 0 && (
        <div className="space-y-4 px-5 py-4">
          {replies.map((line, index) => (
            <ReplyMarkdown key={index} text={line} />
          ))}
        </div>
      )}
      <div className={`flex items-center gap-0.5 px-1.5 py-1 ${replies.length > 0 ? 'border-t border-white/[0.06]' : ''}`}>
        {onShowQuestions && (
          <button
            type="button"
            onClick={onShowQuestions}
            aria-label="Show questions"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-white/70 hover:bg-white/[0.06] hover:text-white"
          >
            <QuestionsIcon />
            Questions
          </button>
        )}
        <button
          type="button"
          disabled={!text}
          onClick={copyReply}
          aria-label={copied ? 'Copied' : 'Copy'}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-white/40 hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
        >
          <CopyReplyIcon />
          {copied ? 'Copied' : 'Copy'}
        </button>
        {onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            aria-label={regenerateLabel || 'Regenerate'}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-white/40 hover:bg-white/[0.06] hover:text-white"
          >
            <RegenIcon />
            {regenerateLabel || 'Regenerate'}
          </button>
        )}
      </div>
    </div>
  )
}

function QuestionsIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 4h8M3 7h8M3 10h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function CopyReplyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="4.2" y="4.2" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.8 9.2V2.8h6.4" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function RegenIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M11.4 7A4.4 4.4 0 1 1 8.2 2.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M8.1 1.5v2.6h2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StudioChat({
  initialId,
  onSaved,
  plan: billingPlan,
  agentDriver,
  displayName = 'there',
}: {
  initialId: string | null
  onSaved: (row: StudioProject) => void
  plan?: string
  agentDriver: AgentDriver
  displayName?: string
}) {
  const isBot = agentDriver === 'bot'
  const [models, setModels] = useState<StudioModel[]>([])
  const [model, setModel] = useState(AUTO_MODEL_ID)
  const [modelOpen, setModelOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [githubConnected, setGithubConnected] = useState(false)
  const [installUrl, setInstallUrl] = useState('https://github.com/apps/soumtok/installations/new')
  const [project, setProject] = useState<GithubRepo | null>(null)
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<StudioMessage[]>([])
  const [workspace, setWorkspace] = useState<AgentWorkspace>(emptyWorkspace())
  const [shown, setShown] = useState(0)
  const [benchTab, setBenchTab] = useState<BenchTab>('desktop')
  const [control, setControl] = useState(false)
  const [mobileBench, setMobileBench] = useState(false)
  const [focusPath, setFocusPath] = useState('')
  const [status, setStatus] = useState('')
  const [step, setStep] = useState('')
  const [liveReply, setLiveReply] = useState('')
  const [livePicked, setLivePicked] = useState('')
  const [busy, setBusy] = useState(false)
  const [livePlan, setLivePlan] = useState<AgentPlan | null>(null)
  const [liveFiles, setLiveFiles] = useState<string[]>([])
  const [liveThought, setLiveThought] = useState('')
  const [now, setNow] = useState(0)
  const liveStarted = useRef(0)
  const [listening, setListening] = useState(false)
  const [multitask, setMultitask] = useState(false)
  const [runMode, setRunMode] = useState<AgentRunMode>('agent')
  const lastTaskRef = useRef('')
  const skipGateRef = useRef(false)
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([])
  const [connectors, setConnectors] = useState<ConnectorRow[]>([])
  const [libraryDocs, setLibraryDocs] = useState<{ title: string; folder?: string }[]>([])
  const [skills, setSkills] = useState<UserSkill[]>([])
  const [attachedSkills, setAttachedSkills] = useState<UserSkill[]>([])
  const [pendingFiles, setPendingFiles] = useState<ChatFile[]>([])
  const pendingFilesRef = useRef<ChatFile[]>([])
  const [fileError, setFileError] = useState('')
  const [fileDrag, setFileDrag] = useState(false)
  const fileDragDepth = useRef(0)
  const [savedId, setSavedId] = useState<string | null>(initialId)
  const [chatReady, setChatReady] = useState(!initialId)
  const feedRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastSendRef = useRef<{ text: string; files: ChatFile[] } | null>(null)
  const voiceRef = useRef<SpeechRecognitionLike | null>(null)
  const voiceBaseRef = useRef('')
  const listeningRef = useRef(false)
  const [canReplay, setCanReplay] = useState(false)
  const savedIdRef = useRef<string | null>(initialId)
  const workspaceRef = useRef<AgentWorkspace>(emptyWorkspace())
  const selected = models.find((item) => item.id === model)
  const title = messages.find((item) => item.role === 'user')?.content.slice(0, 80) || messages.find((item) => item.role === 'user')?.files?.[0]?.name || 'New chat'
  const [benchOpen, setBenchOpen] = useState(false)
  const [deskFull, setDeskFull] = useState(false)
  const [benchPct, setBenchPct] = useState(58)
  const layoutRef = useRef<HTMLDivElement>(null)
  const splitDrag = useRef(false)
  // The workbench never opens on its own. The chat is the work; this is the side trip.
  const hasBench = benchOpen

  function openBench(tab: BenchTab) {
    setBenchTab(tab)
    setBenchOpen(true)
    setMobileBench(true)
  }

  function openComputer() {
    setBenchTab('desktop')
    setBenchOpen(true)
    setMobileBench(true)
    setControl(true)
    setDeskFull(true)
  }

  function openEnvFile() {
    const files = ensureEnvFiles(workspaceRef.current.files)
    applyWorkspace({ ...workspaceRef.current, files })
    setFocusPath('.env')
    openBench('files')
    setControl(true)
    setDeskFull(true)
  }

  function closeBench() {
    setBenchOpen(false)
    setMobileBench(false)
    setControl(false)
    setDeskFull(false)
  }

  useEffect(() => {
    if (!busy) return
    liveStarted.current = Date.now()
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [busy])

  function onSplitDown(event: PointerEvent<HTMLDivElement>) {
    splitDrag.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onSplitMove(event: PointerEvent<HTMLDivElement>) {
    if (!splitDrag.current || !layoutRef.current) return
    const box = layoutRef.current.getBoundingClientRect()
    const next = ((box.right - event.clientX) / box.width) * 100
    setBenchPct(Math.min(76, Math.max(24, next)))
  }

  useEffect(() => {
    let cancelled = false
    setChatReady(!initialId)
    fetchModels()
      .then((data) => {
        if (cancelled) return
        setModels(sortModelsByPower(data.models))
        if (!initialId) setModel(AUTO_MODEL_ID)
      })
      .catch(() => {
        if (!cancelled) setStatus('Could not load models')
      })
    fetchGithubRepos()
      .then((data) => {
        if (cancelled) return
        setRepos(data.repos)
        setGithubConnected(data.connected)
        setInstallUrl(data.installUrl)
      })
      .catch(() => undefined)
    try {
      const raw = sessionStorage.getItem('soumtok-project')
      if (raw && !initialId) {
        setProject(JSON.parse(raw) as GithubRepo)
        sessionStorage.removeItem('soumtok-project')
      }
    } catch {
      sessionStorage.removeItem('soumtok-project')
    }
    let skillList: UserSkill[] = []
    let skillIds: string[] = []
    function applySkills() {
      if (!skillIds.length) return
      setAttachedSkills(skillList.filter((skill) => skillIds.includes(skill.id)))
    }
    fetchSkills()
      .then((data) => {
        if (cancelled) return
        skillList = data.skills
        setSkills(data.skills)
        applySkills()
      })
      .catch(() => undefined)
    studioToolContext()
      .then((data) => {
        if (!cancelled) setLibraryDocs(data.documents)
      })
      .catch(() => undefined)
    fetchPlugins()
      .then((data) => {
        if (!cancelled) setPlugins(data.installed)
      })
      .catch(() => undefined)
    fetchConnectors()
      .then((data) => {
        if (!cancelled) setConnectors(data.connectors)
      })
      .catch(() => undefined)

    if (!initialId) {
      setChatReady(true)
      return () => {
        cancelled = true
      }
    }

    const giveUp = window.setTimeout(() => {
      if (!cancelled) setChatReady(true)
    }, 6000)
    fetchStudioProject(initialId)
      .then((row) => {
        if (cancelled) return
        setSavedId(row.id)
        savedIdRef.current = row.id
        setMessages(row.messages || [])
        const lastUser = [...(row.messages || [])].reverse().find((item) => item.role === 'user')
        if (lastUser) {
          lastSendRef.current = { text: lastUser.content, files: lastUser.files || [] }
          setCanReplay(true)
        }
        const lastTask = [...(row.messages || [])].reverse().find((item) => item.role === 'user' && !isAskReply(item.content))
        if (lastTask) lastTaskRef.current = lastTask.content
        const loaded = normalizeWorkspace(row.workspace)
        loaded.files = hydrateSecretFiles(row.id, loaded.files)
        workspaceRef.current = loaded
        setWorkspace(loaded)
        setShown(loaded.events.length)
        if (row.model) setModel(row.model)
        if (row.repo) setProject(row.repo)
        skillIds = row.skillIds || []
        applySkills()
        const dumped = workspaceNeedsHeal(row.workspace)
        if (dumped && (row.messages || []).length) {
          void saveStudioProject({
            id: row.id,
            title: row.title,
            model: row.model || undefined,
            repo: row.repo,
            skillIds: row.skillIds,
            messages: row.messages,
            workspace: loaded,
          })
        }
      })
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(giveUp)
        if (!cancelled) setChatReady(true)
      })
    return () => {
      cancelled = true
      window.clearTimeout(giveUp)
    }
  }, [initialId])

  const userTurns = messages.filter((item) => item.role === 'user').length

  function scrollFeedDown(smooth = false) {
    const el = feedRef.current
    if (!el) return
    const go = () => {
      const latest = el.querySelector('[data-latest-turn]')
      if (latest) {
        latest.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
        return
      }
      el.scrollTop = el.scrollHeight
      el.querySelector('[data-feed-end]')?.scrollIntoView({ block: 'end', behavior: smooth ? 'smooth' : 'auto' })
    }
    go()
    requestAnimationFrame(go)
    window.setTimeout(go, 50)
  }

  useEffect(() => {
    const el = feedRef.current
    if (!el) return
    function onScroll() {
      nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [chatReady])

  useEffect(() => {
    scrollFeedDown(true)
  }, [userTurns])

  useEffect(() => {
    if (!nearBottomRef.current) return
    const el = feedRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [shown, busy, step, liveReply])

  async function persist(nextMessages: StudioMessage[], nextWorkspace = workspaceRef.current) {
    if (nextMessages.length === 0) return
    try {
      const { safe, secret } = splitSecretFiles(nextWorkspace.files)
      saveLocalSecrets(savedIdRef.current || 'draft', secret)
      const saved = await saveStudioProject({
        id: savedIdRef.current || undefined,
        title: redactSecrets(
          nextMessages.find((item) => item.role === 'user')?.content.slice(0, 80) ||
            nextMessages.find((item) => item.role === 'user')?.files?.[0]?.name ||
            'New chat',
        ),
        model,
        repo: project,
        skillIds: attachedSkills.map((skill) => skill.id),
        messages: nextMessages.map((item) => ({
          ...item,
          content: redactSecrets(item.content),
          files: item.role === 'user' ? slimChatFiles(redactChatFiles(item.files)) : item.files,
        })),
        workspace: { ...nextWorkspace, files: safe },
      })
      savedIdRef.current = saved.id
      setSavedId(saved.id)
      saveLocalSecrets(saved.id, secret)
      onSaved(saved)
    } catch {
      /* keep chatting even if save lags */
    }
  }

  function stepLabel(event: AgentWorkspace['events'][number]) {
    if (event.kind === 'explore') return 'Reading the workspace'
    if (event.kind === 'ask') return 'Asking a few questions'
    if (event.kind === 'plan') return 'Drafting a plan'
    if (event.kind === 'todo') return 'Planning steps'
    if (event.kind === 'document') return `Saving ${event.title}`
    if (event.kind === 'folder') return `Creating ${event.path}`
    if (event.kind === 'mcp') return `MCP ${event.tool}`
    if (event.kind === 'skill') return `Using ${event.name}`
    if (event.kind === 'prompt') return 'Prompt help'
    if (event.kind === 'security') return 'Protecting keys'
    if (event.kind === 'connect') return event.connected ? `${event.name} connected` : `Connect ${event.name}`
    if (event.kind === 'note') return event.title
    if (event.kind === 'action') return event.text
    const live = liveStepLabel(event)
    if (live === 'Thinking') return ''
    return live
  }

  function applyWorkspace(next: AgentWorkspace) {
    workspaceRef.current = next
    setWorkspace(next)
  }

  async function attachChatFiles(list: File[]) {
    if (!list.length) return
    const picked = takeChatFiles(list)
    setFileError(picked.error || '')
    if (!picked.files.length) return
    const staged = picked.files.map(stageChatFile)
    pendingFilesRef.current = [...pendingFilesRef.current, ...staged].slice(0, 6)
    setPendingFiles(pendingFilesRef.current)
    void Promise.all(
      staged.map((item) =>
        settleChatFile(item).then((saved) => {
          pendingFilesRef.current = pendingFilesRef.current.map((file) =>
            file.dataUrl && item.dataUrl && file.dataUrl === item.dataUrl ? saved : file,
          )
          setPendingFiles(pendingFilesRef.current)
        }),
      ),
    )
    for (const file of picked.files) {
      if (/\.(md|txt|skill)$/i.test(file.name) && /skill/i.test(file.name)) {
        void uploadSkill(file)
          .then((skill) => {
            setAttachedSkills((current) =>
              current.some((item) => item.id === skill.id) ? current : [...current, skill],
            )
          })
          .catch(() => undefined)
      }
    }
  }

  function dropPendingFiles(next: ChatFile[]) {
    for (const file of pendingFilesRef.current) {
      if (next.some((item) => item.dataUrl === file.dataUrl && item.name === file.name)) continue
      forgetChatFile(file)
    }
    pendingFilesRef.current = next
    setPendingFiles(next)
  }

  function onChatDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!dropHasFiles(event.dataTransfer)) return
    event.preventDefault()
    fileDragDepth.current += 1
    setFileDrag(true)
  }

  function onChatDragOver(event: DragEvent<HTMLDivElement>) {
    if (!dropHasFiles(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function onChatDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!dropHasFiles(event.dataTransfer)) return
    fileDragDepth.current -= 1
    if (fileDragDepth.current <= 0) {
      fileDragDepth.current = 0
      setFileDrag(false)
    }
  }

  function onChatDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    fileDragDepth.current = 0
    setFileDrag(false)
    void attachChatFiles(filesFromDrop(event.dataTransfer))
  }

  async function attachGithub(repo: GithubRepo | null) {
    setProject(repo)
    if (!repo) return
    const existing = Object.keys(workspaceRef.current.files).filter((path) => !isSecretPath(path) && path !== '.gitignore')
    if (existing.length > 0) return
    setStatus('Cloning repository…')
    try {
      const snap = await studioCloneRepo(repo.fullName)
      const next = {
        ...workspaceRef.current,
        files: { ...workspaceRef.current.files, ...snap.files },
        previewTitle: workspaceRef.current.previewTitle || repo.name,
        events: [
          ...workspaceRef.current.events,
          {
            kind: 'result' as const,
            name: 'github',
            ok: true,
            text: `Cloned ${snap.fullName}@${snap.branch} · ${snap.count} files${snap.truncated ? ' (slice)' : ''}`,
          },
        ],
      }
      applyWorkspace(next)
      void persist(messages, next)
      setStatus(snap.count ? '' : 'That repository had no text files to clone.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not clone')
    }
  }

  function stopRun() {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
  }

  async function onSend(event?: FormEvent, override?: string, overrideFiles?: ChatFile[], reuseUser = false) {
    event?.preventDefault()
    const text = applySlash((override ?? prompt).trim())
    const queued = overrideFiles ?? pendingFilesRef.current
    if ((!text && queued.length === 0) || busy) return
    const attached = await settleChatFiles(queued)
    let next: StudioMessage[]
    if (reuseUser) {
      next = [...messages]
      while (next.length && (next[next.length - 1].role === 'log' || next[next.length - 1].role === 'assistant')) {
        next.pop()
      }
      const lastIdx = next.findLastIndex((item) => item.role === 'user')
      if (lastIdx < 0) return
      next = next.slice(0, lastIdx + 1)
    } else {
      next = [...messages, { role: 'user', content: text, files: attached.length ? attached : undefined }]
    }
    const scan = scanSecrets(
      text,
      attached.flatMap((file) => [file.text || '', file.analysis || '', file.name || '']),
    )
    const safeText = redactSecrets(text)
    const safeFiles = redactChatFiles(attached)
    if (scan.blocked) {
      const lastIdx = next.findLastIndex((item) => item.role === 'user')
      if (lastIdx >= 0) {
        next[lastIdx] = { role: 'user', content: safeText, files: safeFiles?.length ? safeFiles : undefined }
      }
    }
    lastSendRef.current = { text: scan.blocked ? safeText : text, files: scan.blocked ? safeFiles || [] : attached }
    const priorFiles = Object.keys(workspaceRef.current.files).length
    const hasImage = attached.some((file) => /image\//.test(file.mime || ''))
    const ask = promptWithAttachments(repairUserText(text), {
      hasProject: priorFiles > 0,
      hasImage,
      hasAttach: attached.length > 0,
    })
    if (!isAskReply(text) && !scan.blocked) lastTaskRef.current = text || ask
    setCanReplay(!scan.blocked)
    setMessages(next)
    pendingFilesRef.current = []
    setPendingFiles([])
    setFileError('')
    const marks = [...(workspaceRef.current.marks || [0])]
    const users = next.filter((item) => item.role === 'user').length
    if (marks.length === 0) marks.push(0)
    if (!reuseUser && users > marks.length) {
      marks.push(workspaceRef.current.events.length)
      applyWorkspace({ ...workspaceRef.current, marks })
    }
    const turnStart = marks[Math.max(0, marks.length - 1)] ?? 0
    if (reuseUser) {
      applyWorkspace({ ...workspaceRef.current, events: workspaceRef.current.events.slice(0, turnStart), marks })
    }
    setShown(workspaceRef.current.events.length)
    scrollFeedDown(true)
    setPrompt('')
    setProjectOpen(false)
    setModelOpen(false)
    setSourceOpen(false)
    if (scan.blocked) {
      const files = ensureEnvFiles(workspaceRef.current.files)
      const events = [...workspaceRef.current.events, securityEvent(scan)]
      const guarded = { ...workspaceRef.current, files, events }
      applyWorkspace(guarded)
      setShown(events.length)
      const done: StudioMessage[] = [...next, { role: 'assistant', content: securityReply(scan) }]
      setMessages(done)
      void persist(done, guarded)
      openEnvFile()
      return
    }
    const liveConnected = connectors
      .filter((row) => row.connected)
      .flatMap((row) => [row.plugin_id || '', row.name.toLowerCase()].filter(Boolean))
    const analysis = analyzeUserRequest(text, {
      hasFiles: priorFiles > 0,
      files: workspaceRef.current.files,
    })
    const wanted =
      !reuseUser && !isAskReply(text) && analysis.kind === 'connect'
        ? catalogConnectTargets(text, liveConnected)
        : []
    if (wanted.length) {
      setBusy(true)
      try {
        const cards: Extract<AgentWorkspace['events'][number], { kind: 'connect' }>[] = []
        for (const plugin of wanted) {
          const started = await startConnect({ pluginId: plugin.id })
          cards.push({
            kind: 'connect',
            provider: plugin.id,
            name: plugin.name,
            url: started.url,
            code: started.code,
            connectorId: started.connectorId || undefined,
            detail: started.detail,
            connected: false,
          })
        }
        const events = [...workspaceRef.current.events, ...cards]
        const guarded = { ...workspaceRef.current, events }
        applyWorkspace(guarded)
        setShown(events.length)
        const spoken = cards
          .map(
            (card) =>
              `Connect ${card.name}: ${card.url}${card.code ? ` — enter ${card.code}` : ''}. Open the link, sign in, then tap I’ve connected.`,
          )
          .join('\n')
        const done: StudioMessage[] = [...next, { role: 'assistant', content: spoken }]
        setMessages(done)
        void persist(done, guarded)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not start connect'
        setStatus(message)
        setMessages([...next, { role: 'log', content: message }])
      } finally {
        setBusy(false)
      }
      return
    }
    void persist(next)
    setBusy(true)
    setStep('Analyzing and understanding')
    setLiveThought('')
    setStatus('')
    setControl(false)
    const ac = new AbortController()
    abortRef.current = ac
    const pushLog = (line: string) => {
      next.push({ role: 'log', content: line })
      setMessages([...next])
    }
    try {
      const historySource = next.map((item, index) => {
        const lastUser = next.findLastIndex((row) => row.role === 'user')
        if (index !== lastUser || item.role !== 'user' || !ask || ask === item.content.trim()) return item
        return { ...item, content: [item.content.trim(), ask].filter(Boolean).join('\n\n') }
      })
      const history = historyForModel(historySource, workspaceRef.current)
      const answered = isAskReply(ask)
      if (!skipGateRef.current && !answered) {
        const skillHits = matchSkills(
          ask,
          skills,
          attachedSkills.map((item) => item.id),
        )
        const mcpHits = matchMcp(
          ask,
          connectors.map((row) => ({
            id: row.id,
            name: row.name,
            connected: row.connected,
            tools: row.last_check?.mcp?.tools || [],
          })),
        )
        const gate = wantsBrandAsset(ask) ? null : buildCapabilityAsk(skillHits, mcpHits)
        if (gate) {
          const events = [...workspaceRef.current.events, gate]
          applyWorkspace({ ...workspaceRef.current, events })
          setShown(events.length)
          setBusy(false)
          skipGateRef.current = false
          return
        }
      }
      skipGateRef.current = false
      const planText = answered ? [lastTaskRef.current, ask].filter(Boolean).join('\n\n') : ask
      const hasAttach = attached.length > 0
      const follow = classifyFollowUp(planText, priorFiles > 0, { attachments: hasAttach })
      const turnAnalysis = analyzeUserRequest(planText, {
        hasFiles: priorFiles > 0,
        files: workspaceRef.current.files,
        attachments: hasAttach,
        hasImage,
      })
      const plan = inferPlan(planText, priorFiles > 0, {
        hasPreview: Boolean(workspaceRef.current.previewHtml),
        runMode: answered ? 'agent' : runMode,
        answered,
        attachments: hasAttach,
        analysis: turnAnalysis,
      })
      setLivePlan(plan)
      setLiveFiles([])
      setLiveThought(turnAnalysis.thought)
      const sendModel = isAutoModel(model)
        ? pickAutoModel({
            models,
            task: planText,
            plan: billingPlan,
            hasFiles: priorFiles > 0,
            hasImage: attached.some((file) => /image\//.test(file.mime || '')),
            runMode: answered ? 'agent' : runMode,
            analysisKind: turnAnalysis.kind,
          })
        : model
      const picked = models.find((item) => item.id === sendModel)
      setLivePicked(isAutoModel(model) && picked ? `Auto · ${picked.name}` : '')
      setLiveReply('')
      setStep('Analyzing and understanding')
      scrollFeedDown(true)
      await waitMs(1200, ac.signal)
      if (ac.signal.aborted) return
      setStep('Passed to the model')
      scrollFeedDown(true)
      let fetched: { url: string; title: string; text: string; ok?: boolean }[] = []
      const logoAsk = wantsBrandAsset(ask)
      if (logoAsk || (!planUsesCodingAgent(plan) && (needsWeb(ask) || extractUrls(ask).length))) {
        pushLog(logoAsk ? 'Fetching the brand logo' : 'Looking that up')
        fetched = await studioFetchPages({
          query: ask,
          urls: [...extractUrls(ask), ...(logoAsk ? brandLogoFetchUrls(ask) : [])],
        }).catch(() => [])
        if (fetched.length) {
          applyWorkspace({
            ...workspaceRef.current,
            events: [
              ...workspaceRef.current.events,
              ...fetched.map((page) => ({ kind: 'fetch' as const, url: page.url, title: page.title, ok: page.ok !== false })),
            ],
          })
        }
      }
      const extra = [
        threadMemory(workspaceRef.current),
        soumtokBotStudioContext(agentDriver),
        logoAsk ? brandLogoContext(ask) : '',
        formatAnalyzedRequest(turnAnalysis),
        follow === 'task'
          ? fetched.some((page) => page.ok !== false && page.text)
            ? platformBrief({
                fetched: fetched
                  .filter((page) => page.ok !== false && page.text)
                  .map((page) => ({ ...page, text: redactSecrets(page.text) })),
              })
            : ''
          : platformBrief({
          skills,
          plugins,
          connectors: connectors.map((row) => ({
            name: row.name,
            connected: row.connected,
            tools: row.last_check?.mcp?.tools || [],
          })),
          documents: libraryDocs,
          fetched: fetched
            .filter((page) => page.ok !== false && page.text)
            .map((page) => ({ ...page, text: redactSecrets(page.text) })),
        }),
        answered ? 'The latest user message is their decisions. Build now. Do not ask again.' : '',
        priorFiles
          ? follow === 'question'
            ? [
                'FOLLOW-UP KIND: question. They already have this project. Answer from the current files and this chat. Put the answer in the summary. Do not scaffold a new site. Do not write files. Do not say Preview is ready or that you wrote files.',
                codeForRequest(`${turnAnalysis.meaning}\n${turnAnalysis.repaired}`, workspaceRef.current.files, 14_000, { answerOnly: true }),
              ]
                .filter(Boolean)
                .join('\n\n')
            : [
                'FOLLOW-UP KIND: task. First thought, then read each file you will change so the user sees those reads, then write or diff. Never stop after saying you will read. Do not emit process todos.',
                codeForRequest(`${turnAnalysis.meaning}\n${turnAnalysis.repaired}`, workspaceRef.current.files),
              ].filter(Boolean).join('\n\n')
          : '',
        project
          ? `They attached GitHub project ${project.fullName}${project.language ? ` (${project.language})` : ''}${project.description ? `: ${project.description}` : ''}.`
          : '',
        multitask ? 'Break the work into parallel sub-tasks and report each clearly.' : '',
        attachedSkills.length
          ? `User skills attached:\n${attachedSkills
              .map((skill) =>
                skill.excerpt
                  ? `- ${skill.name} (${skill.file_name}):\n${skill.excerpt}`
                  : `- ${skill.name} (${skill.file_name}) is attached. Use it when relevant.`,
              )
              .join('\n')}`
          : '',
        attached.length
          ? hasImage && priorFiles
            ? `The user attached a screenshot of the CURRENT live preview of this workspace. Look at the pixels. Identify the broken UI section (overlapping header/nav, hamburger with desktop links, missing pictures, overflow). Read the matching files and patch them. Do not start a new site. Do not stop at a description.\n${attached
                .map((file) =>
                  file.analysis
                    ? `- ${file.name}${file.documentId ? ` (document ${file.documentId})` : ''}\n${file.analysis}`
                    : `- ${file.name}`,
                )
                .join('\n')}`
            : `The user attached files. You can see them. If they asked whether you see an image, say yes and describe it. Do not emit an ask card.\n${attached
                .map((file) =>
                  file.analysis
                    ? `- ${file.name}${file.documentId ? ` (document ${file.documentId})` : ''}\n${file.analysis}`
                    : `- ${file.name}`,
                )
                .join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n')
      const timeout = AbortSignal.timeout(planUsesCodingAgent(plan) ? 900_000 : 300_000)
      const linked = AbortSignal.any([ac.signal, timeout])
      const origin = workspaceRef.current
      const prior = origin.events.length
      const seed = kickoffEvents(plan, {
        userText: planText,
        files: origin.files,
        thought: turnAnalysis.thought,
        pipeline: true,
      })
      let lastParsed: AgentWorkspace = { files: {}, events: [], mode: plan.mode }
      let merged = origin
      let roundBase = origin
      if (seed.length) {
        let files = { ...origin.files }
        for (const event of seed) {
          if (event.kind === 'folder') files = ensureFolder(files, event.path)
        }
        roundBase = { ...origin, files }
        applyWorkspace({ ...origin, files, events: [...origin.events, ...seed] })
        setShown(prior + seed.length)
        const folders = seed.filter((item) => item.kind === 'folder').map((item) => (item.kind === 'folder' ? `${item.path}/` : ''))
        if (folders.length) {
          openBench('files')
        }
      }
      const userTexts = next.filter((item) => item.role === 'user').map((item) => item.content)
      const rename =
        isFollowUpTask(plan) && turnAnalysis.kind === 'rename'
          ? applyNameChangeFromThread(userTexts, origin.files)
          : null
      const logoSvg = logoAsk ? svgFromFetchedPages(fetched) : ''
      const logoPatch =
        !rename && priorFiles > 0 && logoAsk && logoSvg
          ? applyBrandLogo(origin.files, {
              text: ask,
              svg: logoSvg,
              name: brandFromPrompt(ask),
            })
          : null
      const local = rename
        ? {
            files: rename.files,
            thought: `I found “${rename.from.join('”, “')}” in ${rename.changed.join(', ')}. I’ll change the names to ${rename.to}.`,
            stop: nameChangeIsOnlyAsk(planText),
          }
        : logoPatch
          ? {
              files: logoPatch.files,
              thought: `Fetched the ${logoPatch.name} logo and put it in the header on ${logoPatch.changed.filter((path) => /\.html?$/i.test(path)).join(', ') || logoPatch.changed.join(', ')}.`,
              stop: isLogoOnlyAsk(planText),
            }
          : null
      if (local) {
        const thought = [
          {
            kind: 'thought' as const,
            seconds: 1,
            text: local.thought,
          },
        ]
        merged = attachChangeDiffs(
          origin.files,
          {
            ...origin,
            files: local.files,
            previewHtml: previewFromFiles(local.files, origin.previewHtml || ''),
            events: [...origin.events, ...thought],
          },
          prior,
        )
        applyWorkspace(merged)
        setShown(merged.events.length)
        openBench('desktop')
        roundBase = merged
        if (local.stop) {
          const spoken = spokenRecap({ ...merged, events: merged.events.slice(prior) })
          const done: StudioMessage[] = [...next, { role: 'assistant', content: spoken }]
          setMessages(done)
          void persist(done, merged)
          setBenchTab(defaultWorkbenchTab(merged))
          return
        }
      }
      let tick = ''
      let announced = ''
      const harnessMessages = history.map((item, index) => {
        if (index === history.length - 1 && item.role === 'user' && attached.length) {
          return { ...item, files: attached }
        }
        return item
      })
      const uiMode = answered ? 'agent' : runMode

      const applyPartial = (partial: string) => {
        if (ac.signal.aborted || !partial) return
        if (plan.mode === 'chat' || plan.mode === 'ask' || plan.mode === 'plan') {
          const draft = chatReplyFromRun(partial)
          if (draft) setLiveReply(draft)
          setStep(plan.mode === 'ask' || plan.mode === 'plan' ? 'Drafting' : 'Answering')
        }
        const live = liveWorkspaceFromStream(roundBase, partial, seed)
        live.events = eventsForMode(live.events, plan.mode)
        const last = live.events[live.events.length - 1]
        const fileMark = Object.entries(live.files)
          .map(([path, content]) => `${path}:${content.length}`)
          .join('|')
        const mark = `${live.events.length}:${last?.kind === 'diff' ? last.lines.length : 0}:${fileMark}`
        if (mark !== tick) {
          tick = mark
          const current = workspaceRef.current
          applyWorkspace({
            ...current,
            files: live.files,
            events: live.events,
            previewHtml: live.previewHtml || current.previewHtml,
            marks: current.marks || roundBase.marks,
          })
          setShown(live.events.length)
          if (last) {
            const label = stepLabel(last)
            if (label) setStep(label)
          }
        }
        if (live.paths.length) setLiveFiles(visibleWorkPaths(live.paths))
        const path = live.paths.at(-1)
        if (path && path !== announced) {
          announced = path
          setStep(`Writing ${path}`)
          if (origin.previewHtml || plan.needsPreview) openBench('desktop')
          else {
            setFocusPath(path)
            openBench('files')
          }
        }
      }

      const run = await runStudioAgentHarness({
        model: sendModel,
        mode: uiMode === 'ask' ? 'ask' : uiMode === 'plan' ? 'plan' : 'agent',
        messages: harnessMessages,
        files: roundBase.files,
        repo: project?.fullName,
        agentPrefs: DEFAULT_DESKTOP_AGENT_PREFS,
        workspaceRoot: project?.fullName || project?.name || 'studio-sandbox',
        openFiles: visibleWorkPaths(liveFiles.length ? liveFiles : Object.keys(roundBase.files)),
        analysisKind: turnAnalysis.kind,
        signal: linked,
        onStatus: (line) => {
          if (line) setStep(line)
        },
        onText: applyPartial,
        onRound: (text) => {
          applyPartial(text)
          lastParsed = parseAgentRun(text || '', plan)
          merged = mergeWorkspace(roundBase, lastParsed)
          applyWorkspace(merged)
          setShown(merged.events.length)
          roundBase = merged
          tick = ''
          announced = ''
        },
        onTools: (tools) => {
          const first = tools[0]
          if (first) {
            const detail = first.args?.path || first.args?.command || first.args?.pattern || ''
            if (first.name === 'read' && detail) setStep(`Reading ${detail}`)
            else if (first.name === 'write' && detail) setStep(`Writing ${detail}`)
            else setStep(detail ? `Running ${first.name} · ${detail}` : `Running ${first.name}`)
          }
          const paths = tools
            .map((tool) => tool.args?.path || tool.args?.file)
            .filter((path): path is string => Boolean(path))
          if (paths.length) setLiveFiles((current) => visibleWorkPaths([...current, ...paths]))
          const current = workspaceRef.current
          const last = current.events[current.events.length - 1]
          const extraTools = tools.filter(
            (tool) =>
              !(last?.kind === 'tool' && last.name === tool.name && JSON.stringify(last.args) === JSON.stringify(tool.args)),
          )
          if (!extraTools.length) return
          const events = [
            ...current.events,
            ...extraTools.map((tool) => ({ kind: 'tool' as const, name: tool.name, args: tool.args })),
          ]
          applyWorkspace({ ...current, events })
          setShown(events.length)
        },
        onResult: (out) => {
          const files = { ...workspaceRef.current.files, ...(out.files || {}) }
          const events = workspaceRef.current.events.map((item) => {
            if (
              item.kind === 'command' &&
              out.name === 'terminal' &&
              item.ok === undefined &&
              out.command &&
              item.command === out.command
            ) {
              return { ...item, ok: out.ok, output: out.text.slice(0, 4000) }
            }
            return item
          })
          merged = {
            ...workspaceRef.current,
            files,
            previewHtml: out.files ? previewFromFiles(files, workspaceRef.current.previewHtml || '') : workspaceRef.current.previewHtml,
            events: [...events, { kind: 'result', name: out.name, ok: out.ok, text: toolResultLine(out.name, out.text) }],
          }
          applyWorkspace(merged)
          setShown(merged.events.length)
          roundBase = merged
        },
      })

      if (ac.signal.aborted) return
      if (!planUsesCodingAgent(plan) && (run.text || '').trim()) {
        lastParsed = parseAgentRun(run.text || '', plan)
        merged = mergeWorkspace(origin, lastParsed)
      } else if (run.files && Object.keys(run.files).length) {
        merged = absorbFiles(merged, run.files, plan)
      } else {
        merged = absorbFiles(merged, merged.files, plan)
      }
      if (plan.mode === 'chat' || plan.mode === 'ask' || plan.mode === 'plan') {
        merged = { ...merged, files: origin.files, previewHtml: origin.previewHtml }
      } else {
        merged = attachChangeDiffs(origin.files, merged, prior)
      }
      applyWorkspace(merged)
      setShown(merged.events.length)
      setStep('')
      setLivePlan(null)
      setLiveFiles([])
      const delivered = workspaceDelivered(plan, merged, origin.files)
      if (!delivered && (plan.mode === 'build' || plan.mode === 'app' || plan.mode === 'code' || isFollowUpTask(plan))) {
        setStatus('The agent finished without changing the code. Tap Retry.')
      }
      const turnSlice = merged.events.slice(prior)
      const openAsk = latestOpenAsk(turnSlice)
      const openPlan = latestOpenPlan(turnSlice)
      let spoken = delivered
        ? spokenRecap({ ...merged, events: turnSlice, mode: plan.mode })
        : isFollowUpTask(plan)
          ? 'I read the files but did not change the code. Tap Retry and I will write the change.'
          : 'I finished without writing the files. Tap Retry and I will build the app again.'
      if (openAsk || openPlan) {
        spoken = ''
      } else if (plan.mode === 'chat') {
        spoken = finishChatReply(run.text || '', turnSlice)
      } else if (plan.mode === 'ask' || plan.mode === 'plan') {
        spoken = chatReplyFromRun(run.text || '', turnSlice) || spoken
      }
      const elapsedSec = Math.max(1, Math.round((Date.now() - liveStarted.current) / 1000))
      const done: StudioMessage[] = [
        ...next,
        {
          role: 'assistant',
          content: spoken,
          elapsed: elapsedSec,
          picked: isAutoModel(model) && picked ? `Auto · ${picked.name}` : undefined,
        },
      ]
      setLiveReply('')
      setMessages(done)
      void persist(done, merged)
      const turnEvents = merged.events.slice(prior)
      const ranMcpTool = turnEvents.some((item) => item.kind === 'tool' && item.name === 'mcp')
      let files = merged.files
      for (const event of turnEvents) {
        if (event.kind === 'folder') files = ensureFolder(files, event.path)
        if (event.kind === 'document') {
          if (event.path && isSecretPath(event.path)) continue
          const body = redactSecrets((event.path && merged.files[event.path]) || spoken)
          void createDocument(event.title, body, event.folder || '').catch(() => undefined)
        }
        if (event.kind === 'mcp' && event.tool && !ranMcpTool) {
          const conn = connectors.find((row) => row.name === event.server || row.id === event.server)
          if (conn?.connected)
            void studioMcpCall({
              connectorId: conn.id,
              tool: event.tool,
              args: event.detail ? { detail: redactSecrets(event.detail) } : undefined,
            }).catch(() => undefined)
        }
      }
      if (files !== merged.files) {
        const withFolders = { ...merged, files }
        applyWorkspace(withFolders)
        void persist(done, withFolders)
      }
      setBenchTab(defaultWorkbenchTab(merged))
      if (merged.previewHtml && plan.mode !== 'chat' && plan.mode !== 'ask' && plan.mode !== 'plan') {
        openBench('desktop')
      }
      const artifact = merged.events.slice(prior).find((item) => item.kind === 'artifact')
      if (artifact && artifact.kind === 'artifact') setFocusPath(artifact.path)
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError'
      if (aborted && ac.signal.aborted) {
        setStep('')
        setLivePlan(null)
        setLiveFiles([])
        setLiveThought('')
        setBusy(false)
        return
      }
      if (aborted || isTransientStreamError(error instanceof Error ? error.message : '')) {
        setStatus(friendlyStreamError(error instanceof Error ? error.message : 'terminated'))
        return
      }
      applyWorkspace({
        ...workspaceRef.current,
        events: workspaceRef.current.events.slice(0, turnStart),
      })
      setShown(turnStart)
      const message = error instanceof Error ? error.message : 'Request failed'
      pushLog(message)
      setStatus(friendlyStreamError(message))
    } finally {
      if (abortRef.current === ac) abortRef.current = null
      setStep('')
      setLivePlan(null)
      setLiveFiles([])
      setLiveThought('')
      setBusy(false)
    }
  }

  function replayLast() {
    const last = lastSendRef.current
    if (!last || busy) return
    void onSend(undefined, last.text, last.files, true)
  }

  async function finishConnect(event: Extract<AgentWorkspace['events'][number], { kind: 'connect' }>) {
    if (!event.code || busy) return
    try {
      const status = await pollConnectDevice(event.code)
      const connected = status.status === 'authorized'
      const events = workspaceRef.current.events.map((item) =>
        item.kind === 'connect' && item.code === event.code ? { ...item, connected, detail: status.detail || item.detail } : item,
      )
      const next = { ...workspaceRef.current, events }
      applyWorkspace(next)
      void persist(messages, next)
      if (connected) {
        const listed = await fetchConnectors().catch(() => null)
        if (listed) setConnectors(listed.connectors)
        const task = lastTaskRef.current || ''
        const onlyConnect = /^(please\s+)?(connect|sign in|signin|log in|login)\b/i.test(task.trim())
        if (!onlyConnect && task) replayLast()
      } else {
        setStatus(status.detail || 'Still waiting. Open the link, enter the code, then try again.')
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not check that connection')
    }
  }

  function restoreQuestions(userText: string) {
    if (busy) return
    const next = restoreAskEvent(workspaceRef.current, userText)
    applyWorkspace(next)
    setShown(next.events.length)
    void persist(messages, next)
  }

  function submitAsk(answers: Record<string, string[]>) {
    const card = latestOpenAsk(workspaceRef.current.events)
    if (!card || busy) return
    applyWorkspace(applyAskAnswers(workspaceRef.current, answers))
    const capability = card.questions.some((item) => item.id === 'skill' || item.id === 'mcp')
    if (capability) {
      const labels = answers.skill || []
      const picked = skills.filter((skill) => labels.includes(skill.name) || labels.includes(skill.id))
      if (picked.length) {
        setAttachedSkills((current) => [...current, ...picked.filter((item) => !current.some((row) => row.id === item.id))])
      }
      skipGateRef.current = true
      const task = lastTaskRef.current
      const files = lastSendRef.current?.files
      void onSend(undefined, task, files, true)
      return
    }
    void onSend(undefined, formatAskReply(card.questions, answers))
  }

  function skipAsk() {
    if (busy) return
    const card = latestOpenAsk(workspaceRef.current.events)
    if (card) applyWorkspace(applyAskAnswers(workspaceRef.current, {}))
    const capability = card?.questions.some((item) => item.id === 'skill' || item.id === 'mcp')
    if (capability) {
      skipGateRef.current = true
      void onSend(undefined, lastTaskRef.current, lastSendRef.current?.files, true)
      return
    }
    void onSend(undefined, formatSkipAsk())
  }

  function approvePlan() {
    if (busy) return
    applyWorkspace(applyPlanApproval(workspaceRef.current))
    void onSend(undefined, formatApprovePlan())
  }

  function stopVoice() {
    listeningRef.current = false
    const rec = voiceRef.current
    voiceRef.current = null
    try {
      rec?.stop()
    } catch {
      /* already stopped */
    }
    setListening(false)
  }

  function startVoice() {
    if (listeningRef.current) {
      stopVoice()
      return
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!Ctor) {
      setStatus('Voice is not supported in this browser. Use Chrome.')
      return
    }
    const rec = new Ctor()
    rec.lang = navigator.language || 'en-US'
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1
    voiceBaseRef.current = prompt.trim()
    listeningRef.current = true
    voiceRef.current = rec

    rec.onresult = (event) => {
      let live = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = (event.results[i]?.[0]?.transcript || '').replace(/\s+/g, ' ').trim()
        if (!piece) continue
        if (event.results[i].isFinal) {
          voiceBaseRef.current = [voiceBaseRef.current, piece].filter(Boolean).join(' ')
        } else {
          live = piece
        }
      }
      setPrompt([voiceBaseRef.current, live].filter(Boolean).join(' '))
      inputRef.current?.focus()
    }
    rec.onend = () => {
      if (!listeningRef.current || voiceRef.current !== rec) {
        setListening(false)
        if (voiceRef.current === rec) voiceRef.current = null
        return
      }
      try {
        rec.start()
      } catch {
        window.setTimeout(() => {
          if (!listeningRef.current || voiceRef.current !== rec) return
          try {
            rec.start()
          } catch {
            stopVoice()
          }
        }, 160)
      }
    }
    rec.onerror = (event) => {
      const err = event.error
      if (err === 'aborted') return
      if (err === 'no-speech' || err === 'network') return
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        setStatus('Allow the microphone to use voice.')
        stopVoice()
        return
      }
      stopVoice()
    }

    setListening(true)
    setStatus('')
    try {
      rec.start()
      inputRef.current?.focus()
    } catch {
      stopVoice()
      setStatus('Could not start the microphone.')
    }
  }

  useEffect(() => {
    function onDragOver(event: globalThis.DragEvent) {
      if (!dropHasFiles(event.dataTransfer)) return
      event.preventDefault()
    }
    function onDrop(event: globalThis.DragEvent) {
      if (!dropHasFiles(event.dataTransfer)) return
      const target = event.target as HTMLElement | null
      if (target?.closest?.('[data-chat-drop-zone]')) return
      event.preventDefault()
      void attachChatFiles(filesFromDrop(event.dataTransfer))
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    function onPaste(event: ClipboardEvent) {
      const files = filesFromClipboard(event.clipboardData)
      if (!files.length) return
      if (pasteBelongsToField(event.target, inputRef.current)) return
      event.preventDefault()
      void attachChatFiles(files)
    }
    window.addEventListener('paste', onPaste)
    return () => {
      listeningRef.current = false
      try {
        voiceRef.current?.stop()
      } catch {
        /* ignore */
      }
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('paste', onPaste)
    }
  }, [])

  const botThreadLabel = savedId ? title.slice(0, 32) || 'Soumtok Bot' : 'New Bot'

  const botComposer = (
    <SoumtokBotComposer
      prompt={prompt}
      setPrompt={setPrompt}
      busy={busy}
      listening={listening}
      onSend={onSend}
      onVoice={startVoice}
      inputRef={inputRef}
      pendingFiles={pendingFiles}
      onPendingFiles={dropPendingFiles}
      onAttachFiles={attachChatFiles}
      fileError={fileError}
      onFileError={setFileError}
      onStop={stopRun}
      threadLabel={botThreadLabel}
    />
  )

  const composer = isBot ? botComposer : (
    <StudioComposer
      prompt={prompt}
      setPrompt={setPrompt}
      busy={busy}
      listening={listening}
      onSend={onSend}
      onVoice={startVoice}
      sourceOpen={sourceOpen}
      setSourceOpen={setSourceOpen}
      project={project}
      setProject={attachGithub}
      githubConnected={githubConnected}
      installUrl={installUrl}
      onRefreshRepos={() =>
        fetchGithubRepos()
          .then((data) => {
            setRepos(data.repos)
            setGithubConnected(data.connected)
            setInstallUrl(data.installUrl)
          })
          .catch(() => undefined)
      }
      projectOpen={projectOpen}
      setProjectOpen={setProjectOpen}
      repos={repos}
      multitask={multitask}
      setMultitask={setMultitask}
      modelOpen={modelOpen}
      setModelOpen={setModelOpen}
      models={models}
      model={model}
      setModel={setModel}
      selectedName={isAutoModel(model) ? 'Auto' : modelTriggerLabel(selected, 'Choose model')}
      inputRef={inputRef}
      compact={messages.length > 0}
      runMode={runMode}
      setRunMode={setRunMode}
      workspaceFiles={Object.keys(workspace.files)}
      userSkills={skills}
      attachedSkills={attachedSkills}
      pendingFiles={pendingFiles}
      onPendingFiles={dropPendingFiles}
      onAttachFiles={attachChatFiles}
      fileError={fileError}
      onFileError={setFileError}
      onAttachSkill={(skill) => {
        setAttachedSkills((current) => (current.some((item) => item.id === skill.id) ? current : [...current, skill]))
      }}
      onStop={stopRun}
    />
  )

  const workbench = (
    <AgentWorkbench
      workspace={workspace}
      tab={benchTab}
      onTab={setBenchTab}
      control={control}
      onControl={(value) => {
        setControl(value)
        if (value) setDeskFull(true)
        else setDeskFull(false)
      }}
      expanded={deskFull || control}
      onExpand={(value) => {
        setDeskFull(value)
        if (!value) setControl(false)
      }}
      onArchive={closeBench}
      projectId={savedId}
      plan={billingPlan}
      busy={busy}
      focusPath={focusPath}
      onOpenEnv={openEnvFile}
      onAcceptDiff={(path) => {
        const next = applyDiffDecision(workspaceRef.current, path, true)
        applyWorkspace(next)
        void persist(messages, next)
      }}
      onRejectDiff={(path) => {
        const next = applyDiffDecision(workspaceRef.current, path, false)
        applyWorkspace(next)
        void persist(messages, next)
      }}
      onRunCommand={async (command) => {
        const ran = await studioRunCommand(command, workspaceRef.current.files)
        return ran.text
      }}
      repo={project}
      onCommit={async (message) => {
        if (!project) throw new Error('Attach a GitHub repository first')
        const files = Object.fromEntries(
          Object.entries(workspaceRef.current.files).filter(([path]) => !isSecretPath(path)),
        )
        const committed = await studioCommitRepo(project.fullName, message, files)
        const next = {
          ...workspaceRef.current,
          events: [
            ...workspaceRef.current.events,
            { kind: 'command' as const, command: `git commit -m ${JSON.stringify(message)}` },
            {
              kind: 'result' as const,
              name: 'github',
              ok: true,
              text: `Committed ${committed.sha.slice(0, 7)} to ${committed.branch} · ${committed.count} files`,
            },
          ],
        }
        applyWorkspace(next)
        void persist(messages, next)
        return committed.url
      }}
      onPullRequest={async (title) => {
        if (!project) throw new Error('Attach a GitHub repository first')
        const files = Object.fromEntries(
          Object.entries(workspaceRef.current.files).filter(([path]) => !isSecretPath(path)),
        )
        const pull = await studioOpenPull(project.fullName, title, files)
        const next = {
          ...workspaceRef.current,
          events: [
            ...workspaceRef.current.events,
            { kind: 'command' as const, command: `git commit -m ${JSON.stringify(title)}` },
            {
              kind: 'result' as const,
              name: 'github',
              ok: true,
              text: `Opened PR #${pull.number} ${pull.branch} → ${pull.base}`,
            },
          ],
        }
        applyWorkspace(next)
        void persist(messages, next)
        return pull.prUrl
      }}
      onPasteFiles={attachChatFiles}
      onSaveFile={(path, content) => {
        const next = {
          ...workspaceRef.current,
          files: { ...workspaceRef.current.files, [path]: content },
        }
        applyWorkspace(next)
        void persist(messages, next)
      }}
    />
  )
  const chatFeed = !chatReady ? (
    <div className="grid min-h-0 flex-1 place-items-center" role="status" aria-live="polite">
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-white/70" />
      <span className="sr-only">Loading chat</span>
    </div>
  ) : (
    <>
      {messages.length > 0 && (
        <div className="flex items-center justify-between px-5 py-3">
          <p className="truncate text-[14px] text-white/80">{title}</p>
          <button
            type="button"
            onClick={() => (hasBench ? closeBench() : openComputer())}
            className="rounded-md px-2 py-1 text-[12px] text-white/45 hover:text-white"
          >
            {hasBench ? 'Back to chat' : 'Review'}
          </button>
        </div>
      )}
      <div ref={feedRef} className="thin-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-5 sm:px-5 sm:py-6">
        {messages.length === 0 ? (
          <div className="mx-auto flex min-h-[60vh] max-w-[720px] flex-col justify-center sm:min-h-[70vh]">
            {composer}
          </div>
        ) : (
          <div className="mx-auto max-w-[720px] space-y-8 pb-16">
            {project && <p className="text-[12px] text-white/35">Project · {project.fullName}</p>}
            {attachedSkills.length > 0 && (
              <p className="text-[12px] text-white/35">
                Skills · {attachedSkills.map((skill) => skill.name).join(', ')}
              </p>
            )}
            {(() => {
              const turns = buildTurns(messages, workspace.marks || [0], workspace.events.length)
              if (turns.length > 0) {
                const last = turns[turns.length - 1]
                last.to = Math.max(last.from, shown)
              }
              return turns
            })().map((turn, index, all) => {
              const latest = index === all.length - 1
              const turnEvents = visibleWorkEvents(
                workspace.events.slice(turn.from, turn.to).filter((event) => {
                  if (event.kind === 'summary') return false
                  if (busy && latest && (event.kind === 'preview' || event.kind === 'artifact')) return false
                  return true
                }),
                latest && busy,
              )
              const waitingOnCard = turnEvents.some(
                (event) =>
                  (event.kind === 'ask' && !event.answers) || (event.kind === 'plan' && !event.approved),
              )
              const answeredLater = all.slice(index + 1).some((item) => isAskReply(item.user))
              const hideHandoff =
                looksLikeAskHandoff(turn.replies.join('\n')) && (waitingOnCard || answeredLater)
              return (
                <div
                  key={`${turn.from}-${index}`}
                  data-latest-turn={latest ? '' : undefined}
                  className={`scroll-mt-3 ${index === 0 ? '' : 'border-t border-white/[0.06] pt-6'}`}
                >
                  <div className="mb-3">
                    <UserBubble text={turn.user} files={turn.files} />
                  </div>
                  <div className="space-y-3">
                    {latest && busy ? (
                      <AgentLiveCard
                        mode={livePlan?.mode || runMode}
                        step={step || 'Analyzing and understanding'}
                        files={livePlan?.mode === 'chat' || livePlan?.mode === 'ask' || livePlan?.mode === 'plan' ? [] : liveFiles}
                        preview={
                          liveFiles.at(-1) && workspace.files[liveFiles.at(-1) || '']
                            ? { path: liveFiles.at(-1) || '', text: workspace.files[liveFiles.at(-1) || ''] || '' }
                            : undefined
                        }
                        elapsed={Math.max(0, (now - liveStarted.current) / 1000)}
                        picked={livePicked || undefined}
                        understanding={liveThought || undefined}
                      />
                    ) : turn.elapsed != null ? (
                      <AgentLiveCard
                        mode={
                          turnEvents.some((event) => event.kind === 'diff' || event.kind === 'tool')
                            ? 'build'
                            : 'chat'
                        }
                        step={
                          turnEvents.some((event) => event.kind === 'diff' || event.kind === 'tool')
                            ? 'Writing the change'
                            : 'Answering'
                        }
                        files={[]}
                        elapsed={turn.elapsed || 1}
                        done
                        picked={turn.picked}
                      />
                    ) : null}
                    {turn.logs
                      .filter((line) => /fail|error|too long|could not/i.test(line))
                      .map((line, logIndex) => (
                      <p key={`log-${index}-${logIndex}`} className="text-[13px] text-white/40">
                        {line}
                      </p>
                    ))}
                    {turnEvents.length > 0 && (
                    <AgentTimeline
                      events={turnEvents}
                      files={workspace.files}
                      collapsed={!latest}
                      live={latest && busy}
                      interactive={latest && !busy}
                      onPreview={() => openComputer()}
                      onReview={() => openComputer()}
                      onOpenFile={(path) => {
                        setFocusPath(path)
                        openComputer()
                      }}
                      onOpenKeys={() => openTab('/dashboard/keys')}
                      onAsk={submitAsk}
                      onSkipAsk={skipAsk}
                      onApprovePlan={approvePlan}
                      onAcceptDiff={(path) => {
                        const next = applyDiffDecision(workspaceRef.current, path, true)
                        applyWorkspace(next)
                        void persist(messages, next)
                      }}
                      onRejectDiff={(path) => {
                        const next = applyDiffDecision(workspaceRef.current, path, false)
                        applyWorkspace(next)
                        void persist(messages, next)
                      }}
                      onChangePlan={() => {
                        setPrompt('Change the plan: ')
                        inputRef.current?.focus()
                      }}
                      onPrompt={(text) => void onSend(undefined, text)}
                      onConnectDone={(event) => void finishConnect(event)}
                      messages={messages}
                    />
                    )}
                    {(turn.replies.length > 0 ||
                      (latest && busy && liveReply && !waitingOnCard) ||
                      (latest && !busy && canReplay && !waitingOnCard)) &&
                      !hideHandoff && (
                      <ReplyCard
                        replies={latest && busy && liveReply ? [liveReply] : turn.replies}
                        onRegenerate={latest && !busy && canReplay ? replayLast : undefined}
                        regenerateLabel={status ? 'Retry' : 'Regenerate'}
                        onShowQuestions={
                          !busy && looksLikeAskHandoff(turn.replies.join('\n'))
                            ? () => restoreQuestions(turn.user)
                            : undefined
                        }
                      />
                    )}
                  </div>
                </div>
              )
            })}
            <div data-feed-end />
          </div>
        )}
      </div>
      {messages.length > 0 && (
        <div className="px-3 pb-4 sm:px-5 sm:pb-6">
          <div className="mx-auto max-w-[720px]">
            {(() => {
              const realFiles = Object.entries(workspace.files).filter(
                ([path, body]) =>
                  !isSecretPath(path) && path !== '.gitignore' && !path.endsWith('/.keep') && Boolean(body?.trim()),
              )
              return !busy && realFiles.length > 0
            })() && (
              <button
                type="button"
                onClick={() => window.open('https://github.com/new', '_blank', 'noopener,noreferrer')}
                className="mb-3 rounded-full border border-white/12 bg-[#141413] px-3 py-1.5 text-[13px] text-white/70 hover:text-white"
              >
                Create repo
              </button>
            )}
            {composer}
            {!busy && followUpPrompts(workspace).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {followUpPrompts(workspace).map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => void onSend(undefined, chip)}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[12px] text-white/55 hover:border-white/20 hover:text-white"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}
            {status && (
              <div className="mt-2 flex items-center gap-3">
                <p className="text-[12px] text-[#f54e00]">{status}</p>
                {canReplay && !busy && (
                  <button type="button" onClick={replayLast} className="text-[12px] text-white/55 hover:text-white">
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {messages.length === 0 && status && (
        <p className="px-5 pb-6 text-center text-[12px] text-[#f54e00]">{status}</p>
      )}
    </>
  )

  const fillDesk = hasBench && (control || deskFull)

  if (isBot) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-[#050505]">
        <SoumtokBotChatHeader title={botThreadLabel} />
        <div
          className="relative flex min-h-0 flex-1 flex-col"
          data-chat-drop-zone
          onDragEnter={onChatDragEnter}
          onDragOver={onChatDragOver}
          onDragLeave={onChatDragLeave}
          onDrop={onChatDrop}
        >
          {fileDrag && (
            <div className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-2xl border border-dashed border-[#f54e00]/70 bg-[#0c0c0b]/80">
              <p className="rounded-full border border-white/12 bg-[#161615] px-4 py-2 text-[14px] text-white">Drop files to attach</p>
            </div>
          )}
          {!chatReady ? (
            <div className="grid flex-1 place-items-center" role="status">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-white/70" />
            </div>
          ) : (
            <>
              <div ref={feedRef} className="thin-scroll min-h-0 flex-1 overflow-y-auto">
                {messages.length === 0 ? (
                  <SoumtokBotOnboarding displayName={displayName} busy={busy} onPick={(text) => void onSend(undefined, text)} />
                ) : (
                  <div className="mx-auto max-w-[720px] space-y-8 px-4 py-8 sm:px-6">
                    {messages.map((item, index) =>
                      item.role === 'user' ? (
                        <div key={`u-${index}`} className="flex justify-end">
                          <div className="max-w-[85%] rounded-2xl bg-[#1f1f1f] px-4 py-2.5 text-[15px] text-white">{item.content}</div>
                        </div>
                      ) : item.role === 'assistant' ? (
                        <div key={`a-${index}`} className="text-[15px] leading-7 text-white/90">
                          <ReplyMarkdown text={item.content} />
                        </div>
                      ) : null,
                    )}
                    {busy && (
                      <AgentLiveCard
                        mode={livePlan?.mode || runMode}
                        step={step || 'Working on it'}
                        files={[]}
                        elapsed={Math.max(0, (now - liveStarted.current) / 1000)}
                        picked={livePicked || undefined}
                        understanding={liveThought || undefined}
                      />
                    )}
                    {liveReply && busy && (
                      <div className="text-[15px] leading-7 text-white/90">
                        <ReplyMarkdown text={liveReply} />
                      </div>
                    )}
                    <div data-feed-end />
                  </div>
                )}
              </div>
              {botComposer}
              {status && (
                <p className="pb-2 text-center text-[12px] text-[#f54e00]">
                  {status}
                  {canReplay && !busy && (
                    <button type="button" onClick={replayLast} className="ml-2 text-white/55 hover:text-white">
                      Retry
                    </button>
                  )}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div ref={layoutRef} className="flex min-h-0 flex-1">
      <div
        className={`relative flex min-h-0 min-w-0 flex-col ${fillDesk ? 'hidden lg:hidden' : ''}`}
        style={hasBench && !fillDesk ? { width: `${100 - benchPct}%`, maxWidth: 'none' } : { width: fillDesk ? 0 : '100%' }}
        data-chat-drop-zone
        onDragEnter={onChatDragEnter}
        onDragOver={onChatDragOver}
        onDragLeave={onChatDragLeave}
        onDrop={onChatDrop}
      >
        {fileDrag && (
          <div className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-2xl border border-dashed border-[#f54e00]/70 bg-[#0c0c0b]/80">
            <p className="rounded-full border border-white/12 bg-[#161615] px-4 py-2 text-[14px] text-white">Drop files to attach</p>
          </div>
        )}
        {chatFeed}
      </div>
      {hasBench && !fillDesk && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize preview"
          onPointerDown={onSplitDown}
          onPointerMove={onSplitMove}
          onPointerUp={() => {
            splitDrag.current = false
          }}
          onPointerCancel={() => {
            splitDrag.current = false
          }}
          className="group relative hidden w-1.5 shrink-0 cursor-col-resize bg-transparent lg:block"
        >
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/10 group-hover:bg-white/35 group-active:bg-white/50" />
        </div>
      )}
      {hasBench && (
        <div
          className={`min-h-0 min-w-0 ${fillDesk ? 'flex flex-1' : 'hidden lg:flex'}`}
          style={fillDesk ? { width: '100%' } : { width: `${benchPct}%` }}
        >
          {workbench}
        </div>
      )}
      {hasBench && mobileBench && !fillDesk && (
        <div className="fixed inset-0 z-40 flex flex-col bg-[#0c0c0b] lg:hidden">
          <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
            <p className="text-[14px] text-white/80">Review</p>
            <button type="button" className="text-[13px] text-white/55" onClick={() => setMobileBench(false)}>
              Close
            </button>
          </div>
          {workbench}
        </div>
      )}
    </div>
  )
}

function SourcePicker({
  open,
  onToggle,
  onClose,
  project,
  setProject,
  repos,
  githubConnected,
  installUrl,
}: {
  open: boolean
  onToggle: () => void
  onClose: () => void
  project: GithubRepo | null
  setProject: (value: GithubRepo | null) => void
  repos: GithubRepo[]
  githubConnected: boolean
  installUrl: string
}) {
  const [box, setBox] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      setBox(null)
      return
    }
    function place() {
      const el = rootRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const width = 340
      const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8)
      const spaceBelow = window.innerHeight - rect.bottom
      if (spaceBelow < 280 && rect.top > spaceBelow) {
        setBox({ left, bottom: window.innerHeight - rect.top + 8 })
      } else {
        setBox({ left, top: rect.bottom + 8 })
      }
    }
    place()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('resize', place)
    }
  }, [open, onClose])

  async function connectGithub() {
    setBusy(true)
    try {
      await signIn.social({ provider: 'github', callbackURL: '/dashboard/studio' })
    } catch {
      setBusy(false)
    }
  }

  return (
    <div ref={rootRef} className="relative mb-5 flex justify-center">
      <button
        type="button"
        onClick={onToggle}
        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[13px] ${
          open
            ? 'border-white/20 bg-[#141413] text-white'
            : 'border-white/12 bg-[#141413] text-white/55 hover:border-white/20 hover:text-white'
        }`}
      >
        {project ? project.fullName : 'Start from scratch'}
        <span className="text-[10px] text-white/35">▾</span>
      </button>
      {open && box && (
        <div
          className="fixed z-50 w-[min(340px,calc(100vw-24px))] max-w-[calc(100vw-16px)] overflow-hidden rounded-xl border border-white/15 bg-[#1a1a18] shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
          style={{ left: box.left, top: box.top, bottom: box.bottom }}
        >
          <button
            type="button"
            onClick={() => {
              setProject(null)
              onClose()
            }}
            className={`flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-white/[0.05] ${
              !project ? 'bg-white/[0.04]' : ''
            }`}
          >
            <span>
              <span className="block text-[13px] text-white">Start from scratch</span>
              <span className="block text-[12px] text-white/40">Empty chat. No repo attached.</span>
            </span>
            {!project && (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M3 7.2 5.7 10 11 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          <div className="mx-3 border-t border-white/[0.08]" />
          <p className="px-3 pb-1 pt-2.5 text-[11px] uppercase tracking-[0.06em] text-white/35">Connect a project</p>
          <div className="thin-scroll max-h-[240px] overflow-y-auto pb-1">
            {repos.map((repo) => (
              <button
                key={repo.id}
                type="button"
                onClick={() => {
                  setProject(repo)
                  onClose()
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-white/[0.05] ${
                  project?.id === repo.id ? 'bg-white/[0.04]' : ''
                }`}
              >
                <span>
                  <span className="block text-[13px] text-white">{repo.fullName}</span>
                  <span className="block text-[11px] text-white/40">
                    {repo.private ? 'Private' : 'Public'}
                    {repo.language ? ` · ${repo.language}` : ''}
                  </span>
                </span>
                {project?.id === repo.id && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <path d="M3 7.2 5.7 10 11 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ))}
            {repos.length === 0 && (
              <div className="px-3 py-3">
                <p className="text-[13px] leading-5 text-white/45">
                  {githubConnected
                    ? 'GitHub is connected, but no repos are granted yet.'
                    : 'Connect GitHub to attach a repo to this chat.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!githubConnected && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={connectGithub}
                      className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-black disabled:opacity-50"
                    >
                      {busy ? 'Connecting…' : 'Connect GitHub'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = installUrl
                    }}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-[13px] text-white/75 hover:bg-white/[0.05]"
                  >
                    Grant repos
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: {
    resultIndex: number
    results: ArrayLike<{ isFinal?: boolean } & ArrayLike<{ transcript: string }>>
  }) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
  start: () => void
  stop: () => void
}

function StudioComposer({
  prompt,
  setPrompt,
  busy,
  listening,
  onSend,
  onVoice,
  sourceOpen,
  setSourceOpen,
  project,
  setProject,
  githubConnected,
  installUrl,
  onRefreshRepos,
  projectOpen,
  setProjectOpen,
  repos,
  modelOpen,
  setModelOpen,
  models,
  model,
  setModel,
  selectedName,
  inputRef,
  compact,
  runMode,
  setRunMode,
  workspaceFiles = [],
  multitask,
  setMultitask,
  userSkills,
  attachedSkills,
  onAttachSkill,
  pendingFiles,
  onPendingFiles,
  onAttachFiles,
  fileError,
  onFileError,
  onStop,
}: {
  prompt: string
  setPrompt: (value: string) => void
  busy: boolean
  listening: boolean
  onSend: (event?: FormEvent) => void
  onVoice: () => void
  sourceOpen: boolean
  setSourceOpen: (value: boolean) => void
  project: GithubRepo | null
  setProject: (value: GithubRepo | null) => void
  githubConnected: boolean
  installUrl: string
  onRefreshRepos: () => void
  projectOpen: boolean
  setProjectOpen: (value: boolean) => void
  repos: GithubRepo[]
  modelOpen: boolean
  setModelOpen: (value: boolean) => void
  models: StudioModel[]
  model: string
  setModel: (value: string) => void
  selectedName: string
  inputRef: RefObject<HTMLTextAreaElement | null>
  compact?: boolean
  runMode: AgentRunMode
  setRunMode: (value: AgentRunMode) => void
  workspaceFiles?: string[]
  multitask: boolean
  setMultitask: (value: boolean) => void
  userSkills: UserSkill[]
  attachedSkills: UserSkill[]
  onAttachSkill: (skill: UserSkill) => void
  pendingFiles: ChatFile[]
  onPendingFiles: (files: ChatFile[]) => void
  onAttachFiles?: (files: File[]) => Promise<void> | void
  fileError: string
  onFileError: (value: string) => void
  onStop: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [composerDrag, setComposerDrag] = useState(false)
  const media = isAutoModel(model)
    ? models
        .filter((item) => item.ready)
        .reduce(
          (acc, item) => {
            const can = item.media || modelMedia(item.id)
            return {
              image: acc.image || can.image,
              video: acc.video || can.video,
              pdf: acc.pdf || can.pdf,
            }
          },
          { image: false, video: false, pdf: false },
        )
    : models.find((item) => item.id === model)?.media || modelMedia(model)
  const canSend = Boolean(prompt.trim() || pendingFiles.length)
  const [mediaHint, setMediaHint] = useState<'image' | 'video' | 'pdf' | null>(null)
  const slashes = slashMatch(prompt)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0px'
    const min = compact ? 28 : 96
    const max = compact ? 168 : 240
    el.style.height = `${Math.min(max, Math.max(min, el.scrollHeight))}px`
  }, [prompt, compact, pendingFiles.length])

  async function addFiles(list: File[]) {
    if (!list.length) return
    if (onAttachFiles) {
      await onAttachFiles(list)
      const guessed = list.map((file) => ({
        name: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
      }))
      setMediaHint(mediaGap([...pendingFiles, ...guessed].slice(0, 6), media))
      return
    }
    const result = await readChatFiles(list)
    onFileError(result.error || '')
    if (!result.files.length) return
    const next = [...pendingFiles, ...result.files].slice(0, 6)
    onPendingFiles(next)
    setMediaHint(mediaGap(next, media))
    for (const file of list) {
      if (/\.(md|txt|skill)$/i.test(file.name) && /skill/i.test(`${file.name}`)) {
        void uploadSkill(file)
          .then((skill) => onAttachSkill(skill))
          .catch(() => undefined)
      }
    }
  }

  return (
    <form onSubmit={onSend}>
      {!compact && (
        <SourcePicker
          open={sourceOpen}
          onToggle={() => {
            setSourceOpen(!sourceOpen)
            setProjectOpen(false)
            setModelOpen(false)
            if (!sourceOpen) onRefreshRepos()
          }}
          onClose={() => setSourceOpen(false)}
          project={project}
          setProject={setProject}
          repos={repos}
          githubConnected={githubConnected}
          installUrl={installUrl}
        />
      )}
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
        className={`relative rounded-2xl border border-white/10 bg-[#141413] px-3 py-2.5 sm:px-4 sm:py-3 ${composerDrag ? 'ring-2 ring-[#f54e00]/55' : ''}`}
        onDragEnter={(event) => {
          if (!dropHasFiles(event.dataTransfer)) return
          event.preventDefault()
          dragDepth.current += 1
          setComposerDrag(true)
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
            setComposerDrag(false)
          }
        }}
        onDrop={(event) => {
          event.preventDefault()
          dragDepth.current = 0
          setComposerDrag(false)
          void addFiles(filesFromDrop(event.dataTransfer))
        }}
      >
        {composerDrag && (
          <div className="pointer-events-none absolute inset-2 z-10 grid place-items-center rounded-xl border border-dashed border-[#f54e00]/60 bg-[#0c0c0b]/85">
            <p className="text-[13px] text-white">Drop images, video, or documents</p>
          </div>
        )}
        {pendingFiles.length > 0 && (
          <FileThumbs
            files={pendingFiles}
            onRemove={(index) => onPendingFiles(pendingFiles.filter((_, i) => i !== index))}
          />
        )}
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
          rows={compact ? 1 : 4}
          placeholder={
            compact
              ? 'Paste a screenshot or add a follow up'
              : 'Ask anything — paste a screenshot to show what to fix. Type / for commands'
          }
          className={`w-full resize-none overflow-y-auto bg-transparent text-[15px] leading-6 outline-none placeholder:text-white/32 ${
            compact ? 'min-h-[28px] max-h-40 py-0.5' : 'min-h-[96px] max-h-60'
          }`}
        />
        {slashes.length > 0 && (
          <div className="mb-2 overflow-hidden rounded-xl border border-white/10 bg-[#1a1a18]">
            {slashes.slice(0, 7).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPrompt(item.insert)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-white/[0.04]"
              >
                <span className="font-mono text-[12px] text-white/50">{item.slash}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-white/80">{item.label}</span>
                <span className="hidden text-[12px] text-white/35 sm:inline">{item.hint}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <AddMenu
              open={projectOpen}
              onToggle={() => {
                setProjectOpen(!projectOpen)
                setModelOpen(false)
              }}
              onClose={() => setProjectOpen(false)}
              repos={repos}
              project={project}
              setProject={setProject}
              multitask={multitask}
              setMultitask={setMultitask}
              userSkills={userSkills}
              attachedSkills={attachedSkills}
              onAttachSkill={onAttachSkill}
              onPickFiles={() => fileRef.current?.click()}
              onInsert={(text) => {
                setPrompt(prompt ? `${prompt}\n${text}` : text)
                inputRef.current?.focus()
              }}
            />
            <ModelPicker
              open={modelOpen}
              onToggle={() => {
                setModelOpen(!modelOpen)
                setProjectOpen(false)
              }}
              onClose={() => setModelOpen(false)}
              models={models}
              model={model}
              setModel={setModel}
              selectedName={selectedName}
            />
            <div className="hidden shrink-0 items-center rounded-full border border-white/10 p-0.5 md:flex">
              {(['agent', 'ask', 'plan'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setRunMode(mode)}
                  className={`rounded-full px-2 py-0.5 text-[11px] capitalize ${
                    runMode === mode ? 'bg-white/12 text-white' : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            {workspaceFiles.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const path = workspaceFiles[0]
                  setPrompt(prompt ? `${prompt} @${path}` : `@${path}`)
                  inputRef.current?.focus()
                }}
                className="hidden max-w-[120px] truncate rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/40 hover:text-white/70 sm:inline"
                title="Mention a file"
              >
                @{workspaceFiles[0].split('/').pop()}
              </button>
            )}
            {multitask && (
              <span className="hidden h-8 items-center rounded-lg px-2 text-[12px] text-white/45 sm:inline-flex">
                Multitask
                <button type="button" className="ml-1.5 text-white/30" onClick={() => setMultitask(false)}>
                  ×
                </button>
              </span>
            )}
            {project && (
              <span className="hidden h-8 max-w-[140px] items-center truncate text-[12px] text-white/40 sm:inline-flex">
                {project.name}
                <button type="button" className="ml-1.5 text-white/30" onClick={() => setProject(null)}>
                  ×
                </button>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {!busy && (
              <button
                type="button"
                onClick={onVoice}
                className={`grid h-8 w-8 place-items-center rounded-full ${
                  listening ? 'bg-[#f54e00] text-white' : 'text-white/50 hover:text-white'
                }`}
                aria-label={listening ? 'Stop voice' : 'Start voice'}
                aria-pressed={listening}
              >
                <MicIcon />
              </button>
            )}
            {busy ? (
              <button
                type="button"
                onClick={onStop}
                className="grid h-8 w-8 place-items-center rounded-full bg-white text-black"
                aria-label="Stop"
              >
                <span className="h-2.5 w-2.5 rounded-[2px] bg-black" />
              </button>
            ) : canSend ? (
              <button
                type="submit"
                className="grid h-8 w-8 place-items-center rounded-full bg-white text-[13px] font-medium text-black"
              >
                ↑
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {fileError && <p className="mt-2 text-[12px] text-[#f54e00]">{fileError}</p>}
      {mediaHint && (
        <MediaSwitchPopup
          kind={mediaHint}
          currentName={selectedName}
          models={models}
          onPick={(id) => {
            setModel(id)
            setMediaHint(null)
          }}
          onClose={() => setMediaHint(null)}
        />
      )}

      {!compact && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {PROMPT_COMMANDS.slice(0, 8).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setPrompt(item.insert)
                inputRef.current?.focus()
              }}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-[13px] text-white/70 hover:bg-white/[0.06]"
            >
              {item.slash}
            </button>
          ))}
        </div>
      )}

    </form>
  )
}

const MEDIA_PICK_ORDER = [
  'deepseek-v4-flash-vision-exp',
  'gemini-3.8-flash',
  'claude-sonnet-5',
  'grok-4.6',
  'gpt-6-astra',
  'claude-opus-5',
  'gpt-5.4',
  'gemini-3.5-flash',
]

function MediaKindMark({ kind }: { kind: 'image' | 'video' | 'pdf' }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-white/45">
      {kind === 'video' ? (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="1.5" y="3.5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.3" />
          <path d="M6.5 6.2v3.6L9.8 8 6.5 6.2Z" fill="currentColor" />
        </svg>
      ) : kind === 'pdf' ? (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M4 2.5h5.2L13 6.3V13.5H4V2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M9.2 2.5V6.3H13" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="5.4" cy="6.2" r="1.15" fill="currentColor" />
          <path d="M1.8 11.6 5.6 8.4l2.4 2.1 2.1-2.4 3.9 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}

function modelVendor(id: string) {
  const catalog = CODING_MODELS.find((item) => item.id === id)
  if (!catalog) return ''
  if (catalog.provider === 'xai') return 'xAI'
  if (catalog.provider === 'openai') return 'OpenAI'
  if (catalog.provider === 'anthropic') return 'Anthropic'
  if (catalog.provider === 'google') return 'Google'
  if (catalog.provider === 'deepseek') return 'DeepSeek'
  return ''
}

function MediaSwitchPopup({
  kind,
  currentName,
  models,
  onPick,
  onClose,
}: {
  kind: 'image' | 'video' | 'pdf'
  currentName: string
  models: StudioModel[]
  onPick: (id: string) => void
  onClose: () => void
}) {
  const label = kind === 'video' ? 'video' : kind === 'pdf' ? 'PDFs' : 'images'
  const picks = models
    .filter((item) => {
      const can = item.media || modelMedia(item.id)
      if (kind === 'video') return can.video
      if (kind === 'pdf') return can.pdf
      return can.image
    })
    .sort((a, b) => {
      const ai = MEDIA_PICK_ORDER.indexOf(a.id)
      const bi = MEDIA_PICK_ORDER.indexOf(b.id)
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    })
    .slice(0, 5)
  const title =
    kind === 'video'
      ? 'This model cannot read video'
      : kind === 'pdf'
        ? 'This model cannot read PDFs'
        : 'This model cannot read images'

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-switch-title"
        className="relative w-full max-w-[400px] overflow-hidden rounded-xl border border-white/10 bg-[#161615] shadow-[0_24px_64px_rgba(0,0,0,0.55)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-5 pb-5 pt-4">
          <div className="flex items-start gap-3">
            <MediaKindMark kind={kind} />
            <div className="min-w-0 flex-1 pt-0.5">
              <p id="media-switch-title" className="text-[15px] font-medium leading-5 text-white">
                {title}
              </p>
              <p className="mt-1.5 text-[13px] leading-5 text-white/45">
                {currentName} does not support {label}. Choose a model that does.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-white/35 hover:bg-white/[0.06] hover:text-white"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M2 2l8 8M10 2 2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          {picks.length > 0 ? (
            <ul className="mt-4 divide-y divide-white/[0.06] rounded-lg border border-white/[0.08]">
              {picks.map((item, index) => {
                const suggested = index === 0
                const vendor = modelVendor(item.id)
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onPick(item.id)}
                      className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-white/[0.04]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[13px] text-white">{item.name}</span>
                          {suggested && <span className="shrink-0 text-[11px] text-white/30">Suggested</span>}
                        </span>
                        {vendor && <span className="mt-0.5 block text-[12px] text-white/35">{vendor}</span>}
                      </span>
                      <span className="shrink-0 text-[13px] text-white/40">Use</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="mt-4 rounded-lg border border-white/10 px-3.5 py-3.5">
              <p className="text-[13px] leading-5 text-white/55">
                No model on this plan can read {label}. Pro includes Claude, Gemini, GPT, Grok, and DeepSeek Vision.
              </p>
              <button
                type="button"
                onClick={() => navigate(checkoutPath('pro'))}
                className="mt-3 rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-[#111110]"
              >
                See Pro
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full text-center text-[13px] text-white/35 hover:text-white/65"
          >
            Stay with {currentName}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const SKILLS = [
  { id: 'review', label: 'Review code', insert: 'Review this code and list bugs, risks, and fixes.\n\n' },
  { id: 'tests', label: 'Write tests', insert: 'Write tests for this.\n\n' },
  { id: 'explain', label: 'Explain a file', insert: 'Explain this file like I am joining the repo.\n\n' },
  {
    id: 'brand-logo',
    label: 'Brand logo SVG',
    insert: `${brandLogoContext('add the real svg logo')}\n\n`,
  },
]

const RECENT_SKILLS_KEY = 'soumtok-recent-skills'
const RECENT_SKILLS_MAX = 6

type SkillItem = {
  id: string
  label: string
  insert: string
  plugin?: string
  description?: string
}

function readRecentSkills() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_SKILLS_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function rememberSkill(id: string) {
  const next = [id, ...readRecentSkills().filter((item) => item !== id)].slice(0, RECENT_SKILLS_MAX)
  localStorage.setItem(RECENT_SKILLS_KEY, JSON.stringify(next))
}

function SkillRow({
  skill,
  compact,
  onPick,
}: {
  skill: SkillItem
  compact?: boolean
  onPick: (skill: SkillItem) => void
}) {
  const title = skillTitle(skill.id.replace(/^[a-z0-9]+-/i, ''), skill.label)
  return (
    <button
      type="button"
      onClick={() => onPick(skill)}
      className="block w-full px-3 py-2.5 text-left hover:bg-white/[0.07]"
    >
      <span className="block text-[13px] font-medium">{title}</span>
      {skill.plugin ? <span className="mt-0.5 block text-[11px] text-white/35">{skill.plugin}</span> : null}
      {!compact && skill.description ? (
        <span className="mt-0.5 block text-[12px] leading-5 text-white/45 line-clamp-2">{skill.description}</span>
      ) : null}
    </button>
  )
}

function BrowseMcpsModal({
  onClose,
  onAdded,
}: {
  onClose: () => void
  onAdded: () => void
}) {
  const [query, setQuery] = useState('')
  const [custom, setCustom] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [canAdd, setCanAdd] = useState(true)
  const catalog = PLUGIN_CATALOG.filter((item) => item.mcps.length > 0)
  const q = query.trim().toLowerCase()
  const listed = catalog.filter(
    (item) =>
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.id.includes(q),
  )

  useEffect(() => {
    fetchConnectors()
      .then((data) => setCanAdd(data.paid || (data.remaining ?? 0) > 0))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function addCatalog(id: string) {
    if (!canAdd) {
      navigate(checkoutPath('pro'))
      return
    }
    setBusy(id)
    setError('')
    try {
      const data = await addConnector({ catalogId: id })
      if (data.plugin) await addPlugin({ pluginId: data.plugin.id }).catch(() => undefined)
      const login = data.loginUrl || connectorLoginUrl(id)
      if (login) window.open(login, 'soumtok-connect', 'popup=yes,width=520,height=740')
      if (data.connector?.id) await connectConnector(data.connector.id).catch(() => undefined)
      onAdded()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that MCP')
    } finally {
      setBusy('')
    }
  }

  async function addCustom() {
    if (!canAdd) {
      navigate(checkoutPath('pro'))
      return
    }
    setBusy('custom')
    setError('')
    try {
      await addConnector({ name: name.trim() || 'Custom MCP', mcpUrl: url.trim() })
      onAdded()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that server')
    } finally {
      setBusy('')
    }
  }

  return createPortal(
    <div className="browse-mcps-modal fixed inset-0 z-[80] grid place-items-center bg-black/70 px-4 py-8" onClick={onClose}>
      <div
        role="dialog"
        aria-labelledby="browse-mcps-title"
        className="flex max-h-[min(720px,88vh)] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141413] shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 id="browse-mcps-title" className="text-[16px] font-medium">
            {custom ? 'Custom MCP' : 'Browse MCPs'}
          </h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center text-[18px] text-white/45 hover:text-white" aria-label="Close">
            ×
          </button>
        </div>
        {custom ? (
          <div className="space-y-3 px-5 py-4">
            <button type="button" onClick={() => setCustom(false)} className="text-[12px] text-white/40 hover:text-white">
              ‹ Browse MCPs
            </button>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
              className="w-full rounded-lg border border-white/12 bg-[#0c0c0b] px-3 py-2.5 text-[13px] outline-none"
            />
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/mcp"
              className="w-full rounded-lg border border-white/12 bg-[#0c0c0b] px-3 py-2.5 text-[13px] outline-none"
            />
            {error && <p className="text-[12px] text-[#ff8a70]">{error}</p>}
            <button
              type="button"
              disabled={busy === 'custom' || !url.trim()}
              onClick={() => void addCustom()}
              className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-black disabled:opacity-40"
            >
              {busy === 'custom' ? 'Adding…' : 'Add server'}
            </button>
          </div>
        ) : (
          <>
            <div className="px-5 pt-3">
              <label className="flex items-center gap-2 rounded-lg border border-white/12 bg-[#0c0c0b] px-3 py-2">
                <span className="text-white/35">
                  <SearchIcon />
                </span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search anything"
                  className="w-full bg-transparent text-[13px] outline-none placeholder:text-white/30"
                />
              </label>
              {error && <p className="mt-2 text-[12px] text-[#ff8a70]">{error}</p>}
            </div>
            <div className="thin-scroll mt-4 grid grid-cols-1 gap-2 overflow-y-auto px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
              <button
                type="button"
                onClick={() => setCustom(true)}
                className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[#1a1a18] px-3 py-3 text-left hover:bg-white/[0.05]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-[20px]">+</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">Custom MCP</span>
                  <span className="mt-0.5 block truncate text-[12px] text-white/40">Add your own MCP server</span>
                </span>
                <span className="text-white/25">›</span>
              </button>
              {listed.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={busy === item.id}
                  onClick={() => void addCatalog(item.id)}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[#1a1a18] px-3 py-3 text-left hover:bg-white/[0.05] disabled:opacity-50"
                >
                  <PluginLogo id={item.id} className="h-9 w-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">{item.name}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-white/40">{item.description}</span>
                  </span>
                  <span className="text-white/25">{busy === item.id ? '…' : '›'}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

function AddMenu({
  open,
  onToggle,
  onClose,
  repos,
  project,
  setProject,
  multitask,
  setMultitask,
  onInsert,
  userSkills = [],
  attachedSkills = [],
  onAttachSkill,
  onPickFiles,
}: {
  open: boolean
  onToggle: () => void
  onClose: () => void
  repos: GithubRepo[]
  project: GithubRepo | null
  setProject: (value: GithubRepo | null) => void
  multitask: boolean
  setMultitask: (value: boolean) => void
  onInsert: (text: string) => void
  userSkills?: UserSkill[]
  attachedSkills?: UserSkill[]
  onAttachSkill?: (skill: UserSkill) => void
  onPickFiles?: () => void
}) {
  const [view, setView] = useState<'root' | 'files' | 'skills'>('root')
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([])
  const [connectors, setConnectors] = useState<ConnectorRow[]>([])
  const [skillQuery, setSkillQuery] = useState('')
  const [mcpQuery, setMcpQuery] = useState('')
  const [mcpOpen, setMcpOpen] = useState(false)
  const [browseMcps, setBrowseMcps] = useState(false)
  const [recentIds, setRecentIds] = useState<string[]>([])
  const [box, setBox] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const skillSearchRef = useRef<HTMLInputElement>(null)
  const mcpLeave = useRef<number>(0)

  function reloadTools() {
    fetchPlugins()
      .then((data) => setPlugins(data.installed.filter((item) => item.enabled)))
      .catch(() => setPlugins([]))
    fetchConnectors()
      .then((data) => setConnectors(data.connectors || []))
      .catch(() => setConnectors([]))
  }

  useEffect(() => {
    if (!open) {
      setView('root')
      setSkillQuery('')
      setMcpQuery('')
      setMcpOpen(false)
      setBox(null)
      return
    }
    setRecentIds(readRecentSkills())
    reloadTools()
    function place() {
      const el = rootRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const width = 320
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)
      const spaceBelow = window.innerHeight - rect.bottom
      if (spaceBelow < 280 && rect.top > spaceBelow) {
        setBox({ left, bottom: window.innerHeight - rect.top + 8 })
      } else {
        setBox({ left, top: rect.bottom + 8 })
      }
    }
    place()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (browseMcps) return
        if (mcpOpen) setMcpOpen(false)
        else if (view !== 'root') setView('root')
        else onClose()
      }
    }
    function onPointer(event: MouseEvent) {
      const target = event.target as Node
      if ((target as HTMLElement).closest?.('.browse-mcps-modal')) return
      if (!rootRef.current?.contains(target)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('resize', place)
    }
  }, [open, onClose, view, mcpOpen, browseMcps])

  useEffect(() => {
    if (open && view === 'skills') skillSearchRef.current?.focus()
  }, [open, view])

  const allSkills: SkillItem[] = [
    ...SKILLS,
    ...plugins.flatMap((item) =>
      (item.skills?.length ? item.skills : catalogPlugin(item.plugin_id)?.skills || []).map((skill) => ({
        id: `${item.plugin_id}-${skill.id}`,
        label: skill.label,
        insert: skill.insert,
        plugin: item.name,
        description: skill.description,
      })),
    ),
  ]

  const q = skillQuery.trim().toLowerCase()
  const visibleSkills = q
    ? allSkills.filter((skill) => {
        const title = skillTitle(skill.id.replace(/^[a-z0-9]+-/i, ''), skill.label).toLowerCase()
        return (
          title.includes(q) ||
          skill.label.toLowerCase().includes(q) ||
          (skill.plugin || '').toLowerCase().includes(q) ||
          (skill.description || '').toLowerCase().includes(q)
        )
      })
    : allSkills
  const recentSkills = recentIds
    .map((id) => allSkills.find((skill) => skill.id === id))
    .filter((skill): skill is SkillItem => Boolean(skill))

  function pickSkill(skill: SkillItem) {
    rememberSkill(skill.id)
    setRecentIds(readRecentSkills())
    onInsert(skill.insert)
    onClose()
  }

  const installedMcps = [
    ...connectors.map((row) => ({
      key: `connector-${row.id}`,
      label: row.name,
      url: row.mcp_url,
    })),
    ...plugins
      .filter((item) => item.kind !== 'skills')
      .flatMap((item) => {
        const servers = item.mcps?.length ? item.mcps : catalogPlugin(item.plugin_id)?.mcps || []
        if (servers.length === 0 && item.mcp_url) {
          return [{ key: item.id, label: item.name, url: item.mcp_url }]
        }
        return servers.map((server) => ({
          key: `${item.id}-${server.id}`,
          label: item.name,
          url: server.url,
        }))
      }),
  ].filter((item, index, list) => list.findIndex((row) => row.url === item.url && row.label === item.label) === index)
  const mcpQ = mcpQuery.trim().toLowerCase()
  const visibleMcps = mcpQ
    ? installedMcps.filter(
        (item) => item.label.toLowerCase().includes(mcpQ) || item.url.toLowerCase().includes(mcpQ),
      )
    : installedMcps
  const flyoutLeft = box
    ? box.left + 328 + 280 > window.innerWidth
      ? Math.max(8, box.left - 288)
      : box.left + 328
    : 0

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border text-[18px] font-light leading-none ${
          open
            ? 'border-white/30 bg-white/[0.06] text-white'
            : 'border-white/20 bg-transparent text-white/70 hover:border-white/30 hover:text-white'
        }`}
        aria-label="Add"
      >
        +
      </button>
      {open && box && (
        <div
          className="fixed z-50 w-[320px] overflow-hidden rounded-xl border border-white/15 bg-[#1a1a18] shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
          style={{ left: box.left, top: box.top, bottom: box.bottom }}
        >
          {view === 'root' && (
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  onPickFiles?.()
                  onClose()
                }}
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-white/[0.05]"
              >
                <span className="mt-0.5 text-white/45">
                  <PaperclipIcon />
                </span>
                <span>
                  <span className="block text-[13px] text-white">Photos & files</span>
                  <span className="block text-[12px] leading-5 text-white/40">
                    Images, video, PDFs, and any file. The model gets what it can read.
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMultitask(!multitask)
                  onClose()
                }}
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-white/[0.05]"
              >
                <span className="mt-0.5 text-white/45">
                  <MultitaskIcon />
                </span>
                <span>
                  <span className="block text-[13px] text-white">Multitask</span>
                  <span className="block text-[12px] leading-5 text-white/40">
                    Orchestrate multiple subagents in parallel
                  </span>
                </span>
              </button>
              <div className="mx-3 border-t border-white/[0.08]" />
              <button
                type="button"
                onClick={() => setView('files')}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.05]"
              >
                <span className="text-white/45">
                  <PaperclipIcon />
                </span>
                <span className="text-[13px] text-white">Files</span>
              </button>
              <button
                type="button"
                onClick={() => setView('skills')}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.05]"
              >
                <span className="text-white/45">
                  <BookIcon />
                </span>
                <span className="text-[13px] text-white">Skills</span>
                <span className="ml-auto text-white/30">›</span>
              </button>
              <button
                type="button"
                onClick={() => setMcpOpen((on) => !on)}
                onMouseEnter={() => {
                  window.clearTimeout(mcpLeave.current)
                  setMcpOpen(true)
                }}
                onMouseLeave={() => {
                  mcpLeave.current = window.setTimeout(() => setMcpOpen(false), 180)
                }}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${
                  mcpOpen ? 'bg-white/[0.07] text-white' : 'hover:bg-white/[0.05]'
                }`}
              >
                <span className="text-white/45">
                  <StackIcon />
                </span>
                <span className="text-[13px] text-white">MCP Servers</span>
                <span className="ml-auto text-white/30">›</span>
              </button>
            </div>
          )}
          {view === 'files' && (
            <div>
              <button
                type="button"
                onClick={() => setView('root')}
                className="w-full px-3 py-2 text-left text-[12px] text-white/40 hover:text-white"
              >
                ‹ Files
              </button>
              <div className="thin-scroll max-h-[220px] overflow-y-auto pb-1">
                {repos.length === 0 && (
                  <p className="px-3 py-3 text-[13px] text-white/40">Connect GitHub on Dashboard to attach a project.</p>
                )}
                {repos.map((repo) => (
                  <button
                    key={repo.id}
                    type="button"
                    onClick={() => {
                      setProject(repo)
                      onClose()
                    }}
                    className={`block w-full px-3 py-2 text-left hover:bg-white/[0.05] ${
                      project?.id === repo.id ? 'bg-white/[0.04]' : ''
                    }`}
                  >
                    <span className="block text-[13px]">{repo.fullName}</span>
                    <span className="block text-[11px] text-white/40">
                      {repo.private ? 'Private' : 'Public'}
                      {repo.language ? ` · ${repo.language}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {view === 'skills' && (
            <div>
              <button
                type="button"
                onClick={() => setView('root')}
                className="w-full px-3 py-2 text-left text-[12px] text-white/40 hover:text-white"
              >
                ‹ Skills
              </button>
              <div className="px-3 pb-2">
                <input
                  ref={skillSearchRef}
                  value={skillQuery}
                  onChange={(event) => setSkillQuery(event.target.value)}
                  placeholder="Search skills…"
                  className="w-full rounded-lg border border-white/12 bg-[#0c0c0b] px-3 py-2 text-[13px] outline-none placeholder:text-white/30 focus:border-white/22"
                />
              </div>
              <div className="thin-scroll max-h-[min(360px,50vh)] overflow-y-auto pb-1">
                {userSkills.length > 0 && (
                  <div className="pb-1">
                    <p className="px-3 pb-1 text-[11px] uppercase tracking-[0.08em] text-white/35">Your files</p>
                    {userSkills
                      .filter((skill) => {
                        if (!q) return true
                        return `${skill.name} ${skill.file_name}`.toLowerCase().includes(q)
                      })
                      .map((skill) => {
                        const added = attachedSkills.some((item) => item.id === skill.id)
                        return (
                          <button
                            key={skill.id}
                            type="button"
                            onClick={() => {
                              onAttachSkill?.(skill)
                              onClose()
                            }}
                            className="block w-full px-3 py-2.5 text-left hover:bg-white/[0.07]"
                          >
                            <span className="block text-[13px] font-medium">{skill.name}</span>
                            <span className="mt-0.5 block text-[11px] text-white/35">
                              {skill.file_name}
                              {added ? ' · Added' : ''}
                            </span>
                          </button>
                        )
                      })}
                    <div className="mx-3 my-1 border-t border-white/[0.08]" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    navigate('/dashboard/skills')
                  }}
                  className="mb-1 w-full px-3 py-2 text-left text-[12px] text-white/45 hover:text-white"
                >
                  Upload a PDF or file on Skills
                </button>
                {!q && recentSkills.length > 0 && (
                  <div className="pb-1">
                    <p className="px-3 pb-1 text-[11px] uppercase tracking-[0.08em] text-white/35">Last used</p>
                    {recentSkills.map((skill) => (
                      <SkillRow key={`recent-${skill.id}`} skill={skill} compact onPick={pickSkill} />
                    ))}
                    <div className="mx-3 my-1 border-t border-white/[0.08]" />
                    <p className="px-3 pb-1 pt-1 text-[11px] uppercase tracking-[0.08em] text-white/35">All skills</p>
                  </div>
                )}
                {visibleSkills.length === 0 ? (
                  <p className="px-3 py-3 text-[13px] text-white/40">No skills match that search.</p>
                ) : (
                  visibleSkills.map((skill) => <SkillRow key={skill.id} skill={skill} onPick={pickSkill} />)
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {open && box && view === 'root' && mcpOpen && (
        <div
          className="fixed z-50 flex w-[280px] flex-col overflow-hidden rounded-xl border border-white/15 bg-[#1a1a18] shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
          style={{ left: flyoutLeft, top: box.top, bottom: box.bottom }}
          onMouseEnter={() => {
            window.clearTimeout(mcpLeave.current)
            setMcpOpen(true)
          }}
          onMouseLeave={() => {
            mcpLeave.current = window.setTimeout(() => setMcpOpen(false), 180)
          }}
        >
          <div className="px-3 pt-3">
            <input
              value={mcpQuery}
              onChange={(event) => setMcpQuery(event.target.value)}
              placeholder="Search MCP servers…"
              className="w-full rounded-lg border border-white/12 bg-[#0c0c0b] px-3 py-2 text-[13px] outline-none placeholder:text-white/30"
            />
          </div>
          <div className="thin-scroll max-h-[220px] overflow-y-auto py-2">
            {visibleMcps.length === 0 ? (
              <p className="px-3 py-6 text-center text-[13px] text-white/40">No MCP servers available</p>
            ) : (
              visibleMcps.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    onInsert(`Use the ${item.label} MCP server (${item.url}).\n\n`)
                    onClose()
                  }}
                  className="block w-full px-3 py-2 text-left hover:bg-white/[0.07]"
                >
                  <span className="block text-[13px]">{item.label}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-white/35">{item.url}</span>
                </button>
              ))
            )}
          </div>
          <div className="border-t border-white/[0.08] p-2">
            <button
              type="button"
              onClick={() => setBrowseMcps(true)}
              className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium hover:bg-white/[0.07]"
            >
              + Add MCP
            </button>
          </div>
        </div>
      )}
      {browseMcps && (
        <BrowseMcpsModal
          onClose={() => setBrowseMcps(false)}
          onAdded={() => {
            reloadTools()
            setMcpOpen(true)
          }}
        />
      )}
    </div>
  )
}

function ModelPicker({
  open,
  onToggle,
  onClose,
  models,
  model,
  setModel,
  selectedName,
}: {
  open: boolean
  onToggle: () => void
  onClose: () => void
  models: StudioModel[]
  model: string
  setModel: (value: string) => void
  selectedName: string
}) {
  const [query, setQuery] = useState('')
  const [multi, setMulti] = useState(false)
  const [box, setBox] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  const [tip, setTip] = useState<{ item: StudioModel; top: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const hoverTimer = useRef(0)
  const selected = models.find((item) => item.id === model)
  const search = query.trim().toLowerCase()
  const showAuto = !search || 'auto'.startsWith(search)
  const visible = models.filter((item) => {
    if (!search) return true
    const hay = `${item.name} ${item.id} ${modelCaps(item).join(' ')}`.toLowerCase()
    return hay.includes(search)
  })

  useEffect(() => {
    if (!open) {
      setQuery('')
      setBox(null)
      setTip(null)
      window.clearTimeout(hoverTimer.current)
      return
    }
    function place() {
      const el = rootRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const width = 300
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)
      const spaceBelow = window.innerHeight - rect.bottom
      if (spaceBelow < 340 && rect.top > spaceBelow) {
        setBox({ left, bottom: window.innerHeight - rect.top + 8 })
      } else {
        setBox({ left, top: rect.bottom + 8 })
      }
    }
    place()
    const timer = window.setTimeout(() => searchRef.current?.focus(), 20)
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('resize', place)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('resize', place)
    }
  }, [open, onClose])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex h-8 max-w-[260px] items-center gap-1.5 text-[13px] font-medium text-[#e4e4e0] hover:text-white"
      >
        <span className="truncate">{selectedName}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden className="shrink-0 text-white/45">
          <path d="M2 3.6 5 6.6 8 3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && box && (
        <div
          className="fixed z-50 w-[300px] overflow-hidden rounded-xl border border-white/10 bg-[#1a1a18] shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
          style={{ left: box.left, top: box.top, bottom: box.bottom }}
        >
          <div className="p-2.5">
            <label className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-2.5 py-2">
              <span className="text-white/40">
                <SearchIcon />
              </span>
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.preventDefault()
                }}
                placeholder="Search models"
                className="w-full bg-transparent text-[13px] text-white outline-none placeholder:text-white/45"
              />
            </label>
            <div className="mt-2 flex items-center justify-between px-1 py-1.5">
              <span className="text-[13px] text-white/70">Use Multiple Models</span>
              <button
                type="button"
                role="switch"
                aria-checked={multi}
                onClick={() => setMulti((value) => !value)}
                className={`relative h-[18px] w-[32px] rounded-full transition-colors ${
                  multi ? 'bg-[#f54e00]' : 'bg-white/15'
                }`}
              >
                <span
                  className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-transform ${
                    multi ? 'left-[16px]' : 'left-[2px]'
                  }`}
                />
              </button>
            </div>
          </div>
          <div className="thin-scroll max-h-[240px] overflow-y-auto overscroll-contain border-t border-white/[0.06] py-1">
            {showAuto && (
              <button
                type="button"
                onClick={() => {
                  setModel(AUTO_MODEL_ID)
                  if (!multi) onClose()
                }}
                className={`flex w-full items-baseline gap-2 px-3 py-[7px] text-left hover:bg-white/[0.05] ${
                  isAutoModel(model) ? 'bg-white/[0.06]' : ''
                }`}
              >
                <span className="truncate text-[13px] text-white">Auto</span>
                <span className="shrink-0 text-[12px] text-white/35">Picks for the task</span>
              </button>
            )}
            {visible.length === 0 && !showAuto && (
              <p className="px-3 py-3 text-[13px] text-white/40">No models match “{query.trim()}”.</p>
            )}
            {visible.map((item) => {
              const caps = modelCaps(item)
              const active = item.id === model
              const preview = tip?.item.id === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!item.ready}
                  onClick={() => {
                    setModel(item.id)
                    if (!multi) onClose()
                  }}
                  onMouseEnter={(event) => {
                    const top = event.currentTarget.getBoundingClientRect().top
                    window.clearTimeout(hoverTimer.current)
                    hoverTimer.current = window.setTimeout(() => {
                      setTip({ item, top })
                    }, 2000)
                  }}
                  onMouseLeave={() => {
                    window.clearTimeout(hoverTimer.current)
                    setTip((current) => (current?.item.id === item.id ? null : current))
                  }}
                  className={`flex w-full items-baseline gap-2 px-3 py-[7px] text-left hover:bg-white/[0.05] disabled:opacity-35 ${
                    active || preview ? 'bg-white/[0.06]' : ''
                  }`}
                >
                  <span className="truncate text-[13px] text-white">{item.name}</span>
                  <span className="shrink-0 text-[12px] text-white/35">{caps.join(' ')}</span>
                </button>
              )
            })}
          </div>
          {(isAutoModel(model) || selected) && (
            <div className="border-t border-white/[0.08]">
              <button
                type="button"
                onClick={onClose}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-white/[0.04]"
              >
                <span className="text-[13px] text-white">
                  {isAutoModel(model)
                    ? 'Auto'
                    : selected
                      ? modelTriggerLabel(selected, selected.name)
                      : selectedName}
                </span>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M3 7.2 5.7 10 11 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}
      {open && box && tip && (
        <ModelHoverCard
          item={tip.item}
          left={box.left + 308 + 280 > window.innerWidth ? Math.max(8, box.left - 288) : box.left + 308}
          top={Math.min(tip.top, window.innerHeight - 180)}
        />
      )}
    </div>
  )
}

function modelEffortNote(item: StudioModel) {
  const caps = modelCaps(item)
  if (caps.includes('High') && caps.includes('Fast')) return 'Version: high speed, high reasoning effort'
  if (caps.includes('Fast')) return 'Version: fast reasoning effort'
  if (caps.includes('High')) return 'Version: high reasoning effort'
  if (caps.includes('Medium')) return 'Version: medium reasoning effort'
  return 'Version: standard reasoning effort'
}

function ModelHoverCard({ item, left, top }: { item: StudioModel; left: number; top: number }) {
  const catalog = CODING_MODELS.find((model) => model.id === item.id)
  const guide = modelGuide(
    catalog || {
      id: item.id,
      name: item.name,
      provider: 'openrouter',
      strength: item.strength,
      cost: item.cost,
      keys: item.keys,
    },
  )
  const context = guide.context.replace(/ tokens$/i, '')
  return (
    <div
      className="fixed z-[60] w-[280px] rounded-xl border border-white/12 bg-[#161614] px-4 py-3.5 shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
      style={{ left, top }}
    >
      <p className="text-[14px] font-medium">{item.name}</p>
      <p className="mt-2 text-[13px] leading-5 text-white/55">{item.strength || guide.summary}</p>
      <p className="mt-3 text-[12px] text-white/70">{context} context window</p>
      <p className="mt-2 text-[12px] italic text-white/40">{modelEffortNote(item)}</p>
    </div>
  )
}
