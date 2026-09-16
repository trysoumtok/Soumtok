import { useMemo, useState } from 'react'
import { DOCS_PAGES, docsSearchText } from '../docs/catalog'
import { navigate, openTab } from '../lib/nav'
import { SearchIcon } from './dashboard/icons'
import { SiteHeader } from './SiteHeader'

const TOPICS = [
  {
    id: 'quick-start',
    title: 'Getting started',
    body: 'Create an account, finish onboarding, and open your first Studio chat.',
  },
  {
    id: 'studio',
    title: 'Studio and AI features',
    body: 'Write and review code with Studio, models, and attached repos.',
  },
  {
    id: 'models',
    title: 'Models and usage',
    body: 'Choose models, read usage, and understand included tokens.',
  },
  {
    id: 'codebase',
    title: 'Codebase and GitHub',
    body: 'Grant repos, attach a project, and keep GitHub as the source of truth.',
  },
  {
    id: 'plugins',
    title: 'Customization',
    body: 'Add plugins, skills, MCP tools, and connectors the agent can use.',
  },
  {
    id: 'settings',
    title: 'Security and privacy',
    body: 'How Soumtok handles sessions, verification, and your account.',
  },
  {
    id: 'billing',
    title: 'Account and billing',
    body: 'Plans, PayPal, Mobile Money, invoices, and team seats.',
  },
  {
    id: 'github',
    title: 'Integrations',
    body: 'Connect GitHub for cloud work and codebase context.',
  },
] as const

export function HelpPage() {
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return DOCS_PAGES.filter((page) => docsSearchText(page).includes(q)).slice(0, 8)
  }, [query])

  return (
    <div className="theme-app keep-dark min-h-svh bg-[#0b0b0a] text-white">
      <SiteHeader active="help" />
      <main className="mx-auto w-full max-w-[720px] px-5 pb-24 pt-16 md:pt-20">
        <h1 className="text-center text-[32px] font-medium tracking-[-0.045em] sm:text-[40px] md:text-[48px]">How can we help?</h1>
        <div className="relative mt-8">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35">
            <SearchIcon />
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Soumtok docs…"
            className="w-full rounded-xl border border-white/10 bg-[#141413] py-3.5 pl-11 pr-4 text-[15px] outline-none placeholder:text-white/30 focus:border-white/22"
          />
        </div>
        {hits.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-[#141413]">
            {hits.map((page) => (
              <button
                key={page.id}
                type="button"
                onClick={() => openTab(page.id === 'overview' ? '/docs' : `/docs/${page.id}`)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-white/[0.04]"
              >
                <span>
                  <span className="block text-[14px]">{page.title}</span>
                  <span className="mt-0.5 block text-[12px] text-white/40">{page.crumb}</span>
                </span>
                <span className="text-white/25">↗</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <HelpCard title="Docs" body="Guides for Studio, billing, and keys." onClick={() => openTab('/docs')} />
          <HelpCard title="Changelog" body="See what shipped in Soumtok." onClick={() => navigate('/#resources')} />
          <HelpCard title="Contact us" body="Write us. It lands in our inbox." onClick={() => openTab('/contact')} />
        </div>

        <h2 className="mt-14 text-[13px] text-white/40">Browse by topic</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.08] bg-[#141413]">
          {TOPICS.map((topic) => {
            const open = openId === topic.id
            return (
              <div key={topic.id} className="border-t border-white/[0.06] first:border-t-0">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : topic.id)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span>
                    <span className="block text-[15px]">{topic.title}</span>
                    <span className="mt-1 block text-[13px] text-white/40">{topic.body}</span>
                  </span>
                  <span className={`text-white/30 transition ${open ? 'rotate-180' : ''}`}>▾</span>
                </button>
                {open && (
                  <div className="px-5 pb-4">
                    <button
                      type="button"
                      onClick={() => openTab(topic.id === 'overview' ? '/docs' : `/docs/${topic.id}`)}
                      className="text-[13px] text-[#f54e00] hover:underline"
                    >
                      Open this guide →
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}

function HelpCard({ title, body, onClick }: { title: string; body: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-white/[0.08] bg-[#141413] p-4 text-left hover:border-white/16"
    >
      <p className="text-[14px] font-medium">{title}</p>
      <p className="mt-1 text-[12px] leading-5 text-white/40">{body}</p>
    </button>
  )
}
