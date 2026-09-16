import { useEffect } from 'react'
import { usePath } from '../lib/nav'
import { AgentsFeature } from './AgentsFeature'
import { Automations } from './Automations'
import { Faq } from './Faq'
import { Footer, TryNow } from './Footer'
import { Frontier } from './Frontier'
import { Hero } from './Hero'
import { Nav } from './Nav'
import { Pricing } from './Pricing'
import { TrustedBy } from './TrustedBy'

export function HomeLanding({
  hasAvatar,
  onDownload,
  onSignIn,
  onContact,
  onAccount,
}: {
  hasAvatar?: boolean
  onDownload: () => void
  onSignIn: () => void
  onContact: () => void
  onAccount: () => void
}) {
  const path = usePath()

  useEffect(() => {
    if (path === '/agents') window.scrollTo(0, 0)
  }, [path])

  return (
    <div className="theme-app keep-dark min-h-svh bg-[#0b0b0a] text-white">
      <Nav
        hasAvatar={hasAvatar}
        onDownload={onDownload}
        onSignIn={onSignIn}
        onContact={onContact}
        onAccount={onAccount}
      />
      <main>
        <Hero onAccount={onAccount} onContact={onContact} />
        <TrustedBy />
        <AgentsFeature />
        <Automations />
        <Frontier />
        <Pricing />
        <Faq />
        <TryNow onStart={onAccount} />
      </main>
      <Footer />
    </div>
  )
}
