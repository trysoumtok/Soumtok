import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  checkUsername,
  deleteAccount,
  fetchSessions,
  revokeSession,
  saveSettings,
  uploadPhoto,
  type Profile,
} from '../../lib/api'
import { signOut } from '../../lib/auth-client'
import { navigate } from '../../lib/nav'
import { usernameError } from '../../../shared/username'
import { notifyAvatar } from '../../lib/avatar'
import { applyTheme, getThemePref, type ThemePref } from '../../lib/theme'
import { ConfirmCard, DeleteAccountCard } from '../ConfirmCard'
import { SecuritySettings } from './SecuritySettings'
import { TestHubShareLinksPanel } from './TestHubShareLinksPanel'

function timeAgo(value: string) {
  const mins = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000))
  if (mins < 60) return `About ${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `About ${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 45) return `About ${days} day${days === 1 ? '' : 's'} ago`
  const months = Math.max(1, Math.round(days / 30))
  return `About ${months} month${months === 1 ? '' : 's'} ago`
}

function splitName(name?: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  return { first: parts[0] || '', last: parts.slice(1).join(' ') }
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-white/[0.08] bg-[#141413] ${className}`}>
      {children}
    </div>
  )
}

function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-white/[0.05] px-5 py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[14px] text-white">{label}</p>
        {hint && <p className="mt-1 max-w-[520px] text-[12px] leading-5 text-white/40">{hint}</p>}
      </div>
      <div className="shrink-0 sm:text-right">{children}</div>
    </div>
  )
}

function GhostButton({
  children,
  onClick,
  danger,
  disabled,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-[13px] disabled:opacity-50 ${
        danger
          ? 'border-red-500/40 text-red-400 hover:bg-red-500/10'
          : 'border-white/15 text-white/80 hover:bg-white/[0.05]'
      }`}
    >
      {children}
    </button>
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { id: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-w-[160px] rounded-md border border-white/15 bg-[#0c0c0b] px-3 py-1.5 text-[13px] outline-none"
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`relative h-6 w-11 rounded-full transition-colors ${on ? 'bg-[#f54e00]' : 'bg-white/15'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-5' : 'left-0.5'}`} />
    </button>
  )
}

export function SettingsPanel({
  profile,
  email,
  name,
  onSaved,
}: {
  profile: Profile | null
  email?: string
  name?: string
  onSaved?: () => void
}) {
  const guessed = splitName(name)
  const [firstName, setFirstName] = useState(profile?.firstName || guessed.first)
  const [lastName, setLastName] = useState(profile?.lastName || guessed.last)
  const [handle, setHandle] = useState(profile?.username || '')
  const [handleStatus, setHandleStatus] = useState('')
  const [links, setLinks] = useState<string[]>(profile?.links?.length ? profile.links : [''])
  const [publicProfile, setPublicProfile] = useState(Boolean(profile?.publicProfile))
  const [shareUsage, setShareUsage] = useState(profile?.shareUsageData !== false)
  const [theme, setTheme] = useState<ThemePref>(() => (typeof window === 'undefined' ? 'system' : getThemePref()))
  const [lightTheme, setLightTheme] = useState(profile?.lightTheme || 'soumtok-light')
  const [darkTheme, setDarkTheme] = useState(profile?.darkTheme || 'soumtok-dark')
  const [prProvider, setPrProvider] = useState(profile?.prProvider || 'github')
  const [status, setStatus] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoNote, setPhotoNote] = useState('')
  const [avatarKey, setAvatarKey] = useState(0)
  const [sessions, setSessions] = useState<{ id: string; createdAt: string; device: string; current: boolean }[]>([])
  const [deletePhase, setDeletePhase] = useState<'closed' | 'form' | 'progress' | 'done'>('closed')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; current: boolean } | null>(null)
  const [revokeBusy, setRevokeBusy] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)
  const host = typeof window !== 'undefined' ? window.location.host : 'soumtok.com'
  const publicUrl = handle ? `${host}/${handle}` : ''

  useEffect(() => {
    setFirstName(profile?.firstName || guessed.first)
    setLastName(profile?.lastName || guessed.last)
    setHandle(profile?.username || '')
    setLinks(profile?.links?.length ? profile.links : [''])
    setPublicProfile(Boolean(profile?.publicProfile))
    setShareUsage(profile?.shareUsageData !== false)
    setTheme(getThemePref())
    setLightTheme(profile?.lightTheme || 'soumtok-light')
    setDarkTheme(profile?.darkTheme || 'soumtok-dark')
    setPrProvider(profile?.prProvider || 'github')
  }, [profile, guessed.first, guessed.last])

  useEffect(() => {
    function onTheme() {
      setTheme(getThemePref())
    }
    window.addEventListener('soumtok-theme', onTheme)
    return () => window.removeEventListener('soumtok-theme', onTheme)
  }, [])

  useEffect(() => {
    fetchSessions()
      .then((data) => setSessions(data.sessions))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    const value = handle.trim()
    if (!value || value === profile?.username) {
      setHandleStatus(value === profile?.username ? 'Claimed' : '')
      return
    }
    const issue = usernameError(value)
    if (issue) {
      setHandleStatus(issue)
      return
    }
    setHandleStatus('Checking…')
    const timer = window.setTimeout(() => {
      checkUsername(value)
        .then((result) => setHandleStatus(result.available ? 'Available' : result.error || 'Taken'))
        .catch(() => setHandleStatus('Could not check'))
    }, 280)
    return () => window.clearTimeout(timer)
  }, [handle, profile?.username])

  async function onPhoto(file?: File) {
    if (!file || photoBusy) return
    if (file.size > 2 * 1024 * 1024) {
      setPhotoNote('Image must be under 2 MB')
      return
    }
    setPhotoBusy(true)
    setPhotoNote('')
    try {
      await uploadPhoto('avatar', file)
      setAvatarKey((value) => value + 1)
      setPhotoNote('')
      notifyAvatar()
      onSaved?.()
    } catch (error) {
      setPhotoNote(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setPhotoBusy(false)
      if (photoRef.current) photoRef.current.value = ''
    }
  }

  async function onSave() {
    if (handle !== profile?.username && handleStatus !== 'Available') {
      setStatus(handleStatus || 'That username is not available')
      return
    }
    setStatus('Saving…')
    try {
      await saveSettings({
        firstName,
        lastName,
        links: links.map((item) => item.trim()).filter(Boolean),
        publicProfile,
        shareUsageData: shareUsage,
        theme,
        lightTheme,
        darkTheme,
        prProvider,
        username: handle !== profile?.username ? handle : undefined,
      })
      setStatus('Saved')
      onSaved?.()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save')
    }
  }

  return (
    <div className="w-full space-y-10">
      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <section className="flex min-h-0 flex-col">
          <h2 className="mb-3 text-[13px] text-white/45">Privacy</h2>
          <Card className="flex h-full flex-col">
            <Row
              label="Share data"
              hint="Your codebase, prompts, edits and other usage data can be stored to improve Soumtok."
            >
              <div className="flex min-w-0 items-center justify-start gap-2 sm:min-w-[168px] sm:justify-end">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    shareUsage ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-white/40'
                  }`}
                >
                  {shareUsage ? 'Active' : 'Off'}
                </span>
                <GhostButton onClick={() => setShareUsage((value) => !value)}>Edit</GhostButton>
              </div>
            </Row>
            <Row
              label="Model training"
              hint="Stays off unless Share data is Active. We never use this to train on your API keys."
            >
              <div className="flex min-w-0 items-center justify-start gap-2 sm:min-w-[168px] sm:justify-end">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    shareUsage ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-white/40'
                  }`}
                >
                  {shareUsage ? 'On with share' : 'Off'}
                </span>
              </div>
            </Row>
            <div className="mt-auto border-t border-white/[0.05] px-5 py-4">
              <p className="text-[12px] leading-5 text-white/40">
                Training stays off unless Share data is Active. This never includes your API keys.
              </p>
            </div>
          </Card>
        </section>
        <SecuritySettings />
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <h2 className="text-[13px] text-white/45">Profile</h2>
          {email && <p className="text-[12px] text-white/35">{email}</p>}
        </div>
        <Card>
          <div className="flex flex-col items-start justify-between gap-4 px-5 py-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <img
                src={profile?.hasAvatar ? `/api/me/photo/avatar?v=${avatarKey}` : '/images/soumtok-mark.png'}
                alt=""
                className="h-14 w-14 rounded-full bg-white/5 object-cover"
              />
              <div>
                <p className="text-[14px] text-white">Profile image</p>
                <p className="mt-1 text-[12px] text-white/40">PNG, JPEG, or WebP up to 2 MB</p>
              </div>
            </div>
            <div>
              <input
                ref={photoRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => onPhoto(event.target.files?.[0])}
              />
              <GhostButton disabled={photoBusy} onClick={() => photoRef.current?.click()}>
                {photoBusy ? 'Uploading…' : 'Upload image'}
              </GhostButton>
              {photoNote && <p className="mt-2 text-right text-[12px] text-[#f54e00]">{photoNote}</p>}
            </div>
          </div>

          <div className="grid gap-3 border-t border-white/[0.05] px-5 py-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-white/40">First name</span>
              <input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0c0c0b] px-3 py-2 text-[14px] outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-white/40">Last name</span>
              <input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0c0c0b] px-3 py-2 text-[14px] outline-none"
              />
            </label>
          </div>

          <Row
            label="Handle"
            hint="This is the username you claimed. Your public page is soumtok.com/username."
          >
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-white">@{handle || 'you'}</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/60">
                {profile?.username && handle === profile.username ? 'Claimed' : handleStatus || 'Claim'}
              </span>
            </div>
          </Row>
          <div className="border-t border-white/[0.05] px-5 py-4">
            <input
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              spellCheck={false}
              className="w-full rounded-md border border-white/10 bg-[#0c0c0b] px-3 py-2 text-[14px] outline-none"
            />
            {handleStatus && (
              <p className={`mt-2 text-[12px] ${handleStatus === 'Available' || handleStatus === 'Claimed' ? 'text-white/45' : 'text-[#f54e00]'}`}>
                {handleStatus === 'Claimed' ? `Public page · ${publicUrl}` : handleStatus}
              </p>
            )}
          </div>

          <div className="border-t border-white/[0.05] px-5 py-4">
            <p className="text-[14px] text-white">Links</p>
            <div className="mt-3 space-y-2">
              {links.map((link, index) => (
                <input
                  key={index}
                  value={link}
                  onChange={(event) =>
                    setLinks((current) => current.map((item, i) => (i === index ? event.target.value : item)))
                  }
                  placeholder="x.com/handle"
                  className="w-full rounded-md border border-white/10 bg-[#0c0c0b] px-3 py-2 text-[14px] outline-none"
                />
              ))}
            </div>
            {links.length < 8 && (
              <button
                type="button"
                className="mt-3 text-[13px] text-white/50 hover:text-white"
                onClick={() => setLinks((current) => [...current, ''])}
              >
                Add link
              </button>
            )}
          </div>

          <Row
            label="Public profile"
            hint={`When enabled, ${publicUrl || 'soumtok.com/username'} is visible to anyone with the link.`}
          >
            <Toggle on={publicProfile} onClick={() => setPublicProfile((value) => !value)} />
          </Row>

          <div className="flex items-center justify-between gap-3 border-t border-white/[0.05] px-5 py-4">
            {publicUrl ? (
              <button type="button" className="text-[12px] text-white/40 hover:text-white" onClick={() => navigate(`/${handle}`)}>
                Open {publicUrl}
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={onSave}
              className="rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-black hover:bg-[#f2f2f0]"
            >
              Save
            </button>
          </div>
        </Card>
        {status && <p className="mt-2 text-[12px] text-[#f54e00]">{status}</p>}
      </section>

      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <section className="flex min-h-0 flex-col">
          <h2 className="mb-3 flex items-center gap-2 text-[13px] text-white/45">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <rect x="1.5" y="2.5" width="11" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
              <path d="M4 12.5h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Appearance
          </h2>
          <Card className="h-full">
            <Row label="Theme">
              <Select
                value={theme}
                onChange={(value) => {
                  setTheme(value as ThemePref)
                  applyTheme(value as ThemePref)
                }}
                options={[
                  { id: 'system', label: 'System' },
                  { id: 'light', label: 'Light' },
                  { id: 'dark', label: 'Dark' },
                ]}
              />
            </Row>
            <Row label="Light theme" hint="Choose the theme used when your system is in light mode.">
              <Select
                value={lightTheme}
                onChange={setLightTheme}
                options={[{ id: 'soumtok-light', label: 'Soumtok Light' }]}
              />
            </Row>
            <Row label="Dark theme" hint="Choose the theme used when your system is in dark mode.">
              <Select
                value={darkTheme}
                onChange={setDarkTheme}
                options={[{ id: 'soumtok-dark', label: 'Soumtok Dark' }]}
              />
            </Row>
          </Card>
        </section>

        <section className="flex min-h-0 flex-col">
          <h2 className="mb-3 text-[13px] text-white/45">Pull Requests</h2>
          <Card className="flex h-full flex-col">
            <Row
              label="PR review provider"
              hint="Choose Soumtok, GitHub, or Graphite for pull request links on web and desktop."
            >
              <Select
                value={prProvider}
                onChange={setPrProvider}
                options={[
                  { id: 'github', label: 'GitHub' },
                  { id: 'soumtok', label: 'Soumtok' },
                  { id: 'graphite', label: 'Graphite' },
                ]}
              />
            </Row>
            <div className="mt-auto border-t border-white/[0.05] px-5 py-4">
              <p className="text-[12px] leading-5 text-white/40">
                This only changes how pull request links open. It does not move your GitHub connection.
              </p>
            </div>
          </Card>
        </section>
      </div>

      <section>
        <TestHubShareLinksPanel />
      </section>

      <section>
        <h2 className="mb-3 text-[13px] text-white/45">Active Sessions</h2>
        <Card>
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-5 py-2.5 text-[12px] text-white/35">
            <span>Device</span>
            <span>Created</span>
            <span className="w-[72px]" />
          </div>
          {sessions.length === 0 && (
            <p className="border-t border-white/[0.05] px-5 py-4 text-[13px] text-white/40">This web session.</p>
          )}
          {sessions.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t border-white/[0.05] px-5 py-3 text-[13px]"
            >
              <span className="flex items-center gap-2 text-white">
                {item.device === 'Web' ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <circle cx="7" cy="7" r="5.2" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M2 7h10M7 2c1.6 1.6 2.4 3.4 2.4 5S8.6 10.4 7 12C5.4 10.4 4.6 8.6 4.6 7S5.4 3.6 7 2Z" stroke="currentColor" strokeWidth="1.1" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <rect x="1.5" y="2.5" width="11" height="7.5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M5 12h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                )}
                {item.device}
                {item.current && <span className="text-[11px] text-white/35">This device</span>}
              </span>
              <span className="text-white/45">{timeAgo(item.createdAt)}</span>
              <GhostButton onClick={() => setRevokeTarget({ id: item.id, current: item.current })}>
                Revoke
              </GhostButton>
            </div>
          ))}
        </Card>
        <p className="mt-2 text-[12px] text-white/35">Session revocation may take up to 10 minutes to complete.</p>
      </section>

      <section>
        <h2 className="mb-3 text-[13px] text-white/45">More</h2>
        <Card>
          <Row label="Log out">
            <GhostButton
              onClick={async () => {
                await signOut()
                navigate('/')
              }}
            >
              Log out
            </GhostButton>
          </Row>
          <Row
            label="Delete account"
            hint="Permanently erase your Soumtok account. This email will be flagged and cannot be used to create another account."
          >
            <GhostButton
              danger
              onClick={() => {
                if (!email) {
                  setStatus('This account has no email to confirm.')
                  return
                }
                setDeleteError('')
                setDeletePhase('form')
              }}
            >
              Delete
            </GhostButton>
          </Row>
        </Card>
      </section>
      {revokeTarget && (
        <ConfirmCard
          title={revokeTarget.current ? 'Sign out this device?' : 'Revoke this session?'}
          body={
            revokeTarget.current
              ? 'This signs you out of Soumtok on this device.'
              : 'This device will need to sign in again.'
          }
          confirmLabel={revokeTarget.current ? 'Sign out' : 'Revoke'}
          busy={revokeBusy}
          onCancel={() => setRevokeTarget(null)}
          onConfirm={async () => {
            setRevokeBusy(true)
            try {
              await revokeSession(revokeTarget.id)
              if (revokeTarget.current) {
                await signOut()
                navigate('/login')
                return
              }
              setSessions((current) => current.filter((row) => row.id !== revokeTarget.id))
              setRevokeTarget(null)
            } finally {
              setRevokeBusy(false)
            }
          }}
        />
      )}
      {deletePhase !== 'closed' && email && (
        <DeleteAccountCard
          email={email}
          busy={deleteBusy}
          error={deleteError}
          phase={deletePhase === 'closed' ? 'form' : deletePhase}
          onCancel={() => {
            if (!deleteBusy) setDeletePhase('closed')
          }}
          onConfirm={async (typedEmail, confirm) => {
            setDeleteBusy(true)
            setDeleteError('')
            setDeletePhase('progress')
            const started = Date.now()
            try {
              await deleteAccount(typedEmail, confirm)
              const wait = Math.max(0, 3000 - (Date.now() - started))
              if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait))
              setDeletePhase('done')
            } catch (err) {
              setDeletePhase('form')
              setDeleteError(err instanceof Error ? err.message : 'Could not delete account')
            } finally {
              setDeleteBusy(false)
            }
          }}
          onFinished={async () => {
            await signOut()
            navigate('/')
          }}
        />
      )}
    </div>
  )
}
