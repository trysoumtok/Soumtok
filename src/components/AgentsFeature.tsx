import { AccentLink, BrandMark, TrafficLights } from './ui'

export function AgentsFeature() {
  return (
    <section id="product" className="pb-10">
      <div className="wide-wrap overflow-hidden rounded-2xl bg-[#141413] px-4 py-8 sm:rounded-[28px] sm:px-6 sm:py-10 md:px-12 md:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.2fr]">
          <div className="max-w-[420px]">
            <h2 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.03em] sm:text-[36px] md:text-[44px]">
              Studio turns a prompt into a plan
            </h2>
            <p className="mt-5 text-[16px] leading-7 text-white/55">
              Ask in chat. Soumtok reads the repo, asks the sharp questions, and edits files you
              can review. Skills, MCP, and search sit next to the thread.
            </p>
            <div className="mt-6">
              <AccentLink href="/docs/studio">Learn Studio →</AccentLink>
            </div>
          </div>

          <div className="window">
            <div className="flex h-9 items-center gap-3 border-b border-white/5 px-3">
              <TrafficLights />
              <BrandMark className="h-4 w-auto" />
              <span className="flex-1 text-center text-[11px] text-white/40">Soumtok</span>
            </div>
            <div className="grid min-h-0 grid-cols-1 md:min-h-[390px] md:grid-cols-[1fr_1.05fr]">
              <div className="border-white/5 p-4 md:border-r">
                <p className="text-[13px] font-medium">Plan Mission Control</p>
                <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-[12px] leading-5 text-white/65">
                  let&apos;s build a mission control interface, similar to the expose-style window
                  manager on macOS.
                </p>
                <div className="mt-3 space-y-1 text-[11px] text-white/35">
                  <p>Thought 4s</p>
                  <p>Read AppManager.tsx</p>
                  <p>Searched expose patterns</p>
                </div>
                <span className="mt-3 inline-flex rounded-full border border-white/10 px-2 py-0.5 font-mono text-[11px] text-white/70">
                  feature-prd.md <span className="text-emerald-400">+68</span>
                </span>
                <p className="mt-3 text-[12px] leading-5 text-white/60">
                  Drafted implementation steps in feature-prd.md. A few quick questions before I
                  start building:
                </p>
                <div className="mt-3 rounded-xl border border-white/8 bg-[#10100f] p-3">
                  <p className="text-[11px] text-white/40">Questions</p>
                  <p className="mt-1 text-[12.5px]">How should Mission Control be triggered?</p>
                  <ol className="mt-2 space-y-1 text-[12px] text-white/60">
                    <li>1. Gesture (swipe up with 3 fingers)</li>
                    <li>2. Keyboard shortcut (F3 or Cmd+F3)</li>
                    <li>3. Both keyboard and button</li>
                  </ol>
                  <div className="mt-3 flex justify-end gap-2">
                    <button type="button" className="px-3 py-1 text-[12px] text-white/45">
                      Skip
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-[#f54e00] px-3 py-1 text-[12px] text-white"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              </div>

              <div className="hidden bg-[#10100f] p-5 md:block">
                <div className="mb-4 flex gap-4 text-[12px] text-white/40">
                  <span className="border-b border-white pb-1 text-white">feature-prd.md</span>
                  <span>presence.ts</span>
                </div>
                <h3 className="text-[22px] font-semibold">Mission Control Interface</h3>
                <p className="mt-3 text-[12.5px] leading-6 text-white/55">
                  <strong className="text-white/80">Trigger:</strong> Menu item in MenuBar.tsx plus
                  a keyboard shortcut that tiles open workspaces.
                </p>
                <p className="mt-2 text-[12.5px] leading-6 text-white/55">
                  <strong className="text-white/80">View Behavior:</strong> Overlay existing windows
                  into a grid so agents and previews stay visible.
                </p>
                <p className="mt-6 text-[12px] text-white/40">3 Tasks</p>
                <ul className="mt-2 space-y-2 text-[12.5px] text-white/70">
                  <li>□ Add multiplayer mode to useAppStore.ts</li>
                  <li>□ Create a new MissionControlView.tsx component</li>
                  <li>□ Update AppManager.tsx to apply expose modes</li>
                </ul>
                <p className="mt-4 text-[11px] text-white/30">Add a task, ⌘K to generate...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
