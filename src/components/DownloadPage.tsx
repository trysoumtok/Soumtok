import { useEffect, useMemo, useState } from 'react'
import {
  detectDesktopPlatform,
  primaryDownloadForPlatform,
  primaryDownloadLabel,
  type DesktopDownloadItem,
  type DesktopRelease,
  type DesktopReleaseManifest,
} from '../../shared/desktopReleases.ts'
import type { DesktopClientConfig } from '../../shared/desktopControl.ts'
import { useSession } from '../lib/auth-client'
import { navigate, openTab } from '../lib/nav'
import { Footer } from './Footer'
import { Nav } from './Nav'
import { DownloadIcon, PillButton } from './ui'

function fetchManifest() {
  return fetch('/api/desktop/releases')
    .then((res) => {
      if (!res.ok) throw new Error('Could not load releases')
      return res.json() as Promise<DesktopReleaseManifest>
    })
    .catch(() => null)
}

function fetchDesktopConfig() {
  return fetch('/api/desktop/config')
    .then((res) => {
      if (!res.ok) throw new Error('Could not load desktop config')
      return res.json() as Promise<DesktopClientConfig>
    })
    .catch(() => null)
}

function PlatformIcon({ platform }: { platform: 'macos' | 'windows' | 'linux' }) {
  if (platform === 'macos') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M16.84 13.13c-.02 2.03 1.78 2.73 1.86 2.77-.02.06-.29.98-.95 1.94-.57.83-1.17 1.66-2.11 1.68-.92.02-1.22-.55-2.28-.55-1.06 0-1.39.53-2.27.57-.91.04-1.6-.91-2.18-1.74-1.18-1.7-2.08-4.8-.87-6.9 1.2-2.08 3.34-2.34 4.04-2.37 1.05-.1 2.04.63 2.68.63.64 0 1.84-.78 3.1-.66.53.02 2.02.21 2.98 1.58-2.58 1.41-2.17 5.05.05 6.24zM14.3 4.2c.57-.69.95-1.65.85-2.6-.82.03-1.81.55-2.4 1.24-.53.61-.99 1.59-.87 2.53.92.07 1.86-.47 2.42-1.17z" />
      </svg>
    )
  }
  if (platform === 'windows') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M3 5.5 10.5 4.2v7.6H3V5.5zm8.5-.9L21 2.5v9.2h-9.5V4.6zM3 13.8h7.5v7.6L3 20.1v-6.3zm9.5 0H21v9.2l-8.5-1.5v-7.7z" />
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.5 3C7.8 3 4 6.8 4 11.5S7.8 20 12.5 20 21 16.2 21 11.5 17.2 3 12.5 3zm0 2c.4 0 .8 0 1.2.1-.6.8-1 1.8-1 2.9 0 1.1.4 2.1 1 2.9-.4.1-.8.1-1.2.1-3.6 0-6.5-2.9-6.5-6.5S8.9 5 12.5 5z" />
    </svg>
  )
}

function firstAvailable(items: DesktopDownloadItem[]) {
  return items.find((item) => item.available) ?? items[0] ?? null
}

function DownloadButton({
  item,
  disabled,
  compact,
}: {
  item: DesktopDownloadItem | null
  disabled?: boolean
  compact?: boolean
}) {
  if (!item || disabled) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full border border-white/10 text-white/35 ${
          compact ? 'px-5 py-2 text-[14px]' : 'px-6 py-3 text-[15px]'
        }`}
      >
        Coming soon
      </span>
    )
  }
  if (!item.available) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full border border-white/10 text-white/35 ${
          compact ? 'px-5 py-2 text-[14px]' : 'px-6 py-3 text-[15px]'
        }`}
      >
        Coming soon
      </span>
    )
  }
  return (
    <a
      href={item.url}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-white font-medium text-black no-underline transition hover:bg-[#f2f2f0] ${
        compact ? 'px-5 py-2 text-[14px]' : 'px-6 py-3 text-[15px]'
      }`}
    >
      <DownloadIcon />
      Download
    </a>
  )
}

function PlatformSummaryRow({
  platform,
  label,
  item,
  disabled,
}: {
  platform: 'macos' | 'windows' | 'linux'
  label: string
  item: DesktopDownloadItem | null
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-white/[0.06] py-5 first:border-t-0 sm:py-6">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="text-white/70">
          <PlatformIcon platform={platform} />
        </span>
        <span className="text-[16px] text-white/90 sm:text-[17px]">{label}</span>
      </div>
      <DownloadButton item={item} disabled={disabled} compact />
    </div>
  )
}

function BuildRow({ item, disabled }: { item: DesktopDownloadItem; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-white/[0.06] px-1 py-3 first:border-t-0">
      <span className="text-[13px] text-white/75">{item.label}</span>
      {item.available && !disabled ? (
        <a
          href={item.url}
          className="inline-flex items-center gap-1.5 text-[13px] text-white/55 no-underline transition hover:text-white"
        >
          Download
          <DownloadIcon />
        </a>
      ) : (
        <span className="text-[12px] text-white/30">Coming soon</span>
      )}
    </div>
  )
}

function PlatformBuilds({
  platform,
  label,
  items,
  disabled,
}: {
  platform: 'macos' | 'windows' | 'linux'
  label: string
  items: DesktopDownloadItem[]
  disabled?: boolean
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#111110] p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-2.5 px-1 text-[15px] font-medium text-white/85 sm:text-[16px]">
        <PlatformIcon platform={platform} />
        {label}
      </div>
      <div>{items.map((item) => <BuildRow key={item.id} item={item} disabled={disabled} />)}</div>
    </div>
  )
}

function ReleaseSection({
  release,
  disabled,
  defaultOpen,
}: {
  release: DesktopRelease
  disabled?: boolean
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen ?? release.latest)

  return (
    <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#111110]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-6 py-5 text-left sm:px-7 sm:py-6"
        aria-expanded={open}
      >
        <span className="text-[16px] font-medium text-white sm:text-[17px]">{release.version}</span>
        {release.latest && (
          <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/70">
            Latest
          </span>
        )}
        <span className="ml-auto text-white/45">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className={`transition ${open ? 'rotate-180' : ''}`}
            aria-hidden
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="border-t border-white/[0.06] px-4 pb-5 pt-4">
          <div className="grid gap-3 md:grid-cols-3">
            <PlatformBuilds platform="macos" label="macOS" items={release.macos} disabled={disabled} />
            <PlatformBuilds platform="windows" label="Windows" items={release.windows} disabled={disabled} />
            <PlatformBuilds platform="linux" label="Linux" items={release.linux} disabled={disabled} />
          </div>
          <a
            href={release.releaseNotesUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1 px-1 text-[13px] text-[#e07a5f] no-underline hover:text-[#f0927a]"
          >
            View release notes →
          </a>
        </div>
      )}
    </section>
  )
}

export function DownloadPage() {
  const { data: session } = useSession()
  const [manifest, setManifest] = useState<DesktopReleaseManifest | null>(null)
  const [config, setConfig] = useState<DesktopClientConfig | null>(null)
  const platform = useMemo(
    () => detectDesktopPlatform(navigator.userAgent, navigator.platform),
    [],
  )

  useEffect(() => {
    let cancelled = false
    void Promise.all([fetchManifest(), fetchDesktopConfig()]).then(([nextManifest, nextConfig]) => {
      if (cancelled) return
      setManifest(nextManifest)
      setConfig(nextConfig)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const latest = manifest?.releases.find((item) => item.latest) || manifest?.releases[0] || null
  const primary = manifest ? primaryDownloadForPlatform(manifest, platform) : null
  const primaryLabel = primaryDownloadLabel(platform)
  const disabled = Boolean(config?.disabled)

  const winAlt =
    latest?.windows.find((item) => item.id.includes('arm64')) ||
    latest?.windows.find((item) => item.id.includes('zip')) ||
    null

  return (
    <div className="theme-app min-h-svh bg-[#0b0b0a] text-white">
      <Nav
        onDownload={() => navigate('/download')}
        onSignIn={() => navigate('/login')}
        onContact={() => openTab('/contact')}
        onAccount={() => navigate('/dashboard')}
      />

      <main className="wide-wrap pb-24 pt-20 sm:pt-28 lg:pt-32">
        {disabled && (
          <div className="mb-12 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-6 py-5 text-[15px] leading-7 text-amber-100/90 sm:text-[16px]">
            {config?.disabledMessage ||
              'Soumtok Desktop downloads are temporarily paused. Studio in the browser is still available.'}
          </div>
        )}

        {/* Hero */}
        <div className="text-center">
          <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-[52px] md:text-[64px] lg:text-[72px]">
            Download Soumtok
          </h1>
          <p className="mx-auto mt-5 max-w-[640px] text-[17px] leading-8 text-white/50 sm:mt-6 sm:text-[19px] md:max-w-[720px]">
            Think, hand off tasks, and code — desktop IDE with Tab, terminal, and your Soumtok account.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            {primary?.available && !disabled ? (
              <PillButton href={primary.url} size="lg">
                <PlatformIcon platform={platform === 'unknown' ? 'windows' : platform} />
                {primaryLabel}
              </PillButton>
            ) : (
              <PillButton
                variant="outline"
                size="lg"
                onClick={() => document.getElementById('all-builds')?.scrollIntoView({ behavior: 'smooth' })}
              >
                See all builds
              </PillButton>
            )}
            {platform === 'windows' && winAlt && winAlt.available && !disabled && (
              <PillButton href={winAlt.url} variant="outline" size="lg">
                <PlatformIcon platform="windows" />
                {winAlt.label.includes('ARM') ? 'Windows (ARM64)' : winAlt.label}
              </PillButton>
            )}
          </div>

          <p className="mt-8 text-[14px] text-white/35 sm:text-[15px]">
            Available for macOS, Windows, and Linux · v{latest?.version || config?.latestVersion || '…'}
          </p>
        </div>

        <div className="my-16 h-px bg-white/[0.08] sm:my-20" />

        {/* Get started */}
        <div>
          <h2 className="text-[28px] font-medium tracking-[-0.03em] text-white sm:text-[32px] md:text-[36px]">
            Get started
          </h2>
          <p className="mt-3 text-[16px] text-white/45 sm:text-[17px]">
            Access Soumtok on desktop and in the browser.
          </p>

          <div className="mt-10 grid gap-6 lg:grid-cols-2 lg:gap-8">
            <article className="rounded-3xl border border-white/[0.08] bg-[#111110] px-6 py-7 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
              <h3 className="text-[20px] font-medium text-white sm:text-[22px]">Desktop</h3>
              <p className="mt-3 text-[15px] leading-7 text-white/50 sm:text-[16px]">
                The full agent-first IDE on your machine — Tab, terminal, extensions, and local tools.
              </p>
              <div className="mt-4">
                <PlatformSummaryRow
                  platform="macos"
                  label="macOS"
                  item={latest ? firstAvailable(latest.macos) : null}
                  disabled={disabled}
                />
                <PlatformSummaryRow
                  platform="windows"
                  label="Windows"
                  item={latest ? firstAvailable(latest.windows) : null}
                  disabled={disabled}
                />
                <PlatformSummaryRow
                  platform="linux"
                  label="Linux"
                  item={latest ? firstAvailable(latest.linux) : null}
                  disabled={disabled}
                />
              </div>
            </article>

            <article className="rounded-3xl border border-white/[0.08] bg-[#111110] px-6 py-7 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
              <h3 className="text-[20px] font-medium text-white sm:text-[22px]">Studio</h3>
              <p className="mt-3 text-[15px] leading-7 text-white/50 sm:text-[16px]">
                Run agents in the browser — attach GitHub, pick a model, and ship without installing anything.
              </p>
              <div className="mt-8">
                <PillButton size="lg" onClick={() => navigate(session?.user ? '/dashboard' : '/signup')}>
                  Open Studio →
                </PillButton>
              </div>
            </article>
          </div>
        </div>

        {/* All builds */}
        <div id="all-builds" className="mt-16 sm:mt-20">
          <h2 className="text-[28px] font-medium tracking-[-0.03em] text-white sm:text-[32px] md:text-[36px]">
            All builds
          </h2>
          <p className="mt-3 text-[16px] text-white/45 sm:text-[17px]">
            Every platform and architecture for each release.
          </p>

          <div className="mt-8 space-y-4">
            {(manifest?.releases || []).map((release) => (
              <ReleaseSection
                key={release.version}
                release={release}
                disabled={disabled}
                defaultOpen={release.latest}
              />
            ))}
            {!manifest && (
              <div className="rounded-2xl border border-white/[0.08] bg-[#111110] px-5 py-10 text-center text-[14px] text-white/45">
                Loading release builds…
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
