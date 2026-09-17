import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Spinner } from '../Loaders'
import { BrandLockup } from '../ui'
import { GITHUB_APP_INSTALL_URL } from '../../../shared/githubApp.ts'
import { CODING_MODELS, PROVIDER_LABEL, modelGuide, soumtokPickerModels, type CodingModel, type ModelProvider } from '../../../shared/models'
import { ModelBriefSheet } from './ModelBriefSheet'
import {
  fetchAnalytics,
  fetchGithubRepos,
  fetchHealth,
  fetchProfile,
  trackEvent,
  type GithubRepo,
  type Profile,
} from '../../lib/api'
import { signInSocial, useSession } from '../../lib/auth-client'
import { navigate } from '../../lib/nav'
import { BugReportModal } from '../BugReportModal'
import { AccountMenu } from './AccountMenu'
import { SettingsPanel } from './SettingsPanel'
import { StudioDashboard } from './StudioDashboard'
import { IntegrationsPanel } from './IntegrationsPanel'
import { BillingPanel, KeysPanel, SpendingPanel, UsagePanel } from './WorkspacePanels'
import { PluginsPanel } from './PluginsPanel'
import { ConnectorsPanel } from './ConnectorsPanel'
import { SkillsPanel } from './SkillsPanel'
import {
  BillingIcon,
  ConnectorsIcon,
  GithubIcon,
  IntegrationsIcon,
  KeysIcon,
  ModelsIcon,
  OverviewIcon,
  PluginsIcon,
  SettingsIcon,
  SkillsIcon,
  SpendingIcon,
  StudioIcon,
  UsageIcon,
} from './icons'

const NAV = [
  { id: 'overview', label: 'Overview', icon: OverviewIcon },
  { id: 'models', label: 'Models', icon: ModelsIcon },
  { id: 'studio', label: 'Studio', icon: StudioIcon },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
  { id: 'plugins', label: 'Plugins', icon: PluginsIcon },
  { id: 'connectors', label: 'Connectors', icon: ConnectorsIcon },
  { id: 'skills', label: 'Skills', icon: SkillsIcon },
  { id: 'integrations', label: 'Integrations', icon: IntegrationsIcon },
  { id: 'keys', label: 'Keys', title: 'API', icon: KeysIcon },
  { id: 'usage', label: 'Usage', icon: UsageIcon },
  { id: 'spending', label: 'Spending', icon: SpendingIcon },
  { id: 'billing', label: 'Billing', icon: BillingIcon },
] as const

type Section = (typeof NAV)[number]['id']

function navTitle(id: Section) {
  const item = NAV.find((entry) => entry.id === id)
  if (!item) return 'Overview'
  return 'title' in item && item.title ? item.title : item.label
}

function sectionFromPath(path: string): Section {
  const rest = path.replace(/^\/dashboard\/?/, '') || 'overview'
  const id = rest.split('/')[0] || 'overview'
  if (id === 'members') return 'overview'
  return NAV.some((item) => item.id === id) ? (id as Section) : 'overview'
}

type ActivityRow = { day: string; billed_to: string; edits: number; calls: number }
type ActivityFilter = 'all' | 'tab' | 'agent'

const HEAT = ['#1c1c1a', '#3d1c10', '#7a2e12', '#c43d0a', '#f54e00']

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function dayKey(date: Date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

function asDay(value: unknown) {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) return dayKey(value)
  const raw = String(value)
  const iso = raw.match(/(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) return dayKey(parsed)
  return ''
}

function yearDays(weeks: number) {
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const weekday = new Date(today).getUTCDay()
  const monday = today + (weekday === 0 ? -6 : 1 - weekday) * 86400000
  const start = monday - (Math.max(1, weeks) - 1) * 7 * 86400000
  return Array.from({ length: Math.max(1, weeks) * 7 }, (_, i) => new Date(start + i * 86400000))
}

function heatLevel(edits: number, max: number) {
  if (edits <= 0) return 0
  if (max <= 1) return 4
  const ratio = edits / max
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 7
  const c = 2 * Math.PI * r
  const offset = c - (done / total) * c
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        stroke="#f54e00"
        strokeWidth="2"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 9 9)"
      />
    </svg>
  )
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-white/[0.06] bg-[#141413] ${className}`}>{children}</div>
}

function WhiteButton({
  children,
  onClick,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      onClick={(event) => {
        event.stopPropagation()
        onClick?.()
      }}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-black hover:bg-[#f2f2f0]"
    >
      {children}
    </button>
  )
}

function ActivityCard({ rows }: { rows: ActivityRow[] }) {
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [weeks, setWeeks] = useState(26)
  const [cell, setCell] = useState(11)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    function fit() {
      const width = el!.clientWidth
      const label = 18
      const gap = width < 640 ? 2 : 3
      const usable = Math.max(160, width - label)
      const count = Math.max(12, Math.min(53, Math.floor((usable + gap) / (10 + gap))))
      const size = Math.max(7, Math.min(14, Math.floor((usable - gap * (count - 1)) / count)))
      setWeeks(count)
      setCell(size)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const days = useMemo(() => yearDays(weeks), [weeks])

  const byDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of rows) {
      const kind = row.billed_to === 'user' ? 'tab' : 'agent'
      if (filter !== 'all' && kind !== filter) continue
      const key = asDay(row.day)
      if (!key) continue
      const amount = Number(row.edits) || Number(row.calls) || 0
      if (amount <= 0) continue
      map.set(key, (map.get(key) ?? 0) + amount)
    }
    return map
  }, [rows, filter])

  const cells = useMemo(
    () =>
      days.map((date) => {
        const key = dayKey(date)
        return { date, key, edits: byDay.get(key) ?? 0 }
      }),
    [days, byDay],
  )

  const total = cells.reduce((sum, item) => sum + item.edits, 0)
  const max = cells.reduce((best, item) => Math.max(best, item.edits), 0)
  const latest = [...cells].reverse().find((item) => item.edits > 0)
  const today = cells.find((item) => item.key === dayKey(new Date()))
  const hover = cells.find((item) => item.key === hoverKey)
  const selected = hover ?? latest ?? today ?? cells[cells.length - 1]

  const monthLabels = useMemo(() => {
    const labels: { week: number; label: string }[] = []
    let last = -1
    days.forEach((date, i) => {
      if (i % 7 !== 0) return
      const month = date.getUTCMonth()
      if (month !== last) {
        labels.push({ week: i / 7, label: date.toLocaleDateString('en-US', { month: 'narrow', timeZone: 'UTC' }) })
        last = month
      }
    })
    return labels
  }, [days])

  const stats = useMemo(() => {
    const months = new Map<string, { label: string; edits: number }>()
    let bestDay = cells[0]
    let longest = 0
    let run = 0
    for (const item of cells) {
      if (item.edits > (bestDay?.edits ?? 0)) bestDay = item
      const stamp = `${item.date.getUTCFullYear()}-${item.date.getUTCMonth()}`
      const current = months.get(stamp) ?? {
        label: item.date.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }),
        edits: 0,
      }
      current.edits += item.edits
      months.set(stamp, current)
      if (item.edits > 0) {
        run += 1
        longest = Math.max(longest, run)
      } else {
        run = 0
      }
    }
    const nowKey = dayKey(new Date())
    let currentStreak = 0
    for (let i = cells.length - 1; i >= 0; i--) {
      if (cells[i].key > nowKey) continue
      if (cells[i].edits > 0) currentStreak += 1
      else break
    }
    const bestMonth = [...months.values()].sort((a, b) => b.edits - a.edits)[0]
    return {
      month: bestMonth?.edits ? bestMonth.label : '—',
      day: bestDay?.edits ? formatShortDate(bestDay.date) : '—',
      longest,
      current: currentStreak,
    }
  }, [cells])

  return (
    <div className="mt-10 overflow-hidden rounded-2xl border border-white/[0.1] bg-[#141413] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)] md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[15px] font-medium text-white">AI Line Edits</p>
          <p className="mt-1 text-[40px] font-medium leading-none tracking-[-0.05em] md:text-[48px]">
            {total.toLocaleString()}
          </p>
          <p className="mt-3 text-[13px] text-white/40">
            {selected ? formatLongDate(selected.date) : ''}
            <span className="mx-1.5 text-white/20">·</span>
            {selected?.edits ? `${selected.edits.toLocaleString()} lines edited` : 'No lines edited'}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1">
          {(['all', 'tab', 'agent'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={`rounded-md px-3 py-1.5 text-[12px] capitalize ${
                filter === item ? 'bg-[#262626] text-white' : 'text-white/40 hover:text-white/70'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div ref={boxRef} className="mt-8 min-w-0">
        <div className="relative mb-2 ml-[18px] h-4 overflow-hidden">
          {monthLabels.map((month) => (
            <span
              key={`${month.label}-${month.week}`}
              className="absolute text-[11px] text-white/30"
              style={{ left: `${(month.week / weeks) * 100}%` }}
            >
              {month.label}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 gap-1.5">
          <div
            className="flex w-[14px] shrink-0 flex-col justify-between py-0.5 text-[10px] text-white/30"
            style={{ height: cell * 7 + 3 * 6 }}
          >
            <span>M</span>
            <span>W</span>
            <span>F</span>
          </div>
          <div
            className="grid min-w-0 flex-1 grid-flow-col grid-rows-7"
            style={{ gap: cell >= 12 ? 3 : 2 }}
          >
            {cells.map((item) => (
              <button
                key={item.key}
                type="button"
                title={`${formatShortDate(item.date)} · ${item.edits.toLocaleString()} lines`}
                onMouseEnter={() => setHoverKey(item.key)}
                onFocus={() => setHoverKey(item.key)}
                onMouseLeave={() => setHoverKey(null)}
                className="rounded-[3px]"
                style={{
                  width: cell,
                  height: cell,
                  background: HEAT[heatLevel(item.edits, max)],
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-6 border-t border-white/[0.06] pt-5">
        <div className="grid grid-cols-2 gap-x-10 gap-y-4 text-[13px] sm:grid-cols-4">
          <div>
            <p className="text-white/35">Most Active Month</p>
            <p className="mt-1 text-white">{stats.month}</p>
          </div>
          <div>
            <p className="text-white/35">Most Active Day</p>
            <p className="mt-1 text-white">{stats.day}</p>
          </div>
          <div>
            <p className="text-white/35">Longest Streak</p>
            <p className="mt-1 text-white">{stats.longest}d</p>
          </div>
          <div>
            <p className="text-white/35">Current Streak</p>
            <p className="mt-1 text-white">{stats.current}d</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-white/35">
          <span>Fewer</span>
          {HEAT.map((color) => (
            <span key={color} className="h-3 w-3 rounded-[2px]" style={{ background: color }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  )
}

function ModelsSection() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<CodingModel | null>(null)
  const search = query.trim().toLowerCase()
  const groups = (['deepseek', 'google', 'anthropic', 'xai', 'openai'] as ModelProvider[])
    .map((provider) => ({
      provider,
      label: PROVIDER_LABEL[provider],
      models: soumtokPickerModels().filter((model) => {
        if (model.provider !== provider) return false
        if (!search) return true
        const hay = `${model.name} ${model.id} ${model.strength} ${PROVIDER_LABEL[model.provider]} ${(model.tags ?? []).join(' ')}`.toLowerCase()
        return hay.includes(search)
      }),
    }))
    .filter((group) => group.models.length > 0)
  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Search models</span>
        <svg
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
        >
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10.4 10.4 14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search models"
          className="w-full rounded-xl border border-white/[0.08] bg-[#141413] py-2.5 pl-10 pr-3 text-[14px] text-white outline-none placeholder:text-white/30 focus:border-[#f54e00]/60"
        />
      </label>

      <div className="mt-6 space-y-6">
        {groups.length === 0 && (
          <p className="text-[13px] text-white/40">No models match “{query.trim()}”.</p>
        )}
        {groups.map((group) => (
          <div key={group.provider}>
            <p className="mb-2 text-[12px] uppercase tracking-[0.08em] text-white/35">{group.label}</p>
            <div className="overflow-hidden rounded-xl border border-white/[0.06]">
              {group.models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => setOpen(model)}
                  className="flex w-full min-w-0 items-start justify-between gap-3 border-t border-white/[0.04] px-3 py-2.5 text-left first:border-t-0 hover:bg-white/[0.04] sm:gap-4"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-white">
                      {model.name}
                      {(model.tags ?? []).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-[#f54e00]/18 px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.06em] text-[#f54e00]"
                        >
                          {tag}
                        </span>
                      ))}
                    </p>
                    <p className="mt-0.5 text-[12px] leading-5 text-white/45">{model.strength}</p>
                  </div>
                  <span className="shrink-0 pt-0.5 text-[11px] text-white/30">{modelGuide(model).context}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {open && <ModelBriefSheet model={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function GithubProjects({
  onConnect,
  onLinked,
}: {
  onConnect: () => void
  onLinked: (linked: boolean) => void
}) {
  const [linked, setLinked] = useState(false)
  const [login, setLogin] = useState<string | null>(null)
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [query, setQuery] = useState('')
  const [installUrl, setInstallUrl] = useState(GITHUB_APP_INSTALL_URL)
  const [status, setStatus] = useState('Loading projects…')

  useEffect(() => {
    fetchGithubRepos()
      .then((data) => {
        setLinked(data.connected)
        setLogin(data.login)
        setRepos(data.repos)
        setInstallUrl(data.installUrl)
        onLinked(data.connected)
        if (data.expired) setStatus('GitHub access expired. Connect again to list your projects.')
        else if (!data.connected) setStatus('Connect GitHub to see every repo you can work on.')
        else if (data.repos.length === 0) setStatus('No projects yet. Grant Soumtok access to your repositories.')
        else setStatus('')
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Could not load GitHub projects')
      })
  }, [onLinked])

  const shown = repos.filter((repo) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return `${repo.fullName} ${repo.description || ''} ${repo.language || ''}`.toLowerCase().includes(q)
  })

  function openRepo(repo: GithubRepo) {
    sessionStorage.setItem('soumtok-project', JSON.stringify(repo))
    navigate('/dashboard/studio')
  }

  return (
    <Card className="mt-10 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-medium">GitHub projects</h2>
          <p className="mt-1 text-[13px] text-white/40">
            {login
              ? `@${login} · ${repos.length} project${repos.length === 1 ? '' : 's'}`
              : 'Connect GitHub to see every repo you can work on.'}
          </p>
        </div>
        {!linked ? (
          <WhiteButton onClick={onConnect}>
            <GithubIcon />
            Connect
          </WhiteButton>
        ) : (
          <a
            href={installUrl}
            className="rounded-md bg-[#262626] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#303030]"
          >
            Grant repos
          </a>
        )}
      </div>
      {repos.length > 8 && (
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search projects"
          className="mt-3 w-full rounded-md border border-white/12 bg-[#0c0c0b] px-3 py-2 text-[13px] outline-none"
        />
      )}
      {status && <p className="mt-3 text-[13px] text-white/45">{status}</p>}
      {shown.length > 0 && (
        <div className="mt-4 max-h-[420px] divide-y divide-white/[0.04] overflow-y-auto rounded-lg border border-white/[0.06]">
          {shown.map((repo) => (
            <button
              key={repo.id}
              type="button"
              onClick={() => openRepo(repo)}
              className="block w-full px-3 py-2.5 text-left hover:bg-white/[0.03]"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-white">{repo.fullName}</span>
                <span className="text-[11px] text-white/35">{repo.private ? 'Private' : 'Public'}</span>
              </span>
              <span className="mt-0.5 block text-[12px] text-white/40">
                {repo.language || 'Code'}
                {repo.description ? ` · ${repo.description}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}

function Overview({
  profile,
  onDownload,
}: {
  profile: Profile | null
  onDownload: () => void
}) {
  const [githubReady, setGithubReady] = useState(true)
  const [githubLinked, setGithubLinked] = useState(Boolean(profile?.githubId))
  const [expanded, setExpanded] = useState('github')
  const [localDone, setLocalDone] = useState({ download: false })
  const [usage, setUsage] = useState<
    { model: string; provider: string; billed_to: string; calls: number; prompt_tokens: number; completion_tokens: number }[]
  >([])
  const [events, setEvents] = useState<{ name: string; n: number }[]>([])
  const [activity, setActivity] = useState<ActivityRow[] | null>(null)
  const [usageReady, setUsageReady] = useState(false)
  const calls = usage.reduce((sum, row) => sum + row.calls, 0)
  const tokens = usage.reduce((sum, row) => sum + row.prompt_tokens + row.completion_tokens, 0)
  const eventCount = events.reduce((sum, row) => sum + row.n, 0)
  const startedCoding = (activity ?? []).some((row) => row.edits > 0 || row.calls > 0)

  useEffect(() => {
    fetchAnalytics()
      .then((data) => {
        setUsage(data.usage ?? [])
        setEvents(data.events ?? [])
        setActivity(data.activity ?? [])
      })
      .catch(() => {
        setUsage([])
        setEvents([])
        setActivity([])
      })
      .finally(() => setUsageReady(true))
    fetchHealth().then((health) => setGithubReady(health.github))
    try {
      const stored = localStorage.getItem('soumtok-started')
      if (stored) {
        const parsed = JSON.parse(stored) as { download?: boolean }
        setLocalDone({ download: Boolean(parsed.download) })
      }
    } catch {
      /* ignore */
    }
  }, [])

  const githubDone = githubLinked || Boolean(profile?.githubId)
  const handleDone = Boolean(profile?.username)
  const tasks = [
    { id: 'github', title: 'Connect GitHub', done: githubDone },
    { id: 'handle', title: 'Your handle is live', done: handleDone },
    { id: 'download', title: 'Download the desktop app', done: localDone.download },
  ]
  const doneCount = tasks.filter((task) => task.done).length

  function mark(key: 'download') {
    const next = { ...localDone, [key]: true }
    setLocalDone(next)
    localStorage.setItem('soumtok-started', JSON.stringify(next))
  }

  async function connectGithub() {
    if (!githubReady) {
      window.location.href = '/api/setup/github/start'
      return
    }
    await signInSocial({ provider: 'github', callbackURL: '/dashboard' })
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-medium">Getting started</h2>
        <div className="flex items-center gap-2 text-[12px] text-white/40">
          <ProgressRing done={doneCount} total={3} />
          {doneCount}/3 Completed
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        {tasks.map((task) => {
          const open = expanded === task.id && !task.done
          return (
            <div
              key={task.id}
              role="button"
              tabIndex={0}
              onClick={() => setExpanded(task.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setExpanded(task.id)
                }
              }}
              className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left ${
                open ? 'bg-[#1b1b19]' : 'hover:bg-white/[0.03]'
              }`}
            >
              <span
                className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                  task.done ? 'border-[#f54e00] bg-[#f54e00] text-black' : 'border-white/25'
                }`}
              >
                {task.done && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5.1 4.1 7.2 8 2.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[14px] ${task.done ? 'text-white/40 line-through' : 'text-white'}`}>
                  {task.title}
                </span>
                {open && task.id === 'github' && (
                  <span className="mt-2 block">
                    <span className="block text-[13px] leading-5 text-white/40">
                      Link GitHub so cloud agents can open pull requests in your repos.
                    </span>
                    <span className="mt-3 inline-flex">
                      <WhiteButton onClick={connectGithub}>
                        <GithubIcon />
                        Connect
                      </WhiteButton>
                    </span>
                  </span>
                )}
                {open && task.id === 'download' && (
                  <span className="mt-2 block">
                    <span className="block text-[13px] leading-5 text-white/40">
                      The desktop app is where tab, inline edit, and local agents live.
                    </span>
                    <span className="mt-3 inline-flex">
                      <WhiteButton
                        onClick={() => {
                          mark('download')
                          onDownload()
                        }}
                      >
                        Download
                      </WhiteButton>
                    </span>
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>

      <GithubProjects onConnect={connectGithub} onLinked={setGithubLinked} />

      {!usageReady ? (
        <div className="mt-10 grid min-h-[320px] place-items-center rounded-2xl border border-white/[0.06] bg-[#141413]">
          <SectionLoader />
        </div>
      ) : (
        <>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Requests', value: calls.toLocaleString() },
              { label: 'Tokens', value: tokens.toLocaleString() },
              { label: 'Models', value: String(usage.length) },
              { label: 'Product events', value: eventCount.toLocaleString() },
            ].map((stat) => (
              <Card key={stat.label} className="p-4">
                <p className="text-[12px] text-white/40">{stat.label}</p>
                <p className="mt-1 text-[22px] font-medium tracking-[-0.03em]">{stat.value}</p>
              </Card>
            ))}
          </div>

          <Card className="mt-3 p-5">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-medium">Usage by model</p>
              <button type="button" className="text-[12px] text-white/45 hover:text-white" onClick={() => navigate('/dashboard/usage')}>
                Open usage
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {usage.length === 0 && <p className="text-[13px] text-white/40">No model calls yet. Open Studio to start.</p>}
              {usage.map((row) => (
                <div key={`${row.model}-${row.provider}`} className="flex min-w-0 justify-between gap-4 text-[13px]">
                  <span className="min-w-0">
                    <span className="block truncate">{row.model}</span>
                    <span className="block text-[12px] text-white/35">
                      {row.provider} · {row.billed_to} key
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-white/50">
                    {row.calls} calls · {row.prompt_tokens + row.completion_tokens} tokens
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {(startedCoding || calls > 0) && <ActivityCard rows={activity ?? []} />}
        </>
      )}
    </>
  )
}

function SectionLoader() {
  return (
    <div className="grid min-h-[280px] place-items-center" role="status" aria-live="polite">
      <Spinner className="h-6 w-6" />
      <span className="sr-only">Loading</span>
    </div>
  )
}

function Keep({
  id,
  active,
  mounted,
  children,
}: {
  id: Section
  active: Section
  mounted: ReadonlySet<Section>
  children: ReactNode
}) {
  if (!mounted.has(id)) return null
  return (
    <div hidden={active !== id} className={active === id ? 'contents' : undefined}>
      {children}
    </div>
  )
}

export function DashboardPage({
  profile,
  path,
  onDownload,
}: {
  profile: Profile | null
  path: string
  onDownload: () => void
}) {
  const { data: session } = useSession()
  const user = session?.user
  const [menuOpen, setMenuOpen] = useState(false)
  const [liveProfile, setLiveProfile] = useState(profile)
  const urlSection = sectionFromPath(path)
  const [section, setSection] = useState<Section>(urlSection)
  const [mounted, setMounted] = useState<Set<Section>>(() => new Set([urlSection]))
  const [painting, setPainting] = useState(false)
  const [bugReportOpen, setBugReportOpen] = useState(false)

  useEffect(() => {
    setLiveProfile(profile)
  }, [profile])

  useEffect(() => {
    fetchProfile()
      .then(setLiveProfile)
      .catch(() => undefined)
  }, [path])

  useEffect(() => {
    setSection((current) => (current === urlSection ? current : urlSection))
    setMounted((current) => {
      if (current.has(urlSection)) return current
      setPainting(true)
      const next = new Set(current)
      next.add(urlSection)
      return next
    })
  }, [urlSection])

  useEffect(() => {
    if (!painting) return
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setPainting(false))
    })
    return () => window.cancelAnimationFrame(frame)
  }, [painting, section])

  useEffect(() => {
    trackEvent('dashboard_view', path)
  }, [path])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  function openSection(id: Section) {
    const href = id === 'overview' ? '/dashboard' : `/dashboard/${id}`
    if (id === section && path.startsWith(href)) {
      setMenuOpen(false)
      return
    }
    const first = !mounted.has(id)
    setSection(id)
    setMounted((current) => {
      if (current.has(id)) return current
      const next = new Set(current)
      next.add(id)
      return next
    })
    if (first) setPainting(true)
    setMenuOpen(false)
    navigate(href)
  }

  function prefetch(id: Section) {
    if (id === 'studio') return
    setMounted((current) => {
      if (current.has(id)) return current
      const next = new Set(current)
      next.add(id)
      return next
    })
  }

  const displayName = user?.name || liveProfile?.username || user?.email || 'You'
  const sectionBody = (
    <>
      <Keep id="overview" active={section} mounted={mounted}>
        <Overview profile={liveProfile} onDownload={onDownload} />
      </Keep>
      <Keep id="models" active={section} mounted={mounted}>
        <ModelsSection />
      </Keep>
      <Keep id="settings" active={section} mounted={mounted}>
        <SettingsPanel
          profile={liveProfile}
          email={user?.email}
          name={user?.name}
          onSaved={() => fetchProfile().then(setLiveProfile)}
          onReportBug={() => setBugReportOpen(true)}
        />
      </Keep>
      <Keep id="plugins" active={section} mounted={mounted}>
        <PluginsPanel path={path} plan={liveProfile?.plan} />
      </Keep>
      <Keep id="connectors" active={section} mounted={mounted}>
        <ConnectorsPanel path={path} plan={liveProfile?.plan} />
      </Keep>
      <Keep id="skills" active={section} mounted={mounted}>
        <SkillsPanel />
      </Keep>
      <Keep id="integrations" active={section} mounted={mounted}>
        <IntegrationsPanel
          connected={Boolean(liveProfile?.githubId)}
          onConnect={() => signInSocial({ provider: 'github', callbackURL: '/dashboard/integrations' })}
        />
      </Keep>
      <Keep id="keys" active={section} mounted={mounted}>
        <KeysPanel />
      </Keep>
      <Keep id="usage" active={section} mounted={mounted}>
        <UsagePanel />
      </Keep>
      <Keep id="spending" active={section} mounted={mounted}>
        <SpendingPanel plan={liveProfile?.plan} />
      </Keep>
      <Keep id="billing" active={section} mounted={mounted}>
        <BillingPanel plan={liveProfile?.plan} />
      </Keep>
    </>
  )

  return (
    <>
      {section === 'studio' && (
        <StudioDashboard
          profile={liveProfile}
          path={path}
          displayName={displayName}
          onDownload={onDownload}
          onProfileSaved={() => fetchProfile().then(setLiveProfile)}
          onReportBug={() => setBugReportOpen(true)}
        />
      )}
    <div className={`theme-app flex min-h-svh ${section === 'studio' ? 'hidden' : ''}`} hidden={section === 'studio'}>
      <aside className="sticky top-0 z-30 hidden h-svh w-[248px] shrink-0 flex-col border-r border-white/[0.05] px-3 pt-6 pb-4 lg:flex">
        <button type="button" className="dash-aside-head mb-4 px-1.5 text-left" aria-label="Soumtok" onClick={() => openSection('overview')}>
          <BrandLockup className="h-8 w-auto max-w-[168px] object-contain object-left" />
        </button>
        <nav className="thin-scroll mt-4 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
          {NAV.map((item) => {
            const active = section === item.id
            const Icon = item.icon
            return (
              <div key={item.id}>
                {'group' in item && item.group ? (
                  <p className="mt-5 mb-1.5 px-2.5 text-[10px] font-medium tracking-[0.08em] text-white/28 uppercase">
                    {item.group}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => openSection(item.id)}
                  onMouseEnter={() => prefetch(item.id)}
                  onFocus={() => prefetch(item.id)}
                  className={`dash-nav-item flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] whitespace-nowrap ${
                    active
                      ? 'is-active bg-white/[0.08] text-white'
                      : 'text-white/55 hover:bg-white/[0.04] hover:text-white/85'
                  }`}
                >
                  <span className={`dash-nav-icon shrink-0 ${active ? 'text-white' : 'text-white/40'}`}>
                    <Icon />
                  </span>
                  {item.label}
                </button>
              </div>
            )
          })}
        </nav>
        <AccountMenu
          name={displayName}
          plan={liveProfile?.plan}
          username={liveProfile?.username}
          hasAvatar={liveProfile?.hasAvatar}
          onDownload={onDownload}
          onProfileSaved={() => fetchProfile().then(setLiveProfile)}
          onReportBug={() => setBugReportOpen(true)}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-4 py-3 lg:hidden">
          <BrandLockup className="h-6 w-auto max-w-[140px] object-contain" />
          <button
            type="button"
            className="grid h-10 w-10 place-items-center text-[13px] text-white/70"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </header>
        <header className="hidden items-center border-b border-white/[0.05] px-8 py-4 lg:flex">
          <h1 className="text-[22px] font-medium tracking-[-0.03em]">{navTitle(section)}</h1>
        </header>
        {menuOpen && (
          <div className="mobile-drawer lg:hidden">
            <button type="button" className="absolute inset-0 bg-black/55" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
            <div className="mobile-drawer-panel px-3">
              <p className="px-2.5 pb-3 text-[12px] text-white/35">Menu</p>
              <nav className="thin-scroll min-h-0 flex-1 overflow-y-auto">
                {NAV.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openSection(item.id)}
                    className={`block w-full rounded-md px-2.5 py-2.5 text-left text-[14px] ${
                      section === item.id ? 'bg-white/[0.08] text-white' : 'text-white/70'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
              <div className="border-t border-white/[0.06] pt-2">
                <AccountMenu
                  name={displayName}
                  plan={liveProfile?.plan}
                  username={liveProfile?.username}
                  hasAvatar={liveProfile?.hasAvatar}
                  onDownload={onDownload}
                  onProfileSaved={() => fetchProfile().then(setLiveProfile)}
                  onReportBug={() => setBugReportOpen(true)}
                />
              </div>
            </div>
          </div>
        )}

        <main
          className={
            section === 'settings'
              ? 'mx-auto w-full max-w-[1280px] min-w-0 flex-1 px-4 py-6 sm:px-5 sm:py-8 md:px-8 md:py-10'
              : 'mx-auto w-full max-w-[1080px] min-w-0 flex-1 px-4 py-6 sm:px-5 sm:py-8 md:px-10 md:py-10'
          }
        >
          <h1 className="text-[22px] font-medium tracking-[-0.04em] sm:text-[28px] lg:hidden">{navTitle(section)}</h1>
          <div className="mt-8 lg:mt-0">
            {painting && <SectionLoader />}
            <div hidden={painting}>{sectionBody}</div>
          </div>
        </main>
      </div>
    </div>
      <BugReportModal
        open={bugReportOpen}
        onClose={() => setBugReportOpen(false)}
        email={user?.email || ''}
        surface="Dashboard"
        context={{ section, path }}
      />
    </>
  )
}
