import { useEffect, useMemo, useState } from 'react'
import { useSession } from '../../lib/auth-client'
import { navigate } from '../../lib/nav'
import { DOCS_NAV, DOCS_PAGES, docsPage, docsPath, docsSearchText } from '../../docs/catalog'
import { SearchIcon } from '../dashboard/icons'

export function DocsPage({ path }: { path: string }) {
  const id = docsPath(path)
  const page = docsPage(id)
  const { data: session } = useSession()
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return DOCS_PAGES
    return DOCS_PAGES.filter((item) => docsSearchText(item).includes(q))
  }, [query])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
      if (event.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function go(next: string) {
    navigate(next === 'overview' ? '/docs' : `/docs/${next}`)
    setNavOpen(false)
    setSearchOpen(false)
    window.scrollTo(0, 0)
  }

  return (
    <div className="theme-app keep-dark min-h-svh bg-[#0b0b0a] text-white">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0b0b0a]/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-4 px-4 md:px-6">
          <button type="button" className="shrink-0" onClick={() => navigate('/')} aria-label="Soumtok">
            <img src="/images/soumtok-lockup.png" alt="Soumtok" className="brand-logo h-5 w-auto" />
          </button>
          <nav className="hidden items-center gap-5 text-[13px] md:flex">
            <span className="border-b-2 border-[#f54e00] pb-3 pt-3 text-[#f54e00]">Docs</span>
            <button type="button" className="text-white/55 hover:text-white" onClick={() => go('api')}>
              API
            </button>
            <button type="button" className="text-white/55 hover:text-white" onClick={() => go('quick-start')}>
              Learn
            </button>
            <button type="button" className="text-white/55 hover:text-white" onClick={() => window.open('/help', '_blank', 'noopener,noreferrer')}>
              Help
            </button>
          </nav>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="ml-auto hidden h-8 min-w-[220px] items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-left text-[13px] text-white/40 lg:flex"
          >
            <SearchIcon />
            Search docs...
            <span className="ml-auto rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/30">⌘K</span>
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-white/60 lg:hidden"
            aria-label="Search docs"
          >
            <SearchIcon />
          </button>
          <button type="button" className="text-[13px] text-white/60 lg:hidden" onClick={() => setNavOpen((o) => !o)}>
            Menu
          </button>
          <button
            type="button"
            onClick={() => navigate(session?.user ? '/dashboard' : '/login')}
            className="rounded-full border border-white/20 px-3 py-1 text-[13px] text-white/80 hover:bg-white/[0.05]"
          >
            {session?.user ? 'Dashboard' : 'Sign in'}
          </button>
        </div>
      </header>

      {navOpen && (
        <div className="thin-scroll max-h-[70vh] overflow-y-auto border-b border-white/[0.06] px-4 py-3 lg:hidden">
          {DOCS_NAV.flatMap((group) => group.items).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(item.id)}
              className={`block w-full py-1.5 text-left text-[13px] ${item.id === id ? 'text-[#f54e00]' : 'text-white/60'}`}
            >
              {item.title}
            </button>
          ))}
        </div>
      )}

      <div className="mx-auto grid max-w-[1280px] grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_200px]">
        <aside className="thin-scroll sticky top-14 hidden h-[calc(100svh-56px)] overflow-y-auto border-r border-white/[0.05] px-4 py-8 lg:block">
          {DOCS_NAV.map((group) => (
            <div key={group.title} className="mb-7">
              <p className="mb-2 px-2 text-[12px] text-white/40">{group.title}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => go(item.id)}
                    className={`block w-full rounded-md px-2 py-1 text-left text-[13px] ${
                      item.id === id ? 'text-[#f54e00]' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>

        <article className="min-w-0 px-4 py-8 sm:px-5 md:px-10 md:py-12">
          <p className="text-[13px] text-white/35">{page.crumb}</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.04em] sm:text-[40px]">{page.title}</h1>
          <div className="mt-8 max-w-[720px] min-w-0 space-y-6">
            {page.blocks.map((block, index) => (
              <div key={`${block.type}-${index}`} id={block.id}>
                {block.title && (
                  <h2 className="mb-3 text-[22px] font-medium tracking-[-0.03em]">{block.title}</h2>
                )}
                {block.type === 'p' && <p className="text-[15px] leading-7 text-white/60">{block.text}</p>}
                {block.type === 'callout' && (
                  <div className="flex gap-3 rounded-xl border border-white/10 bg-[#141413] px-4 py-3 text-[14px] leading-6 text-white/65">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-white/20 text-[11px] text-white/50">
                      i
                    </span>
                    {block.text}
                  </div>
                )}
                {block.type === 'ul' && (
                  <ul className="list-disc space-y-2 pl-5 text-[15px] leading-7 text-white/60">
                    {block.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                {block.type === 'steps' && (
                  <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-7 text-white/60">
                    {block.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                )}
                {block.type === 'image' && (
                  <img src={block.src} alt={block.alt} className="w-full rounded-xl border border-white/10" />
                )}
              </div>
            ))}
          </div>
        </article>

        <aside className="sticky top-14 hidden h-[calc(100svh-56px)] overflow-y-auto px-4 py-10 xl:block">
          <p className="text-[13px] font-medium">What you can do</p>
          <div className="mt-3 space-y-2">
            {page.toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="block text-[13px] text-white/40 no-underline hover:text-white/70"
              >
                {item.title}
              </a>
            ))}
          </div>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(window.location.href)}
            className="mt-6 text-[12px] text-white/35 hover:text-white/60"
          >
            Copy page
          </button>
        </aside>
      </div>

      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 px-4 pt-[14vh]" onClick={() => setSearchOpen(false)}>
          <div
            className="mx-auto w-full max-w-[480px] overflow-hidden rounded-xl border border-white/12 bg-[#1a1a18]"
            onClick={(event) => event.stopPropagation()}
          >
            <label className="flex items-center gap-2 px-3 py-3">
              <span className="text-white/40">
                <SearchIcon />
              </span>
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search docs..."
                className="w-full bg-transparent text-[14px] outline-none placeholder:text-white/40"
              />
            </label>
            <div className="thin-scroll max-h-[320px] overflow-y-auto border-t border-white/[0.06] py-1">
              {hits.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(item.id)}
                  className="block w-full px-4 py-2.5 text-left hover:bg-white/[0.05]"
                >
                  <span className="block text-[13px]">{item.title}</span>
                  <span className="block text-[12px] text-white/35">{item.crumb}</span>
                </button>
              ))}
              {hits.length === 0 && <p className="px-4 py-3 text-[13px] text-white/40">No docs match.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
