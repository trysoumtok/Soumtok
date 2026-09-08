import { useState } from 'react'
import { BrandMark, TrafficLights } from './ui'

export function EveryTool() {
  const [os, setOs] = useState<'win' | 'linux'>('win')
  const command =
    os === 'win'
      ? "irm 'https://soumtok.com/install?win32-x64' | iex"
      : 'curl -fsSL https://soumtok.com/install | bash'

  return (
    <section className="py-16">
      <div className="wide-wrap grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <h2 className="text-[36px] font-semibold leading-[1.15] tracking-[-0.03em] md:text-[44px]">
            In every tool, at every step
          </h2>
          <p className="mt-5 max-w-[420px] text-[16px] leading-7 text-white/55">
            Soumtok runs in your terminal, collaborates in Slack, and reviews PRs in GitHub.
          </p>
          <div className="mt-7 flex gap-5 text-[13px]">
            <button
              type="button"
              onClick={() => setOs('win')}
              className={os === 'win' ? 'text-white' : 'text-white/35'}
            >
              PowerShell
            </button>
            <button
              type="button"
              onClick={() => setOs('linux')}
              className={os === 'linux' ? 'text-white' : 'text-white/35'}
            >
              Linux / WSL
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl border border-white/8 bg-[#161615] px-4 py-3 font-mono text-[13px] text-white/80">
            <span className="truncate">{command}</span>
            <button
              type="button"
              className="ml-3 text-white/50 hover:text-white"
              onClick={() => navigator.clipboard.writeText(command)}
              aria-label="Copy install command"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" />
                <path d="M3 10V3.8A.8.8 0 0 1 3.8 3H10" stroke="currentColor" />
              </svg>
            </button>
          </div>
        </div>

        <div
          className="relative min-h-[420px] overflow-hidden rounded-[24px] bg-cover bg-center p-6"
          style={{ backgroundImage: "url('/images/landscape-warm.png')" }}
        >
          <div className="window relative z-[2] max-w-[420px]">
            <div className="flex h-8 items-center gap-3 border-b border-white/5 px-3">
              <TrafficLights />
              <span className="flex-1 text-center text-[11px] text-white/45">Slack</span>
            </div>
            <div className="space-y-3 p-4 text-[12.5px]">
              <p className="text-white/40">#feature-realtime-sync · 8 members</p>
              <p>
                <span className="font-medium">swhitmore</span>{' '}
                <span className="text-white/60">
                  i wanna be able to go to soumtok.com/changelog to see the 1.0 notes
                </span>
              </p>
              <p>
                <span className="font-medium">eric</span>{' '}
                <span className="text-white/60">checks out</span>
              </p>
              <p>
                <span className="font-medium">Soumtok APP</span>{' '}
                <span className="text-white/60">
                  I added directions to the changelog. Here&apos;s a link to the PR.
                </span>
              </p>
              <button type="button" className="rounded-md bg-[#22c55e] px-3 py-1 text-[12px] text-black">
                View PR
              </button>
            </div>
          </div>

          <div className="window relative z-[3] mt-[-28px] ml-auto max-w-[440px]">
            <div className="flex h-8 items-center gap-3 border-b border-white/5 px-3">
              <TrafficLights />
              <BrandMark className="h-3.5 w-auto" />
              <span className="flex-1 text-center text-[11px] text-white/45">soumtok-agent</span>
            </div>
            <div className="space-y-1.5 p-4 text-[12px] text-white/65">
              <p className="text-white/35">Planned 2s · Read 2 files, 1 directory 1s</p>
              <p className="font-medium text-white/80">What data should the mission control display?</p>
              <p>[x] Real-time metrics</p>
              <p>[ ] System status</p>
              <p className="text-white/35">Analyzed scope 2s · Started 3 agents · Health · Planning</p>
              <div className="mt-3 flex items-center justify-between rounded-md border border-white/8 px-2 py-1.5 text-[11px] text-white/35">
                <span>Add a follow-up</span>
                <span>esc to stop</span>
              </div>
              <p className="pt-1 font-mono text-[10px] text-white/30">
                Plan · GPT-5.6 · 8% · 2 files edited
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
