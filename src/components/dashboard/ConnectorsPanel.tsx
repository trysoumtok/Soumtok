import { useEffect, useMemo, useState } from 'react'
import {
  addConnector,
  addPlugin,
  connectConnector,
  startConnectorOauth,
  deleteConnectorToken,
  fetchConnectors,
  probeConnector,
  removeConnector,
  saveConnectorToken,
  connectorOauthStartUrl,
  type ConnectorMcpInfo,
  type ConnectorProbeStep,
  type ConnectorRow,
} from '../../lib/api'
import { navigate } from '../../lib/nav'
import { CONNECTOR_CATALOG, connectorConnectPath, connectorLoginUrl } from '../../../shared/connectors'
import { catalogPlugin } from '../../../shared/plugins'
import { checkoutPath, hasPaidPlan } from '../../../shared/plans'
import { PluginLogo } from './PluginLogos'
import { ConfirmCard, useConfirmDelete } from '../ConfirmCard'
import { SearchIcon } from './icons'

type Filter = 'all' | 'connected' | 'open'
type AuthMode = 'always' | 'when_asked' | 'none'
type OauthClient = 'hosted' | 'dcr' | 'own'

function slugFromPath(path: string) {
  const rest = path.replace(/^\/dashboard\/connectors\/?/, '')
  return rest.split(/[/?#]/)[0] || null
}

function openVendorLogin(url: string) {
  window.open(url, 'soumtok-connect', 'popup=yes,width=520,height=740')
}

function LimitNote() {
  return (
    <p className="text-[13px] text-white/45">
      Free plan allows 1 connector.{' '}
      <a href={checkoutPath('pro')} className="text-[#8cb4ff] hover:underline">
        Upgrade
      </a>{' '}
      to add more.
    </p>
  )
}

function CheckMark({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500/20 text-emerald-300">✓</span>
  ) : (
    <span className="grid h-5 w-5 place-items-center rounded-full border border-white/20 text-white/30" />
  )
}

function Radio({
  checked,
  label,
  hint,
  tag,
  onClick,
}: {
  checked: boolean
  label: string
  hint: string
  tag?: string
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-start gap-3 rounded-lg px-1 py-2 text-left">
      <span className={`mt-0.5 grid h-4 w-4 place-items-center rounded-full border ${checked ? 'border-[#6ea8ff]' : 'border-white/25'}`}>
        {checked ? <span className="h-2 w-2 rounded-full bg-[#6ea8ff]" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[13px] text-white">{label}</span>
          {tag ? <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">{tag}</span> : null}
        </span>
        <span className="mt-0.5 block text-[12px] leading-5 text-white/40">{hint}</span>
      </span>
    </button>
  )
}

function mcpFromCheck(check: ConnectorRow['last_check'] | unknown): ConnectorMcpInfo | null {
  if (!check || typeof check !== 'object' || !('mcp' in check)) return null
  const mcp = (check as { mcp?: ConnectorMcpInfo }).mcp
  return mcp && typeof mcp === 'object' ? mcp : null
}

function McpSummary({ mcp }: { mcp: ConnectorMcpInfo }) {
  const title = mcp.serverName
    ? `${mcp.serverName}${mcp.serverVersion ? ` ${mcp.serverVersion}` : ''}`
    : 'MCP server reached'
  const bits = [
    mcp.protocol && `MCP ${mcp.protocol}`,
    mcp.tools.length ? `${mcp.tools.length} tools` : null,
    mcp.resources.length ? `${mcp.resources.length} resources` : null,
    mcp.prompts.length ? `${mcp.prompts.length} prompts` : null,
  ].filter(Boolean)
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#0c0c0b] px-3 py-3">
      <p className="text-[13px] text-white">{title}</p>
      {bits.length > 0 && <p className="mt-1 text-[12px] text-white/40">{bits.join(' · ')}</p>}
      {mcp.instructions && <p className="mt-2 line-clamp-3 text-[12px] leading-5 text-white/45">{mcp.instructions}</p>}
      {mcp.toolsLocked && <p className="mt-2 text-[12px] text-white/40">Tools stay locked until you sign in.</p>}
      {mcp.tools.length > 0 && (
        <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
          {mcp.tools.map((tool) => (
            <p key={tool.name} className="font-mono text-[12px] text-white/55">
              {tool.name}
              {tool.description ? <span className="text-white/30"> — {tool.description}</span> : null}
            </p>
          ))}
        </div>
      )}
      {mcp.resources.length > 0 && (
        <p className="mt-2 text-[12px] text-white/35">{mcp.resources.map((item) => item.name).join(', ')}</p>
      )}
    </div>
  )
}

function CustomModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (row: ConnectorRow) => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [phase, setPhase] = useState<'form' | 'check' | 'auth'>('form')
  const [steps, setSteps] = useState<ConnectorProbeStep[]>([])
  const [needsAuth, setNeedsAuth] = useState(false)
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [mcp, setMcp] = useState<ConnectorMcpInfo | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode>('always')
  const [oauthClient, setOauthClient] = useState<OauthClient>('dcr')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const failed = steps.find((step) => step.status === 'fail')

  async function runCheck() {
    setError('')
    if (!name.trim() || !url.trim()) {
      setError('Add a name and an HTTPS MCP URL.')
      return
    }
    setPhase('check')
    setBusy(true)
    setSteps([])
    setMcp(null)
    try {
      const data = await probeConnector({ url: url.trim(), phase: 'full' })
      const next = data.steps || (data.step ? [data.step] : [])
      setSteps(next)
      setNeedsAuth(Boolean(data.needsAuth))
      setAuthUrl(data.authUrl || null)
      if (data.mcp) setMcp(data.mcp)
      if (next.some((step) => step.status === 'fail')) return
      setAuthMode(data.needsAuth ? 'always' : 'none')
      setPhase('auth')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check that server')
      setPhase('form')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      const data = await addConnector({
        name: name.trim(),
        mcpUrl: url.trim(),
        authMode,
        oauthClient,
        lastCheck: { steps, mcp, needsAuth },
      })
      if (data.connector) {
        await addPlugin({ name: name.trim(), mcpUrl: url.trim() }).catch(() => undefined)
        onSaved(data.connector)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save connector')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 py-6">
      <div className="flex max-h-[min(640px,90vh)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141413]">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <p className="text-[17px] text-white">Add custom connector</p>
            <p className="mt-1 text-[12px] leading-5 text-white/40">
              Paste an HTTPS MCP URL. Soumtok reads the server, then you add it.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-white/35 hover:text-white">
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
          {phase === 'form' && (
            <div className="space-y-4">
              <label className="block">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Name"
                  className="w-full rounded-md border border-white/12 bg-[#0c0c0b] px-3 py-2 text-[13px] outline-none"
                />
                <span className="mt-1 block text-[12px] text-white/35">Shown in the connectors list.</span>
              </label>
              <label className="block">
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://mcp.example.com/mcp"
                  className="w-full rounded-md border border-white/12 bg-[#0c0c0b] px-3 py-2 font-mono text-[13px] outline-none"
                />
                <span className="mt-1 block text-[12px] text-white/35">Remote MCP server URL.</span>
              </label>
            </div>
          )}

          {phase !== 'form' && (
            <div className="space-y-3">
              <p className="text-[14px] text-white">{name || 'Connector'}</p>
              <p className="truncate font-mono text-[12px] text-white/40">{url}</p>
              {busy ? (
                <div className="flex items-center gap-3 text-[13px]">
                  <span className="h-4 w-4 animate-spin rounded-full border border-white/20 border-t-white/70" />
                  <p className="text-white/60">Reading MCP and listing tools…</p>
                </div>
              ) : (
                <>
                  {failed ? (
                    <p className="text-[13px] text-[#f54e00]">{failed.detail}</p>
                  ) : (
                    <div className="flex items-start gap-3 text-[13px]">
                      <CheckMark ok />
                      <p className="text-white/70">
                        {needsAuth
                          ? 'Server reached. Sign-in is required before tools open.'
                          : mcp?.serverName
                            ? `Opened ${mcp.serverName}.`
                            : 'MCP server is ready.'}
                      </p>
                    </div>
                  )}
                  {mcp && <McpSummary mcp={mcp} />}
                </>
              )}
            </div>
          )}

          {phase === 'auth' && (
            <div className="mt-5 space-y-4">
              <div>
                <p className="mb-1 text-[13px] text-white">Sign-in</p>
                <Radio
                  checked={authMode === 'always'}
                  label="Always required"
                  tag={needsAuth ? 'Detected' : undefined}
                  hint="Sign in at the server before any tools run."
                  onClick={() => setAuthMode('always')}
                />
                <Radio
                  checked={authMode === 'when_asked'}
                  label="When the server asks"
                  hint="Connect first. Prompt only if the server requires it."
                  onClick={() => setAuthMode('when_asked')}
                />
                <Radio
                  checked={authMode === 'none'}
                  label="None"
                  tag={!needsAuth ? 'Detected' : undefined}
                  hint="Open server or API key. No OAuth window."
                  onClick={() => setAuthMode('none')}
                />
              </div>
              {needsAuth && (
                <div>
                  <p className="mb-1 text-[13px] text-white">OAuth client</p>
                  <Radio
                    checked={oauthClient === 'hosted'}
                    label="Soumtok hosted metadata"
                    tag="Recommended"
                    hint="The server reads Soumtok’s client from a hosted URL."
                    onClick={() => setOauthClient('hosted')}
                  />
                  <Radio
                    checked={oauthClient === 'dcr'}
                    label="Register automatically"
                    tag={authUrl ? 'Detected' : undefined}
                    hint="Dynamic client registration as people connect."
                    onClick={() => setOauthClient('dcr')}
                  />
                  <Radio
                    checked={oauthClient === 'own'}
                    label="Your own client ID"
                    hint="Use a client you already registered."
                    onClick={() => setOauthClient('own')}
                  />
                </div>
              )}
            </div>
          )}
          {error && <p className="mt-3 text-[12px] text-[#f54e00]">{error}</p>}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-white/[0.06] px-5 py-3">
          {phase === 'auth' ? (
            <button type="button" onClick={() => setPhase('form')} className="rounded-md border border-white/15 px-3 py-1.5 text-[13px]">
              Back
            </button>
          ) : (
            <button type="button" onClick={onClose} className="rounded-md border border-white/15 px-3 py-1.5 text-[13px]">
              Cancel
            </button>
          )}
          {phase === 'form' && (
            <button type="button" disabled={busy} onClick={runCheck} className="rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-black disabled:opacity-40">
              Continue
            </button>
          )}
          {phase === 'check' && !busy && (
            <button type="button" onClick={() => setPhase('form')} className="rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-black">
              Edit URL
            </button>
          )}
          {phase === 'auth' && (
            <button type="button" disabled={busy} onClick={save} className="rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-black disabled:opacity-40">
              {busy ? 'Saving…' : 'Add'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ConnectorDetail({
  item,
  onBack,
  onRemoved,
  onUpdated,
}: {
  item: ConnectorRow
  onBack: () => void
  onRemoved: () => void
  onUpdated?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [token, setToken] = useState('')
  const [hasToken, setHasToken] = useState(Boolean(item.hasToken))
  const plugin = item.plugin_id ? catalogPlugin(item.plugin_id) : null
  const [mcp, setMcp] = useState<ConnectorMcpInfo | null>(() => mcpFromCheck(item.last_check))

  useEffect(() => {
    setMcp(mcpFromCheck(item.last_check))
    setHasToken(Boolean(item.hasToken))
  }, [item.id, item.last_check, item.hasToken])

  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get('oauth')
    if (flag === 'ok' && !item.connected) void connect(true)
    // one-shot after OAuth callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  async function connect(signedIn = false) {
    setBusy(true)
    setStatus('')
    try {
      if (!signedIn) {
        const oauth = await startConnectorOauth(item.id).catch(() => null)
        if (oauth?.actionUrl) {
          window.location.href = oauth.actionUrl
          return
        }
      }
      const data = await connectConnector(item.id)
      if (data.mcp) setMcp(data.mcp)
      const login = data.loginUrl || data.signupUrl || connectorLoginUrl(item.plugin_id || '')
      if (!signedIn && login && (data.needsLogin || !data.connected)) {
        openVendorLogin(login)
        setStatus(`Sign in at ${item.name} in the window that opened. Then click I’ve signed in.`)
      } else if (data.connected) {
        setStatus(`Connected. ${data.mcp?.tools.length ? `${data.mcp.tools.length} tools ready.` : `MCP: ${item.mcp_url}`}`)
      } else {
        setStatus('Still waiting for sign-in. Open login again if the window closed.')
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not connect')
    } finally {
      setBusy(false)
    }
  }

  async function saveToken() {
    const value = token.trim()
    if (value.length < 12) {
      setStatus('Paste a token at least 12 characters long.')
      return
    }
    setBusy(true)
    setStatus('')
    try {
      await saveConnectorToken(item.id, value)
      setHasToken(true)
      setToken('')
      setStatus('Token saved. Studio will send it as a Bearer on MCP calls.')
      onUpdated?.()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save token')
    } finally {
      setBusy(false)
    }
  }

  async function clearToken() {
    setBusy(true)
    setStatus('')
    try {
      await deleteConnectorToken(item.id)
      setHasToken(false)
      setStatus('Stored token removed.')
      onUpdated?.()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not remove token')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <button type="button" onClick={onBack} className="text-[13px] text-white/50 hover:text-white">
        ← Connectors
      </button>
      <div className="grid place-items-center py-10 text-center">
        <PluginLogo id={item.plugin_id || 'custom'} className="h-14 w-14" />
        <p className="mt-4 font-mono text-[13px] text-white/70">
          {item.mcp_url}
          <button
            type="button"
            className="ml-2 text-white/40 hover:text-white"
            onClick={() => navigator.clipboard.writeText(item.mcp_url)}
          >
            Copy
          </button>
        </p>
        <p className="mt-2 max-w-md text-[13px] text-white/40">
          {item.connected
            ? `Connected to ${item.name}.`
            : `You’re not connected to ${item.name} yet. Connect opens ${item.name} so you can sign in. The official MCP stays ${item.mcp_url}.`}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => connect(false)}
            className="rounded-md bg-white px-4 py-2 text-[13px] font-medium text-black disabled:opacity-40"
          >
            {busy ? 'Connecting…' : item.connected ? 'Reconnect' : 'Connect'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              window.location.href = connectorOauthStartUrl(item.id)
            }}
            className="rounded-md border border-white/15 px-4 py-2 text-[13px] text-white disabled:opacity-40"
          >
            Sign in with OAuth
          </button>
          {!item.connected && (
            <button
              type="button"
              disabled={busy}
              onClick={() => connect(true)}
              className="rounded-md border border-white/15 px-4 py-2 text-[13px] text-white disabled:opacity-40"
            >
              I’ve signed in
            </button>
          )}
        </div>
        {mcp && (
          <div className="mx-auto mt-5 w-full max-w-sm text-left">
            <McpSummary mcp={mcp} />
          </div>
        )}
        <form
          className="mx-auto mt-6 w-full max-w-sm text-left"
          onSubmit={(event) => {
            event.preventDefault()
            void saveToken()
          }}
        >
          <p className="text-[13px] text-white/70">MCP access token</p>
          <p className="mt-1 text-[12px] leading-5 text-white/40">
            Stored encrypted on your account and sent as Bearer on MCP calls. GitHub connectors can also use your signed-in GitHub token.
            {hasToken ? ' A token is already saved.' : ''}
          </p>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={hasToken ? 'Replace saved token' : 'Paste PAT or MCP token'}
            autoComplete="off"
            className="mt-3 w-full rounded-lg border border-white/12 bg-black/30 px-3 py-2 font-mono text-[13px] text-white outline-none placeholder:text-white/25"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-black disabled:opacity-40"
            >
              {hasToken ? 'Replace token' : 'Save token'}
            </button>
            {hasToken && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void clearToken()}
                className="rounded-md border border-white/15 px-3 py-1.5 text-[13px] text-white disabled:opacity-40"
              >
                Remove token
              </button>
            )}
          </div>
        </form>
        {plugin && (
          <a href={`/dashboard/plugins/${plugin.id}`} className="mt-3 text-[12px] text-white/50 underline">
            Open {plugin.name} plugin
          </a>
        )}
        {status && <p className="mt-3 text-[12px] text-white/50">{status}</p>}
        <button type="button" onClick={onRemoved} className="mt-6 text-[12px] text-white/35 hover:text-white">
          Remove connector
        </button>
      </div>
    </div>
  )
}

export function ConnectorsPanel({ path, plan }: { path: string; plan?: string }) {
  const [rows, setRows] = useState<ConnectorRow[]>([])
  const [paid, setPaid] = useState(hasPaidPlan(plan))
  const [canAdd, setCanAdd] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [browse, setBrowse] = useState(false)
  const [status, setStatus] = useState('')
  const remove = useConfirmDelete()
  const slug = slugFromPath(path)
  const selected = slug ? rows.find((row) => row.slug === slug) : null

  async function reload() {
    const data = await fetchConnectors()
    setRows(data.connectors)
    setPaid(data.paid)
    setCanAdd(data.paid || (data.remaining ?? 0) > 0)
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('oauth') === 'ok') setStatus('OAuth token saved. Tools can use it now.')
    if (params.get('oauth') === 'error') setStatus(params.get('detail') || 'OAuth failed')
    reload().catch(() => setStatus((current) => current || 'Could not load connectors'))
  }, [])

  const q = query.trim().toLowerCase()
  const listed = rows.filter((row) => {
    if (filter === 'connected' && !row.connected) return false
    if (filter === 'open' && row.connected) return false
    if (!q) return true
    return row.name.toLowerCase().includes(q) || row.mcp_url.toLowerCase().includes(q)
  })
  const popular = CONNECTOR_CATALOG.filter((item) => item.popular)
  const connectedIds = useMemo(() => new Set(rows.filter((row) => row.plugin_id).map((row) => row.plugin_id)), [rows])

  async function addCatalog(id: string) {
    const existing = rows.find((row) => row.plugin_id === id)
    if (existing) {
      if (!existing.connected) {
        const oauth = await startConnectorOauth(existing.id).catch(() => null)
        if (oauth?.actionUrl) {
          window.location.href = oauth.actionUrl
          return
        }
      }
      navigate(connectorConnectPath(existing.slug))
      return
    }
    if (!canAdd) {
      navigate(checkoutPath('pro'))
      return
    }
    setStatus('')
    try {
      const data = await addConnector({ catalogId: id })
      if (data.plugin) await addPlugin({ pluginId: data.plugin.id }).catch(() => undefined)
      await reload()
      if (data.connector?.id) {
        const oauth = await startConnectorOauth(data.connector.id).catch(() => null)
        if (oauth?.actionUrl) {
          window.location.href = oauth.actionUrl
          return
        }
        await connectConnector(data.connector.id).catch(() => undefined)
        navigate(connectorConnectPath(data.connector.slug))
        return
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not add connector')
    }
  }

  if (selected) {
    return (
      <>
        <ConnectorDetail
          item={selected}
          onBack={() => navigate('/dashboard/connectors')}
          onRemoved={() => remove.ask(selected.id)}
          onUpdated={() => void reload()}
        />
        {remove.target && (
          <ConfirmCard
            title="Remove this connector?"
            body="The saved MCP link will be deleted from your account."
            confirmLabel="Remove"
            busy={remove.busy}
            error={remove.error}
            onCancel={remove.cancel}
            onConfirm={() =>
              remove.run(async () => {
                await removeConnector(remove.target!)
                await reload()
                navigate('/dashboard/connectors')
              })
            }
          />
        )}
      </>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-white/45">Connect MCP servers and custom tools. Saved on your account.</p>
        <div className="relative flex items-center gap-2">
          {searchOpen ? (
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search connectors"
              className="w-48 rounded-md border border-white/12 bg-[#141413] px-3 py-1.5 text-[13px] outline-none"
            />
          ) : (
            <button type="button" onClick={() => setSearchOpen(true)} className="p-1.5 text-white/50 hover:text-white" aria-label="Search">
              <SearchIcon />
            </button>
          )}
          <button
            type="button"
            onClick={() => setAddOpen((open) => !open)}
            className="rounded-md border border-white/15 px-3 py-1.5 text-[13px] text-white"
          >
            Add ▾
          </button>
          {addOpen && (
            <div className="absolute top-full right-0 z-20 mt-2 w-72 rounded-xl border border-white/[0.08] bg-[#1a1918] p-2">
              <button
                type="button"
                className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/[0.04]"
                onClick={() => {
                  setAddOpen(false)
                  setBrowse(true)
                }}
              >
                <span className="mt-0.5 text-white/40">▣</span>
                <span>
                  <span className="block text-[13px] text-white">Browse connectors</span>
                </span>
              </button>
              <button
                type="button"
                className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/[0.04]"
                onClick={() => {
                  setAddOpen(false)
                  if (!canAdd) {
                    navigate(checkoutPath('pro'))
                    return
                  }
                  setCustomOpen(true)
                }}
              >
                <span className="mt-0.5 text-white/40">···</span>
                <span>
                  <span className="block text-[13px] text-white">Add custom connector</span>
                  <span className="mt-0.5 block text-[11px] text-white/40">
                    {paid
                      ? 'Save any HTTPS MCP URL and check it live.'
                      : canAdd
                        ? 'Free plan allows 1 connector.'
                        : 'Free plan allows 1 connector. Upgrade to add more.'}
                  </span>
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {!paid && <LimitNote />}

      {browse ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[15px] text-white">Browse connectors</p>
            <button type="button" onClick={() => setBrowse(false)} className="text-[13px] text-white/60 hover:text-white">
              Back
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {CONNECTOR_CATALOG.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[#141413] p-4">
                <PluginLogo id={item.id} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px]">{item.name}</p>
                  <p className="truncate font-mono text-[11px] text-white/35">{item.mcpUrl}</p>
                </div>
                <button type="button" onClick={() => addCatalog(item.id)} className="connect-btn">
                  {connectedIds.has(item.id) ? 'Open' : 'Connect'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div>
            <p className="mb-3 text-[13px] text-white/50">Popular</p>
            <div className="flex flex-wrap gap-3">
              {popular.map((item) => (
                <div
                  key={item.id}
                  className="flex min-h-[72px] w-full min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-[#141413] px-3 py-3 sm:min-w-[220px]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <PluginLogo id={item.id} />
                    <div className="min-w-0">
                      <p className="text-[14px]">{item.name}</p>
                      <p className="truncate font-mono text-[10px] text-white/30">{item.mcpUrl}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => addCatalog(item.id)} className="connect-btn shrink-0">
                    {connectedIds.has(item.id) ? 'Open' : 'Connect'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 text-[12px]">
            {(
              [
                ['all', 'All'],
                ['connected', 'Connected'],
                ['open', 'Not connected'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`rounded-full px-3 py-1 ${filter === id ? 'bg-white text-black' : 'bg-white/[0.06] text-white/55 hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#141413]">
            <div className="hidden grid-cols-[minmax(0,1fr)_88px_104px] gap-3 border-b border-white/[0.06] px-4 py-2 text-[11px] text-white/35 sm:grid">
              <span>Connector</span>
              <span>Type</span>
              <span>Status</span>
            </div>
            {listed.length === 0 && <p className="px-4 py-6 text-[13px] text-white/40">No connectors yet. Add a custom MCP URL or connect a popular one.</p>}
            {listed.map((row) => (
              <div key={row.id} className="grid items-center gap-3 border-t border-white/[0.05] px-4 py-3 sm:grid-cols-[minmax(0,1fr)_88px_104px]">
                <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => navigate(connectorConnectPath(row.slug))}>
                  <PluginLogo id={row.plugin_id || 'custom'} />
                  <span>
                    <span className="block text-[14px] text-white">{row.name}</span>
                    <span className="block truncate font-mono text-[11px] text-white/35">{row.mcp_url}</span>
                  </span>
                </button>
                <span className="flex items-center gap-1.5 text-[12px] text-white/50">
                  Web
                  {row.source === 'custom' ? <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/45">Custom</span> : null}
                </span>
                <span>
                  {row.connected ? (
                    <span className="text-white">✓{row.hasToken ? <span className="ml-1 text-[10px] text-white/40">token</span> : null}</span>
                  ) : (
                    <button type="button" onClick={() => navigate(connectorConnectPath(row.slug))} className="connect-btn">
                      Connect
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {customOpen && (
        <CustomModal
          onClose={() => setCustomOpen(false)}
          onSaved={(row) => {
            setCustomOpen(false)
            reload().then(() => navigate(connectorConnectPath(row.slug)))
          }}
        />
      )}
      {status && <p className="text-[12px] text-white/55">{status}</p>}
      {remove.target && (
        <ConfirmCard
          title="Remove this connector?"
          body="The saved MCP link will be deleted from your account."
          confirmLabel="Remove"
          busy={remove.busy}
          error={remove.error}
          onCancel={remove.cancel}
          onConfirm={() =>
            remove.run(async () => {
              await removeConnector(remove.target!)
              await reload()
            })
          }
        />
      )}
    </div>
  )
}
