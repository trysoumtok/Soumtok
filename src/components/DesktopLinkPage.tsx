import { useEffect, useState } from 'react'
import { BrandMark } from './ui'

function desktopVerifier() {
  try {
    const fromStore = sessionStorage.getItem('soumtok-desktop-verifier') || ''
    if (fromStore) return fromStore
    const hash = window.location.hash.replace(/^#/, '')
    const fromHash = new URLSearchParams(hash).get('dv') || ''
    if (fromHash) {
      sessionStorage.setItem('soumtok-desktop-verifier', fromHash)
      return fromHash
    }
  } catch {
    /* ignore */
  }
  return ''
}

export function DesktopLinkPage({ id }: { id: string }) {
  const [state, setState] = useState<'confirm' | 'linking' | 'done' | 'error'>('confirm')
  const [verifier] = useState(desktopVerifier)

  useEffect(() => {
    if (state !== 'linking') return
    let cancelled = false
    async function run() {
      if (!verifier) {
        if (!cancelled) setState('error')
        return
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch('/api/desktop/finish', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, verifier }),
          })
          if (res.ok) {
            sessionStorage.removeItem('soumtok-desktop-verifier')
            if (!cancelled) setState('done')
            return
          }
          if (res.status !== 401 && res.status !== 410) break
        } catch {
          /* retry */
        }
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
      }
      if (!cancelled) setState('error')
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [id, state, verifier])

  return (
    <div className="theme-app keep-dark min-h-svh bg-[#0b0b0a] text-white">
      <header className="flex items-center gap-2 px-5 py-4">
        <BrandMark className="h-6 w-auto" />
        <span className="text-[15px] font-medium">Soumtok</span>
      </header>
      <main className="mx-auto max-w-[420px] px-5 py-20 text-center">
        <h1 className="text-[22px] font-semibold tracking-[-0.03em]">
          {state === 'done'
            ? 'You can return to the app'
            : state === 'error'
              ? 'Could not connect'
              : state === 'confirm'
                ? 'Connect Soumtok Desktop'
                : 'Connecting the app'}
        </h1>
        <p className="mt-3 text-[14px] leading-6 text-white/55">
          {state === 'done'
            ? 'Sign-in is complete. Go back to Soumtok.'
            : state === 'error'
              ? 'Open Soumtok Desktop and choose Sign in again. Only continue if you started sign-in from your own app.'
              : state === 'confirm'
                ? 'Only approve if you opened this page from Soumtok Desktop on your computer — not from an email or chat link.'
                : 'One moment…'}
        </p>
        {state === 'confirm' ? (
          <button
            type="button"
            className="mt-8 w-full rounded-[10px] bg-[#262626] px-4 py-3 text-[15px] font-semibold text-white hover:bg-[#303030]"
            onClick={() => setState('linking')}
          >
            Approve desktop sign-in
          </button>
        ) : null}
      </main>
    </div>
  )
}
