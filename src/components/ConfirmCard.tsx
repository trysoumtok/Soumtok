import { useEffect, useState, type FormEvent } from 'react'

export function ConfirmCard({
  title,
  body,
  confirmLabel = 'Delete',
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  confirmLabel?: string
  busy?: boolean
  error?: string
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}) {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 px-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[440px] rounded-2xl border border-white/10 bg-[#141413] px-6 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
      >
        <h2 id="confirm-title" className="text-[18px] font-medium">
          {title}
        </h2>
        <p className="mt-2 text-[13px] leading-6 text-white/50">{body}</p>
        {error && <p className="mt-3 text-[13px] text-[#ff8a70]">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-white/15 px-3.5 py-1.5 text-[13px] text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className="keep-white rounded-md bg-red-500/90 px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

const ERASE_STEPS = [
  'Closing sessions',
  'Removing API and SSH keys',
  'Erasing files and documents',
  'Clearing billing and usage',
  'Removing your profile',
  'Flagging this email so it cannot be used again',
  'Closing the account',
]

export function DeleteAccountCard({
  email,
  busy,
  error,
  phase,
  onCancel,
  onConfirm,
  onFinished,
}: {
  email: string
  busy?: boolean
  error?: string
  phase: 'form' | 'progress' | 'done'
  onCancel: () => void
  onConfirm: (email: string, confirm: string) => void | Promise<void>
  onFinished: () => void
}) {
  const [typedEmail, setTypedEmail] = useState('')
  const [typedDelete, setTypedDelete] = useState('')
  const [step, setStep] = useState(0)
  const expected = email.trim().toLowerCase()
  const emailOk = typedEmail.trim().toLowerCase() === expected
  const deleteOk = typedDelete.trim().toLowerCase() === 'delete'
  const ready = emailOk && deleteOk

  useEffect(() => {
    if (phase !== 'progress') return
    setStep(0)
    const timer = window.setInterval(() => {
      setStep((current) => Math.min(current + 1, ERASE_STEPS.length - 1))
    }, 420)
    return () => window.clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'done') return
    const timer = window.setTimeout(onFinished, 2600)
    return () => window.clearTimeout(timer)
  }, [phase, onFinished])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready || busy) return
    void onConfirm(typedEmail.trim(), 'delete')
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 px-4" onClick={phase === 'form' ? onCancel : undefined}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[480px] rounded-2xl border border-white/10 bg-[#141413] px-6 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
      >
        {phase === 'form' && (
          <form onSubmit={submit}>
            <h2 id="delete-account-title" className="text-[18px] font-medium">
              Delete your account
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-white/50">
              This permanently erases your Soumtok account, profile, keys, files, and billing data.
              After this, <span className="text-white/80">{email}</span> is flagged and you cannot use
              it again to create another Soumtok account.
            </p>
            <label className="mt-5 block text-[12px] text-white/45">Type your email to confirm</label>
            <input
              value={typedEmail}
              onChange={(event) => setTypedEmail(event.target.value)}
              autoComplete="email"
              placeholder={email}
              className="mt-1.5 w-full rounded-lg border border-white/12 bg-[#0c0c0b] px-3 py-2.5 text-[13px] outline-none"
            />
            <label className="mt-3 block text-[12px] text-white/45">
              Type <span className="text-white/80">delete</span> to confirm
            </label>
            <input
              value={typedDelete}
              onChange={(event) => setTypedDelete(event.target.value)}
              placeholder="delete"
              className="mt-1.5 w-full rounded-lg border border-white/12 bg-[#0c0c0b] px-3 py-2.5 text-[13px] outline-none"
            />
            {error && <p className="mt-3 text-[13px] text-[#ff8a70]">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-md border border-white/15 px-3.5 py-1.5 text-[13px] text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!ready || busy}
                className="keep-white rounded-md bg-red-500/90 px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
              >
                {busy ? 'Starting…' : 'Delete account'}
              </button>
            </div>
          </form>
        )}

        {phase === 'progress' && (
          <>
            <h2 id="delete-account-title" className="text-[18px] font-medium">
              Erasing your data
            </h2>
            <p className="mt-2 text-[13px] text-white/50">This cannot be undone. Keep this window open.</p>
            <ul className="mt-5 space-y-2">
              {ERASE_STEPS.map((item, index) => {
                const done = index < step
                const current = index === step
                return (
                  <li key={item} className="flex items-center gap-2 text-[13px]">
                    <span
                      className={`grid h-4 w-4 place-items-center rounded-full text-[10px] ${
                        done ? 'bg-[#f54e00] text-black' : current ? 'border border-[#f54e00] text-[#f54e00]' : 'border border-white/20 text-transparent'
                      }`}
                    >
                      {done ? '✓' : current ? '•' : ''}
                    </span>
                    <span className={done || current ? 'text-white' : 'text-white/35'}>{item}</span>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {phase === 'done' && (
          <>
            <h2 id="delete-account-title" className="text-[18px] font-medium">
              Account deleted
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-white/55">
              Your data is gone. <span className="text-white">{email}</span> is flagged and cannot be
              used again to create a Soumtok account. You are being signed out.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export function useConfirmDelete() {
  const [target, setTarget] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  return {
    target,
    busy,
    error,
    ask: (id: string) => {
      setError('')
      setTarget(id)
    },
    cancel: () => {
      if (!busy) setTarget(null)
    },
    run: async (action: () => Promise<void>) => {
      setBusy(true)
      setError('')
      try {
        await action()
        setTarget(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not delete')
      } finally {
        setBusy(false)
      }
    },
  }
}

