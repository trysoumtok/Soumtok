import { AccentLink, BrandMark, TrafficLights } from './ui'

export function Automations() {
  return (
    <section className="py-16">
      <div className="wide-wrap grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
        <div
          className="relative min-h-0 overflow-hidden rounded-2xl bg-cover bg-center p-4 sm:min-h-[420px] sm:rounded-[24px] sm:p-6 md:p-10"
          style={{ backgroundImage: "url('/images/landscape-hero.png')" }}
        >
          <div className="window mx-auto max-w-[460px]">
            <div className="flex h-9 items-center gap-3 border-b border-white/5 px-3">
              <TrafficLights />
              <BrandMark className="h-4 w-auto" />
              <span className="flex-1 text-center text-[12px] text-white/45">Soumtok</span>
            </div>
            <div className="p-5">
              <h3 className="text-[22px] font-semibold">Fix CI failures on main</h3>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-white/50">
                <span className="rounded-full border border-white/10 px-2 py-0.5">Inactive</span>
                <span className="rounded-full border border-white/10 px-2 py-0.5">site ▾</span>
                <span className="rounded-full border border-white/10 px-2 py-0.5">main ▾</span>
              </div>
              <p className="mt-5 text-[11px] tracking-[0.12em] text-white/35">TRIGGERS</p>
              <div className="mt-2 space-y-2 text-[12.5px] text-white/70">
                <p>Every hour</p>
                <p>New message in #bug-reports in soumtok-website on main</p>
              </div>
              <button type="button" className="mt-3 text-[12px] text-white/45">
                + Add trigger
              </button>
              <p className="mt-5 text-[11px] tracking-[0.12em] text-white/35">AGENT INSTRUCTIONS</p>
              <p className="mt-2 text-[12.5px] leading-5 text-white/65">
                Your task is to fix CI failures on main. Avoid racing other agents. Root cause by
                checking logs. Report with /apply report format.
              </p>
              <p className="mt-5 text-[11px] text-white/40">Grok 4.0 ▾</p>
            </div>
          </div>
        </div>

        <div className="max-w-[420px]">
          <h2 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.03em] sm:text-[36px] md:text-[44px]">
            Automations that stay in Studio
          </h2>
          <p className="mt-5 text-[16px] leading-7 text-white/55">
            Schedule an hourly pass or fire a webhook. Point it at a GitHub repo, write the
            instructions, pick the model. History lives next to the chat.
          </p>
          <div className="mt-6">
            <AccentLink href="/docs/automations">Learn about Automations →</AccentLink>
          </div>
        </div>
      </div>
    </section>
  )
}
