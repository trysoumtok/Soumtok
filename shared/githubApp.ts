/** Public GitHub repo for Soumtok source, issues, and org links. */
export const SITE_GITHUB_REPO = 'https://github.com/trysoumtok/Soumtok'

/** GitHub App slug for repo access (OAuth sign-in uses GITHUB_CLIENT_ID separately). */
export const GITHUB_APP_SLUG = 'soumtok'

export function githubAppInstallUrl(slug = GITHUB_APP_SLUG) {
  return `https://github.com/apps/${slug}/installations/new`
}

export const GITHUB_APP_INSTALL_URL = githubAppInstallUrl()
