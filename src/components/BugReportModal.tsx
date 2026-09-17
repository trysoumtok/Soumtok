import { useEffect, useState, type FormEvent } from 'react'
import { sendBugReport } from '../lib/api'

const CATEGORIES = ['Bug', 'Crash', 'Billing', 'Feature request', 'Other'] as const

export function BugReportModal({
  open,
  onClose,
  email: emailHint = '',
  surface = 'Web',
  context,
}: {
  open: boolean
  onClose: () => void
  email?: string
  surface?: string
  context?: Record<string, string>
}) {
  const [email, setEmail] = useState(emailHint)
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Bug')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setEmail(emailHint)
    setCategory('Bug')
    setMessage('')
    setError('')
    setSent(false)
    setBusy(false)
  }, [open, emailHint])

  if (!open) return null

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    const trimmed = message.trim()
    if (!email.trim() && !emailHint) {
      setError('Enter your email so support can reply.')
      return
    }
    if (trimmed.length < 8) {
      setError('Describe what happened (at least a few words).')
      return
    }
    setBusy(true)
    try {
      await sendBugReport({
        email: email.trim() || emailHint,
        category,
        message: trimmed,
        surface,
        context: {
          ...context,
          url: typeof window !== 'undefined' ? window.location.href : '',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        },
      })
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[480px] rounded-2xl border border-white/10 bg-[#141413] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-report-title"
      >
        <h2 id="bug-report-title" className="text-[20px] font-medium tracking-[-0.03em]">
          Report a bug
        </h2>
        <p className="mt-2 text-[13px] leading-6 text-white/50">
          We send this to support@soumtok.com and reply to your email.
        </p>
        {sent ? (
          <div className="mt-6">
            <p className="text-[14px] leading-6 text-white/70">
              Thanks — your report is on its way. We will follow up at {email.trim() || emailHint}.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-full bg-white px-5 py-2.5 text-[14px] font-medium text-black hover:bg-[#f2f2f0]"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3">
            {!emailHint && (
              <>
                <label className="text-[13px] text-white/80">
                  Email <span className="text-[#f54e00]">*</span>
                </label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                  placeholder="you@company.com"
                  className="rounded-lg border border-white/12 bg-[#0c0c0b] px-3 py-2.5 text-[14px] outline-none placeholder:text-white/28 focus:border-white/22"
                />
              </>
            )}
            <label className="text-[13px] text-white/80">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
              className="rounded-lg border border-white/12 bg-[#0c0c0b] px-3 py-2.5 text-[14px] outline-none"
            >
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <label className="text-[13px] text-white/80">
              What happened? <span className="text-[#f54e00]">*</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={5}
              placeholder="Steps to reproduce, what you expected, and what went wrong."
              className="resize-none rounded-lg border border-white/12 bg-[#0c0c0b] px-3 py-2.5 text-[14px] outline-none placeholder:text-white/28 focus:border-white/22"
            />
            {error && <p className="text-[13px] text-[#ff8a70]">{error}</p>}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/12 px-4 py-2 text-[13px] text-white/70 hover:bg-white/[0.04]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-full bg-white px-5 py-2 text-[13px] font-medium text-black hover:bg-[#f2f2f0] disabled:opacity-50"
              >
                {busy ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
