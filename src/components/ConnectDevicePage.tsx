import { useEffect, useState } from 'react'
import { authorizeConnectDevice, pollConnectDevice, type ConnectDeviceSession } from '../lib/api'
import { signInSocial, useSession } from '../lib/auth-client'
import { formatUserCode } from '../../shared/connectLinks'
import { navigate } from '../lib/nav'
import { BrandMark } from './ui'
import { PluginLogo } from './dashboard/PluginLogos'

export function ConnectDevicePage({ code }: { code: string }) {
  const { data: authSession } = useSession()
  const [session, setSession] = useState<ConnectDeviceSession | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<'link' | 'code' | ''>('')
  const display = formatUserCode(code)
  const pageLink =
    typeof window !== 'undefined' ? `${window.location.origin}/connect/${display}` : `/connect/${display}`

  async function copyText(text: string, kind: 'link' | 'code') {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      window.setTimeout(() => setCopied(''), 2000)
    } catch {
      window.prompt(kind === 'link' ? 'Copy link' : 'Copy code', text)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const next = await pollConnectDevice(code)
        if (!cancelled) {
          setSession(next)
          setError('')
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown code')
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 4000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [code])

  async function authorize() {
    if (!authSession) {
      sessionStorage.setItem('soumtok-next', `${window.location.pathname}${window.location.search}`)
      navigate('/login')
      return
    }
    setBusy(true)
    setError('')
    try {
      const next = await authorizeConnectDevice(code)
      setSession(next)
      if (next.oauthStart) {
        window.location.assign(next.oauthStart)
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not authorize')
    } finally {
      setBusy(false)
    }
  }

  async function github() {
    setBusy(true)
    try {
      await signInSocial({ provider: 'github', callbackURL: `/connect/${display}` })
    } catch {
      setError('GitHub sign-in failed')
      setBusy(false)
    }
  }

  async function google() {
    setBusy(true)
    try {
      await signInSocial({ provider: 'google', callbackURL: `/connect/${display}` })
    } catch {
      setError('Google sign-in failed')
      setBusy(false)
    }
  }

  const done = session?.status === 'authorized'
  const provider = session?.provider || 'service'
  const loading = !session && !error

  return (
    <div className="theme-app min-h-svh bg-[#0b0b0a] text-white">
      <header className="flex items-center gap-2 px-5 py-4">
        <button type="button" onClick={() => navigate('/')} className="inline-flex items-center gap-2">
          <BrandMark className="h-6 w-auto" />
          <span className="text-[15px] font-medium">Soumtok</span>
        </button>
      </header>
      <main className="mx-auto max-w-[440px] px-5 py-16">
        <div className="flex items-center gap-3">
          {loading ? (
            <span className="plugin-logo h-10 w-10 shrink-0 animate-pulse bg-white/[0.08]" aria-hidden="true" />
          ) : (
            <PluginLogo
              id={provider}
              logo={session?.logo}
              logos={session?.logos}
              className="h-10 w-10"
            />
          )}
          <div>
            <p className="text-[12px] uppercase tracking-[0.12em] text-[#f54e00]/80">Connect</p>
            <h1 className="text-[22px] font-semibold tracking-[-0.03em]">
              {done
                ? `${session?.name || 'Service'} is connected`
                : loading
                  ? 'Connect'
                  : `Connect ${session?.name || 'this service'}`}
            </h1>
          </div>
        </div>
        <p className="mt-3 font-mono text-[28px] font-semibold tracking-[0.18em] text-white">{display}</p>
        <p className="mt-3 text-[14px] leading-6 text-white/55">
          {done
            ? 'You can close this tab and go back to Studio.'
            : 'Copy the link or code below to finish on another device. Sign in here when you are ready.'}
        </p>
        {!done && (
          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
            <p className="text-[11px] uppercase tracking-[0.08em] text-white/35">Connect link</p>
            <p className="mt-1.5 break-all font-mono text-[12px] leading-5 text-white/72">{pageLink}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyText(pageLink, 'link')}
                className="rounded-md border border-white/15 px-3 py-1.5 text-[13px] text-white/85 hover:bg-white/[0.06]"
              >
                {copied === 'link' ? 'Link copied' : 'Copy link'}
              </button>
              <button
                type="button"
                onClick={() => void copyText(display, 'code')}
                className="rounded-md border border-white/15 px-3 py-1.5 text-[13px] text-white/85 hover:bg-white/[0.06]"
              >
                {copied === 'code' ? 'Code copied' : 'Copy code'}
              </button>
            </div>
            <p className="mt-2.5 text-[12px] leading-5 text-white/40">
              Paste the link in any browser, open it, and enter <span className="font-mono text-white/55">{display}</span>{' '}
              if asked.
            </p>
          </div>
        )}
        {error && <p className="mt-3 text-[13px] text-[#ff8a70]">{error}</p>}
        <div className="mt-6 flex flex-col gap-2">
          {!done && (
            <button
              type="button"
              onClick={() => void authorize()}
              disabled={busy}
              className="rounded-lg bg-white py-3 text-center text-[15px] font-medium text-[#111110] disabled:opacity-60"
            >
              {busy ? 'Opening sign-in…' : `Sign in to ${session?.name || 'service'}`}
            </button>
          )}
          {!done && provider === 'github' && (
            <button
              type="button"
              onClick={() => void github()}
              disabled={busy}
              className="rounded-lg border border-white/15 py-3 text-[15px] text-white/80 hover:text-white disabled:opacity-60"
            >
              Sign in with GitHub
            </button>
          )}
          {!done && (provider === 'firebase' || provider.startsWith('google')) && (
            <button
              type="button"
              onClick={() => void google()}
              disabled={busy}
              className="rounded-lg border border-white/15 py-3 text-[15px] text-white/80 hover:text-white disabled:opacity-60"
            >
              Sign in with Google
            </button>
          )}
          {!done && (
            <button
              type="button"
              onClick={() => void authorize()}
              disabled={busy}
              className="rounded-lg px-3 py-2 text-[14px] text-white/50 hover:text-white disabled:opacity-60"
            >
              {busy ? 'Checking…' : 'I’ve connected'}
            </button>
          )}
          {done && (
            <button
              type="button"
              onClick={() => navigate('/dashboard/studio')}
              className="rounded-lg bg-white py-3 text-[15px] font-medium text-[#111110]"
            >
              Back to Studio
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
