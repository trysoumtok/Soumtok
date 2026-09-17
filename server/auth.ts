import { passkey } from '@better-auth/passkey'
import { APIError, betterAuth } from 'better-auth'
import { magicLink } from 'better-auth/plugins/magic-link'
import { organization } from 'better-auth/plugins/organization'
import { twoFactor } from 'better-auth/plugins/two-factor'
import { inviteEmail, magicLinkEmail, sendMail, verifyLinkEmail, welcomeEmail } from './mail.ts'
import { SESSION_MAX_SECONDS } from '../shared/session.ts'
import {
  authBaseURLConfig,
  authCrossSubDomainCookies,
  canonicalAuthHost,
  env,
  hasDatabase,
  hasGithub,
  hasGoogle,
  isProductionHost,
  trustedOrigins,
} from './env.ts'
import { ensureProfile, syncLinkedAccounts } from './account-sync.ts'
import { BLOCKED_EMAIL_MESSAGE, isBlockedEmail } from './blocked-emails.ts'
import { pool } from './db.ts'

function authHost() {
  try {
    return new URL(env.betterAuthUrl).hostname || 'localhost'
  } catch {
    return 'localhost'
  }
}

function passkeyRpId() {
  const host = authHost()
  if (host === '127.0.0.1' || host === 'localhost') return 'localhost'
  if (isProductionHost(host) || host === canonicalAuthHost()) return canonicalAuthHost()
  return host
}

function createAuth() {
  if (!pool) {
    throw new Error('DATABASE_URL is missing. Add your Neon connection string to .env')
  }
  if (env.betterAuthSecret.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must be at least 32 characters')
  }

  const crossSubDomainCookies = authCrossSubDomainCookies()

  const loginErrorUrl = `${env.betterAuthUrl.replace(/\/$/, '')}/login`

  return betterAuth({
    appName: 'Soumtok',
    baseURL: authBaseURLConfig(),
    secret: env.betterAuthSecret,
    database: pool,
    trustedOrigins,
    onAPIError: {
      errorURL: loginErrorUrl,
    },
    advanced: {
      trustedProxyHeaders: true,
      cookiePrefix: 'soumtok',
      ...(crossSubDomainCookies ? { crossSubDomainCookies } : {}),
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['google', 'github'],
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (await isBlockedEmail(user.email)) {
              throw new APIError('FORBIDDEN', { message: BLOCKED_EMAIL_MESSAGE })
            }
          },
          after: async (user) => {
            if (!pool) return
            await ensureProfile(user.id)
            try {
              const mail = welcomeEmail({
                name: user.name,
                email: user.email,
                appUrl: env.betterAuthUrl,
              })
              await sendMail(user.email, mail.subject, mail.text, mail.html)
            } catch (error) {
              console.error('[mail] welcome email failed', error)
            }
          },
        },
      },
      account: {
        create: {
          after: async (account) => {
            await syncLinkedAccounts(account.userId)
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            await syncLinkedAccounts(session.userId)
          },
        },
      },
    },
    session: {
      expiresIn: SESSION_MAX_SECONDS,
      updateAge: SESSION_MAX_SECONDS,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 60,
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      requireEmailVerification: false,
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        if (await isBlockedEmail(user.email)) {
          throw new APIError('FORBIDDEN', { message: BLOCKED_EMAIL_MESSAGE })
        }
        const mail = verifyLinkEmail(url)
        await sendMail(user.email, mail.subject, mail.text, mail.html)
      },
    },
    plugins: [
      twoFactor({
        issuer: 'Soumtok',
        allowPasswordless: true,
      }),
      passkey({
        rpID: passkeyRpId(),
        rpName: 'Soumtok',
      }),
      magicLink({
        expiresIn: 60 * 5,
        sendMagicLink: async ({ email, url }) => {
          if (await isBlockedEmail(email)) {
            throw new APIError('FORBIDDEN', { message: BLOCKED_EMAIL_MESSAGE })
          }
          const mail = magicLinkEmail(url)
          await sendMail(email, mail.subject, mail.text, mail.html)
        },
      }),
      organization({
        allowUserToCreateOrganization: true,
        organizationLimit: 10,
        membershipLimit: 100,
        creatorRole: 'owner',
        sendInvitationEmail: async (data) => {
          const url = `${env.betterAuthUrl}/login?invite=${data.id}`
          const mail = inviteEmail(data.organization.name, url)
          await sendMail(data.email, mail.subject, mail.text, mail.html)
        },
      }),
    ],
    socialProviders: {
      ...(hasGoogle()
        ? {
            google: {
              clientId: env.googleClientId,
              clientSecret: env.googleClientSecret,
              prompt: 'select_account' as const,
            },
          }
        : {}),
      ...(hasGithub()
        ? {
            github: {
              clientId: env.githubClientId,
              clientSecret: env.githubClientSecret,
              scope: ['read:user', 'user:email', 'repo', 'read:org'],
            },
          }
        : {}),
    },
  })
}

export const auth = hasDatabase() ? createAuth() : null
