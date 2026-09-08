import { passkeyClient } from '@better-auth/passkey/client'
import { magicLinkClient, organizationClient, twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { navigate } from './nav'

export const authClient = createAuthClient({
  plugins: [
    magicLinkClient(),
    organizationClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        window.dispatchEvent(new Event('soumtok-need-2fa'))
        if (window.location.pathname !== '/login') navigate('/login')
      },
    }),
    passkeyClient(),
  ],
})

export const { signIn, signUp, signOut, useSession } = authClient
