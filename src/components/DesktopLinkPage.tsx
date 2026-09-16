import { useEffect, useState } from 'react'
import { BrandMark } from './ui'

export function DesktopLinkPage({ id }: { id: string }) {
  const [state, setState] = useState<'linking' | 'done' | 'error'>('linking')

  useEffect(() => {
    let cancelled = false
    async function run() {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch('/api/desktop/finish', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          })
          if (res.ok) {
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
  }, [id])

  return (
    <div className="theme-app keep-dark min-h-svh bg-[#0b0b0a] text-white">
      <header className="flex items-center gap-2 px-5 py-4">
        <BrandMark className="h-6 w-auto" />
        <span className="text-[15px] font-medium">Soumtok</span>
      </header>
      <main className="mx-auto max-w-[420px] px-5 py-20 text-center">
        <h1 className="text-[22px] font-semibold tracking-[-0.03em]">
          {state === 'done' ? 'You can return to the app' : state === 'error' ? 'Could not connect' : 'Connecting the app'}
        </h1>
        <p className="mt-3 text-[14px] leading-6 text-white/55">
          {state === 'done'
            ? 'Sign-in is complete. Go back to Soumtok.'
            : state === 'error'
              ? 'Open the app and choose Sign in again.'
              : 'One moment…'}
        </p>
      </main>
    </div>
  )
}
