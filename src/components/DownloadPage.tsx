import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  detectDesktopPlatform,
  desktopDownloadUrl,
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

type DownloadNotice = {
  label: string
  filename: string
  phase: 'starting' | 'retry'
}

function triggerFileDownload(filename: string) {
  const url = desktopDownloadUrl(filename)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

const downloadHover =
  'transition-all duration-200 hover:scale-[1.04] hover:shadow-[0_10px_36px_rgba(255,255,255,0.14)] active:scale-[0.98]'

function DownloadNoticeBanner({
  notice,
  onRetry,
  onDismiss,
}: {
  notice: DownloadNotice
  onRetry: () => void
  onDismiss: () => void
}) {
  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 w-[min(92vw,440px)] -translate-x-1/2 rounded-2xl border border-white/15 bg-[#161615] px-5 py-4 shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
            notice.phase === 'starting' ? 'bg-white/10 text-white' : 'bg-amber-400/15 text-amber-200'
          }`}
        >
          {notice.phase === 'starting' ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
          ) : (
            <DownloadIcon />
          )}
        </span>
        <div className="min-w-0 flex-1">
          {notice.phase === 'starting' ? (
            <>
              <p className="text-[14px] font-medium text-white">Download starting…</p>
              <p className="mt-1 text-[13px] leading-6 text-white/50">
                {notice.label} should begin in a few seconds. Large installers can take a moment.
              </p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-medium text-white">Didn&apos;t start?</p>
              <p className="mt-1 text-[13px] leading-6 text-white/50">
                Try again —{' '}
                <button type="button" onClick={onRetry} className="font-medium text-white underline hover:text-white/90">
                  click here
                </button>{' '}
                to download {notice.label}.
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-[18px] leading-none text-white/35 hover:text-white/70"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}

function DownloadButton({
  item,
  disabled,
  compact,
  pending,
  onDownload,
}: {
  item: DesktopDownloadItem | null
  disabled?: boolean
  compact?: boolean
  pending?: boolean
  onDownload: (item: DesktopDownloadItem) => void
}) {
  if (!item || disabled || !item.available) {
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
    <button
      type="button"
      onClick={() => onDownload(item)}
      className={`group inline-flex items-center justify-center gap-2 rounded-full bg-white font-medium text-black ${downloadHover} ${
        pending ? 'animate-pulse' : ''
      } ${compact ? 'px-5 py-2 text-[14px]' : 'px-6 py-3 text-[15px]'}`}
    >
      <span className="transition-transform duration-200 group-hover:translate-y-0.5">
        <DownloadIcon />
      </span>
      {pending ? 'Starting…' : 'Download'}
    </button>
  )
}

function PlatformSummaryRow({
  platform,
  label,
  item,
  disabled,
  pending,
  onDownload,
}: {
  platform: 'macos' | 'windows' | 'linux'
  label: string
  item: DesktopDownloadItem | null
  disabled?: boolean
  pending?: boolean
  onDownload: (item: DesktopDownloadItem) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-white/[0.06] py-5 first:border-t-0 sm:py-6">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="text-white/70">
          <PlatformIcon platform={platform} />
        </span>
        <span className="text-[16px] text-white/90 sm:text-[17px]">{label}</span>
      </div>
      <DownloadButton item={item} disabled={disabled} compact pending={pending} onDownload={onDownload} />
    </div>
  )
}

function BuildRow({
  item,
  disabled,
  pending,
  onDownload,
}: {
  item: DesktopDownloadItem
  disabled?: boolean
  pending?: boolean
  onDownload: (item: DesktopDownloadItem) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-white/[0.06] px-1 py-3 first:border-t-0">
      <span className="text-[13px] text-white/75">{item.label}</span>
      {item.available && !disabled ? (
        <button
          type="button"
          onClick={() => onDownload(item)}
          className={`group inline-flex items-center gap-1.5 text-[13px] text-white/55 transition hover:text-white ${downloadHover} rounded-full px-2 py-1 hover:bg-white/[0.06] ${
            pending ? 'animate-pulse text-white' : ''
          }`}
        >
          {pending ? 'Starting…' : 'Download'}
          <span className="transition-transform duration-200 group-hover:translate-y-0.5">
            <DownloadIcon />
          </span>
        </button>
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
  pendingFilename,
  onDownload,
}: {
  platform: 'macos' | 'windows' | 'linux'
  label: string
  items: DesktopDownloadItem[]
  disabled?: boolean
  pendingFilename?: string | null
  onDownload: (item: DesktopDownloadItem) => void
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#111110] p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-2.5 px-1 text-[15px] font-medium text-white/85 sm:text-[16px]">
        <PlatformIcon platform={platform} />
        {label}
      </div>
      <div>
        {items.map((item) => (
          <BuildRow
            key={item.id}
            item={item}
            disabled={disabled}
            pending={pendingFilename === item.filename}
            onDownload={onDownload}
          />
        ))}
      </div>
    </div>
  )
}

function ReleaseSection({
  release,
  disabled,
  defaultOpen,
  pendingFilename,
  onDownload,
}: {
  release: DesktopRelease
  disabled?: boolean
  defaultOpen?: boolean
  pendingFilename?: string | null
  onDownload: (item: DesktopDownloadItem) => void
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
            <PlatformBuilds
              platform="macos"
              label="macOS"
              items={release.macos}
              disabled={disabled}
              pendingFilename={pendingFilename}
              onDownload={onDownload}
            />
            <PlatformBuilds
              platform="windows"
              label="Windows"
              items={release.windows}
              disabled={disabled}
              pendingFilename={pendingFilename}
              onDownload={onDownload}
            />
            <PlatformBuilds
              platform="linux"
              label="Linux"
              items={release.linux}
              disabled={disabled}
              pendingFilename={pendingFilename}
              onDownload={onDownload}
            />
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

function HeroDownloadButton({
  item,
  label,
  variant = 'solid',
  pending,
  onDownload,
  icon,
}: {
  item: DesktopDownloadItem
  label: string
  variant?: 'solid' | 'outline'
  pending?: boolean
  onDownload: (item: DesktopDownloadItem) => void
  icon?: ReactNode
}) {
  const solid = variant === 'solid'
  return (
    <button
      type="button"
      onClick={() => onDownload(item)}
      className={`group inline-flex items-center justify-center gap-2 rounded-full px-8 py-3.5 text-[16px] font-medium ${downloadHover} ${
        solid
          ? 'bg-white text-black hover:bg-[#f2f2f0]'
          : 'border border-white/20 text-white hover:bg-white/5'
      } ${pending ? 'animate-pulse' : ''}`}
    >
      {icon}
      <span className="transition-transform duration-200 group-hover:translate-y-0.5">
        {pending ? 'Starting…' : label}
      </span>
    </button>
  )
}

export function DownloadPage() {
  const { data: session } = useSession()
  const [manifest, setManifest] = useState<DesktopReleaseManifest | null>(null)
  const [config, setConfig] = useState<DesktopClientConfig | null>(null)
  const [notice, setNotice] = useState<DownloadNotice | null>(null)
  const [pendingFilename, setPendingFilename] = useState<string | null>(null)
  const retryTimer = useRef<number | null>(null)
  const clearTimer = useRef<number | null>(null)
  const platform = useMemo(
    () => detectDesktopPlatform(navigator.userAgent, navigator.platform),
    [],
  )

  const clearDownloadTimers = useCallback(() => {
    if (retryTimer.current) window.clearTimeout(retryTimer.current)
    if (clearTimer.current) window.clearTimeout(clearTimer.current)
    retryTimer.current = null
    clearTimer.current = null
  }, [])

  const startDownload = useCallback(
    (item: DesktopDownloadItem) => {
      clearDownloadTimers()
      setPendingFilename(item.filename)
      setNotice({ label: item.label, filename: item.filename, phase: 'starting' })
      triggerFileDownload(item.filename)
      retryTimer.current = window.setTimeout(() => {
        setNotice((current) =>
          current?.filename === item.filename && current.phase === 'starting'
            ? { ...current, phase: 'retry' }
            : current,
        )
        setPendingFilename(null)
      }, 6000)
      clearTimer.current = window.setTimeout(() => {
        setNotice((current) => (current?.filename === item.filename ? null : current))
      }, 20000)
    },
    [clearDownloadTimers],
  )

  useEffect(() => {
    return () => clearDownloadTimers()
  }, [clearDownloadTimers])

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
    <div className="theme-app keep-dark min-h-svh bg-[#0b0b0a] text-white">
      {notice && (
        <DownloadNoticeBanner
          notice={notice}
          onRetry={() => {
            const item =
              latest?.windows.find((row) => row.filename === notice.filename) ||
              latest?.macos.find((row) => row.filename === notice.filename) ||
              latest?.linux.find((row) => row.filename === notice.filename)
            if (item) startDownload(item)
          }}
          onDismiss={() => {
            clearDownloadTimers()
            setNotice(null)
            setPendingFilename(null)
          }}
        />
      )}
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
              <HeroDownloadButton
                item={primary}
                label={primaryLabel}
                pending={pendingFilename === primary.filename}
                onDownload={startDownload}
                icon={<PlatformIcon platform={platform === 'unknown' ? 'windows' : platform} />}
              />
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
              <HeroDownloadButton
                item={winAlt}
                label={winAlt.label.includes('ARM') ? 'Windows (ARM64)' : winAlt.label}
                variant="outline"
                pending={pendingFilename === winAlt.filename}
                onDownload={startDownload}
                icon={<PlatformIcon platform="windows" />}
              />
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
                  pending={Boolean(latest && pendingFilename === firstAvailable(latest.macos)?.filename)}
                  onDownload={startDownload}
                />
                <PlatformSummaryRow
                  platform="windows"
                  label="Windows"
                  item={latest ? firstAvailable(latest.windows) : null}
                  disabled={disabled}
                  pending={Boolean(latest && pendingFilename === firstAvailable(latest.windows)?.filename)}
                  onDownload={startDownload}
                />
                <PlatformSummaryRow
                  platform="linux"
                  label="Linux"
                  item={latest ? firstAvailable(latest.linux) : null}
                  disabled={disabled}
                  pending={Boolean(latest && pendingFilename === firstAvailable(latest.linux)?.filename)}
                  onDownload={startDownload}
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

          <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#111110] px-5 py-5 text-[14px] leading-7 text-white/55 sm:px-6 sm:text-[15px]">
            <p className="font-medium text-white/80">Which Windows installer?</p>
            <p className="mt-2">
              <strong className="font-medium text-white/70">User</strong> — installs for you only (no admin password).
              Best for most people on a work or personal PC.
            </p>
            <p className="mt-2">
              <strong className="font-medium text-white/70">System</strong> — installs for all users on the machine
              (needs administrator approval). Use on a shared or IT-managed computer.
            </p>
            <p className="mt-2">
              <strong className="font-medium text-white/70">Portable (.zip)</strong> — unzip and run; nothing is
              installed. Good for testing or a USB stick.
            </p>
          </div>

          <div className="mt-8 space-y-4">
            {(manifest?.releases || []).map((release) => (
              <ReleaseSection
                key={release.version}
                release={release}
                disabled={disabled}
                defaultOpen={release.latest}
                pendingFilename={pendingFilename}
                onDownload={startDownload}
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
