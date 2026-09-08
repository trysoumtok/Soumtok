import { AccentLink } from './ui'

const updates = [
  { date: 'Sep 8, 2026', title: 'M-Pesa checkout and PDF receipts' },
  { date: 'Sep 7, 2026', title: 'Studio skills search, last used, and MCP browse' },
  { date: 'Sep 6, 2026', title: 'Usage resets on your plan date, not month-end' },
  { date: 'Sep 2, 2026', title: 'GitHub attach, plugins, and model hover cards' },
]

export function ChangelogAbout() {
  return (
    <section id="resources" className="py-16">
      <div className="page-wrap">
        <h2 className="text-[22px] font-semibold">What just shipped</h2>
        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {updates.map((item) => (
            <article key={item.title} className="rounded-xl bg-[#141413] px-4 py-5">
              <p className="text-[13px] text-[#f54e00]">{item.date}</p>
              <p className="mt-3 text-[15px] leading-6">{item.title}</p>
            </article>
          ))}
        </div>
        <div className="mt-6">
          <AccentLink href="/docs">Read the docs →</AccentLink>
        </div>

        <div className="mt-24 grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="max-w-[460px] text-[28px] font-medium leading-[1.3] tracking-[-0.02em] md:text-[32px]">
              Soumtok is built from Nairobi for the people writing software on this continent.
            </p>
            <p className="mt-4 max-w-[420px] text-[15px] leading-7 text-white/50">
              Joseph started it so a coding agent could take M-Pesa, speak GitHub, and stay out of
              the way until you need it.
            </p>
            <div className="mt-6">
              <AccentLink href="/contact">Write the desk →</AccentLink>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-xl">
            <div
              className="h-[280px] bg-cover bg-center md:h-[340px]"
              style={{ backgroundImage: "url('/images/team-office.png')" }}
            />
            <p className="absolute bottom-4 left-4 text-[13px] text-white/80">Joseph · Founder, Nairobi</p>
          </div>
        </div>
      </div>
    </section>
  )
}

export function Highlights() {
  return null
}
