import { useState } from 'react'
import { Logo, PillButton } from './ui'

export function DownloadModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[440px] rounded-2xl border border-white/10 bg-[#141413] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <Logo />
        <p className="mt-5 text-[13px] text-white/40">Soumtok for Windows</p>
        <h3 className="mt-2 text-[24px] font-semibold tracking-[-0.03em]">
          The desktop app is next.
        </h3>
        <p className="mt-3 text-[14px] leading-6 text-white/55">
          This landing page is the first ship. Leave your email and we will send the Windows
          installer the week it is ready.
        </p>
        {done ? (
          <p className="mt-6 text-[14px] text-emerald-400">You are on the list.</p>
        ) : (
          <form
            className="mt-6 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (email.trim()) setDone(true)
            }}
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="rounded-xl border border-white/10 bg-[#0b0b0a] px-3 py-3 text-[14px] text-white outline-none placeholder:text-white/30"
            />
            <PillButton type="submit">Join the Windows waitlist</PillButton>
          </form>
        )}
        <button type="button" onClick={onClose} className="mt-4 text-[13px] text-white/40">
          Close
        </button>
      </div>
    </div>
  )
}
