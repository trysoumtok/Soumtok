import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { planLabel } from '../../../shared/plans'
import { clearTwoFactor } from '../../lib/api'
import { signOut, useSession } from '../../lib/auth-client'
import { navigate, openTab } from '../../lib/nav'
import { avatarUrl } from '../../lib/avatar'
import { applyTheme, getThemePref, type ThemePref } from '../../lib/theme'
import { CreateProfileModal } from './CreateProfileModal'

function MenuIcon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function AccountMenu({
  name,
  plan,
  username,
  hasAvatar,
  collapsed,
  onDownload,
  onProfileSaved,
}: {
  name: string
  plan?: string
  username?: string | null
  hasAvatar?: boolean
  collapsed?: boolean
  onDownload?: () => void
  onProfileSaved?: () => void
}) {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [theme, setTheme] = useState<ThemePref>(() => (typeof window === 'undefined' ? 'system' : getThemePref()))
  const [avatarBust, setAvatarBust] = useState(0)
  const [photoFailed, setPhotoFailed] = useState(false)
  const [menuPos, setMenuPos] = useState<CSSProperties>({})
  const [flyPos, setFlyPos] = useState<CSSProperties>({})
  const root = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const appearanceBtnRef = useRef<HTMLButtonElement>(null)
  const helpBtnRef = useRef<HTMLButtonElement>(null)
  const appearanceMenuRef = useRef<HTMLDivElement>(null)
  const helpMenuRef = useRef<HTMLDivElement>(null)
  const email = session?.user.email || ''
  const initial = name.slice(0, 1).toUpperCase()
  const label = planLabel(plan)
  const showPhoto = (hasAvatar || avatarBust > 0) && !photoFailed
  const canPortal = typeof document !== 'undefined'

  function placeMenu() {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    const width = Math.min(260, window.innerWidth - 16)
    let left = r.left
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8
    if (left < 8) left = 8
    setMenuPos({
      position: 'fixed',
      left,
      bottom: Math.max(8, window.innerHeight - r.top + 8),
      width,
      zIndex: 220,
    })
  }

  function placeFly(which: 'appearance' | 'help') {
    const btn = which === 'appearance' ? appearanceBtnRef.current : helpBtnRef.current
    const r = btn?.getBoundingClientRect()
    if (!r) return
    const width = which === 'appearance' ? 168 : 188
    let left = r.right + 6
    if (left + width > window.innerWidth - 8) left = r.left - width - 6
    if (left < 8) left = 8
    let top = r.top
    const height = which === 'appearance' ? 132 : 148
    if (top + height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - height - 8)
    setFlyPos({
      position: 'fixed',
      top,
      left,
      width,
      zIndex: 230,
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    placeMenu()
    if (appearanceOpen) placeFly('appearance')
    if (helpOpen) placeFly('help')
    function onWin() {
      placeMenu()
      if (appearanceOpen) placeFly('appearance')
      if (helpOpen) placeFly('help')
    }
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    return () => {
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
    }
  }, [open, appearanceOpen, helpOpen])

  useEffect(() => {
    function inside(node: Node | null) {
      return Boolean(
        node &&
          (root.current?.contains(node) ||
            menuRef.current?.contains(node) ||
            appearanceMenuRef.current?.contains(node) ||
            helpMenuRef.current?.contains(node)),
      )
    }
    function onDoc(event: MouseEvent) {
      if (!inside(event.target as Node)) {
        setOpen(false)
        setAppearanceOpen(false)
        setHelpOpen(false)
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        setAppearanceOpen(false)
        setHelpOpen(false)
      }
    }
    function onTheme() {
      setTheme(getThemePref())
    }
    function onAvatar(event: Event) {
      const at = (event as CustomEvent<number>).detail
      setAvatarBust(typeof at === 'number' ? at : Date.now())
      setPhotoFailed(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('soumtok-theme', onTheme)
    window.addEventListener('soumtok-avatar', onAvatar)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('soumtok-theme', onTheme)
      window.removeEventListener('soumtok-avatar', onAvatar)
    }
  }, [])

  function chooseTheme(next: ThemePref) {
    setTheme(next)
    applyTheme(next)
  }

  function closeMenu() {
    setOpen(false)
    setAppearanceOpen(false)
    setHelpOpen(false)
  }

  const menu = open && canPortal && (
    <div
      ref={menuRef}
      style={menuPos}
      className="theme-app account-menu overflow-visible rounded-xl border border-white/10 bg-[#161614] py-1 shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          {showPhoto ? (
            <img src={avatarUrl(avatarBust)} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-[12px]">{initial}</span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[13px] text-white">{name}</p>
            {email && <p className="truncate text-[12px] text-white/40">{email}</p>}
          </div>
        </div>
        {plan !== 'pro' && plan !== 'pro_plus' && plan !== 'ultra' && plan !== 'team' && plan !== 'teams' && plan !== 'team_plus' && (
          <button
            type="button"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/12 px-3 py-1.5 text-[13px] hover:bg-white/[0.04]"
            onClick={() => {
              closeMenu()
              navigate('/checkout?plan=pro')
            }}
          >
            <span aria-hidden>✦</span>
            Upgrade to Pro
          </button>
        )}
      </div>

      <div className="my-1 h-px bg-white/[0.06]" />

      <MenuRow
        icon={<MenuIcon d="M8 8.2a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM3.2 13c.5-1.7 2-2.8 4.8-2.8s4.3 1.1 4.8 2.8" />}
        label="Create Profile"
        onClick={() => {
          closeMenu()
          setProfileOpen(true)
        }}
      />
      <MenuRow
        icon={<MenuIcon d="M8 3.2v6.2M5.6 7.2 8 9.6l2.4-2.4M3.2 12.4h9.6" />}
        label="Download Soumtok Windows"
        onClick={() => {
          closeMenu()
          onDownload?.()
        }}
      />
      <button
        ref={appearanceBtnRef}
        type="button"
        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-white/[0.05] ${
          appearanceOpen ? 'bg-white/[0.06] text-white' : 'text-white/80'
        }`}
        onClick={() => {
          setAppearanceOpen((value) => !value)
          setHelpOpen(false)
        }}
      >
        <span className="text-white/45">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M8 13.2A5.2 5.2 0 1 0 8 2.8a5.2 5.2 0 0 0 0 10.4Z"
              stroke="currentColor"
              strokeWidth="1.3"
            />
            <path d="M8 2.8v10.4" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 2.8a5.2 5.2 0 0 0 0 10.4" fill="currentColor" opacity="0.35" />
          </svg>
        </span>
        <span className="flex-1">Appearance</span>
        <span className="text-[12px] text-white/40">{theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark'}</span>
        <span className="text-white/30">›</span>
      </button>
      <button
        ref={helpBtnRef}
        type="button"
        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-white/[0.05] ${
          helpOpen ? 'bg-white/[0.06] text-white' : 'text-white/80'
        }`}
        onClick={() => {
          setHelpOpen((value) => !value)
          setAppearanceOpen(false)
        }}
      >
        <span className="text-white/45">
          <MenuIcon d="M8 10.6v.2M8 6.6A1.4 1.4 0 1 0 8 3.8a1.4 1.4 0 0 0 0 2.8v1.4M8 14.2A6.2 6.2 0 1 0 8 1.8a6.2 6.2 0 0 0 0 12.4Z" />
        </span>
        <span className="flex-1">Help</span>
        <span className="text-white/30">›</span>
      </button>

      <div className="my-1 h-px bg-white/[0.06]" />

      <MenuRow
        icon={<MenuIcon d="M6.2 4.2H3.8A1.2 1.2 0 0 0 2.6 5.4v6.4A1.2 1.2 0 0 0 3.8 13h2.4M6.8 8h6.4M10.8 5.6 13.4 8l-2.6 2.4" />}
        label="Log Out"
        onClick={async () => {
          closeMenu()
          await clearTwoFactor()
          await signOut()
          navigate('/')
        }}
      />
    </div>
  )

  const appearanceMenu = appearanceOpen && open && canPortal && (
    <div
      ref={appearanceMenuRef}
      style={flyPos}
      className="theme-app account-menu rounded-xl border border-white/10 bg-[#1b1b19] py-1 shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
      onMouseDown={(event) => event.stopPropagation()}
    >
      {(['light', 'dark', 'system'] as const).map((item) => (
        <button
          key={item}
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] capitalize text-white/85 hover:bg-white/[0.06]"
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            chooseTheme(item)
          }}
        >
          {item}
          {theme === item && <span className="text-white">✓</span>}
        </button>
      ))}
    </div>
  )

  const helpMenu = helpOpen && open && canPortal && (
    <div
      ref={helpMenuRef}
      style={flyPos}
      className="theme-app account-menu rounded-xl border border-white/10 bg-[#1b1b19] py-1 shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <MenuRow
        icon={<MenuIcon d="M3.4 3.6h4.6A1.8 1.8 0 0 1 9.8 5.4v8.2H4.8A1.4 1.4 0 0 1 3.4 12.2ZM12.6 3.6H8A1.8 1.8 0 0 0 6.2 5.4v8.2h5A1.4 1.4 0 0 0 12.6 12.2Z" />}
        label="Soumtok Docs"
        onClick={() => {
          closeMenu()
          openTab('/docs')
        }}
      />
      <MenuRow
        icon={<MenuIcon d="M3.4 11.4 4.2 9.2A5 5 0 1 1 8 13.2H4.6L3.4 11.4ZM8 6.4v.2M8 7.6c0-.8.7-1.2 1.4-1.2A1.3 1.3 0 0 1 10.7 8c0 .8-.6 1.1-1.4 1.6v.4" />}
        label="Get help"
        onClick={() => {
          closeMenu()
          openTab('/help')
        }}
      />
      <MenuRow
        icon={<MenuIcon d="M3.2 4.2h9.6A1.2 1.2 0 0 1 14 5.4v5.2A1.2 1.2 0 0 1 12.8 11.8H6.4L3.2 14V4.2Z" />}
        label="Contact Us"
        onClick={() => {
          closeMenu()
          openTab('/contact')
        }}
      />
    </div>
  )

  return (
    <div ref={root} className="relative mt-2">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((value) => !value)
          setAppearanceOpen(false)
          setHelpOpen(false)
        }}
        className={`flex w-full items-center gap-2.5 rounded-none border px-2 py-2 hover:bg-white/[0.04] ${
          collapsed ? 'justify-center border-white/12' : ''
        } ${open ? 'border-white/22 bg-white/[0.05]' : 'border-white/12'}`}
      >
        {showPhoto ? (
          <img
            src={avatarUrl(avatarBust)}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover"
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-[12px]">{initial}</span>
        )}
        {!collapsed && (
          <>
            <span className="min-w-0 text-left">
              <span className="block truncate text-[13px]">{name}</span>
              <span className="block text-[11px] text-white/40">{label}</span>
            </span>
            <span className="ml-auto text-[16px] leading-none text-white/35">···</span>
          </>
        )}
      </button>

      {canPortal && menu ? createPortal(menu, document.body) : null}
      {canPortal && appearanceMenu ? createPortal(appearanceMenu, document.body) : null}
      {canPortal && helpMenu ? createPortal(helpMenu, document.body) : null}

      <CreateProfileModal
        open={profileOpen}
        name={name}
        username={username}
        onClose={() => setProfileOpen(false)}
        onSaved={onProfileSaved}
      />
    </div>
  )
}

function MenuRow({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-white/80 hover:bg-white/[0.05]"
      onClick={onClick}
    >
      <span className="text-white/45">{icon}</span>
      {label}
    </button>
  )
}
