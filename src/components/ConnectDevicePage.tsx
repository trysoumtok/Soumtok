import { useEffect, useState } from 'react'
import { authorizeConnectDevice, pollConnectDevice, type ConnectDeviceSession } from '../lib/api'
import { signIn } from '../lib/auth-client'
import { formatUserCode } from '../../shared/connectLinks'
import { navigate } from '../lib/nav'
import { BrandMark } from './ui'
import { PluginLogo } from './dashboard/PluginLogos'

export function ConnectDevicePage({ code }: { code: string }) {
  const [session, setSession] = useState<ConnectDeviceSession | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const display = formatUserCode(code)

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
      await signIn.social({ provider: 'github', callbackURL: `/connect/${display}` })
    } catch {
      setError('GitHub sign-in failed')
      setBusy(false)
    }
  }

  async function google() {
    setBusy(true)
    try {
      await signIn.social({ provider: 'google', callbackURL: `/connect/${display}` })
    } catch {
      setError('Google sign-in failed')
      setBusy(false)
    }
  }

  const done = session?.status === 'authorized'
  const provider = session?.provider || 'service'

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
          <PluginLogo id={provider} className="h-10 w-10" />
          <div>
            <p className="text-[12px] uppercase tracking-[0.12em] text-[#f54e00]/80">Connect</p>
            <h1 className="text-[22px] font-semibold tracking-[-0.03em]">
              {done ? `${session?.name || 'Service'} is connected` : `Connect ${session?.name || 'this service'}`}
            </h1>
          </div>
        </div>
        <p className="mt-3 font-mono text-[28px] font-semibold tracking-[0.18em] text-white">{display}</p>
        <p className="mt-3 text-[14px] leading-6 text-white/55">
          {done
            ? 'You can close this tab and go back to Studio.'
            : session?.detail ||
              'Sign in below, or open the provider link and enter this code. Then return to the chat and tap I’ve connected.'}
        </p>
        {error && <p className="mt-3 text-[13px] text-[#ff8a70]">{error}</p>}
        <div className="mt-6 flex flex-col gap-2">
          {!done && session?.url && (
            <a
              href={session.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-white py-3 text-center text-[15px] font-medium text-[#111110]"
            >
              Open {session.name || 'link'}
            </a>
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
