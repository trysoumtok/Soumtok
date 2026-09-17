import { useState } from 'react'
import { PlatformIcon } from './PlatformIcon.tsx'

const RAW = 'https://raw.githubusercontent.com/trysoumtok/Soumtok/main/public/install'
const INSTALL = {
  windows: `irm '${RAW}/cli.ps1' | iex`,
  macos: `curl -fsSL ${RAW}/cli-macos.sh | bash`,
  linux: `curl -fsSL ${RAW}/cli-linux.sh | bash`,
} as const

type PlatformTab = keyof typeof INSTALL

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative mt-4 rounded-xl border border-white/[0.1] bg-[#0b0b0a] px-4 py-3 font-mono text-[13px] leading-6 text-white/80">
      <code className="block break-all pr-10">{text}</code>
      <button
        type="button"
        className="absolute right-3 top-3 rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/50 hover:bg-white/5 hover:text-white/80"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          })
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

export function TerminalCliGuide() {
  const [tab, setTab] = useState<PlatformTab>('windows')

  return (
    <section className="mt-16 sm:mt-20" id="terminal">
      <h2 className="text-[28px] font-medium tracking-[-0.03em] text-white sm:text-[32px] md:text-[36px]">Terminal</h2>
      <p className="mt-3 max-w-[640px] text-[16px] leading-7 text-white/45 sm:text-[17px]">
        Soumtok Agent in your terminal — your account, your models.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-start">
        <div className="rounded-3xl border border-white/[0.08] bg-[#111110] p-6 sm:p-8">
          <div className="rounded-2xl border border-white/[0.06] bg-[#0b0b0a] p-4 font-mono text-[12px] leading-6 text-white/70">
            <p className="text-white/40">Soumtok Agent</p>
            <p className="mt-2 text-[#f54e00]">◆ auto · Agent · ~/my-app</p>
            <p className="mt-4 text-white/50">$ soumtok login</p>
            <p className="text-white/50">$ soumtok</p>
            <p className="mt-3 text-white/35">→ add dark mode to the header</p>
            <p className="mt-2 text-emerald-400/90">  ▸ editing Header.tsx…</p>
          </div>
        </div>

        <div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {(
              [
                ['windows', 'Windows'],
                ['macos', 'macOS'],
                ['linux', 'Linux'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-[13px] sm:px-4 sm:py-3.5 sm:text-[14px] ${
                  tab === key
                    ? 'border-white/20 bg-white text-black'
                    : 'border-white/10 bg-[#111110] text-white/70 hover:border-white/20 hover:text-white'
                }`}
              >
                <PlatformIcon platform={key} size={key === 'linux' ? 22 : 18} />
                {label}
              </button>
            ))}
          </div>
          <CopyBlock text={INSTALL[tab]} />
          <p className="mt-4 text-[14px] leading-7 text-white/45">
            Run <code className="text-white/70">soumtok login</code>, then{' '}
            <code className="text-white/70">soumtok</code> in your project folder.
          </p>
        </div>
      </div>
    </section>
  )
}
