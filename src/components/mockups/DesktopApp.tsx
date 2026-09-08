import { BrandMark, TrafficLights } from '../ui'

const reviews = [
  { title: 'Build Landing Page', meta: 'Done · now', plus: '+52', minus: '-0', done: true },
  { title: 'Plan Mission Control', meta: '10m', plus: '+68', minus: '-4' },
  { title: 'Payments for Lagos ops', meta: '18m', plus: '+41', minus: '-6' },
  { title: 'Set up Soumtok Rules', meta: '30m', plus: '+12', minus: '-1' },
  { title: 'Mobile money checkout', meta: '1h', plus: '+20', minus: '-3' },
]

export function DesktopApp() {
  return (
    <div className="relative mx-auto w-full max-w-[1080px]">
      <div className="window relative z-[2] overflow-hidden">
        <div className="flex h-10 items-center gap-3 border-b border-white/5 px-3">
          <TrafficLights />
          <BrandMark className="h-4 w-auto shrink-0" />
          <span className="min-w-0 flex-1 truncate text-center text-[12px] text-white/45">Soumtok Studio</span>
        </div>

        <div className="grid min-h-0 grid-cols-1 md:min-h-[520px] md:grid-cols-[220px_minmax(0,1fr)_minmax(0,1.05fr)]">
          <aside className="hidden border-r border-white/5 p-3 md:block">
            <p className="mb-3 px-1 text-[10px] font-semibold tracking-[0.14em] text-white/35">
              READY FOR REVIEW
            </p>
            <div className="space-y-1">
              {reviews.map((item) => (
                <div
                  key={item.title}
                  className={`rounded-lg px-2.5 py-2 ${item.done ? 'bg-white/5' : 'hover:bg-white/[0.03]'}`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 grid h-4 w-4 place-items-center rounded-full border ${
                        item.done
                          ? 'border-emerald-400/70 text-emerald-400'
                          : 'border-white/20 text-transparent'
                      }`}
                    >
                      {item.done ? '✓' : ''}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] text-white/90">{item.title}</p>
                      <p className="mt-0.5 text-[11px] text-white/35">
                        {item.meta}{' '}
                        <span className="text-emerald-400/80">{item.plus}</span>{' '}
                        <span className="text-rose-400/70">{item.minus}</span>
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <section className="min-w-0 border-white/5 p-4 md:border-r">
            <p className="mb-3 text-[13px] font-medium text-white/85">Build Landing Page</p>
            <div className="rounded-xl border border-white/8 bg-[#111110] px-3 py-2.5 text-[12.5px] text-white/70">
              make a landing page based on attached docs explaining what we do
            </div>
            <div className="mt-3 space-y-1.5 text-[11.5px] text-white/35">
              <p>Read about-soumtok.md</p>
              <p>Read brand-guidelines.pdf</p>
              <p>Thought 6s</p>
            </div>
            <p className="mt-4 text-[13px] leading-6 text-white/80">
              I&apos;ll create a minimal, serif-based landing page that matches your brand voice.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[11px] text-white/70">
                app/page.tsx <span className="text-emerald-400">+52</span> <span className="text-white/30">-0</span>
              </span>
              <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[11px] text-white/70">
                app/globals.css <span className="text-emerald-400">+18</span> <span className="text-white/30">-0</span>
              </span>
            </div>
            <p className="mt-4 text-[12px] leading-5 text-white/45">
              Done. Fonts preload in the head, critical CSS is inlined. 280ms first paint.
            </p>
            <div className="mt-8 rounded-xl border border-white/8 bg-[#10100f] px-3 py-2.5">
              <p className="text-[12px] text-white/30">Plan, search, build anything...</p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-white/40">
                <span>Agent · Grok 4.6</span>
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10">↑</span>
              </div>
            </div>
          </section>

          <section className="hidden bg-[#0e0e0d] p-0 md:block">
            <div className="flex h-9 items-center gap-2 border-b border-white/5 px-3 text-[11px] text-white/40">
              <span>←</span>
              <span className="rounded-md bg-white/5 px-3 py-1 font-mono">http://localhost:3000</span>
            </div>
            <div className="px-8 py-8">
              <div className="mb-7">
                <img
                  src="/images/soumtok-lockup.png"
                  alt="Soumtok"
                  className="brand-logo h-8 w-auto"
                />
              </div>
              <p className="max-w-[340px] font-serif text-[22px] leading-[1.35] text-white/90">
                Software creation is changing. We are a group of researchers, engineers, and
                technologists inventing at the edge of what is useful and possible.
              </p>
              <button
                type="button"
                className="mt-6 rounded-md bg-white/10 px-3 py-1.5 text-[12px] text-white/80"
              >
                See projects →
              </button>
              <div className="mt-10 space-y-2 text-[12px] text-white/45">
                {[
                  ['2026', 'Payments'],
                  ['2026', 'Semantic'],
                  ['2025', 'Mobile money'],
                  ['2025', 'Logistics'],
                  ['2024', 'Climate'],
                ].map(([year, name]) => (
                  <div key={name} className="flex gap-6">
                    <span className="w-10">{year}</span>
                    <span>{name}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="window absolute -bottom-10 right-6 z-[3] hidden w-[340px] shadow-2xl md:block">
        <div className="flex h-8 items-center gap-3 border-b border-white/5 px-3">
          <TrafficLights />
          <BrandMark className="h-3.5 w-auto" />
          <span className="text-[11px] text-white/45">Soumtok CLI</span>
        </div>
        <div className="space-y-1.5 p-3 font-mono text-[11px] leading-5 text-white/65">
          <p>1. Routing layer for Lagos → Accra payouts</p>
          <p>2. Reverse FX quote cache with 12s TTL</p>
          <p>3. ORF-style matcher that searches settlement IDs</p>
          <p className="text-white/40">Want me to create a quick test to verify everything works?</p>
          <div className="pt-2 text-[10px] text-white/35">Add a follow-up · Grok 4.6</div>
        </div>
      </div>
    </div>
  )
}
