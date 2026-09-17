/** Public GitHub repo for Soumtok source, issues, and org links. */
export const SITE_GITHUB_REPO = 'https://github.com/trysoumtok/Soumtok'

/** Default GitHub App slug when GITHUB_APP_SLUG is unset (must exist on GitHub). */
export const GITHUB_APP_SLUG = 'soumtok'

export function githubAppInstallUrl(slug = GITHUB_APP_SLUG) {
  const key = String(slug || '').trim()
  if (!key) return ''
  return `https://github.com/apps/${key}/installations/new`
}

/** Server-resolved grant URL (never hard-link the GitHub App until it exists). */
export const GITHUB_GRANT_REPOS_PATH = '/api/github/grant'

export const GITHUB_APP_INSTALL_URL = GITHUB_GRANT_REPOS_PATH

/** Review or extend OAuth repo access for the Soumtok sign-in app. */
export function githubOAuthConnectionsUrl(clientId: string) {
  const id = String(clientId || '').trim()
  if (!id) return 'https://github.com/settings/applications'
  return `https://github.com/settings/connections/applications/${id}`
}

export type GithubGrantReposKind = 'app' | 'oauth'

/** Pick GitHub App install when published; otherwise OAuth connections (avoids 404). */
export function resolveGithubGrantReposUrl(opts: {
  appSlug?: string
  clientId: string
  appInstallAvailable?: boolean
}) {
  const slug = String(opts.appSlug || GITHUB_APP_SLUG).trim()
  const clientId = String(opts.clientId || '').trim()
  if (slug && opts.appInstallAvailable !== false) {
    const appUrl = githubAppInstallUrl(slug)
    if (appUrl) {
      return { url: appUrl, kind: 'app' as const }
    }
  }
  return { url: githubOAuthConnectionsUrl(clientId), kind: 'oauth' as const }
}
