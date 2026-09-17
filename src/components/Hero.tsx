import { useSession } from '../lib/auth-client'
import { navigate } from '../lib/nav'
import { DesktopApp } from './mockups/DesktopApp'
import { PillButton } from './ui'

export function Hero({
  onAccount,
  onContact,
}: {
  onAccount: () => void
  onContact: () => void
}) {
  const { data: session } = useSession()

  return (
    <section id="top" className="relative overflow-x-clip pt-12 pb-6 sm:pt-16 md:pt-24">
      <div className="page-wrap relative z-[1]">
        <h1 className="max-w-[720px] text-[32px] font-semibold leading-[1.08] tracking-[-0.04em] sm:text-[40px] md:text-[56px]">
          A coding agent for the desks that actually ship.
        </h1>
        <p className="mt-5 max-w-[540px] text-[16px] leading-7 text-white/55 sm:mt-6 sm:text-[17px]">
          Africa’s most affordable powerful coding platform. Start from $5 a month on Everyday models.
          Open Studio, attach GitHub, pick a model, and hand the work over.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <PillButton onClick={() => (session?.user ? onAccount() : navigate('/signup'))}>
            Open Studio
          </PillButton>
          <PillButton variant="outline" onClick={onContact}>
            Talk to us →
          </PillButton>
        </div>
      </div>

      <div className="relative mt-10 overflow-x-clip sm:mt-16">
        <img
          src="/images/landscape-hero.png"
          alt=""
          className="pointer-events-none absolute left-1/2 top-[-40px] h-[360px] w-full max-w-none -translate-x-1/2 object-cover sm:h-[560px] md:h-[640px]"
        />
        <div className="pointer-events-none absolute inset-x-0 top-[-40px] h-[480px] bg-[linear-gradient(to_bottom,#0b0b0a_0%,transparent_22%,transparent_72%,#0b0b0a_100%),linear-gradient(to_right,#0b0b0a_0%,transparent_18%,transparent_82%,#0b0b0a_100%)] sm:h-[720px]" />
        <div className="wide-wrap relative z-[1] px-0 pb-12 pt-6 sm:pb-28 sm:pt-8">
          <DesktopApp />
        </div>
      </div>
    </section>
  )
}
