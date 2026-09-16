import { useCallback, useEffect, useState } from 'react'
import { emptyProfile, fetchProfile, fetchTwoFactorStatus, isOnboardingComplete, type Profile } from './lib/api'
import { signOut, useSession } from './lib/auth-client'
import { sessionTimedOut } from '../shared/session'
import { navigate, openTab, usePath } from './lib/nav'
import { isMarketingPath, setMarketingSurface } from './lib/theme'
import { DownloadPage } from './components/DownloadPage'
import { HomeLanding } from './components/HomeLanding'
import { LoginPage } from './components/LoginPage'
import { PageSkeleton } from './components/Loaders'
import { OnboardingPage } from './components/OnboardingPage'
import { DashboardPage } from './components/dashboard/DashboardPage'
import { DocsPage } from './components/docs/DocsPage'
import { CheckoutPage } from './components/CheckoutPage'
import { NewTeamPage } from './components/NewTeamPage'
import { PublicProfilePage } from './components/PublicProfilePage'
import { NotFoundPage } from './components/NotFoundPage'
import { HelpPage } from './components/HelpPage'
import { ContactPage } from './components/ContactPage'
import { ConnectDevicePage } from './components/ConnectDevicePage'
import { DesktopLinkPage } from './components/DesktopLinkPage'

const RESERVED_PATHS = new Set([
  '',
  'login',
  'signup',
  'onboarding',
  'dashboard',
  'docs',
  'privacy',
  'terms',
  'api',
  'images',
  'assets',
  'checkout',
  'team',
  '404',
  'help',
  'contact',
  'agents',
  'connect',
  'desktop-link',
  'download',
])

function publicProfileHandle(path: string) {
  const parts = path.split('/').filter(Boolean)
  if (parts.length !== 1) return null
  const slug = parts[0]
  if (RESERVED_PATHS.has(slug.toLowerCase())) return null
  return slug
}

export default function App() {
  const path = usePath()
  const { data: session, isPending } = useSession()
  const authSession =
    session && 'session' in session
      ? (session as { session?: { createdAt?: Date | string; expiresAt?: Date | string } }).session
      : undefined
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const [need2fa, setNeed2fa] = useState(false)
  const openDownload = () => navigate('/download')

  useEffect(() => {
    setMarketingSurface(isMarketingPath(path))
  }, [path])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const authError = params.get('error')
    if (
      authError === 'state_mismatch' ||
      authError === 'state_security_mismatch' ||
      authError === 'state_invalid' ||
      authError === 'invalid_callback' ||
      authError === 'access_denied'
    ) {
      sessionStorage.setItem(
        'soumtok-auth-error',
        authError === 'access_denied'
          ? 'Sign-in was cancelled. Try again when you are ready.'
          : 'Sign-in expired or opened in a different tab. Please try again on soumtok.com (not www).',
      )
      params.delete('error')
      const rest = params.toString()
      const nextPath = window.location.pathname === '/' ? '/login' : window.location.pathname
      window.history.replaceState(null, '', rest ? `${nextPath}?${rest}` : nextPath)
      if (window.location.pathname === '/') navigate('/login')
    }
  }, [])

  useEffect(() => {
    if (isPending) return
    if (!session) {
      setProfile(null)
      setNeed2fa(false)
      return
    }

    let cancelled = false
    setProfile((current) => (current == null ? undefined : current))
    fetchTwoFactorStatus()
      .then((status) => {
        if (!cancelled) setNeed2fa(status.needed)
      })
      .catch(() => {
        if (!cancelled) setNeed2fa(false)
      })
    fetchProfile()
      .then((next) => {
        if (!cancelled) setProfile(next)
      })
      .catch(() => {
        if (!cancelled) {
          setProfile((current) => current ?? { ...emptyProfile })
        }
      })

    return () => {
      cancelled = true
    }
  }, [session?.user.id, isPending])

  const onOnboardingComplete = useCallback((next?: Profile) => {
    if (!isOnboardingComplete(next)) return
    setProfile(next)
    navigate('/dashboard')
  }, [])

  const ready = !isPending && !(session && profile === undefined)
  const [booted, setBooted] = useState(false)
  const needsOnboarding = Boolean(session && (ready || booted) && !isOnboardingComplete(profile))
  const onDashboard = path.startsWith('/dashboard')
  const onCheckout = path.startsWith('/checkout')
  const onTeamNew = path.startsWith('/team')
  const onAuth = path === '/login' || path === '/signup'
  const onOnboarding = path === '/onboarding'
  const onConnect = path.startsWith('/connect/')
  const onDesktopLink = path.startsWith('/desktop-link/')

  useEffect(() => {
    if (ready) setBooted(true)
  }, [ready])

  useEffect(() => {
    if (!session) return
    const kick = () => {
      if (sessionTimedOut(authSession?.createdAt, authSession?.expiresAt)) {
        void signOut().then(() => navigate('/login'))
      }
    }
    kick()
    const timer = window.setInterval(kick, 60_000)
    return () => window.clearInterval(timer)
  }, [session, authSession?.createdAt, authSession?.expiresAt])

  useEffect(() => {
    if (isPending) return
    if (!ready && !booted) return
    if (!session && (onOnboarding || onDashboard || onCheckout || onTeamNew || onConnect || onDesktopLink)) {
      if (onCheckout || onTeamNew || onConnect || onDesktopLink) {
        sessionStorage.setItem('soumtok-next', `${window.location.pathname}${window.location.search}`)
      }
      if (onDesktopLink) {
        const id = path.slice('/desktop-link/'.length).split('/')[0]
        if (id) sessionStorage.setItem('soumtok-desktop', decodeURIComponent(id))
      }
      navigate('/login')
      return
    }
    if (needsOnboarding && !onOnboarding && !onDesktopLink) {
      const desktop =
        sessionStorage.getItem('soumtok-desktop') ||
        new URLSearchParams(window.location.search).get('desktop') ||
        ''
      if (desktop) {
        sessionStorage.setItem('soumtok-desktop', desktop)
        navigate(`/desktop-link/${desktop}`)
        return
      }
      navigate('/onboarding')
      return
    }
    if (need2fa && (onDashboard || onCheckout || onTeamNew)) {
      navigate('/login')
      return
    }
    if (session && !need2fa && (onAuth || onOnboarding)) {
      const desktop = sessionStorage.getItem('soumtok-desktop') || new URLSearchParams(window.location.search).get('desktop') || ''
      if (desktop) {
        sessionStorage.removeItem('soumtok-desktop')
        navigate(`/desktop-link/${desktop}`)
        return
      }
      if (!isOnboardingComplete(profile)) return
      const next = sessionStorage.getItem('soumtok-next')
      if (next && (next.startsWith('/checkout') || next.startsWith('/dashboard') || next.startsWith('/team') || next.startsWith('/connect'))) {
        sessionStorage.removeItem('soumtok-next')
        navigate(next)
      } else {
        navigate('/dashboard')
      }
    }
  }, [
    ready,
    booted,
    isPending,
    needsOnboarding,
    session,
    authSession?.createdAt,
    authSession?.expiresAt,
    profile,
    need2fa,
    onDashboard,
    onCheckout,
    onTeamNew,
    onAuth,
    onOnboarding,
    onConnect,
    onDesktopLink,
  ])

  if (!ready && !booted) return <PageSkeleton />

  if (onDesktopLink) {
    const id = path.slice('/desktop-link/'.length).split('/')[0] || ''
    if (!session) return <PageSkeleton />
    return <DesktopLinkPage id={decodeURIComponent(id)} />
  }

  if (need2fa) {
    return <LoginPage mode="in" force2fa />
  }

  if (!session && (path === '/login' || path === '/signup')) {
    return <LoginPage mode={path === '/signup' ? 'up' : 'in'} />
  }

  if (needsOnboarding) {
    return <OnboardingPage onComplete={onOnboardingComplete} />
  }

  if ((path === '/docs' || path.startsWith('/docs/')) && path !== '/docs/sitemap.xml') {
    return <DocsPage path={path} />
  }

  if (path === '/help') {
    return <HelpPage />
  }

  if (path === '/contact') {
    return <ContactPage />
  }

  if (path === '/download') {
    return <DownloadPage />
  }

  if (path.startsWith('/connect/')) {
    if (!session) return <PageSkeleton />
    const code = path.slice('/connect/'.length).split('/')[0] || ''
    return <ConnectDevicePage code={decodeURIComponent(code)} />
  }

  const publicHandle = publicProfileHandle(path)
  if (publicHandle) {
    return <PublicProfilePage username={publicHandle} />
  }

  if (session && path.startsWith('/team')) {
    return <NewTeamPage />
  }

  if (session && path.startsWith('/checkout')) {
    return <CheckoutPage />
  }

  if (session && path.startsWith('/dashboard')) {
    return (
      <>
        <DashboardPage profile={profile ?? null} path={path} onDownload={openDownload} />
      </>
    )
  }

  if (path !== '/' && path !== '/agents') {
    return <NotFoundPage />
  }

  return (
    <>
      <HomeLanding
        hasAvatar={profile?.hasAvatar}
        onDownload={openDownload}
        onSignIn={() => navigate('/login')}
        onContact={() => openTab('/contact')}
        onAccount={() => navigate('/dashboard')}
      />
    </>
  )
}
