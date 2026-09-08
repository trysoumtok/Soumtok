import { useState } from 'react'
import { useSession } from '../lib/auth-client'
import { navigate, openTab } from '../lib/nav'

export function SiteHeader({ active }: { active: 'docs' | 'help' | 'contact' | 'none' }) {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0b0b0a]/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4 md:gap-4 md:px-6">
        <button type="button" className="shrink-0" onClick={() => navigate('/')} aria-label="Soumtok">
          <img src="/images/soumtok-lockup.png" alt="Soumtok" className="brand-logo h-5 w-auto max-w-[140px]" />
        </button>
        <nav className="hidden items-center gap-5 text-[13px] md:flex">
          <NavLink href="/docs" label="Docs" on={active === 'docs'} />
          <NavLink href="/docs/api" label="API" on={false} />
          <NavLink href="/docs/quick-start" label="Learn" on={false} />
          <NavLink href="/help" label="Help" on={active === 'help'} />
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {active !== 'contact' && (
            <button
              type="button"
              onClick={() => openTab('/contact')}
              className="hidden text-[13px] text-white/55 hover:text-white sm:block"
            >
              Contact
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate(session?.user ? '/dashboard' : '/login')}
            className="rounded-full border border-white/20 px-3 py-1 text-[13px] text-white/80 hover:bg-white/[0.05]"
          >
            {session?.user ? 'Dashboard' : 'Sign in'}
          </button>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center text-white/70 md:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              {open ? (
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.6" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.6" />
              )}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-white/[0.06] px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            <NavLink href="/docs" label="Docs" on={active === 'docs'} stack />
            <NavLink href="/docs/api" label="API" on={false} stack />
            <NavLink href="/docs/quick-start" label="Learn" on={false} stack />
            <NavLink href="/help" label="Help" on={active === 'help'} stack />
            {active !== 'contact' && (
              <button
                type="button"
                onClick={() => openTab('/contact')}
                className="block w-full py-2 text-left text-[13px] text-white/70"
              >
                Contact
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  )
}

function NavLink({ href, label, on, stack }: { href: string; label: string; on: boolean; stack?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => (on ? undefined : openTab(href))}
      className={
        stack
          ? `block w-full py-2 text-left text-[13px] ${on ? 'text-[#f54e00]' : 'text-white/70'}`
          : on
            ? 'border-b-2 border-[#f54e00] pb-3 pt-3 text-[#f54e00]'
            : 'text-white/55 hover:text-white'
      }
    >
      {label}
    </button>
  )
}
