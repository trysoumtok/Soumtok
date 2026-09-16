import { useEffect, useState, type FormEvent } from 'react'
import { checkSignupEmail, confirmTwoFactor, fetchHealth } from '../lib/api'
import { signIn, signUp } from '../lib/auth-client'
import { navigate } from '../lib/nav'
import { AuthOverlay, Spinner } from './Loaders'
import { BrandMark, InfoIcon, Logo } from './ui'

function GithubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.68 7.68 0 0 1 8 4.14c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.348 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  )
}

function postLoginPath() {
  try {
    const params = new URLSearchParams(window.location.search)
    const desktop = params.get('desktop') || sessionStorage.getItem('soumtok-desktop') || ''
    if (desktop) {
      sessionStorage.setItem('soumtok-desktop', desktop)
      return `/desktop-link/${desktop}`
    }
    const next = sessionStorage.getItem('soumtok-next') || ''
    if (
      next.startsWith('/connect/') ||
      next.startsWith('/desktop-link/') ||
      next.startsWith('/checkout') ||
      next.startsWith('/team') ||
      next.startsWith('/dashboard')
    ) {
      return next
    }
  } catch {
    /* private mode */
  }
  return '/dashboard'
}

export function LoginPage({ mode, force2fa }: { mode: 'in' | 'up'; force2fa?: boolean }) {
  const [step, setStep] = useState<'email' | 'password' | '2fa'>(force2fa ? '2fa' : 'email')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [factorCode, setFactorCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<'idle' | 'google' | 'github' | 'email' | 'magic' | 'passkey' | '2fa'>('idle')
  const [googleReady, setGoogleReady] = useState(true)
  const [githubReady, setGithubReady] = useState(true)
  const [dbReady, setDbReady] = useState(true)
  const [mailReady, setMailReady] = useState(true)
  const [magicSent, setMagicSent] = useState(false)
  const [magicInfo, setMagicInfo] = useState(false)

  useEffect(() => {
    try {
      const desktop = new URLSearchParams(window.location.search).get('desktop')
      if (desktop) sessionStorage.setItem('soumtok-desktop', desktop)
      const stored = sessionStorage.getItem('soumtok-auth-error')
      if (stored) {
        setError(stored)
        sessionStorage.removeItem('soumtok-auth-error')
      }
    } catch {
      /* private mode */
    }
    fetchHealth().then((health) => {
      setDbReady(health.database)
      setGoogleReady(health.google)
      setGithubReady(health.github)
      setMailReady(health.mail)
    })
    function need2fa() {
      setStep('2fa')
      setError('')
    }
    window.addEventListener('soumtok-need-2fa', need2fa)
    return () => window.removeEventListener('soumtok-need-2fa', need2fa)
  }, [])

  async function onGithub() {
    if (!githubReady) {
      window.location.href = '/api/setup/github/start'
      return
    }
    setError('')
    setBusy('github')
    try {
      const result = await Promise.race([
        signIn.social({
          provider: 'github',
          callbackURL: postLoginPath(),
        }),
        new Promise<{ error: { message: string } }>((resolve) =>
          setTimeout(() => resolve({ error: { message: 'GitHub took too long. Try email or a magic link.' } }), 10000),
        ),
      ])
      if (result.error) {
        setError(result.error.message || 'GitHub sign-in failed')
        setBusy('idle')
      }
    } catch {
      setError('GitHub sign-in failed. Try email or a magic link.')
      setBusy('idle')
    }
  }

  async function onGoogle() {
    if (!googleReady) {
      setError('Google is not configured yet. Use email or a magic link.')
      return
    }
    setError('')
    setBusy('google')
    try {
      await signIn.social({
        provider: 'google',
        callbackURL: postLoginPath(),
      })
    } catch {
      setError('Google sign-in failed. Try email or a magic link.')
      setBusy('idle')
    }
  }

  async function assertEmailAllowed() {
    const status = await checkSignupEmail(email)
    if (status.blocked) {
      setError(status.message || 'This email cannot be used to create a Soumtok account again.')
      return false
    }
    return true
  }

  async function onEmailContinue(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!email.trim()) {
      setError('Enter your email address')
      return
    }
    if (!(await assertEmailAllowed())) return
    setStep('password')
  }

  async function onPassword(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy('email')

    if (mode === 'up' && !(await assertEmailAllowed())) {
      setBusy('idle')
      return
    }

    const result =
      mode === 'up'
        ? await signUp.email({ name: name.trim() || email.split('@')[0], email, password })
        : await signIn.email({ email, password })

    setBusy('idle')

    if (result.error) {
      setError(result.error.message || 'Could not sign in')
      return
    }

    const redirected = Boolean((result.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect)
    if (redirected) {
      setStep('2fa')
      return
    }

    navigate(postLoginPath())
  }

  async function onPasskey() {
    setError('')
    setBusy('passkey')
    const result = await signIn.passkey()
    setBusy('idle')
    if (result.error) {
      setError(result.error.message || 'Passkey sign-in failed')
      return
    }
    navigate(postLoginPath())
  }

  async function onTwoFactor(event: FormEvent) {
    event.preventDefault()
    setError('')
    const code = factorCode.trim()
    if (!code) {
      setError('Enter your authenticator or backup code')
      return
    }
    setBusy('2fa')
    try {
      await confirmTwoFactor(code)
      window.location.assign(postLoginPath())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code is not valid')
    }
    setBusy('idle')
  }

  async function onMagicLink() {
    setError('')
    if (!email.trim()) {
      setError('Enter your email address first')
      return
    }
    if (!(await assertEmailAllowed())) {
      setBusy('idle')
      return
    }
    setBusy('magic')
    const result = await signIn.magicLink({
      email,
      callbackURL: postLoginPath(),
    })
    setBusy('idle')
    if (result.error) {
      setError(
        result.error.message === 'Invalid origin'
          ? 'This page address is blocked for sign-in. Refresh and try the magic link again.'
          : result.error.message || 'Could not send magic link',
      )
      return
    }
    setMagicSent(true)
  }

  return (
    <div className="theme-app relative min-h-svh bg-[#0b0b0a] text-white">
      <header className="absolute left-4 top-4 z-10 md:left-8 md:top-7">
        <Logo href="/" size="md" />
      </header>

      <main className="mx-auto flex min-h-svh w-full max-w-[640px] flex-col items-center justify-center px-5 py-24 sm:px-6">
        <h1 className="text-center text-[clamp(28px,8vw,46px)] font-semibold tracking-[-0.045em]">
          {mode === 'in' ? 'Welcome to Soumtok' : 'Create your account'}
        </h1>
        <p className="mt-3 text-center text-[16px] tracking-[0.01em] text-white/45">
          The new way to build software
        </p>

        <div className="mt-10 w-full max-w-[400px]">
        {step === '2fa' ? (
          <form className="w-full" onSubmit={onTwoFactor}>
            <p className="text-[14px] text-white/55">Enter the 6-digit authenticator code, or a backup code.</p>
            <input
              autoFocus
              value={factorCode}
              onChange={(e) => setFactorCode(e.target.value)}
              placeholder="000000"
              className="mt-4 w-full rounded-lg border border-[#c4a35a] bg-[#141413] px-3.5 py-3 font-mono text-[15px] tracking-[0.12em] text-white outline-none placeholder:text-white/28 focus:border-[#f54e00]"
            />
            {error && <p className="mt-3 text-[13px] text-[#ff8a70]">{error}</p>}
            <button
              type="submit"
              disabled={busy !== 'idle'}
              className="mt-4 w-full rounded-lg bg-white py-3 text-[15px] font-medium text-black transition hover:bg-[#f2f2f0] disabled:opacity-60"
            >
              {busy === '2fa' ? 'Checking…' : 'Verify'}
            </button>
            {!force2fa && (
              <button
                type="button"
                className="mt-4 w-full text-[13px] text-white/40 hover:text-white"
                onClick={() => {
                  setStep('email')
                  setFactorCode('')
                  setError('')
                }}
              >
                Back
              </button>
            )}
          </form>
        ) : (
          <>
        {!dbReady && (
          <p className="mb-6 rounded-lg border border-[#f54e00]/40 bg-[#f54e00]/10 px-3 py-2 text-[12.5px] leading-5 text-[#ffb89a]">
            Add your Neon <code>DATABASE_URL</code> to <code>.env</code>, then restart the app.
          </p>
        )}

        <button
          type="button"
          onClick={onGoogle}
          disabled={busy !== 'idle'}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-white/8 bg-[#262626] py-3 text-[15px] font-medium text-white transition hover:bg-[#2e2e2e] disabled:opacity-50"
        >
          {busy === 'google' ? <Spinner className="h-4 w-4" /> : <GoogleIcon />}
          {busy === 'google' ? 'Connecting Google' : 'Continue with Google'}
        </button>
        {!googleReady && (
          <p className="mt-2 w-full text-[12px] text-white/35">
            Google keys are not in .env yet. Email sign-in still works.
          </p>
        )}

        <button
          type="button"
          onClick={onGithub}
          disabled={busy !== 'idle'}
          className="mt-3 flex w-full items-center justify-center gap-3 rounded-lg border border-white/8 bg-[#262626] py-3 text-[15px] font-medium text-white transition hover:bg-[#2e2e2e] disabled:opacity-50"
        >
          {busy === 'github' ? <Spinner className="h-4 w-4" /> : <GithubIcon />}
          {busy === 'github' ? 'Connecting GitHub' : 'Continue with GitHub'}
        </button>
        {!githubReady && (
          <p className="mt-2 w-full text-[12px] text-white/35">
            GitHub is not connected yet. This button opens the Soumtok GitHub setup.
          </p>
        )}

        <button
          type="button"
          onClick={onPasskey}
          disabled={busy !== 'idle'}
          className="mt-3 flex w-full items-center justify-center gap-3 rounded-lg border border-white/8 bg-[#262626] py-3 text-[15px] font-medium text-white transition hover:bg-[#2e2e2e] disabled:opacity-50"
        >
          {busy === 'passkey' ? <Spinner className="h-4 w-4" /> : <GoogleIcon />}
          {busy === 'passkey' ? 'Waiting for passkey' : 'Continue with Google passkey'}
        </button>

        <div className="my-6 flex w-full items-center gap-3 text-[12px] text-white/30">
          <span className="h-px flex-1 bg-white/10" />
          or
          <span className="h-px flex-1 bg-white/10" />
        </div>

        {step === 'email' ? (
          <form className="w-full" onSubmit={onEmailContinue}>
            <label htmlFor="login-email" className="mb-2 block text-[13px] text-white/50">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email address"
              className="w-full rounded-lg border border-[#c4a35a] bg-[#141413] px-3.5 py-3 text-[15px] text-white outline-none placeholder:text-white/28 focus:border-[#f54e00]"
            />
            {error && <p className="mt-3 text-[13px] text-[#ff8a70]">{error}</p>}
            <button
              type="submit"
              disabled={busy !== 'idle'}
              className="mt-4 w-full rounded-lg bg-[#262626] py-3 text-[15px] font-medium text-white transition hover:bg-[#303030] disabled:opacity-60"
            >
              Continue with email
            </button>
          </form>
        ) : (
          <form className="w-full" onSubmit={onPassword}>
            <p className="mb-4 text-[13px] text-white/45">
              {email}{' '}
              <button
                type="button"
                className="text-white/70 underline-offset-2 hover:underline"
                onClick={() => {
                  setStep('email')
                  setPassword('')
                  setError('')
                }}
              >
                Change
              </button>
            </p>
            {mode === 'up' && (
              <>
                <label htmlFor="login-name" className="mb-2 block text-[13px] text-white/50">
                  Name
                </label>
                <input
                  id="login-name"
                  name="full-name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="mb-4 w-full rounded-lg border border-white/10 bg-[#141413] px-3.5 py-3 text-[15px] text-white outline-none placeholder:text-white/28 focus:border-[#f54e00]"
                />
              </>
            )}
            <label htmlFor="login-password" className="mb-2 block text-[13px] text-white/50">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              required
              minLength={8}
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'up' ? 'Create a password (8+ characters)' : 'Your password'}
              className="w-full rounded-lg border border-[#c4a35a] bg-[#141413] px-3.5 py-3 text-[15px] text-white outline-none placeholder:text-white/28 focus:border-[#f54e00]"
            />
            {error && <p className="mt-3 text-[13px] text-[#ff8a70]">{error}</p>}
            <button
              type="submit"
              disabled={busy !== 'idle'}
              className="mt-4 w-full rounded-lg bg-[#262626] py-3 text-[15px] font-medium text-white transition hover:bg-[#303030] disabled:opacity-60"
            >
              {busy === 'email' ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Spinner className="h-4 w-4" />
                  {mode === 'in' ? 'Signing in' : 'Creating account'}
                </span>
              ) : mode === 'in' ? (
                'Continue with email'
              ) : (
                'Create account'
              )}
            </button>
          </form>
        )}

        <div className="relative mt-4">
          <div className="flex items-stretch rounded-xl border border-white/10 bg-[#141413] transition hover:border-[#f54e00]/50">
            <button
              type="button"
              disabled={busy !== 'idle'}
              onClick={onMagicLink}
              className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3.5 text-left disabled:opacity-60"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#1c1c1b]">
                {busy === 'magic' ? <Spinner className="h-4 w-4" /> : <BrandMark className="h-7 w-auto" />}
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-medium text-white">Magic link</span>
                <span className="mt-0.5 block text-[12px] leading-5 text-white/40">
                  {magicSent
                    ? `Link sent to ${email}. It expires in 5 minutes.`
                    : 'Sign up or sign in with one tap. No password.'}
                </span>
              </span>
            </button>
            <button
              type="button"
              aria-expanded={magicInfo}
              aria-label="What is a magic link?"
              onClick={() => setMagicInfo((open) => !open)}
              className="grid w-11 shrink-0 place-items-center text-white/35 transition hover:text-white/70"
            >
              <InfoIcon />
            </button>
          </div>
          {magicInfo && (
            <div className="absolute left-0 right-0 top-full z-10 mt-2 rounded-xl border border-white/10 bg-[#1a1a18] px-3.5 py-3 text-[12.5px] leading-5 text-white/65 shadow-lg">
              <p className="font-medium text-white/90">What is a magic link?</p>
              <p className="mt-1.5">
                Type your email, then tap this card. We send you an email with a button. Open that email and tap the
                button.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>New here? That creates your account.</li>
                <li>Already have an account? That signs you in.</li>
              </ul>
              <p className="mt-2">No password. The link expires in 5 minutes.</p>
            </div>
          )}
        </div>
        {!mailReady && (
          <p className="mt-2 text-[12px] text-white/35">
            Add SMTP_USER and SMTP_PASS in .env so magic links can send.
          </p>
        )}

        <p className="mt-6 text-center text-[13px] text-white/40">
          {mode === 'in' ? "Don't have an account? " : 'Have an account? '}
          <button
            type="button"
            className="text-white/75 hover:text-white"
            onClick={() => {
              navigate(mode === 'in' ? '/signup' : '/login')
              setStep('email')
              setPassword('')
              setError('')
            }}
          >
            {mode === 'in' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
          </>
        )}
        </div>
      </main>

      {busy !== 'idle' && (
        <AuthOverlay
          title={
            busy === 'google'
              ? 'Opening Google'
              : busy === 'github'
                ? 'Opening GitHub'
                : busy === 'passkey'
                  ? 'Waiting for passkey'
                  : busy === '2fa'
                    ? 'Checking your code'
                    : busy === 'magic'
                      ? 'Sending magic link'
                      : mode === 'up'
                        ? 'Creating your account'
                        : 'Signing you in'
          }
        />
      )}

      <footer className="absolute inset-x-0 bottom-6 text-center text-[12px] text-white/30">
        <a href="#legal" className="hover:text-white/55">
          Terms of Service
        </a>
        {' and '}
        <a href="#legal" className="hover:text-white/55">
          Privacy Policy
        </a>
      </footer>
    </div>
  )
}
