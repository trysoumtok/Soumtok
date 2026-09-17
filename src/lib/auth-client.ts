import { passkeyClient } from '@better-auth/passkey/client'
import { magicLinkClient, organizationClient, twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { navigate } from './nav'

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : undefined,
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

/** Absolute URL for OAuth redirects — relative callbackURL breaks when auth state is lost. */
export function authRedirectUrl(path: string) {
  const next = path.startsWith('/') ? path : `/${path}`
  if (typeof window === 'undefined') return next
  return `${window.location.origin.replace(/\/$/, '')}${next}`
}

export function authErrorMessage(code: string) {
  if (code === 'access_denied') return 'Sign-in was cancelled. Try again when you are ready.'
  if (code === 'BANNED_USER') return 'This account cannot sign in. Contact support if you think this is a mistake.'
  if (
    code === 'state_mismatch' ||
    code === 'state_security_mismatch' ||
    code === 'state_invalid' ||
    code === 'state_not_found' ||
    code === 'invalid_callback'
  ) {
    return 'Sign-in expired or opened in a different tab. Use soumtok.com (not www) and try again.'
  }
  return 'Sign-in failed. Please try again.'
}

type SocialProvider = 'github' | 'google'

export async function signInSocial(opts: {
  provider: SocialProvider
  callbackURL: string
  errorCallbackURL?: string
}) {
  const callbackURL = authRedirectUrl(opts.callbackURL)
  const errorCallbackURL = authRedirectUrl(opts.errorCallbackURL || '/login')
  return signIn.social({
    provider: opts.provider,
    callbackURL,
    errorCallbackURL,
  })
}

export function isProtectedAppPath(path: string) {
  return (
    path.startsWith('/dashboard') ||
    path.startsWith('/checkout') ||
    path.startsWith('/team') ||
    path === '/onboarding' ||
    path.startsWith('/desktop-link/')
  )
}
