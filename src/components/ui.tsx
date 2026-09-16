import type { ReactNode } from 'react'
import { navigate } from '../lib/nav'

export function BrandMark({ className = 'h-5 w-auto' }: { className?: string }) {
  return (
    <img
      src="/images/soumtok-mark.png"
      alt=""
      className={`brand-logo select-none ${className}`}
      draggable={false}
    />
  )
}

const logoHeight = {
  sm: 'h-8',
  md: 'h-12',
  lg: 'h-16',
  xl: 'h-[92px]',
}

export function Logo({
  compact = false,
  href = '#top',
  size = 'md',
}: {
  compact?: boolean
  href?: string
  size?: keyof typeof logoHeight
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center no-underline"
      onClick={(event) => {
        if (href.startsWith('#') || href.startsWith('http')) return
        event.preventDefault()
        navigate(href)
      }}
    >
      <img
        src={compact ? '/images/soumtok-mark.png' : '/images/soumtok-lockup.png'}
        alt="Soumtok"
        className={`brand-logo w-auto max-w-[min(100%,220px)] select-none ${logoHeight[size]}`}
        draggable={false}
      />
    </a>
  )
}

export function AccentLink({
  href = '#',
  children,
}: {
  href?: string
  children: ReactNode
}) {
  const tab = href.startsWith('/docs') || href.startsWith('/help') || href.startsWith('/contact')
  return (
    <a
      className="accent-link"
      href={href}
      {...(tab ? { target: '_blank', rel: 'noreferrer' } : {})}
      onClick={(event) => {
        if (tab || href.startsWith('#') || href.startsWith('http')) return
        event.preventDefault()
        navigate(href)
      }}
    >
      {children}
    </a>
  )
}

export function InfoIcon({ className = '' }: { className?: string }) {
  return <span className={`info-icon ${className}`.trim()} aria-hidden />
}

export function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 2.5v8M4.5 8.5 8 12l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 13.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function PillButton({
  children,
  variant = 'solid',
  onClick,
  href,
  type = 'button',
  size = 'md',
  className = '',
}: {
  children: ReactNode
  variant?: 'solid' | 'ghost' | 'outline'
  onClick?: () => void
  href?: string
  type?: 'button' | 'submit'
  size?: 'md' | 'lg'
  className?: string
}) {
  const cls =
    variant === 'solid'
      ? 'bg-white text-black hover:bg-[#f2f2f0]'
      : variant === 'outline'
        ? 'border border-white/20 text-white hover:bg-white/5'
        : 'text-white/80 hover:text-white'

  const sizeCls = size === 'lg' ? 'px-8 py-3.5 text-[16px]' : 'px-5 py-[11px] text-[14px]'

  const shared =
    `inline-flex items-center justify-center gap-2 rounded-full font-medium no-underline transition ${sizeCls} ${cls} ${className}`.trim()

  if (href) {
    const downloadName = href.includes('/api/desktop/download/') ? decodeURIComponent(href.split('/').pop() || '') : undefined
    return (
      <a className={shared} href={href} {...(downloadName ? { download: downloadName } : {})}>
        {children}
      </a>
    )
  }

  return (
    <button type={type} className={shared} onClick={onClick}>
      {children}
    </button>
  )
}

export function TrafficLights() {
  return (
    <div className="traffic" aria-hidden>
      <i />
      <i />
      <i />
    </div>
  )
}
