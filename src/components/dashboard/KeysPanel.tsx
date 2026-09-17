import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  createSshKey,
  createUserApiKey,
  deleteSshKey,
  deleteUserApiKey,
  fetchAccountKeys,
  fetchProviderKeys,
  saveProviderKey,
  deleteProviderKey,
  type SshKeyRow,
  type UserApiKey,
} from '../../lib/api'
import { KEY_PROVIDERS } from '../../../shared/models'
import { navigate, openTab } from '../../lib/nav'
import { ConfirmCard, useConfirmDelete } from '../ConfirmCard'

function EmptyBox({
  title,
  body,
  action,
  onClick,
}: {
  title: string
  body: string
  action: string
  onClick: () => void
}) {
  return (
    <div className="flex min-h-[132px] flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-[#141413] px-5 py-6 text-center">
      <p className="text-[14px] font-medium">{title}</p>
      <p className="mt-1 text-[12px] text-white/40">{body}</p>
      <button
        type="button"
        onClick={onClick}
        className="mt-4 rounded-full bg-white px-3.5 py-1.5 text-[12px] font-medium text-black hover:bg-[#f2f2f0]"
      >
        {action}
      </button>
    </div>
  )
}

const EXPIRE_OPTS = [
  { days: 180, label: '180 days (recommended)' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
  { days: null, label: 'Never expires' },
] as const

function ExpireSelect({
  value,
  onChange,
}: {
  value: number | null
  onChange: (days: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 220 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const current = EXPIRE_OPTS.find((item) => item.days === value) || EXPIRE_OPTS[0]

  function place() {
    const box = wrapRef.current?.getBoundingClientRect()
    if (!box) return
    const width = Math.max(box.width, 220)
    const left = Math.min(box.left, window.innerWidth - width - 8)
    const below = box.bottom + 6
    const estimated = 220
    const top = below + estimated > window.innerHeight - 8 ? Math.max(8, box.top - estimated - 6) : below
    setPos({ top, left: Math.max(8, left), width })
  }

  useEffect(() => {
    if (!open) return
    place()
    function onDoc(event: MouseEvent) {
      const target = event.target as Node
      if (wrapRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', onDoc)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('mousedown', onDoc)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="relative min-w-[196px]">
      <button
        type="button"
        onClick={() => setOpen((next) => !next)}
        className="flex w-full items-center justify-between rounded-lg border border-white/12 bg-[#0c0c0b] px-3 py-2 text-left text-[12px] text-white/80"
      >
        {current.label}
        <span className="text-white/35">▾</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="theme-app fixed z-[90] overflow-hidden rounded-lg border border-white/12 bg-[#161614] py-1 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {EXPIRE_OPTS.map((item) => {
              const on = item.days === value
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    onChange(item.days)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-[12px] ${
                    on ? 'bg-white/[0.08] text-white' : 'text-white/70 hover:bg-white/[0.05]'
                  }`}
                >
                  {item.label}
                  {on && <span className="text-white">✓</span>}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}

function SecretOnce({
  value,
  note,
  onDone,
}: {
  value: string
  note: string
  onDone: () => void
}) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="rounded-xl border border-white/12 bg-[#141413] p-4">
      <p className="text-[13px] text-white/55">{note}</p>
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-black/40 px-3 py-2 text-[12px] text-white/85">
        {value}
      </pre>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value)
            setCopied(true)
          }}
          className="rounded-md bg-white px-3 py-1.5 text-[12px] font-medium text-black"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        {copied && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-md border border-white/15 px-3 py-1.5 text-[12px] text-white"
          >
            Done
          </button>
        )}
      </div>
    </div>
  )
}

const SSH_PLACEHOLDER =
  "Begins with 'ssh-rsa', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-ed25519', 'rsa-sha2-256', or 'rsa-sha2-512'"

function SshKeyModal({
  title,
  publicKey,
  busy,
  onTitle,
  onPublicKey,
  onClose,
  onAdd,
  onGenerate,
}: {
  title: string
  publicKey: string
  busy: boolean
  onTitle: (value: string) => void
  onPublicKey: (value: string) => void
  onClose: () => void
  onAdd: (event: FormEvent) => void
  onGenerate: () => void
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 px-4" onClick={onClose}>
      <form
        role="dialog"
        aria-labelledby="ssh-key-title"
        aria-modal="true"
        onSubmit={onAdd}
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-[560px] rounded-2xl border border-white/10 bg-[#141413] px-6 pb-5 pt-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center text-[22px] leading-none text-white/45 hover:text-white"
        >
          ×
        </button>
        <h2 id="ssh-key-title" className="text-center text-[20px] font-medium">
          Add your SSH Key
        </h2>
        <input
          value={title}
          onChange={(event) => onTitle(event.target.value)}
          placeholder="Title"
          className="mt-6 w-full rounded-lg border border-white/12 bg-[#0c0c0b] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-white/35"
        />
        <textarea
          value={publicKey}
          onChange={(event) => onPublicKey(event.target.value)}
          placeholder={SSH_PLACEHOLDER}
          rows={6}
          className="mt-3 w-full resize-none rounded-lg border border-white/12 bg-[#0c0c0b] px-3 py-2.5 text-[13px] leading-5 text-white outline-none placeholder:text-white/35"
        />
        <p className="mt-3 text-[12px] text-white/40">
          Don't have a key yet?{' '}
          <button
            type="button"
            disabled={busy}
            onClick={onGenerate}
            className="text-white/70 underline disabled:opacity-50"
          >
            Generate a new key pair
          </button>
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-white/[0.08] px-3.5 py-1.5 text-[13px] text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !publicKey.trim()}
            className="rounded-md bg-white/[0.14] px-3.5 py-1.5 text-[13px] text-white disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Add Key'}
          </button>
        </div>
      </form>
    </div>
  )
}

function TokenReveal({ value, onDone }: { value: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="min-w-0">
      <p className="truncate font-mono text-[12px] text-white/90" title={value}>
        {value}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value)
            setCopied(true)
          }}
          className="rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-black"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        {copied && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-md border border-white/15 px-2.5 py-1 text-[11px] text-white"
          >
            Done
          </button>
        )}
      </div>
    </div>
  )
}

function formatDay(value?: string | null) {
  if (!value) return 'Never'
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function DocCard({
  href,
  title,
  body,
  icon,
}: {
  href: string
  title: string
  body: string
  icon: 'book' | 'cloud'
}) {
  return (
    <button
      type="button"
      onClick={() => openTab(href)}
      className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-[#141413] p-4 text-left hover:border-white/12"
    >
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center text-white/55">
        {icon === 'book' ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path d="M3.4 3.6h4.6A1.8 1.8 0 0 1 9.8 5.4v9.2H4.8A1.4 1.4 0 0 1 3.4 13.2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M14.6 3.6H10A1.8 1.8 0 0 0 8.2 5.4v9.2h5A1.4 1.4 0 0 0 14.6 13.2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path
              d="M4.6 12.6h8.2a2.5 2.5 0 0 0 .4-5 3.4 3.4 0 0 0-6.5-1.2A2.7 2.7 0 0 0 4.6 12.6Z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span>
        <span className="block text-[14px] font-medium">
          {title} <span className="text-white/35">↗</span>
        </span>
        <span className="mt-1 block text-[12px] leading-5 text-white/40">{body}</span>
      </span>
    </button>
  )
}

export function KeysPanel() {
  const [apiKeys, setApiKeys] = useState<UserApiKey[]>([])
  const [sshKeys, setSshKeys] = useState<SshKeyRow[]>([])
  const [addingApi, setAddingApi] = useState(false)
  const [addingSsh, setAddingSsh] = useState(false)
  const [apiName, setApiName] = useState('')
  const [expiresIn, setExpiresIn] = useState<number | null>(180)
  const [sshName, setSshName] = useState('')
  const [sshPublic, setSshPublic] = useState('')
  const [revealed, setRevealed] = useState('')
  const [revealedApiId, setRevealedApiId] = useState('')
  const [sshNote, setSshNote] = useState('')
  const [providerKeys, setProviderKeys] = useState<{ id: string; provider: string; label: string; last4: string }[]>([])
  const [addingProvider, setAddingProvider] = useState(false)
  const [providerId, setProviderId] = useState(KEY_PROVIDERS[0]?.id || 'openai')
  const [providerSecret, setProviderSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const apiDelete = useConfirmDelete()
  const sshDelete = useConfirmDelete()
  const providerDelete = useConfirmDelete()

  async function reload() {
    const [account, providers] = await Promise.all([fetchAccountKeys(), fetchProviderKeys().catch(() => ({ keys: [] }))])
    setApiKeys(account.apiKeys)
    setSshKeys(account.sshKeys)
    setProviderKeys(providers.keys)
  }

  useEffect(() => {
    reload().catch(() => setStatus('Could not load keys'))
  }, [])

  async function onCreateApi(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setStatus('')
    try {
      const created = await createUserApiKey(apiName.trim() || 'User API Key', expiresIn)
      setRevealedApiId(created.id)
      setRevealed(created.token)
      setAddingApi(false)
      setApiName('')
      setExpiresIn(180)
      await reload()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create API key')
    } finally {
      setBusy(false)
    }
  }

  function closeSshModal() {
    setAddingSsh(false)
    setSshName('')
    setSshPublic('')
  }

  async function saveSsh(publicKey?: string) {
    setBusy(true)
    setStatus('')
    try {
      const created = await createSshKey(sshName.trim() || 'Soumtok', publicKey)
      setAddingSsh(false)
      setSshName('')
      setSshPublic('')
      await reload()
      if (created.privateKey) {
        setSshNote('This private key is shown once. Copy it now. After Done, Soumtok will not show it again.')
        setRevealed(created.privateKey)
        setRevealedApiId('')
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create SSH key')
    } finally {
      setBusy(false)
    }
  }

  async function onCreateSsh(event: FormEvent) {
    event.preventDefault()
    if (!sshPublic.trim()) {
      setStatus('Paste a public SSH key, or generate a new key pair.')
      return
    }
    await saveSsh(sshPublic.trim())
  }

  return (
    <div className="space-y-7">
      <p className="text-[13px] text-white/45">
        Manage API keys and SSH keys for programmatic access to Soumtok.
      </p>

      <div className="grid gap-2 md:grid-cols-2">
        <DocCard
          href="/docs/keys"
          title="SDK docs"
          body="Call Studio, models, and usage with a Soumtok user API key."
          icon="book"
        />
        <DocCard
          href="/docs/api"
          title="API docs"
          body="HTTP reference for Studio, cloud agents, and Codebase access."
          icon="cloud"
        />
      </div>

      {revealed && !revealedApiId && (
        <SecretOnce
          value={revealed}
          note={sshNote}
          onDone={() => {
            setRevealed('')
            setSshNote('')
          }}
        />
      )}

      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-medium">User API Keys</h2>
            <p className="mt-1.5 max-w-[720px] text-[13px] leading-5 text-white/45">
              User API Keys give scripts and CI secure access to your Soumtok account — Studio, models, and usage.
              Treat them like passwords. Never share them publicly.
            </p>
          </div>
          {apiKeys.length > 0 && !addingApi && (
            <button
              type="button"
              onClick={() => setAddingApi(true)}
              className="rounded-full bg-white px-3.5 py-1.5 text-[12px] font-medium text-black"
            >
              New API Key
            </button>
          )}
        </div>
        {revealedApiId && revealed && (
          <p className="mt-3 text-[12px] text-white/50">
            This key is saved. Copy the token now — after Done it will never be shown again. Connect the CLI with{' '}
            <code className="text-white/70">soumtok login --api-key &lt;key&gt;</code> or set{' '}
            <code className="text-white/70">SOUMTOK_API_KEY</code>.
          </p>
        )}
        {addingApi || apiKeys.length > 0 ? (
          <div className="mt-3 overflow-x-auto rounded-xl border border-white/[0.06] bg-[#141413]">
            <div className="grid min-w-[860px] grid-cols-[1.3fr_1.2fr_0.6fr_0.8fr_1.1fr_auto] gap-3 px-4 py-2 text-[11px] text-white/35">
              <span>Name</span>
              <span>Token</span>
              <span>Scope</span>
              <span>Created</span>
              <span>Expires</span>
              <span className="text-right">Actions</span>
            </div>
            {addingApi && (
              <form
                onSubmit={onCreateApi}
                className="grid min-w-[860px] grid-cols-[1.3fr_1.2fr_0.6fr_0.8fr_1.1fr_auto] items-center gap-3 border-t border-white/[0.05] px-4 py-3"
              >
                <input
                  value={apiName}
                  onChange={(event) => setApiName(event.target.value)}
                  placeholder="Enter User API Key Name..."
                  className="rounded-lg border border-white/12 bg-[#0c0c0b] px-3 py-2 text-[12px] outline-none"
                />
                <span className="text-[12px] text-white/35">Will be generated</span>
                <span className="text-[12px] text-white/70">Admin</span>
                <span className="text-[12px] text-white/35">N/A</span>
                <ExpireSelect value={expiresIn} onChange={setExpiresIn} />
                <div className="flex justify-end gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-md bg-white/[0.08] px-3 py-1.5 text-[12px] text-white disabled:opacity-50"
                  >
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingApi(false)}
                    className="rounded-md border border-white/15 px-3 py-1.5 text-[12px] text-white"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {apiKeys.map((item) => (
              <div
                key={item.id}
                className="grid min-w-[860px] grid-cols-[1.3fr_1.2fr_0.6fr_0.8fr_1.1fr_auto] items-center gap-3 border-t border-white/[0.05] px-4 py-3 text-[12px]"
              >
                <span className="truncate text-white">{item.name}</span>
                {revealedApiId === item.id && revealed ? (
                  <TokenReveal
                    value={revealed}
                    onDone={() => {
                      setRevealed('')
                      setRevealedApiId('')
                    }}
                  />
                ) : (
                  <span className="truncate text-white/45">sk-soumtok-••••{item.last4}</span>
                )}
                <span className="text-white/70">Admin</span>
                <span className="text-white/45">{formatDay(item.created_at)}</span>
                <span className="text-white/45">{formatDay(item.expires_at)}</span>
                <div className="flex justify-end">
                  <button type="button" className="text-white/40 hover:text-white" onClick={() => apiDelete.ask(item.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3">
            <EmptyBox
              title="No API Keys Yet"
              body="No API Keys have been created yet."
              action="New API Key"
              onClick={() => setAddingApi(true)}
            />
          </div>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-medium">Model provider keys</h2>
            <p className="mt-1.5 max-w-[720px] text-[13px] leading-5 text-white/45">
              Your own OpenAI, Anthropic, Google, DeepSeek, xAI, or OpenRouter keys. Never paste these in Studio chat —
              save them here. Project secrets for an app you are building go in that workspace <code>.env</code> file.
            </p>
          </div>
          {!addingProvider && (
            <button
              type="button"
              onClick={() => setAddingProvider(true)}
              className="rounded-full bg-white px-3.5 py-1.5 text-[12px] font-medium text-black"
            >
              Add provider key
            </button>
          )}
        </div>
        {addingProvider && (
          <form
            className="mt-3 space-y-3 rounded-xl border border-white/[0.06] bg-[#141413] p-4"
            onSubmit={async (event) => {
              event.preventDefault()
              setBusy(true)
              setStatus('')
              try {
                await saveProviderKey(providerId, providerSecret.trim())
                setProviderSecret('')
                setAddingProvider(false)
                await reload()
              } catch (error) {
                setStatus(error instanceof Error ? error.message : 'Could not save provider key')
              } finally {
                setBusy(false)
              }
            }}
          >
            <select
              value={providerId}
              onChange={(event) => setProviderId(event.target.value as typeof providerId)}
              className="w-full rounded-lg border border-white/12 bg-[#0c0c0b] px-3 py-2 text-[13px]"
            >
              {KEY_PROVIDERS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              type="password"
              value={providerSecret}
              onChange={(event) => setProviderSecret(event.target.value)}
              placeholder="Paste the key here, not in chat"
              autoComplete="off"
              className="w-full rounded-lg border border-white/12 bg-[#0c0c0b] px-3 py-2 text-[13px]"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy || providerSecret.trim().length < 12}
                className="rounded-md bg-white px-3 py-1.5 text-[12px] font-medium text-black disabled:opacity-40"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingProvider(false)
                  setProviderSecret('')
                }}
                className="rounded-md border border-white/15 px-3 py-1.5 text-[12px]"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        <div className="mt-3 space-y-1">
          {providerKeys.map((item) => (
            <div
              key={item.id}
              className="ui-kv-row ui-kv-stack-sm min-w-0 rounded-xl border border-white/[0.06] bg-[#141413] px-4 py-3 text-[13px]"
            >
              <div className="min-w-0">
                <p className="truncate text-white">{KEY_PROVIDERS.find((row) => row.id === item.provider)?.name || item.provider}</p>
                <p className="text-[12px] text-white/40">••••{item.last4}</p>
              </div>
              <button type="button" className="shrink-0 text-white/40 hover:text-white" onClick={() => providerDelete.ask(item.provider)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-medium">Codebase SSH keys</h2>
            <p className="mt-1.5 max-w-[720px] text-[13px] leading-5 text-white/45">
              Manage keys for SSH authenticated Codebase access.{' '}
              <button type="button" className="text-white/70 underline" onClick={() => openTab('/docs/codebase')}>
                Learn more
              </button>
            </p>
          </div>
          {sshKeys.length > 0 && (
            <button
              type="button"
              onClick={() => setAddingSsh(true)}
              className="rounded-full bg-white px-3.5 py-1.5 text-[12px] font-medium text-black"
            >
              New SSH Key
            </button>
          )}
        </div>
        {sshKeys.length === 0 ? (
          <div className="mt-3">
            <EmptyBox
              title="No SSH Keys Yet"
              body="No SSH Keys have been created yet."
              action="New SSH Key"
              onClick={() => setAddingSsh(true)}
            />
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.06] bg-[#141413]">
            {sshKeys.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-4 py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px]">{item.name}</p>
                  <p className="truncate text-[12px] text-white/40">{item.fingerprint}</p>
                </div>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">Active</span>
                <button type="button" className="text-[12px] text-white/40 hover:text-white" onClick={() => sshDelete.ask(item.id)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
        {addingSsh && (
          <SshKeyModal
            title={sshName}
            publicKey={sshPublic}
            busy={busy}
            onTitle={setSshName}
            onPublicKey={setSshPublic}
            onClose={closeSshModal}
            onAdd={onCreateSsh}
            onGenerate={() => void saveSsh()}
          />
        )}
      </section>
      {status && <p className="text-[12px] text-[#f54e00]">{status}</p>}
      {apiDelete.target && (
        <ConfirmCard
          title="Delete this API key?"
          body={`${apiKeys.find((item) => item.id === apiDelete.target)?.name || 'This key'} will stop working. You cannot view the secret again.`}
          busy={apiDelete.busy}
          error={apiDelete.error}
          onCancel={apiDelete.cancel}
          onConfirm={() =>
            apiDelete.run(async () => {
              await deleteUserApiKey(apiDelete.target!)
              await reload()
            })
          }
        />
      )}
      {sshDelete.target && (
        <ConfirmCard
          title="Delete this SSH key?"
          body={`${sshKeys.find((item) => item.id === sshDelete.target)?.name || 'This key'} will no longer work for Codebase access.`}
          busy={sshDelete.busy}
          error={sshDelete.error}
          onCancel={sshDelete.cancel}
          onConfirm={() =>
            sshDelete.run(async () => {
              await deleteSshKey(sshDelete.target!)
              await reload()
            })
          }
        />
      )}
      {providerDelete.target && (
        <ConfirmCard
          title="Delete this provider key?"
          body="Studio will stop using this key for that lab. Add it again from this page — not from chat."
          busy={providerDelete.busy}
          error={providerDelete.error}
          onCancel={providerDelete.cancel}
          onConfirm={() =>
            providerDelete.run(async () => {
              await deleteProviderKey(providerDelete.target!)
              await reload()
            })
          }
        />
      )}
    </div>
  )
}
