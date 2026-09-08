import { useEffect, useState } from 'react'
import { checkUsername, fetchProfile, savePublicProfile, type Profile } from '../../lib/api'
import { navigate, openTab } from '../../lib/nav'
import { usernameError } from '../../../shared/username'

function Dots() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden">
      {Array.from({ length: 90 }, (_, i) => (
        <span
          key={i}
          className="absolute h-[5px] w-[5px] rounded-full"
          style={{
            left: `${(i * 37) % 100}%`,
            top: `${(i * 19) % 92}%`,
            background: i % 7 === 0 ? '#f54e00' : i % 4 === 0 ? '#d4d4d0' : '#3a3a36',
            opacity: 0.25 + ((i * 3) % 5) * 0.12,
          }}
        />
      ))}
    </div>
  )
}

export function CreateProfileModal({
  open,
  name,
  username,
  onClose,
  onSaved,
}: {
  open: boolean
  name: string
  username?: string | null
  onClose: () => void
  onSaved?: () => void
}) {
  const [step, setStep] = useState<'claim' | 'edit'>('claim')
  const [handle, setHandle] = useState(username || '')
  const [status, setStatus] = useState('')
  const [links, setLinks] = useState(['', ''])
  const [isPublic, setIsPublic] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const host = typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? window.location.host : 'soumtok.com'
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'S'

  useEffect(() => {
    if (!open) return
    setStep('claim')
    setHandle(username || '')
    setError('')
    fetchProfile()
      .then((data) => {
        setProfile(data)
        setHandle(data.username || username || '')
        setLinks(data.links?.length ? [...data.links, ''].slice(0, 8) : ['', ''])
        setIsPublic(Boolean(data.publicProfile))
      })
      .catch(() => undefined)
  }, [open, username])

  useEffect(() => {
    const value = handle.trim()
    if (!value) {
      setStatus('')
      return
    }
    if (value === (profile?.username || username)) {
      setStatus('Claimed')
      return
    }
    const issue = usernameError(value)
    if (issue) {
      setStatus(issue)
      return
    }
    setStatus('Checking…')
    const timer = window.setTimeout(() => {
      checkUsername(value)
        .then((result) => setStatus(result.available ? 'Available' : result.error || 'Taken'))
        .catch(() => setStatus('Could not check'))
    }, 280)
    return () => window.clearTimeout(timer)
  }, [handle, profile?.username, username])

  async function goNext() {
    const value = handle.trim()
    const issue = usernameError(value)
    if (issue) {
      setError(issue)
      return
    }
    if (value !== (profile?.username || username) && status !== 'Available') {
      setError(status || 'That handle is not available')
      return
    }
    setBusy(true)
    setError('')
    try {
      await savePublicProfile({ username: value })
      onSaved?.()
      setStep('edit')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not claim that handle')
    }
    setBusy(false)
  }

  async function persist(nextPublic = isPublic, nextLinks = links) {
    await savePublicProfile({
      username: handle.trim(),
      links: nextLinks.map((item) => item.trim()).filter(Boolean),
      publicProfile: nextPublic,
    })
    onSaved?.()
  }

  async function onTogglePublic() {
    const next = !isPublic
    setIsPublic(next)
    setError('')
    try {
      await persist(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save visibility')
      setIsPublic(!next)
    }
  }

  async function onView() {
    setBusy(true)
    setError('')
    try {
      await persist()
      onClose()
      navigate(`/${handle.trim()}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile')
    }
    setBusy(false)
  }

  async function onShare() {
    const url = `${window.location.origin}/${handle.trim()}`
    try {
      await persist()
      if (navigator.share) {
        await navigator.share({ title: name, url })
      } else {
        await navigator.clipboard.writeText(url)
        setStatus('Link copied')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not share')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-[440px] overflow-hidden rounded-2xl border border-white/10 bg-[#161614] text-white shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
      >
        <Dots />
        <button
          type="button"
          aria-label="Close"
          className="absolute top-3 right-3 z-10 text-[18px] text-white/40 hover:text-white"
          onClick={onClose}
        >
          ×
        </button>

        {step === 'claim' ? (
          <div className="relative px-6 pt-24 pb-5">
            <h2 className="text-[26px] font-medium tracking-[-0.03em]">Claim your handle</h2>
            <p className="mt-2 text-[14px] leading-6 text-white/50">
              A public profile for how you build. Showing your token, model, and agent usage.
            </p>
            <input
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              spellCheck={false}
              placeholder="handle"
              className="mt-5 w-full rounded-lg border border-white/10 bg-[#0c0c0b] px-3 py-2.5 text-[14px] outline-none"
            />
            <p className="mt-2 text-[12px] text-white/40">
              Visible at {host}/@{handle.trim() || 'handle'}
            </p>
            {status && status !== 'Checking…' && (
              <p className={`mt-1 text-[12px] ${status === 'Available' || status === 'Claimed' ? 'text-white/45' : 'text-[#f54e00]'}`}>
                {status}
              </p>
            )}
            {error && <p className="mt-3 text-[12px] text-[#ff8a70]">{error}</p>}
            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                className="text-[13px] text-white/50 hover:text-white"
                onClick={() => {
                  onClose()
                  openTab('/docs/profile')
                }}
              >
                Learn more ↗
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void goNext()}
                className="rounded-lg bg-[#262624] px-4 py-1.5 text-[13px] text-white hover:bg-[#30302e] disabled:opacity-45"
              >
                {busy ? 'Saving…' : username ? 'Next' : 'Claim'}
              </button>
            </div>
          </div>
        ) : (
          <div className="relative px-6 pt-16 pb-5">
            <div className="flex flex-col items-center text-center">
              {profile?.hasAvatar ? (
                <img
                  src="/api/me/photo/avatar"
                  alt=""
                  className="h-16 w-16 rounded-full bg-white/10 object-cover"
                />
              ) : (
                <span className="grid h-16 w-16 place-items-center rounded-full bg-white/10 text-[18px]">
                  {initials}
                </span>
              )}
              <p className="mt-3 text-[20px] font-medium">{name}</p>
              <p className="mt-1 text-[13px] text-white/40">
                {host}/@{handle.trim()}
              </p>
            </div>
            <p className="mt-6 text-[13px] text-white/45">Add links people should see on your profile.</p>
            <div className="mt-3 space-y-2">
              {links.map((link, index) => (
                <input
                  key={index}
                  value={link}
                  onChange={(event) =>
                    setLinks((current) => current.map((item, i) => (i === index ? event.target.value : item)))
                  }
                  placeholder={index === 0 ? 'x.com/username' : index === 1 ? 'github.com/username' : 'your-link.com'}
                  className="w-full rounded-lg border border-white/10 bg-[#0c0c0b] px-3 py-2.5 text-[14px] outline-none"
                />
              ))}
            </div>
            {links.length < 8 && (
              <button
                type="button"
                className="mt-2 text-[13px] text-white/45 hover:text-white"
                onClick={() => setLinks((current) => [...current, ''])}
              >
                Add Link
              </button>
            )}
            {error && <p className="mt-3 text-[12px] text-[#ff8a70]">{error}</p>}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <button type="button" className="flex items-center gap-2" onClick={() => void onTogglePublic()}>
                <span className={`relative h-6 w-11 rounded-full ${isPublic ? 'bg-[#22c55e]' : 'bg-white/15'}`}>
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                      isPublic ? 'left-5' : 'left-0.5'
                    }`}
                  />
                </span>
                <span className="text-[13px]">{isPublic ? 'Public' : 'Private'}</span>
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void onShare()}
                  className="rounded-lg border border-white/12 px-3 py-1.5 text-[13px] hover:bg-white/[0.04]"
                >
                  Share
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onView()}
                  className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-black hover:bg-[#f2f2f0] disabled:opacity-45"
                >
                  {busy ? 'Saving…' : 'View Profile'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
