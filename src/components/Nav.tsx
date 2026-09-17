import { useEffect, useState } from 'react'
import { avatarUrl } from '../lib/avatar'
import { useSession } from '../lib/auth-client'
import { usePath } from '../lib/nav'
import { Logo, PillButton } from './ui'

const links = [
  { href: '/docs', label: 'Docs' },
  { href: '#product', label: 'Studio' },
  { href: '#models', label: 'Models' },
  { href: '#pricing', label: 'Pricing' },
  { href: '/help', label: 'Help' },
]

export function Nav({
  hasAvatar,
  onDownload,
  onSignIn,
  onContact,
  onAccount,
}: {
  hasAvatar?: boolean
  onDownload: () => void
  onSignIn: () => void
  onContact: () => void
  onAccount: () => void
}) {
  const [open, setOpen] = useState(false)
  const [avatarBust, setAvatarBust] = useState(0)
  const [photoFailed, setPhotoFailed] = useState(false)
  const path = usePath()
  const { data: session } = useSession()
  const logoHref = path === '/' ? '#top' : '/'
  const navHref = (href: string) => (href.startsWith('#') && path !== '/' ? `/${href}` : href)
  const firstName = (session?.user.name || session?.user.email || 'S').split(' ')[0]
  const initial = firstName.slice(0, 1).toUpperCase()
  const showPhoto = Boolean(session?.user) && (hasAvatar || avatarBust > 0) && !photoFailed

  useEffect(() => {
    function onAvatar(event: Event) {
      const at = (event as CustomEvent<number>).detail
      setAvatarBust(typeof at === 'number' ? at : Date.now())
      setPhotoFailed(false)
    }
    window.addEventListener('soumtok-avatar', onAvatar)
    return () => window.removeEventListener('soumtok-avatar', onAvatar)
  }, [])

  useEffect(() => {
    setPhotoFailed(false)
  }, [hasAvatar, session?.user.id])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0b0b0a]">
      <div className="page-wrap flex h-14 min-w-0 items-center justify-between gap-3 sm:h-[64px]">
        <Logo href={logoHref} />

        <nav className="hidden items-center gap-7 lg:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={navHref(link.href)}
              {...(link.href.startsWith('/docs') || link.href.startsWith('/help')
                ? { target: '_blank', rel: 'noreferrer' }
                : {})}
              className="text-[13.5px] text-white/70 no-underline transition hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          {session?.user ? (
            <button
              type="button"
              onClick={onAccount}
              className="flex items-center gap-2 text-[13.5px] text-white/85 hover:text-white"
            >
              {showPhoto ? (
                <img
                  src={avatarUrl(avatarBust)}
                  alt=""
                  className="h-7 w-7 rounded-full object-cover"
                  onError={() => setPhotoFailed(true)}
                />
              ) : (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-[11px]">{initial}</span>
              )}
              {firstName}
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="text-[13.5px] text-white/75 hover:text-white"
            >
              Sign in
            </button>
          )}
          <button
            type="button"
            onClick={onContact}
            className="text-[13.5px] text-white/75 hover:text-white"
          >
            Contact
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="rounded-full border border-white/25 px-4 py-1.5 text-[13.5px] text-white transition hover:bg-white/5"
          >
            Download
          </button>
        </div>

        <button
          type="button"
          className="grid h-10 w-10 place-items-center text-white/80 lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            {open ? (
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.6" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.6" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div className="border-t border-white/5 bg-[#0b0b0a] px-5 py-4 lg:hidden">
          <div className="flex flex-col gap-3">
            {links.map((link) => (
              <a
                key={link.href}
                href={navHref(link.href)}
                onClick={() => setOpen(false)}
                {...(link.href.startsWith('/docs') || link.href.startsWith('/help')
                ? { target: '_blank', rel: 'noreferrer' }
                : {})}
                className="py-1 text-sm text-white/80 no-underline"
              >
                {link.label}
              </a>
            ))}
            <button
              type="button"
              onClick={session?.user ? onAccount : onSignIn}
              className="py-1 text-left text-sm text-white/80"
            >
              {session?.user ? (
                <span className="flex items-center gap-2">
                  {showPhoto ? (
                    <img
                      src={avatarUrl(avatarBust)}
                      alt=""
                      className="h-7 w-7 rounded-full object-cover"
                      onError={() => setPhotoFailed(true)}
                    />
                  ) : (
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-[11px]">
                      {initial}
                    </span>
                  )}
                  {session.user.name}
                </span>
              ) : (
                'Sign in'
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onContact()
              }}
              className="py-1 text-left text-sm text-white/80"
            >
              Contact
            </button>
            <PillButton onClick={onDownload}>Download</PillButton>
          </div>
        </div>
      )}
    </header>
  )
}
