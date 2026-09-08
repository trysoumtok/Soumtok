import { usePath } from '../lib/nav'
import { AccentLink, BrandMark } from './ui'

const week = ['Acme Research Dashboard', 'Live Telemetry Pipeline', 'Zero-Downtime Deploys']
const month = ['Binary Protocol Parser', 'Edge Cache Invalidation', 'Auth Token Rotation']

export function CloudAgents() {
  const path = usePath()
  return (
    <section className="py-16">
      <div className="wide-wrap grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[24px] bg-[#161614] p-3 md:p-5">
          <div className="window">
            <div className="flex h-9 items-center gap-3 border-b border-white/5 px-3">
              <div className="traffic" aria-hidden>
                <i />
                <i />
                <i />
              </div>
              <span className="text-[11px] text-white/30">←</span>
              <span className="rounded-md bg-white/5 px-3 py-1 font-mono text-[11px] text-white/45">
                soumtok.com/agent
              </span>
            </div>
            <div className="grid min-h-0 grid-cols-1 md:min-h-[420px] md:grid-cols-[200px_1fr]">
              <aside className="hidden border-r border-white/5 p-3 md:block">
                <div className="mb-4 grid h-8 w-8 place-items-center">
                  <BrandMark className="h-7 w-auto" />
                </div>
                <p className="mb-2 text-[10px] tracking-[0.12em] text-white/35">THIS WEEK</p>
                {week.map((item, i) => (
                  <p
                    key={item}
                    className={`mb-1 rounded-md px-2 py-1.5 text-[11.5px] ${
                      i === 0 ? 'bg-white/8 text-white' : 'text-white/50'
                    }`}
                  >
                    {item}
                  </p>
                ))}
                <p className="mb-2 mt-4 text-[10px] tracking-[0.12em] text-white/35">THIS MONTH</p>
                {month.map((item) => (
                  <p key={item} className="mb-1 px-2 py-1.5 text-[11.5px] text-white/50">
                    {item}
                  </p>
                ))}
              </aside>
              <div className="p-5">
                <h3 className="text-[20px] font-semibold">Acme Research Dashboard</h3>
                <p className="mt-4 rounded-lg bg-white/5 px-3 py-2 text-[12.5px] text-white/65">
                  let&apos;s build a dashboard to make our research findings interactive
                </p>
                <p className="mt-3 text-[13px] leading-6 text-white/70">
                  On it. I&apos;ll build the dashboard using your theme config, wire up the research
                  data, and add interactive charts with public access controls.
                </p>
                <p className="mt-3 text-[11px] text-white/35">Worked for 14m 22s · Processed screen recording</p>
                <p className="mt-3 text-[13px] text-white/80">Done! Here&apos;s a walkthrough of the dashboard.</p>
                <div
                  className="relative mt-3 h-32 overflow-hidden rounded-lg bg-cover bg-center"
                  style={{ backgroundImage: "url('/images/dashboard-preview.png')" }}
                >
                  <div className="absolute inset-0 grid place-items-center bg-black/25">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-white/90 text-black">
                      ▶
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-[12px] leading-5 text-white/45">
                  Built the interactive dashboard with realtime charts, data from Snowflake, and
                  shadcn components. Deployed to staging via Vercel.
                </p>
                <div className="mt-5 rounded-lg border border-white/8 px-3 py-2 text-[12px] text-white/30">
                  Add a follow up...
                  <div className="mt-2 text-[11px] text-white/40">Agent · Opus S</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-[420px] lg:pl-4">
          <h2 className="text-[36px] font-semibold leading-[1.15] tracking-[-0.03em] md:text-[44px]">
            Works autonomously, runs in parallel
          </h2>
          <p className="mt-5 text-[16px] leading-7 text-white/55">
            Agents use their own computers to build, test, and demo features end to end for you to
            review.
          </p>
          {path !== '/agents' ? (
            <div className="mt-6">
              <AccentLink href="/agents">Learn about cloud agents →</AccentLink>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
