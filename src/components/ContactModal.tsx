import { Logo, PillButton } from './ui'

export function ContactModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[440px] rounded-2xl border border-white/10 bg-[#141413] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <Logo />
        <h3 className="mt-5 text-[24px] font-semibold tracking-[-0.03em]">Talk to sales</h3>
        <p className="mt-2 text-[14px] leading-6 text-white/50">
          For banks, telcos, universities, and product teams that want Soumtok on their own
          infrastructure.
        </p>
        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            onClose()
          }}
        >
          <input
            required
            placeholder="Work email"
            className="rounded-xl border border-white/10 bg-[#0b0b0a] px-3 py-3 text-[14px] outline-none placeholder:text-white/30"
          />
          <input
            required
            placeholder="Company"
            className="rounded-xl border border-white/10 bg-[#0b0b0a] px-3 py-3 text-[14px] outline-none placeholder:text-white/30"
          />
          <textarea
            required
            placeholder="What are you building?"
            rows={3}
            className="resize-none rounded-xl border border-white/10 bg-[#0b0b0a] px-3 py-3 text-[14px] outline-none placeholder:text-white/30"
          />
          <PillButton type="submit">Request a demo</PillButton>
        </form>
      </div>
    </div>
  )
}
