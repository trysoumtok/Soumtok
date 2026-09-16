import { useSession } from '../lib/auth-client'
import { navigate } from '../lib/nav'
import { Logo, PillButton } from './ui'

const columns = [
  {
    title: 'Product',
    links: [
      { label: 'Studio', href: '/#product' },
      { label: 'Models', href: '/#models' },
      { label: 'Pricing', href: '/#pricing' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Docs', href: '/docs' },
      { label: 'Download', href: '/download' },
      { label: 'Help', href: '/help' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Sign in', href: '/login' },
      { label: 'Open Studio', href: '/signup' },
      { label: 'Billing', href: '/dashboard/billing' },
    ],
  },
]

export function TryNow({ onStart }: { onStart: () => void }) {
  const { data: session } = useSession()
  return (
    <section className="px-5 py-16 text-center sm:py-24">
      <h2 className="text-[32px] font-semibold tracking-[-0.04em] sm:text-[40px] md:text-[48px]">
        Open the desk.
      </h2>
      <p className="mx-auto mt-4 max-w-[420px] text-[16px] text-white/50">
        Studio is in the browser today. Download the desktop app for Windows, macOS, or Linux.
      </p>
      <div className="mt-7">
        <PillButton onClick={() => (session?.user ? onStart() : navigate('/signup'))}>
          Open Studio
        </PillButton>
      </div>
    </section>
  )
}

export function Footer() {
  const { data: session } = useSession()

  function hrefFor(href: string) {
    if (href === '/signup' && session?.user) return '/dashboard'
    if (href === '/login' && session?.user) return '/dashboard'
    return href
  }

  return (
    <footer className="border-t border-white/5 pb-10 pt-6">
      <div className="page-wrap">
        <div className="grid grid-cols-2 gap-8 py-10 sm:grid-cols-3">
          {columns.map((col) => (
            <div key={col.title}>
              <p className="mb-3 text-[13px] text-white/55">{col.title}</p>
              <div className="flex flex-col gap-2">
                {col.links.map((link) => {
                  const href = hrefFor(link.href)
                  const tab = href.startsWith('/docs') || href.startsWith('/help') || href.startsWith('/contact')
                  return (
                    <a
                      key={link.label}
                      href={href}
                      {...(tab ? { target: '_blank', rel: 'noreferrer' } : {})}
                      className="text-[13px] text-white/40 no-underline hover:text-white/70"
                      onClick={(event) => {
                        if (tab || href.startsWith('/#')) return
                        event.preventDefault()
                        navigate(href)
                      }}
                    >
                      {link.label}
                    </a>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-4 border-t border-white/5 pt-6 text-[12px] text-white/35 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-4">
            <Logo href="/" size="sm" />
            <p>© 2026 Soumtok · Nairobi</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="https://github.com/Soumtok"
              target="_blank"
              rel="noreferrer"
              className="text-white/40 no-underline hover:text-white/70"
            >
              GitHub
            </a>
            <a href="mailto:support@soumtok.com" className="text-white/40 no-underline hover:text-white/70">
              support@soumtok.com
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
