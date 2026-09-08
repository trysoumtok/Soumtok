import { AccentLink, BrandMark } from './ui'

const models = [
  'DeepSeek V4 Flash',
  'Claude Opus 5',
  'Grok 4.5',
  'Gemini 3.8 Flash',
  'Claude Sonnet 5',
]

export function Frontier() {
  return (
    <section id="models" className="py-16">
      <div className="page-wrap">
        <h2 className="text-[26px] font-semibold tracking-[-0.03em] sm:text-[32px] md:text-[40px]">
          What you actually get
        </h2>
        <div className="mt-10 grid gap-10 lg:grid-cols-3">
          <article>
            <h3 className="text-[20px] font-semibold">Frontier models in one picker</h3>
            <p className="mt-3 text-[14px] leading-6 text-white/50">
              DeepSeek, Gemini, Claude, Grok, and GPT. Hover a model in Studio for strength and
              context. Bring your own keys when you want.
            </p>
            <div className="mt-4">
              <AccentLink href="/docs/models">Explore models ↗</AccentLink>
            </div>
            <div className="mt-6 rounded-xl border border-white/8 bg-[#141413] p-3">
              <p className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-[12px] text-white/35">
                <BrandMark className="h-4 w-auto" />
                Ask Soumtok to plan or build anything.
              </p>
              <div className="mt-2 space-y-1">
                {models.map((model, i) => (
                  <p
                    key={model}
                    className={`rounded-md px-3 py-1.5 text-[12.5px] ${
                      i === 1 ? 'bg-white/8 text-white' : 'text-white/50'
                    }`}
                  >
                    {i === 1 ? '✓ ' : ''}
                    {model}
                  </p>
                ))}
              </div>
            </div>
          </article>

          <article>
            <h3 className="text-[20px] font-semibold">GitHub stays the repo</h3>
            <p className="mt-3 text-[14px] leading-6 text-white/50">
              Grant projects on Codebase, attach one to a chat, and let Studio open branches and
              pull requests there. We do not host your git.
            </p>
            <div className="mt-4">
              <AccentLink href="/docs/github">Connect GitHub ↗</AccentLink>
            </div>
            <div className="mt-6 space-y-2">
              {[
                ['soumtok/web', 'Attached'],
                ['soumtok/api', 'Granted'],
                ['payments-ke', 'Granted'],
              ].map(([name, state]) => (
                <div key={name} className="rounded-xl border border-white/8 bg-[#141413] px-4 py-3">
                  <p className="text-[13px] text-white/85">{name}</p>
                  <p className="mt-1 text-[11px] text-emerald-400/80">{state}</p>
                </div>
              ))}
            </div>
          </article>

          <article id="pay">
            <h3 className="text-[20px] font-semibold">Pay the way you already pay</h3>
            <p className="mt-3 text-[14px] leading-6 text-white/50">
              Trial is free. Pro starts at $13.99. Checkout in Kenyan shillings on M-Pesa, or USD
              on PayPal and card. Receipts download as PDF.
            </p>
            <div className="mt-4">
              <AccentLink href="#pricing">See pricing →</AccentLink>
            </div>
            <div className="mt-6 rounded-xl border border-white/8 bg-[#141413] p-4">
              <p className="text-[12px] text-white/40">This cycle</p>
              <p className="mt-2 text-[22px] font-semibold">0% used</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-0 bg-[#f54e00]" />
              </div>
              <p className="mt-3 text-[12px] text-white/45">Starts when you pay. Resets on your date.</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
