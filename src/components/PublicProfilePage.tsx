import { useEffect, useState } from 'react'
import { fetchPublicProfile } from '../lib/api'
import { BrandMark } from './ui'
import { navigate } from '../lib/nav'
import { NotFoundPage } from './NotFoundPage'

export function PublicProfilePage({ username }: { username: string }) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'private' }
    | { status: 'missing' }
    | {
        status: 'ready'
        username: string
        firstName?: string | null
        lastName?: string | null
        links: string[]
        hasAvatar: boolean
        own?: boolean
      }
  >({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetchPublicProfile(username)
      .then((data) => {
        if (cancelled) return
        setState({
          status: 'ready',
          username: data.username || username,
          firstName: data.firstName,
          lastName: data.lastName,
          links: data.links || [],
          hasAvatar: Boolean(data.hasAvatar),
          own: data.own,
        })
      })
      .catch((error: Error & { private?: boolean }) => {
        if (!cancelled) setState({ status: error.private ? 'private' : 'missing' })
      })
    return () => {
      cancelled = true
    }
  }, [username])

  if (state.status === 'missing') return <NotFoundPage />

  const display =
    state.status === 'ready'
      ? [state.firstName, state.lastName].filter(Boolean).join(' ') || `@${state.username}`
      : `@${username}`

  return (
    <div className="theme-app min-h-svh">
      <header className="flex items-center justify-between px-5 py-4">
        <button type="button" onClick={() => navigate('/')}>
          <BrandMark className="h-6 w-auto" />
        </button>
        <button type="button" className="text-[13px] text-white/50 hover:text-white" onClick={() => navigate('/login')}>
          Sign in
        </button>
      </header>
      <main className="mx-auto w-full max-w-[520px] px-5 py-16 text-center">
        {state.status === 'loading' && <p className="text-[14px] text-white/40">Loading…</p>}
        {state.status === 'private' && (
          <>
            <h1 className="text-[28px] font-medium tracking-[-0.04em]">This profile is private</h1>
            <p className="mt-3 text-[14px] text-white/45">@{username} has not made their Soumtok page public.</p>
          </>
        )}
        {state.status === 'ready' && (
          <>
            <img
              src={state.hasAvatar ? `/api/u/${encodeURIComponent(state.username)}/photo` : '/images/soumtok-mark.png'}
              alt=""
              className="mx-auto h-20 w-20 rounded-full bg-white/5 object-cover"
            />
            <h1 className="mt-5 text-[32px] font-medium tracking-[-0.04em]">{display}</h1>
            <p className="mt-2 text-[14px] text-white/45">@{state.username}</p>
            {state.links.length > 0 && (
              <div className="mt-6 space-y-2">
                {state.links.map((link) => (
                  <a
                    key={link}
                    href={link.startsWith('http') ? link : `https://${link}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-[14px] text-white/70 hover:text-white"
                  >
                    {link}
                  </a>
                ))}
              </div>
            )}
            {state.own && (
              <button
                type="button"
                className="mt-8 text-[13px] text-white/40 hover:text-white"
                onClick={() => navigate('/dashboard/settings')}
              >
                Edit profile
              </button>
            )}
          </>
        )}
      </main>
    </div>
  )
}
