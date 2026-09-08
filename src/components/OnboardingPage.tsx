import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  checkUsername,
  confirmEmailCode,
  fetchProfile,
  isOnboardingComplete,
  saveProfile,
  sendEmailCode,
  type Profile,
} from '../lib/api'
import { usernameError } from '../../shared/username'
import { statesForCountry, WORLD_COUNTRIES } from '../lib/places'
import { useSession } from '../lib/auth-client'
import { AuthOverlay, Spinner } from './Loaders'
import { BirthCalendar, SearchSelect } from './Pickers'
import { SecuritySetup } from './SecuritySetup'
import { Logo } from './ui'
import { WorldMap } from './WorldMap'

const FOUND = [
  'Google search',
  'X / Twitter',
  'YouTube',
  'A friend',
  'University',
  'GitHub',
  'Conference',
  'Other',
] as const

const field =
  'w-full rounded-md border border-white/[0.08] bg-[#0c0c0b] px-3 py-2.5 text-[14px] text-white outline-none placeholder:text-white/25 focus:border-white/22'

const RESEND_SECONDS = 60

function formatWait(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function ChipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3.2" y="3.2" width="9.6" height="9.6" rx="1.6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 1.6v1.8M10 1.6v1.8M6 12.6v1.8M10 12.6v1.8M1.6 6h1.8M1.6 10h1.8M12.6 6h1.8M12.6 10h1.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function Panel({
  label,
  children,
  footer,
}: {
  label: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="relative overflow-visible rounded-[10px] border border-white/[0.09] bg-[#111110]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5 text-[12px] text-white/45">
        <span className="text-white/35">
          <ChipIcon />
        </span>
        {label}
      </div>
      <div className="px-4 py-4">{children}</div>
      {footer && <div className="flex justify-end border-t border-white/[0.06] px-3 py-2">{footer}</div>}
    </div>
  )
}

export function OnboardingPage({ onComplete }: { onComplete: (profile?: Profile) => void }) {
  const { data: session } = useSession()
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [username, setUsername] = useState('')
  const [howFound, setHowFound] = useState('')
  const [howFoundOther, setHowFoundOther] = useState('')
  const [country, setCountry] = useState('')
  const [state, setState] = useState('')
  const [poBox, setPoBox] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [emailSent, setEmailSent] = useState('')
  const [emailWait, setEmailWait] = useState(0)
  const [emailVerified, setEmailVerified] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [sending, setSending] = useState<'idle' | 'email'>('idle')
  const [verifying, setVerifying] = useState(false)
  const [usernameStatus, setUsernameStatus] = useState('')
  const loadedStep = useRef(false)

  useEffect(() => {
    const emailWaitUntil = Number(sessionStorage.getItem('soumtok-email-wait') || 0)
    const emailLeft = Math.max(0, Math.ceil((emailWaitUntil - Date.now()) / 1000))
    if (emailLeft) {
      setEmailWait(emailLeft)
      setEmailSent(sessionStorage.getItem('soumtok-email-sent') || 'Code sent')
    }
  }, [])

  useEffect(() => {
    fetchProfile()
      .then((profile) => {
        if (profile.username) setUsername(profile.username)
        if (profile.howFound) setHowFound(profile.howFound)
        if (profile.howFoundOther) setHowFoundOther(profile.howFoundOther)
        if (profile.country) setCountry(profile.country)
        if (profile.state) setState(profile.state)
        if (profile.poBox) setPoBox(profile.poBox)
        if (profile.birthDate) setBirthDate(profile.birthDate)
        setEmailVerified(profile.emailVerified)
        if (isOnboardingComplete(profile)) {
          onComplete(profile)
          return
        }
        if (loadedStep.current) return
        loadedStep.current = true
        if (profile.country) setStep(4)
        else if (profile.howFound) setStep(3)
        else if (profile.username) setStep(2)
      })
      .catch(() => undefined)
  }, [onComplete])

  useEffect(() => {
    const value = username.trim()
    const local = usernameError(value)
    if (!value) {
      setUsernameStatus('')
      return
    }
    if (local) {
      setUsernameStatus(local)
      return
    }

    setUsernameStatus('Checking…')
    const timer = window.setTimeout(() => {
      checkUsername(value).then((result) => {
        setUsernameStatus(result.available ? 'Available' : result.error || 'That username is already taken')
      })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [username])

  useEffect(() => {
    if (emailWait <= 0) return
    const timer = window.setTimeout(() => setEmailWait((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [emailWait])

  const copy = {
    1: {
      title: 'Choose your username',
      pill: `@${username.trim() || 'you'}`,
      sub: 'This is your public handle — how people find you on Soumtok.',
    },
    2: {
      title: 'How did you find us?',
      pill: 'required',
      sub: 'Helps us understand how builders discover Soumtok.',
    },
    3: {
      title: 'Tell us about you',
      pill: 'Africa +',
      sub: 'Country, state, PO box, and birth date — all required.',
    },
    4: {
      title: 'Verify your email',
      pill: '6-digit',
      sub: 'Confirm your inbox. 2-factor and a Google passkey are optional — skip them if you want.',
    },
  } as const

  async function onNext(event?: FormEvent) {
    event?.preventDefault()
    setError('')

    if (step === 1) {
      const issue = usernameError(username)
      if (issue) {
        setError(issue)
        return
      }
      if (usernameStatus !== 'Available') {
        setError(usernameStatus || 'Wait until we confirm this username is free')
        return
      }
    }
    if (step === 2 && !howFound) {
      setError('Tell us how you found Soumtok')
      return
    }
    if (step === 3) {
      if (!country) {
        setError('Select your country')
        return
      }
      const regions = statesForCountry(country)
      if (!state || !regions.includes(state)) {
        setError('Select a state from that country')
        return
      }
      if (poBox.trim().length < 3) {
        setError('PO box must be at least 3 characters')
        return
      }
      if (!birthDate) {
        setError('Pick your birth date')
        return
      }
    }

    setPending(true)
    try {
      if (step === 1) {
        await saveProfile({ step: 1, username })
        setStep(2)
      } else if (step === 2) {
        await saveProfile({ step: 2, howFound, howFoundOther })
        setStep(3)
      } else if (step === 3) {
        await saveProfile({ step: 3, country, state, poBox, birthDate })
        setStep(4)
      } else {
        if (!emailVerified) {
          setError('Verify your email before finishing')
          return
        }
        const saved = await fetchProfile()
        if (!isOnboardingComplete(saved)) {
          setError('Verify your email to finish')
          return
        }
        onComplete(saved)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setPending(false)
    }
  }

  async function onVerifyEmail(event?: { preventDefault(): void; stopPropagation(): void }) {
    event?.preventDefault()
    event?.stopPropagation()
    setError('')
    if (emailCode.length !== 6) {
      setError('Enter the 6-digit email code')
      return
    }
    setVerifying(true)
    try {
      const saved = await confirmEmailCode(emailCode)
      if (!saved.emailVerified) {
        setError('That code is not valid')
        return
      }
      setEmailVerified(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify email')
    } finally {
      setVerifying(false)
    }
  }

  async function onSendEmail() {
    setError('')
    setSending('email')
    try {
      const sent = await sendEmailCode()
      if (sent.already) {
        setEmailSent('Already verified')
        setEmailVerified(true)
        return
      }
      const message = sent.via === 'log' ? 'Code sent — check the server log until SMTP is set.' : 'Code sent'
      setEmailSent(message)
      setEmailWait(RESEND_SECONDS)
      sessionStorage.setItem('soumtok-email-sent', message)
      sessionStorage.setItem('soumtok-email-wait', String(Date.now() + RESEND_SECONDS * 1000))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send code')
    } finally {
      setSending('idle')
    }
  }

  return (
    <div className="theme-app relative flex min-h-svh flex-col">
      <header className="absolute left-6 top-6 z-20 md:left-8 md:top-7">
        <Logo href="/onboarding" size="md" />
      </header>
      <div className="grid min-h-0 flex-1 lg:grid-cols-2">
        <section className="flex flex-col justify-center px-5 pb-10 pt-24 sm:px-6 md:px-16 lg:px-20">
          <h1 className="max-w-[540px] text-[28px] font-medium leading-[1.25] tracking-[-0.03em] md:text-[34px]">
            {copy[step].title}{' '}
            <span className="align-middle inline-flex rounded-full bg-[#f54e00] px-2.5 py-[3px] text-[13px] font-semibold tracking-[-0.02em] text-[#1a0900]">
              {copy[step].pill}
            </span>
          </h1>
          <p className="mt-3 max-w-[440px] text-[14px] leading-6 text-white/42">{copy[step].sub}</p>

          {step <= 3 ? (
          <form className="mt-8 max-w-[480px]" onSubmit={onNext} id="onboarding-form">
            {step === 1 && (
              <Panel label="Username">
                <label htmlFor="username" className="mb-2 block text-[12px] text-white/40">
                  Handle
                </label>
                <div className="flex items-center rounded-md border border-white/[0.08] bg-[#0c0c0b] focus-within:border-white/22">
                  <span className="pl-3 font-mono text-[14px] text-white/30">@</span>
                  <input
                    id="username"
                    required
                    autoFocus
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
                    placeholder="ken"
                    className="w-full bg-transparent px-1.5 py-2.5 text-[14px] text-white outline-none placeholder:text-white/25"
                  />
                </div>
                <p className="mt-3 font-mono text-[11.5px] leading-5 text-white/32">
                  3–20 characters. Start with a letter. Letters, numbers, and _ only.
                </p>
                {usernameStatus && (
                  <p
                    className={`mt-2 text-[12px] ${
                      usernameStatus === 'Available'
                        ? 'text-[#f54e00]'
                        : usernameStatus === 'Checking…'
                          ? 'text-white/35'
                          : 'text-[#ff8a70]'
                    }`}
                  >
                    {usernameStatus === 'Available' ? 'Available — this handle is yours' : usernameStatus}
                  </p>
                )}
                {session?.user.email && (
                  <p className="mt-4 text-[12px] text-white/28">Signed in as {session.user.email}</p>
                )}
              </Panel>
            )}

            {step === 2 && (
              <Panel label="Discovery">
                <label htmlFor="how-found" className="mb-2 block text-[12px] text-white/40">
                  How did you find us?
                </label>
                <SearchSelect
                  id="how-found"
                  value={howFound}
                  onChange={setHowFound}
                  options={FOUND}
                  placeholder="Select one"
                  searchable={false}
                />
                {howFound === 'Other' && (
                  <input
                    required
                    value={howFoundOther}
                    onChange={(e) => setHowFoundOther(e.target.value)}
                    placeholder="Tell us how"
                    className={`${field} mt-3`}
                  />
                )}
              </Panel>
            )}

            {step === 3 && (
              <Panel label="Profile">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="country" className="mb-2 block text-[12px] text-white/40">
                      Country
                    </label>
                    <SearchSelect
                      id="country"
                      value={country}
                      onChange={(next) => {
                        setCountry(next)
                        setState('')
                      }}
                      options={WORLD_COUNTRIES}
                      placeholder="Search every country"
                    />
                  </div>
                  <div>
                    <label htmlFor="state" className="mb-2 block text-[12px] text-white/40">
                      State / region
                    </label>
                    <SearchSelect
                      id="state"
                      value={state}
                      onChange={setState}
                      options={statesForCountry(country)}
                      placeholder={country ? 'Search states in this country' : 'Pick a country first'}
                      disabled={!country}
                    />
                  </div>
                  <div>
                    <label htmlFor="pobox" className="mb-2 block text-[12px] text-white/40">
                      PO box
                    </label>
                    <input
                      id="pobox"
                      required
                      value={poBox}
                      onChange={(e) => setPoBox(e.target.value)}
                      placeholder="e.g. P.O. Box 1024"
                      className={field}
                    />
                  </div>
                  <div>
                    <label htmlFor="dob" className="mb-2 block text-[12px] text-white/40">
                      Birth date
                    </label>
                    <BirthCalendar id="dob" value={birthDate} onChange={setBirthDate} />
                  </div>
                </div>
              </Panel>
            )}

            {error && <p className="mt-4 text-[13px] text-[#ff8a70]">{error}</p>}
          </form>
          ) : (
          <div className="mt-8 max-w-[480px]">
            {step === 4 && (
              <Panel
                label="Email code"
                footer={
                  !emailVerified ? (
                    <button
                      type="button"
                      disabled={sending !== 'idle' || emailWait > 0}
                      onClick={onSendEmail}
                      className="rounded-md border border-white/12 px-2.5 py-1 text-[12px] text-white/70 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {sending === 'email'
                        ? 'Sending…'
                        : emailWait > 0
                          ? `Resend in ${formatWait(emailWait)}`
                          : emailSent
                            ? 'Resend code'
                            : 'Send code'}
                    </button>
                  ) : undefined
                }
              >
                <p className="text-[13px] text-white/50">
                  Code goes to <span className="text-white/75">{session?.user.email || 'your email'}</span>.
                </p>
                {emailVerified ? (
                  <>
                    <p className="mt-3 text-[13px] text-[#f54e00]">Email already verified.</p>
                    <SecuritySetup />
                  </>
                ) : (
                  <>
                    {emailSent && (
                      <p className="mt-3 text-[12px] text-[#f54e00]">
                        {emailSent}
                        {emailWait > 0 ? ` · you can resend in ${formatWait(emailWait)}` : ''}
                      </p>
                    )}
                    <label htmlFor="email-code" className="mb-2 mt-5 block text-[12px] text-white/40">
                      6-digit code
                    </label>
                    <input
                      id="email-code"
                      inputMode="numeric"
                      maxLength={6}
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          event.stopPropagation()
                          void onVerifyEmail(event)
                        }
                      }}
                      placeholder="000000"
                      className={`${field} font-mono tracking-[0.2em]`}
                    />
                    <button
                      type="button"
                      disabled={verifying || emailCode.length !== 6}
                      onClick={onVerifyEmail}
                      className="mt-3 w-full rounded-md bg-white py-2.5 text-[13px] font-medium text-black hover:bg-[#f2f2f0] disabled:opacity-45"
                    >
                      {verifying ? 'Verifying…' : 'Verify'}
                    </button>
                  </>
                )}
              </Panel>
            )}

            {error && <p className="mt-4 text-[13px] text-[#ff8a70]">{error}</p>}
          </div>
          )}
        </section>

        <aside className="keep-dark relative hidden overflow-hidden bg-[#0b0b0a] lg:block">
          <WorldMap
            card={
              <>
                <div className="flex items-center gap-2 text-[13px] font-medium">
                  <span className="text-[#f54e00]">
                    <ChipIcon />
                  </span>
                  Africa builders
                </div>
                <ul className="mt-3 space-y-1.5 text-[12.5px] leading-5 text-white/55">
                  <li>Agents that ship real code</li>
                  <li>Cloud agents in your repos</li>
                  <li>Terminal, Slack, and GitHub</li>
                  <li>A handle people can find</li>
                </ul>
              </>
            }
          />
        </aside>
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3.5 sm:px-6 md:px-16">
        <div className="flex items-center gap-1.5" aria-label={`Step ${step} of 4`}>
          {[1, 2, 3, 4].map((item) => (
            <span key={item} className={`h-[2px] w-5 ${item <= step ? 'bg-white' : 'bg-white/18'}`} />
          ))}
        </div>
        <div className="flex items-center gap-5">
          {step > 1 && (
            <button
              type="button"
              className="text-[13px] text-white/40 hover:text-white"
              onClick={() => {
                setError('')
                setStep((current) => (current > 1 ? ((current - 1) as 1 | 2 | 3 | 4) : current))
              }}
            >
              Back
            </button>
          )}
          <button
            type={step <= 3 ? 'submit' : 'button'}
            form={step <= 3 ? 'onboarding-form' : undefined}
            onClick={step === 4 ? () => void onNext() : undefined}
            disabled={
              pending ||
              (step === 1 && usernameStatus !== 'Available') ||
              (step === 4 && !emailVerified)
            }
            className="rounded-md bg-white px-3.5 py-1.5 text-[13px] font-medium text-black transition hover:bg-[#f2f2f0] disabled:opacity-50"
          >
            {pending ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="h-3.5 w-3.5" />
                Saving
              </span>
            ) : step === 4 ? (
              'Finish'
            ) : (
              'Next'
            )}
          </button>
        </div>
      </footer>
      {pending && <AuthOverlay title="Saving your profile" detail="Writing your details to Neon…" />}
    </div>
  )
}
