import { Footer } from './Footer'
import { SiteHeader } from './SiteHeader'
import { navigate } from '../lib/nav'

export type LegalSection = {
  id: string
  title: string
  paragraphs: string[]
  bullets?: string[]
}

export function LegalPage({
  title,
  updated,
  intro,
  sections,
  sibling,
}: {
  title: string
  updated: string
  intro: string
  sections: LegalSection[]
  sibling: { label: string; href: string }
}) {
  return (
    <div className="theme-app keep-dark min-h-svh bg-[#0b0b0a] text-white">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[760px] px-5 pb-20 pt-16 md:px-10 md:pt-24">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/35">Legal</p>
        <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.04em] sm:text-[40px]">{title}</h1>
        <p className="mt-3 text-[14px] text-white/40">Last updated {updated}</p>
        <p className="mt-6 text-[16px] leading-7 text-white/55">{intro}</p>

        <div className="mt-10 space-y-10">
          {sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2 className="text-[20px] font-medium tracking-[-0.02em] text-white">{section.title}</h2>
              <div className="mt-3 space-y-3 text-[15px] leading-7 text-white/55">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              {section.bullets?.length ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-7 text-white/55">
                  {section.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-white/[0.08] pt-8 text-[14px]">
          <button
            type="button"
            onClick={() => navigate(sibling.href)}
            className="text-[#e07a5f] hover:text-[#f0927a]"
          >
            {sibling.label} →
          </button>
          <a href="mailto:support@soumtok.com" className="text-white/45 hover:text-white/70">
            support@soumtok.com
          </a>
        </div>
      </main>
      <Footer />
    </div>
  )
}
