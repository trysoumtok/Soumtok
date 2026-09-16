import { useSession } from '../lib/auth-client'
import { navigate } from '../lib/nav'
import { Logo } from './ui'
import { WorldMap } from './WorldMap'

function ChipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3.2" y="3.2" width="9.6" height="9.6" rx="1.6" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M6 1.6v1.8M10 1.6v1.8M6 12.6v1.8M10 12.6v1.8M1.6 6h1.8M1.6 10h1.8M12.6 6h1.8M12.6 10h1.8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function NotFoundPage() {
  const { data: session } = useSession()
  const path = typeof window !== 'undefined' ? window.location.pathname : '/'

  return (
    <div className="theme-app relative flex min-h-svh flex-col bg-[#0b0b0a] text-white">
      <header className="absolute left-6 top-6 z-20 md:left-8 md:top-7">
        <Logo href="/" size="md" />
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-2">
        <section className="flex flex-col justify-center px-6 pb-10 pt-24 md:px-16 lg:px-20">
          <p className="text-[12px] tracking-[0.14em] text-white/35 uppercase">Error 404</p>
          <h1 className="mt-4 max-w-[540px] text-[28px] font-medium leading-[1.25] tracking-[-0.03em] md:text-[34px]">
            This page is not on the map{' '}
            <span className="align-middle inline-flex rounded-full bg-[#f54e00] px-2.5 py-[3px] text-[13px] font-semibold tracking-[-0.02em] text-[#1a0900]">
              404
            </span>
          </h1>
          <p className="mt-3 max-w-[440px] text-[14px] leading-6 text-white/42">
            The address you opened is not a Soumtok page. Go home, or start an account and claim a
            handle people can find.
          </p>
          <p className="mt-5 font-mono text-[12px] text-white/28">{path}</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded-md bg-white px-3.5 py-1.5 text-[13px] font-medium text-black transition hover:bg-[#f2f2f0]"
            >
              Home
            </button>
            {session ? (
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="rounded-md border border-white/15 px-3.5 py-1.5 text-[13px] text-white/80 hover:bg-white/[0.05]"
              >
                Dashboard
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/signup')}
                className="rounded-md border border-white/15 px-3.5 py-1.5 text-[13px] text-white/80 hover:bg-white/[0.05]"
              >
                Create account
              </button>
            )}
          </div>
        </section>

        <aside className="keep-dark relative hidden overflow-hidden bg-[#0b0b0a] lg:block">
          <WorldMap
            card={
              <>
                <div className="flex items-center gap-2 text-[13px] font-medium">
                  <span className="text-[#f54e00]">
                    <ChipIcon />
                  </span>
                  Still building
                </div>
                <ul className="mt-3 space-y-1.5 text-[12.5px] leading-5 text-white/55">
                  <li>Agents that ship real code</li>
                  <li>A handle people can find</li>
                  <li>Studio, models, and your repos</li>
                  <li>First lab in Lagos</li>
                </ul>
              </>
            }
          />
        </aside>
      </div>

      <footer className="flex items-center justify-between border-t border-white/[0.06] px-6 py-3.5 md:px-16">
        <p className="text-[12px] text-white/30">Soumtok</p>
        <button
          type="button"
          className="text-[13px] text-white/40 hover:text-white"
          onClick={() => navigate(session ? '/dashboard' : '/login')}
        >
          {session ? 'Back to dashboard' : 'Sign in'}
        </button>
      </footer>
    </div>
  )
}
