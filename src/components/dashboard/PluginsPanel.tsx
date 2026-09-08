import { useEffect, useMemo, useState } from 'react'
import {
  addPlugin,
  fetchPlugins,
  removePlugin,
  type InstalledPlugin,
} from '../../lib/api'
import { navigate } from '../../lib/nav'
import {
  PLUGIN_CATALOG,
  PLUGIN_CATEGORIES,
  catalogPlugin,
  costLabel,
  isFeaturedPlugin,
  pluginPath,
  type CatalogPlugin,
  type PluginMcp,
  type PluginSkill,
} from '../../../shared/plugins'
import { checkoutPath, hasPaidPlan } from '../../../shared/plans'
import { PluginLogo } from './PluginLogos'
import { ConfirmCard, useConfirmDelete } from '../ConfirmCard'

type Tab = 'all' | 'installed' | 'required' | 'optional'

function pluginIdFromPath(path: string) {
  const rest = path.replace(/^\/dashboard\/plugins\/?/, '')
  const id = rest.split(/[/?#]/)[0]
  return id && catalogPlugin(id) ? id : null
}

function CostPill({ item }: { item: CatalogPlugin }) {
  const tone =
    item.cost === 'free' ? 'text-emerald-300 bg-emerald-500/15' : item.cost === 'paid' ? 'text-[#f54e00] bg-[#f54e00]/10' : 'text-white/60 bg-white/[0.06]'
  return <span className={`rounded-full px-2 py-0.5 text-[11px] ${tone}`}>{costLabel(item.cost)}</span>
}

function DiamondIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-white/35" aria-hidden>
      <path fill="none" stroke="currentColor" strokeWidth="1.6" d="M12 3.6 20.4 12 12 20.4 3.6 12z" />
    </svg>
  )
}

function ExtIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="currentColor" d="M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14zM5 5h6v2H7v10h10v-4h2v6H5z" />
    </svg>
  )
}

function CatalogRow({
  label,
  description,
  href,
}: {
  label: string
  description?: string
  href: string
}) {
  return (
    <div className="flex items-start gap-3 border-t border-white/[0.06] px-0 py-3.5 first:border-t-0">
      <DiamondIcon />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-white">{label}</p>
        {description ? <p className="mt-0.5 text-[12px] leading-5 text-white/40">{description}</p> : null}
      </div>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 p-1 text-white/35 hover:text-white"
        aria-label={`Open ${label} source on GitHub`}
      >
        <ExtIcon />
      </a>
    </div>
  )
}

function SkillRow({ skill }: { skill: PluginSkill }) {
  return <CatalogRow label={skill.label} description={skill.description} href={skill.sourceUrl} />
}

function McpRow({ server }: { server: PluginMcp }) {
  return <CatalogRow label={server.label} href={server.sourceUrl} />
}

function PluginDetail({
  item,
  installed,
  onAdd,
  onRemove,
  busy,
}: {
  item: CatalogPlugin
  installed?: InstalledPlugin
  onAdd: (item: CatalogPlugin) => void
  onRemove: (id: string) => void
  busy?: boolean
}) {
  return (
    <div className="space-y-8">
      <button type="button" onClick={() => navigate(pluginPath())} className="text-[13px] text-white/50 hover:text-white">
        ← Plugins
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <PluginLogo id={item.id} className="h-12 w-12" />
          <div>
            <h2 className="text-[22px] font-medium tracking-tight">{item.name}</h2>
            <p className="mt-0.5 text-[13px] text-white/40">{item.publisher}</p>
          </div>
        </div>
        {installed ? (
          <button
            type="button"
            onClick={() => onRemove(installed.id)}
            className="rounded-md border border-white/15 px-3 py-1.5 text-[13px] text-white"
          >
            Uninstall
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAdd(item)}
            className="rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-black disabled:opacity-40"
          >
            {busy ? 'Adding…' : 'Add'}
          </button>
        )}
      </div>

      <p className="max-w-2xl text-[14px] leading-6 text-white/55">{item.description}</p>
      {installed && (
        <p className="text-[12px] text-emerald-300/80">
          Saved to your account: {(installed.skills || item.skills).length} skills
          {(installed.mcps || item.mcps).length ? ` · ${(installed.mcps || item.mcps).length} MCP` : ''}.
        </p>
      )}
      <p className="flex flex-wrap gap-3 text-[12px]">
        <a href={item.signupUrl} target="_blank" rel="noreferrer" className="text-white/70 underline">
          Open {item.name}
        </a>
        <a href={item.docsUrl} target="_blank" rel="noreferrer" className="text-white/70 underline">
          Vendor docs
        </a>
        {item.repoUrl && (
          <a href={item.repoUrl} target="_blank" rel="noreferrer" className="text-white/70 underline">
            Plugin source
          </a>
        )}
        <CostPill item={item} />
      </p>

      <div>
        <p className="mb-1 text-[15px] text-white">Skills</p>
        {item.skills.length === 0 ? (
          <p className="text-[13px] text-white/40">
            This catalog plugin is MCP-only — no public skill files. Add still saves the official connection. You do
            not hunt an MCP URL.
          </p>
        ) : (
          <div>
            {item.skills.map((skill) => (
              <SkillRow key={skill.id} skill={skill} />
            ))}
          </div>
        )}
      </div>

      {item.mcps.length > 0 && (
        <div>
          <p className="mb-1 text-[15px] text-white">MCPs</p>
          <div>
            {item.mcps.map((server) => (
              <McpRow key={server.id} server={server} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function InstallProgress({ name, percent, label }: { name: string; percent: number; label: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4">
      <div className="w-full max-w-sm rounded-xl border border-white/[0.08] bg-[#141413] p-5">
        <p className="text-[14px] text-white">Adding {name}</p>
        <p className="mt-1 text-[12px] text-white/45">{label}</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-white transition-[width] duration-200" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-2 text-right text-[11px] text-white/35">{percent}%</p>
      </div>
    </div>
  )
}

function CatalogCard({ item, onAdd, onOpen, busy }: { item: CatalogPlugin; onAdd: (item: CatalogPlugin) => void; onOpen: (id: string) => void; busy?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#141413] p-4">
      <div className="flex items-start justify-between gap-3">
        <button type="button" className="flex min-w-0 items-start gap-3 text-left" onClick={() => onOpen(item.id)}>
          <PluginLogo id={item.id} />
          <div className="min-w-0">
            <p className="text-[14px]">{item.name}</p>
            <p className="mt-1 text-[12px] leading-5 text-white/40">{item.description}</p>
            <p className="mt-1 text-[11px] text-white/30">
              {item.skills.length ? `${item.skills.length} skills` : 'MCP-only'}
              {item.mcps.length ? ` · ${item.mcps.length} MCP` : ''} · click to open
            </p>
          </div>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAdd(item)}
          className="shrink-0 rounded-md border border-white/15 px-3 py-1.5 text-[12px] text-white disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  )
}

export function PluginsPanel({ path, plan }: { path: string; plan?: string }) {
  const [installed, setInstalled] = useState<InstalledPlugin[]>([])
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('installed')
  const [adding, setAdding] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customUrl, setCustomUrl] = useState('')
  const [browse, setBrowse] = useState(false)
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState<{ name: string; percent: number; label: string } | null>(null)
  const pluginDelete = useConfirmDelete()
  const paid = hasPaidPlan(plan)
  const canAdd = paid || installed.length === 0
  const selectedId = pluginIdFromPath(path)
  const selected = selectedId ? catalogPlugin(selectedId) : null

  async function reload() {
    const data = await fetchPlugins()
    setInstalled(data.installed)
  }

  useEffect(() => {
    reload().catch(() => setStatus('Could not load plugins'))
  }, [])

  const installedIds = useMemo(() => new Set(installed.map((item) => item.plugin_id)), [installed])
  const q = query.trim().toLowerCase()

  const listed = installed.filter((item) => {
    if (tab === 'required' && !item.required) return false
    if (tab === 'optional' && item.required) return false
    if (!q) return true
    return item.name.toLowerCase().includes(q)
  })
  const showCatalog = tab === 'all'

  const available = PLUGIN_CATALOG.filter((item) => {
    if (installedIds.has(item.id)) return false
    if (!q) return true
    return item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
  })

  const featured = available.filter((item) => isFeaturedPlugin(item.id))
  const suggested = available.filter((item) => item.suggested && !isFeaturedPlugin(item.id))

  function openPlugin(id: string) {
    navigate(pluginPath(id))
  }

  async function install(item: CatalogPlugin) {
    if (!canAdd) {
      navigate(checkoutPath('pro'))
      return
    }
    setStatus('')
    setProgress({ name: item.name, percent: 12, label: 'Collecting skills and MCP…' })
    try {
      setProgress({ name: item.name, percent: 40, label: 'Saving plugin, skills, and MCP to your account…' })
      await addPlugin({ pluginId: item.id })
      setProgress({ name: item.name, percent: 78, label: 'Writing the bundle file…' })
      await reload()
      setProgress({ name: item.name, percent: 100, label: 'Done' })
      await new Promise((resolve) => setTimeout(resolve, 280))
      setProgress(null)
      navigate(pluginPath(item.id))
    } catch (error) {
      setProgress(null)
      setStatus(error instanceof Error ? error.message : 'Could not add plugin')
    }
  }

  if (selected) {
    return (
      <div className="space-y-6">
        <PluginDetail
          item={selected}
          installed={installed.find((row) => row.plugin_id === selected.id)}
          onAdd={install}
          onRemove={(id) => pluginDelete.ask(id)}
          busy={Boolean(progress)}
        />
        {progress && <InstallProgress name={progress.name} percent={progress.percent} label={progress.label} />}
        {status && <p className="text-[12px] text-white/55">{status}</p>}
        {pluginDelete.target && (
          <ConfirmCard
            title="Uninstall this plugin?"
            body={`${selected.name}, its skills, and its MCP will be deleted from your account, file storage, and Studio.`}
            confirmLabel="Uninstall"
            busy={pluginDelete.busy}
            error={pluginDelete.error}
            onCancel={pluginDelete.cancel}
            onConfirm={() =>
              pluginDelete.run(async () => {
                await removePlugin(pluginDelete.target!)
                await reload()
                navigate(pluginPath())
              })
            }
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-white/45">
        Extend Soumtok with skills, rules, subagents, MCP tools, and hooks.{' '}
        <a href="/docs/plugins" target="_blank" rel="noreferrer" className="text-white/70 underline">
          Learn more
        </a>
        {!paid && (
          <>
            {' '}
            Free plan allows 1 connector.{' '}
            <a href={checkoutPath('pro')} className="text-white/70 underline">
              Upgrade
            </a>{' '}
            to add more.
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search plugins"
          className="min-w-0 flex-1 rounded-md border border-white/12 bg-[#141413] px-3 py-2 text-[13px] outline-none"
        />
        <button
          type="button"
          onClick={() => {
            if (!canAdd) {
              navigate(checkoutPath('pro'))
              return
            }
            setAdding((open) => !open)
          }}
          className="rounded-md bg-white px-3 py-2 text-[13px] font-medium text-black"
        >
          Add
        </button>
      </div>

      {adding && (
        <form
          className="space-y-3 rounded-xl border border-white/[0.06] bg-[#141413] p-4"
          onSubmit={async (event) => {
            event.preventDefault()
            try {
              const name = customName.trim()
              setProgress({ name, percent: 20, label: 'Saving your MCP…' })
              await addPlugin({ name, mcpUrl: customUrl.trim() })
              setProgress({ name, percent: 80, label: 'Writing the bundle file…' })
              setCustomName('')
              setCustomUrl('')
              setAdding(false)
              await reload()
              setProgress({ name, percent: 100, label: 'Done' })
              await new Promise((resolve) => setTimeout(resolve, 220))
              setProgress(null)
            } catch (error) {
              setProgress(null)
              setStatus(error instanceof Error ? error.message : 'Could not add plugin')
            }
          }}
        >
          <p className="text-[13px] text-white/70">Your own MCP server</p>
          <p className="text-[12px] leading-5 text-white/45">
            Only when the plugin is not in the marketplace. Catalog plugins already include their MCP address.
          </p>
          <input
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
            placeholder="Name"
            className="w-full rounded-md border border-white/12 bg-[#0c0c0b] px-3 py-2 text-[13px] outline-none"
          />
          <input
            value={customUrl}
            onChange={(event) => setCustomUrl(event.target.value)}
            placeholder="https://mcp.example.com"
            className="w-full rounded-md border border-white/12 bg-[#0c0c0b] px-3 py-2 text-[13px] outline-none"
            required
          />
          <div className="flex gap-2">
            <button type="submit" className="rounded-md bg-white px-3 py-1.5 text-[12px] font-medium text-black">
              Save MCP
            </button>
            <button type="button" onClick={() => setAdding(false)} className="text-[12px] text-white/45">
              Cancel
            </button>
          </div>
        </form>
      )}

      {browse ? (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <p className="text-[15px] text-white">Marketplace</p>
            <button type="button" onClick={() => setBrowse(false)} className="text-[13px] text-white/70 hover:text-white">
              Back to plugins
            </button>
          </div>
          {PLUGIN_CATEGORIES.map((category) => {
            const cards = available.filter((item) => item.category === category)
            if (cards.length === 0) return null
            return (
              <div key={category}>
                <p className="mb-3 text-[13px] text-white/50">{category}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {cards.map((item) => (
                    <CatalogCard key={item.id} item={item} onAdd={install} onOpen={openPlugin} busy={Boolean(progress)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <>
          <div className="flex gap-4 text-[13px]">
            {(
              [
                ['all', 'All'],
                ['installed', 'Installed'],
                ['required', 'Required'],
                ['optional', 'Optional'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setTab(id)} className={tab === id ? 'text-white' : 'text-white/40 hover:text-white'}>
                {label}
              </button>
            ))}
          </div>

          {listed.length > 0 && <p className="mb-2 text-[13px] text-white/50">Your plugins</p>}
          <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-[#141413]">
            {listed.length === 0 && !(showCatalog && featured.length > 0) && (
              <p className="px-4 py-6 text-[13px] text-white/40">
                {tab === 'installed'
                  ? 'No plugins installed yet. Open All or browse the marketplace.'
                  : tab === 'required'
                    ? 'No required plugins.'
                    : tab === 'optional'
                      ? 'No optional plugins.'
                      : 'No plugins yet. Open one below, or browse the marketplace.'}
              </p>
            )}
            {listed.map((item) => {
              const meta = catalogPlugin(item.plugin_id)
              const skillCount = item.skills?.length || meta?.skills.length || 0
              const mcpCount = item.mcps?.length || meta?.mcps.length || 0
              return (
                <div key={item.id} className="flex items-center gap-3 px-4 py-4">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left hover:opacity-90"
                    onClick={() => (meta ? openPlugin(meta.id) : undefined)}
                  >
                    <PluginLogo id={item.plugin_id} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px]">{item.name}</p>
                      <p className="mt-0.5 text-[12px] text-white/40">
                        {skillCount ? `${skillCount} skills` : 'MCP-only'}
                        {mcpCount ? ` · ${mcpCount} MCP saved` : item.mcp_url ? ` · ${item.mcp_url}` : ''}
                        {item.required ? ' · Required' : ''}
                      </p>
                    </div>
                    {meta && <span className="text-white/25">›</span>}
                  </button>
                  <button
                    type="button"
                    className="shrink-0 text-[12px] text-white/40 hover:text-white"
                    onClick={() => pluginDelete.ask(item.id)}
                  >
                    Uninstall
                  </button>
                </div>
              )
            })}
            {showCatalog &&
              featured.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-white/[0.02]"
                  onClick={() => openPlugin(item.id)}
                >
                  <PluginLogo id={item.id} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px]">{item.name}</p>
                    <p className="mt-0.5 text-[12px] leading-5 text-white/40">{item.description}</p>
                  </div>
                  <span className="text-white/25">›</span>
                </button>
              ))}
          </div>

          {showCatalog && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[13px] text-white/50">Suggested</p>
                <button type="button" onClick={() => setBrowse(true)} className="text-[13px] text-white/70 hover:text-white">
                  Browse Marketplace ↗
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {suggested.map((item) => (
                  <CatalogCard key={item.id} item={item} onAdd={install} onOpen={openPlugin} busy={Boolean(progress)} />
                ))}
              </div>
            </div>
          )}
          {!showCatalog && (
            <div className="flex justify-end">
              <button type="button" onClick={() => setBrowse(true)} className="text-[13px] text-white/70 hover:text-white">
                Browse Marketplace ↗
              </button>
            </div>
          )}
        </>
      )}
      {progress && <InstallProgress name={progress.name} percent={progress.percent} label={progress.label} />}
      {status && <p className="text-[12px] text-white/55">{status}</p>}
      {pluginDelete.target && (
        <ConfirmCard
          title="Uninstall this plugin?"
          body={`${installed.find((item) => item.id === pluginDelete.target)?.name || 'This plugin'}, its skills, and its MCP will be deleted from your account, file storage, and Studio.`}
          confirmLabel="Uninstall"
          busy={pluginDelete.busy}
          error={pluginDelete.error}
          onCancel={pluginDelete.cancel}
          onConfirm={() =>
            pluginDelete.run(async () => {
              await removePlugin(pluginDelete.target!)
              await reload()
            })
          }
        />
      )}
    </div>
  )
}
